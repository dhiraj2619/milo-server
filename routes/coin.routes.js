const router = require("express").Router();
const {getWallet, claimDailyCoins, recordVerifiedPurchase} = require("../controllers/coin.controller");

router.get("/wallet", getWallet);
router.post("/daily-claim", claimDailyCoins);
router.post("/purchases/verified", recordVerifiedPurchase);

module.exports = router;
