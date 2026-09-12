require("dotenv").config();
const http = require("http");
const express = require("express");
const {
  PORT,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = require("./config/config");
const connectToDB = require("./config/dbconnect");
const cloudinary = require("cloudinary");
const cookieparser = require("cookie-parser");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const { Server } = require("socket.io");
const { getFirebaseAuth } = require("./config/firebaseAdmin");
const User = require("./models/User.model");
const app = express();

const port = PORT;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const activeSocketsByUser = new Map();

connectToDB();

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieparser());
app.use(cors());
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication Required"));
    }

    socket.firebaseUser = await getFirebaseAuth().verifyIdToken(token, true);
    next();
  } catch (error) {
    next(new Error("Invalid session"));
  }
});

io.on("connection", async (socket) => {
  const firebaseUid = socket.firebaseUser.uid;

  if (!activeSocketsByUser.has(firebaseUid)) {
    activeSocketsByUser.set(firebaseUid, new Set());
  }

  activeSocketsByUser.get(firebaseUid).add(socket.id);

  await User.updateOne(
    { firebaseUid },
    { $set: { isOnline: true, lastSeen: null } },
  );

  io.emit("user:presence", {
    firebaseUid,
    isOnline: true,
  });
  socket.on("disconnect", async () => {
    const sockets = activeSocketsByUser.get(firebaseUid);

    sockets?.delete(socket.id);

    if (sockets?.size) {
      return;
    }

    activeSocketsByUser.delete(firebaseUid);

    const lastSeen = new Date();

    await User.updateOne(
      { firebaseUid },
      { $set: { isOnline: false, lastSeen } },
    );

    io.emit("user:presence", {
      firebaseUid,
      isOnline: false,
      lastSeen,
    });
  });
});

app.get("/", (req, res) => {
  res.send(`<center><h1>Server is Started...</h1></center>`);
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
