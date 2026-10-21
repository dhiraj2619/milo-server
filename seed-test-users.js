// Seeds bot profiles (isTestUser: true) so discover lists look populated during QA.
// They only appear in the app when the server runs with SHOW_TEST_USERS=true.
//   node seed-test-users.js           create/update bots
//   node seed-test-users.js --remove  delete all bots
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User.model");

// Bot phones use the unassignable +91 00000 range so they never collide with
// real users or with Firebase test login numbers (e.g. +91 99999 000xx).
const bots = [
  ["Aanya", "female", ["Hindi", "English"]],
  ["Riya", "female", ["Marathi", "Hindi"]],
  ["Kavya", "female", ["Tamil", "English"]],
  ["Meera", "female", ["English"]],
  ["Sneha", "female", ["Bengali", "Hindi"]],
  ["Diya", "female", ["Gujarati", "Hindi"]],
  ["Isha", "female", ["Telugu", "English"]],
  ["Naina", "female", ["Kannada", "English"]],
  ["Aryan", "male", ["Hindi", "Marathi"]],
  ["Kabir", "male", ["Hindi", "English"]],
  ["Rohan", "male", ["Marathi", "English"]],
  ["Arjun", "male", ["Tamil", "Telugu"]],
  ["Vivaan", "male", ["Gujarati", "English"]],
  ["Dev", "male", ["Punjabi", "Hindi"]],
  ["Ishaan", "male", ["Bengali", "English"]],
  ["Sam", "other", ["English", "Hindi"]],
].map(([nickname, gender, languages], index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    firebaseUid: `test-bot-${number}-${nickname.toLowerCase()}`,
    phone: `+9100000000${number}`,
    nickname,
    gender,
    languages,
    avatarSeed: `milo-bot-${nickname.toLowerCase()}`,
    referralCode: `MILOBOT${number}`,
    profileCompleted: true,
    status: "active",
    isTestUser: true,
    // Every third bot stays offline so both online and offline states can be tested.
    isOnline: index % 3 !== 2,
    lastSeen: index % 3 !== 2 ? null : new Date(),
  };
});

// Bots created by the earlier version of this script.
const legacyUids = ["test-user-aanya-milo", "test-user-aryan-milo"];

async function run() {
  if (!process.env.MONGO_URI || !process.env.MONGODB_NAME?.trim()) {
    throw new Error("MONGO_URI and MONGODB_NAME are required.");
  }
  await mongoose.connect(process.env.MONGO_URI, {dbName: process.env.MONGODB_NAME.trim()});
  console.log(`Connected to database "${mongoose.connection.name}".`);

  const legacy = await User.deleteMany({firebaseUid: {$in: legacyUids}});
  if (legacy.deletedCount) console.log(`Removed ${legacy.deletedCount} legacy test users.`);

  if (process.argv.includes("--remove")) {
    const removed = await User.deleteMany({isTestUser: true});
    console.log(`Removed ${removed.deletedCount} test users.`);
    return;
  }

  for (const bot of bots) {
    await User.updateOne({firebaseUid: bot.firebaseUid}, {$set: bot}, {upsert: true, runValidators: true});
  }
  console.log(`Ensured ${bots.length} test users exist.`);
}

run()
  .catch(error => {
    console.error("Unable to seed test users:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
