const crypto = require("crypto");
const User = require("../models/User.model");
const { getFirebaseAuth } = require("../config/firebaseAdmin");
const { creditCoins } = require("../services/coin.service");

const ALLOWED_LANGUAGES = [
  "Hindi",
  "Marathi",
  "English",
  "Bengali",
  "Tamil",
  "Telugu",
  "Kannada",
  "Gujarati",
  "Malayalam",
  "Punjabi",
  "Urdu",
  "Odia",
  "Assamese",
];

const PUBLIC_PROFILE_FIELDS =
  "firebaseUid nickname phone gender languages avatarSeed avatarStyle photoUrl profileCompleted isOnline lastSeen referralCode coinBalance lastDailyCoinClaimAt createdAt updatedAt";
const ADMIN_PROFILE_FIELDS =
  "nickname phone gender languages status isOnline createdAt avatarSeed avatarStyle photoUrl profileCompleted";

const getBearerToken = req => {
  const authorization = req.headers.authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
};

const verifyRequestToken = async req => {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }
  return getFirebaseAuth().verifyIdToken(token, true);
};

const createReferralCode = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `MILO${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    if (!(await User.exists({ referralCode: code }))) return code;
  }
  throw new Error("Unable to create a referral code.");
};

const validateProfile = ({ nickname, gender, languages }) => {
  if (typeof nickname !== "string" || !nickname.trim() || nickname.trim().length > 20) {
    return "Nickname must contain 1 to 20 characters.";
  }
  if (!["male", "female", "other"].includes(gender)) {
    return "Select a valid gender.";
  }
  if (
    !Array.isArray(languages) ||
    !languages.length ||
    languages.length > ALLOWED_LANGUAGES.length ||
    languages.some(language => !ALLOWED_LANGUAGES.includes(language))
  ) {
    return "Select one or more supported languages.";
  }
  return null;
};

const saveUserProfile = async (req, res) => {
  try {
    const { idToken, nickname, gender, languages, avatarSeed, avatarStyle, referralCode } = req.body || {};
    if (!idToken) return res.status(400).json({ success: false, message: "idToken is required." });

    const decoded = await getFirebaseAuth().verifyIdToken(idToken, true);
    const phone = decoded.phone_number;
    if (!phone || decoded.firebase?.sign_in_provider !== "phone") {
      return res.status(401).json({ success: false, message: "A valid Firebase phone ID token is required." });
    }

    const validationError = validateProfile({ nickname, gender, languages });
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const existingUser = await User.findOne({ firebaseUid: decoded.uid });
    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({
        referralCode: String(referralCode).trim().toUpperCase(),
        status: "active",
        profileCompleted: true,
      });
      if (!referrer || referrer.firebaseUid === decoded.uid) {
        return res.status(400).json({ success: false, message: "That referral code is invalid." });
      }
    }

    const referral = existingUser?.referralCode || await createReferralCode();
    const persistedUser = await User.findOneAndUpdate(
      { firebaseUid: decoded.uid },
      {
        $set: {
          phone,
          nickname: nickname.trim(),
          gender,
          languages: [...new Set(languages)],
          avatarSeed: typeof avatarSeed === "string" ? avatarSeed : `milo-${gender}-photo`,
          avatarStyle: avatarStyle || null,
          profileCompleted: true,
          referralCode: referral,
          status: "active",
        },
        $setOnInsert: {
          firebaseUid: decoded.uid,
          referredBy: referrer?._id || null,
        },
      },
      { new: true, upsert: true, runValidators: true },
    );

    if (!existingUser) {
      await creditCoins({
        userId: persistedUser._id,
        type: "welcome_bonus",
        amount: 100,
        idempotencyKey: `welcome:${persistedUser._id}`,
      });
      if (referrer) {
        await creditCoins({
          userId: persistedUser._id,
          type: "referral_friend_bonus",
          amount: 100,
          idempotencyKey: `referral-friend:${persistedUser._id}`,
          referenceUser: referrer._id,
        });
        await creditCoins({
          userId: referrer._id,
          type: "referrer_signup_bonus",
          amount: 200,
          idempotencyKey: `referral-referrer:${persistedUser._id}`,
          referenceUser: persistedUser._id,
        });
      }
    }

    return res.status(200).json({ success: true, data: { user: persistedUser } });
  } catch (error) {
    console.error("Save user profile error:", error);
    if (["auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token", "auth/argument-error", "auth/user-disabled", "auth/user-not-found"].includes(error.code)) {
      return res.status(401).json({ success: false, message: "Your sign-in session is invalid or expired. Please sign in again." });
    }
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This phone number is already registered." });
    if (error.name === "ValidationError") return res.status(400).json({ success: false, message: "Your profile details are invalid." });
    return res.status(503).json({ success: false, message: "Unable to save your profile right now. Please try again." });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    const user = await User.findOne({ firebaseUid: decoded.uid }).select(PUBLIC_PROFILE_FIELDS).lean();
    if (!user) return res.status(404).json({ success: false, message: "Profile not found." });
    return res.json({ success: true, data: { user } });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Invalid session." });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    const updates = {};
    if (typeof req.body?.avatarSeed === "string") updates.avatarSeed = req.body.avatarSeed;
    if (req.body?.avatarStyle && typeof req.body.avatarStyle === "object") updates.avatarStyle = req.body.avatarStyle;
    const user = await User.findOneAndUpdate({ firebaseUid: decoded.uid }, { $set: updates }, { new: true, runValidators: true }).select(PUBLIC_PROFILE_FIELDS).lean();
    if (!user) return res.status(404).json({ success: false, message: "Profile not found." });
    return res.json({ success: true, data: { user } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, message: error.status ? error.message : "Unable to update profile." });
  }
};

const getDiscoverProfiles = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 30);
    const language = typeof req.query.language === "string" ? req.query.language.trim() : "";
    const filter = { firebaseUid: { $ne: decoded.uid }, profileCompleted: true, status: "active" };
    if (language) filter.languages = language;
    const [users, total] = await Promise.all([
      User.find(filter).select(PUBLIC_PROFILE_FIELDS).sort({ isOnline: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Unable to load profiles." });
  }
};

const getLanguages = (_req, res) => res.json({ success: true, data: { languages: ALLOWED_LANGUAGES } });

const adminListUsers = async (_req, res) => {
  try {
    const users = await User.find().select(ADMIN_PROFILE_FIELDS).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: { users } });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load users." });
  }
};

const adminBlockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { status: "suspended" }, { new: true }).select(ADMIN_PROFILE_FIELDS);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    return res.json({ success: true, data: { user } });
  } catch {
    return res.status(400).json({ success: false, message: "Unable to block user." });
  }
};

const adminDeleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { status: "banned" }, { new: true }).select(ADMIN_PROFILE_FIELDS);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    return res.json({ success: true, data: { user } });
  } catch {
    return res.status(400).json({ success: false, message: "Unable to delete user." });
  }
};

module.exports = {
  saveUserProfile,
  getMyProfile,
  updateMyProfile,
  getDiscoverProfiles,
  getLanguages,
  adminListUsers,
  adminBlockUser,
  adminDeleteUser,
};
