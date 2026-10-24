const router = require("express").Router();
const { requireAuth, requireAdminLogin } = require("../middlewares/auth.middleware");
const { requireEnvironmentAdmin } = require("../middlewares/adminAuth.middleware");
const { auditAdmin } = require("../middlewares/adminAudit.middleware");
const commerce = require("../controllers/commerce.controller");

const coinLabel = req => (req.body?.coins ? `${req.body.coins} coins pack` : "Coin pack");
const planLabel = req => req.body?.name || req.body?.code || "Subscription plan";

router.get("/coin-store", requireAuth, commerce.getCoinStore);
router.get("/subscription-plans", requireAuth, commerce.getSubscriptionPlans);
router.get("/subscriptions/me", requireAuth, commerce.getMySubscription);

router.post("/admin/coin-store", requireEnvironmentAdmin, auditAdmin("create", "coin_store", coinLabel), commerce.createCoinStore);
router.patch("/admin/coin-store/:id", requireEnvironmentAdmin, auditAdmin("update", "coin_store", coinLabel), commerce.updateCoinStore);
router.delete("/admin/coin-store/:id", requireEnvironmentAdmin, auditAdmin("disable", "coin_store", () => "Coin pack disabled"), commerce.deleteCoinStore);

// These routes are exclusively for the credential-based web admin dashboard.
router.get("/admin/coin-store", requireEnvironmentAdmin, commerce.getCoinStore);
router.get("/admin/subscription-plans", requireEnvironmentAdmin, commerce.getSubscriptionPlans);
router.post("/admin/subscription-plans", requireEnvironmentAdmin, auditAdmin("create", "subscription_plan", planLabel), commerce.createSubscriptionPlan);
router.patch("/admin/subscription-plans/:id", requireEnvironmentAdmin, auditAdmin("update", "subscription_plan", planLabel), commerce.updateSubscriptionPlan);
router.delete("/admin/subscription-plans/:id", requireEnvironmentAdmin, auditAdmin("disable", "subscription_plan", () => "Plan disabled"), commerce.deleteSubscriptionPlan);

module.exports = router;
