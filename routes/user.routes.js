const router = require("express").Router();
const {saveUser, getMyProfile, updateMyProfile} = require("../controllers/user.controller");
router.post("/profile", saveUser);
router.get("/me", getMyProfile);
router.patch("/me", updateMyProfile);

module.exports = router;
