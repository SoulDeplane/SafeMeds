# SafeMeds: A Web-Integrated Medication Management & Adherence System

### Project Overview
**SafeMeds** is a web-integrated medication management and adherence system that bridges the gap between complex physical prescriptions and actionable digital reminders. It parses clinical data from multi-modal inputs (manual, OCR, PDF, voice) into a structured schedule, then drives reliable in-app, web-notification, and SMS reminders. The system also tracks adherence, raises refill alerts as soon as stock runs low, and helps the user locate nearby pharmacies. It is designed with a focus on patient safety and is especially suitable for elderly users.

---

### Technical Stack
- **Frontend & UI**: Vanilla JavaScript, HTML5, CSS3 served statically by the backend.
- **Backend**: Node.js with Express; REST API over JSON.
- **Database**: PostgreSQL — relational storage for users, medications, prescriptions, medication schedules, reminders, and adherence logs.
- **Clinical Extraction**: Python subprocess invoked over stdin/stdout, using regex and keyword matching to identify medication name, dosage, and frequency.
- **OCR & Document Intake**: Google Gemini 2.5 Flash (multimodal) for both image and PDF OCR in a single call; PDF.js is retained on the client for in-browser PDF preview.
- **Voice Input**: Web Speech API for speech-to-text dictation.
- **Maps**: TomTom Maps SDK — forward search, typeahead autocomplete, reverse geocoding, and fuzzy pharmacy lookup.
- **SMS**: Twilio Node SDK for medication reminders and refill alerts.
- **Web Notifications**: Browser Notification API backed by a service worker (sw.js) for OS-level delivery even when the browser tab is inactive or minimised.
- **Profile Identity**: Patient profiles are keyed by a {Name, Phone} pair so a single phone number can host multiple named accounts.

---

### Development Plan & Role Assignment

| Step | Task | Assigned To |
| :--- | :--- | :--- |
| 1 | Multi-Modal Prescription Ingestion (Manual, OCR, STT) | Nitya Sanguri |
| 2 | Data Standardization (Raw to Text Stream) | Nitya Sanguri |
| 3 | Clinical Entity Extraction & Error Handling | Nitya Sanguri |
| 4 | Token Identification & Pattern Recognition | Nitya Sanguri |
| 5 | Structure Validation (Rule-Based & Sequence Checking) | Sonali Sharma |
| 6 | Safety & Consistency Checks (Logic Verification) | Sonali Sharma |
| 7 | Conflict Detection (Duplicate & Overlap Logic) | Sonali Sharma |
| 8 | Structured Health Record Generation (Data Transformation) | Adarsh Bhandari |
| 9 | Relational Storage Integration (PostgreSQL) | Adarsh Bhandari |
| 10 | Schedule Optimization (Patient-Centric Reminders) | Adarsh Bhandari |
| 11 | Patient Intervention (Smart Alerts, SMS, Refill, Adherence Logging) | Adarsh Bhandari |
| 12 | Systematic Testing & Verification | All Members |

---

### Detailed Implementation Steps

#### 1. Clinical Entity Extraction & Error Handling (Nitya Sanguri)
- **Token Identification**: Parses raw text to isolate Medication Name, Dosage Strength, and Frequency.
- **Pattern Recognition**: Uses regular expressions and keyword matching to separate clinical instructions from noise.
- **Lexical Analysis**: Standardises raw input from OCR, PDF, and voice into a consistent text stream for downstream processing.

#### 2. Structure Validation & Safety Logic (Sonali Sharma)
- **Rule-Based Validation**: Ensures extracted data forms a valid medical instruction, such as verifying every medication has an associated dosage.
- **Semantic Verification**: Cross-references new entries against the patient's existing medication profile for safety.
- **Conflict Detection**: Identifies errors such as duplicate therapies or impossible schedules.

#### 3. Data Transformation, Scheduling & Patient Intervention (Adarsh Bhandari)
- **Structured Health Records**: Converts validated text into JSON-shaped records persisted to PostgreSQL across the users, medications, prescriptions, medication_schedules, reminders, and adherence_logs tables.
- **Schedule Optimisation**: Merges overlapping reminders to reduce alert fatigue and prefers plain language over medical jargon.
- **Reminder Dispatch**: A Node.js interval service picks up due reminders whose prescriptions are not paused and marks them dispatched. The client-side scheduler polls every few seconds, fires the in-app alarm modal, raises a browser notification through the service worker, and calls the backend SMS endpoint when the user's SMS preference is enabled.
- **Refill Alerts**: When the user marks a dose as taken and the remaining pill count drops to three or fewer, the backend automatically sends a refill SMS via Twilio and returns a refill_needed flag so the client can raise an immediate toast and OS notification.
- **Pause & Resume**: Each prescription carries an is_paused flag. When paused, neither the server dispatcher nor the client-side alarm triggers for that medication until the user resumes it.
- **Pharmacy Locator**: Uses TomTom Maps for high-accuracy current-location fixes with reverse-geocoding to a real street address, view-biased address search with typeahead autocomplete, and fuzzy search for nearby pharmacies within a 5 km radius.
- **Adherence Logging**: Records Taken, Skipped (with reason), or side-effect entries against each scheduled dose. Each log row carries a snapshot of the medication name, dosage, and route so the patient's full history survives any later edit or deletion of the underlying prescription.

---

### Installation & Running

**Prerequisites**: Node.js 16+, PostgreSQL, Python 3.9+.

1. Apply the schema from SafeMeds/Backend/database.sql to your PostgreSQL instance.
2. Populate SafeMeds/Backend/.env with the following keys:
   - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE
   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
   - GEMINI_API_KEY (obtain from https://aistudio.google.com/ → Get API key)
   - REMINDER_CHECK_INTERVAL_MS (optional, default 60000)
3. From SafeMeds/Backend, run npm install and then node server.js. The server listens on port 3000 and serves the frontend at http://localhost:3000.

---

### SMS Configuration (Twilio Free Trial)
- Log in at https://console.twilio.com/ and open **Phone Numbers → Manage → Verified Caller IDs**. Verify every phone number that should receive alerts — unverified trial recipients are rejected with Twilio error code 21608.
- Open **Messaging → Settings → Geo-Permissions** and enable **India** — without this, Indian numbers are rejected with error code 21408.
- Copy the Account SID, Auth Token, and your Twilio-issued From Number (E.164 form, e.g. +12025550123) into Backend/.env.
- Verify end-to-end with GET http://localhost:3000/api/sms-test?phone=<10-digit>; a successful reply has success: true and provider.errorCode: null.
- Trial accounts prepend every message with "Sent from your Twilio trial account -" and allow roughly 50 messages per day — sufficient for a demo.

---

### Notification Setup
- Open the app at http://localhost:3000 (not via file://).
- Click the **Enable Notifications** button in the header when it appears, and grant permission in the browser prompt.
- On Windows, ensure Focus Assist is off (Settings → System → Focus Assist → Off) so OS toasts are not suppressed.
- Once granted, reminders and refill alerts appear as persistent OS-level toasts via the registered service worker and stay on screen until dismissed.
