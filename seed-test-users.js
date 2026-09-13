require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User.model");

const testUsers = [
  {
    firebaseUid: "test-user-aanya-milo",
    phone: "+919999000001",
    nickname: "Aanya",
    gender: "female",
    languages: ["Hindi", "English"],
    avatarSeed: "milo-female-aanya",
  },
  {
    firebaseUid: "test-user-aryan-milo",
    phone: "+919999000002",
    nickname: "Aryan",
    gender: "male",
    languages: ["Hindi", "Marathi"],
    avatarSeed: "milo-male-aryan",
  },
].map(user => ({
  ...user,
  profileCompleted: true,
  status: "active",
  isOnline: false,
  lastSeen: null,
}));

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  for (const user of testUsers) {
    await User.updateOne(
      {firebaseUid: user.firebaseUid},
      {$setOnInsert: user},
      {upsert: true},
    );
  }
  console.log(`Ensured ${testUsers.length} test users exist.`);
  await mongoose.disconnect();
}

seed().catch(async error => {
  console.error("Unable to seed test users:", error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
