import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

function showInlineMessage(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
}

const protectedPages = ["dashboard.html", "appointment.html", "clinics.html", "admin.html"];
const currentPage = window.location.pathname.split("/").pop();

if (protectedPages.includes(currentPage)) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "login.html";
    }
  });
}

async function registerUser(name, phone, email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email,
      phone: phone || "",
      role: "patient",
      createdAt: new Date()
    });
    window.location.href = "dashboard.html";
  } catch (err) {
    const errDiv = document.getElementById("server-error");
    if (errDiv) {
      if (err.code === "auth/email-already-in-use") {
        showInlineMessage("server-error", "This email is already registered.");
      } else if (err.code === "auth/weak-password") {
        showInlineMessage("server-error", "Password must be at least 6 characters.");
      } else {
        showInlineMessage("server-error", "Registration could not be completed right now. Please try again.");
      }
    }
  }
}

async function loginUser(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch (err) {
    const errDiv = document.getElementById("server-error");
    if (errDiv) {
      showInlineMessage("server-error", "Invalid email or password. Please try again.");
    }
  }
}

window.logoutUser = async function() {
  await signOut(auth);
  window.location.href = "login.html";
};

document.addEventListener("DOMContentLoaded", () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      let isValid = true;

      const email = document.getElementById("email");
      const password = document.getElementById("password");
      const emailErr = document.getElementById("emailError");
      const passErr = document.getElementById("passwordError");
      const serverErr = document.getElementById("server-error");

      emailErr.style.display = "none";
      passErr.style.display = "none";
      if (serverErr) serverErr.style.display = "none";

      if (!emailRegex.test(email.value)) {
        emailErr.style.display = "block";
        isValid = false;
      }

      if (password.value.trim().length === 0) {
        passErr.style.display = "block";
        isValid = false;
      }

      if (isValid) {
        const btn = loginForm.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Signing in...";
        }
        await loginUser(email.value, password.value);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Sign In";
        }
      }
    });
  }

  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      let isValid = true;

      const name = document.getElementById("full_name");
      const email = document.getElementById("email");
      const phone = document.getElementById("phone");
      const password = document.getElementById("password");
      const confirm = document.getElementById("confirm_password");

      const nameErr = document.getElementById("nameError");
      const emailErr = document.getElementById("emailError");
      const passErr = document.getElementById("passwordError");
      const confErr = document.getElementById("confirmError");

      nameErr.style.display = "none";
      emailErr.style.display = "none";
      passErr.style.display = "none";
      confErr.style.display = "none";

      if (name.value.trim().length < 2) {
        nameErr.style.display = "block";
        isValid = false;
      }

      if (!emailRegex.test(email.value)) {
        emailErr.style.display = "block";
        isValid = false;
      }

      if (password.value.length < 8) {
        passErr.style.display = "block";
        isValid = false;
      }

      if (password.value !== confirm.value) {
        confErr.style.display = "block";
        isValid = false;
      }

      if (isValid) {
        const btn = registerForm.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Creating account...";
        }
        await registerUser(
          name.value.trim(),
          phone ? phone.value.trim() : "",
          email.value,
          password.value
        );
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Register";
        }
      }
    });
  }
});
