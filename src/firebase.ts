import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

// Detect if Firebase has the correct, provisioned credentials or just placeholders
export const isFirebasePlaceholder = !firebaseConfig || firebaseConfig.apiKey === "placeholder" || !firebaseConfig.apiKey;

let app: any = null;
let auth: any = null;
let provider: any = null;

if (!isFirebasePlaceholder) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/spreadsheets");
    provider.addScope("https://www.googleapis.com/auth/drive.file");
  } catch (err) {
    console.error("Failed to initialize Firebase app:", err);
  }
} else {
  console.warn("Firebase config elements are placeholders. Google Sheet synchronization is pending setup.");
}

export { auth, provider };

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!auth) {
    if (onAuthFailure) onAuthFailure();
    return () => {}; // No-op unsubscribe function
  }
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Start Google sign-in workflow
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth || !provider) {
    throw new Error("Google Authentication is not fully initialized. Please initiate Google Workspace setup.");
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    if (!accessToken) {
      throw new Error("Failed to retrieve Google API access token from credentials.");
    }
    cachedAccessToken = accessToken;
    return { user: result.user, accessToken };
  } catch (error) {
    console.error("Authentication Error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Retrieve currently active token (in-memory)
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Logout from Google
export const logout = async () => {
  if (auth) {
    await auth.signOut();
  }
  cachedAccessToken = null;
};
