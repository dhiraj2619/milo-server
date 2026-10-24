const User = require("../models/User.model");
const {getFirebaseMessaging} = require("../config/firebaseAdmin");

// Errors meaning the token will never work again (app uninstalled, token rotated).
const DEAD_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

// Sends one notification to every device the user is signed in on.
// Never throws: a failed push must not break the call flow. Returns the number of devices reached.
async function sendToUser(userId, {title, body, data = {}, channelId, tag, ttlMs}) {
  try {
    const user = await User.findById(userId).select("+pushTokens").lean();
    const tokens = user?.pushTokens || [];
    if (!tokens.length) return 0;

    const response = await getFirebaseMessaging().sendEachForMulticast({
      tokens,
      notification: {title, body},
      data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
      android: {
        priority: "high",
        ...(ttlMs ? {ttl: ttlMs} : {}),
        // The same tag replaces an earlier notification, e.g. "calling" becomes "missed call".
        notification: {channelId, tag, sound: "default", defaultVibrateTimings: true},
      },
      apns: {payload: {aps: {sound: "default"}}},
    });

    const deadTokens = response.responses
      .map((result, index) => (!result.success && DEAD_TOKEN_ERRORS.has(result.error?.code) ? tokens[index] : null))
      .filter(Boolean);
    if (deadTokens.length) await User.updateOne({_id: userId}, {$pull: {pushTokens: {$in: deadTokens}}});
    return response.successCount;
  } catch (error) {
    console.error("Push notification failed:", error.message);
    return 0;
  }
}

module.exports = {sendToUser};
