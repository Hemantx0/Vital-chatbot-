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

  if (normalizedStatus === "cancelled") {
    return { label: "cancelled", color: "#ef4444" };
  }

  return { label: "pending", color: "#f59e0b" };
}
