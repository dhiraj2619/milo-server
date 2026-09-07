const {getApps, initializeApp, cert} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
} = require("./config");

function getFirebaseAuth() {
  let app = getApps().find(existing => existing.name === "[DEFAULT]");

  if (!app) {
    const credentials = {
      FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY,
    };
    const missing = Object.entries(credentials)
      .filter(([, value]) => typeof value !== "string" || !value.trim())
      .map(([name]) => name);

    if (missing.length) {
      throw new Error(`Missing Firebase Admin configuration: ${missing.join(", ")}`);
    }

    app = initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID.trim(),
        clientEmail: FIREBASE_CLIENT_EMAIL.trim(),
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }

  return getAuth(app);
}

module.exports = {getFirebaseAuth};
