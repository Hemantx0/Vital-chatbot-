import {
  collection, getDocs, updateDoc, getDoc,
  doc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { db, auth } from "./firebase.js";
import { escapeHtml, getAppointmentStatusMeta } from "./ui-utils.js";

const ADMIN_EMAILS = ["admin@vitalchat.com"];

function showToast(message, type = 'info') {
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed; bottom:2rem; right:2rem; z-index:9999;
    padding:0.75rem 1.5rem; border-radius:8px; font-weight:600;
    background:${type === 'success' ? '#16a34a' : type === 'error' ? '#ef4444' : '#2563eb'};
    color:#fff; box-shadow:0 4px 16px rgba(0,0,0,0.2);
    opacity:0; transition:opacity 0.3s;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.style.opacity = '1');
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
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
  if (status === "confirmed" || status === "cancelled") {
    return `
      <span style="color:#94a3b8; font-size:0.82rem; font-weight:600;">
        Finalized
      </span>
    `;
  }

  return `
    <button onclick="updateStatus('${appointmentId}','confirmed')"
      style="padding:4px 10px; background:#16a34a; color:#fff; border:none;
      border-radius:6px; cursor:pointer; font-size:0.8rem;">Confirm</button>
    <button onclick="updateStatus('${appointmentId}','cancelled')"
      style="padding:4px 10px; background:#ef4444; color:#fff; border:none;
      border-radius:6px; cursor:pointer; font-size:0.8rem;">Cancel</button>
  `;
}

async function isAdminUser(user) {
  if (!user) return false;
  if (ADMIN_EMAILS.includes(user.email || "")) return true;

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) return false;
    return userDoc.data().role === "admin";
  } catch (error) {
    console.error("Admin role check failed:", error);
    return false;
  }
}

async function updateStats() {
  const appointmentSnap = await getDocs(query(collection(db, "appointments"), orderBy("createdAt", "desc")));
  const chatSnap = await getDocs(query(collection(db, "chat_logs"), orderBy("timestamp", "desc")));

  let pending = 0;
  let confirmed = 0;
  appointmentSnap.forEach((docSnap) => {
    const appointment = docSnap.data();
    if (appointment.status === "pending") pending++;
    if (appointment.status === "confirmed") confirmed++;
  });

  const statPending = document.getElementById("stat-pending");
  const statConfirmed = document.getElementById("stat-confirmed");
  const statTotal = document.getElementById("stat-total");
  const statChats = document.getElementById("stat-chats");

  if (statPending) statPending.textContent = pending;
  if (statConfirmed) statConfirmed.textContent = confirmed;
  if (statTotal) statTotal.textContent = appointmentSnap.size;
  if (statChats) statChats.textContent = chatSnap.size;
}

window.updateStatus = async function(appointmentId, newStatus) {
  try {
    await updateDoc(doc(db, "appointments", appointmentId), { status: newStatus });
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
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">Loading appointments...</td></tr>';

  try {
    const q = query(collection(db, "appointments"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    tbody.innerHTML = "";
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No appointments yet.</td></tr>';
      return;
    }

    snap.forEach(d => {
      const a = d.data();
      const appointmentStatus = a.status || "pending";
      const statusMeta = getAppointmentStatusMeta(appointmentStatus);
      tbody.innerHTML += `
        <tr>
          <td>${escapeHtml(a.patientName || 'Unknown')}</td>
          <td>${escapeHtml(a.patientEmail || '-')}</td>
          <td>${escapeHtml(a.hospitalName || '-')}</td>
          <td>${escapeHtml(`${a.date || '-'} ${a.time || ''}`.trim())}</td>
          <td>
            <span style="background:${statusMeta.color}22; color:${statusMeta.color};
              padding:2px 10px; border-radius:20px; font-size:0.8rem; font-weight:600;">
              ${escapeHtml(statusMeta.label)}
            </span>
          </td>
          <td style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${renderAppointmentActions(d.id, appointmentStatus)}
          </td>
        </tr>`;
    });
  } catch (err) {
    if (isPermissionError(err)) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="color:#ef4444; line-height:1.6;">
            Chat logs are blocked by Firestore rules for this account.
            Allow admin read access to the <strong>chat_logs</strong> collection in Firebase to use Chatbot Log Review.
          </td>
        </tr>`;
      return;
    }
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444;">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function loadChatLogs() {
  const tbody = document.getElementById("chatlogs-tbody");
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">Loading chat logs...</td></tr>';

  try {
    const q = query(collection(db, "chat_logs"), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);

    tbody.innerHTML = "";
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No chat logs yet.</td></tr>';
      return;
    }

    snap.forEach(d => {
      const log = d.data();
      const reviewStatus = log.reviewStatus || "new";
      const reviewColor = reviewStatus === "reviewed" ? "#16a34a" : "#2563eb";
      tbody.innerHTML += `
        <tr>
          <td>${escapeHtml(log.userId || 'anonymous')}</td>
          <td>${escapeHtml(log.specialty || '-')}</td>
          <td style="max-width:220px;">${escapeHtml(log.symptomInput || '-')}</td>
          <td style="max-width:260px;">${escapeHtml(log.botResponse || '-')}</td>
          <td>
            <span style="background:${reviewColor}22; color:${reviewColor};
              padding:2px 10px; border-radius:20px; font-size:0.8rem; font-weight:600;">
              ${escapeHtml(reviewStatus)}
            </span>
            <div style="margin-top:0.35rem; color:#94a3b8; font-size:0.8rem;">${escapeHtml(formatTimestamp(log.timestamp))}</div>
          </td>
          <td>
            <button onclick="markChatReviewed('${d.id}')"
              style="padding:4px 10px; background:#2563eb; color:#fff; border:none;
              border-radius:6px; cursor:pointer; font-size:0.8rem;">Mark Reviewed</button>
          </td>
        </tr>`;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444;">Error: ${escapeHtml(err.message)}</td></tr>`;
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
