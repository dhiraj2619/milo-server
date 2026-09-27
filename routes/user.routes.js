const router = require("express").Router();
const { requireEnvironmentAdmin } = require("../middlewares/adminAuth.middleware");
const {
  saveUserProfile,
  getMyProfile,
  updateMyProfile,
  getDiscoverProfiles,
  getLanguages,
  adminListUsers,
  adminBlockUser,
  adminDeleteUser,
} = require("../controllers/user.controller");

router.post("/profile", saveUserProfile);
router.get("/me", getMyProfile);
router.patch("/me", updateMyProfile);
router.get("/discover", getDiscoverProfiles);
router.get("/languages", getLanguages);

router.get("/admin", requireEnvironmentAdmin, adminListUsers);
router.patch("/admin/:id/block", requireEnvironmentAdmin, adminBlockUser);
router.delete("/admin/:id", requireEnvironmentAdmin, adminDeleteUser);

module.exports = router;
