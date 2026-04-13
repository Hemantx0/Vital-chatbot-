const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");

initializeApp();

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_HISTORY_MESSAGES = 8;

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

const SYSTEM_PROMPT = `
You are Vital Chat's healthcare guidance assistant for a college project.
Your job is to:
- understand the user's health concern
- ask for clarification when symptoms are vague
- recommend the most relevant medical specialty
- detect urgent or emergency language
- keep the tone calm, clear, and supportive

Safety rules:
- do not provide a final medical diagnosis
- do not prescribe medicines or dosages
- do not claim certainty about disease
- when symptoms sound severe, tell the user to seek urgent or emergency care
- when information is limited, ask a short follow-up question

Return only valid JSON with this exact shape:
{
  "intent": "greeting" | "help" | "symptom_check" | "specialist_search" | "unclear" | "emergency",
  "reply": "string",
  "specialty": "string or null",
  "urgency": "low" | "medium" | "high",
  "emergency": true or false,
  "needsLocation": true or false,
  "needsMoreInfo": true or false,
  "followUpQuestion": "string or null",
  "symptomSummary": "string or null"
}
`.trim();

const ASSISTANT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["greeting", "help", "symptom_check", "specialist_search", "unclear", "emergency"]
    },
    reply: { type: "string" },
    specialty: { type: ["string", "null"] },
    urgency: {
      type: "string",
      enum: ["low", "medium", "high"]
    },
    emergency: { type: "boolean" },
    needsLocation: { type: "boolean" },
    needsMoreInfo: { type: "boolean" },
    followUpQuestion: { type: ["string", "null"] },
    symptomSummary: { type: ["string", "null"] }
  },
  required: [
    "intent",
    "reply",
    "specialty",
    "urgency",
    "emergency",
    "needsLocation",
    "needsMoreInfo",
    "followUpQuestion",
    "symptomSummary"
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

function fallbackAssistantResponse(message) {
  const normalized = normalizeText(message);

  if (greetingWords.some((word) => containsKeyword(normalized, word))) {
    return {
      intent: "greeting",
      reply: "Hello! Please tell me your symptoms in simple words, or mention the specialist you want, such as dentist or cardiologist.",
      specialty: null,
      urgency: "low",
      emergency: false,
      needsLocation: false,
      needsMoreInfo: true,
      followUpQuestion: null,
      symptomSummary: null
    };
  }

  if (helpWords.some((word) => containsKeyword(normalized, word))) {
    return {
      intent: "help",
      reply: "You can type symptoms like 'fever and cough' or say which doctor you need, such as 'I need a dentist'.",
      specialty: null,
      urgency: "low",
      emergency: false,
      needsLocation: false,
      needsMoreInfo: true,
      followUpQuestion: null,
      symptomSummary: null
    };
  }

  if (emergencyKeywords.some((word) => containsKeyword(normalized, word))) {
    return {
      intent: "emergency",
      reply: "These symptoms may need urgent medical attention. Please seek immediate care at the nearest emergency facility or call local emergency services if the condition is severe.",
      specialty: "Emergency Care",
      urgency: "high",
      emergency: true,
      needsLocation: false,
      needsMoreInfo: false,
      followUpQuestion: null,
      symptomSummary: message
    };
  }

  const specialty = matchSpecialty(message);
  if (!specialty) {
    return {
      intent: "unclear",
      reply: "I couldn't clearly understand the health concern yet. Please describe the symptoms in a bit more detail, like 'stomach pain and nausea' or 'skin rash'.",
      specialty: null,
      urgency: "medium",
      emergency: false,
      needsLocation: false,
      needsMoreInfo: true,
      followUpQuestion: "Can you tell me the main symptom and how long you have had it?",
      symptomSummary: null
    };
  }

  return {
    intent: "symptom_check",
    reply: `Based on what you shared, the best next step is to consult a ${specialty}.`,
    specialty,
    urgency: "medium",
    emergency: false,
    needsLocation: true,
    needsMoreInfo: false,
    followUpQuestion: null,
    symptomSummary: message
  };
}

function normalizeAssistantPayload(payload, originalMessage) {
  const allowedIntents = new Set(["greeting", "help", "symptom_check", "specialist_search", "unclear", "emergency"]);
  const allowedUrgency = new Set(["low", "medium", "high"]);

  const normalized = {
    intent: allowedIntents.has(payload?.intent) ? payload.intent : "unclear",
    reply: String(payload?.reply || "").trim(),
    specialty: payload?.specialty ? String(payload.specialty).trim() : null,
    urgency: allowedUrgency.has(payload?.urgency) ? payload.urgency : "medium",
    emergency: Boolean(payload?.emergency),
    needsLocation: Boolean(payload?.needsLocation),
    needsMoreInfo: Boolean(payload?.needsMoreInfo),
    followUpQuestion: payload?.followUpQuestion ? String(payload.followUpQuestion).trim() : null,
    symptomSummary: payload?.symptomSummary ? String(payload.symptomSummary).trim() : originalMessage
  };

  if (!normalized.reply) {
    normalized.reply = fallbackAssistantResponse(originalMessage).reply;
  }

  return normalized;
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
      parts: [{ text: message }]
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
        parts: [{ text: SYSTEM_PROMPT }]
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

  return normalizeAssistantPayload(JSON.parse(content), message);
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
