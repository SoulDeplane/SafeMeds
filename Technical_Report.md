# Technical Report: SafeMeds - Medication Management & Adherence System

## 1. Executive Summary
**SafeMeds** is a comprehensive, local-first health technology platform designed to bridge the gap between physical prescriptions and digital medication adherence. The system provides a seamless pipeline—from ingestion and clinical data extraction to smart reminders and adherence logging. Focused on privacy and patient safety, SafeMeds operates with a web-integrated local-first architecture, making it ideal for both high-resource and low-resource medical environments.

---

## 2. System Architecture
The SafeMeds system is organized into a modular four-layer architecture to ensure stability, privacy, and clinical accuracy.

### 2.1 Layered Overview
1.  **Patient Input & Ingestion Layer**: Supports manual entry, PDF/image scanning (OCR), and voice dictation (STT).
2.  **Clinical Intelligence Layer**: A specialized engine that normalizes raw text, extracts medication entities (Drug, Dose, Frequency), and applies clinical safety logic.
3.  **Data Management Layer**: Utilizes a PostgreSQL backend for reliable synchronization and `localStorage` for responsive, local-first performance.
4.  **Intervention & Output Layer**: A smart scheduler that triggers timely push notifications and provides a history dashboard for patient progress.

### 2.2 Technology Stack
- **Frontend**: Vanilla JavaScript, HTML5, CSS3.
- **Backend API**: Node.js with Express.
- **Database**: PostgreSQL (relational storage).
- **Extraction Engine**: Python (Regex-based NLP and pattern recognition).
- **External APIs**: TomTom (Pharmacy Mapping), PDF.js (Prescription Reading), Tesseract.js (OCR).

---

## 3. Core Features & Implementation

### 3.1 Multi-Modal Prescription Ingestion
The ingestion layer is designed for flexibility. Patients can:
- **Scan Physical Documents**: Uses `pdf.js` and `Tesseract.js` to digitize printed prescriptions.
- **Voice Ingestion**: Integrated Speech-to-Text allows for hands-free entry of medication details.
- **Manual Entry**: Structured forms for precise control over medication data.

### 3.2 Clinical Entity Extraction
The clinical processing is handled by a Python-Node Inter-Process Communication (IPC) mechanism.
- **Mechanism**: The Node.js server spawns a Python subprocess (`api.py`) and pipes raw prescription text via `stdin`.
- **Logic**: The Python module uses regular expressions and medication keywords to isolate drugs, dosages, and frequencies, returning a structured JSON response.

### 3.3 Smart Adherence & Reminders
The system includes a foreground dispatcher that checks for due medications every minute.
- **Reminders**: Integrated Web Push Notifications for desktop and mobile alerts.
- **Status Logging**: Doses are logged as "Taken" or "Skipped" with reason codes.
- **Adherence History**: A visual dashboard grouped by date, showing daily adherence rates and missed doses.

### 3.4 Pharmacy Location Finder
SafeMeds integrates with the **TomTom Maps API** to provide a real-time pharmacy locator.
- **Fuzzy Search**: Automatically finds the nearest 10 pharmacies within a 5km radius.
- **Interactive UI**: Users can search by current location or address, with markers indicating distance and availability.

---

## 4. Technical Implementation Details

### 4.1 Backend Engine (`server.js`)
The backend is built for reliability and scale:
- **Database Connectivity**: Managed via the `pg` (PostgreSQL) client.
- **Reminder Dispatcher**: An internal `setInterval` routine continuously monitors the `reminders` table for pending alerts.
- **API Routing**: RESTful endpoints for CRUD operations on Users, Medications, Prescriptions, and Adherence Logs.

### 4.2 Frontend Architecture (`app.js`)
The frontend is a single-page application (SPA) optimized for performance:
- **State Management**: Local arrays and `localStorage` ensure immediate UI updates.
- **API Communication**: Uses `fetch` for asynchronous synchronization with the Node server.
- **Dynamic UI**: Responsive components for modals, historical logs, and the map integration.

---

## 5. Security & Privacy
- **Local-First Design**: Patient profiles and interaction logs are prioritized for local storage.
- **Data Integrity**: Comprehensive validation rules ensure that every prescription has a valid dosage and frequency before storage.

---

## 6. Future Roadmap
1.  **Dexie.js Integration**: Transitioning to IndexedDB for larger local datasets and enhanced offline capabilities.
2.  **Advanced NLP**: Implementing Transformer-based extraction for more complex prescription formats.
3.  **Health Dashboard Enhancements**: Adding side-effect trend analysis and doctor-sharing features.

---

## 7. Setup & Installation
### Prerequisites
- Node.js (v16+)
- PostgreSQL (v14+)
- Python (v3.9+) with requirements in `clinical_extraction/requirements.txt`

### Steps
1.  **Database Setup**: Execute `Backend/database.sql` to create migrations.
2.  **Install Dependencies**:
    ```bash
    cd Backend && npm install
    cd ../clinical_extraction && pip install -r requirements.txt
    ```
3.  **Environment Configuration**: Create a `.env` in `Backend/` with your DB credentials.
4.  **Run Server**:
    ```bash
    cd Backend && node server.js
    ```
