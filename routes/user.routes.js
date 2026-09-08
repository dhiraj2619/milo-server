const router = require("express").Router();
const {saveUser} = require("../controllers/user.controller");
router.post("/profile", saveUser);
module.exports = router;
