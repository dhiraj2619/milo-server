const User = require("../models/User.model");

const firebaseOTPLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "idToken is required" });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);

    const firebaseUid = decodedToken.uid;
    const phone = decodedToken.phone_number;

    if (!phone) {
      return res
        .status(400)
        .json({ message: "Phone number is not available in the firebase" });
    }

    let user = await User.findOne({ firebaseUid });

    if (!user) {
      user = await User.create({
        firebaseUid,
        phone,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Phone authentication successful",
      data: {
        user,
        isNewUser: user.createdAt.getTime() === user.updatedAt.getTime(),
      },
    });
  } catch (error) {
    console.error("Error verifying Firebase ID token:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  firebaseOTPLogin,
};
