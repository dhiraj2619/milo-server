const User = require("../models/User.model");
const {getFirebaseAuth} = require("../config/firebaseAdmin");

const saveUser = async (req, res) => {
  try {
    const {idToken, nickname, gender, languages} = req.body || {};
    if (!idToken) return res.status(401).json({success: false, message: "Please sign in again."});
    const decoded = await getFirebaseAuth().verifyIdToken(idToken, true);
    if (!decoded.phone_number || decoded.firebase?.sign_in_provider !== "phone") {
      return res.status(401).json({success: false, message: "Verified phone authentication is required."});
    }
    const supported = ["Hindi", "Marathi", "English", "Bengali", "Tamil", "Telugu", "Kannada", "Gujarati", "Malayalam", "Punjabi", "Urdu", "Odia", "Assamese"];
    if (typeof nickname !== "string" || !nickname.trim() || nickname.trim().length > 20) {
      return res.status(400).json({success: false, message: "Nickname must contain 1 to 20 characters."});
    }
    if (!["male", "female", "other"].includes(gender)) {
      return res.status(400).json({success: false, message: "Select a valid gender."});
    }
    if (!Array.isArray(languages) || !languages.length || languages.length > supported.length || languages.some(item => !supported.includes(item))) {
      return res.status(400).json({success: false, message: "Select one or more supported languages."});
    }
    const user = await User.findOneAndUpdate(
      {firebaseUid: decoded.uid},
      {$set: {profileCompleted: true, nickname: nickname.trim(), gender, languages: [...new Set(languages)], phone: decoded.phone_number}, $setOnInsert: {firebaseUid: decoded.uid}},
      {upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true},
    );
    const persistedUser = await User.findOne({_id: user._id, firebaseUid: decoded.uid}).lean();
    if (!persistedUser || persistedUser.profileCompleted !== true || persistedUser.nickname !== nickname.trim() || persistedUser.gender !== gender || !languages.every(language => persistedUser.languages.includes(language))) {
      throw new Error("Profile read-back did not match saved values");
    }
    console.info("Profile saved", {userId: String(persistedUser._id), database: User.db.name, collection: User.collection.name});
    return res.status(200).json({success: true, message: "Profile saved successfully.", data: {user: persistedUser}});
  } catch (error) {
    console.error("Save user error:", error);
    if (["auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token", "auth/argument-error", "auth/user-disabled", "auth/user-not-found"].includes(error.code)) {
      return res.status(401).json({success: false, message: "Please sign in again."});
    }
    if (error.code === 11000) return res.status(409).json({success: false, message: "A profile already exists for this identity. Please sign in again."});
    if (error.name === "ValidationError") return res.status(400).json({success: false, message: "Please check your profile details."});
    return res.status(503).json({success: false, message: "Unable to save your profile. Please try again."});
  }
};

module.exports = {saveUser};



