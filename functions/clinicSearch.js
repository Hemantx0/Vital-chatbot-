const fallbackClinics = require("./fallbackClinics");
const {
  BROAD_FALLBACK_RADIUS_METERS,
  DEFAULT_SEARCH_RADIUS_METERS,
  FALLBACK_LIMIT,
  NOMINATIM_USER_AGENT,
  OVERPASS_API_URLS,
  OVERPASS_REQUEST_TIMEOUT_MS,
  SELECTOR_BATCH_SIZE,
  specialistProfiles
} = require("./clinicSearchProfiles");

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s,.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function parseCoordinateInput(locationText) {
  const text = String(locationText || "").trim();
  if (!text) return null;

  const latLngPattern = /lat[:\s]*(-?\d+(?:\.\d+)?)[,\s]+lng[:\s]*(-?\d+(?:\.\d+)?)/i;
  const plainPattern = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;
  const match = text.match(latLngPattern) || text.match(plainPattern);
  if (!match) return null;

  const lat = Number.parseFloat(match[1]);
  const lng = Number.parseFloat(match[2] || match[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng, resolvedLocation: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}` };
}

function getSpecialistProfile(specialist) {
  const normalizedSpecialist = normalizeText(specialist);
  const directMatch = Object.entries(specialistProfiles)
    .find(([name]) => normalizeText(name) === normalizedSpecialist);

  if (directMatch) {
    return directMatch[1];
  }

  return {
    keywords: [normalizedSpecialist || "clinic", "doctor", "hospital"],
    preferredCategories: [normalizedSpecialist || "clinic", "doctor", "hospital"],
    fallbackTypes: ["Hospital", "General Hospital", "Clinic", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: []
  };
}

function sanitizeRadius(radius) {
  const parsedRadius = Number.isFinite(radius) ? radius : Number.parseInt(radius, 10);
  if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
    return DEFAULT_SEARCH_RADIUS_METERS;
  }

  return Math.min(20000, Math.max(1000, parsedRadius));
}

async function geocodeWithNominatim(locationText) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", locationText);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": NOMINATIM_USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim geocoding failed (${response.status})`);
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const result = results[0];
  return {
    lat: Number.parseFloat(result.lat),
    lng: Number.parseFloat(result.lon),
    resolvedLocation: result.display_name || locationText
  };
}

async function resolveCoordinates({ locationText, lat, lng }) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      lat,
      lng,
      resolvedLocation: locationText || `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`
    };
  }

  const parsedCoordinates = parseCoordinateInput(locationText);
  if (parsedCoordinates) {
    return parsedCoordinates;
  }

  if (!locationText) {
    return null;
  }

  return geocodeWithNominatim(locationText);
}

function buildMapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function formatCoordinateForId(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toFixed(5) : "na";
}

function normalizeIdPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildStableClinicId({ source, providerId, lat, lng }) {
  const normalizedSource = normalizeIdPart(source) || "unknown";
  const normalizedProviderId = normalizeIdPart(providerId);
  if (normalizedProviderId) {
    return `${normalizedSource}_${normalizedProviderId}`;
  }

  return `${normalizedSource}_${formatCoordinateForId(lat)}_${formatCoordinateForId(lng)}`;
}

function buildAddressFromTags(tags = {}) {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"],
    tags["addr:city"],
    tags["addr:district"],
    tags["addr:state"],
    tags["addr:postcode"]
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return parts.join(", ");
}

function getElementCoordinates(element) {
  const lat = Number.parseFloat(element?.lat ?? element?.center?.lat);
  const lng = Number.parseFloat(element?.lon ?? element?.center?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function escapeOverpassRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getKeywordRegex(keywords) {
  const normalizedKeywords = [...new Set((keywords || []).map((keyword) => normalizeText(keyword)).filter(Boolean))];
  if (normalizedKeywords.length === 0) {
    return "";
  }

  return normalizedKeywords.map(escapeOverpassRegex).join("|");
}

function buildSelectorStatement(selector, coordinates, radius, elementType, keywordRegex) {
  const keywordFields = Array.isArray(selector.keywordFields) && selector.keywordFields.length > 0
    ? selector.keywordFields.join("|")
    : "name|description|healthcare:speciality|healthcare:specialty|medical_specialty";

  const keywordClause = keywordRegex && selector.keywordMode !== "none"
    ? `[~"^(${keywordFields})$"~"${keywordRegex}",i]`
    : "";

  return `${elementType}(around:${radius},${coordinates.lat},${coordinates.lng})["${selector.key}"="${selector.value}"]${keywordClause};`;
}

function buildOverpassQuery({ coordinates, radius, selectors, keywords }) {
  const keywordRegex = getKeywordRegex(keywords);
  const statements = [];

  for (const selector of selectors) {
    for (const elementType of ["node", "way", "relation"]) {
      statements.push(buildSelectorStatement(selector, coordinates, radius, elementType, keywordRegex));
    }
  }

  return `
[out:json][timeout:25];
(
${statements.join("\n")}
);
out center tags;
`.trim();
}

async function fetchOverpassPayload(query) {
  let lastError = null;

  for (const endpoint of OVERPASS_API_URLS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(OVERPASS_REQUEST_TIMEOUT_MS),
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": NOMINATIM_USER_AGENT
        },
        body: query
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Overpass API request failed (${response.status}) via ${endpoint}: ${errorText.slice(0, 180)}`);
      }

      const payload = await response.json();
      if (!Array.isArray(payload?.elements)) {
        throw new Error(`Overpass API returned an invalid response payload via ${endpoint}.`);
      }

      return payload.elements;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Overpass API request failed.");
}

function splitIntoBatches(items, batchSize) {
  const batches = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

function toCoordinatesPayload(coordinates) {
  if (!coordinates) {
    return null;
  }

  return {
    lat: coordinates.lat,
    lng: coordinates.lng
  };
}

function buildSearchResponse({
  success,
  specialist,
  resolvedLocation,
  coordinates,
  searchRadiusUsed,
  clinics,
  message,
  fallbackUsed,
  source
}) {
  return {
    success,
    specialist,
    resolvedLocation: resolvedLocation || "",
    coordinates: toCoordinatesPayload(coordinates),
    searchRadiusUsed,
    clinics,
    message,
    fallbackUsed,
    source
  };
}

function getSearchPlans(specialist, radius) {
  const profile = getSpecialistProfile(specialist);
  const broadSelectors = [
    { key: "amenity", value: "clinic", keywordMode: "none" },
    { key: "amenity", value: "doctors", keywordMode: "none" },
    { key: "amenity", value: "hospital", keywordMode: "none" },
    { key: "healthcare", value: "clinic", keywordMode: "none" },
    { key: "healthcare", value: "doctor", keywordMode: "none" },
    { key: "healthcare", value: "hospital", keywordMode: "none" }
  ];

  const plans = [];

  if (profile.specificSelectors.length > 0) {
    plans.push({
      stage: "specialist-specific",
      radius,
      selectors: profile.specificSelectors,
      keywords: profile.keywords
    });
  }

  if (profile.keywordSelectors.length > 0) {
    plans.push({
      stage: "keyword-specialist",
      radius,
      selectors: profile.keywordSelectors,
      keywords: profile.keywords
    });
  }

  plans.push({
    stage: "broad-medical",
    radius: Math.max(radius, BROAD_FALLBACK_RADIUS_METERS),
    selectors: broadSelectors,
    keywords: []
  });

  return plans;
}

function getCategoryWeight(categoryText) {
  if (categoryText.includes("dentist")) return 24;
  if (categoryText.includes("doctor")) return 18;
  if (categoryText.includes("clinic")) return 16;
  if (categoryText.includes("hospital")) return 12;
  return 6;
}

function getPreferredCategoryBonus(result, specialist) {
  const profile = getSpecialistProfile(specialist);
  const searchableText = normalizeText([
    result.category,
    result.name,
    result.rawSearchText
  ].join(" "));

  return (profile.preferredCategories || [])
    .map((keyword) => normalizeText(keyword))
    .filter(Boolean)
    .reduce((score, keyword) => score + (searchableText.includes(keyword) ? 10 : 0), 0);
}

function getConflictingKeywordPenalty(result, specialist) {
  const normalizedSpecialist = normalizeText(specialist);
  if (normalizedSpecialist === "general physician") {
    return 0;
  }

  const searchableText = normalizeText([
    result.name,
    result.category,
    result.rawSearchText
  ].join(" "));

  let penalty = 0;
  for (const [profileName, profile] of Object.entries(specialistProfiles)) {
    if (normalizeText(profileName) === normalizedSpecialist) {
      continue;
    }

    const hasConflict = (profile.preferredCategories || [])
      .map((keyword) => normalizeText(keyword))
      .filter(Boolean)
      .some((keyword) => searchableText.includes(keyword));

    if (hasConflict) {
      penalty += 14;
    }
  }

  return Math.min(42, penalty);
}

function getKeywordMatchCount(text, specialist) {
  const profile = getSpecialistProfile(specialist);
  const normalized = normalizeText(text);

  return [...new Set(profile.keywords)]
    .map((keyword) => normalizeText(keyword))
    .filter(Boolean)
    .filter((keyword) => normalized.includes(keyword))
    .length;
}

function calculateScore(result, specialist) {
  const searchableText = normalizeText([
    result.name,
    result.address,
    result.category,
    result.rawSearchText
  ].join(" "));

  const keywordMatches = getKeywordMatchCount(searchableText, specialist);
  const categoryScore = getCategoryWeight(normalizeText(result.category || ""));
  const keywordScore = keywordMatches * 8;
  const preferredCategoryBonus = getPreferredCategoryBonus(result, specialist);
  const conflictPenalty = getConflictingKeywordPenalty(result, specialist);

  return categoryScore + keywordScore + preferredCategoryBonus - conflictPenalty;
}

function isIrrelevantPlace(result) {
  const text = normalizeText([
    result.name,
    result.address,
    result.category,
    result.rawSearchText
  ].join(" "));

  const blockedTerms = ["pharmacy", "chemist", "veterinary", "vet", "diagnostic", "laboratory", "lab"];
  return blockedTerms.some((term) => text.includes(term));
}

function normalizeOSMElements(elements, coordinates, stage) {
  return elements.map((element) => {
    const tags = element?.tags || {};
    const point = getElementCoordinates(element);
    if (!point) {
      return null;
    }

    const category = `${tags.amenity || ""} ${tags.healthcare || ""}`.trim();
    const name = tags.name || tags.official_name || tags.brand || "";
    const address = buildAddressFromTags(tags);

    return {
      name: name || (category ? `Nearby ${category}` : "Nearby clinic"),
      address,
      distanceKm: haversineDistanceKm(coordinates.lat, coordinates.lng, point.lat, point.lng),
      rating: null,
      reviewCount: null,
      openNow: null,
      phone: tags.phone || tags["contact:phone"] || "",
      mapsUrl: buildMapsUrl(point.lat, point.lng),
      source: "openstreetmap",
      placeId: `${element.type || "element"}:${element.id || `${point.lat},${point.lng}`}`,
      providerId: element.id || `${point.lat},${point.lng}`,
      providerType: element.type || "element",
      lat: point.lat,
      lng: point.lng,
      searchStage: stage,
      category,
      rawSearchText: [
        tags.description,
        tags["healthcare:speciality"],
        tags["healthcare:specialty"],
        tags.medical_specialty
      ].filter(Boolean).join(" ")
    };
  }).filter(Boolean);
}

function dedupeResults(results) {
  const bestByKey = new Map();

  for (const result of results) {
    const key = normalizeText(`${result.name}|${result.address || `${result.lat},${result.lng}`}`)
      .replace(/\b(clinic|hospital|doctor|dr|nearby)\b/g, "")
      .trim();
    const existing = bestByKey.get(key);

    if (!existing) {
      bestByKey.set(key, result);
      continue;
    }

    const currentDistance = typeof result.distanceKm === "number" ? result.distanceKm : Infinity;
    const existingDistance = typeof existing.distanceKm === "number" ? existing.distanceKm : Infinity;

    if (currentDistance < existingDistance || (currentDistance === existingDistance && result.relevanceScore > existing.relevanceScore)) {
      bestByKey.set(key, result);
    }
  }

  return [...bestByKey.values()];
}

function normalizeResults(results, specialist) {
  return dedupeResults(
    results
      .filter((result) => result && !isIrrelevantPlace(result))
      .filter((result) => {
        const keywordMatches = getKeywordMatchCount(
          `${result.name} ${result.address} ${result.category} ${result.rawSearchText}`,
          specialist
        );
        const conflictPenalty = getConflictingKeywordPenalty(result, specialist);

        if (result.searchStage === "broad-medical" && keywordMatches === 0 && conflictPenalty >= 14) {
          return false;
        }

        return true;
      })
      .map((result) => ({
        ...result,
        relevanceScore: calculateScore(result, specialist)
      }))
      .sort((a, b) => {
        const distanceA = typeof a.distanceKm === "number" ? a.distanceKm : Infinity;
        const distanceB = typeof b.distanceKm === "number" ? b.distanceKm : Infinity;

        if (Math.abs(distanceA - distanceB) > 0.2) {
          return distanceA - distanceB;
        }

        return b.relevanceScore - a.relevanceScore;
      })
  )
    .slice(0, FALLBACK_LIMIT)
    .map(({ category, rawSearchText, ...result }) => ({
      ...result,
      clinicId: buildStableClinicId({
        source: result.source,
        providerId: result.providerId || result.placeId,
        lat: result.lat,
        lng: result.lng
      }),
      distanceKm: typeof result.distanceKm === "number" ? Number(result.distanceKm.toFixed(1)) : null,
      matchType: getKeywordMatchCount(`${result.name} ${result.address} ${category} ${rawSearchText}`, specialist) > 0
        ? "exact_specialist"
        : normalizeText(category || "").includes("hospital")
          ? "broad_fallback"
          : "related_match"
    }));
}

async function fetchOSMStage({ coordinates, radius, specialist, selectors, keywords, stage }) {
  const batches = splitIntoBatches(selectors, SELECTOR_BATCH_SIZE);
  const collectedResults = [];
  let lastError = null;

  for (const batch of batches) {
    try {
      const query = buildOverpassQuery({ coordinates, radius, selectors: batch, keywords });
      const elements = await fetchOverpassPayload(query);
      collectedResults.push(...normalizeOSMElements(elements, coordinates, stage));
    } catch (error) {
      lastError = error;
    }
  }

  return {
    results: normalizeResults(collectedResults, specialist),
    error: collectedResults.length > 0 ? null : lastError
  };
}

async function fetchFromOSM({ specialist, coordinates, radius }) {
  const plans = getSearchPlans(specialist, radius);
  let lastError = null;

  for (const plan of plans) {
    const stageResult = await fetchOSMStage({
      coordinates,
      radius: plan.radius,
      specialist,
      selectors: plan.selectors,
      keywords: plan.keywords,
      stage: plan.stage
    });

    if (stageResult.results.length > 0) {
      return {
        results: stageResult.results,
        stage: plan.stage,
        error: null
      };
    }

    if (stageResult.error) {
      lastError = stageResult.error;
    }
  }

  return {
    results: [],
    stage: "empty",
    error: lastError
  };
}

function fallbackLocalSearch({ specialist, coordinates }) {
  const profile = getSpecialistProfile(specialist);

  // Keep the local dataset available only as a graceful backup when live OSM
  // search is unavailable, so the normal recommendation flow stays backend-driven.
  const clinics = fallbackClinics
    .filter((clinic) => profile.fallbackTypes.includes(clinic.type))
    .map((clinic) => ({
      name: clinic.name,
      address: clinic.address,
      distanceKm: haversineDistanceKm(coordinates.lat, coordinates.lng, clinic.lat, clinic.lng),
      rating: clinic.rating,
      reviewCount: clinic.reviewCount || 0,
      openNow: clinic.status === "Open",
      phone: clinic.phone || "",
      mapsUrl: buildMapsUrl(clinic.lat, clinic.lng),
      source: "fallback_local",
      lat: clinic.lat,
      lng: clinic.lng
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, FALLBACK_LIMIT)
    .map((clinic) => ({
      clinicId: buildStableClinicId({
        source: "fallback_local",
        providerId: clinic.id,
        lat: clinic.lat,
        lng: clinic.lng
      }),
      ...clinic,
      lat: clinic.lat,
      lng: clinic.lng,
      distanceKm: Number(clinic.distanceKm.toFixed(1))
    }));

  return clinics;
}

function attachClinicContext(clinics, specialist, resolvedLocation) {
  return (clinics || []).map((clinic) => ({
    ...clinic,
    clinicId: clinic.clinicId || buildStableClinicId({
      source: clinic.source,
      providerId: clinic.providerId || clinic.placeId,
      lat: clinic.lat,
      lng: clinic.lng
    }),
    source: clinic.source || "unknown",
    specialtyMatched: specialist,
    searchContext: resolvedLocation || ""
  }));
}

async function findNearbyClinics({ specialist, locationText, lat, lng, radius, city, state }) {
  if (!specialist) {
    return buildSearchResponse({
      success: false,
      specialist: "",
      resolvedLocation: "",
      coordinates: null,
      searchRadiusUsed: sanitizeRadius(radius),
      clinics: [],
      message: "The 'specialist' field is required.",
      fallbackUsed: false,
      source: "validation"
    });
  }

  const searchRadiusUsed = sanitizeRadius(radius);
  const resolvedLocationInput = [locationText, city, state]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");

  let coordinates;
  try {
    coordinates = await resolveCoordinates({
      locationText: resolvedLocationInput,
      lat: Number.isFinite(lat) ? lat : Number.parseFloat(lat),
      lng: Number.isFinite(lng) ? lng : Number.parseFloat(lng)
    });
  } catch (error) {
    return buildSearchResponse({
      success: false,
      specialist,
      resolvedLocation: resolvedLocationInput || "",
      coordinates: null,
      searchRadiusUsed,
      clinics: [],
      message: error.message || "Unable to resolve the requested location.",
      fallbackUsed: false,
      source: "location-resolution"
    });
  }

  if (!coordinates) {
    return buildSearchResponse({
      success: false,
      specialist,
      resolvedLocation: resolvedLocationInput || "",
      coordinates: null,
      searchRadiusUsed,
      clinics: [],
      message: "I could not understand that location. Please try a clearer area, landmark, or live location.",
      fallbackUsed: false,
      source: "location-resolution"
    });
  }

  const osmSearch = await fetchFromOSM({
    specialist,
    coordinates,
    radius: searchRadiusUsed
  });

  if (osmSearch.results.length > 0) {
    const clinics = attachClinicContext(osmSearch.results, specialist, coordinates.resolvedLocation);
    return buildSearchResponse({
      success: true,
      specialist,
      resolvedLocation: coordinates.resolvedLocation,
      coordinates,
      searchRadiusUsed,
      clinics,
      message: `I found ${clinics.length} nearby ${specialist.toLowerCase()} options.`,
      fallbackUsed: false,
      source: "openstreetmap"
    });
  }

  if (osmSearch.error) {
    const fallbackClinicsList = attachClinicContext(
      fallbackLocalSearch({ specialist, coordinates }),
      specialist,
      coordinates.resolvedLocation
    );
    if (fallbackClinicsList.length > 0) {
      return buildSearchResponse({
        success: true,
        specialist,
        resolvedLocation: coordinates.resolvedLocation,
        coordinates,
        searchRadiusUsed,
        clinics: fallbackClinicsList,
        message: `Live map search had trouble responding, so I am showing ${fallbackClinicsList.length} fallback ${specialist.toLowerCase()} options.`,
        fallbackUsed: true,
        source: "fallback_local"
      });
    }

    return buildSearchResponse({
      success: false,
      specialist,
      resolvedLocation: coordinates.resolvedLocation,
      coordinates,
      searchRadiusUsed,
      clinics: [],
      message: "Live clinic search is taking too long right now. Please try again, use a nearby landmark, or share your live location.",
      fallbackUsed: false,
      source: "openstreetmap_error"
    });
  }

  return buildSearchResponse({
    success: true,
    specialist,
    resolvedLocation: coordinates.resolvedLocation,
    coordinates,
    searchRadiusUsed,
    clinics: [],
    message: `No suitable nearby ${specialist.toLowerCase()} clinics were found. Try a broader area or live location.`,
    fallbackUsed: false,
    source: "none"
  });
}

module.exports = {
  findNearbyClinics,
  searchNearbyClinics: findNearbyClinics,
  fetchFromOSM,
  normalizeResults,
  calculateScore,
  haversineDistanceKm
};
