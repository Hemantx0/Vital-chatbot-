import {
  collection, addDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { auth, db, functions } from "./firebase.js";
import { clinics as hospitals, haversineDistanceKm, formatDistance } from "./clinic-data.js";

document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('chat-send-btn');
    const inputField = document.getElementById('chat-input-field');
    const messagesContainer = document.getElementById('chatbot-messages');
    const chatAssistant = httpsCallable(functions, 'chatAssistant');

    const symptomMap = [
        { keywords: ['fever', 'cold', 'cough', 'flu', 'headache', 'body ache', 'fatigue', 'weakness', 'nausea', 'vomit'], specialty: 'General Physician', types: ['Hospital', 'General Hospital', 'Clinic'] },
        { keywords: ['chest pain', 'heart', 'blood pressure', 'bp', 'palpitation', 'cardiac', 'cardiologist'], specialty: 'Cardiologist', types: ['Hospital', 'General Hospital'] },
        { keywords: ['tooth', 'teeth', 'gum', 'dental', 'cavity', 'mouth', 'dentist'], specialty: 'Dentist', types: ['Dental Clinic', 'Hospital'] },
        { keywords: ['skin', 'rash', 'acne', 'pimple', 'itch', 'allergy', 'eczema', 'hair loss', 'hair fall', 'dandruff', 'dermatologist'], specialty: 'Dermatologist', types: ['Skin & Hair Clinic', 'Hospital', 'Clinic'] },
        { keywords: ['child', 'baby', 'infant', 'kid', 'pediatric', 'vaccination', 'pediatrician'], specialty: 'Pediatrician', types: ['Child Care Clinic', 'Hospital', 'General Hospital'] },
        { keywords: ['bone', 'joint', 'fracture', 'knee', 'back pain', 'spine', 'shoulder', 'muscle', 'sprain', 'physiotherapy', 'paralysis', 'orthopedic', 'orthopaedic', 'physiotherapist'], specialty: 'Orthopedic / Physiotherapist', types: ['Physiotherapy Clinic', 'Hospital'] },
        { keywords: ['stomach', 'digestion', 'gastric', 'acidity', 'diarrhea', 'constipation', 'abdomen', 'liver', 'gastroenterologist'], specialty: 'Gastroenterologist', types: ['Hospital', 'General Hospital', 'Clinic'] },
        { keywords: ['eye', 'vision', 'blur', 'cataract', 'ophthalmologist'], specialty: 'Ophthalmologist', types: ['Hospital'] },
        { keywords: ['ear', 'nose', 'throat', 'sore throat', 'sinus', 'hearing', 'ent', 'otolaryngologist'], specialty: 'ENT Specialist', types: ['Hospital', 'Clinic'] },
        { keywords: ['ayurveda', 'herbal', 'natural', 'panchakarma', 'yoga', 'ayurvedic'], specialty: 'Ayurvedic Practitioner', types: ['Ayurveda Centre', 'Clinic'] },
    ];
    const greetingWords = ['hi', 'hello', 'hey', 'hii', 'helo', 'good morning', 'good afternoon', 'good evening'];
    const helpWords = ['help', 'start', 'menu', 'options'];
    const specialtySearchPhrases = ['doctor', 'specialist', 'clinic', 'hospital'];

    let botState = 'awaiting_symptom';
    let lastSymptoms = '';
    let lastSpecialty = '';
    let lastResolvedLocation = null;
    const chatSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const initialAssistantMessage = "Hello! I am your Vital Chat medical assistant. Please describe your symptoms or tell me what kind of specialist you're looking for!";
    const conversationHistory = [
        {
            role: 'assistant',
            content: initialAssistantMessage
        }
    ];

    function pushConversation(role, content) {
        if (!content) return;
        conversationHistory.push({ role, content });
        if (conversationHistory.length > 12) {
            conversationHistory.splice(0, conversationHistory.length - 12);
        }
    }

    function styleBotMsg(el) {
        el.style.padding = '1rem';
        el.style.borderRadius = 'var(--radius-lg)';
        el.style.marginBottom = '0.5rem';
        el.style.background = 'var(--bg-surface)';
        el.style.color = 'var(--text-primary)';
        el.style.alignSelf = 'flex-start';
        el.style.maxWidth = '85%';
        el.style.boxShadow = 'var(--shadow-sm)';
        el.style.borderBottomLeftRadius = '4px';
    }

    function appendMessage(text, sender, options = {}) {
        const { persist = true } = options;
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}`;

        const p = document.createElement('p');
        p.textContent = text;
        msgDiv.appendChild(p);

        msgDiv.style.padding = '1rem';
        msgDiv.style.borderRadius = 'var(--radius-lg)';
        msgDiv.style.marginBottom = '0.5rem';
        msgDiv.style.maxWidth = '85%';
        msgDiv.style.boxShadow = 'var(--shadow-sm)';

        if (sender === 'user') {
            msgDiv.style.background = 'var(--primary)';
            msgDiv.style.color = 'white';
            msgDiv.style.alignSelf = 'flex-end';
            msgDiv.style.borderBottomRightRadius = '4px';
        } else {
            msgDiv.style.background = 'var(--bg-surface)';
            msgDiv.style.color = 'var(--text-primary)';
            msgDiv.style.alignSelf = 'flex-start';
            msgDiv.style.borderBottomLeftRadius = '4px';
        }

        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (persist) {
            pushConversation(sender === 'user' ? 'user' : 'assistant', text);
        }
    }

    function normalizeText(text) {
        return text.toLowerCase().replace(/[^\w\s,.-]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function containsKeyword(text, keyword) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const pattern = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i');
        return pattern.test(text);
    }

    function isGreeting(text) {
        return greetingWords.some(word => containsKeyword(text, word));
    }

    function isHelpRequest(text) {
        return helpWords.some(word => containsKeyword(text, word));
    }

    function looksLikeSpecialtySearch(text) {
        return specialtySearchPhrases.some(word => containsKeyword(text, word));
    }

    function sanitizeAssistantResult(result) {
        if (!result || typeof result !== 'object') return null;

        return {
            intent: typeof result.intent === 'string' ? result.intent : 'unclear',
            reply: typeof result.reply === 'string' ? result.reply.trim() : '',
            specialty: typeof result.specialty === 'string' && result.specialty.trim() ? result.specialty.trim() : '',
            urgency: typeof result.urgency === 'string' ? result.urgency : 'medium',
            emergency: Boolean(result.emergency),
            needsLocation: Boolean(result.needsLocation),
            needsMoreInfo: Boolean(result.needsMoreInfo),
            followUpQuestion: typeof result.followUpQuestion === 'string' && result.followUpQuestion.trim() ? result.followUpQuestion.trim() : '',
            symptomSummary: typeof result.symptomSummary === 'string' && result.symptomSummary.trim() ? result.symptomSummary.trim() : '',
            source: typeof result.source === 'string' ? result.source : 'unknown',
            model: typeof result.model === 'string' ? result.model : 'unknown'
        };
    }

    async function getAssistantAnalysis(text) {
        try {
            // The latest user message is already appended to local history in the UI,
            // so we send only the previous turns plus the current message separately.
            const priorHistory = conversationHistory.slice(0, -1).slice(-8);
            const response = await chatAssistant({
                message: text,
                history: priorHistory
            });
            return sanitizeAssistantResult(response.data);
        } catch (error) {
            console.error('Cloud Function chatAssistant failed:', error);
            return null;
        }
    }

    function matchSpecialty(text) {
        const normalized = normalizeText(text);
        const matches = [];

        for (const entry of symptomMap) {
            let score = 0;
            for (const kw of entry.keywords) {
                if (containsKeyword(normalized, kw)) {
                    score += kw.includes(' ') ? 3 : 1;
                }
            }
            if (score > 0) {
                matches.push({ ...entry, score });
            }
        }

        matches.sort((a, b) => b.score - a.score);
        return matches[0] || null;
    }

    function getSpecialtyConfig(specialtyName, symptomText = '') {
        if (specialtyName) {
            const exactMatch = symptomMap.find(entry => entry.specialty.toLowerCase() === specialtyName.toLowerCase());
            if (exactMatch) {
                return exactMatch;
            }
        }

        return symptomText ? matchSpecialty(symptomText) : null;
    }

    function parseCoordinateInput(text) {
        const latLngPattern = /lat[:\s]*(-?\d+(\.\d+)?)[,\s]+lng[:\s]*(-?\d+(\.\d+)?)/i;
        const plainPattern = /(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/;
        let match = text.match(latLngPattern);

        if (!match) {
            match = text.match(plainPattern);
        }

        if (!match) return null;

        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[3]);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

        return { lat, lng, label: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}` };
    }

    async function geocodeLocation(queryText) {
        const coordinateInput = parseCoordinateInput(queryText);
        if (coordinateInput) {
            return coordinateInput;
        }

        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(queryText)}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Location lookup failed');
        }

        const results = await response.json();
        if (!Array.isArray(results) || results.length === 0) {
            return null;
        }

        const result = results[0];
        return {
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
            label: result.display_name || queryText
        };
    }

    function findHospitals(types, userLocation, count = 3) {
        const scored = hospitals
            .filter(hospital => types.includes(hospital.type))
            .map(hospital => {
                const distanceKm = userLocation
                    ? haversineDistanceKm(userLocation.lat, userLocation.lng, hospital.lat, hospital.lng)
                    : null;
                let score = 0;
                if (hospital.status === 'Open') score += 20;
                score += hospital.rating * 2;
                if (distanceKm !== null) {
                    score += Math.max(0, 20 - distanceKm * 2.5);
                }
                return {
                    ...hospital,
                    distanceKm,
                    distanceLabel: distanceKm !== null ? formatDistance(distanceKm) : 'Distance unavailable',
                    score
                };
            });

        scored.sort((a, b) => {
            if (a.status !== b.status) return a.status === 'Open' ? -1 : 1;
            if (a.distanceKm !== null && b.distanceKm !== null && Math.abs(a.distanceKm - b.distanceKm) > 0.2) {
                return a.distanceKm - b.distanceKm;
            }
            return b.rating - a.rating;
        });

        return scored.slice(0, count);
    }

    function buildBookingUrl(hospital) {
        const params = new URLSearchParams();
        params.set('hospital', hospital.name);
        if (lastSpecialty) params.set('specialty', lastSpecialty);
        return `appointment.html?${params.toString()}`;
    }

    function renderClinicCards(clinics) {
        const wrapper = document.createElement('div');
        wrapper.style.alignSelf = 'flex-start';
        wrapper.style.maxWidth = '90%';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '0.6rem';

        clinics.forEach(clinic => {
            const statusColor = clinic.status === 'Open' ? '#16a34a' : '#ef4444';
            const card = document.createElement('div');
            card.style.cssText = `
                background: var(--bg-surface);
                padding: 1rem;
                border-radius: var(--radius-md);
                border: 1px solid var(--border-color);
                box-shadow: var(--shadow-sm);
                transition: transform 0.2s ease;
            `;
            card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = 'var(--shadow-md)'; };
            card.onmouseleave = () => { card.style.transform = 'translateY(0)'; card.style.boxShadow = 'var(--shadow-sm)'; };

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                    <h4 style="margin:0; color: var(--primary-dark); font-size:0.95rem;">${clinic.name}</h4>
                    <span style="background:${statusColor}; color:#fff; padding:1px 8px; border-radius:20px; font-size:0.7rem; font-weight:600; white-space:nowrap;">${clinic.status}</span>
                </div>
                <p style="font-size:0.78rem; color: var(--text-secondary); margin:0.15rem 0;">
                    <i class='bx bxs-star' style="color:#facc15; font-size:0.8rem;"></i> ${clinic.rating} &bull; ${clinic.type} &bull; ${clinic.distanceLabel}
                </p>
                <p style="font-size:0.76rem; color: var(--text-muted); margin:0.15rem 0;">
                    <i class='bx bx-map' style="color:var(--primary); font-size:0.8rem;"></i> ${clinic.address}
                </p>
                <p style="font-size:0.76rem; color: var(--text-muted); margin:0.15rem 0 0.5rem;">
                    <i class='bx bx-phone' style="color:var(--primary); font-size:0.8rem;"></i> ${clinic.phone}
                </p>
                <a href="${buildBookingUrl(clinic)}" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; display:inline-flex; text-decoration:none; gap:0.3rem;">
                    <i class='bx bx-calendar-check'></i> Book Appointment
                </a>
            `;
            wrapper.appendChild(card);
        });

        messagesContainer.appendChild(wrapper);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showResetPrompt() {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot';
        styleBotMsg(msgDiv);
        msgDiv.innerHTML = `
            <p style="margin-bottom:0.5rem;">Would you like to search for another condition?</p>
            <button class="btn-outline" style="padding:0.4rem 1rem; font-size:0.85rem; cursor:pointer;" onclick="resetChatBot()">
                <i class='bx bx-refresh'></i> New Search
            </button>
        `;
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    window.resetChatBot = function() {
        botState = 'awaiting_symptom';
        lastSymptoms = '';
        lastSpecialty = '';
        lastResolvedLocation = null;
        conversationHistory.length = 0;
        appendMessage("Sure! Please describe your new symptoms and I'll find the best care for you.", 'bot');
    };

    async function logChatToFirebase(userInput, botResponse, specialty, metadata = {}) {
        try {
            const user = auth.currentUser;
            await addDoc(collection(db, "chat_logs"), {
                userId: user ? user.uid : "anonymous",
                sessionId: chatSessionId,
                symptomInput: userInput,
                botResponse: botResponse,
                specialty: specialty,
                urgency: metadata.urgency || "medium",
                emergency: Boolean(metadata.emergency),
                symptomSummary: metadata.symptomSummary || userInput,
                responseSource: metadata.source || "frontend-rules",
                responseModel: metadata.model || "frontend-rules",
                reviewStatus: metadata.reviewStatus || "new",
                timestamp: Timestamp.now()
            });
        } catch (error) {
            console.error("Error saving chat log:", error);
        }
    }

    function showLocationPrompt() {
        const specialtyText = lastSpecialty ? ` for a ${lastSpecialty}` : '';
        appendMessage(`Let me find the nearest top-rated clinics${specialtyText}. Share your live location or type your area, such as Jagatpura or Malviya Nagar.`, 'bot');

        const btnId = 'loc-btn-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot';
        styleBotMsg(msgDiv);
        msgDiv.innerHTML = `
            <div id="${btnId}" style="margin-top:0.25rem;">
                <button class="btn-primary" style="padding:0.5rem 1rem; font-size:0.9rem;" onclick="requestBotLocation('${btnId}')">
                    <i class='bx bx-current-location'></i> Share My Location
                </button>
            </div>
        `;
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        botState = 'awaiting_location';
    }

    async function analyzeSymptomInput(text) {
        const normalized = normalizeText(text);

        if (isGreeting(normalized)) {
            botState = 'awaiting_symptom';
            appendMessage("Hello! Please tell me your symptoms like fever, cough, tooth pain, skin rash, or the specialist you want, such as dentist or cardiologist.", 'bot');
            return;
        }

        if (isHelpRequest(normalized)) {
            botState = 'awaiting_symptom';
            appendMessage("You can describe your symptoms in simple words, for example: 'I have fever and cough' or 'I need a dentist'.", 'bot');
            return;
        }

        const assistantResult = await getAssistantAnalysis(text);
        if (assistantResult && assistantResult.reply) {
            lastSymptoms = assistantResult.symptomSummary || text;
            lastSpecialty = assistantResult.specialty || '';

            appendMessage(assistantResult.reply, 'bot');

            let combinedBotResponse = assistantResult.reply;
            if (assistantResult.followUpQuestion && !assistantResult.reply.includes(assistantResult.followUpQuestion)) {
                appendMessage(assistantResult.followUpQuestion, 'bot');
                combinedBotResponse += ` ${assistantResult.followUpQuestion}`;
            }

            if (assistantResult.emergency) {
                appendMessage("If the condition feels severe, sudden, or is getting worse, please go to the nearest emergency facility immediately.", 'bot');
                combinedBotResponse += " Emergency warning shown.";
            }

            logChatToFirebase(text, combinedBotResponse, lastSpecialty || 'Unclear', assistantResult);

            if (assistantResult.specialty && assistantResult.needsLocation && !assistantResult.needsMoreInfo && !assistantResult.emergency) {
                setTimeout(() => {
                    showLocationPrompt();
                }, 600);
                return;
            }

            botState = 'awaiting_symptom';
            return;
        }

        const match = matchSpecialty(text);
        if (!match) {
            botState = 'awaiting_symptom';
            appendMessage("I couldn't clearly identify the health issue from that message. Please describe your symptoms in a bit more detail, like 'stomach pain and nausea' or 'skin rash'.", 'bot');
            return;
        }

        lastSymptoms = text;
        lastSpecialty = match.specialty;

        const isDirectSearch = looksLikeSpecialtySearch(normalized) || containsKeyword(normalized, match.specialty.toLowerCase());
        const botReply = isDirectSearch
            ? `I can help you find a ${match.specialty}.`
            : `Based on the symptoms you shared, the best match is a ${match.specialty}.`;

        appendMessage(botReply, 'bot');
        logChatToFirebase(text, botReply, lastSpecialty, {
            urgency: 'medium',
            emergency: false,
            symptomSummary: text,
            source: 'frontend-rules',
            model: 'frontend-rules'
        });

        setTimeout(() => {
            showLocationPrompt();
        }, 600);
    }

    function showLoadingAndAnalyze(text) {
        botState = 'processing';
        const loadingId = 'loading-' + Date.now();
        const loadingDiv = document.createElement('div');
        loadingDiv.id = loadingId;
        loadingDiv.className = 'message bot type-indicator';
        loadingDiv.innerHTML = '<p><i class="bx bx-loader-alt bx-spin"></i> Analyzing your symptoms...</p>';
        loadingDiv.style.padding = '1rem';
        loadingDiv.style.borderRadius = 'var(--radius-lg)';
        loadingDiv.style.background = 'var(--bg-surface)';
        loadingDiv.style.color = 'var(--text-muted)';
        loadingDiv.style.alignSelf = 'flex-start';
        messagesContainer.appendChild(loadingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        setTimeout(async () => {
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();
            await analyzeSymptomInput(text);
        }, 1000);
    }

    async function resolveAndShowClinics(locationText) {
        botState = 'finding_clinics';
        appendMessage(`Searching for the best clinics near: ${locationText}...`, 'bot');

        try {
            const resolvedLocation = await geocodeLocation(locationText);
            if (!resolvedLocation) {
                botState = 'awaiting_location';
                appendMessage("I couldn't find that location. Please try a nearby area name, landmark, or share your live location.", 'bot');
                return;
            }

            lastResolvedLocation = resolvedLocation;
            const specialtyConfig = getSpecialtyConfig(lastSpecialty, lastSymptoms);
            if (!specialtyConfig) {
                botState = 'awaiting_symptom';
                appendMessage("I understood the concern, but I couldn't map it to a clinic type yet. Please try describing the symptom again or name the specialist directly.", 'bot');
                return;
            }

            const results = findHospitals(specialtyConfig.types, resolvedLocation, 3);

            if (results.length === 0) {
                botState = 'awaiting_symptom';
                appendMessage("I couldn't find matching clinics for that specialty right now. Please try another symptom or specialty.", 'bot');
                return;
            }

            appendMessage(`I found ${results.length} nearby options for a ${lastSpecialty} around ${resolvedLocation.label}.`, 'bot');

            setTimeout(() => {
                renderClinicCards(results);

                setTimeout(() => {
                    appendMessage('Click "Book Appointment" on any card above to schedule your visit. The nearest open options are shown first.', 'bot');
                    botState = 'done';
                    showResetPrompt();
                }, 400);
            }, 300);
        } catch (error) {
            botState = 'awaiting_location';
            appendMessage("I couldn't fetch location details right now. Please try again in a moment or share your live location.", 'bot');
            console.error("Location lookup failed:", error);
        }
    }

    function handleSend() {
        const text = inputField.value.trim();
        if (!text) return;

        appendMessage(text, 'user');
        inputField.value = '';

        if (botState === 'awaiting_symptom') {
            showLoadingAndAnalyze(text);
        } else if (botState === 'awaiting_location') {
            resolveAndShowClinics(text);
        } else if (botState === 'done') {
            window.resetChatBot();
            showLoadingAndAnalyze(text);
        }
    }

    window.requestBotLocation = function(btnContainerId) {
        const container = document.getElementById(btnContainerId);
        if (container) {
            container.innerHTML = '<p><i class="bx bx-loader-alt bx-spin"></i> Fetching location...</p>';
        }

        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    resolveAndShowClinics(`Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`);
                },
                () => {
                    if (container) container.innerHTML = '<p style="color:#ef4444;">Location access denied. Please type your area name instead.</p>';
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            if (container) container.innerHTML = '<p style="color:#ef4444;">Geolocation not supported. Please type your area name.</p>';
        }
    };

    if (sendBtn) {
        sendBtn.addEventListener('click', handleSend);
    }
    if (inputField) {
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSend();
        });
    }
});
