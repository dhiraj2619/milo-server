const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  sendFirebaseOTP,
  verifyFirebaseOTP,
  verifyFirebaseIdToken,
} = require("../controllers/auth.controller");

const router = express.Router();
const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {success: false, message: "Too many OTP requests. Try again later."},
});

router.post("/firebase/send", otpRateLimit, sendFirebaseOTP);
router.post("/firebase/verify-code", otpRateLimit, verifyFirebaseOTP);
router.post("/firebase/verify-token", verifyFirebaseIdToken);

module.exports = router;
