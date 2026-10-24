const crypto = require("crypto");
const User = require("../models/User.model");
const Call = require("../models/Call.model");
const {sendToUser} = require("../services/push.service");

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
const CALL_TYPES = ["audio", "video"];
const PEER_FIELDS = "firebaseUid nickname gender languages avatarSeed avatarStyle photoUrl";

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

  socket.on("call:reject", ({callId} = {}) => {
    const call = findOwnCall(callId);
    if (call && call.calleeUid === uid && call.status === "ringing") finishCall(io, callId, "rejected");
  });

  socket.on("call:end", ({callId} = {}) => {
    const call = findOwnCall(callId);
    if (!call) return;
    if (call.status === "ringing") finishCall(io, callId, call.callerUid === uid ? "cancelled" : "rejected");
    else finishCall(io, callId, "ended");
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
    if (socket.id === call.callerSocketId) {
      finishCall(io, callId, call.status === "ringing" ? "cancelled" : "disconnected");
    } else if (socket.id === call.calleeSocketId) {
      finishCall(io, callId, "disconnected");
    }
  });
}

const STATUS_BY_REASON = {
  ended: "completed",
  disconnected: "completed",
  no_answer: "missed",
  rejected: "rejected",
  cancelled: "cancelled",
  offline: "missed",
};
// Outcomes the callee should hear about later.
const MISSED_REASONS = ["no_answer", "cancelled"];

function finishCall(io, callId, reason) {
  const call = calls.get(callId);
  if (!call) return;
  clearTimeout(call.ringTimer);
  calls.delete(callId);
  if (callIdByUser.get(call.callerUid) === callId) callIdByUser.delete(call.callerUid);
  if (callIdByUser.get(call.calleeUid) === callId) callIdByUser.delete(call.calleeUid);

  io.to(call.callerUid).to(call.calleeUid).emit("call:ended", {callId, reason});

  const endedAt = new Date();
  const answered = Boolean(call.answeredAt);
  // Same tag as the incoming-call push, so it replaces it on the callee's phone.
  if (!answered && MISSED_REASONS.includes(reason)) {
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
