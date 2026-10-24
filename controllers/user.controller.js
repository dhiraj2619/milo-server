const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User.model");
const { getFirebaseAuth } = require("../config/firebaseAdmin");
const { creditCoins } = require("../services/coin.service");
const { uploadProfilePhoto, deleteProfilePhoto } = require("../services/photo.service");
const { queueLikeNotification } = require("../services/notify.service");
const ProfileView = require("../models/ProfileView.model");
const { INTERESTS, MAX_INTERESTS, PROMPTS, MAX_PROMPTS, MAX_PROMPT_ANSWER, GIFTS, cleanInterests, cleanPrompts } = require("../config/catalog");

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
  "firebaseUid nickname phone gender languages avatarSeed avatarStyle photoUrl profileCompleted isOnline lastSeen referralCode coinBalance lastDailyCoinClaimAt interests prompts giftsReceived giftCounts createdAt updatedAt";
// Fields other users may see; excludes phone, coins and referral details.
const DISCOVER_PROFILE_FIELDS =
  "firebaseUid nickname gender languages avatarSeed avatarStyle photoUrl isOnline lastSeen interests prompts giftsReceived";
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
    const { idToken, nickname, gender, languages, avatarSeed, avatarStyle, referralCode, interests, prompts } = req.body || {};
    if (!idToken) return res.status(400).json({ success: false, message: "idToken is required." });

    const decoded = await getFirebaseAuth().verifyIdToken(idToken, true);
    const phone = decoded.phone_number;
    if (!phone || decoded.firebase?.sign_in_provider !== "phone") {
      return res.status(401).json({ success: false, message: "A valid Firebase phone ID token is required." });
    }

    const validationError = validateProfile({ nickname, gender, languages });
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    // Optional at signup; older app versions don't send them.
    const cleanedInterests = interests === undefined ? undefined : cleanInterests(interests);
    const cleanedPrompts = prompts === undefined ? undefined : cleanPrompts(prompts);
    if (cleanedInterests === null) return res.status(400).json({ success: false, message: `Pick up to ${MAX_INTERESTS} interests from the list.` });
    if (cleanedPrompts === null) return res.status(400).json({ success: false, message: `Answer up to ${MAX_PROMPTS} different prompts, ${MAX_PROMPT_ANSWER} characters each.` });

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
          ...(cleanedInterests ? { interests: cleanedInterests } : {}),
          ...(cleanedPrompts ? { prompts: cleanedPrompts } : {}),
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
    if (req.body?.interests !== undefined) {
      updates.interests = cleanInterests(req.body.interests);
      if (!updates.interests) return res.status(400).json({ success: false, message: `Pick up to ${MAX_INTERESTS} interests from the list.` });
    }
    if (req.body?.prompts !== undefined) {
      updates.prompts = cleanPrompts(req.body.prompts);
      if (!updates.prompts) return res.status(400).json({ success: false, message: `Answer up to ${MAX_PROMPTS} different prompts, ${MAX_PROMPT_ANSWER} characters each.` });
    }
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
    if (process.env.SHOW_TEST_USERS !== "true") filter.isTestUser = { $ne: true };
    const [users, total] = await Promise.all([
      User.find(filter).select(DISCOVER_PROFILE_FIELDS).sort({ isOnline: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    const pages = Math.ceil(total / limit);
    return res.json({ success: true, data: { users, pagination: { page, limit, total, pages, hasNextPage: page < pages } } });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Unable to load profiles." });
  }
};

// The photo arrives as multipart field "photo" (see receivePhoto in the route).
const uploadMyPhoto = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    if (!req.file?.buffer?.length) return res.status(400).json({ success: false, message: "Please choose a photo." });
    if (!(await User.exists({ firebaseUid: decoded.uid }))) return res.status(404).json({ success: false, message: "Profile not found." });
    const photoUrl = await uploadProfilePhoto(req.file.buffer, decoded.uid);
    const user = await User.findOneAndUpdate({ firebaseUid: decoded.uid }, { $set: { photoUrl } }, { new: true }).select(PUBLIC_PROFILE_FIELDS).lean();
    return res.json({ success: true, data: { user } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Profile photo upload failed:", error.message);
    return res.status(502).json({ success: false, message: "Could not upload your photo. Please try again." });
  }
};

// Goes back to showing the avatar.
const removeMyPhoto = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    const user = await User.findOneAndUpdate({ firebaseUid: decoded.uid }, { $set: { photoUrl: null } }, { new: true }).select(PUBLIC_PROFILE_FIELDS).lean();
    if (!user) return res.status(404).json({ success: false, message: "Profile not found." });
    deleteProfilePhoto(decoded.uid);
    return res.json({ success: true, data: { user } });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Invalid session." });
  }
};

const MAX_FAVOURITES = 200;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

// Another user's public profile. Opening it counts as a profile view (once per viewer per day).
const getPublicProfile = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ success: false, message: "Profile not found." });
    const [me, user] = await Promise.all([
      User.findOne({ firebaseUid: decoded.uid }).select("_id +favourites").lean(),
      User.findOne({ _id: req.params.userId, status: "active", profileCompleted: true }).select(`${DISCOVER_PROFILE_FIELDS} giftCounts`).lean(),
    ]);
    if (!me || !user) return res.status(404).json({ success: false, message: "Profile not found." });
    const isSelf = String(me._id) === String(user._id);
    if (!isSelf) {
      ProfileView.updateOne(
        { viewer: me._id, viewed: user._id, day: today() },
        { $set: { viewer: me._id, viewed: user._id, day: today() } },
        { upsert: true },
      ).catch(error => { if (error.code !== 11000) console.error("Unable to record profile view:", error.message); });
    }
    const isFavourite = (me.favourites || []).some(id => String(id) === String(user._id));
    return res.json({ success: true, data: { user, isFavourite, isSelf } });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Invalid session." });
  }
};

// Favourites with live online status, online people first.
const getMyFavourites = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    const me = await User.findOne({ firebaseUid: decoded.uid }).select("+favourites").lean();
    if (!me) return res.status(404).json({ success: false, message: "Profile not found." });
    const people = await User.find({ _id: { $in: me.favourites || [] }, status: "active" }).select(DISCOVER_PROFILE_FIELDS).lean();
    // Newest favourite first, then online before offline (stable sort keeps the recency order).
    const order = new Map((me.favourites || []).map((id, index) => [String(id), index]));
    people.sort((a, b) => order.get(String(b._id)) - order.get(String(a._id)));
    people.sort((a, b) => Number(Boolean(b.isOnline)) - Number(Boolean(a.isOnline)));
    return res.json({ success: true, data: { favourites: people } });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Invalid session." });
  }
};

const addFavourite = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    const target = await User.findOne({ _id: req.params.userId, status: "active" }).select("_id firebaseUid").lean().catch(() => null);
    if (!target) return res.status(404).json({ success: false, message: "That person is not available." });
    if (target.firebaseUid === decoded.uid) return res.status(400).json({ success: false, message: "You can't add yourself." });
    const me = await User.findOne({ firebaseUid: decoded.uid }).select("_id +favourites").lean();
    if (!me) return res.status(404).json({ success: false, message: "Profile not found." });
    const isNewLike = !(me.favourites || []).some(id => String(id) === String(target._id));
    // Moves an existing favourite to the newest position.
    await User.updateOne({ _id: me._id }, { $pull: { favourites: target._id } });
    await User.updateOne({ _id: me._id }, { $push: { favourites: { $each: [target._id], $slice: -MAX_FAVOURITES } } });
    // A real, new like: tell them later ("Riya liked your profile"), unless they're active by then.
    if (isNewLike) queueLikeNotification(target._id, me._id);
    // Mutual when they had already favourited this user ("It's a match" after Speed Talk).
    const mutual = Boolean(await User.exists({ _id: target._id, favourites: me._id }));
    return res.json({ success: true, data: { userId: String(target._id), favourite: true, mutual } });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Invalid session." });
  }
};

const removeFavourite = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ success: false, message: "Not in your favourites." });
    await User.updateOne({ firebaseUid: decoded.uid }, { $pull: { favourites: req.params.userId } });
    return res.json({ success: true, data: { userId: req.params.userId, favourite: false } });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Invalid session." });
  }
};

const MAX_PUSH_TOKENS = 5;
const validPushToken = token => typeof token === "string" && token.length > 20 && token.length < 4096;

const registerPushToken = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    const token = req.body?.token;
    if (!validPushToken(token)) return res.status(400).json({ success: false, message: "Invalid push token." });
    // A device token belongs to whoever signed in on it last.
    await User.updateMany({ pushTokens: token, firebaseUid: { $ne: decoded.uid } }, { $pull: { pushTokens: token } });
    // Newest last; only the most recent devices are kept.
    await User.updateOne({ firebaseUid: decoded.uid }, { $pull: { pushTokens: token } });
    const result = await User.updateOne(
      { firebaseUid: decoded.uid },
      { $push: { pushTokens: { $each: [token], $slice: -MAX_PUSH_TOKENS } } },
    );
    if (!result.matchedCount) return res.status(404).json({ success: false, message: "Profile not found." });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Invalid session." });
  }
};

const removePushToken = async (req, res) => {
  try {
    const decoded = await verifyRequestToken(req);
    const token = req.body?.token;
    if (!validPushToken(token)) return res.status(400).json({ success: false, message: "Invalid push token." });
    await User.updateOne({ firebaseUid: decoded.uid }, { $pull: { pushTokens: token } });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 401).json({ success: false, message: error.status ? error.message : "Invalid session." });
  }
};

const getLanguages = (_req, res) => res.json({ success: true, data: { languages: ALLOWED_LANGUAGES } });

// Everything the app offers on profiles and in calls. Public: needed before and during signup.
const getProfileOptions = (_req, res) => res.json({
  success: true,
  data: { languages: ALLOWED_LANGUAGES, interests: INTERESTS, maxInterests: MAX_INTERESTS, prompts: PROMPTS, maxPrompts: MAX_PROMPTS, maxPromptAnswer: MAX_PROMPT_ANSWER, gifts: GIFTS },
});

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
  getProfileOptions,
  registerPushToken,
  removePushToken,
  uploadMyPhoto,
  removeMyPhoto,
  getMyFavourites,
  getPublicProfile,
  addFavourite,
  removeFavourite,
  adminListUsers,
  adminBlockUser,
  adminDeleteUser,
};
