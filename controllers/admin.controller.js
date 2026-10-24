const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User.model");
const Call = require("../models/Call.model");
const Chat = require("../models/Chat.model");
const CoinTransaction = require("../models/CoinTransaction.model");
const PaymentOrder = require("../models/PaymentOrder.model");
const Subscription = require("../models/Subscription.model");
const AdminLog = require("../models/AdminLog.model");
const {creditCoins, debitCoins} = require("../services/coin.service");
const {getLiveCalls} = require("../sockets/call.socket");

// Read-only reporting plus the few write actions the web admin needs.
// Every route here sits behind requireEnvironmentAdmin (see routes/admin.routes.js).

const TZ = "Asia/Kolkata";
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_CARD = "nickname phone photoUrl avatarSeed gender";
const REAL_USERS = {isTestUser: {$ne: true}};
// Older ledger rows have no `direction`; infer it from the type.
const DEBIT_TYPES = ["audio_call_charge", "video_call_charge", "chat_charge", "subscription_purchase"];
const directionOf = transaction => transaction.direction || (DEBIT_TYPES.includes(transaction.type) ? "debit" : "credit");
const DIRECTION_EXPR = {$ifNull: ["$direction", {$cond: [{$in: ["$type", DEBIT_TYPES]}, "debit", "credit"]}]};

const fail = (res, error, message) =>
  res.status(error.status || 500).json({success: false, message: error.status ? error.message : message});

const pageParams = (req, maxLimit = 100) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), maxLimit);
  return {page, limit, skip: (page - 1) * limit};
};

const paged = async (query, countQuery, {page, limit, skip}) => {
  const [items, total] = await Promise.all([query.skip(skip).limit(limit).lean(), countQuery]);
  return {items, pagination: {page, limit, total, pages: Math.max(Math.ceil(total / limit), 1)}};
};

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isId = value => mongoose.isValidObjectId(value);
const pick = (value, allowed) => (allowed.includes(value) ? value : null);
const dayKey = date => new Intl.DateTimeFormat("en-CA", {timeZone: TZ}).format(date); // YYYY-MM-DD

// Users whose nickname or phone matches the search text.
const matchingUserIds = async search => {
  const pattern = new RegExp(escapeRegex(search.trim()), "i");
  const users = await User.find({$or: [{nickname: pattern}, {phone: pattern}]}).select("_id").limit(200).lean();
  return users.map(user => user._id);
};

// ---------- Overview & reports ----------

const rangeFor = req => {
  const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 30, 1), 365);
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY_MS);
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  return {days, from, to, prevFrom};
};

const byDay = (field, value = 1) => ({
  _id: {$dateToString: {format: "%Y-%m-%d", date: `$${field}`, timezone: TZ}},
  value: {$sum: value},
});

const sumOf = rows => rows.reduce((total, row) => total + row.value, 0);
const countBy = (Model, match, field) =>
  Model.aggregate([{$match: match}, {$group: {_id: `$${field}`, count: {$sum: 1}}}, {$sort: {count: -1}}]);

const getOverview = async (req, res) => {
  try {
    const {days, from, to, prevFrom} = rangeFor(req);
    const inRange = {$gte: from, $lt: to};
    const inPrev = {$gte: prevFrom, $lt: from};
    const paid = {status: "paid"};

    const [
      totalUsers, signups, prevSignups, activeUsers, statusCounts,
      calls, prevCalls, callStats, callOutcomes, callTypes,
      chatsStarted, messages, prevMessages,
      revenue, prevRevenue, revenueByKind,
      coinFlows, activeSubscriptions, newSubscriptions, prevNewSubscriptions, topPlans,
      gender, languages, topCallers, recentUsers,
    ] = await Promise.all([
      User.countDocuments(REAL_USERS),
      User.aggregate([{$match: {...REAL_USERS, createdAt: inRange}}, {$group: byDay("createdAt")}]),
      User.countDocuments({...REAL_USERS, createdAt: inPrev}),
      User.countDocuments({...REAL_USERS, $or: [{isOnline: true}, {lastSeen: inRange}]}),
      countBy(User, REAL_USERS, "status"),

      Call.aggregate([{$match: {startedAt: inRange}}, {$group: byDay("startedAt")}]),
      Call.countDocuments({startedAt: inPrev}),
      Call.aggregate([
        {$match: {startedAt: inRange, status: "completed"}},
        {$group: {_id: null, completed: {$sum: 1}, seconds: {$sum: "$durationSeconds"}}},
      ]),
      countBy(Call, {startedAt: inRange}, "status"),
      countBy(Call, {startedAt: inRange}, "callType"),

      Chat.countDocuments({createdAt: inRange}),
      Chat.aggregate([{$unwind: "$messages"}, {$match: {"messages.createdAt": inRange}}, {$group: byDay("messages.createdAt")}]),
      Chat.aggregate([{$unwind: "$messages"}, {$match: {"messages.createdAt": inPrev}}, {$count: "value"}]),

      PaymentOrder.aggregate([{$match: {...paid, createdAt: inRange}}, {$group: byDay("createdAt", "$amount")}]),
      PaymentOrder.aggregate([{$match: {...paid, createdAt: inPrev}}, {$group: {_id: null, value: {$sum: "$amount"}}}]),
      PaymentOrder.aggregate([{$match: {...paid, createdAt: inRange}}, {$group: {_id: "$kind", amount: {$sum: "$amount"}, count: {$sum: 1}}}]),

      CoinTransaction.aggregate([
        {$match: {createdAt: inRange}},
        {$group: {_id: {type: "$type", direction: DIRECTION_EXPR}, amount: {$sum: "$amount"}, count: {$sum: 1}}},
        {$sort: {amount: -1}},
      ]),
      Subscription.countDocuments({status: "active", endsAt: {$gt: to}}),
      Subscription.countDocuments({createdAt: inRange}),
      Subscription.countDocuments({createdAt: inPrev}),
      Subscription.aggregate([
        {$match: {createdAt: inRange}},
        {$group: {_id: "$plan", count: {$sum: 1}}},
        {$sort: {count: -1}},
        {$limit: 5},
        {$lookup: {from: "subscriptionplans", localField: "_id", foreignField: "_id", as: "plan"}},
        {$project: {count: 1, name: {$first: "$plan.name"}, code: {$first: "$plan.code"}, price: {$first: "$plan.price.amount"}}},
      ]),

      countBy(User, REAL_USERS, "gender"),
      User.aggregate([{$match: REAL_USERS}, {$unwind: "$languages"}, {$group: {_id: "$languages", count: {$sum: 1}}}, {$sort: {count: -1}}, {$limit: 8}]),
      Call.aggregate([
        {$match: {startedAt: inRange, status: "completed"}},
        {$project: {users: ["$caller", "$callee"], durationSeconds: 1}},
        {$unwind: "$users"},
        {$group: {_id: "$users", calls: {$sum: 1}, seconds: {$sum: "$durationSeconds"}}},
        {$sort: {seconds: -1}},
        {$limit: 5},
        {$lookup: {from: "users", localField: "_id", foreignField: "_id", as: "user"}},
        {$project: {calls: 1, seconds: 1, nickname: {$first: "$user.nickname"}, photoUrl: {$first: "$user.photoUrl"}}},
      ]),
      User.find(REAL_USERS).sort({createdAt: -1}).limit(6).select(`${USER_CARD} languages isOnline createdAt`).lean(),
    ]);

    // One row per day, including days with no activity.
    const series = [];
    const lookup = rows => new Map(rows.map(row => [row._id, row.value]));
    const [signupMap, callMap, messageMap, revenueMap] = [signups, calls, messages, revenue].map(lookup);
    for (let time = from.getTime(); ; time += DAY_MS) {
      const at = Math.min(time, to.getTime());
      const date = dayKey(new Date(at));
      if (series.at(-1)?.date !== date) series.push({
        date,
        signups: signupMap.get(date) || 0,
        calls: callMap.get(date) || 0,
        messages: messageMap.get(date) || 0,
        revenue: revenueMap.get(date) || 0,
      });
      if (at >= to.getTime()) break;
    }

    const live = getLiveCalls();
    const onlineNow = req.app.get("onlineUserCount")?.() ?? 0;
    const completed = callStats[0]?.completed || 0;
    const totalCalls = sumOf(calls);
    const label = row => ({key: row._id ?? "unknown", count: row.count});

    return res.json({
      success: true,
      data: {
        range: {days, from, to},
        totals: {
          totalUsers,
          newUsers: sumOf(signups),
          prevNewUsers: prevSignups,
          activeUsers,
          onlineNow,
          liveCalls: live.filter(call => call.status === "active").length,
          ringingCalls: live.filter(call => call.status === "ringing").length,
          calls: totalCalls,
          prevCalls,
          completedCalls: completed,
          answerRate: totalCalls ? completed / totalCalls : 0,
          talkMinutes: Math.round((callStats[0]?.seconds || 0) / 60),
          avgCallSeconds: completed ? Math.round(callStats[0].seconds / completed) : 0,
          chatsStarted,
          messages: sumOf(messages),
          prevMessages: prevMessages[0]?.value || 0,
          revenue: sumOf(revenue),
          prevRevenue: prevRevenue[0]?.value || 0,
          activeSubscriptions,
          newSubscriptions,
          prevNewSubscriptions,
          coinsCredited: coinFlows.filter(row => row._id.direction === "credit").reduce((total, row) => total + row.amount, 0),
          coinsSpent: coinFlows.filter(row => row._id.direction === "debit").reduce((total, row) => total + row.amount, 0),
        },
        series,
        breakdowns: {
          gender: gender.map(label),
          languages: languages.map(label),
          userStatus: statusCounts.map(label),
          callOutcomes: callOutcomes.map(label),
          callTypes: callTypes.map(label),
          coinFlows: coinFlows.map(row => ({type: row._id.type, direction: row._id.direction, amount: row.amount, count: row.count})),
          revenueByKind: revenueByKind.map(row => ({key: row._id, amount: row.amount, count: row.count})),
          topPlans,
          topCallers,
        },
        recentUsers,
      },
    });
  } catch (error) {
    console.error("admin overview error:", error);
    return fail(res, error, "Unable to load the overview.");
  }
};

// ---------- Activity feed ----------

const ref = user => (user ? {_id: user._id, nickname: user.nickname, photoUrl: user.photoUrl} : null);
const nameOf = user => user?.nickname || "Someone";
const formatSeconds = seconds => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
const CALL_TITLES = {
  completed: "Call completed",
  missed: "Missed call",
  rejected: "Call declined",
  cancelled: "Call cancelled",
  failed: "Call failed",
};
const TRANSACTION_LABELS = {
  welcome_bonus: "Welcome bonus",
  daily_claim: "Daily coins claimed",
  referral_friend_bonus: "Referral bonus",
  referrer_signup_bonus: "Referral signup bonus",
  referrer_first_purchase_bonus: "Referral purchase bonus",
  coin_purchase: "Coins purchased",
  audio_call_charge: "Audio call charge",
  video_call_charge: "Video call charge",
  chat_charge: "Chat charge",
  subscription_purchase: "Subscription purchase",
  admin_adjustment: "Admin coin adjustment",
  refund: "Refund",
};

// Each source returns its newest items created before `before`, already shaped for the feed.
const ACTIVITY_SOURCES = {
  signup: async (before, limit) => (await User.find({...REAL_USERS, createdAt: {$lt: before}})
    .sort({createdAt: -1}).limit(limit).select(`${USER_CARD} languages createdAt`).lean())
    .map(user => ({
      id: `signup-${user._id}`, kind: "signup", at: user.createdAt, user: ref(user),
      title: "New user joined", detail: [user.gender, user.languages?.join(", ")].filter(Boolean).join(" · "),
    })),
  call: async (before, limit) => (await Call.find({startedAt: {$lt: before}})
    .sort({startedAt: -1}).limit(limit).populate("caller callee", USER_CARD).lean())
    .map(call => ({
      id: `call-${call._id}`, kind: "call", at: call.startedAt, user: ref(call.caller), target: ref(call.callee),
      title: `${CALL_TITLES[call.status] || "Call"} (${call.callType})`,
      detail: `${nameOf(call.caller)} → ${nameOf(call.callee)}${call.durationSeconds ? ` · ${formatSeconds(call.durationSeconds)}` : ""}`,
    })),
  chat: async (before, limit) => (await Chat.find({createdAt: {$lt: before}})
    .sort({createdAt: -1}).limit(limit).select("participants createdAt").populate("participants", USER_CARD).lean())
    .map(chat => ({
      id: `chat-${chat._id}`, kind: "chat", at: chat.createdAt, user: ref(chat.participants[0]), target: ref(chat.participants[1]),
      title: "New chat started", detail: chat.participants.map(nameOf).join(" & "), chatId: chat._id,
    })),
  coins: async (before, limit) => (await CoinTransaction.find({createdAt: {$lt: before}})
    .sort({createdAt: -1}).limit(limit).populate("user", USER_CARD).lean())
    .map(transaction => ({
      id: `coins-${transaction._id}`, kind: "coins", at: transaction.createdAt, user: ref(transaction.user),
      title: TRANSACTION_LABELS[transaction.type] || transaction.type,
      detail: `${directionOf(transaction) === "credit" ? "+" : "-"}${transaction.amount} coins · balance ${transaction.balanceAfter}`,
    })),
  payment: async (before, limit) => (await PaymentOrder.find({createdAt: {$lt: before}})
    .sort({createdAt: -1}).limit(limit).populate("user", USER_CARD).lean())
    .map(order => ({
      id: `payment-${order._id}`, kind: "payment", at: order.createdAt, user: ref(order.user),
      title: `Payment ${order.status}`,
      detail: `₹${order.amount} · ${order.kind === "subscription" ? "subscription" : "coin pack"} · ${order.gateway}`,
    })),
  subscription: async (before, limit) => (await Subscription.find({createdAt: {$lt: before}})
    .sort({createdAt: -1}).limit(limit).populate("user", USER_CARD).populate("plan", "name").lean())
    .map(subscription => ({
      id: `subscription-${subscription._id}`, kind: "subscription", at: subscription.createdAt, user: ref(subscription.user),
      title: `Subscribed to ${subscription.plan?.name || "a plan"}`,
      detail: `${subscription.status} · until ${dayKey(subscription.endsAt)}`,
    })),
  admin: async (before, limit) => (await AdminLog.find({createdAt: {$lt: before}}).sort({createdAt: -1}).limit(limit).lean())
    .map(log => ({
      id: `admin-${log._id}`, kind: "admin", at: log.createdAt, user: null,
      title: `Admin ${log.action} · ${log.targetType.replace(/_/g, " ")}`, detail: `${log.summary || ""} (${log.admin})`,
    })),
};

const getActivity = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 100);
    const before = req.query.before && !Number.isNaN(Date.parse(req.query.before)) ? new Date(req.query.before) : new Date();
    const kind = pick(req.query.type, Object.keys(ACTIVITY_SOURCES));
    const sources = kind ? [ACTIVITY_SOURCES[kind]] : Object.values(ACTIVITY_SOURCES);
    // Take the newest `limit` from each source, then merge; the cursor is the oldest item shown.
    const items = (await Promise.all(sources.map(source => source(before, limit))))
      .flat()
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);
    return res.json({
      success: true,
      data: {items, nextBefore: items.length === limit ? items.at(-1).at : null},
    });
  } catch (error) {
    console.error("admin activity error:", error);
    return fail(res, error, "Unable to load activity.");
  }
};

// ---------- Users ----------

const ADMIN_USER_FIELDS = "nickname phone gender languages avatarSeed photoUrl coinBalance status isOnline lastSeen isTestUser referralCode profileCompleted createdAt";

const listUsers = async (req, res) => {
  try {
    const filter = {};
    const status = pick(req.query.status, ["active", "suspended", "banned"]);
    const gender = pick(req.query.gender, ["male", "female", "other"]);
    if (status) filter.status = status;
    if (gender) filter.gender = gender;
    if (req.query.online === "true") filter.isOnline = true;
    if (req.query.test !== "include") Object.assign(filter, REAL_USERS);
    if (req.query.search?.trim()) {
      const pattern = new RegExp(escapeRegex(req.query.search.trim()), "i");
      filter.$or = [{nickname: pattern}, {phone: pattern}, {referralCode: pattern}];
    }
    const result = await paged(
      User.find(filter).select(ADMIN_USER_FIELDS).sort({createdAt: -1}),
      User.countDocuments(filter),
      pageParams(req),
    );
    return res.json({success: true, data: result});
  } catch (error) {
    return fail(res, error, "Unable to load users.");
  }
};

const getUserDetail = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({success: false, message: "User not found."});
    const user = await User.findById(req.params.id).select(ADMIN_USER_FIELDS).lean();
    if (!user) return res.status(404).json({success: false, message: "User not found."});
    const id = user._id;
    const [callStats, coinStats, paidTotal, subscription, referrals, calls, transactions, payments] = await Promise.all([
      Call.aggregate([
        {$match: {$or: [{caller: id}, {callee: id}]}},
        {$group: {
          _id: null,
          made: {$sum: {$cond: [{$eq: ["$caller", id]}, 1, 0]}},
          received: {$sum: {$cond: [{$eq: ["$callee", id]}, 1, 0]}},
          completed: {$sum: {$cond: [{$eq: ["$status", "completed"]}, 1, 0]}},
          seconds: {$sum: "$durationSeconds"},
        }},
      ]),
      CoinTransaction.aggregate([{$match: {user: id}}, {$group: {_id: DIRECTION_EXPR, amount: {$sum: "$amount"}}}]),
      PaymentOrder.aggregate([{$match: {user: id, status: "paid"}}, {$group: {_id: null, amount: {$sum: "$amount"}, count: {$sum: 1}}}]),
      Subscription.findOne({user: id, status: "active", endsAt: {$gt: new Date()}}).sort({endsAt: -1}).populate("plan", "name code").lean(),
      User.countDocuments({referredBy: id}),
      Call.find({$or: [{caller: id}, {callee: id}]}).sort({startedAt: -1}).limit(10).populate("caller callee", USER_CARD).lean(),
      CoinTransaction.find({user: id}).sort({createdAt: -1}).limit(10).lean(),
      PaymentOrder.find({user: id}).sort({createdAt: -1}).limit(10).lean(),
    ]);
    const coins = Object.fromEntries(coinStats.map(row => [row._id, row.amount]));
    return res.json({
      success: true,
      data: {
        user,
        stats: {
          callsMade: callStats[0]?.made || 0,
          callsReceived: callStats[0]?.received || 0,
          completedCalls: callStats[0]?.completed || 0,
          talkMinutes: Math.round((callStats[0]?.seconds || 0) / 60),
          coinsEarned: coins.credit || 0,
          coinsSpent: coins.debit || 0,
          paidTotal: paidTotal[0]?.amount || 0,
          paidOrders: paidTotal[0]?.count || 0,
          referrals,
        },
        subscription,
        calls,
        transactions: transactions.map(item => ({...item, direction: directionOf(item)})),
        payments,
      },
    });
  } catch (error) {
    return fail(res, error, "Unable to load this user.");
  }
};

const setUserStatus = async (req, res) => {
  try {
    const status = pick(req.body?.status, ["active", "suspended", "banned"]);
    if (!status || !isId(req.params.id)) return res.status(400).json({success: false, message: "Choose a valid status."});
    const user = await User.findByIdAndUpdate(req.params.id, {status}, {new: true}).select(ADMIN_USER_FIELDS).lean();
    if (!user) return res.status(404).json({success: false, message: "User not found."});
    return res.json({success: true, data: {user}});
  } catch (error) {
    return fail(res, error, "Unable to update this user.");
  }
};

const adjustUserCoins = async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "";
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) {
      return res.status(400).json({success: false, message: "Enter a whole number of coins (positive to add, negative to remove)."});
    }
    if (!reason) return res.status(400).json({success: false, message: "Add a reason for this adjustment."});
    if (!isId(req.params.id) || !(await User.exists({_id: req.params.id}))) {
      return res.status(404).json({success: false, message: "User not found."});
    }
    const entry = {
      userId: req.params.id,
      type: "admin_adjustment",
      amount: Math.abs(amount),
      idempotencyKey: `admin:${crypto.randomUUID()}`,
      metadata: {reason, admin: req.auth?.user?.email || "admin"},
    };
    await (amount > 0 ? creditCoins(entry) : debitCoins(entry));
    const user = await User.findById(req.params.id).select(ADMIN_USER_FIELDS).lean();
    return res.json({success: true, data: {user}});
  } catch (error) {
    return fail(res, error, "Unable to adjust coins.");
  }
};

// ---------- Calls, chats, ledger, payments, subscriptions ----------

const listCalls = async (req, res) => {
  try {
    const filter = {};
    const status = pick(req.query.status, ["completed", "missed", "rejected", "cancelled", "failed"]);
    const callType = pick(req.query.type, ["audio", "video"]);
    if (status) filter.status = status;
    if (callType) filter.callType = callType;
    if (req.query.search?.trim()) {
      const ids = await matchingUserIds(req.query.search);
      filter.$or = [{caller: {$in: ids}}, {callee: {$in: ids}}];
    }
    const result = await paged(
      Call.find(filter).sort({startedAt: -1}).populate("caller callee", USER_CARD),
      Call.countDocuments(filter),
      pageParams(req),
    );
    return res.json({success: true, data: {...result, live: getLiveCalls()}});
  } catch (error) {
    return fail(res, error, "Unable to load calls.");
  }
};

const listChats = async (req, res) => {
  try {
    const {page, limit, skip} = pageParams(req);
    const match = {};
    if (req.query.search?.trim()) match.participants = {$in: await matchingUserIds(req.query.search)};
    const [chats, total] = await Promise.all([
      Chat.aggregate([
        {$match: match},
        {$sort: {updatedAt: -1}},
        {$skip: skip},
        {$limit: limit},
        {$project: {participants: 1, lastMessage: 1, createdAt: 1, updatedAt: 1, messageCount: {$size: "$messages"}}},
      ]),
      Chat.countDocuments(match),
    ]);
    await User.populate(chats, {path: "participants", select: USER_CARD});
    return res.json({success: true, data: {items: chats, pagination: {page, limit, total, pages: Math.max(Math.ceil(total / limit), 1)}}});
  } catch (error) {
    return fail(res, error, "Unable to load chats.");
  }
};

// Messages of one conversation, for reviewing reports of abuse.
const getChatMessages = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({success: false, message: "Conversation not found."});
    const chat = await Chat.findById(req.params.id, {participants: 1, createdAt: 1, messages: {$slice: -200}})
      .populate("participants", USER_CARD).lean();
    if (!chat) return res.status(404).json({success: false, message: "Conversation not found."});
    return res.json({success: true, data: {chat}});
  } catch (error) {
    return fail(res, error, "Unable to load this conversation.");
  }
};

const listTransactions = async (req, res) => {
  try {
    const filter = {};
    const direction = pick(req.query.direction, ["credit", "debit"]);
    if (direction) {
      filter.$or = [
        {direction},
        {direction: {$exists: false}, type: direction === "debit" ? {$in: DEBIT_TYPES} : {$nin: DEBIT_TYPES}},
      ];
    }
    if (req.query.type && TRANSACTION_LABELS[req.query.type]) filter.type = req.query.type;
    if (isId(req.query.user)) filter.user = req.query.user;
    else if (req.query.search?.trim()) filter.user = {$in: await matchingUserIds(req.query.search)};
    const result = await paged(
      CoinTransaction.find(filter).sort({createdAt: -1}).populate("user", USER_CARD),
      CoinTransaction.countDocuments(filter),
      pageParams(req),
    );
    result.items = result.items.map(item => ({...item, direction: directionOf(item)}));
    return res.json({success: true, data: {...result, types: TRANSACTION_LABELS}});
  } catch (error) {
    return fail(res, error, "Unable to load the coin ledger.");
  }
};

const listPayments = async (req, res) => {
  try {
    const filter = {};
    const status = pick(req.query.status, ["created", "pending", "paid", "failed", "refunded"]);
    const kind = pick(req.query.kind, ["coin_package", "subscription"]);
    if (status) filter.status = status;
    if (kind) filter.kind = kind;
    if (req.query.search?.trim()) filter.user = {$in: await matchingUserIds(req.query.search)};
    const [result, totals] = await Promise.all([
      paged(
        PaymentOrder.find(filter).sort({createdAt: -1}).populate("user", USER_CARD).populate("coinStore", "coins").populate("subscriptionPlan", "name"),
        PaymentOrder.countDocuments(filter),
        pageParams(req),
      ),
      PaymentOrder.aggregate([{$group: {_id: "$status", amount: {$sum: "$amount"}, count: {$sum: 1}}}]),
    ]);
    return res.json({success: true, data: {...result, totals}});
  } catch (error) {
    return fail(res, error, "Unable to load payments.");
  }
};

const listSubscriptions = async (req, res) => {
  try {
    const filter = {};
    const status = pick(req.query.status, ["active", "expired", "cancelled", "trial"]);
    if (status) filter.status = status;
    if (req.query.search?.trim()) filter.user = {$in: await matchingUserIds(req.query.search)};
    const [result, totals] = await Promise.all([
      paged(
        Subscription.find(filter).sort({createdAt: -1}).populate("user", USER_CARD).populate("plan", "name code price durationDays"),
        Subscription.countDocuments(filter),
        pageParams(req),
      ),
      Subscription.aggregate([{$group: {_id: "$status", count: {$sum: 1}}}]),
    ]);
    return res.json({success: true, data: {...result, totals}});
  } catch (error) {
    return fail(res, error, "Unable to load subscriptions.");
  }
};

module.exports = {
  getOverview,
  getActivity,
  listUsers,
  getUserDetail,
  setUserStatus,
  adjustUserCoins,
  listCalls,
  listChats,
  getChatMessages,
  listTransactions,
  listPayments,
  listSubscriptions,
};
