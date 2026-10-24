const router = require("express").Router();
const { requireEnvironmentAdmin } = require("../middlewares/adminAuth.middleware");
const { auditAdmin } = require("../middlewares/adminAudit.middleware");
const admin = require("../controllers/admin.controller");

// Web admin dashboard only. Every route needs the admin session token.
router.use(requireEnvironmentAdmin);

router.get("/overview", admin.getOverview);
router.get("/activity", admin.getActivity);

router.get("/users", admin.listUsers);
router.get("/users/:id", admin.getUserDetail);
router.patch("/users/:id/status", auditAdmin("status", "user", (req, body) => `${body.data?.user?.nickname || "User"} set to ${req.body?.status}`), admin.setUserStatus);
router.post("/users/:id/coins", auditAdmin("adjust_coins", "user", (req, body) => `${req.body?.amount > 0 ? "+" : ""}${req.body?.amount} coins to ${body.data?.user?.nickname || "user"}: ${req.body?.reason}`), admin.adjustUserCoins);

router.get("/calls", admin.listCalls);
router.get("/chats", admin.listChats);
router.get("/chats/:id", admin.getChatMessages);
router.get("/transactions", admin.listTransactions);
router.get("/payments", admin.listPayments);
router.get("/subscriptions", admin.listSubscriptions);

module.exports = router;
