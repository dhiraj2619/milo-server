const User = require("../models/User.model");
const DailyActivity = require("../models/DailyActivity.model");
const {ROOMS, ROOMS_BY_KEY, SPECIAL_LIMITS} = require("../config/catalog");
const {isSubscriber} = require("../services/subscription.service");
const {likesEachOther, today, todaysActivity} = require("../services/match.service");
const {isInCall, createMatchedCall, PEER_FIELDS} = require("./call.socket");

// MILO Special rooms: people wait in a room's queue until someone compatible joins,
// then both are put straight into a call (no ringing). Queues live in memory, like calls.
//   app -> "match:join" {room}   ack {ok, matched} or {ok: false, reason}
//   app -> "match:leave"
//   server -> "call:matched" (see createMatchedCall)

const queues = new Map(ROOMS.map(room => [room.key, []])); // room key -> [{uid, socketId, user, subscriber, joinedAt}]

const leaveAll = uid => queues.forEach((queue, key) => queues.set(key, queue.filter(entry => entry.uid !== uid)));

// People waiting per room, for the live counts on MILO Special.
const roomCounts = () => Object.fromEntries([...queues].map(([key, queue]) => [key, queue.length]));

function registerMatchHandlers(io, socket) {
  const uid = socket.firebaseUser.uid;

  socket.on("match:join", async ({room: roomKey} = {}, ack = () => {}) => {
    try {
      const room = ROOMS_BY_KEY[roomKey];
      if (!room) return ack({ok: false, reason: "invalid"});
      if (isInCall(uid)) return ack({ok: false, reason: "already_in_call"});
      const user = await User.findOne({firebaseUid: uid, status: "active"}).select(PEER_FIELDS).lean();
      if (!user) return ack({ok: false, reason: "invalid"});
      const subscriber = await isSubscriber(user._id);

      // Speed Talk: a few free rounds a day, unlimited with MILO Connect.
      if (room.key === "speed" && !subscriber) {
        const activity = await todaysActivity(user._id);
        if (activity.speedRounds >= SPECIAL_LIMITS.freeSpeedRounds) return ack({ok: false, reason: "limit", limit: SPECIAL_LIMITS.freeSpeedRounds});
      }

      // The awaits above may have taken a while; re-check before queueing.
      if (isInCall(uid)) return ack({ok: false, reason: "already_in_call"});
      leaveAll(uid);
      const queue = queues.get(room.key);
      const fits = entry => entry.uid !== uid && !isInCall(entry.uid) && io.sockets.sockets.has(entry.socketId)
        && (room.anyGender || likesEachOther(user, entry.user));
      // MILO Connect members waiting are matched first, then whoever has waited longest.
      const partner = [...queue].sort((a, b) => Number(b.subscriber) - Number(a.subscriber) || a.joinedAt - b.joinedAt).find(fits);

      if (!partner) {
        queue.push({uid, socketId: socket.id, user, subscriber, joinedAt: Date.now()});
        return ack({ok: true, matched: false, waiting: queue.length});
      }

      // Claim the partner and create the call before any await, so a second joiner can't take the same person.
      queues.set(room.key, queue.filter(entry => entry !== partner));
      // The person who waited makes the WebRTC offer.
      createMatchedCall(io, {first: {user: partner.user, socketId: partner.socketId}, second: {user, socketId: socket.id}, room});
      if (room.key === "speed") {
        // Both people use up a round.
        await Promise.all([user._id, partner.user._id].map(id => DailyActivity.updateOne({user: id, day: today()}, {$inc: {speedRounds: 1}}, {upsert: true})));
      }
      return ack({ok: true, matched: true});
    } catch (error) {
      console.error("match:join error:", error);
      return ack({ok: false, reason: "error"});
    }
  });

  socket.on("match:leave", () => leaveAll(uid));
  socket.on("disconnect", () => {
    // Only drop entries for this connection; another device of the same user may be waiting.
    queues.forEach((queue, key) => queues.set(key, queue.filter(entry => entry.socketId !== socket.id)));
  });
}

module.exports = {registerMatchHandlers, roomCounts};
