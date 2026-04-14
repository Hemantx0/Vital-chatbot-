import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { functions } from "./firebase.js";

const getClinicSlotsCallable = httpsCallable(functions, "getClinicSlots");
const bookAppointmentCallable = httpsCallable(functions, "bookAppointment");
const updateAppointmentStatusCallable = httpsCallable(functions, "updateAppointmentStatus");

export async function getClinicSlots(payload) {
  const response = await getClinicSlotsCallable(payload);
  return response.data;
}

export async function bookAppointment(payload) {
  const response = await bookAppointmentCallable(payload);
  return response.data;
}

export async function updateAppointmentStatus(payload) {
  const response = await updateAppointmentStatusCallable(payload);
  return response.data;
}
