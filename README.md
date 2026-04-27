# 🛡️ MediGuide

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-Backend-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![AI](https://img.shields.io/badge/Gemini%20AI-Assistant-10B981?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-Functions-339933?style=for-the-badge&logo=node.js&logoColor=white)

MediGuide is a production-style healthcare chatbot prototype that guides a patient from symptom intake to clinic discovery and appointment booking. It combines a clean browser-based frontend with Firebase-powered backend functions for AI-assisted symptom guidance, nearby clinic search, and scheduling flows.

It provides a seamless user experience focused on intuitive healthcare accessibility, secure booking management, and clear, structured medical guidance.

## 🌐 Live Website

- Website: [Medi-Guide.web.app](https://medi-guide-ai.netlify.app/) 
- Repository: [GitHub Repository](https://github.com/Hemantx0/Vital-chatbot-)

## ✨ Highlights

- 🤖 AI-powered symptom guidance and triage
- 🏥 Location-aware clinic and hospital discovery
- 📅 Seamless slot-based appointment booking
- 👤 Patient dashboard for managing upcoming and past visits
- 🛠️ Admin console for reviewing bookings and chatbot activity
- ☁️ Firebase backend integration (Functions, Firestore, Auth)
- 🌙 Modern, responsive web UI with clean aesthetics

## 🧠 What MediGuide Does

MediGuide helps patients describe their symptoms naturally, receive structured specialist guidance, discover nearby clinics by location, and continue directly into slot-based appointment booking without losing context. 

Alongside that, the **Care Assistant AI** provides structured health guidance, evaluates symptom urgency, and suggests the most relevant specialists, while maintaining a clear medical disclaimer and fallback mechanisms.

## 🧩 Core Features

### 🤖 Care Assistant AI
- Full-screen and floating AI chat widget experiences
- Natural language symptom intake and analysis
- Firebase Cloud Functions + Gemini-powered backend
- Structured summaries including possible conditions, urgency level, and recommended specialists
- Emergency keyword detection with immediate medical escalation warnings

### 🏥 Clinic Discovery
- Location-based search using OpenStreetMap and fallback data
- Filter by recommended specialist from the AI chat
- Direct transition from discovery to booking

### 📅 Appointment Booking
- Slot-based scheduling tied to specific clinics
- Booking context preserved from the AI assistant
- Status tracking (Pending, Confirmed, Completed, Cancelled)

### 👤 Patient Dashboard & Auth
- Secure Email + Password authentication
- Personalized portal to track upcoming and closed bookings
- Quick actions to continue care journey

### 🛠️ Admin Operations Console
- Dedicated moderation interface
- Track overall booking statistics and update appointment statuses
- Review chatbot activity logs to monitor system usage and safety

## 🏗️ Tech Stack

### Frontend
- HTML5
- CSS3 (Vanilla, custom responsive grid, animations)
- JavaScript (Vanilla ES6 Modules)

### Backend & Services
- Firebase Authentication
- Cloud Firestore
- Firebase Cloud Functions (Node.js 20)

### AI & Mapping Layer
- Gemini API (Server-side integration)
- OpenStreetMap API

## 📱 App Flow

Landing / Hero → Sign In / Register → AI Chatbot (Symptom Check) → Clinic Discovery → Book Care → Dashboard

**Navigation Flow:**
Home | Find Clinics | Book Care | Dashboard | Admin Review

## 🧭 Architecture Overview

The project structure is organized for clarity and separation of concerns:

- `css/` for shared design tokens, animations, and page-specific styles
- `js/` for frontend modules (auth, dashboard, clinic API, admin logic)
- `functions/` for secure Firebase Cloud Functions source code
- `*.html` root files acting as clear entry points for app pages
- `firebase.json` & `.firebaserc` for backend configuration

## 🔒 Security & Privacy

MediGuide is built with data security and safe AI practices in mind:
- Firebase rules-based protection for user data
- Sensitive credentials (like the Gemini API key) kept strictly server-side in `.env`
- AI responses strictly typed and sanitized for consistent structured JSON output
- Fallback heuristic rules if the AI provider fails

## ⚠️ Medical Disclaimer

**MediGuide AI is not a substitute for professional medical advice, diagnosis, or treatment.**  
It is a portfolio prototype intended for general informational guidance only. It does not replace emergency services or substitute for a licensed medical professional. Users should always consult a qualified medical professional for serious or urgent health concerns.

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Firebase CLI
- Firebase Project (Auth, Firestore, Functions enabled)
- Gemini API Key

### Setup
```bash
git clone https://github.com/Hemantx0/Vital-chatbot-.git
cd Vital-chatbot-
```

### Backend & Firebase Setup
1. Navigate to the functions directory and install dependencies:
```bash
cd functions
npm install
```

2. Create a local `.env` file based on `.env.example`:
```env
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-2.5-flash
```

### Running Locally
Start the Firebase emulator for backend functions:
```bash
cd functions
npm run serve
```

Serve the frontend from the repository root using any static server (e.g., `npx serve .` or Live Server) to run on `localhost`. The client is pre-configured to connect to local emulators when running on localhost.

## 🛣️ Roadmap

- 📱 Progressive Web App (PWA) support
- 🗺️ Enhanced map integration with live routing
- 🔔 Email and push notifications for appointment updates
- 🏥 Clinic-facing dashboard for managing incoming requests
- 💬 Voice-to-text symptom input

## 👨‍💻 Developer

Built by **Hemant**

- GitHub: [@Hemantx0](https://github.com/Hemantx0)

## 📌 Project Status

MediGuide is a portfolio prototype demonstrating a production-style patient journey, exploring AI-assisted triage, clinic search, and scheduling. It is intended for learning and showcase purposes.

---

**For the GitHub About section, use this:**

A production-style healthcare chatbot prototype for AI-assisted symptom guidance, nearby clinic discovery, and seamless appointment booking.
