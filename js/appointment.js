import { auth } from "./firebase.js";
import { clinics as fallbackClinics } from "./clinic-data.js";
import { bookAppointment, getClinicSlots } from "./appointment-api.js";
import { escapeHtml } from "./ui-utils.js";
import { getSelectedClinic, normalizeClinic, saveSelectedClinic } from "./clinic-utils.js";

const urlParams = new URLSearchParams(window.location.search);
const urlSpecialty = urlParams.get("specialty") || "";
let selectedClinic = getInitialSelectedClinic();
let selectedSpecialty = selectedClinic?.specialtyMatched || urlSpecialty || "";
let displayClinics = [];
let currentSlotOptions = [];
let selectedSlotIdValue = "";

function showPageToast(message, type = "info") {
  const existing = document.querySelector(".page-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `page-toast page-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

function setBookingFeedback(message, type = "info") {
  const banner = document.getElementById("booking-success-banner");
  if (!banner) return;

  banner.className = type === "success"
    ? "booking-success-banner"
    : `booking-feedback-banner booking-feedback-banner--${type}`;
  banner.innerHTML = message;
  banner.style.display = "block";
}

function clearBookingFeedback() {
  const banner = document.getElementById("booking-success-banner");
  if (!banner) return;
  banner.style.display = "none";
  banner.className = "booking-success-banner";
  banner.innerHTML = "";
}

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

function getClinicSourceChipClass(clinic) {
  if (clinic.source === "openstreetmap") {
    return "chip chip--info";
  }

  if (clinic.source === "fallback_local") {
    return "chip chip--neutral";
  }

  return "chip";
}

function getSelectedClinicForBooking(clinicId) {
  return displayClinics.find((clinic) => clinic.clinicId === clinicId)
    || (selectedClinic?.clinicId === clinicId ? selectedClinic : null)
    || selectedClinic
    || null;
}

function getBookingSource(clinic) {
  if (clinic?.searchContext || clinic?.specialtyMatched) {
    return "chatbot_recommendation";
  }

  return clinic?.source === "fallback_local" ? "featured_clinic" : "direct_booking";
}

async function loadAvailableSlots(clinic, appointmentDate) {
  const timeSelect = document.getElementById("appt-time");
  const slotNote = document.getElementById("appt-slot-note");
  const slotGrid = document.getElementById("appt-slot-grid");
  if (!timeSelect || !slotNote) return;

  currentSlotOptions = [];
  selectedSlotIdValue = "";
  timeSelect.innerHTML = '<option value="">Loading slots...</option>';
  timeSelect.disabled = true;
  if (slotGrid) {
    slotGrid.innerHTML = `
      <button class="slot-chip slot-chip--placeholder skeleton-chip" disabled></button>
      <button class="slot-chip slot-chip--placeholder skeleton-chip" disabled></button>
      <button class="slot-chip slot-chip--placeholder skeleton-chip" disabled></button>`;
  }
  slotNote.textContent = "Checking live slot availability...";

  if (!appointmentDate) {
    timeSelect.innerHTML = '<option value="">Select a date first</option>';
    if (slotGrid) {
      slotGrid.innerHTML = '<button class="slot-chip" disabled>Select a date first</button>';
    }
    slotNote.textContent = "Choose a date to load available slots.";
    return;
  }

  try {
    const result = await getClinicSlots({
      clinic,
      appointmentDate
    });

    const slots = Array.isArray(result?.slots) ? result.slots : [];
    currentSlotOptions = slots;
    if (slots.length === 0) {
      timeSelect.innerHTML = '<option value="">No slots available</option>';
      timeSelect.disabled = true;
      if (slotGrid) {
        slotGrid.innerHTML = '<button class="slot-chip slot-chip--placeholder" disabled>No slots available for this date</button>';
      }
      slotNote.textContent = "No available slots for this date. Please choose another date.";
      return;
    }

    timeSelect.innerHTML = '<option value="">Select a time slot</option>';
    slots.forEach((slot) => {
      const option = document.createElement("option");
      option.value = slot.slotId;
      option.textContent = `${slot.slotTime} (${slot.capacity - slot.bookedCount} left)`;
      timeSelect.appendChild(option);
    });
    timeSelect.disabled = false;
    if (slotGrid) {
      slotGrid.innerHTML = "";
      slots.forEach((slot) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "slot-chip";
        button.textContent = `${slot.slotTime} (${slot.capacity - slot.bookedCount} left)`;
        button.addEventListener("click", () => {
          selectedSlotIdValue = slot.slotId;
          timeSelect.value = slot.slotId;
          [...slotGrid.querySelectorAll(".slot-chip")].forEach((chip) => chip.classList.remove("selected"));
          button.classList.add("selected");
          slotNote.textContent = `${slot.slotTime} selected for ${appointmentDate}.`;
          updateBookingSummary(clinic);
        });
        slotGrid.appendChild(button);
      });
    }
    slotNote.textContent = `${slots.length} slots available for this date.`;
  } catch (error) {
    timeSelect.innerHTML = '<option value="">Unable to load slots</option>';
    timeSelect.disabled = true;
    if (slotGrid) {
      slotGrid.innerHTML = '<button class="slot-chip slot-chip--placeholder" disabled>Unable to load slots right now</button>';
    }
    slotNote.textContent = "Unable to load available slots right now. Please try another date or retry shortly.";
  }
}

function renderBookingContext() {
  const contextBox = document.getElementById("booking-context");
  if (!contextBox) return;

  contextBox.className = "selected-clinic-card";
  contextBox.style.display = "block";

  if (selectedClinic) {
    contextBox.innerHTML = `
      <div class="selected-clinic-top">
        <div>
          <div class="selected-clinic-name">${escapeHtml(selectedClinic.name)}</div>
          <div class="selected-clinic-meta">
            ${selectedSpecialty ? `<span class="chip chip--secondary"><i class='bx bx-user-pin'></i> ${escapeHtml(selectedSpecialty)}</span>` : ""}
            <span class="${getClinicSourceChipClass(selectedClinic)}">${escapeHtml(getClinicType(selectedClinic))}</span>
            ${selectedClinic.openNow === true ? '<span class="status-badge status-badge--success">Open</span>' : '<span class="status-badge status-badge--neutral">Check timings</span>'}
          </div>
        </div>
        <button class="btn-primary" type="button" onclick="openBookingModal('${selectedClinic.clinicId}')">Schedule Now</button>
      </div>
      <div class="selected-clinic-details">
        <div class="selected-clinic-detail">
          <div class="selected-clinic-detail-label">Address</div>
          <div class="selected-clinic-detail-value">${escapeHtml(selectedClinic.address || "Address not available")}</div>
        </div>
        <div class="selected-clinic-detail">
          <div class="selected-clinic-detail-label">Search Context</div>
          <div class="selected-clinic-detail-value">${escapeHtml(selectedClinic.searchContext || "Clinic selected from current care journey")}</div>
        </div>
      </div>
      ${selectedClinic.mapsUrl ? `<p style="margin-top:14px;"><a href="${selectedClinic.mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-outline"><i class='bx bx-map-alt'></i> Open in Maps</a></p>` : ""}
    `;
    return;
  }

  contextBox.innerHTML = `
    <div class="dashboard-empty">
      <div class="dashboard-empty-icon"><i class='bx bx-info-circle'></i></div>
      <h3>No clinic selected yet</h3>
      <p>You can still browse fallback clinic cards below, or go back to the chatbot to continue from a specialist recommendation.</p>
      <a href="chatbot.html" class="btn-outline">Return to Assistant</a>
    </div>
  `;
}

function renderHospitalCards() {
  const grid = document.getElementById("hospital-grid");
  if (!grid) return;

  grid.innerHTML = "";
  displayClinics = selectedClinic ? [selectedClinic] : getFallbackDisplayClinics();

  if (!selectedClinic) {
    const note = document.createElement("p");
    note.className = "booking-note";
    note.style.marginBottom = "1rem";
    note.textContent = "Showing fallback clinic cards because no selected clinic object was available in local storage.";
    grid.appendChild(note);
  }

  displayClinics.forEach((clinic) => {
    const statusLabel = getClinicStatus(clinic);
    const statusClass = clinic.openNow === true
      ? "status-badge status-badge--success"
      : "status-badge status-badge--neutral";
    const isSelected = selectedClinic?.clinicId === clinic.clinicId;
    const card = document.createElement("div");
    card.className = "glass-card";
    card.style.padding = "1.5rem";

    if (isSelected) {
      card.style.border = "2px solid var(--primary)";
      card.style.boxShadow = "0 18px 40px rgba(15, 76, 129, 0.16)";
    }

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; gap:0.75rem;">
        <h3 style="margin:0;">${escapeHtml(clinic.name)}</h3>
        <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          ${isSelected ? `<span class="chip">Selected</span>` : ""}
          <span class="${statusClass}">${statusLabel}</span>
        </div>
      </div>
      <div class="meta-chips" style="margin:0.35rem 0 0.7rem;">
        <span class="${getClinicSourceChipClass(clinic)}">${escapeHtml(getClinicType(clinic))}</span>
        <span class="chip chip--neutral"><i class='bx bxs-star' style="color:#facc15;"></i> ${clinic.rating ?? "N/A"}</span>
        ${clinic.specialtyMatched ? `<span class="chip chip--secondary"><i class='bx bx-user-pin'></i> ${escapeHtml(clinic.specialtyMatched)}</span>` : ""}
      </div>
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

function updateBookingSummary(clinic) {
  const summarySlot = document.getElementById("booking-summary-slot");
  const summaryDate = document.getElementById("booking-summary-date");
  const summaryClinic = document.getElementById("booking-summary-clinic");
  const dateValue = document.getElementById("appt-date")?.value || "Not selected";
  const slotValue = currentSlotOptions.find((slot) => slot.slotId === (selectedSlotIdValue || document.getElementById("appt-time")?.value))?.slotTime || "Not selected";

  if (summaryClinic) summaryClinic.textContent = clinic?.name || "Not selected";
  if (summaryDate) summaryDate.textContent = dateValue;
  if (summarySlot) summarySlot.textContent = slotValue;
}

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
  const slotId = selectedSlotIdValue || document.getElementById("appt-time").value;
  const reason = document.getElementById("appt-reason").value;

  if (!date || !slotId) {
    setBookingFeedback("<i class='bx bx-error-circle'></i> Please select a date and an available slot before confirming.", "error");
    return;
  }

  const btn = document.getElementById("confirm-appt-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Booking...";
  }

  const specialty = selectedSpecialty || clinic.specialtyMatched || "General consultation";

  try {
    const response = await bookAppointment({
      clinic,
      appointmentDate: date,
      slotId,
      specialty,
      reason,
      bookingSource: getBookingSource(clinic),
      patientName: user.displayName || user.email,
      patientEmail: user.email
    });

    saveSelectedClinic(clinic);
    document.getElementById("appt-date").value = "";
    document.getElementById("appt-time").value = "";
    document.getElementById("appt-reason").value = "";
    selectedSlotIdValue = "";
    renderBookingContext();
    renderHospitalCards();

    const successBanner = document.getElementById("booking-success-banner");
    if (successBanner) {
      setBookingFeedback(`<i class='bx bx-check-circle'></i> Appointment requested for ${escapeHtml(response.slotTime)} on ${escapeHtml(date)} with ${escapeHtml(clinic.name)}.`, "success");
    } else {
      showPageToast(`Appointment requested for ${response.slotTime}.`, "success");
    }
  } catch (err) {
    setBookingFeedback("<i class='bx bx-error-circle'></i> Booking could not be completed right now. Please review the slot and try again.", "error");
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
    modal.className = "booking-modal-overlay";
    document.body.appendChild(modal);
  }

  const today = new Date().toISOString().split("T")[0];
  const specialty = selectedSpecialty || clinic.specialtyMatched || "";

  modal.innerHTML = `
    <div class="booking-modal-card">
      <div class="booking-modal-header">
        <div>
          <span class="page-kicker"><i class='bx bx-calendar-plus'></i> Appointment Scheduler</span>
          <h3 style="margin:12px 0 0; color:var(--primary-dark);">Book Appointment</h3>
          <p style="margin-top:8px;">Choose a live slot and confirm your clinic visit.</p>
        </div>
        <button class="booking-close-btn" onclick="document.getElementById('booking-modal').style.display='none'">&times;</button>
      </div>
      <div class="booking-modal-grid">
        <section class="booking-clinic-panel">
          <div class="selected-clinic-name">${escapeHtml(clinic.name)}</div>
          <div class="selected-clinic-meta">
            ${specialty ? `<span class="chip chip--secondary"><i class='bx bx-user-pin'></i> ${escapeHtml(specialty)}</span>` : ""}
            <span class="${getClinicSourceChipClass(clinic)}">${escapeHtml(getClinicType(clinic))}</span>
          </div>
          <div class="selected-clinic-details">
            <div class="selected-clinic-detail">
              <div class="selected-clinic-detail-label">Address</div>
              <div class="selected-clinic-detail-value">${escapeHtml(clinic.address || "Address not available")}</div>
            </div>
            <div class="selected-clinic-detail">
              <div class="selected-clinic-detail-label">Contact</div>
              <div class="selected-clinic-detail-value">${escapeHtml(clinic.phone || "Phone not available")}</div>
            </div>
          </div>
          <div class="booking-summary-panel" style="margin-top:18px;">
            <strong>Booking summary</strong>
            <div class="booking-summary-grid">
              <div class="booking-summary-item">
                <div class="booking-summary-item-label">Clinic</div>
                <div class="booking-summary-item-value" id="booking-summary-clinic">${escapeHtml(clinic.name)}</div>
              </div>
              <div class="booking-summary-item">
                <div class="booking-summary-item-label">Specialty</div>
                <div class="booking-summary-item-value">${escapeHtml(specialty || "General consultation")}</div>
              </div>
              <div class="booking-summary-item">
                <div class="booking-summary-item-label">Date</div>
                <div class="booking-summary-item-value" id="booking-summary-date">Not selected</div>
              </div>
              <div class="booking-summary-item">
                <div class="booking-summary-item-label">Slot</div>
                <div class="booking-summary-item-value" id="booking-summary-slot">Not selected</div>
              </div>
            </div>
            ${clinic.mapsUrl ? `<p style="margin-top:14px;"><a href="${clinic.mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-outline"><i class='bx bx-map-alt'></i> Open in Maps</a></p>` : ""}
          </div>
        </section>

        <section class="booking-form-panel">
          <div class="booking-form-stack">
            <div class="booking-inline-grid">
              <div class="booking-field-group">
                <label for="appt-date">Appointment date</label>
                <input type="date" id="appt-date" min="${today}">
              </div>
              <div class="booking-field-group">
                <label for="appt-time">Slot selection</label>
                <select id="appt-time" disabled>
                  <option value="">Select a date first</option>
                </select>
              </div>
            </div>

            <div class="slot-selection-panel">
              <strong>Available time slots</strong>
              <div id="appt-slot-grid" class="slot-grid">
                <button class="slot-chip" type="button" disabled>Select a date first</button>
              </div>
              <p id="appt-slot-note" class="slot-note">Choose a date to load available slots.</p>
            </div>

            <div class="booking-inline-grid">
              <div class="booking-field-group">
                <label for="appt-patient-name">Patient name</label>
                <input type="text" id="appt-patient-name" value="${escapeHtml(user.displayName || user.email)}" readonly>
              </div>
              <div class="booking-field-group">
                <label for="appt-patient-email">Patient email</label>
                <input type="email" id="appt-patient-email" value="${escapeHtml(user.email || "")}" readonly>
              </div>
            </div>

            <div class="booking-field-group">
              <label for="appt-reason">Reason / Symptoms</label>
              <textarea id="appt-reason" rows="4" placeholder="Briefly describe your symptoms or reason for visit...">${specialty ? `Consultation for ${escapeHtml(specialty)}` : ""}</textarea>
            </div>

            <div id="booking-success-banner" class="booking-success-banner" style="display:none;"></div>

            <button id="confirm-appt-btn" class="btn-primary"
              onclick="saveAppointment('${clinic.clinicId}')">
              Confirm Appointment
            </button>
          </div>
        </section>
      </div>
    </div>
  `;
  modal.style.display = "flex";
  clearBookingFeedback();

  const dateInput = document.getElementById("appt-date");
  if (dateInput) {
    dateInput.addEventListener("change", () => {
      selectedSlotIdValue = "";
      updateBookingSummary(clinic);
      loadAvailableSlots(clinic, dateInput.value);
    });
    dateInput.value = today;
    updateBookingSummary(clinic);
    loadAvailableSlots(clinic, today);
  }
};
