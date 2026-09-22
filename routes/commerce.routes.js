const router = require("express").Router();
const {
  requireAuth,
  requireAdminLogin,
} = require("../middlewares/auth.middleware");
const commerce = require("../controllers/commerce.controller");
router.get("/coin-packages", requireAuth, commerce.getCoinPackages);
router.get("/subscription-plans", requireAuth, commerce.getSubscriptionPlans);
router.get("/subscriptions/me", requireAuth, commerce.getMySubscription);
router.post(
  "/admin/coin-packages",
  requireAuth,
  requireAdminLogin,
  commerce.createCoinPackage,
);
router.patch(
  "/admin/coin-packages/:id",
  requireAuth,
  requireAdminLogin,
  commerce.updateCoinPackage,
);
router.delete(
  "/admin/coin-packages/:id",
  requireAuth,
  requireAdminLogin,
  commerce.deleteCoinPackage,
);
router.post(
  "/admin/subscription-plans",
  requireAuth,
  requireAdminLogin,
  commerce.createSubscriptionPlan,
);
router.patch(
  "/admin/subscription-plans/:id",
  requireAuth,
  requireAdminLogin,
  commerce.updateSubscriptionPlan,
);
router.delete(
  "/admin/subscription-plans/:id",
  requireAuth,
  requireAdminLogin,
  commerce.deleteSubscriptionPlan,
);
module.exports = router;
