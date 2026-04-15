import {
  collection,
  getDocs,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { updateAppointmentStatus } from "./appointment-api.js";
import {
  canUserCancelAppointment,
  escapeHtml,
  getAppointmentClinicName,
  getAppointmentDisplayDate,
  getAppointmentDisplayTime,
  getAppointmentStatusMeta
} from "./ui-utils.js";
import { isAdminUser } from "./admin-utils.js";

function getClosedAppointmentCount(appointments) {
  return appointments.filter(({ data }) => ["completed", "cancelled", "rejected"].includes(String(data.status || "").toLowerCase())).length;
}

function getUpcomingAppointmentCount(appointments) {
  return appointments.filter(({ data }) => canUserCancelAppointment(data)).length;
}

function updateMetrics(appointments) {
  const pending = appointments.filter(({ data }) => String(data.status || "").toLowerCase() === "pending").length;
  const confirmed = appointments.filter(({ data }) => String(data.status || "").toLowerCase() === "confirmed").length;
  const upcoming = getUpcomingAppointmentCount(appointments);
  const closed = getClosedAppointmentCount(appointments);

  const metricUpcoming = document.getElementById("metric-upcoming");
  const metricPending = document.getElementById("metric-pending");
  const metricConfirmed = document.getElementById("metric-confirmed");
  const metricClosed = document.getElementById("metric-closed");

  if (metricUpcoming) metricUpcoming.textContent = String(upcoming);
  if (metricPending) metricPending.textContent = String(pending);
  if (metricConfirmed) metricConfirmed.textContent = String(confirmed);
  if (metricClosed) metricClosed.textContent = String(closed);
}

function renderEmptyAppointments(listEl) {
  listEl.innerHTML = `
    <div class="dashboard-empty">
      <div class="dashboard-empty-icon"><i class='bx bx-calendar-x'></i></div>
      <h3>No appointments booked yet</h3>
      <p>Your upcoming visits will appear here once you book care through the assistant or clinic booking flow.</p>
      <a href="appointment.html" class="btn-primary">Book Your First Appointment</a>
    </div>`;
}

function renderLoadingAppointments(listEl) {
  listEl.innerHTML = `
    <div class="dashboard-skeleton-card">
      <div class="skeleton-line" style="width:38%;"></div>
      <div class="skeleton-line" style="width:22%; margin-top:12px;"></div>
      <div class="appointment-meta-grid" style="margin-top:16px;">
        <div class="appointment-meta-card"><div class="skeleton-line" style="width:70%;"></div><div class="skeleton-line" style="width:58%; margin-top:10px;"></div></div>
        <div class="appointment-meta-card"><div class="skeleton-line" style="width:66%;"></div><div class="skeleton-line" style="width:54%; margin-top:10px;"></div></div>
        <div class="appointment-meta-card"><div class="skeleton-line" style="width:64%;"></div><div class="skeleton-line" style="width:48%; margin-top:10px;"></div></div>
      </div>
    </div>
    <div class="dashboard-skeleton-card">
      <div class="skeleton-line" style="width:42%;"></div>
      <div class="skeleton-line" style="width:26%; margin-top:12px;"></div>
      <div class="appointment-meta-grid" style="margin-top:16px;">
        <div class="appointment-meta-card"><div class="skeleton-line" style="width:72%;"></div><div class="skeleton-line" style="width:56%; margin-top:10px;"></div></div>
        <div class="appointment-meta-card"><div class="skeleton-line" style="width:68%;"></div><div class="skeleton-line" style="width:52%; margin-top:10px;"></div></div>
        <div class="appointment-meta-card"><div class="skeleton-line" style="width:60%;"></div><div class="skeleton-line" style="width:44%; margin-top:10px;"></div></div>
      </div>
    </div>`;
}

function renderAppointmentsError(listEl, message) {
  listEl.innerHTML = `
    <div class="state-card state-card--error">
      <div class="state-card-icon"><i class='bx bx-error-circle'></i></div>
      <h3>Unable to load appointments</h3>
      <p>${escapeHtml(message || "Please refresh the page or try again in a moment.")}</p>
      <button type="button" class="btn-outline" onclick="window.location.reload()">Retry</button>
    </div>`;
}

function renderAppointmentList(listEl, appointments) {
  listEl.innerHTML = "";

  appointments.forEach(({ id, data }) => {
    const statusMeta = getAppointmentStatusMeta(data.status);
    const clinicName = getAppointmentClinicName(data);
    const specialty = data.specialty
      ? `<span class="chip chip--secondary">${escapeHtml(data.specialty)}</span>`
      : "";
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : "";
    const cancelAction = canUserCancelAppointment(data)
      ? `<button class="btn-outline dashboard-cancel-btn" data-id="${id}" style="margin-top:0.9rem;">Cancel Appointment</button>`
      : "";

    listEl.innerHTML += `
      <article class="appointment-item" style="border-left:4px solid ${statusMeta.color};">
        <div class="appointment-item-main">
          <div class="appointment-item-top">
            <div>
              <div class="appointment-clinic">${escapeHtml(clinicName)}</div>
              ${specialty ? `<div class="appointment-specialty">${specialty}</div>` : ""}
            </div>
            <span class="${statusMeta.className}">
              ${escapeHtml(statusMeta.label)}
            </span>
          </div>
          <div class="appointment-meta-grid">
            <div class="appointment-meta-card">
              <div class="appointment-meta-label">Appointment date</div>
              <div class="appointment-meta-value">${escapeHtml(getAppointmentDisplayDate(data))}</div>
            </div>
            <div class="appointment-meta-card">
              <div class="appointment-meta-label">Time slot</div>
              <div class="appointment-meta-value">${escapeHtml(getAppointmentDisplayTime(data))}</div>
            </div>
            <div class="appointment-meta-card">
              <div class="appointment-meta-label">Visit status</div>
              <div class="appointment-meta-value">${escapeHtml(statusMeta.label)}</div>
            </div>
          </div>
          ${data.reason ? `<p style="margin:0; color:var(--text-secondary); font-size:0.95rem;">${escapeHtml(data.reason)}</p>` : ""}
        </div>
        <div class="appointment-item-side">
          ${createdAt ? `<div class="appointment-booked-note">Booked on ${escapeHtml(createdAt)}</div>` : "<div></div>"}
          ${cancelAction}
        </div>
      </article>`;
  });
}

function bindCancelActions(listEl) {
  listEl.querySelectorAll(".dashboard-cancel-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await updateAppointmentStatus({
          appointmentId: button.dataset.id,
          status: "cancelled"
        });
        button.disabled = true;
        button.textContent = "Cancelled";
        window.location.reload();
      } catch (error) {
        alert(error.message || "Unable to cancel appointment.");
      }
    });
  });
}

async function loadAppointments(user) {
  const listEl = document.getElementById("appointments-list");
  if (!listEl) return;
  renderLoadingAppointments(listEl);

  try {
    const appointmentsQuery = query(
      collection(db, "appointments"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(appointmentsQuery);

    if (snap.empty) {
      updateMetrics([]);
      renderEmptyAppointments(listEl);
      return;
    }

    const appointments = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      data: docSnap.data()
    }));

    updateMetrics(appointments);
    renderAppointmentList(listEl, appointments);
    bindCancelActions(listEl);
  } catch (error) {
    renderAppointmentsError(listEl, "Your dashboard could not load appointment data right now.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const userName = document.getElementById("user-name");
    if (userName) {
      userName.textContent = user.displayName || user.email;
    }

    const adminCard = document.getElementById("admin-review-card");
    if (adminCard) {
      adminCard.style.display = await isAdminUser(user) ? "block" : "none";
    }

    await loadAppointments(user);
  });
});
