import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyD43GBW9uWnCde5dC34hT1TAMtnLnXwL2Q",
  authDomain: "vitalchatbot-f7ce8.firebaseapp.com",
  projectId: "vitalchatbot-f7ce8",
  storageBucket: "vitalchatbot-f7ce8.firebasestorage.app",
  messagingSenderId: "196933382040",
  appId: "1:196933382040:web:a2ad7e422a59b42c74c5ed",
  measurementId: "G-Y4ZC5KEFDH"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, "asia-south1");

const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
if (isLocalHost) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
