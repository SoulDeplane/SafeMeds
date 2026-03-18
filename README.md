## SafeMeds: Project Proposal

### Project Overview
**SafeMeds** is a web-integrated, local-first medication management and adherence system. * It bridges the gap between complex physical prescriptions and actionable digital reminders by parsing clinical data to create a reliable notification system. * Designed with a focus on privacy and patient safety, the prototype operates without cloud dependency, making it ideal for elderly users or low-resource settings.

---

### Technical Stack
* **Frontend & UI**: Web-integrated interface with local-first logic.
* **Parsing Engine**: Regex patterns and keyword matching (Python/C++) for clinical entity extraction.
* **Local Storage**: **Dexie.js** for structured, local-first IndexedDB management.
* **OCR & Input**: **Tesseract.js** for PDF/handwritten scanning and Speech-to-Text (STT) for voice dictation.
* **Notification Layer**: Web push notifications for smart, timely medication alerts and adherence logging.

---

### Development Plan & Role Assignment
* The following table outlines the project milestones and the specific team members responsible for each phase of the clinical data processing and logic engine:

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
| 9 | Secure Local Storage Integration (Dexie.js) | Adarsh Bhandari |
| 10 | Schedule Optimization (Patient-Centric Reminders) | Adarsh Bhandari |
| 11 | Patient Intervention (Smart Alerts & Adherence Logging) | Adarsh Bhandari |
| 12 | Systematic Testing & Verification | All Members |

---

### Detailed Implementation Steps

#### 1. Clinical Entity Extraction & Error Handling (Nitya Sanguri)
* **Token Identification**: The system parses raw text to identify key clinical entities, specifically Medication Name, Dosage Strength, and Frequency.
* **Pattern Recognition**: Utilizes regular expressions and keyword matching to isolate instructions from irrelevant noise in input data.
* **Lexical Analysis**: Standardizes all raw input into a consistent text stream for downstream processing.

#### 2. Structure Validation & Safety Logic (Sonali Sharma)
* **Rule-Based Validation**: Ensures extracted data forms a valid medical instruction, such as verifying every medication has an associated dosage.
* **Semantic Verification**: Creates a "Medication Profile" to cross-reference new entries against existing ones for safety.
* **Conflict Detection**: Implements specific logic to identify errors like duplicate therapies or impossible schedules.

#### 3. Data Transformation & Schedule Generation (Adarsh Bhandari)
* **Structured Health Records**: Converts validated text into machine-readable JSON format for local database storage.
* **Optimization**: Merges overlapping reminders to reduce "alert fatigue" and prioritizes easy-to-understand notifications over medical jargon.
* **Intervention**: Automates the creation of timely push notifications and records whether doses were taken or missed.
