const { getFirebaseAuth } = require("../config/firebaseAdmin");
const User = require("../models/User.model");

const requireAuth = async (req, res, next) => {
  try {
    const autorization = req.headers.authorization || "";

    if (!autorization.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "please sign in again" });
    }

    const decoded = await getFirebaseAuth().verifyIdToken(
      autorization.slice(7),
      true,
    );

    const user = await User.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Profile not found." });
    }

    req.auth = { firebaseUid: decoded.uid, user };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid session.",
    });
  }
};

const requireAdminLogin = (req, res, next) => {
  if (req.auth?.user?.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, message: "Admin access required." });
  }
  next();
};

module.exports = { requireAuth, requireAdminLogin };
