const DEFAULT_SEARCH_RADIUS_METERS = 5000;
const BROAD_FALLBACK_RADIUS_METERS = 8000;
const FALLBACK_LIMIT = 8;
const SELECTOR_BATCH_SIZE = 3;
const NOMINATIM_USER_AGENT = "vital-chatbot-clinic-search/1.0";
const OVERPASS_REQUEST_TIMEOUT_MS = 8000;
const OVERPASS_API_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const specialistProfiles = {
  "General Physician": {
    keywords: ["general physician", "general doctor", "physician", "family doctor", "doctor", "medical"],
    preferredCategories: ["clinic", "doctors", "doctor", "hospital"],
    fallbackTypes: ["Hospital", "General Hospital", "Clinic", "Healthcare Clinic", "Polyclinic", "Private Hospital"],
    specificSelectors: [
      { key: "amenity", value: "clinic" },
      { key: "amenity", value: "doctors" },
      { key: "healthcare", value: "clinic" },
      { key: "healthcare", value: "doctor" }
    ],
    keywordSelectors: []
  },
  Dentist: {
    keywords: ["dentist", "dental", "oral"],
    preferredCategories: ["dentist", "dental"],
    fallbackTypes: ["Dental Clinic", "Hospital"],
    specificSelectors: [
      { key: "amenity", value: "dentist" },
      { key: "healthcare", value: "dentist" }
    ],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description"], keywordMode: "any" },
      { key: "amenity", value: "hospital", keywordFields: ["name", "description"], keywordMode: "any" }
    ]
  },
  Cardiologist: {
    keywords: ["cardiologist", "cardiology", "cardiac", "heart"],
    preferredCategories: ["cardiology", "cardiac", "heart", "hospital"],
    fallbackTypes: ["Hospital", "General Hospital", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "doctors", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "hospital", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  Dermatologist: {
    keywords: ["dermatologist", "dermatology", "skin"],
    preferredCategories: ["dermatology", "skin", "clinic"],
    fallbackTypes: ["Skin & Hair Clinic", "Skin Clinic", "Hospital", "Clinic"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "doctors", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  Pediatrician: {
    keywords: ["pediatrician", "paediatrician", "pediatric", "child"],
    preferredCategories: ["pediatric", "paediatric", "child", "children"],
    fallbackTypes: ["Child Care Clinic", "Hospital", "General Hospital", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "hospital", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  "Orthopedic / Physiotherapist": {
    keywords: ["orthopedic", "orthopaedic", "physiotherapy", "physiotherapist", "physio"],
    preferredCategories: ["orthopedic", "orthopaedic", "physiotherapy", "physiotherapist", "physio"],
    fallbackTypes: ["Physiotherapy Clinic", "Physiotherapy Centre", "Hospital", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "doctors", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "hospital", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  "ENT Specialist": {
    keywords: ["ent", "ear", "nose", "throat", "otolaryngology"],
    preferredCategories: ["ent", "ear", "nose", "throat"],
    fallbackTypes: ["Hospital", "Clinic", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "doctors", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  Gastroenterologist: {
    keywords: ["gastroenterologist", "gastro", "digestive", "gi"],
    preferredCategories: ["gastro", "digestive", "gi"],
    fallbackTypes: ["Hospital", "General Hospital", "Clinic"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "hospital", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  Pulmonologist: {
    keywords: ["pulmonologist", "pulmonology", "lung", "respiratory", "chest"],
    preferredCategories: ["pulmonology", "lung", "respiratory", "chest"],
    fallbackTypes: ["Hospital", "General Hospital", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "hospital", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  Gynecologist: {
    keywords: ["gynecologist", "gynaecologist", "gynecology", "gynaecology", "women"],
    preferredCategories: ["gynecology", "gynaecology", "women", "maternity"],
    fallbackTypes: ["Hospital", "Clinic", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "hospital", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  Neurologist: {
    keywords: ["neurologist", "neurology", "neuro", "brain", "nerve"],
    preferredCategories: ["neurology", "neuro", "brain", "nerve"],
    fallbackTypes: ["Hospital", "General Hospital", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "hospital", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  Psychiatrist: {
    keywords: ["psychiatrist", "psychiatry", "mental", "behavioral", "behavioural"],
    preferredCategories: ["psychiatry", "mental", "behavioral", "behavioural"],
    fallbackTypes: ["Clinic", "Hospital", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "doctors", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  Ophthalmologist: {
    keywords: ["ophthalmologist", "ophthalmology", "eye", "vision"],
    preferredCategories: ["ophthalmology", "eye", "vision"],
    fallbackTypes: ["Hospital", "Private Hospital"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" },
      { key: "amenity", value: "hospital", keywordFields: ["name", "description", "healthcare:speciality", "healthcare:specialty", "medical_specialty"], keywordMode: "any" }
    ]
  },
  "Ayurvedic Practitioner": {
    keywords: ["ayurvedic", "ayurveda"],
    preferredCategories: ["ayurvedic", "ayurveda"],
    fallbackTypes: ["Ayurveda Centre", "Clinic"],
    specificSelectors: [],
    keywordSelectors: [
      { key: "amenity", value: "clinic", keywordFields: ["name", "description"], keywordMode: "any" }
    ]
  }
};

module.exports = {
  BROAD_FALLBACK_RADIUS_METERS,
  DEFAULT_SEARCH_RADIUS_METERS,
  FALLBACK_LIMIT,
  NOMINATIM_USER_AGENT,
  OVERPASS_API_URLS,
  OVERPASS_REQUEST_TIMEOUT_MS,
  SELECTOR_BATCH_SIZE,
  specialistProfiles
};
