import {
  collection, addDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { auth, db, functions } from "./firebase.js";
import { requestNearbyClinics } from "./clinic-search-api.js";
import { normalizeClinic, saveSelectedClinic } from "./clinic-utils.js";
import { escapeHtml } from "./ui-utils.js";

document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('chat-send-btn');
    const inputField = document.getElementById('chat-input-field');
    const messagesContainer = document.getElementById('chatbot-messages');
    const chatAssistant = httpsCallable(functions, 'chatAssistant');
    const summarySymptoms = document.getElementById('summary-symptoms');
    const summaryUrgency = document.getElementById('summary-urgency');
    const summarySpecialist = document.getElementById('summary-specialist');
    const summaryNextSteps = document.getElementById('summary-next-steps');

    const symptomMap = [
        { keywords: ['fever', 'cold', 'cough', 'flu', 'headache', 'body ache', 'fatigue', 'weakness', 'nausea', 'vomit'], specialty: 'General Physician' },
        { keywords: ['chest pain', 'heart', 'blood pressure', 'bp', 'palpitation', 'cardiac', 'cardiologist'], specialty: 'Cardiologist' },
        { keywords: ['tooth', 'teeth', 'gum', 'dental', 'cavity', 'mouth', 'dentist'], specialty: 'Dentist' },
        { keywords: ['skin', 'rash', 'acne', 'pimple', 'itch', 'allergy', 'eczema', 'hair loss', 'hair fall', 'dandruff', 'dermatologist'], specialty: 'Dermatologist' },
        { keywords: ['child', 'baby', 'infant', 'kid', 'pediatric', 'vaccination', 'pediatrician'], specialty: 'Pediatrician' },
        { keywords: ['bone', 'joint', 'fracture', 'knee', 'back pain', 'spine', 'shoulder', 'muscle', 'sprain', 'physiotherapy', 'paralysis', 'orthopedic', 'orthopaedic', 'physiotherapist'], specialty: 'Orthopedic / Physiotherapist' },
        { keywords: ['stomach', 'digestion', 'gastric', 'acidity', 'diarrhea', 'constipation', 'abdomen', 'liver', 'gastroenterologist'], specialty: 'Gastroenterologist' },
        { keywords: ['eye', 'vision', 'blur', 'cataract', 'ophthalmologist'], specialty: 'Ophthalmologist' },
        { keywords: ['ear', 'nose', 'throat', 'sore throat', 'sinus', 'hearing', 'ent', 'otolaryngologist'], specialty: 'ENT Specialist' },
        { keywords: ['ayurveda', 'herbal', 'natural', 'panchakarma', 'yoga', 'ayurvedic'], specialty: 'Ayurvedic Practitioner' },
    ];
    const greetingWords = ['hi', 'hello', 'hey', 'hii', 'helo', 'good morning', 'good afternoon', 'good evening'];
    const helpWords = ['help', 'start', 'menu', 'options'];
    const specialtySearchPhrases = ['doctor', 'specialist', 'clinic', 'hospital'];

    let botState = 'awaiting_symptom';
    let lastSymptoms = '';
    let lastSpecialty = '';
    let lastClinicSearchPayload = null;
    let hasRequestedLocation = false;
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

    function appendBotCard(html) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot';
        styleBotMsg(msgDiv);
        msgDiv.innerHTML = html;
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return msgDiv;
    }

    function setSummaryValue(element, html) {
        if (!element) return;
        element.innerHTML = html;
    }

    function getUrgencyBadge(result) {
        const urgency = (result?.urgencyLevel || result?.urgency || '').toLowerCase();
        if (urgency === 'emergency') return '<span class="status-badge status-badge--danger">Emergency</span>';
        if (urgency === 'high') return '<span class="status-badge status-badge--danger">High</span>';
        if (urgency === 'medium') return '<span class="status-badge status-badge--pending">Medium</span>';
        if (urgency === 'low') return '<span class="status-badge status-badge--success">Low</span>';
        return '<span class="chip chip--neutral">Awaiting analysis</span>';
    }

    function updateSummaryPanel(result = {}, options = {}) {
        const { reset = false } = options;

        if (reset) {
            setSummaryValue(summarySymptoms, 'Your latest symptom summary will appear here.');
            setSummaryValue(summaryUrgency, '<span class="chip chip--neutral">Awaiting symptom details</span>');
            setSummaryValue(summarySpecialist, 'We’ll suggest the most relevant specialist after symptom analysis.');
            setSummaryValue(summaryNextSteps, 'Guidance and follow-up steps will be listed here as the conversation progresses.');
            return;
        }

        if (result.symptomSummary || result.structuredSymptomSummary) {
            setSummaryValue(summarySymptoms, `<div class="summary-hero-value">${escapeHtml(result.structuredSymptomSummary || result.symptomSummary)}</div>`);
        }

        setSummaryValue(summaryUrgency, getUrgencyBadge(result));

        if (result.recommendedSpecialist || result.specialty) {
            setSummaryValue(summarySpecialist, `<div class="summary-hero-value">${escapeHtml(result.recommendedSpecialist || result.specialty)}</div>`);
        }

        if (Array.isArray(result.nextSteps) && result.nextSteps.length > 0) {
            setSummaryValue(summaryNextSteps, `<div class="summary-list">${result.nextSteps.map((step) => `<div class="summary-list-item">${escapeHtml(step)}</div>`).join('')}</div>`);
        } else if (result.followUpQuestion) {
            setSummaryValue(summaryNextSteps, `<div class="summary-list"><div class="summary-list-item">${escapeHtml(result.followUpQuestion)}</div></div>`);
        }
    }

    function getRecommendedSpecialty(result) {
        return result?.recommendedSpecialist || result?.specialty || '';
    }

    function isClinicSearchReady(result) {
        const specialist = getRecommendedSpecialty(result);
        const urgency = result?.urgencyLevel || result?.urgency || '';

        return Boolean(
            specialist &&
            !result?.emergency &&
            (
                result?.needsLocation ||
                urgency ||
                result?.structuredSymptomSummary ||
                result?.symptomSummary
            )
        );
    }

    function appendAssistantAlert(message, type = 'info') {
        const alertCard = appendBotCard(`<div class="assistant-alert assistant-alert--${type}">${message}</div>`);
        alertCard.style.maxWidth = '92%';
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
            structuredSymptomSummary: typeof result.symptom_summary === 'string' && result.symptom_summary.trim() ? result.symptom_summary.trim() : '',
            possibleConditions: Array.isArray(result.possible_conditions)
                ? result.possible_conditions.map((item) => String(item || '').trim()).filter(Boolean)
                : [],
            urgencyLevel: typeof result.urgency_level === 'string' ? result.urgency_level : '',
            recommendedSpecialist: typeof result.recommended_specialist === 'string' && result.recommended_specialist.trim()
                ? result.recommended_specialist.trim()
                : '',
            nextSteps: Array.isArray(result.next_steps)
                ? result.next_steps.map((item) => String(item || '').trim()).filter(Boolean)
                : [],
            disclaimer: typeof result.disclaimer === 'string' && result.disclaimer.trim() ? result.disclaimer.trim() : '',
            source: typeof result.source === 'string' ? result.source : 'unknown',
            model: typeof result.model === 'string' ? result.model : 'unknown'
        };
    }

    function buildStructuredAssistantMessages(result) {
        const messages = [];
        const summary = result.structuredSymptomSummary || result.symptomSummary;
        const specialist = result.recommendedSpecialist || result.specialty;
        const urgency = result.urgencyLevel || result.urgency;

        if (summary) {
            messages.push(`Symptom summary: ${summary}`);
        }

        if (result.possibleConditions.length > 0) {
            messages.push(`Possible conditions: ${result.possibleConditions.join(', ')}`);
        }

        if (urgency) {
            const urgencyLabel = urgency.charAt(0).toUpperCase() + urgency.slice(1);
            messages.push(`Urgency level: ${urgencyLabel}`);
        }

        if (specialist) {
            messages.push(`Recommended specialist: ${specialist}`);
        }

        if (result.nextSteps.length > 0) {
            messages.push(`Next steps: ${result.nextSteps.join(' ')}`);
        } else if (result.reply) {
            messages.push(result.reply);
        }

        if (result.disclaimer) {
            messages.push(result.disclaimer);
        }

        if (messages.length === 0 && result.reply) {
            messages.push(result.reply);
        }

        return messages;
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

    function removeElement(element) {
        if (element && typeof element.remove === 'function') {
            element.remove();
        }
    }

    function buildClinicSearchPayload(locationInput, specialist) {
        if (typeof locationInput === 'string') {
            return {
                specialist,
                locationText: locationInput
            };
        }

        return {
            specialist,
            locationText: locationInput?.label || '',
            lat: locationInput?.lat,
            lng: locationInput?.lng
        };
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

    function formatDistanceLabel(distanceKm) {
        return typeof distanceKm === 'number' ? `${distanceKm.toFixed(1)} km` : 'Distance unavailable';
    }

    function getClinicSourceLabel(clinic) {
        if (clinic?.source === 'openstreetmap') return 'Nearby clinic';
        if (clinic?.source === 'fallback_local') return 'Fallback clinic';
        return clinic?.source || 'Recommended clinic';
    }

    function getClinicSourceChipClass(clinic) {
        if (clinic?.source === 'openstreetmap') return 'chip chip--info';
        if (clinic?.source === 'fallback_local') return 'chip chip--neutral';
        return 'chip';
    }

    function buildBookingUrl() {
        return 'appointment.html';
    }

    function prepareClinicForBooking(clinic) {
        return normalizeClinic(clinic, {
            specialtyMatched: lastSpecialty,
            searchContext: lastClinicSearchPayload?.locationText || lastClinicSearchPayload?.label || ''
        });
    }

    function renderClinicCards(clinics) {
        const wrapper = document.createElement('div');
        wrapper.style.alignSelf = 'flex-start';
        wrapper.style.maxWidth = '90%';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '0.6rem';

        clinics.forEach(clinic => {
            const bookingClinic = prepareClinicForBooking(clinic);
            const isOpen = bookingClinic?.openNow === true;
            const statusLabel = isOpen ? 'Open' : 'Check timings';
            const statusClass = isOpen ? 'status-badge status-badge--success' : 'status-badge status-badge--neutral';
            const distanceLabel = formatDistanceLabel(bookingClinic?.distanceKm);
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
                    <h4 style="margin:0; color: var(--primary-dark); font-size:0.95rem;">${bookingClinic.name}</h4>
                    <span class="${statusClass}" style="white-space:nowrap;">${statusLabel}</span>
                </div>
                <div class="meta-chips" style="margin:0.2rem 0 0.75rem;">
                    <span class="${getClinicSourceChipClass(bookingClinic)}">${getClinicSourceLabel(bookingClinic)}</span>
                    <span class="chip chip--neutral"><i class='bx bxs-star' style="color:#facc15; font-size:0.8rem;"></i> ${bookingClinic.rating || 'N/A'}</span>
                    <span class="chip chip--secondary">${distanceLabel}</span>
                </div>
                <p style="font-size:0.76rem; color: var(--text-muted); margin:0.15rem 0;">
                    <i class='bx bx-map' style="color:var(--primary); font-size:0.8rem;"></i> ${bookingClinic.address}
                </p>
                <p style="font-size:0.76rem; color: var(--text-muted); margin:0.15rem 0 0.5rem;">
                    <i class='bx bx-phone' style="color:var(--primary); font-size:0.8rem;"></i> ${bookingClinic.phone || 'Phone not available'}
                </p>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <a href="${buildBookingUrl()}" data-book-appointment="true" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; display:inline-flex; text-decoration:none; gap:0.3rem;">
                        <i class='bx bx-calendar-check'></i> Book Appointment
                    </a>
                    ${bookingClinic.mapsUrl
                        ? `<a href="${bookingClinic.mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-outline" style="padding:0.4rem 1rem; font-size:0.8rem; display:inline-flex; text-decoration:none; gap:0.3rem;">
                            <i class='bx bx-map-alt'></i> Open Map
                        </a>`
                        : ''}
                </div>
            `;

            const bookingLink = card.querySelector('[data-book-appointment="true"]');
            if (bookingLink && bookingClinic) {
                bookingLink.addEventListener('click', () => {
                    saveSelectedClinic(bookingClinic);
                });
            }

            wrapper.appendChild(card);
        });

        messagesContainer.appendChild(wrapper);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showResetPrompt() {
        appendBotCard(`
            <p style="margin-bottom:0.5rem;">Would you like to search for another condition?</p>
            <button class="btn-outline" style="padding:0.4rem 1rem; font-size:0.85rem; cursor:pointer;" onclick="resetChatBot()">
                <i class='bx bx-refresh'></i> New Search
            </button>
        `);
    }

    function renderClinicLoadingState() {
        return appendBotCard(`
            <p style="margin:0; display:flex; align-items:center; gap:0.5rem;">
                <i class="bx bx-loader-alt bx-spin"></i>
                Searching nearby clinics and hospitals...
            </p>
        `);
    }

    function renderClinicEmptyState(message) {
        appendBotCard(`
            <p style="margin:0 0 0.75rem;">${message}</p>
            <button class="btn-outline" style="padding:0.45rem 1rem; font-size:0.85rem; cursor:pointer;" onclick="retryClinicSearch()">
                <i class='bx bx-refresh'></i> Try Again
            </button>
        `);
    }

    function renderClinicErrorState(message) {
        appendBotCard(`
            <p style="margin:0 0 0.75rem; color:#b91c1c;">${message}</p>
            <button class="btn-outline" style="padding:0.45rem 1rem; font-size:0.85rem; cursor:pointer;" onclick="retryClinicSearch()">
                <i class='bx bx-refresh'></i> Retry Search
            </button>
        `);
        appendMessage('You can also type a nearby area name or share your live location again.', 'bot');
    }

    window.resetChatBot = function() {
        botState = 'awaiting_symptom';
        lastSymptoms = '';
        lastSpecialty = '';
        lastClinicSearchPayload = null;
        hasRequestedLocation = false;
        conversationHistory.length = 0;
        updateSummaryPanel({}, { reset: true });
        appendMessage("Sure! Please describe your new symptoms and I'll find the best care for you.", 'bot');
    };

    window.retryClinicSearch = function() {
        if (!lastClinicSearchPayload) {
            appendMessage("Please share your location again so I can search nearby clinics.", 'bot');
            botState = 'awaiting_location';
            return;
        }

        resolveAndShowClinics(lastClinicSearchPayload);
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
        if (hasRequestedLocation || !lastSpecialty) {
            return;
        }

        hasRequestedLocation = true;
        const specialtyText = lastSpecialty ? ` for a ${lastSpecialty}` : '';
        appendMessage(`Please enter your location or share your area to find nearby clinics${specialtyText}. You can type an area name like Jagatpura or Malviya Nagar.`, 'bot');

        const btnId = 'loc-btn-' + Date.now();
        appendBotCard(`
            <div id="${btnId}" style="margin-top:0.25rem;">
                <button class="btn-primary" style="padding:0.5rem 1rem; font-size:0.9rem;" onclick="requestBotLocation('${btnId}')">
                    <i class='bx bx-current-location'></i> Share My Location
                </button>
            </div>
        `);
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
        const hasStructuredAssistantResult =
            Boolean(assistantResult) &&
            Boolean(
                assistantResult.reply ||
                assistantResult.recommendedSpecialist ||
                assistantResult.specialty ||
                assistantResult.structuredSymptomSummary ||
                assistantResult.symptomSummary
            );

        if (hasStructuredAssistantResult) {
            lastSymptoms = assistantResult.structuredSymptomSummary || assistantResult.symptomSummary || text;
            lastSpecialty = getRecommendedSpecialty(assistantResult);
            hasRequestedLocation = false;

            const structuredMessages = buildStructuredAssistantMessages(assistantResult);
            structuredMessages.forEach((message) => appendMessage(message, 'bot'));
            updateSummaryPanel(assistantResult);

            let combinedBotResponse = structuredMessages.join(' ');
            if (assistantResult.followUpQuestion) {
                appendAssistantAlert(escapeHtml(assistantResult.followUpQuestion), 'info');
                combinedBotResponse += ` ${assistantResult.followUpQuestion}`;
            }

            if (assistantResult.emergency) {
                appendAssistantAlert("If the condition feels severe, sudden, or is getting worse, please go to the nearest emergency facility immediately.", 'danger');
                combinedBotResponse += " Emergency warning shown.";
            }

            logChatToFirebase(text, combinedBotResponse, lastSpecialty || 'Unclear', assistantResult);

            const shouldRequestLocation = isClinicSearchReady(assistantResult);

            if (shouldRequestLocation) {
                setTimeout(() => {
                    showLocationPrompt();
                }, 600);
                return;
            }

            botState = 'awaiting_symptom';
            return;
        }

        // Keep a lightweight client fallback so the symptom flow still responds
        // if the callable assistant is temporarily unavailable.
        const match = matchSpecialty(text);
        if (!match) {
            botState = 'awaiting_symptom';
            appendMessage("I couldn't clearly identify the health issue from that message. Please describe your symptoms in a bit more detail, like 'stomach pain and nausea' or 'skin rash'.", 'bot');
            return;
        }

        lastSymptoms = text;
        lastSpecialty = match.specialty;
        hasRequestedLocation = false;
        updateSummaryPanel({
            symptomSummary: text,
            urgency: 'medium',
            specialty: match.specialty,
            nextSteps: [`Arrange a consultation with a ${match.specialty}.`, 'Share your location to see nearby care options.']
        });

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
        loadingDiv.innerHTML = '<div class="assistant-alert assistant-alert--info"><i class="bx bx-loader-alt bx-spin"></i> Analyzing your symptoms...</div>';
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

    async function resolveAndShowClinics(locationInput) {
        botState = 'finding_clinics';
        const specialist = lastSpecialty || 'General Physician';
        const clinicSearchPayload = buildClinicSearchPayload(locationInput, specialist);
        lastClinicSearchPayload = clinicSearchPayload;
        const loadingCard = renderClinicLoadingState();

        try {
            const clinicSearchResult = await requestNearbyClinics(clinicSearchPayload);
            removeElement(loadingCard);

            if (!clinicSearchResult?.success) {
                botState = 'awaiting_location';
                renderClinicErrorState(clinicSearchResult?.message || "I couldn't find that location. Please try a nearby area name, landmark, or share your live location.");
                return;
            }

            const results = Array.isArray(clinicSearchResult.clinics) ? clinicSearchResult.clinics : [];

            if (results.length === 0) {
                botState = 'awaiting_location';
                renderClinicEmptyState(clinicSearchResult.message || `No suitable nearby ${specialist.toLowerCase()} clinics were found. Try a broader area or live location.`);
                return;
            }

            appendMessage(
                clinicSearchResult.message || `I found ${results.length} nearby options for a ${specialist}.`,
                'bot'
            );
            if (clinicSearchResult.resolvedLocation) {
                appendAssistantAlert(`Showing results around ${escapeHtml(clinicSearchResult.resolvedLocation)}.`, 'info');
            }

            setTimeout(() => {
                renderClinicCards(results);

                setTimeout(() => {
                    appendMessage('Click "Book Appointment" on any card above to schedule your visit. The nearest open options are shown first.', 'bot');
                    botState = 'done';
                    showResetPrompt();
                }, 400);
            }, 300);
        } catch (error) {
            removeElement(loadingCard);
            botState = 'awaiting_location';
            renderClinicErrorState("Live clinic search is slow right now. Please try again, use a nearby landmark, or share your live location.");
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
                    resolveAndShowClinics({
                        lat,
                        lng,
                        label: 'your current location'
                    });
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

    updateSummaryPanel({}, { reset: true });
});
