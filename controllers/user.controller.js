const User = require("../models/User.model");

const fields = "nickname phone gender languages status isOnline createdAt avatarSeed avatarStyle photoUrl profileCompleted";
const adminListUsers = async (_req, res) => {
  try {
    const users = await User.find().select(fields).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: { users } });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load users." });
  }
};
const adminBlockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { status: "suspended" }, { new: true }).select(fields);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    return res.json({ success: true, data: { user } });
  } catch { return res.status(400).json({ success: false, message: "Unable to block user." }); }
};
const adminDeleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { status: "banned" }, { new: true }).select(fields);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    return res.json({ success: true, data: { user } });
  } catch { return res.status(400).json({ success: false, message: "Unable to delete user." }); }
};
module.exports = { adminListUsers, adminBlockUser, adminDeleteUser };