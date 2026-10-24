const multer = require("multer");
const {v2: cloudinary} = require("cloudinary");

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const FOLDER = "milo/profiles";

// Keeps the upload in memory; it goes straight to Cloudinary (the server's disk is not persistent).
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: MAX_PHOTO_BYTES, files: 1},
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.mimetype)) return cb(null, true);
    return cb(Object.assign(new Error("Please choose a JPG, PNG or WebP photo."), {status: 400}));
  },
}).single("photo");

// Runs multer and turns its errors (too large, wrong type) into a JSON 400.
const receivePhoto = (req, res, next) => photoUpload(req, res, error => {
  if (!error) return next();
  const message = error.code === "LIMIT_FILE_SIZE" ? "That photo is too large. Please use one under 5 MB." : error.message;
  return res.status(400).json({success: false, message});
});

// One photo per user: re-uploading replaces it. Cropped square around the face.
function uploadProfilePhoto(buffer, firebaseUid) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        public_id: firebaseUid,
        overwrite: true,
        invalidate: true,
        resource_type: "image",
        format: "jpg",
        transformation: [{width: 600, height: 600, crop: "fill", gravity: "face", quality: "auto"}],
      },
      (error, result) => (error ? reject(error) : resolve(result.secure_url)),
    );
    stream.end(buffer);
  });
}

function deleteProfilePhoto(firebaseUid) {
  return cloudinary.uploader.destroy(`${FOLDER}/${firebaseUid}`, {invalidate: true}).catch(() => null);
}

module.exports = {receivePhoto, uploadProfilePhoto, deleteProfilePhoto};
