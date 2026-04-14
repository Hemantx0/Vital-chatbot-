export const SELECTED_CLINIC_STORAGE_KEY = "selectedClinic";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s.-]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatCoordinate(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toFixed(5) : "na";
}

function buildFallbackClinicId(source, clinic) {
  const providerPart = clinic.providerId || clinic.placeId || clinic.id || clinic.osmId;
  if (providerPart) {
    return `${source}_${normalizeText(providerPart)}`;
  }

  const latPart = formatCoordinate(clinic.lat ?? clinic.latitude);
  const lngPart = formatCoordinate(clinic.lng ?? clinic.longitude);
  return `${source}_${latPart}_${lngPart}`;
}

export function normalizeClinic(clinic, context = {}) {
  if (!clinic || typeof clinic !== "object") {
    return null;
  }

  const source = String(clinic.source || context.source || "unknown").trim().toLowerCase() || "unknown";
  const lat = Number.parseFloat(clinic.lat ?? clinic.latitude);
  const lng = Number.parseFloat(clinic.lng ?? clinic.longitude);
  const specialtyMatched = clinic.specialtyMatched || context.specialtyMatched || "";
  const searchContext = clinic.searchContext || context.searchContext || "";

  return {
    clinicId: String(clinic.clinicId || buildFallbackClinicId(source, clinic)),
    source,
    name: String(clinic.name || "Clinic"),
    address: String(clinic.address || "Address not available"),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    mapsUrl: String(clinic.mapsUrl || ""),
    specialtyMatched: String(specialtyMatched),
    searchContext: String(searchContext),
    phone: String(clinic.phone || ""),
    rating: Number.isFinite(Number.parseFloat(clinic.rating)) ? Number.parseFloat(clinic.rating) : null,
    reviewCount: Number.isFinite(Number.parseInt(clinic.reviewCount, 10)) ? Number.parseInt(clinic.reviewCount, 10) : null,
    distanceKm: Number.isFinite(Number.parseFloat(clinic.distanceKm)) ? Number.parseFloat(clinic.distanceKm) : null,
    openNow: typeof clinic.openNow === "boolean" ? clinic.openNow : null,
    matchType: String(clinic.matchType || ""),
    providerId: String(clinic.providerId || clinic.placeId || clinic.id || ""),
    providerType: String(clinic.providerType || "")
  };
}

export function saveSelectedClinic(clinic) {
  const normalizedClinic = normalizeClinic(clinic);
  if (!normalizedClinic) {
    return null;
  }

  localStorage.setItem(SELECTED_CLINIC_STORAGE_KEY, JSON.stringify(normalizedClinic));
  return normalizedClinic;
}

export function getSelectedClinic() {
  const rawValue = localStorage.getItem(SELECTED_CLINIC_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return normalizeClinic(JSON.parse(rawValue));
  } catch (error) {
    localStorage.removeItem(SELECTED_CLINIC_STORAGE_KEY);
    return null;
  }
}

export function clearSelectedClinic() {
  localStorage.removeItem(SELECTED_CLINIC_STORAGE_KEY);
}
