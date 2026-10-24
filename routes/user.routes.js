const router = require("express").Router();
const { requireEnvironmentAdmin } = require("../middlewares/adminAuth.middleware");
const { auditAdmin } = require("../middlewares/adminAudit.middleware");
const { receivePhoto } = require("../services/photo.service");
const {
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
} = require("../controllers/user.controller");

router.post("/profile", saveUserProfile);
router.get("/me", getMyProfile);
router.patch("/me", updateMyProfile);
router.get("/discover", getDiscoverProfiles);
router.get("/languages", getLanguages);
router.get("/options", getProfileOptions);
router.put("/me/push-token", registerPushToken);
router.delete("/me/push-token", removePushToken);
router.post("/me/photo", receivePhoto, uploadMyPhoto);
router.delete("/me/photo", removeMyPhoto);
router.get("/me/favourites", getMyFavourites);
// After every /me route, so "me" is never read as a user id.
router.get("/:userId/profile", getPublicProfile);
router.put("/me/favourites/:userId", addFavourite);
router.delete("/me/favourites/:userId", removeFavourite);

router.get("/admin", requireEnvironmentAdmin, adminListUsers);
router.patch("/admin/:id/block", requireEnvironmentAdmin, auditAdmin("suspend", "user", () => "User suspended"), adminBlockUser);
router.delete("/admin/:id", requireEnvironmentAdmin, auditAdmin("ban", "user", () => "User banned"), adminDeleteUser);

module.exports = router;
