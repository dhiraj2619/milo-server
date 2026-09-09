const User = require("../models/User.model");
const {getFirebaseAuth} = require("../config/firebaseAdmin");

const firebaseApiUrl = action => {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  return apiKey ? `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${apiKey}` : null;
};

const isE164Phone = phoneNumber => /^\+[1-9]\d{7,14}$/.test(phoneNumber);

const sendFirebaseOTP = async (req, res) => {
  const {phoneNumber, recaptchaToken} = req.body || {};

  if (!process.env.FIREBASE_WEB_API_KEY) {
    return res.status(503).json({success: false, message: "Firebase web API key is not configured."});
  }
  if (!isE164Phone(phoneNumber) || !recaptchaToken) {
    return res.status(400).json({success: false, message: "phoneNumber must use E.164 format and recaptchaToken is required."});
  }

  try {
    const response = await fetch(firebaseApiUrl("sendVerificationCode"), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({phoneNumber, recaptchaToken}),
    });
    const payload = await response.json();
    if (!response.ok) {
      return res.status(400).json({success: false, message: payload.error?.message || "Unable to send OTP."});
    }
    return res.status(200).json({success: true, sessionInfo: payload.sessionInfo});
  } catch (error) {
    console.error("Firebase OTP send error:", error);
    return res.status(502).json({success: false, message: "Firebase OTP service is unavailable."});
  }
};

const verifyFirebaseOTP = async (req, res) => {
  const {sessionInfo, code} = req.body || {};

  if (!process.env.FIREBASE_WEB_API_KEY) {
    return res.status(503).json({success: false, message: "Firebase web API key is not configured."});
  }
  if (!sessionInfo || !/^\d{6}$/.test(String(code))) {
    return res.status(400).json({success: false, message: "sessionInfo and a 6-digit code are required."});
  }

  try {
    const response = await fetch(firebaseApiUrl("signInWithPhoneNumber"), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({sessionInfo, code: String(code)}),
    });
    const payload = await response.json();
    if (!response.ok) {
      return res.status(400).json({success: false, message: payload.error?.message || "Invalid OTP."});
    }
    return res.status(200).json({
      success: true,
      idToken: payload.idToken,
      refreshToken: payload.refreshToken,
      localId: payload.localId,
      phoneNumber: payload.phoneNumber,
    });
  } catch (error) {
    console.error("Firebase OTP verification error:", error);
    return res.status(502).json({success: false, message: "Firebase OTP service is unavailable."});
  }
};

const verifyFirebaseIdToken = async (req, res) => {
  try {
    const {idToken, nickname, gender, languages} = req.body || {};
    if (!idToken) {
      return res.status(400).json({success: false, message: "idToken is required."});
    }

    const decodedToken = await getFirebaseAuth().verifyIdToken(idToken, true);
    const phone = decodedToken.phone_number;
    if (!phone || decodedToken.firebase?.sign_in_provider !== "phone") {
      return res.status(401).json({success: false, message: "A valid Firebase phone ID token is required."});
    }

    const hasProfile = nickname !== undefined || gender !== undefined || languages !== undefined;
    let profile;
    if (hasProfile) {
      const allowedLanguages = ["Hindi", "Marathi", "English", "Bengali", "Tamil", "Telugu", "Kannada", "Gujarati", "Malayalam", "Punjabi", "Urdu", "Odia", "Assamese"];
      if (typeof nickname !== "string" || !nickname.trim() || nickname.trim().length > 20) {
        return res.status(400).json({success: false, message: "Nickname must contain 1 to 20 characters."});
      }
      if (!["male", "female", "other"].includes(gender)) {
        return res.status(400).json({success: false, message: "Select a valid gender."});
      }
      if (!Array.isArray(languages) || !languages.length || languages.length > allowedLanguages.length || languages.some(language => !allowedLanguages.includes(language))) {
        return res.status(400).json({success: false, message: "Select one or more supported languages."});
      }
      profile = {nickname: nickname.trim(), gender, languages: [...new Set(languages)]};
    }

    let user = await User.findOne({firebaseUid: decodedToken.uid});
    if (profile) {
      if (user) {
        user.set(profile);
        await user.save();
      } else {
        user = await User.create({firebaseUid: decodedToken.uid, phone, ...profile});
      }
    }
    const isNewUser = !user;
    const profileCompleted = !!(user && user.profileCompleted === true && user.nickname?.trim() && ["male", "female", "other"].includes(user.gender) && user.languages?.length);

    return res.status(200).json({
      success: true,
      message: "Phone authentication successful.",
      data: {firebaseUid: decodedToken.uid, phone, user, isNewUser, profileCompleted},
    });
  } catch (error) {
    console.error("Firebase ID token verification error:", error);
    if (["auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token", "auth/argument-error", "auth/user-disabled", "auth/user-not-found"].includes(error.code)) {
      return res.status(401).json({success: false, message: "Your sign-in session is invalid or expired. Please sign in again."});
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({success: false, message: "Your profile details are invalid. Please check them and retry."});
    }
    return res.status(503).json({success: false, message: "Unable to complete sign-in or save your profile right now. Please try again."});
  }
};

module.exports = {sendFirebaseOTP, verifyFirebaseOTP, verifyFirebaseIdToken};



