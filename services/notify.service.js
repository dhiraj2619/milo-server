const User = require("../models/User.model");
const PendingNotification = require("../models/PendingNotification.model");
const {sendToUser} = require("./push.service");

// Delayed "liked your profile" pushes.
// A like schedules one notification 8–9 hours later. When it's due it is sent only if the person
// is not using the app right then, at least one of the likes still stands (not un-favourited),
// and they haven't had one in the last 24 hours. Likes that arrive meanwhile join the same push.

const HOUR_MS = 60 * 60 * 1000;
const LIKE_DELAY_MS = 8 * HOUR_MS;
const LIKE_DELAY_JITTER_MS = HOUR_MS; // 8 to 9 hours
const MIN_GAP_MS = 24 * HOUR_MS;
const CHECK_EVERY_MS = 5 * 60 * 1000;
const BATCH = 50;

async function queueLikeNotification(recipientId, likerId) {
  if (String(recipientId) === String(likerId)) return;
  const sendAfter = new Date(Date.now() + LIKE_DELAY_MS + Math.floor(Math.random() * LIKE_DELAY_JITTER_MS));
  try {
    await PendingNotification.updateOne(
      {user: recipientId, type: "like", status: "pending"},
      {$addToSet: {actors: likerId}, $setOnInsert: {sendAfter}},
      {upsert: true},
    );
  } catch (error) {
    // Two likes at the same moment: the other request created the row; add to it.
    if (error.code === 11000) await PendingNotification.updateOne({user: recipientId, type: "like", status: "pending"}, {$addToSet: {actors: likerId}});
    else console.error("Unable to queue like notification:", error.message);
  }
}

const likeText = names => {
  if (names.length === 1) return `${names[0]} liked your profile`;
  if (names.length === 2) return `${names[1]} and ${names[0]} liked your profile`;
  return `${names.at(-1)} and ${names.length - 1} others liked your profile`;
};

async function deliver(pending, {isUserInApp}) {
  const finish = (status, note) => PendingNotification.updateOne({_id: pending._id, status: "pending"}, {$set: {status, note, ...(status === "sent" ? {sentAt: new Date()} : {})}});
  const recipient = await User.findOne({_id: pending.user, status: "active"}).select("_id firebaseUid").lean();
  if (!recipient) return finish("skipped", "recipient unavailable");
  // They're in the app now and will see it in MILO Special.
  if (isUserInApp(recipient.firebaseUid)) return finish("skipped", "recipient in app");

  // Only likes that still stand, oldest first so the newest name leads the message.
  const likers = await User.find({_id: {$in: pending.actors}, favourites: recipient._id, status: "active"}).select("_id nickname").lean();
  if (!likers.length) return finish("skipped", "likes withdrawn");
  const order = new Map(pending.actors.map((id, index) => [String(id), index]));
  likers.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));

  const recent = await PendingNotification.findOne({user: recipient._id, type: "like", status: "sent", sentAt: {$gt: new Date(Date.now() - MIN_GAP_MS)}}).select("sentAt").lean();
  if (recent) {
    // Too soon after the last one: try again when the day is up.
    await PendingNotification.updateOne({_id: pending._id}, {$set: {sendAfter: new Date(recent.sentAt.getTime() + MIN_GAP_MS)}});
    return null;
  }

  // Claim it before sending, so two server ticks can't send the same push.
  const claimed = await finish("sent", `${likers.length} like(s)`);
  if (!claimed.modifiedCount) return null;
  return sendToUser(recipient._id, {
    title: "💜 Someone likes you on MILO",
    body: likeText(likers.map(user => user.nickname || "Someone")),
    data: {type: "like"},
    channelId: "activity",
    tag: "likes",
  });
}

// Checks for due notifications every few minutes. On a free host that sleeps, due ones go out on wake-up.
function startNotificationWorker({isUserInApp}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due = await PendingNotification.find({status: "pending", sendAfter: {$lte: new Date()}}).sort({sendAfter: 1}).limit(BATCH).lean();
      for (const pending of due) await deliver(pending, {isUserInApp}).catch(error => console.error("Like notification failed:", error.message));
    } catch (error) {
      console.error("Notification worker error:", error.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, CHECK_EVERY_MS);
  timer.unref?.();
  setTimeout(tick, 30 * 1000).unref?.();
  return () => clearInterval(timer);
}

module.exports = {queueLikeNotification, startNotificationWorker, likeText, deliver};
