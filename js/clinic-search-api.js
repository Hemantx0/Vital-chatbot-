import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { functions } from "./firebase.js";

const findNearbyClinicsCallable = httpsCallable(functions, "findNearbyClinics");

export async function requestNearbyClinics(payload) {
  const response = await findNearbyClinicsCallable(payload);
  return response.data;
}
