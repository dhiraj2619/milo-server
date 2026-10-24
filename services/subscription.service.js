const Subscription = require("../models/Subscription.model");

// MILO Connect is active when the user has a paid or trial subscription that hasn't ended.
async function isSubscriber(userId) {
  return Boolean(await Subscription.exists({user: userId, status: {$in: ["active", "trial"]}, endsAt: {$gt: new Date()}}));
}

module.exports = {isSubscriber};
