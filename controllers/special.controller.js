const User = require("../models/User.model");
const Gift = require("../models/Gift.model");
const DailyAnswer = require("../models/DailyAnswer.model");
const DailyActivity = require("../models/DailyActivity.model");
const {DAILY_QUESTIONS, MAX_DAILY_ANSWER, ROOMS, SPECIAL_LIMITS} = require("../config/catalog");
const {isSubscriber} = require("../services/subscription.service");
const {debitCoins} = require("../services/coin.service");
const {CARD_FIELDS, today, todaysActivity, reasonsFor, findMatch} = require("../services/match.service");
const {roomCounts} = require("../sockets/match.socket");

// MILO Special: free to try, with MILO Connect (or coins) for more. Limits are in config/catalog.js.
// Every route uses requireAuth, so req.auth.user is the signed-in user.

const DAY_MS = 24 * 60 * 60 * 1000;
const fail = (res, error, message) => res.status(error.status || 500).json({success: false, message: error.status ? error.message : message});

// Same question for everyone today: days since 1970 (in IST) pick from the list.
const questionOfTheDay = () => DAILY_QUESTIONS[Math.floor(Date.parse(`${today()}T00:00:00Z`) / DAY_MS) % DAILY_QUESTIONS.length];

async function matchState(me, activity, subscriber) {
  // First visit today: pick today's free match.
  if (!activity.matches.length) {
    const first = await findMatch(me);
    if (first) {
      activity.matches.push(first._id);
      await DailyActivity.updateOne({_id: activity._id, matches: {$size: 0}}, {$push: {matches: first._id}});
    }
  }
  const currentId = activity.matches.at(-1);
  const person = currentId ? await User.findOne({_id: currentId, status: "active"}).select(CARD_FIELDS).lean() : null;
  const included = subscriber ? SPECIAL_LIMITS.subscriberMatches : SPECIAL_LIMITS.freeMatches;
  const used = activity.matches.length;
  return {
    person,
    reasons: person ? reasonsFor(me, person) : null,
    used,
    included,
    // What "Show another" costs right now: 0 while included picks remain, otherwise coins.
    nextCost: used < included ? 0 : SPECIAL_LIMITS.extraMatchCoins,
    canShowAnother: used < SPECIAL_LIMITS.maxMatchesPerDay,
  };
}

const getSpecialHome = async (req, res) => {
  try {
    const me = req.auth.user;
    const day = today();
    const [subscriber, activity, admirerCount, myAnswer, answers, leaderboard] = await Promise.all([
      isSubscriber(me._id),
      todaysActivity(me._id),
      User.countDocuments({favourites: me._id, status: "active"}),
      DailyAnswer.findOne({user: me._id, day}).lean(),
      DailyAnswer.find({day, user: {$ne: me._id}}).sort({updatedAt: -1}).limit(30).populate({path: "user", select: CARD_FIELDS, match: {status: "active"}}).lean(),
      Gift.aggregate([
        {$match: {createdAt: {$gte: new Date(Date.now() - 7 * DAY_MS)}}},
        {$group: {_id: "$to", gifts: {$sum: 1}, coins: {$sum: "$coins"}}},
        {$sort: {gifts: -1, coins: -1}},
        {$limit: 5},
        {$lookup: {from: "users", localField: "_id", foreignField: "_id", as: "user"}},
        {$unwind: "$user"},
        {$match: {"user.status": "active"}},
        {$project: {gifts: 1, coins: 1, "user._id": 1, "user.nickname": 1, "user.photoUrl": 1, "user.avatarStyle": 1, "user.avatarSeed": 1, "user.gender": 1}},
      ]),
    ]);
    const match = await matchState(me, activity, subscriber);
    // Free users learn how many people favourited them; MILO Connect shows who.
    const admirers = subscriber && admirerCount
      ? await User.find({favourites: me._id, status: "active"}).select(CARD_FIELDS).sort({isOnline: -1, lastSeen: -1}).limit(30).lean()
      : [];

    return res.json({
      success: true,
      data: {
        subscriber,
        match,
        speedTalk: {used: activity.speedRounds, limit: subscriber ? null : SPECIAL_LIMITS.freeSpeedRounds, seconds: ROOMS.find(room => room.key === "speed").maxSeconds},
        rooms: roomCounts(),
        onlineNow: req.app.get("onlineUserCount")?.() ?? 0,
        admirers: {count: admirerCount, people: admirers},
        question: {
          text: questionOfTheDay(),
          myAnswer: myAnswer?.answer || null,
          answers: answers.filter(item => item.user).map(item => ({_id: item._id, answer: item.answer, user: item.user})),
        },
        leaderboard: leaderboard.map(row => ({...row.user, gifts: row.gifts, coins: row.coins})),
      },
    });
  } catch (error) {
    console.error("special home error:", error);
    return fail(res, error, "Unable to load MILO Special.");
  }
};

// "Show another" on Today's Match. Free within the day's included picks, then costs coins.
const nextMatch = async (req, res) => {
  try {
    const me = req.auth.user;
    const subscriber = await isSubscriber(me._id);
    const activity = await todaysActivity(me._id);
    const used = activity.matches.length;
    if (used >= SPECIAL_LIMITS.maxMatchesPerDay) {
      return res.status(429).json({success: false, message: "That's all the matches for today. Come back tomorrow!"});
    }
    const next = await findMatch(me, activity.matches);
    if (!next) return res.status(404).json({success: false, message: "No new matches right now. Try again later."});

    const included = subscriber ? SPECIAL_LIMITS.subscriberMatches : SPECIAL_LIMITS.freeMatches;
    if (used >= included) {
      try {
        // Keyed by the pick number, so a double tap is charged once.
        await debitCoins({userId: me._id, type: "match_refresh", amount: SPECIAL_LIMITS.extraMatchCoins, idempotencyKey: `match:${me._id}:${activity.day}:${used}`, metadata: {day: activity.day}});
      } catch (error) {
        if (error.status === 409) return res.status(402).json({success: false, reason: "insufficient_coins", message: `You need ${SPECIAL_LIMITS.extraMatchCoins} coins for another match.`});
        throw error;
      }
    }
    // Only add if nobody else added a pick meanwhile (same position).
    const saved = await DailyActivity.findOneAndUpdate({_id: activity._id, [`matches.${used}`]: {$exists: false}}, {$push: {matches: next._id}}, {new: true});
    const state = await matchState(me, saved || await todaysActivity(me._id), subscriber);
    const wallet = await User.findById(me._id).select("coinBalance").lean();
    return res.json({success: true, data: {match: state, coinBalance: wallet?.coinBalance ?? 0}});
  } catch (error) {
    console.error("special next match error:", error);
    return fail(res, error, "Unable to find another match.");
  }
};

const answerQuestion = async (req, res) => {
  try {
    const answer = typeof req.body?.answer === "string" ? req.body.answer.trim().replace(/\s+/g, " ") : "";
    if (!answer || answer.length > MAX_DAILY_ANSWER) {
      return res.status(400).json({success: false, message: `Write an answer of up to ${MAX_DAILY_ANSWER} characters.`});
    }
    const day = today();
    await DailyAnswer.findOneAndUpdate(
      {user: req.auth.user._id, day},
      {$set: {answer, question: questionOfTheDay()}},
      {upsert: true, new: true, runValidators: true},
    );
    return res.json({success: true, data: {myAnswer: answer}});
  } catch (error) {
    return fail(res, error, "Unable to save your answer.");
  }
};

module.exports = {getSpecialHome, nextMatch, answerQuestion};
