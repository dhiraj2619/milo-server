const mongoose = require("mongoose");
const { MONGO_URI, MONGODB_NAME } = require("./config");

const connectToDB = async () => {
  try {
    if (!MONGO_URI || !MONGODB_NAME?.trim()) {
      throw new Error("MONGO_URI and MONGODB_NAME are required.");
    }

    await mongoose.connect(MONGO_URI, {
      dbName: MONGODB_NAME.trim(),
    });

    console.log("MongoDB connected", {
      database: mongoose.connection.name,
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error.message);
    throw error;
  }
};

module.exports = connectToDB;
