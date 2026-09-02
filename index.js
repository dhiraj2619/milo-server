require("dotenv").config();
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
const app = express();

const port = PORT;

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

app.get("/", (req, res) => {
  res.send(`<center><h1>Server is Started...</h1></center>`);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
