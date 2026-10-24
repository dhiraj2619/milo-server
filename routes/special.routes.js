const router = require("express").Router();
const { requireAuth } = require("../middlewares/auth.middleware");
const special = require("../controllers/special.controller");

router.use(requireAuth);
router.get("/", special.getSpecialHome);
router.post("/match/next", special.nextMatch);
router.post("/question", special.answerQuestion);

module.exports = router;
