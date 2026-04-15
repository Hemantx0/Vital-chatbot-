# Vital Chat

Vital Chat is a production-style healthcare chatbot prototype that guides a patient from symptom intake to clinic discovery and appointment booking. It combines a browser-based frontend with Firebase-powered backend functions for AI-assisted symptom guidance, nearby clinic search, and scheduling flows.

This repository is intended for portfolio and learning use. It is not a certified medical product and should not be represented as a replacement for licensed clinical care.

## What it does

- Symptom-first AI chat flow with structured health guidance
- Specialist recommendation based on user symptoms
- Nearby clinic discovery with location-aware search and fallback clinic data
- Slot-based appointment booking and appointment status management
- Patient dashboard for tracking upcoming and completed bookings
- Admin-facing workflow for reviewing bookings and chatbot activity

## Tech stack

- Frontend: HTML, CSS, vanilla JavaScript modules
- Backend: Firebase Cloud Functions for Node.js 20
- Database/Auth: Firebase Firestore and Firebase Authentication
- AI integration: Gemini API via secure server-side environment variable
- Maps/clinic search: OpenStreetMap and fallback local clinic records

## Project structure

```text
.
|-- css/                  # Shared and page-specific styles
|-- js/                   # Frontend modules
|-- functions/            # Firebase Cloud Functions source
|-- *.html                # App entry pages
|-- firebase.json         # Firebase configuration
|-- .firebaserc           # Firebase project alias
```

## Local setup

### 1. Prerequisites

- Node.js 20+
- Firebase CLI
- A Firebase project with Authentication, Firestore, and Functions enabled
- A Gemini API key for the assistant fallback/structured guidance flow

### 2. Install backend dependencies

```bash
cd functions
npm install
```

### 3. Configure environment variables

Create a local file at `functions/.env` based on `functions/.env.example`.

Required variables:

- `GEMINI_API_KEY`: API key used by Firebase Functions to call Gemini
- `GEMINI_MODEL`: Optional model override. The default is `gemini-2.5-flash`

Example:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Do not commit real `.env` files.

### 4. Run locally

Start the Functions emulator:

```bash
cd functions
npm run serve
```

Serve the frontend from the repository root using any simple static server so the browser runs on `localhost`. For example:

```bash
npx serve .
```

When the frontend is opened from `localhost`, the app is already configured to call the local Functions emulator.

## Firebase notes

- `js/firebase.js` contains the Firebase web app config used by the browser client.
- Firebase web config values are project identifiers, not private server secrets.
- Sensitive credentials such as the Gemini API key must stay in `functions/.env` and out of Git.
- Firestore security rules and production deployment hardening should be reviewed before any real-world use.

## Portfolio positioning

This project should be described as:

- A healthcare chatbot prototype
- A production-style patient journey demo
- A portfolio project exploring AI-assisted triage, clinic search, and scheduling

This project should not be described as:

- A certified medical device
- A diagnostic system
- A fully production-ready healthcare platform

## Safety disclaimer

The chatbot provides general informational guidance only. It does not diagnose conditions, replace emergency services, or substitute for a licensed medical professional.

## GitHub readiness

Before pushing:

1. Keep `functions/.env` local only.
2. Install dependencies locally with `npm install` inside `functions/` instead of committing `node_modules`.
3. Review Firebase project settings if publishing the repository publicly.
4. Verify Firestore/Auth configuration in your Firebase console for your own environment.

## Suggested demo flow

1. Open the landing page and launch the AI assistant.
2. Enter symptoms or a specialist request.
3. Provide an area or live location to fetch nearby clinics.
4. Continue into the booking flow and select a time slot.
5. Open the dashboard to review booking status.

## License

Add a license file before public release if you want to define reuse terms.
