import {
  collection, getDocs, updateDoc,
  doc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { db, auth } from "./firebase.js";
import {
  escapeHtml,
  getAppointmentClinicName,
  getAppointmentDateTimeLabel,
  getAppointmentStatusMeta
} from "./ui-utils.js";
import { updateAppointmentStatus } from "./appointment-api.js";
import { isAdminUser } from "./admin-utils.js";

function showToast(message, type = 'info') {
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `admin-toast page-toast page-toast--${type === 'success' ? 'success' : type === 'error' ? 'error' : 'info'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 240);
  }, 2500);
}

function formatTimestamp(value) {
  if (!value) return '-';
  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString();
  }
  return String(value);
}

function isPermissionError(error) {
  return error && (
    error.code === "permission-denied" ||
    String(error.message || "").toLowerCase().includes("insufficient permissions")
  );
}

function renderAppointmentActions(appointmentId, status) {
  if (status === "pending") {
    return `
      <div class="admin-actions">
        <button class="btn-secondary" onclick="updateStatus('${appointmentId}','confirmed')">Confirm</button>
        <button class="btn-danger" onclick="updateStatus('${appointmentId}','rejected')">Reject</button>
        <button class="btn-outline" onclick="updateStatus('${appointmentId}','cancelled')">Cancel</button>
      </div>
    `;
  }

  if (status === "confirmed") {
    return `
      <div class="admin-actions">
        <button class="btn-primary" onclick="updateStatus('${appointmentId}','completed')">Complete</button>
        <button class="btn-outline" onclick="updateStatus('${appointmentId}','cancelled')">Cancel</button>
      </div>
    `;
  }

  return `
    <span class="admin-muted-note" style="font-weight:600;">
      Finalized
    </span>
  `;
}

async function updateStats() {
  const appointmentSnap = await getDocs(query(collection(db, "appointments"), orderBy("createdAt", "desc")));
  const chatSnap = await getDocs(query(collection(db, "chat_logs"), orderBy("timestamp", "desc")));

  let pending = 0;
  let confirmed = 0;
  let completed = 0;
  let closed = 0;
  appointmentSnap.forEach((docSnap) => {
    const appointment = docSnap.data();
    if (appointment.status === "pending") pending++;
    if (appointment.status === "confirmed") confirmed++;
    if (appointment.status === "completed") completed++;
    if (appointment.status === "cancelled" || appointment.status === "rejected") closed++;
  });

  const statPending = document.getElementById("stat-pending");
  const statConfirmed = document.getElementById("stat-confirmed");
  const statCompleted = document.getElementById("stat-completed");
  const statClosed = document.getElementById("stat-closed");
  const statTotal = document.getElementById("stat-total");
  const statChats = document.getElementById("stat-chats");

  if (statPending) statPending.textContent = pending;
  if (statConfirmed) statConfirmed.textContent = confirmed;
  if (statCompleted) statCompleted.textContent = completed;
  if (statClosed) statClosed.textContent = closed;
  if (statTotal) statTotal.textContent = appointmentSnap.size;
  if (statChats) statChats.textContent = chatSnap.size;
}

window.updateStatus = async function(appointmentId, newStatus) {
  try {
    await updateAppointmentStatus({ appointmentId, status: newStatus });
    showToast(`Appointment ${newStatus}.`, "success");
    await Promise.all([loadAllAppointments(), updateStats()]);
  } catch (err) {
    showToast("Update failed: " + err.message, "error");
  }
};

window.markChatReviewed = async function(chatId) {
  try {
    await updateDoc(doc(db, "chat_logs", chatId), { reviewStatus: "reviewed" });
    showToast("Chat marked as reviewed.", "success");
    await Promise.all([loadChatLogs(), updateStats()]);
  } catch (err) {
    showToast("Review update failed: " + err.message, "error");
  }
};

async function loadAllAppointments() {
  const tbody = document.getElementById("appointments-tbody");
  const statusFilter = document.getElementById("appointment-status-filter");
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-state">Loading appointments...</td></tr>';

  try {
    const q = query(collection(db, "appointments"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    tbody.innerHTML = "";
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-state">No appointments yet.</td></tr>';
      return;
    }

    snap.forEach(d => {
      const a = d.data();
      const appointmentStatus = a.status || "pending";
      if (statusFilter && statusFilter.value !== "all" && appointmentStatus !== statusFilter.value) {
        return;
      }
      const statusMeta = getAppointmentStatusMeta(appointmentStatus);
      const clinicName = getAppointmentClinicName(a);
      const specialty = a.specialty ? `<div class="admin-specialty-note">${escapeHtml(a.specialty)}</div>` : "";
      const createdAt = a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString() : "";
      tbody.innerHTML += `
        <tr>
          <td>${escapeHtml(a.patientName || 'Unknown')}</td>
          <td>${escapeHtml(a.patientEmail || '-')}</td>
          <td>${escapeHtml(clinicName)}${specialty}</td>
          <td>
            ${escapeHtml(getAppointmentDateTimeLabel(a))}
            ${createdAt ? `<div class="admin-muted-note">Booked ${escapeHtml(createdAt)}</div>` : ""}
          </td>
          <td>
          <span class="${statusMeta.className}">
              ${escapeHtml(statusMeta.label)}
            </span>
          </td>
          <td>
            ${renderAppointmentActions(d.id, appointmentStatus)}
          </td>
        </tr>`;
    });

    if (!tbody.innerHTML.trim()) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-state">No appointments match this status.</td></tr>';
    }
  } catch (err) {
    if (isPermissionError(err)) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="admin-empty-state" style="color:#ef4444; line-height:1.6;">
            Appointment data is blocked by Firestore rules for this account.
            Allow admin read access to the <strong>appointments</strong> collection in Firebase to review bookings here.
          </td>
        </tr>`;
      return;
    }
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="admin-empty-state" style="color:#ef4444;">
          Could not load appointments right now. Please refresh and try again.
        </td>
      </tr>`;
  }
}

async function loadChatLogs() {
  const tbody = document.getElementById("chatlogs-tbody");
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-state">Loading chat logs...</td></tr>';

  try {
    const q = query(collection(db, "chat_logs"), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);

    tbody.innerHTML = "";
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-state">No chat logs yet.</td></tr>';
      return;
    }

    snap.forEach(d => {
      const log = d.data();
      const reviewStatus = log.reviewStatus || "new";
      const reviewClass = reviewStatus === "reviewed"
        ? "status-badge status-badge--success"
        : "status-badge status-badge--info";
      tbody.innerHTML += `
        <tr>
          <td>${escapeHtml(log.userId || 'anonymous')}</td>
          <td>${escapeHtml(log.specialty || '-')}</td>
          <td style="max-width:220px;">${escapeHtml(log.symptomInput || '-')}</td>
          <td style="max-width:260px;">${escapeHtml(log.botResponse || '-')}</td>
          <td>
            <span class="${reviewClass}">
              ${escapeHtml(reviewStatus)}
            </span>
            <div class="admin-muted-note">${escapeHtml(formatTimestamp(log.timestamp))}</div>
          </td>
          <td>
            <div class="admin-actions">
              <button class="btn-primary" onclick="markChatReviewed('${d.id}')">Mark Reviewed</button>
            </div>
          </td>
        </tr>`;
    });
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="admin-empty-state" style="color:#ef4444;">
          Chat logs could not be loaded right now. Please refresh and try again.
        </td>
      </tr>`;
  }
}

function showAdminContent(user) {
  const guard = document.getElementById("admin-guard");
  const content = document.getElementById("admin-content");
  const adminName = document.getElementById("admin-name");

  if (guard) guard.style.display = "none";
  if (content) content.style.display = "block";
  if (adminName) adminName.textContent = user.displayName || user.email || "Admin";
}

function showAccessDenied() {
  const guard = document.getElementById("admin-guard");
  const content = document.getElementById("admin-content");
  const message = document.getElementById("admin-guard-message");

  if (content) content.style.display = "none";
  if (guard) guard.style.display = "block";
  if (message) {
    message.textContent = "You are signed in, but this account does not have admin access. Set the user role to 'admin' in Firestore users collection or use an allowed admin email.";
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const statusFilter = document.getElementById("appointment-status-filter");
  if (statusFilter) {
    statusFilter.addEventListener("change", () => {
      loadAllAppointments();
    });
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    const isAdmin = await isAdminUser(user);
    if (!isAdmin) {
      showAccessDenied();
      return;
    }

    showAdminContent(user);
    await Promise.all([loadAllAppointments(), loadChatLogs(), updateStats()]);
  });
});
