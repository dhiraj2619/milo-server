const User = require("../models/User.model");
const { getFirebaseAuth } = require("../config/firebaseAdmin");

const PUBLIC_PROFILE_FIELDS =
  "nickname gender languages avatarSeed avatarStyle photoUrl isOnline lastSeen";

const authenticate = async (req) => {
  const authorization = req.headers.authorization || "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : req.body?.idToken;
  if (!idToken)
    throw Object.assign(new Error("Please sign in again."), { status: 401 });
  return getFirebaseAuth().verifyIdToken(idToken, true);
};

const saveUser = async (req, res) => {
  try {
    const { idToken, nickname, gender, languages, avatarSeed, avatarStyle } =
      req.body || {};
    if (!idToken)
      return res
        .status(401)
        .json({ success: false, message: "Please sign in again." });
    const decoded = await getFirebaseAuth().verifyIdToken(idToken, true);
    if (
      !decoded.phone_number ||
      decoded.firebase?.sign_in_provider !== "phone"
    ) {
      return res.status(401).json({
        success: false,
        message: "Verified phone authentication is required.",
      });
    }
    const supported = [
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
    if (
      typeof nickname !== "string" ||
      !nickname.trim() ||
      nickname.trim().length > 20
    ) {
      return res.status(400).json({
        success: false,
        message: "Nickname must contain 1 to 20 characters.",
      });
    }
    if (!["male", "female", "other"].includes(gender)) {
      return res
        .status(400)
        .json({ success: false, message: "Select a valid gender." });
    }
    if (
      !Array.isArray(languages) ||
      !languages.length ||
      languages.length > supported.length ||
      languages.some((item) => !supported.includes(item))
    ) {
      return res.status(400).json({
        success: false,
        message: "Select one or more supported languages.",
      });
    }
    const user = await User.findOneAndUpdate(
      { firebaseUid: decoded.uid },
      {
        $set: {
          profileCompleted: true,
          nickname: nickname.trim(),
          gender,
          languages: [...new Set(languages)],
          phone: decoded.phone_number,
          avatarSeed: typeof avatarSeed === "string" ? avatarSeed : "milo-user",
          avatarStyle: avatarStyle || null,
        },
        $setOnInsert: { firebaseUid: decoded.uid },
      },
      {
        upsert: true,
        returnDocument: "after",
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
    const persistedUser = await User.findOne({
      _id: user._id,
      firebaseUid: decoded.uid,
    }).lean();
    if (
      !persistedUser ||
      persistedUser.profileCompleted !== true ||
      persistedUser.nickname !== nickname.trim() ||
      persistedUser.gender !== gender ||
      !languages.every((language) => persistedUser.languages.includes(language))
    ) {
      throw new Error("Profile read-back did not match saved values");
    }
    console.info("Profile saved", {
      userId: String(persistedUser._id),
      database: User.db.name,
      collection: User.collection.name,
    });
    return res.status(200).json({
      success: true,
      message: "Profile saved successfully.",
      data: { user: persistedUser },
    });
  } catch (error) {
    console.error("Save user error:", error);
    if (
      [
        "auth/id-token-expired",
        "auth/id-token-revoked",
        "auth/invalid-id-token",
        "auth/argument-error",
        "auth/user-disabled",
        "auth/user-not-found",
      ].includes(error.code)
    ) {
      return res
        .status(401)
        .json({ success: false, message: "Please sign in again." });
    }
    if (error.code === 11000)
      return res.status(409).json({
        success: false,
        message:
          "A profile already exists for this identity. Please sign in again.",
      });
    if (error.name === "ValidationError")
      return res.status(400).json({
        success: false,
        message: "Please check your profile details.",
      });
    return res.status(503).json({
      success: false,
      message: "Unable to save your profile. Please try again.",
    });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const decoded = await authenticate(req);
    const user = await User.findOne({ firebaseUid: decoded.uid });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Profile not found." });
    return res.json({ success: true, data: { user } });
  } catch (error) {
    return res.status(error.status || 401).json({
      success: false,
      message: error.message || "Unable to load profile.",
    });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const decoded = await authenticate(req);
    const { avatarSeed, avatarStyle } = req.body || {};
    if (
      typeof avatarSeed !== "string" ||
      !avatarSeed.trim() ||
      avatarSeed.length > 100
    )
      return res
        .status(400)
        .json({ success: false, message: "Choose a valid avatar." });
    const user = await User.findOneAndUpdate(
      { firebaseUid: decoded.uid },
      {
        $set: {
          avatarSeed: avatarSeed.trim(),
          avatarStyle: avatarStyle || null,
        },
      },
      { new: true, runValidators: true },
    );
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Profile not found." });
    return res.json({ success: true, data: { user } });
  } catch (error) {
    return res.status(error.status || 401).json({
      success: false,
      message: error.message || "Unable to update profile.",
    });
  }
};

const getDiscoverProfiles = async (req, res) => {
  try {
    const decoded = await authenticate(req);

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 12, 1),
      30,
    );

    const language = String(req.query.language || "").trim();

    const filter = {
      firebaseUid: { $ne: decoded.uid },
      profileCompleted: true,
      status: "active",
    };

    if (language) {
      filter.languages = language;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(PUBLIC_PROFILE_FIELDS)
        .sort({ isOnline: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
        },
      },
    });
  } catch (error) {
    console.error("Discover profiles error:", error);

    return res.status(error.status || 401).json({
      success: false,
      message: error.message || "Unable to load profiles.",
    });
  }
};

const getLanguages = async (req, res) => {
  try {
    await authenticate(req);

    const languages = await User.distinct('languages', {
      profileCompleted: true,
      status: 'active',
    });

    return res.json({
      success: true,
      data: {languages: languages.sort()},
    });
  } catch (error) {
    return res.status(error.status || 401).json({
      success: false,
      message: error.message || 'Unable to load languages.',
    });
  }
};


module.exports = { saveUser, getMyProfile, updateMyProfile ,getDiscoverProfiles,getLanguages};
