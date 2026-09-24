const router = require("express").Router();
const { requireEnvironmentAdmin } = require("../middlewares/adminAuth.middleware");
const { adminListUsers, adminBlockUser, adminDeleteUser } = require("../controllers/user.controller");

router.get("/admin", requireEnvironmentAdmin, adminListUsers);
router.patch("/admin/:id/block", requireEnvironmentAdmin, adminBlockUser);
router.delete("/admin/:id", requireEnvironmentAdmin, adminDeleteUser);

module.exports = router;