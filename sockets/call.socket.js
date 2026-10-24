const crypto = require("crypto");
const User = require("../models/User.model");
const Call = require("../models/Call.model");
const {sendToUser} = require("../services/push.service");
const {sendGift} = require("../services/gift.service");
const {GIFTS_BY_ID} = require("../config/catalog");

// Socket.IO only carries call signaling (invite/accept/end and WebRTC
// offer/answer/ICE). Audio and video flow peer-to-peer over WebRTC.
//
// If the callee has the app open, the call reaches them over the socket. If the
// app is in the background or closed, they also get a push notification; opening
// the app while the call is still ringing re-delivers it over the new socket.
//
// Call state lives in memory, so this works on a single server instance.
// Running several instances needs a shared store such as the Redis adapter.

const RING_TIMEOUT_MS = 30000;
// A matched call (MILO Special rooms) that both phones don't join in time is dropped.
const MATCH_CONNECT_TIMEOUT_MS = 20000;
const CALL_TYPES = ["audio", "video"];
const PEER_FIELDS = "firebaseUid nickname gender languages avatarSeed avatarStyle photoUrl interests prompts giftsReceived";

const calls = new Map(); // callId -> call
const callIdByUser = new Map(); // firebaseUid -> callId

function iceServers() {
  const servers = [{urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}];
  // TURN relays media when two phones cannot reach each other directly
  // (common on mobile data). Set these on the server before real-world testing.
  if (process.env.TURN_URLS) {
    servers.push({
      urls: process.env.TURN_URLS.split(",").map(url => url.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
}

const publicPeer = user => ({
  _id: String(user._id),
  firebaseUid: user.firebaseUid,
  nickname: user.nickname,
  gender: user.gender,
  languages: user.languages,
  avatarSeed: user.avatarSeed,
  avatarStyle: user.avatarStyle,
  photoUrl: user.photoUrl,
  // Conversation starters for the call screen.
  interests: user.interests || [],
  prompts: user.prompts || [],
  giftsReceived: user.giftsReceived || 0,
});

const incomingPayload = call => ({
  callId: call.id,
  callType: call.callType,
  caller: publicPeer(call.caller),
  iceServers: iceServers(),
});

const callTypeLabel = call => (call.callType === "video" ? "video" : "audio");

function registerCallHandlers(io, socket, {isUserOnline, isUserInApp}) {
  const uid = socket.firebaseUser.uid;

  // The app was opened (often from the call notification) while a call is ringing for this user.
  const ringing = calls.get(callIdByUser.get(uid));
  if (ringing && ringing.calleeUid === uid && ringing.status === "ringing") {
    socket.emit("call:incoming", incomingPayload(ringing));
    io.to(ringing.callerSocketId).emit("call:ringing", {callId: ringing.id});
  }

  const findOwnCall = callId => {
    const call = calls.get(callId);
    return call && (call.callerUid === uid || call.calleeUid === uid) ? call : null;
  };

  socket.on("call:invite", async ({calleeId, callType} = {}, ack = () => {}) => {
    try {
      if (!CALL_TYPES.includes(callType)) return ack({ok: false, reason: "invalid"});
      const [caller, callee] = await Promise.all([
        User.findOne({firebaseUid: uid, status: "active"}).select(PEER_FIELDS).lean(),
        User.findOne({_id: calleeId, status: "active"}).select(PEER_FIELDS).lean().catch(() => null),
      ]);
      if (!caller) return ack({ok: false, reason: "invalid"});
      if (!callee) return ack({ok: false, reason: "not_found"});
      if (callee.firebaseUid === uid) return ack({ok: false, reason: "invalid"});
      if (callIdByUser.has(uid)) return ack({ok: false, reason: "already_in_call"});
      if (callIdByUser.has(callee.firebaseUid)) return ack({ok: false, reason: "busy"});

      const call = {
        id: crypto.randomUUID(),
        callType,
        caller,
        callee,
        callerUid: uid,
        calleeUid: callee.firebaseUid,
        callerSocketId: socket.id,
        calleeSocketId: null,
        status: "ringing",
        startedAt: new Date(),
        answeredAt: null,
        ringTimer: null,
      };
      call.ringTimer = setTimeout(() => finishCall(io, call.id, "no_answer"), RING_TIMEOUT_MS);
      calls.set(call.id, call);
      callIdByUser.set(call.callerUid, call.id);
      callIdByUser.set(call.calleeUid, call.id);

      // Background sockets may still be alive, so always try the socket too.
      const payload = incomingPayload(call);
      io.to(call.calleeUid).emit("call:incoming", payload);

      // "ringing": the callee's screen is showing the call. "calling": we are waiting for them to open the app.
      let delivery = "ringing";
      if (!isUserInApp(call.calleeUid)) {
        const devices = await sendToUser(callee._id, {
          title: caller.nickname || "MILO",
          body: `Incoming ${callTypeLabel(call)} call. Tap to answer`,
          data: {type: "call", callId: call.id, callType},
          channelId: "calls",
          tag: `call-${call.id}`,
          ttlMs: RING_TIMEOUT_MS,
        });
        if (!devices && !isUserOnline(call.calleeUid)) {
          finishCall(io, call.id, "offline");
          return ack({ok: false, reason: "offline"});
        }
        delivery = "calling";
      }
      return ack({ok: true, callId: call.id, callee: publicPeer(callee), iceServers: payload.iceServers, delivery});
    } catch (error) {
      console.error("call:invite error:", error);
      return ack({ok: false, reason: "error"});
    }
  });

  socket.on("call:accept", ({callId} = {}, ack = () => {}) => {
    const call = findOwnCall(callId);
    if (!call || call.calleeUid !== uid || call.status !== "ringing") return ack({ok: false, reason: "not_ringing"});
    clearTimeout(call.ringTimer);
    call.status = "active";
    call.answeredAt = new Date();
    call.calleeSocketId = socket.id;
    io.to(call.callerSocketId).emit("call:accepted", {callId});
    // Stop the ringer on the callee's other devices.
    socket.to(call.calleeUid).emit("call:ended", {callId, reason: "answered_elsewhere"});
    return ack({ok: true});
  });

  // A gift during a connected call. The server charges the sender, then both phones show the animation.
  socket.on("call:gift", async ({callId, giftId, requestId} = {}, ack = () => {}) => {
    const call = findOwnCall(callId);
    if (!call || call.status !== "active") return ack({ok: false, reason: "not_in_call"});
    const gift = GIFTS_BY_ID[giftId];
    if (!gift || typeof requestId !== "string" || !requestId || requestId.length > 64) return ack({ok: false, reason: "invalid"});
    const fromCaller = call.callerUid === uid;
    const sender = fromCaller ? call.caller : call.callee;
    const receiver = fromCaller ? call.callee : call.caller;
    try {
      const {coinBalance, duplicate} = await sendGift({sender, receiver, gift, requestId, callId});
      if (!duplicate) {
        const event = {callId, giftId: gift.id, fromUserId: String(sender._id), fromName: sender.nickname};
        io.to(call.callerSocketId).to(call.calleeSocketId).emit("call:gift", event);
      }
      return ack({ok: true, coinBalance});
    } catch (error) {
      if (error.status === 409) return ack({ok: false, reason: "insufficient_coins", price: gift.coins});
      console.error("call:gift error:", error.message);
      return ack({ok: false, reason: "error"});
    }
  });

  socket.on("call:reject", ({callId} = {}) => {
    const call = findOwnCall(callId);
    if (call && call.calleeUid === uid && call.status === "ringing") finishCall(io, callId, "rejected");
  });

  socket.on("call:end", ({callId} = {}) => {
    const call = findOwnCall(callId);
    if (!call) return;
    if (call.status === "ringing") finishCall(io, callId, call.callerUid === uid ? "cancelled" : "rejected");
    else if (call.status === "matched") finishCall(io, callId, "cancelled");
    else finishCall(io, callId, "ended");
  });

  // Matched calls: each phone says when its microphone is ready. Once both are,
  // the "offer" side is told to start WebRTC (the same event a normal accept sends).
  socket.on("call:ready", ({callId} = {}) => {
    const call = findOwnCall(callId);
    if (!call || call.status !== "matched") return;
    call.ready.add(uid);
    if (call.ready.size < 2) return;
    clearTimeout(call.ringTimer);
    call.status = "active";
    call.answeredAt = new Date();
    if (call.maxSeconds) call.limitTimer = setTimeout(() => finishCall(io, call.id, "time_up"), call.maxSeconds * 1000);
    io.to(call.callerSocketId).emit("call:accepted", {callId});
  });

  // Relays WebRTC offer/answer, ICE candidates and mute/camera state to the other party.
  socket.on("call:signal", ({callId, description, candidate, media} = {}) => {
    const call = findOwnCall(callId);
    if (!call || call.status !== "active") return;
    const targetSocketId = call.callerUid === uid ? call.calleeSocketId : call.callerSocketId;
    if (targetSocketId) io.to(targetSocketId).emit("call:signal", {callId, description, candidate, media});
  });

  socket.on("disconnect", () => {
    const callId = callIdByUser.get(uid);
    const call = callId && calls.get(callId);
    if (!call) return;
    // Only the device that is actually in the call ends it.
    if (socket.id === call.callerSocketId || socket.id === call.calleeSocketId) {
      finishCall(io, callId, call.status === "active" ? "disconnected" : "cancelled");
    }
  });
}

const STATUS_BY_REASON = {
  ended: "completed",
  disconnected: "completed",
  no_answer: "missed",
  rejected: "rejected",
  cancelled: "cancelled",
  time_up: "completed",
  offline: "missed",
};
// Outcomes the callee should hear about later.
const MISSED_REASONS = ["no_answer", "cancelled"];

function finishCall(io, callId, reason) {
  const call = calls.get(callId);
  if (!call) return;
  clearTimeout(call.ringTimer);
  clearTimeout(call.limitTimer);
  calls.delete(callId);
  if (callIdByUser.get(call.callerUid) === callId) callIdByUser.delete(call.callerUid);
  if (callIdByUser.get(call.calleeUid) === callId) callIdByUser.delete(call.calleeUid);

  io.to(call.callerUid).to(call.calleeUid).emit("call:ended", {callId, reason});

  const endedAt = new Date();
  const answered = Boolean(call.answeredAt);
  // Same tag as the incoming-call push, so it replaces it on the callee's phone.
  // Room matches are not "missed calls"; nobody called anyone.
  if (!answered && !call.source && MISSED_REASONS.includes(reason)) {
    sendToUser(call.callee._id, {
      title: "Missed call",
      body: `${call.caller.nickname || "Someone"} tried to ${callTypeLabel(call)} call you`,
      data: {type: "missed_call", callId, callerId: String(call.caller._id)},
      channelId: "missed_calls",
      tag: `call-${callId}`,
    });
  }
  Call.create({
    callId,
    caller: call.caller._id,
    callee: call.callee._id,
    callType: call.callType,
    status: answered ? "completed" : (STATUS_BY_REASON[reason] || "failed"),
    endReason: reason,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    endedAt,
    durationSeconds: answered ? Math.round((endedAt - call.answeredAt) / 1000) : 0,
    source: call.source || null,
  }).catch(error => console.error("Unable to save call log:", error.message));
}

module.exports = {registerCallHandlers};

// Calls ringing or in progress right now, for the admin dashboard.
function getLiveCalls() {
  return [...calls.values()].map(call => ({
    callId: call.id,
    callType: call.callType,
    status: call.status,
    caller: publicPeer(call.caller),
    callee: publicPeer(call.callee),
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
  }));
}

module.exports.getLiveCalls = getLiveCalls;

const isInCall = uid => callIdByUser.has(uid);

// Starts a call between two people the room queue paired up (see sockets/match.socket.js).
// No ringing: both phones get "call:matched", prepare their microphones and send "call:ready".
// `first` and `second` are {user, socketId}; `user` is loaded with PEER_FIELDS.
function createMatchedCall(io, {first, second, room}) {
  const call = {
    id: crypto.randomUUID(),
    callType: "audio",
    caller: first.user,
    callee: second.user,
    callerUid: first.user.firebaseUid,
    calleeUid: second.user.firebaseUid,
    callerSocketId: first.socketId,
    calleeSocketId: second.socketId,
    status: "matched",
    startedAt: new Date(),
    answeredAt: null,
    ringTimer: null,
    limitTimer: null,
    source: room.key,
    maxSeconds: room.maxSeconds || null,
    ready: new Set(),
  };
  call.ringTimer = setTimeout(() => finishCall(io, call.id, "failed"), MATCH_CONNECT_TIMEOUT_MS);
  calls.set(call.id, call);
  callIdByUser.set(call.callerUid, call.id);
  callIdByUser.set(call.calleeUid, call.id);

  const servers = iceServers();
  const question = room.questions[Math.floor(Math.random() * room.questions.length)];
  const shared = {callId: call.id, callType: call.callType, room: room.key, question, maxSeconds: call.maxSeconds, iceServers: servers};
  io.to(call.callerSocketId).emit("call:matched", {...shared, role: "offer", peer: publicPeer(call.callee)});
  io.to(call.calleeSocketId).emit("call:matched", {...shared, role: "answer", peer: publicPeer(call.caller)});
  return call;
}

module.exports.isInCall = isInCall;
module.exports.createMatchedCall = createMatchedCall;
module.exports.PEER_FIELDS = PEER_FIELDS;
