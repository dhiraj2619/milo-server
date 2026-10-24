const AdminLog = require("../models/AdminLog.model");

// Records a successful admin change. Runs after requireEnvironmentAdmin and
// writes the log only once the handler has answered with success: true.
const auditAdmin = (action, targetType, summarize = () => "") => (req, res, next) => {
  const json = res.json.bind(res);
  res.json = body => {
    if (body?.success && res.statusCode < 400) {
      AdminLog.create({
        admin: req.auth?.user?.email || "admin",
        action,
        targetType,
        targetId: req.params.id || body?.data?._id || null,
        summary: String(summarize(req, body) || "").slice(0, 300),
        details: req.body && typeof req.body === "object" ? req.body : {},
      }).catch(error => console.error("Unable to write admin log:", error.message));
    }
    return json(body);
  };
  next();
};

module.exports = {auditAdmin};
