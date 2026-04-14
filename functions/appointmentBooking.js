const { HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");

const ADMIN_EMAILS = ["admin@vitalchat.com"];
const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];
const FINAL_BOOKING_STATUSES = ["rejected", "cancelled", "completed"];
const DEFAULT_SLOT_CAPACITY = 4;
const DEFAULT_SLOT_TIMES = [
  { value: "09:00", label: "09:00 AM" },
  { value: "09:30", label: "09:30 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "10:30", label: "10:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "11:30", label: "11:30 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "02:00", label: "02:00 PM" },
  { value: "02:30", label: "02:30 PM" },
  { value: "03:00", label: "03:00 PM" },
  { value: "03:30", label: "03:30 PM" },
  { value: "04:00", label: "04:00 PM" },
  { value: "04:30", label: "04:30 PM" },
  { value: "05:00", label: "05:00 PM" }
];

function getDb() {
  return getFirestore();
}

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Please sign in to continue.");
  }

  return {
    uid: request.auth.uid,
    email: request.auth.token?.email || ""
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function assertValidClinic(clinic) {
  if (!clinic || typeof clinic !== "object") {
    throw new HttpsError("invalid-argument", "A valid clinic object is required.");
  }

  if (!normalizeText(clinic.clinicId) || !normalizeText(clinic.name)) {
    throw new HttpsError("invalid-argument", "Clinic details are incomplete.");
  }
}

function assertValidDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ""))) {
    throw new HttpsError("invalid-argument", "A valid appointment date is required.");
  }
}

function parseTimeValue(timeValue) {
  const match = String(timeValue || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new HttpsError("invalid-argument", "A valid slot time is required.");
  }

  return {
    hour: Number.parseInt(match[1], 10),
    minute: Number.parseInt(match[2], 10)
  };
}

function buildSlotDocId(clinicId, date, timeValue) {
  return `${clinicId}__${date}__${timeValue.replace(":", "")}`;
}

function buildSlotId(date, timeValue) {
  return `${date}_${timeValue}`;
}

function buildAppointmentGuardId(userId, clinicId, appointmentDate, slotId) {
  return `${userId}__${clinicId}__${appointmentDate}__${slotId}`;
}

function createScheduledTimestamp(dateString, timeValue) {
  assertValidDate(dateString);
  const { hour, minute } = parseTimeValue(timeValue);
  const [year, month, day] = dateString.split("-").map((part) => Number.parseInt(part, 10));
  const utcMillis = Date.UTC(year, month - 1, day, hour - 5, minute - 30, 0, 0);
  return Timestamp.fromMillis(utcMillis);
}

function isFutureTimestamp(timestamp) {
  return Boolean(timestamp) && typeof timestamp.toMillis === "function" && timestamp.toMillis() > Date.now();
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

function getAppointmentScheduledTimestamp(appointment) {
  if (appointment?.scheduledAt && typeof appointment.scheduledAt.toMillis === "function") {
    return appointment.scheduledAt;
  }

  const appointmentDate = appointment?.appointmentDate || appointment?.date;
  if (!appointmentDate) {
    return null;
  }

  const timeValue = appointment?.slotValue
    || parseDisplayTimeToValue(appointment?.slotTime || appointment?.time)
    || "23:59";

  try {
    return createScheduledTimestamp(appointmentDate, timeValue);
  } catch (error) {
    return null;
  }
}

async function isAdminUser(user) {
  if (ADMIN_EMAILS.includes(user.email)) {
    return true;
  }

  const userDoc = await getDb().collection("users").doc(user.uid).get();
  return userDoc.exists && userDoc.data()?.role === "admin";
}

async function ensureClinicSlots({ clinic, appointmentDate }) {
  assertValidClinic(clinic);
  assertValidDate(appointmentDate);

  const db = getDb();
  const slotQuery = await db.collection("clinic_slots")
    .where("clinicId", "==", clinic.clinicId)
    .where("date", "==", appointmentDate)
    .get();

  if (!slotQuery.empty) {
    return slotQuery.docs;
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  DEFAULT_SLOT_TIMES.forEach((slot) => {
    const docRef = db.collection("clinic_slots").doc(buildSlotDocId(clinic.clinicId, appointmentDate, slot.value));
    batch.set(docRef, {
      clinicId: clinic.clinicId,
      clinicSource: clinic.source || "unknown",
      clinicName: clinic.name || "",
      date: appointmentDate,
      slotId: buildSlotId(appointmentDate, slot.value),
      slotTime: slot.label,
      slotValue: slot.value,
      capacity: DEFAULT_SLOT_CAPACITY,
      bookedCount: 0,
      available: true,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
  });

  await batch.commit();

  const seededQuery = await db.collection("clinic_slots")
    .where("clinicId", "==", clinic.clinicId)
    .where("date", "==", appointmentDate)
    .get();

  return seededQuery.docs;
}

async function getClinicSlotsForRequest(request) {
  requireAuth(request);

  const clinic = request.data?.clinic;
  const appointmentDate = normalizeText(request.data?.appointmentDate);
  assertValidClinic(clinic);
  assertValidDate(appointmentDate);

  const docs = await ensureClinicSlots({ clinic, appointmentDate });
  const slots = docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .sort((a, b) => String(a.slotValue || "").localeCompare(String(b.slotValue || "")))
    .map((slot) => ({
      clinicId: slot.clinicId,
      date: slot.date,
      slotId: slot.slotId,
      slotTime: slot.slotTime,
      slotValue: slot.slotValue,
      capacity: slot.capacity,
      bookedCount: slot.bookedCount,
      available:
        Boolean(slot.available) &&
        Number(slot.bookedCount || 0) < Number(slot.capacity || 0) &&
        isFutureTimestamp(createScheduledTimestamp(slot.date, slot.slotValue))
    }));

  return {
    success: true,
    clinicId: clinic.clinicId,
    appointmentDate,
    slots: slots.filter((slot) => slot.available)
  };
}

function getBookingSource(value) {
  const normalizedValue = normalizeText(value);
  return normalizedValue || "direct_booking";
}

async function createAppointmentBooking(request) {
  const user = requireAuth(request);
  const clinic = request.data?.clinic;
  const appointmentDate = normalizeText(request.data?.appointmentDate);
  const slotId = normalizeText(request.data?.slotId);
  const specialty = normalizeText(request.data?.specialty) || "General consultation";
  const bookingSource = getBookingSource(request.data?.bookingSource);
  const reason = normalizeText(request.data?.reason) || `Consultation for ${specialty}`;
  const patientName = normalizeText(request.data?.patientName) || user.email;
  const patientEmail = normalizeText(request.data?.patientEmail) || user.email;

  assertValidClinic(clinic);
  assertValidDate(appointmentDate);

  if (!slotId) {
    throw new HttpsError("invalid-argument", "Please select an appointment slot.");
  }

  const db = getDb();
  await ensureClinicSlots({ clinic, appointmentDate });

  const slotQuery = await db.collection("clinic_slots")
    .where("clinicId", "==", clinic.clinicId)
    .where("date", "==", appointmentDate)
    .where("slotId", "==", slotId)
    .limit(1)
    .get();

  if (slotQuery.empty) {
    throw new HttpsError("not-found", "The selected appointment slot was not found.");
  }

  const slotDoc = slotQuery.docs[0];
  const slotData = slotDoc.data();
  const scheduledAt = createScheduledTimestamp(appointmentDate, slotData.slotValue);

  if (!isFutureTimestamp(scheduledAt)) {
    throw new HttpsError("failed-precondition", "Past slots cannot be booked.");
  }

  const appointmentRef = db.collection("appointments").doc();
  const guardRef = db.collection("appointment_guards").doc(
    buildAppointmentGuardId(user.uid, clinic.clinicId, appointmentDate, slotId)
  );

  await db.runTransaction(async (transaction) => {
    const freshSlotDoc = await transaction.get(slotDoc.ref);
    if (!freshSlotDoc.exists) {
      throw new HttpsError("not-found", "The selected appointment slot is no longer available.");
    }

    const freshSlot = freshSlotDoc.data();
    const capacity = Number(freshSlot.capacity || 0);
    const bookedCount = Number(freshSlot.bookedCount || 0);
    if (!freshSlot.available || bookedCount >= capacity) {
      throw new HttpsError("already-exists", "That slot has just been filled. Please choose another slot.");
    }

    const guardDoc = await transaction.get(guardRef);
    if (guardDoc.exists && guardDoc.data()?.active) {
      throw new HttpsError("already-exists", "You already have an active booking for this clinic, date, and slot.");
    }

    const now = FieldValue.serverTimestamp();
    transaction.set(appointmentRef, {
      userId: user.uid,
      patientName,
      patientEmail,
      clinicId: clinic.clinicId,
      clinic: {
        clinicId: clinic.clinicId,
        source: clinic.source || "unknown",
        name: clinic.name,
        address: clinic.address || "",
        lat: clinic.lat ?? null,
        lng: clinic.lng ?? null,
        mapsUrl: clinic.mapsUrl || ""
      },
      specialty,
      appointmentDate,
      slotId,
      slotTime: freshSlot.slotTime,
      slotValue: freshSlot.slotValue,
      scheduledAt,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      bookingSource,
      clinicSource: clinic.source || "unknown",
      reason,
      hospitalName: clinic.name,
      date: appointmentDate,
      time: freshSlot.slotTime
    });

    const nextBookedCount = bookedCount + 1;
    transaction.update(slotDoc.ref, {
      bookedCount: nextBookedCount,
      available: nextBookedCount < capacity,
      updatedAt: now
    });

    transaction.set(guardRef, {
      userId: user.uid,
      clinicId: clinic.clinicId,
      appointmentDate,
      slotId,
      appointmentId: appointmentRef.id,
      active: true,
      updatedAt: now,
      createdAt: guardDoc.exists ? guardDoc.data()?.createdAt || now : now
    }, { merge: true });
  });

  return {
    success: true,
    appointmentId: appointmentRef.id,
    status: "pending",
    slotId,
    slotTime: slotData.slotTime
  };
}

function canRestoreSlot(fromStatus, toStatus) {
  return ACTIVE_BOOKING_STATUSES.includes(fromStatus) && ["cancelled", "rejected"].includes(toStatus);
}

function assertValidStatusTransition(currentStatus, nextStatus, isAdminAction) {
  const allowedTransitions = {
    pending: isAdminAction ? ["confirmed", "rejected", "cancelled"] : ["cancelled"],
    confirmed: isAdminAction ? ["completed", "cancelled"] : ["cancelled"],
    rejected: [],
    cancelled: [],
    completed: []
  };

  if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
    throw new HttpsError("failed-precondition", `Cannot change appointment status from ${currentStatus} to ${nextStatus}.`);
  }
}

async function updateAppointmentStatusForRequest(request) {
  const user = requireAuth(request);
  const appointmentId = normalizeText(request.data?.appointmentId);
  const nextStatus = normalizeText(request.data?.status).toLowerCase();

  if (!appointmentId || !nextStatus) {
    throw new HttpsError("invalid-argument", "Appointment id and status are required.");
  }

  const adminAction = await isAdminUser(user);
  const db = getDb();
  const appointmentRef = db.collection("appointments").doc(appointmentId);

  return db.runTransaction(async (transaction) => {
    const appointmentDoc = await transaction.get(appointmentRef);
    if (!appointmentDoc.exists) {
      throw new HttpsError("not-found", "Appointment not found.");
    }

    const appointment = appointmentDoc.data();
    const currentStatus = normalizeText(appointment.status).toLowerCase() || "pending";

    if (!adminAction && appointment.userId !== user.uid) {
      throw new HttpsError("permission-denied", "You cannot update this appointment.");
    }

    assertValidStatusTransition(currentStatus, nextStatus, adminAction);

    if (nextStatus === "cancelled" && !isFutureTimestamp(getAppointmentScheduledTimestamp(appointment))) {
      throw new HttpsError("failed-precondition", "Only future appointments can be cancelled.");
    }

    const updatePayload = {
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp()
    };
    const guardRef = db.collection("appointment_guards").doc(
      buildAppointmentGuardId(appointment.userId, appointment.clinicId, appointment.appointmentDate, appointment.slotId)
    );

    const shouldRestoreSlot = canRestoreSlot(currentStatus, nextStatus);
    if (shouldRestoreSlot) {
      const slotQuery = db.collection("clinic_slots")
        .where("clinicId", "==", appointment.clinicId)
        .where("date", "==", appointment.appointmentDate)
        .where("slotId", "==", appointment.slotId)
        .limit(1);
      const slotDocs = await transaction.get(slotQuery);
      if (!slotDocs.empty) {
        const slotDoc = slotDocs.docs[0];
        const slotData = slotDoc.data();
        const currentBookedCount = Number(slotData.bookedCount || 0);
        const nextBookedCount = Math.max(0, currentBookedCount - 1);
        const capacity = Number(slotData.capacity || 0);

        transaction.update(slotDoc.ref, {
          bookedCount: nextBookedCount,
          available: nextBookedCount < capacity,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    transaction.update(appointmentRef, updatePayload);

    if (FINAL_BOOKING_STATUSES.includes(nextStatus)) {
      transaction.set(guardRef, {
        active: false,
        appointmentId,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return {
      success: true,
      appointmentId,
      previousStatus: currentStatus,
      status: nextStatus
    };
  });
}

module.exports = {
  getClinicSlotsForRequest,
  createAppointmentBooking,
  updateAppointmentStatusForRequest,
  ACTIVE_BOOKING_STATUSES,
  FINAL_BOOKING_STATUSES
};
