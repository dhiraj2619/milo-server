const jwt = require("jsonwebtoken");

const requireEnvironmentAdmin = (req, res, next) => {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Please sign in again." });
  }
  try {
    const admin = jwt.verify(authorization.slice(7), process.env.ADMIN_AUTH_SECRET);
    if (admin.type !== "admin" || admin.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }
    req.auth = { admin: true, user: { role: "admin", email: admin.email } };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Please sign in again." });
  }
};

module.exports = { requireEnvironmentAdmin };