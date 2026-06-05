import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth, type User } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const defaultFirebaseConfig = {
  apiKey: "AIzaSyBR1fV-ECRWjOdDGYtXy5PXUoxhMN3DTiU",
  authDomain: "goal-score-game.firebaseapp.com",
  projectId: "goal-score-game",
  storageBucket: "goal-score-game.firebasestorage.app",
  messagingSenderId: "949476476666",
  appId: "1:949476476666:web:d5c7dd3180de320066eb43",
};

type FirebaseClient = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

let client: FirebaseClient | null | undefined;

function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
    messagingSenderId:
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId,
  };
}

export function hasFirebaseConfig() {
  const config = getFirebaseConfig();

  return Boolean(
    config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.appId,
  );
}

export function getFirebaseClient() {
  if (client !== undefined) {
    return client;
  }

  if (!hasFirebaseConfig()) {
    client = null;
    return client;
  }

  const app = initializeApp(getFirebaseConfig());

  client = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };

  return client;
}

export async function ensureAnonymousUser(auth: Auth): Promise<User> {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  const credential = await signInAnonymously(auth);
  return credential.user;
}
