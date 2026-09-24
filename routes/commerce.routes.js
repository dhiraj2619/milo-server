const router = require("express").Router();
const { requireAuth, requireAdminLogin } = require("../middlewares/auth.middleware");
const { requireEnvironmentAdmin } = require("../middlewares/adminAuth.middleware");
const commerce = require("../controllers/commerce.controller");

router.get("/coin-store", requireAuth, commerce.getCoinStore);
router.get("/subscription-plans", requireAuth, commerce.getSubscriptionPlans);
router.get("/subscriptions/me", requireAuth, commerce.getMySubscription);

router.post("/admin/coin-store", requireEnvironmentAdmin, commerce.createCoinStore);
router.patch("/admin/coin-store/:id", requireEnvironmentAdmin, commerce.updateCoinStore);
router.delete("/admin/coin-store/:id", requireEnvironmentAdmin, commerce.deleteCoinStore);

// These routes are exclusively for the credential-based web admin dashboard.
router.get("/admin/coin-store", requireEnvironmentAdmin, commerce.getCoinStore);
router.get("/admin/subscription-plans", requireEnvironmentAdmin, commerce.getSubscriptionPlans);
router.post("/admin/subscription-plans", requireEnvironmentAdmin, commerce.createSubscriptionPlan);
router.patch("/admin/subscription-plans/:id", requireEnvironmentAdmin, commerce.updateSubscriptionPlan);
router.delete("/admin/subscription-plans/:id", requireEnvironmentAdmin, commerce.deleteSubscriptionPlan);

module.exports = router;