const router = require("express").Router();
const { requireEnvironmentAdmin } = require("../middlewares/adminAuth.middleware");
const {
  saveUserProfile,
  getMyProfile,
  updateMyProfile,
  getDiscoverProfiles,
  getLanguages,
  registerPushToken,
  removePushToken,
  adminListUsers,
  adminBlockUser,
  adminDeleteUser,
} = require("../controllers/user.controller");

router.post("/profile", saveUserProfile);
router.get("/me", getMyProfile);
router.patch("/me", updateMyProfile);
router.get("/discover", getDiscoverProfiles);
router.get("/languages", getLanguages);
router.put("/me/push-token", registerPushToken);
router.delete("/me/push-token", removePushToken);

router.get("/admin", requireEnvironmentAdmin, adminListUsers);
router.patch("/admin/:id/block", requireEnvironmentAdmin, adminBlockUser);
router.delete("/admin/:id", requireEnvironmentAdmin, adminDeleteUser);

module.exports = router;
