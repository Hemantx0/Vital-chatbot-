import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";

document.addEventListener("DOMContentLoaded", () => {
    const navActions = document.getElementById("home-nav-actions");
    if (!navActions) return;

    const menuToggle = navActions.querySelector("#mobile-menu");

    onAuthStateChanged(auth, (user) => {
        if (!user) return;

        navActions.innerHTML = `
            <a href="dashboard.html" class="btn-outline">Dashboard</a>
            <a href="#" class="btn-primary" id="home-logout-btn">Sign Out</a>
        `;

        if (menuToggle) {
            navActions.appendChild(menuToggle);
        }

        const logoutBtn = document.getElementById("home-logout-btn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", (event) => {
                event.preventDefault();
                signOut(auth).then(() => {
                    window.location.href = "login.html";
                });
            });
        }
    });
});
