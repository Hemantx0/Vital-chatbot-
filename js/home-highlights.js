import { clinics } from "./clinic-data.js";

document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("featured-care-grid");
    if (!grid) return;

    const highlights = clinics
        .filter((clinic) => clinic.status === "Open")
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 6);

    grid.innerHTML = highlights.map((clinic) => {
        const statusClass = clinic.status.toLowerCase();
        const bookingUrl = `appointment.html?hospital=${encodeURIComponent(clinic.name)}`;

        return `
            <article class="featured-care-card">
                <h4>${clinic.name}</h4>
                <div class="care-meta">
                    <span><i class='bx bxs-star' style="color:#f59e0b;"></i> ${clinic.rating}</span>
                    <span>${clinic.type}</span>
                </div>
                <p class="care-address">${clinic.address}</p>
                <div class="care-footer">
                    <span class="care-status ${statusClass}">
                        <i class='bx bxs-circle'></i> ${clinic.status}
                    </span>
                    <a href="${bookingUrl}" class="btn-outline" style="color: var(--primary-dark); border-color: rgba(37, 99, 235, 0.24); padding: 0.55rem 1rem;">
                        Book Now
                    </a>
                </div>
            </article>
        `;
    }).join("");
});
