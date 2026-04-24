# Technical Report: SafeMeds — A Web-Integrated Medication Management & Adherence System

## 1. Executive Summary
**SafeMeds** is a healthcare solution designed to address the problem of medication non-adherence. It bridges the gap between physical prescriptions and actionable digital reminders by combining multi-modal prescription ingestion, clinical entity extraction, a reliable reminder pipeline, and a pharmacy locator. The system focuses on empowering patients — particularly the elderly — to manage their schedules with confidence while providing precise, actionable alerts for both dose time and refill needs. One phone number can host multiple named profiles, making it practical for households that share a single device.

---

## 2. System Architecture & Modular Design
The system follows a modular clinical architecture that separates ingestion, processing, storage, and intervention into independent layers.

### 2.1 Core Architectural Layers
1. **Patient Input & Data Ingestion Layer** — multi-modal intake through manual forms, image/PDF OCR, and voice dictation.
2. **Clinical Data Processing & Logic Engine** — normalises healthcare data and applies clinical rules through a Python subprocess.
3. **Persistent Data & Profile Management** — PostgreSQL backs all structured data; localStorage holds the active profile selection on the client. Profiles are keyed by the pair {full_name, phone_number} so a single phone can host multiple accounts.
4. **Patient Intervention & Output Layer** — a dual-track reminder pipeline (server-side dispatcher plus client-side alarm loop) that drives in-app modals, OS-level browser notifications via a service worker, SMS via Twilio, and refill alerts tied to live pill inventory.

### 2.2 Technology Stack
- **Frontend & UI**: Vanilla JavaScript, HTML5, CSS3.
- **Backend**: Node.js with Express.
- **Database**: PostgreSQL with tables for users, medications, prescriptions, medication_schedules, reminders, and adherence_logs.
- **Extraction Engine**: Python subprocess invoked over stdin/stdout pipes; regex and keyword matching for clinical entity recognition.
- **OCR**: Google Gemini 2.5 Flash (multimodal) handling both images and PDFs through a single generateContent call with inlineData base64 encoding.
- **PDF Processing**: PDF.js on the client for in-browser document preview.
- **Voice Input**: Web Speech API with Indian English locale preference and explicit error-code handling.
- **Maps**: TomTom Maps SDK and Search API for forward search, typeahead autocomplete, reverse geocoding, and fuzzy pharmacy search.
- **SMS**: Twilio Node SDK through a shared sendSms helper that normalises phone numbers to 10-digit Indian MSISDN, wraps them in E.164 form, and surfaces the raw Twilio response for debugging.
- **Browser Notifications**: Standard Notification API combined with a registered service worker (sw.js) for persistent OS-level toast delivery even when the tab is backgrounded or the browser is minimised.

---

## 3. Detailed Component Analysis

### 3.1 Multi-Modal Prescription Ingestion
Four ingestion paths feed the same extraction pipeline:
- **Prescription Scan (OCR)**: the client base64-encodes the image and posts it to the backend, which calls Gemini 2.5 Flash with a strict transcription prompt; the raw text is returned and piped into the Python clinical extraction module.
- **PDF Digitisation**: the PDF is base64-encoded on the client and posted to the backend; Gemini 2.5 Flash accepts it as inlineData with application/pdf mime type and handles multi-page documents natively in a single call.
- **Voice Dictation**: uses the Web Speech API to capture spoken medication details; the transcript is submitted directly to the clinical extraction endpoint.
- **Manual Entry**: form-based input that bypasses OCR and goes straight into the normalised pipeline.

### 3.2 Clinical Entity Extraction
- **Subprocess IPC**: Node spawns clinical_extraction/api.py, pipes raw text into its stdin, and parses structured JSON from its stdout.
- **Token Identification**: medication name, dosage strength, and frequency are isolated from the raw text stream.
- **Pattern Recognition**: regex and keyword matching separate clinical instructions from headers, footers, and noise.
- **Fuzzy Matching**: the extractor uses rapidfuzz for approximate medication name matching against a known drug keyword list.
- **Error Handling**: unparseable output produces a clear API failure response rather than silent data corruption.

### 3.3 Profile & Identity Model
- Each user record carries a generated email derived from {name, phone, role}, ensuring database-level uniqueness that reflects the true business key {Name, Phone}.
- The GET /api/users/check endpoint performs digit-only phone matching (via regexp_replace) so numbers stored with country codes or formatting characters still resolve correctly.
- The onboarding flow performs a login-first lookup: if a matching profile exists it is selected directly; otherwise a new record is created.
- A startup migration (reconcilePhantomPatients) detects and removes phantom user records created by earlier builds, reattaching their prescriptions and adherence logs to the correct real user.

### 3.4 Reminder Pipeline
- **Server-Side Dispatcher**: runs on a configurable interval (default 60 seconds); selects due reminders whose parent prescription is not paused and marks each record as sent or failed.
- **Client-Side Alarm Loop**: polls every few seconds; when the current time matches a scheduled dose and the reminder is not paused and has not fired today, it opens the in-app ringing modal, fires a browser notification via the service worker, and — when the user has opted in to SMS — calls the backend to dispatch a Twilio message and logs the reminder row.
- **Pause & Resume**: each prescription carries an is_paused flag; toggling it updates the database, immediately refreshes the client's in-memory reminder state, clears the current-day trigger tracker on resume so the next due time fires normally, and re-renders the UI without a page reload.

### 3.5 Adherence, Refill Alerts & Side Effects
- **Adherence Logging**: each Taken or Skipped click writes a row to adherence_logs with scheduled time, actual time, status, skip reason, and a snapshot of medication name, dosage, and route.
- **History Durability**: the adherence_logs.prescription_id foreign key uses ON DELETE SET NULL instead of CASCADE, so log rows survive prescription deletion. Each log also carries denormalised medication_name, dosage, and route columns that are populated at insert time and used as a fallback when the original prescription is later deleted.
- **Refill Alerts**: the PUT /api/prescriptions/:id/take endpoint atomically decrements the total_pills counter; when the count drops to three or fewer, the backend looks up the patient's phone, sends a refill SMS via Twilio, and returns refill_needed: true with the medication name. The client raises a toast and an OS notification immediately on response.
- **Side Effects**: a dedicated endpoint attaches a free-text side_effects note either to the most recent same-day adherence entry or to a new logged entry when none exists.

### 3.6 Pharmacy Location Finder
- **Current Location**: requests a high-accuracy geolocation fix, falls back to a low-accuracy retry on timeout or POSITION_UNAVAILABLE, disambiguates PERMISSION_DENIED from device-level failure, and reverse-geocodes the coordinates into a real street address shown in the search input.
- **Address Search**: view-biased to the current map centre using lat/lon/radius parameters, debounced typeahead autocomplete with five suggestions, and Enter-key submission support.
- **Pharmacy Discovery**: fuzzy search for up to ten pharmacies within a 5 km radius; clicking a list item flies both the main and expanded modal maps to that location.
- **Marker Management**: a single reusable user-location marker avoids stacking duplicates on repeated searches; pharmacy markers are cleared and redrawn on each search.
- **Modal Map**: lazily initialised on first expansion and resized after the modal transition completes so tiles render at the correct dimensions.

### 3.7 OS-Level Notification System
- A service worker (Frontend/sw.js) is registered on page load; when available, all notifications are dispatched via ServiceWorkerRegistration.showNotification() rather than the in-page Notification constructor, ensuring delivery when the tab is backgrounded or minimised.
- All notification call sites route through a single showMedNotification() helper that prefers the service worker path, falls back to the page-local constructor, and logs the delivery path to the browser console.
- Notifications carry requireInteraction: true so Windows and macOS do not auto-dismiss the toast before the user sees it.
- A visible Enable Notifications button appears in the header whenever permission is default or denied; it is tied to a real user-gesture click to satisfy Chromium's permission-prompt policy.

### 3.8 SMS Delivery Layer
- All outbound SMS flows through a single sendSms helper backed by the Twilio Node SDK.
- Phone numbers are normalised to the last ten digits and wrapped in E.164 form (+91XXXXXXXXXX for India).
- The Twilio client is lazily instantiated so the server still boots cleanly when credentials are absent.
- The Twilio response's sid, status, errorCode, and errorMessage are attached to every HTTP reply for transparent debugging.
- A GET /api/sms-test endpoint exercises the same helper for quick account-state verification.
- On the free trial, recipient numbers must be verified under Verified Caller IDs and India must be enabled under Geo-Permissions; unverified numbers return Twilio error code 21608, which the helper surfaces verbatim.

---

## 4. Development Plan & Milestones

| Phase | Tasks | Key Milestones |
| :--- | :--- | :--- |
| **Ingestion** | Steps 1–3 | Multi-modal intake, OCR integration, lexical analysis. |
| **Parsing** | Steps 4–5 | Token identification and structure validation. |
| **Safety** | Steps 6–7 | Logic verification and conflict detection. |
| **Storage** | Steps 8–9 | JSON transformation and PostgreSQL integration. |
| **Intervention** | Steps 10–12 | Schedule optimisation, in-app alerts, SMS, refill detection, and systematic testing. |

### Role Assignments
- **Nitya Sanguri** — multi-modal ingestion, data standardisation, clinical entity extraction.
- **Sonali Sharma** — structure validation, safety logic, conflict detection.
- **Adarsh Bhandari** — data transformation, schedule optimisation, and patient-intervention logic including SMS, refill, pause/resume, notifications, and the pharmacy locator.

---

## 5. Decision Rationale
- **Relational Storage**: PostgreSQL provides strong integrity guarantees for the prescription, schedule, reminder, and adherence relationships that are critical in a medication-safety context.
- **Dual Reminder Track**: the server-side dispatcher maintains a canonical record of which reminders fired; the client-side loop drives the user-visible alarm modal and OS notification without requiring server push infrastructure.
- **{Name, Phone} Profile Key**: keying profiles on phone number alone is unsafe in households that share a device; the pair lets a family share a number while keeping medical records fully separate.
- **Service Worker for Notifications**: the page-local Notification constructor is unreliable when the tab is inactive; routing through the service worker ensures OS-level delivery with persistent toast display.
- **Raw Provider Passthrough for SMS**: Twilio can accept a request but still reject it downstream; returning the raw sid, status, and error fields through the API surface makes the true delivery state observable without requiring access to the Twilio console.
- **History Snapshot Columns**: foreign-key cascade deletion previously wiped adherence history whenever a prescription was edited or deleted; denormalising medication_name, dosage, and route onto the log row makes history self-contained and durable.
- **Gemini for OCR**: replacing Google Cloud Vision with Gemini 2.5 Flash collapses separate image and PDF OCR code paths into a single multimodal inlineData call, removes the service-account credential dependency, and is available on the free AI Studio tier.

---

## 6. Future Roadmap
- **Drug-Drug Interaction Warnings**: integrate an external medical knowledge base for automatic interaction checks during ingestion.
- **Strict Server-Side SMS Opt-In**: migrate the smsEnabled preference from localStorage to a users.sms_enabled column so the server-side dispatcher can honour it authoritatively.
- **DLT-Compliant SMS Template**: register an Indian DLT template with Twilio's regulatory bundle and attach it to a dedicated sender ID so production traffic is not limited to verified trial recipients.
- **Server-Side Reminder Delivery**: extend the dispatcher to send SMS directly instead of relying on the client, so reminders fire even when the browser tab is closed.
- **Side-Effect Trend Analysis**: surface patterns across historical side_effects entries in the adherence dashboard.

---

## 7. Installation & Verification

### Prerequisites
- Node.js 16+
- PostgreSQL
- Python 3.9+

### Setup
1. **Database**: apply the schema in Backend/database.sql.
2. **Environment**: create Backend/.env with the following keys:
   - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE
   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
   - GEMINI_API_KEY
   - REMINDER_CHECK_INTERVAL_MS (optional)
3. **Dependencies**: from Backend, run npm install.
4. **Execution**: run node server.js. The server serves the frontend on http://localhost:3000.

### Verification Checklist
- **OCR**: upload a prescription image or PDF through the UI; the symptom field should populate with extracted text and medication rows should auto-fill in the Add Prescription modal.
- **SMS account state**: hit GET /api/sms-test?phone=<10-digit> and confirm success: true and provider.errorCode: null. A non-null errorCode indicates an account-level configuration step is required.
- **Profile separation**: create two profiles with the same name but different phone numbers; each should see only its own prescriptions and history.
- **Refill alert**: mark a dose as taken when three or fewer pills remain; expect an immediate toast, OS notification, and SMS.
- **Pause & Resume**: paused prescriptions must neither fire the in-app alarm nor be included in the server dispatcher's sent records until resumed.
- **Map**: the Current Location button should produce a precise fix and display a reverse-geocoded street address; the search field should offer five view-biased typeahead suggestions and fly the map to the selected result.
- **Notifications**: click Enable Notifications in the header and grant permission; the next reminder should appear as a persistent OS toast visible outside the browser window.
- **History**: open the Medication History modal; all Taken, Skipped, and side-effect entries across all dates should appear, including entries for prescriptions that were later edited or deleted.
