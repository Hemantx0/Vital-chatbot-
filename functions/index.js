const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { findNearbyClinics } = require("./clinicSearch");

initializeApp();

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_HISTORY_MESSAGES = 8;
const DEFAULT_DISCLAIMER = "This chatbot provides general health guidance only and is not a substitute for a licensed medical professional.";
const STRUCTURED_SYSTEM_PROMPT = `
You are a healthcare guidance assistant for an AI chatbot.
Your role is to help users understand symptoms in a safe and structured way.
You are NOT a doctor and you must NOT provide a final diagnosis.

Rules:
- Always respond in valid JSON only.
- Do not include markdown.
- Do not include code fences.
- Do not add any text outside JSON.
- Keep language simple and user-friendly.
- Mention only possible conditions, never confirm a diagnosis.
- If symptoms may indicate a dangerous situation, set urgency_level to 'emergency' and emergency to true.
- Always include a disclaimer that the chatbot is not a substitute for a licensed medical professional.

Return JSON in exactly this format:
{
  "symptom_summary": "short summary of what the user is experiencing",
  "possible_conditions": ["condition 1", "condition 2", "condition 3"],
  "urgency_level": "low|medium|high|emergency",
  "recommended_specialist": "doctor type",
  "next_steps": ["step 1", "step 2", "step 3"],
  "emergency": false,
  "disclaimer": "This chatbot provides general health guidance only and is not a substitute for a licensed medical professional."
}

Decision guidance:
- low: mild symptoms, self-care or routine consultation may be enough
- medium: should consult a doctor soon
- high: medical evaluation recommended as early as possible
- emergency: immediate emergency care needed

Important:
- Chest pain, breathing difficulty, stroke-like symptoms, severe bleeding, loss of consciousness, seizures, or suicidal intent should strongly suggest emergency.
- Keep responses concise, safe, and structured.
`.trim();

const symptomMap = [
  { keywords: ["fever", "cold", "cough", "flu", "headache", "body ache", "fatigue", "weakness", "nausea", "vomit"], specialty: "General Physician" },
  { keywords: ["chest pain", "heart", "blood pressure", "bp", "palpitation", "cardiac", "cardiologist"], specialty: "Cardiologist" },
  { keywords: ["tooth", "teeth", "gum", "dental", "cavity", "mouth", "dentist"], specialty: "Dentist" },
  { keywords: ["skin", "rash", "acne", "pimple", "itch", "allergy", "eczema", "hair loss", "hair fall", "dandruff", "dermatologist"], specialty: "Dermatologist" },
  { keywords: ["child", "baby", "infant", "kid", "pediatric", "vaccination", "pediatrician"], specialty: "Pediatrician" },
  { keywords: ["bone", "joint", "fracture", "knee", "back pain", "spine", "shoulder", "muscle", "sprain", "orthopedic", "orthopaedic", "physiotherapist"], specialty: "Orthopedic / Physiotherapist" },
  { keywords: ["stomach", "digestion", "gastric", "acidity", "diarrhea", "constipation", "abdomen", "liver", "gastroenterologist"], specialty: "Gastroenterologist" },
  { keywords: ["eye", "vision", "blur", "cataract", "ophthalmologist"], specialty: "Ophthalmologist" },
  { keywords: ["ear", "nose", "throat", "sore throat", "sinus", "hearing", "ent", "otolaryngologist"], specialty: "ENT Specialist" },
  { keywords: ["ayurveda", "herbal", "natural", "panchakarma", "yoga", "ayurvedic"], specialty: "Ayurvedic Practitioner" }
];

const greetingWords = ["hi", "hello", "hey", "hii", "helo", "good morning", "good afternoon", "good evening"];
const helpWords = ["help", "start", "menu", "options"];
const emergencyKeywords = [
  "chest pain",
  "difficulty breathing",
  "shortness of breath",
  "unconscious",
  "fainted",
  "stroke",
  "seizure",
  "severe bleeding",
  "heart attack",
  "suicidal"
];

const ASSISTANT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    symptom_summary: { type: "string" },
    possible_conditions: {
      type: "array",
      items: { type: "string" }
    },
    urgency_level: {
      type: "string",
      enum: ["low", "medium", "high", "emergency"]
    },
    recommended_specialist: { type: "string" },
    next_steps: {
      type: "array",
      items: { type: "string" }
    },
    emergency: { type: "boolean" },
    disclaimer: { type: "string" }
  },
  required: [
    "symptom_summary",
    "possible_conditions",
    "urgency_level",
    "recommended_specialist",
    "next_steps",
    "emergency",
    "disclaimer"
  ]
};

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s,.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsKeyword(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i");
  return pattern.test(text);
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry && typeof entry.content === "string" && entry.content.trim())
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: entry.content.trim().slice(0, 1200)
    }))
    .slice(-MAX_HISTORY_MESSAGES);
}

function matchSpecialty(text) {
  const normalized = normalizeText(text);
  const matches = [];

  for (const entry of symptomMap) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (containsKeyword(normalized, keyword)) {
        score += keyword.includes(" ") ? 3 : 1;
      }
    }
    if (score > 0) {
      matches.push({ specialty: entry.specialty, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches[0]?.specialty || null;
}

function detectIntent(message) {
  const normalized = normalizeText(message);

  if (greetingWords.some((word) => containsKeyword(normalized, word))) {
    return "greeting";
  }

  if (helpWords.some((word) => containsKeyword(normalized, word))) {
    return "help";
  }

  if (emergencyKeywords.some((word) => containsKeyword(normalized, word))) {
    return "emergency";
  }

  return matchSpecialty(message) ? "symptom_check" : "unclear";
}

function buildReplyFromStructuredPayload(payload) {
  const parts = [];

  if (payload.symptom_summary) {
    parts.push(`Summary: ${payload.symptom_summary}.`);
  }

  if (Array.isArray(payload.possible_conditions) && payload.possible_conditions.length > 0) {
    parts.push(`Possible conditions: ${payload.possible_conditions.join(", ")}.`);
  }

  if (payload.recommended_specialist) {
    parts.push(`Recommended specialist: ${payload.recommended_specialist}.`);
  }

  if (Array.isArray(payload.next_steps) && payload.next_steps.length > 0) {
    parts.push(`Next steps: ${payload.next_steps.join(" ")}`);
  }

  if (payload.disclaimer) {
    parts.push(payload.disclaimer);
  }

  return parts.join(" ").trim();
}

function extractJsonCandidate(text) {
  const rawText = String(text || "").trim();
  if (!rawText) return "";

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : rawText;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return candidate;
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

function safeJsonParse(text) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return null;

  const attempts = [
    candidate,
    candidate.replace(/^\uFEFF/, ""),
    candidate.replace(/,\s*([}\]])/g, "$1"),
    candidate.replace(/[\u201C\u201D]/g, "\"").replace(/[\u2018\u2019]/g, "'"),
    candidate
      .replace(/[\u201C\u201D]/g, "\"")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, "$1")
  ];

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (error) {
      // Try the next cleanup strategy.
    }
  }

  return null;
}

function fallbackAssistantResponse(message) {
  const normalized = normalizeText(message);
  const specialty = matchSpecialty(message);
  const baseDisclaimer = DEFAULT_DISCLAIMER;

  if (greetingWords.some((word) => containsKeyword(normalized, word))) {
    return {
      symptom_summary: "The user greeted the assistant and has not described symptoms yet.",
      possible_conditions: ["No symptoms provided yet"],
      urgency_level: "low",
      recommended_specialist: "General Physician",
      next_steps: [
        "Describe the main symptom in simple words.",
        "Mention how long the symptom has been present.",
        "Share any severe warning signs if present."
      ],
      emergency: false,
      disclaimer: baseDisclaimer
    };
  }

  if (helpWords.some((word) => containsKeyword(normalized, word))) {
    return {
      symptom_summary: "The user asked for help using the healthcare chatbot.",
      possible_conditions: ["Symptoms not shared yet"],
      urgency_level: "low",
      recommended_specialist: "General Physician",
      next_steps: [
        "Type your main symptoms, such as fever, cough, or stomach pain.",
        "Add how long the symptoms have been happening.",
        "Mention if the symptoms are getting worse."
      ],
      emergency: false,
      disclaimer: baseDisclaimer
    };
  }

  if (emergencyKeywords.some((word) => containsKeyword(normalized, word))) {
    return {
      symptom_summary: message,
      possible_conditions: ["Serious medical emergency", "Urgent cardiopulmonary or neurological event"],
      urgency_level: "emergency",
      recommended_specialist: "General Physician",
      next_steps: [
        "Seek emergency medical care immediately.",
        "Call local emergency services right away if symptoms are severe or worsening.",
        "Do not delay in-person evaluation."
      ],
      emergency: true,
      disclaimer: baseDisclaimer
    };
  }

  if (!specialty) {
    return {
      symptom_summary: "The symptoms are not clear enough to suggest a focused condition.",
      possible_conditions: ["Unclear symptoms"],
      urgency_level: "medium",
      recommended_specialist: "General Physician",
      next_steps: [
        "Describe the main symptom more clearly.",
        "Mention how long it has been happening.",
        "Include any fever, pain, breathing trouble, or other warning signs."
      ],
      emergency: false,
      disclaimer: baseDisclaimer
    };
  }

  return {
    symptom_summary: message,
    possible_conditions: ["A condition related to the reported symptoms", "A mild or moderate infection", "An issue requiring clinical evaluation"],
    urgency_level: "medium",
    recommended_specialist: specialty || "General Physician",
    next_steps: [
      `Arrange a consultation with a ${specialty || "General Physician"}.`,
      "Monitor whether the symptoms are improving or getting worse.",
      "Seek urgent care sooner if severe symptoms appear."
    ],
    emergency: false,
    disclaimer: baseDisclaimer
  };
}

function normalizeAssistantPayload(payload, originalMessage) {
  const fallback = fallbackAssistantResponse(originalMessage);
  const allowedUrgency = new Set(["low", "medium", "high", "emergency"]);

  const summaryCandidate = payload?.symptom_summary ?? payload?.symptomSummary ?? payload?.summary;
  const possibleConditionsCandidate =
    payload?.possible_conditions ?? payload?.possibleConditions ?? payload?.conditions;
  const urgencyCandidate = payload?.urgency_level ?? payload?.urgency ?? payload?.urgencyLevel;
  const specialistCandidate =
    payload?.recommended_specialist ?? payload?.recommendedSpecialist ?? payload?.specialty;
  const nextStepsCandidate = payload?.next_steps ?? payload?.nextSteps;
  const disclaimerCandidate = payload?.disclaimer;

  const normalized = {
    symptom_summary: String(summaryCandidate || fallback.symptom_summary || originalMessage).trim(),
    possible_conditions: Array.isArray(possibleConditionsCandidate)
      ? possibleConditionsCandidate.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
      : [],
    urgency_level: allowedUrgency.has(String(urgencyCandidate || "").trim())
      ? String(urgencyCandidate).trim()
      : fallback.urgency_level,
    recommended_specialist: String(specialistCandidate || fallback.recommended_specialist).trim(),
    next_steps: Array.isArray(nextStepsCandidate)
      ? nextStepsCandidate.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
      : [],
    emergency: Boolean(payload?.emergency),
    disclaimer: String(disclaimerCandidate || DEFAULT_DISCLAIMER).trim() || DEFAULT_DISCLAIMER
  };

  if (normalized.possible_conditions.length === 0) {
    normalized.possible_conditions = fallback.possible_conditions;
  }

  if (normalized.next_steps.length === 0) {
    normalized.next_steps = fallback.next_steps;
  }

  if (!normalized.recommended_specialist) {
    normalized.recommended_specialist = fallback.recommended_specialist;
  }

  if (normalized.urgency_level === "emergency") {
    normalized.emergency = true;
  }

  if (normalized.emergency && normalized.urgency_level !== "emergency") {
    normalized.urgency_level = "emergency";
  }

  const compatibilityIntent = detectIntent(originalMessage);
  const needsMoreInfo =
    compatibilityIntent === "greeting" ||
    compatibilityIntent === "help" ||
    compatibilityIntent === "unclear";

  return {
    ...normalized,
    intent: compatibilityIntent,
    reply: buildReplyFromStructuredPayload(normalized),
    specialty: normalized.recommended_specialist || null,
    urgency: normalized.urgency_level === "emergency" ? "high" : normalized.urgency_level,
    needsLocation: !normalized.emergency && !needsMoreInfo && Boolean(normalized.recommended_specialist),
    needsMoreInfo,
    followUpQuestion: needsMoreInfo ? "Can you share the main symptom, how long it has been happening, and whether it is getting worse?" : null,
    symptomSummary: normalized.symptom_summary
  };
}

async function callGemini(message, history) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const contents = [
    ...history.map((entry) => ({
      role: entry.role === "assistant" ? "model" : "user",
      parts: [{ text: entry.content }]
    })),
    {
      role: "user",
      parts: [{ text: `User symptoms or request: ${message}` }]
    }
  ];

  const response = await fetch(`${GEMINI_API_BASE_URL}/${DEFAULT_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: STRUCTURED_SYSTEM_PROMPT }]
      },
      contents,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: ASSISTANT_RESPONSE_SCHEMA
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error("Gemini response did not include structured text content.");
  }

  const parsed = safeJsonParse(content);
  if (!parsed) {
    logger.warn("Gemini returned invalid JSON. Falling back to safe structured response.", { content });
    return normalizeAssistantPayload(null, message);
  }

  return normalizeAssistantPayload(parsed, message);
}

exports.chatAssistant = onCall(
  {
    region: "asia-south1",
    timeoutSeconds: 60,
    memory: "256MiB"
  },
  async (request) => {
    const message = String(request.data?.message || "").trim();
    const history = sanitizeHistory(request.data?.history);

    if (!message) {
      throw new HttpsError("invalid-argument", "The 'message' field is required.");
    }

    try {
      const aiResponse = await callGemini(message, history);
      if (aiResponse) {
        return {
          ...aiResponse,
          source: "gemini",
          model: DEFAULT_MODEL,
          generatedAt: new Date().toISOString()
        };
      }
    } catch (error) {
      logger.error("AI provider failed. Falling back to rules.", error);
    }

    return {
      ...fallbackAssistantResponse(message),
      source: "fallback-rules",
      model: "fallback-rules",
      generatedAt: new Date().toISOString()
    };
  }
);

exports.findNearbyClinics = onCall(
  {
    region: "asia-south1",
    timeoutSeconds: 60,
    memory: "256MiB"
  },
  async (request) => {
    const specialist = String(request.data?.specialist || "").trim();
    const locationText = String(request.data?.locationText || "").trim();
    const lat = request.data?.lat;
    const lng = request.data?.lng;
    const radius = request.data?.radius;
    const city = String(request.data?.city || "").trim();
    const state = String(request.data?.state || "").trim();

    if (!specialist) {
      throw new HttpsError("invalid-argument", "The 'specialist' field is required.");
    }

    if (!locationText && !city && !state && (lat === undefined || lng === undefined)) {
      throw new HttpsError("invalid-argument", "Provide either 'locationText' or both 'lat' and 'lng'.");
    }

    try {
      return await findNearbyClinics({
        specialist,
        locationText,
        lat,
        lng,
        radius,
        city,
        state
      });
    } catch (error) {
      logger.error("Clinic search failed.", error);
      throw new HttpsError("internal", "Unable to search clinics right now.");
    }
  }
);
