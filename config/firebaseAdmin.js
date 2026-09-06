const admin = require("firebase-admin");
const { FIREBASE_PROJECT_ID, FIRBASE_CLIENT_EMAIL, FIREBAESE_PRIVATE_KEY } = require("./config");

function getFirebaseAuth() {
  if (!admin.apps.length) {
    const projectId = FIREBASE_PROJECT_ID;
    const clientEmail =FIRBASE_CLIENT_EMAIL;
    const privateKey = FIREBAESE_PRIVATE_KEY.replace(/\\n/g, "\n");

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({projectId, clientEmail, privateKey}),
      });
    } else {
      admin.initializeApp();
    }
  }

  return admin.auth();
}

module.exports = {getFirebaseAuth};
