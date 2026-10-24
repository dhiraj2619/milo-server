const mongoose = require("mongoose");

// Audit trail of changes made from the web admin dashboard.
const adminLogSchema = new mongoose.Schema(
  {
    admin: {type: String, required: true, trim: true},
    action: {type: String, required: true, trim: true},
    targetType: {type: String, required: true, trim: true},
    targetId: {type: String, default: null},
    summary: {type: String, default: "", trim: true, maxlength: 300},
    details: {type: mongoose.Schema.Types.Mixed, default: {}},
  },
  {timestamps: true},
);

adminLogSchema.index({createdAt: -1});

module.exports = mongoose.model("AdminLog", adminLogSchema);
