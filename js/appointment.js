import {
  collection, addDoc, getDocs,
  query, where, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { clinics as fallbackClinics } from "./clinic-data.js";

const urlParams = new URLSearchParams(window.location.search);
const selectedHospitalName = urlParams.get("hospital") || "";
const selectedSpecialty = urlParams.get("specialty") || "";
const selectedClinicDetails = {
  name: selectedHospitalName,
  address: urlParams.get("address") || "",
  phone: urlParams.get("phone") || "",
  rating: Number.parseFloat(urlParams.get("rating") || ""),
  distanceKm: Number.parseFloat(urlParams.get("distanceKm") || ""),
  mapsUrl: urlParams.get("mapsUrl") || "",
  source: urlParams.get("source") || "",
  openNow: urlParams.get("openNow") === "true"
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBookingContext() {
  const contextBox = document.getElementById("booking-context");
  if (!contextBox) return;

  if (!selectedHospitalName && !selectedSpecialty) {
    contextBox.style.display = "none";
    return;
  }

  const hospitalText = selectedHospitalName
    ? `Selected hospital: <strong>${escapeHtml(selectedHospitalName)}</strong>`
    : "";
  const specialtyText = selectedSpecialty
    ? `Recommended specialty: <strong>${escapeHtml(selectedSpecialty)}</strong>`
    : "";

  contextBox.className = "glass-card";
  contextBox.style.display = "block";
  contextBox.style.padding = "1rem 1.25rem";
  contextBox.style.border = "1px solid rgba(45, 212, 191, 0.25)";
  contextBox.style.background = "rgba(45, 212, 191, 0.08)";
  contextBox.innerHTML = `
    <p style="margin:0; color:var(--text-primary);">
      <i class='bx bx-link-alt' style="color:var(--primary);"></i>
      ${hospitalText}${hospitalText && specialtyText ? " &bull; " : ""}${specialtyText}
    </p>
  `;
}

function renderHospitalCards() {
  const grid = document.getElementById("hospital-grid");
  if (!grid) return;

  grid.innerHTML = "";
  const recommendedClinics = [];

  if (selectedHospitalName) {
    recommendedClinics.push({
      name: selectedClinicDetails.name,
      address: selectedClinicDetails.address || "Address not available",
      phone: selectedClinicDetails.phone || "Phone not available",
      rating: Number.isFinite(selectedClinicDetails.rating) ? selectedClinicDetails.rating : 0,
      type: selectedClinicDetails.source || "Recommended clinic",
      status: selectedClinicDetails.openNow ? "Open" : "Check timings",
      mapsUrl: selectedClinicDetails.mapsUrl || ""
    });
  }

  const orderedClinics = recommendedClinics.length > 0
    ? recommendedClinics
    : [...fallbackClinics]
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 6);

  if (recommendedClinics.length === 0) {
    const note = document.createElement("p");
    note.style.color = "var(--text-secondary)";
    note.style.marginBottom = "1rem";
    note.textContent = "Showing fallback clinic cards because no backend-selected clinic was passed into this booking page.";
    grid.appendChild(note);
  }

  orderedClinics.forEach((clinic) => {
    const statusColor = clinic.status === "Open" ? "#16a34a" : "#ef4444";
    const isSelected = clinic.name === selectedHospitalName;
    const card = document.createElement("div");
    card.className = "glass-card";
    card.style.padding = "2rem";
    if (isSelected) {
      card.style.border = "2px solid var(--primary)";
      card.style.boxShadow = "0 20px 50px rgba(45, 212, 191, 0.18)";
    }
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; gap:0.75rem;">
        <h3 style="margin:0;">${clinic.name}</h3>
        <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          ${isSelected ? `<span style="background:var(--primary); color:#fff; padding:2px 10px; border-radius:20px; font-size:0.78rem; font-weight:600;">Recommended</span>` : ""}
          <span style="background:${statusColor}; color:#fff; padding:2px 10px; border-radius:20px; font-size:0.78rem; font-weight:600;">${clinic.status}</span>
        </div>
      </div>
      <p style="margin:0.25rem 0; font-size:0.9rem; color:#94a3b8;"><i class='bx bxs-star' style="color:#facc15;"></i> ${clinic.rating} &bull; ${clinic.type}</p>
      ${selectedSpecialty && isSelected ? `<p style="margin:0.35rem 0; color:var(--primary); font-size:0.9rem; font-weight:600;"><i class='bx bx-user-pin'></i> Best matched for ${escapeHtml(selectedSpecialty)}</p>` : ""}
      <p style="margin:0.5rem 0;"><i class='bx bx-map' style="color: var(--primary);"></i> ${clinic.address}</p>
      <p style="margin:0.5rem 0;"><i class='bx bx-phone' style="color: var(--primary);"></i> ${clinic.phone}</p>
      ${clinic.mapsUrl ? `<p style="margin:0.5rem 0;"><a href="${clinic.mapsUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:none;"><i class='bx bx-map-alt'></i> Open in Maps</a></p>` : ""}
      <button class="btn-primary" style="margin-top:1rem; width:100%;" onclick="openBookingModal('${clinic.name.replace(/'/g, "\\'")}')">Book Appointment</button>
    `;
    grid.appendChild(card);

    if (isSelected) {
      requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderBookingContext();
  renderHospitalCards();
});

window.saveAppointment = async function(hospitalName) {
  const user = auth.currentUser;
  if (!user) { window.location.href = "login.html"; return; }

  const date   = document.getElementById("appt-date").value;
  const time   = document.getElementById("appt-time").value;
  const reason = document.getElementById("appt-reason").value;

  if (!date || !time) {
    alert("Please select a date and time.");
    return;
  }

  const btn = document.getElementById("confirm-appt-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Booking..."; }

  try {
    await addDoc(collection(db, "appointments"), {
      userId:       user.uid,
      patientName:  user.displayName || user.email,
      patientEmail: user.email,
      hospitalName: hospitalName,
      date:         date,
      time:         time,
      reason:       reason || "General consultation",
      status:       "pending",
      createdAt:    Timestamp.now()
    });
    alert("Appointment booked successfully! You will receive a confirmation soon.");
    document.getElementById("appt-date").value   = "";
    document.getElementById("appt-time").value   = "";
    document.getElementById("appt-reason").value = "";
    const modal = document.getElementById("booking-modal");
    if (modal) modal.style.display = "none";
  } catch (err) {
    alert("Booking failed: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Confirm Appointment"; }
  }
};

window.openBookingModal = function(hospitalName) {
  const user = auth.currentUser;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  let modal = document.getElementById("booking-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "booking-modal";
    modal.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,0.6);
      display:flex; align-items:center; justify-content:center;
      z-index:9999; padding:1rem;
    `;
    document.body.appendChild(modal);
  }

  const today = new Date().toISOString().split('T')[0];

  modal.innerHTML = `
    <div style="background:var(--bg-surface); border-radius:var(--radius-xl);
      padding:2rem; width:100%; max-width:480px; border:1px solid var(--border-color);
      box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
        <h3 style="margin:0; color:var(--primary-dark);">Book Appointment</h3>
        <button onclick="document.getElementById('booking-modal').style.display='none'"
          style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:var(--text-secondary);">&times;</button>
      </div>
      <p style="color:var(--text-secondary); margin-bottom:1.5rem; font-size:0.95rem;">
        <i class='bx bx-hospital' style="color:var(--primary);"></i> <strong>${hospitalName}</strong>
      </p>
      ${selectedSpecialty ? `
      <p style="color:var(--primary); margin:-0.75rem 0 1.25rem; font-size:0.9rem; font-weight:600;">
        <i class='bx bx-user-pin'></i> Consultation context: ${escapeHtml(selectedSpecialty)}
      </p>` : ""}
      <div style="margin-bottom:1rem;">
        <label style="display:block; font-weight:600; margin-bottom:0.4rem;">Date</label>
        <input type="date" id="appt-date" min="${today}"
          style="width:100%; padding:0.75rem; border:1px solid var(--border-color);
          border-radius:var(--radius-md); font-family:inherit; outline:none;">
      </div>
      <div style="margin-bottom:1rem;">
        <label style="display:block; font-weight:600; margin-bottom:0.4rem;">Preferred Time</label>
        <select id="appt-time"
          style="width:100%; padding:0.75rem; border:1px solid var(--border-color);
          border-radius:var(--radius-md); font-family:inherit; outline:none; background:var(--bg-surface);">
          <option value="">Select a time slot</option>
          <option>09:00 AM</option><option>09:30 AM</option>
          <option>10:00 AM</option><option>10:30 AM</option>
          <option>11:00 AM</option><option>11:30 AM</option>
          <option>12:00 PM</option><option>02:00 PM</option>
          <option>02:30 PM</option><option>03:00 PM</option>
          <option>03:30 PM</option><option>04:00 PM</option>
          <option>04:30 PM</option><option>05:00 PM</option>
        </select>
      </div>
      <div style="margin-bottom:1.5rem;">
        <label style="display:block; font-weight:600; margin-bottom:0.4rem;">Reason / Symptoms</label>
        <textarea id="appt-reason" rows="3" placeholder="Briefly describe your symptoms or reason for visit..."
          style="width:100%; padding:0.75rem; border:1px solid var(--border-color);
          border-radius:var(--radius-md); font-family:inherit; outline:none;
          resize:vertical; box-sizing:border-box;">${selectedSpecialty ? `Consultation for ${escapeHtml(selectedSpecialty)}` : ""}</textarea>
      </div>
      <button id="confirm-appt-btn" class="btn-primary"
        style="width:100%;"
        onclick="saveAppointment('${hospitalName.replace(/'/g, "\\'")}')">
        Confirm Appointment
      </button>
    </div>
  `;
  modal.style.display = "flex";
};

window.loadMyAppointments = async function() {
  const listEl = document.getElementById("appointments-list");
  if (!listEl) return;

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    listEl.innerHTML = '<p style="color:var(--text-secondary);">Loading appointments...</p>';

    try {
      const q = query(
        collection(db, "appointments"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        listEl.innerHTML = '<p style="color:var(--text-secondary);">No appointments booked yet. <a href="appointment.html" style="color:var(--primary);">Book one now</a>.</p>';
        return;
      }

      listEl.innerHTML = "";
      snap.forEach(docSnap => {
        const a = docSnap.data();
        const statusColor = a.status === 'confirmed' ? '#16a34a' : a.status === 'cancelled' ? '#ef4444' : '#f59e0b';
        listEl.innerHTML += `
          <div class="glass-card" style="padding:1.25rem; margin-bottom:1rem; border-left:4px solid ${statusColor};">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <strong style="font-size:1rem;">${a.hospitalName}</strong><br>
                <span style="color:var(--text-secondary); font-size:0.9rem;">
                  <i class='bx bx-calendar'></i> ${a.date} &nbsp;
                  <i class='bx bx-time'></i> ${a.time}
                </span>
              </div>
              <span style="background:${statusColor}22; color:${statusColor}; padding:3px 10px;
                border-radius:20px; font-size:0.8rem; font-weight:600; text-transform:uppercase;">
                ${a.status}
              </span>
            </div>
            ${a.reason ? `<p style="margin:0.5rem 0 0; color:var(--text-secondary); font-size:0.9rem;">${a.reason}</p>` : ''}
          </div>`;
      });
    } catch (err) {
      listEl.innerHTML = '<p style="color:#ef4444;">Error loading appointments. Please refresh.</p>';
    }
  });
};
