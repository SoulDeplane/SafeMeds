# Project Proposal: SafeMeds: A Web-Integrated Local-First Medication Management & Adherence System

## MOTIVATION

* **Importance of Adherence** 
    * Bridges the gap between prescriptions and actionable reminders. 
    * Critical for chronic disease management and patient safety. 
    * Reduces hospital readmissions and improves treatment outcomes. 
* **Challenges for Users** 
    * Complex multi-drug schedules are difficult to follow. 
    * Limited exposure to automated tracking reduces consistency. 
    * Elderly patients may struggle with digital literacy. 
    * Forgetfulness and lifestyle distractions often lead to missed doses. 
* **Project Aim** 
    * Develop a local-first reminder system. 
    * Demonstrate ingestion, parsing, scheduling, and notification phases. 
* **Educational Benefits** 
    * Strengthens knowledge of local storage, parsing logic, and notification translation. 
    * Builds problem-solving and health-tech design skills. 
    * Offers practical exposure to healthcare informatics and patient-centered design. 
---

## STATE OF THE ART

* **Modern Health Apps**
    * Feature-rich but often cloud-dependent and privacy-invasive. 
    * Focused on commercial scalability rather than educational clarity. 
* **Complexity Issues**
    * Existing tools are overwhelming for elderly or novice users. 
    * Interfaces often prioritize aesthetics over accessibility. 
* **Academic Tools**
    * Require strong technical knowledge, limiting accessibility. 
    * Lack integration with real-world patient scenarios. 
* **Gap in Current Solutions**
    * Industrial focus on performance over simplicity. 
    * Need for transparent, privacy-centered educational models. 
    * Lack of offline/local-first solutions for low-resource settings. 

---

## PROJECT GOALS AND MILESTONES

### Primary Goal
* Implement a clear, functional prototype for medication management. 

### Initial Milestones
* Define grammar/data structure for medication storage. 
* Implement lexical analysis for tokenizing prescriptions. 
* Integrate OCR for PDF/handwritten prescription ingestion. 

### Syntactic and Semantic Analysis
* Syntax: Validate prescription structure. 
* Semantic: Verify dosage, frequency, and consistency. 
* Detect conflicts (overlapping schedules or unsafe combinations). 

### Intermediate Generation and Optimization
* Translate validated input into reminder triggers. 
* Apply basic optimization for clarity. 
* Merge duplicate reminders and simplify overlapping schedules. 

### Final Stage
  * Systematic testing of components. 
  * Demonstration with sample schedules. 
  * Collect user feedback for usability improvements. 

---

## PROJECT APPROACH

### Modular Clinical Development
* The system follows a modular architecture where each healthcare function (Ingestion, Clinical Processing, Scheduling, Patient Intervention) is developed as an independent service.
* This ensures data privacy, system stability, and easier debugging of critical health logic.

### Multi-Modal Prescription Ingestion
* **Input Flexibility**: Supports diverse patient inputs including direct text entry, scanned paper prescriptions (via OCR), and voice dictation (Speech-to-Text).
* **Data Standardization**: Raw input from all sources is immediately converted into a standardized text stream to ensure consistent downstream processing.

### Clinical Entity Extraction (formerly Lexical Analysis)
* **Token Identification**: The system parses raw text to identify key clinical entities: Medication Name, Dosage Strength, and Frequency.
* **Pattern Recognition**: Utilizes regex patterns and keyword matching to separate clinical instructions from irrelevant noise in the input data.

### Structure Validation (formerly Syntax Analysis)
* **Rule-Based Validation**: Ensures that the extracted data forms a valid medical instruction (e.g., every medication must have an associated dosage and frequency).
* **Sequence Check**: Verifies that the order of instructions follows logical medical conventions.

### Safety & Consistency Checks (formerly Semantic Analysis)
* **Logic Verification**: Creates a "Medication Profile" for the patient to cross-reference new entries against existing ones.
* **Conflict Detection**: Implements specific logic to identify potential errors, such as duplicate therapies (taking the same drug twice) or impossible schedules.

### Structured Health Record Generation (formerly Intermediate Representation)
* **Data Transformation**: Converts validated text into a structured, machine-readable format (JSON) suitable for database storage.
* **Interoperability**: Acts as a bridge between the raw user input and the internal scheduling engine, ensuring data is clean before it is stored.

### Schedule Optimization
* **Patient-Centric Scheduling**: Merges overlapping reminders to reduce "alert fatigue".
* **Clarity Focus**: Prioritizes easy-to-understand notifications over complex medical jargon.

### Patient Intervention & Notification
* **Smart Alerts**: Generates timely, actionable push notifications for medication intake.
* **Adherence Logging**: Automatically records whether a dose was taken, missed, or skipped, creating a history log for patient review.

### Testing & Clinical Verification
* **Phase-wise Testing**: Each module (OCR, Logic, Notification) is tested in isolation to ensure accuracy.
* **Scenario Testing**: The system is validated using sample prescription datasets to ensure it handles real-world variability correctly.

### Documentation & Educational Visualization
* **System Transparency**: Provides detailed documentation on how raw text is transformed into a schedule.
* **Flow Visualization**: Includes a "Debug/Edu Mode" that visually demonstrates the data pipeline to users/students, showing exactly how their prescription was processed.

### Outcome
* A functional, privacy-centered health prototype that demonstrates the complete lifecycle of medication adherence—from a physical prescription to a digital reminder—in a structured and transparent manner.

---

## SYSTEM ARCHITECTURE

The system is organized into four core layers that manage the flow of medical data from initial input to final patient intervention.

### 1. Patient Input & Data Ingestion
* **User/Patient**: The primary actor initiating the data flow.
* **Prescription Scan (OCR)**: Scans physical documents to capture text.
* **Voice Dictation (STT)**: Allows for verbal input of medication details.
* **Manual Entry (Forms)**: Provides structured fields for direct data typing.
* **Unstructured Health Data**: The raw information collected from all input methods before processing.

### 2. Clinical Data Processing & Logic Engine
* **Clinical Data Extraction & Cleanup**: Normalizes the data and extracts specific entities like Drug, Dose, and Frequency.
* **Clinical Logic & Schedule Generation**: Applies medical rules, checks for conflicts, and creates the intake schedule.

### 3. Secure Local Data & Knowledge Management
* **Local Patient DB (Dexie.js)**: Stores patient-specific information locally to ensure privacy.
* **Medication Knowledge Base (Simplified Rules)**: Contains the reference logic used for validation and safety checks.
* **Adherence Logs**: Maintains a local record of doses taken, missed, or skipped.

### 4. Patient Intervention & Output Layer
* **Medication Adherence Scheduler**: The engine that triggers alerts based on the generated schedule.
* **Patient Alert System**: Processes the schedule into actionable notifications.
* **Patient App/Mobile Alert**: Delivers the final notification to the user's device.
* **Adherence Dashboard & Reports**: Provides visual feedback and history for the patient to review their progress.

---

## PROJECT OUTCOME

* **Educational Prototype**
    * Demonstrates medication scheduling and adherence phases.
* **Deliverables**
    * Software & documented source code.
    * Grammar specifications for input language.
    * Technical report with design decisions and testing.
    * Demonstration with sample schedules.
* **Academic Contribution**
    * Provides a functional learning resource for health-tech design.

---

## ASSUMPTIONS

* Simplified language with limited syntax for manageability.
* Availability of local tools and computing resources.
* Focus on privacy and transparency over cloud optimization.
* Fits within academic timeline and objectives.

---
