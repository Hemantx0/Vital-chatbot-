export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getAppointmentStatusMeta(status) {
  const normalizedStatus = String(status || "pending").toLowerCase();

  if (normalizedStatus === "confirmed") {
    return { label: "confirmed", color: "#16a34a" };
  }

  if (normalizedStatus === "rejected") {
    return { label: "rejected", color: "#dc2626" };
  }

  if (normalizedStatus === "cancelled") {
    return { label: "cancelled", color: "#ef4444" };
  }

  if (normalizedStatus === "completed") {
    return { label: "completed", color: "#2563eb" };
  }

  return { label: "pending", color: "#f59e0b" };
}

export function isFutureAppointment(appointment) {
  const scheduledAt = appointment?.scheduledAt;
  if (scheduledAt && typeof scheduledAt.toDate === "function") {
    return scheduledAt.toDate().getTime() > Date.now();
  }

  const appointmentDate = appointment?.appointmentDate || appointment?.date;
  if (!appointmentDate) {
    return false;
  }

  const slotValue = appointment?.slotValue || parseDisplayTimeToValue(appointment?.slotTime || appointment?.time) || "23:59";
  const fallbackDate = createIndiaDate(appointmentDate, slotValue);
  return Boolean(fallbackDate) && fallbackDate.getTime() > Date.now();
}

export function canUserCancelAppointment(appointment) {
  const normalizedStatus = String(appointment?.status || "").toLowerCase();
  return ["pending", "confirmed"].includes(normalizedStatus) && isFutureAppointment(appointment);
}

function parseDisplayTimeToValue(timeLabel) {
  const match = String(timeLabel || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return "";
  }

  let hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hour !== 12) {
    hour += 12;
  }

  if (meridiem === "AM" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function createIndiaDate(dateString, timeValue) {
  const dateMatch = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || "").match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const day = Number.parseInt(dateMatch[3], 10);
  const hour = Number.parseInt(timeMatch[1], 10);
  const minute = Number.parseInt(timeMatch[2], 10);

  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, 0, 0));
}
