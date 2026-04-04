# Technical Report: SafeMeds - A Web-Integrated Local-First Medication Management & Adherence System

## 1. Executive Summary
**SafeMeds** is a state-of-the-art, local-first healthcare solution designed to address the challenges of medication non-adherence. By bridging the gap between complex physical prescriptions and actionable digital reminders, SafeMeds provides a reliable, privacy-focused notification system. The project focuses on empowering users (particularly the elderly) to manage their health data securely without cloud dependency, while providing a rich, interactive dashboard for adherence tracking.

---

## 2. System Architecture & Modular Design
The system follows a **Modular Clinical Development** architecture, separating healthcare functions into independent services for enhanced stability and privacy.

### 2.1 Core Architectural Layers
The system is organized into four primary layers as defined in the project proposal:
1.  **Patient Input & Data Ingestion Layer**: Manages multi-modal data collection (Manual, OCR, STT).
2.  **Clinical Data Processing & Logic Engine**: Normalizes healthcare data and applies clinical rules.
3.  **Secure Local Data & Knowledge Management**: Handles persistent storage via PostgreSQL and local state through `localStorage` (with planned Dexie.js integration).
4.  **Patient Intervention & Output Layer**: Converts schedules into actionable notifications and adherence reports.

### 2.2 Technology Stack
- **Frontend & UI**: Vanilla JavaScript, HTML5, CSS3.
- **Backend Infrastructure**: Node.js with Express.
- **Database Engine**: PostgreSQL (Relational storage and synchronization).
- **Extraction Logic**: Python-based Clinical Intelligence (Regex, Pattern Recognition).
- **Integrations**: 
    - **OCR**: Tesseract.js for document scanning.
    - **PDF Processing**: PDF.js for digital prescription reading.
    - **Geospatial**: TomTom Maps API for pharmacy locator.
    - **Voice**: Web Speech API for voice dictation.

---

## 3. Detailed Component Analysis

### 3.1 Multi-Modal Prescription Ingestion
The ingestion layer supports various patient scenarios:
- **Prescription Scan (OCR)**: Scans physical paper prescriptions using Tesseract.js to capture raw text.
- **PDF Digitization**: Uses PDF.js to extract text from digital medical reports.
- **Voice Dictation (STT)**: Allows for verbal input, converting speech into structured medication details.
- **Manual Entry**: User-friendly forms for direct data input.

### 3.2 Clinical Entity Extraction (Extraction Engine)
The core logic engine identifies key clinical entities:
- **Token Identification**: Parses raw text for Medication Name, Dosage Strength, and Frequency.
- **Pattern Recognition**: Utilizes regex and keyword matching to separate clinical instructions from noise (e.g., headers, irrelevant notes).
- **Subprocess IPC**: The Node.js server spawns a Python subprocess to handle intensive regex operations, ensuring high precision in extraction.

### 3.3 Patient Intervention & Smart Reminders
The system automates the lifecycle of a medication reminder:
- **Reminder Dispatcher**: A background service in Node.js that monitors the schedule and triggers alerts.
- **Smart Alerts**: Integrated Web Push Notifications for desktop and mobile devices.
- **Adherence Logging**: Records "Taken" or "Skipped" status, including reasons for skipping (e.g., side effects or lifestyle distractions).

### 3.4 Pharmacy Location Finder
SafeMeds features a built-in pharmacy locator using **TomTom Maps**:
- **Proximity Search**: Finds the nearest pharmacies within a 5km radius.
- **Interactive Map**: Displays markers with distance details and address information.
- **Search & Autocomplete**: Enhances usability with location autocomplete for manual searches.

---

## 4. Development Plan & Milestones
As outlined in the project README, the development followed a structured 12-step plan:

| Phase | Tasks | Key Milestones |
| :--- | :--- | :--- |
| **Ingestion** | Steps 1-3 | Multi-modal intake, OCR integration, and lexical analysis. |
| **Parsing** | Steps 4-5 | Token identification and structure validation. |
| **Safety** | Steps 6-7 | Logic verification and conflict detection (Duplicate therapy checks). |
| **Storage** | Steps 8-9 | JSON transformation and local storage integration. |
| **Intervention**| Steps 10-12 | Schedule optimization, smart alerts, and systematic testing. |

### Role Assignments:
- **Nitya Sanguri**: Multi-modal ingestion, Data Standardization, and Clinical Entity Extraction.
- **Sonali Sharma**: Structure Validation, Safety Logic, and Conflict Detection.
- **Adarsh Bhandari**: Data Transformation, Schedule Optimization, and Patient Intervention logic.

---

## 5. Decision Rationale: Local-First Philosophy
- **Privacy**: Patient data is stored locally first to ensure absolute control over sensitive medical information.
- **Offline Reliability**: The system remains functional in low-resource settings with limited internet connectivity.
- **User Experience**: Local state management ensures near-instantaneous UI responses, critical for a smooth user experience.

---

## 6. Future Roadmap
1.  **Dexie.js Deep Integration**: Migrating from `localStorage` to IndexedDB for more robust local-first storage.
2.  **Side Effect Analysis**: Enhancing the "Adherence Dashboard" with advanced trend analysis for side effects.
3.  **Conflict Detection (Advanced)**: Implementing drug-drug interaction warnings using external medical knowledge bases.

---

## 7. Installation & Verification
### Prerequisites
- Node.js (v16+)
- PostgreSQL (Local instance)
- Python (v3.9+)

### Setup
1.  **Database**: Migrate the schema using `Backend/database.sql`.
2.  **Environment**: Configure `.env` in the `Backend` directory.
3.  **Execution**:
    ```bash
    # Start Backend
    node server.js
    # Ensure Frontend is served (served by static middleware in server.js)
    ```
