import {
  collection, addDoc, getDocs,
  query, where, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { clinics as fallbackClinics } from "./clinic-data.js";
import { escapeHtml, getAppointmentStatusMeta } from "./ui-utils.js";
import { getSelectedClinic, normalizeClinic, saveSelectedClinic } from "./clinic-utils.js";

const urlParams = new URLSearchParams(window.location.search);
const urlSpecialty = urlParams.get("specialty") || "";
let selectedClinic = getInitialSelectedClinic();
let selectedSpecialty = selectedClinic?.specialtyMatched || urlSpecialty || "";
let displayClinics = [];

function buildMapsUrl(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function getLegacySelectedClinicFromUrl() {
  const hospitalName = urlParams.get("hospital") || "";
  const address = urlParams.get("address") || "";
  const mapsUrl = urlParams.get("mapsUrl") || "";

  if (!hospitalName && !address && !mapsUrl) {
    return null;
  }

  const lat = Number.parseFloat(urlParams.get("lat") || "");
  const lng = Number.parseFloat(urlParams.get("lng") || "");
  return normalizeClinic({
    source: urlParams.get("source") || "legacy_query",
    name: hospitalName || "Selected clinic",
    address,
    mapsUrl,
    phone: urlParams.get("phone") || "",
    rating: Number.parseFloat(urlParams.get("rating") || ""),
    distanceKm: Number.parseFloat(urlParams.get("distanceKm") || ""),
    openNow: urlParams.get("openNow") === "true",
    lat,
    lng,
    specialtyMatched: urlSpecialty,
    searchContext: urlParams.get("searchContext") || ""
  });
}

function getInitialSelectedClinic() {
  const storedClinic = getSelectedClinic();
  if (storedClinic) {
    return storedClinic;
  }

  const legacyClinic = getLegacySelectedClinicFromUrl();
  if (legacyClinic) {
    saveSelectedClinic(legacyClinic);
    return legacyClinic;
  }

  return null;
}

function getFallbackDisplayClinics() {
  return [...fallbackClinics]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 6)
    .map((clinic) => normalizeClinic({
      ...clinic,
      source: "fallback_local",
      mapsUrl: buildMapsUrl(clinic.lat, clinic.lng),
      openNow: clinic.status === "Open"
    }));
}

function getClinicStatus(clinic) {
  return clinic.openNow === true ? "Open" : "Check timings";
}

function getClinicType(clinic) {
  return clinic.source === "openstreetmap"
    ? "Nearby clinic"
    : clinic.source === "fallback_local"
      ? "Fallback clinic"
      : clinic.source || "Recommended clinic";
}

function getSelectedClinicForBooking(clinicId) {
  return displayClinics.find((clinic) => clinic.clinicId === clinicId)
    || (selectedClinic?.clinicId === clinicId ? selectedClinic : null)
    || selectedClinic
    || null;
}

function renderBookingContext() {
  const contextBox = document.getElementById("booking-context");
  if (!contextBox) return;

  contextBox.className = "glass-card";
  contextBox.style.display = "block";
  contextBox.style.padding = "1rem 1.25rem";
  contextBox.style.border = "1px solid rgba(45, 212, 191, 0.25)";
  contextBox.style.background = "rgba(45, 212, 191, 0.08)";

  if (selectedClinic) {
    const specialtyText = selectedSpecialty
      ? ` &bull; Specialty: <strong>${escapeHtml(selectedSpecialty)}</strong>`
      : "";
    const searchContextText = selectedClinic.searchContext
      ? `<div style="margin-top:0.35rem; color:var(--text-secondary); font-size:0.9rem;">Search context: ${escapeHtml(selectedClinic.searchContext)}</div>`
      : "";

    contextBox.innerHTML = `
      <p style="margin:0; color:var(--text-primary);">
        <i class='bx bx-link-alt' style="color:var(--primary);"></i>
        Selected clinic: <strong>${escapeHtml(selectedClinic.name)}</strong>${specialtyText}
      </p>
      ${searchContextText}
    `;
    return;
  }

  contextBox.innerHTML = `
    <p style="margin:0; color:var(--text-primary);">
      <i class='bx bx-info-circle' style="color:var(--primary);"></i>
      No clinic was selected from the search flow. You can still browse fallback clinic cards below, or go back to the chatbot to book from a search result.
    </p>
  `;
}

function renderHospitalCards() {
  const grid = document.getElementById("hospital-grid");
  if (!grid) return;

  grid.innerHTML = "";
  displayClinics = selectedClinic ? [selectedClinic] : getFallbackDisplayClinics();

  if (!selectedClinic) {
    const note = document.createElement("p");
    note.style.color = "var(--text-secondary)";
    note.style.marginBottom = "1rem";
    note.textContent = "Showing fallback clinic cards because no selected clinic object was available in local storage.";
    grid.appendChild(note);
  }

  displayClinics.forEach((clinic) => {
    const statusLabel = getClinicStatus(clinic);
    const statusColor = clinic.openNow === true ? "#16a34a" : "#64748b";
    const isSelected = selectedClinic?.clinicId === clinic.clinicId;
    const card = document.createElement("div");
    card.className = "glass-card";
    card.style.padding = "2rem";

    if (isSelected) {
      card.style.border = "2px solid var(--primary)";
      card.style.boxShadow = "0 20px 50px rgba(45, 212, 191, 0.18)";
    }

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; gap:0.75rem;">
        <h3 style="margin:0;">${escapeHtml(clinic.name)}</h3>
        <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          ${isSelected ? `<span style="background:var(--primary); color:#fff; padding:2px 10px; border-radius:20px; font-size:0.78rem; font-weight:600;">Selected</span>` : ""}
          <span style="background:${statusColor}; color:#fff; padding:2px 10px; border-radius:20px; font-size:0.78rem; font-weight:600;">${statusLabel}</span>
        </div>
      </div>
      <p style="margin:0.25rem 0; font-size:0.9rem; color:#94a3b8;"><i class='bx bxs-star' style="color:#facc15;"></i> ${clinic.rating ?? "N/A"} &bull; ${escapeHtml(getClinicType(clinic))}</p>
      ${clinic.specialtyMatched ? `<p style="margin:0.35rem 0; color:var(--primary); font-size:0.9rem; font-weight:600;"><i class='bx bx-user-pin'></i> Best matched for ${escapeHtml(clinic.specialtyMatched)}</p>` : ""}
      <p style="margin:0.5rem 0;"><i class='bx bx-map' style="color: var(--primary);"></i> ${escapeHtml(clinic.address)}</p>
      <p style="margin:0.5rem 0;"><i class='bx bx-phone' style="color: var(--primary);"></i> ${escapeHtml(clinic.phone || "Phone not available")}</p>
      ${clinic.mapsUrl ? `<p style="margin:0.5rem 0;"><a href="${clinic.mapsUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:none;"><i class='bx bx-map-alt'></i> Open in Maps</a></p>` : ""}
      <button class="btn-primary" style="margin-top:1rem; width:100%;" onclick="openBookingModal('${clinic.clinicId}')">Book Appointment</button>
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

window.saveAppointment = async function(clinicId) {
  const user = auth.currentUser;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const clinic = getSelectedClinicForBooking(clinicId);
  if (!clinic) {
    alert("Please select a clinic again from the chatbot or clinic cards before booking.");
    window.location.href = "chatbot.html";
    return;
  }

  const date = document.getElementById("appt-date").value;
  const time = document.getElementById("appt-time").value;
  const reason = document.getElementById("appt-reason").value;

  if (!date || !time) {
    alert("Please select a date and time.");
    return;
  }

  const btn = document.getElementById("confirm-appt-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Booking...";
  }

  const specialty = selectedSpecialty || clinic.specialtyMatched || "General consultation";

  try {
    await addDoc(collection(db, "appointments"), {
      userId: user.uid,
      patientName: user.displayName || user.email,
      patientEmail: user.email,
      hospitalName: clinic.name,
      clinicId: clinic.clinicId,
      clinic: {
        clinicId: clinic.clinicId,
        source: clinic.source,
        name: clinic.name,
        address: clinic.address,
        lat: clinic.lat,
        lng: clinic.lng,
        mapsUrl: clinic.mapsUrl
      },
      specialty,
      date,
      time,
      reason: reason || `Consultation for ${specialty}`,
      status: "pending",
      createdAt: Timestamp.now()
    });

    saveSelectedClinic(clinic);
    alert("Appointment booked successfully! You will receive a confirmation soon.");
    document.getElementById("appt-date").value = "";
    document.getElementById("appt-time").value = "";
    document.getElementById("appt-reason").value = "";

    const modal = document.getElementById("booking-modal");
    if (modal) modal.style.display = "none";
  } catch (err) {
    alert("Booking failed: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Confirm Appointment";
    }
  }
};

window.openBookingModal = function(clinicId) {
  const user = auth.currentUser;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const clinic = getSelectedClinicForBooking(clinicId);
  if (!clinic) {
    alert("Clinic details are missing. Please return to the chatbot or home page and choose a clinic again.");
    return;
  }

  if (!selectedClinic || selectedClinic.clinicId !== clinic.clinicId) {
    selectedClinic = clinic;
    selectedSpecialty = selectedSpecialty || clinic.specialtyMatched || "";
    saveSelectedClinic(clinic);
    renderBookingContext();
    renderHospitalCards();
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

  const today = new Date().toISOString().split("T")[0];
  const specialty = selectedSpecialty || clinic.specialtyMatched || "";

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
        <i class='bx bx-hospital' style="color:var(--primary);"></i> <strong>${escapeHtml(clinic.name)}</strong>
      </p>
      ${specialty ? `
      <p style="color:var(--primary); margin:-0.75rem 0 1.25rem; font-size:0.9rem; font-weight:600;">
        <i class='bx bx-user-pin'></i> Consultation context: ${escapeHtml(specialty)}
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
          resize:vertical; box-sizing:border-box;">${specialty ? `Consultation for ${escapeHtml(specialty)}` : ""}</textarea>
      </div>
      <button id="confirm-appt-btn" class="btn-primary"
        style="width:100%;"
        onclick="saveAppointment('${clinic.clinicId}')">
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
      snap.forEach((docSnap) => {
        const appointment = docSnap.data();
        const statusMeta = getAppointmentStatusMeta(appointment.status);
        const clinicName = appointment.clinic?.name || appointment.hospitalName || "Clinic not available";
        const specialty = appointment.specialty
          ? `<p style="margin:0.35rem 0 0; color:var(--primary); font-size:0.85rem;">${escapeHtml(appointment.specialty)}</p>`
          : "";

        listEl.innerHTML += `
          <div class="glass-card" style="padding:1.25rem; margin-bottom:1rem; border-left:4px solid ${statusMeta.color};">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <strong style="font-size:1rem;">${escapeHtml(clinicName)}</strong><br>
                <span style="color:var(--text-secondary); font-size:0.9rem;">
                  <i class='bx bx-calendar'></i> ${escapeHtml(appointment.date || "-")} &nbsp;
                  <i class='bx bx-time'></i> ${escapeHtml(appointment.time || "-")}
                </span>
                ${specialty}
              </div>
              <span style="background:${statusMeta.color}22; color:${statusMeta.color}; padding:3px 10px;
                border-radius:20px; font-size:0.8rem; font-weight:600; text-transform:uppercase;">
                ${statusMeta.label}
              </span>
            </div>
            ${appointment.reason ? `<p style="margin:0.5rem 0 0; color:var(--text-secondary); font-size:0.9rem;">${escapeHtml(appointment.reason)}</p>` : ""}
          </div>`;
      });
    } catch (err) {
      listEl.innerHTML = '<p style="color:#ef4444;">Error loading appointments. Please refresh.</p>';
    }
  });
};
