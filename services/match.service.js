const User = require("../models/User.model");
const DailyActivity = require("../models/DailyActivity.model");

const CARD_FIELDS = "firebaseUid nickname gender languages avatarSeed avatarStyle photoUrl isOnline lastSeen interests prompts giftsReceived";
const DAY_MS = 24 * 60 * 60 * 1000;

// YYYY-MM-DD in India, so "today" resets at midnight IST for everyone.
const today = () => new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata"}).format(new Date());

// Who a user is shown and matched with: men see women, women see men, "other" sees everyone.
const wantedGenders = gender => (gender === "male" ? ["female"] : gender === "female" ? ["male"] : ["male", "female", "other"]);
const likesEachOther = (a, b) => wantedGenders(a.gender).includes(b.gender) && wantedGenders(b.gender).includes(a.gender);

async function todaysActivity(userId) {
  return DailyActivity.findOneAndUpdate(
    {user: userId, day: today()},
    {$setOnInsert: {user: userId, day: today(), matches: [], speedRounds: 0}},
    {new: true, upsert: true},
  );
}

// Why two people were matched, shown on the card.
function reasonsFor(me, person) {
  return {
    sharedInterests: (person.interests || []).filter(item => (me.interests || []).includes(item)),
    sharedLanguages: (person.languages || []).filter(item => (me.languages || []).includes(item)),
  };
}

// Best candidate for "Today's Match", skipping people already shown today.
async function findMatch(me, excludeIds = []) {
  const filter = {
    _id: {$nin: [me._id, ...excludeIds]},
    status: "active",
    profileCompleted: true,
    gender: {$in: wantedGenders(me.gender)},
  };
  if (process.env.SHOW_TEST_USERS !== "true") filter.isTestUser = {$ne: true};
  const candidates = (await User.find(filter).select(CARD_FIELDS).sort({isOnline: -1, lastSeen: -1}).limit(300).lean())
    .filter(person => likesEachOther(me, person));
  if (!candidates.length) return null;

  const now = Date.now();
  const scored = candidates.map(person => {
    const {sharedInterests, sharedLanguages} = reasonsFor(me, person);
    const seenRecently = person.lastSeen && now - new Date(person.lastSeen).getTime() < 3 * DAY_MS;
    const score = sharedInterests.length * 3 + sharedLanguages.length * 2 + (person.isOnline ? 4 : seenRecently ? 1 : 0)
      + (person.photoUrl ? 1 : 0) + (person.prompts?.length ? 1 : 0) + Math.random(); // random breaks ties
    return {person, score};
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].person;
}

module.exports = {CARD_FIELDS, today, wantedGenders, likesEachOther, todaysActivity, reasonsFor, findMatch};
