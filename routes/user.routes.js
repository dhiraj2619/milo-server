const router = require("express").Router();
const {saveUser, getMyProfile, updateMyProfile, getDiscoverProfiles, getLanguages} = require("../controllers/user.controller");
router.post("/profile", saveUser);
router.get("/me", getMyProfile);
router.patch("/me", updateMyProfile);
router.get("/discover",getDiscoverProfiles);
router.get('/languages',getLanguages);

module.exports = router;
