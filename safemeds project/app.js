const API_BASE = "http://localhost:3000/api";

const patientSelect = document.getElementById("patientSelect");
const doctorSelect = document.getElementById("doctorSelect");
const medicationName = document.getElementById("medicationName");
const dosageForm = document.getElementById("dosageForm");
const strength = document.getElementById("strength");
const dosage = document.getElementById("dosage");
const frequency = document.getElementById("frequency");
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");
const instructions = document.getElementById("instructions");
const scheduleTime = document.getElementById("scheduleTime");
const reminderType = document.getElementById("reminderType");
const prescriptionForm = document.getElementById("prescriptionForm");
const saveMedicationBtn = document.getElementById("saveMedicationBtn");
const createPrescriptionBtn = document.getElementById("createPrescriptionBtn");
const prescriptionList = document.getElementById("prescriptionList");
const uploadPhotoBtn = document.getElementById("uploadPhotoBtn");
const photoInput = document.getElementById("photoInput");
const photoStatus = document.getElementById("photoStatus");
const previewImage = document.getElementById("previewImage");
const voiceBtn = document.getElementById("voiceBtn");
const clearVoiceBtn = document.getElementById("clearVoiceBtn");
const voiceStatus = document.getElementById("voiceStatus");
const messageBox = document.getElementById("messageBox");
const loadedCount = document.getElementById("loadedCount");
const progressBar = document.getElementById("progressBar");
const refreshBtn = document.getElementById("refreshBtn");
const exploreBtn = document.getElementById("exploreBtn");
const jumpFormBtn = document.getElementById("jumpFormBtn");
const photoCardBtn = document.getElementById("photoCardBtn");
const voiceCardBtn = document.getElementById("voiceCardBtn");
const manualCardBtn = document.getElementById("manualCardBtn");
const formSection = document.getElementById("formSection");

let recognition = null;
let isListening = false;
let uploadedImageName = "";
let recordsLoaded = 0;

function showMessage(text, type = "success") {
  messageBox.textContent = text;
  messageBox.className = `message-box ${type}`;
}

function hideMessage() {
  messageBox.className = "message-box hidden";
  messageBox.textContent = "";
}

function setLoadedProgress(count) {
  recordsLoaded = count;
  loadedCount.textContent = String(count);
  const percent = Math.min(100, count === 0 ? 8 : Math.min(100, count * 10));
  progressBar.style.width = `${percent}%`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function loadUsers() {
  const result = await apiRequest("/users");
  const users = Array.isArray(result.data) ? result.data : [];

  patientSelect.innerHTML = '<option value="">Select patient</option>';
  doctorSelect.innerHTML = '<option value="">Select doctor</option>';

  users
    .filter((user) => user.role === "patient")
    .forEach((user) => {
      patientSelect.innerHTML += `<option value="${user.user_id}">${user.full_name}</option>`;
    });

  users
    .filter((user) => user.role === "doctor")
    .forEach((user) => {
      doctorSelect.innerHTML += `<option value="${user.user_id}">${user.full_name}</option>`;
    });
}

function getRecordIcon(dosageFormValue) {
  const value = String(dosageFormValue || "").toLowerCase();
  if (value === "liquid") return "🧴";
  if (value === "capsule") return "💊";
  return "💊";
}

function renderPrescriptions(items) {
  prescriptionList.innerHTML = "";

  if (!items.length) {
    prescriptionList.innerHTML = `
      <article class="record-card">
        <p class="record-meta">No prescriptions found yet. Create one from the form above.</p>
      </article>
    `;
    setLoadedProgress(0);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "record-card";
    card.innerHTML = `
      <div class="record-top">
        <div class="record-title">
          <div class="record-icon">${getRecordIcon(item.dosage_form)}</div>
          <div>
            <h4>${item.medication_name || "Medication"}</h4>
            <p>${item.dosage_form || "form"}${item.strength ? ` • ${item.strength}` : ""}</p>
            <p class="record-meta">${item.patient_name || "Unknown patient"}${item.doctor_name ? ` • Dr. ${item.doctor_name}` : ""}</p>
          </div>
        </div>
        <span class="record-badge">${item.is_active ? "Active" : "Inactive"}</span>
      </div>
      <p class="record-extra">Dosage: ${item.dosage || "-"}</p>
      <p class="record-extra">Frequency: ${item.frequency || "-"}</p>
      <p class="record-extra">Dates: ${item.start_date || "-"}${item.end_date ? ` to ${item.end_date}` : " onwards"}</p>
      <p class="record-extra">Instructions: ${item.instructions || "No instructions"}</p>
      ${uploadedImageName ? `<p class="record-extra">Photo selected locally: ${uploadedImageName}</p>` : ""}
    `;
    prescriptionList.appendChild(card);
  });

  setLoadedProgress(items.length);
}

async function loadPrescriptions() {
  const result = await apiRequest("/prescriptions");
  const items = Array.isArray(result.data) ? result.data : [];
  renderPrescriptions(items);
}

function clearForm() {
  prescriptionForm.reset();
  uploadedImageName = "";
  photoStatus.textContent = "No image selected";
  previewImage.src = "";
  previewImage.classList.add("hidden");
  voiceStatus.textContent = "Speak medication name, dosage, frequency, or instructions.";
}

async function saveMedicationOnly() {
  hideMessage();

  const payload = {
    medication_name: medicationName.value.trim(),
    dosage_form: dosageForm.value,
    strength: strength.value.trim() || null,
  };

  if (!payload.medication_name || !payload.dosage_form) {
    showMessage("Medication name and dosage form are required.", "error");
    return;
  }

  const result = await apiRequest("/medications", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  showMessage(`Medication saved successfully: ${result.data.medication_name}`);
}

async function createPrescription(event) {
  event.preventDefault();
  hideMessage();

  const medPayload = {
    medication_name: medicationName.value.trim(),
    dosage_form: dosageForm.value,
    strength: strength.value.trim() || null,
  };

  const prescriptionPayloadBase = {
    patient_id: patientSelect.value,
    doctor_id: doctorSelect.value || null,
    dosage: dosage.value.trim(),
    frequency: frequency.value.trim(),
    start_date: startDate.value,
    end_date: endDate.value || null,
    instructions: instructions.value.trim() || null,
  };

  if (
    !prescriptionPayloadBase.patient_id ||
    !medPayload.medication_name ||
    !prescriptionPayloadBase.dosage ||
    !prescriptionPayloadBase.frequency ||
    !prescriptionPayloadBase.start_date
  ) {
    showMessage("Patient, medication, dosage, frequency and start date are required.", "error");
    return;
  }

  const medResult = await apiRequest("/medications", {
    method: "POST",
    body: JSON.stringify(medPayload),
  });

  const prescriptionPayload = {
    ...prescriptionPayloadBase,
    medication_id: medResult.data.medication_id,
  };

  await apiRequest("/prescriptions", {
    method: "POST",
    body: JSON.stringify(prescriptionPayload),
  });

  let infoMessage = "Prescription created successfully.";
  if (scheduleTime.value || reminderType.value) {
    infoMessage += ` Schedule time (${scheduleTime.value || "not saved yet"}) and reminder type (${reminderType.value}) are kept in UI for your next schedule/reminder APIs.`;
  }
  if (uploadedImageName) {
    infoMessage += ` Prescription image selected locally: ${uploadedImageName}.`;
  }

  showMessage(infoMessage, "success");
  clearForm();
  await loadPrescriptions();
}

function setupPhotoUpload() {
  uploadPhotoBtn.addEventListener("click", () => photoInput.click());
  photoCardBtn.addEventListener("click", () => photoInput.click());

  photoInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    uploadedImageName = file.name;
    photoStatus.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      previewImage.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceStatus.textContent = "Speech recognition is not supported in this browser. Use Chrome.";
    voiceBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    isListening = true;
    voiceBtn.textContent = "🎙️ Stop Listening";
    voiceStatus.textContent = "Listening... speak medicine details.";
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    voiceStatus.textContent = `Captured: "${transcript}"`;

    if (!medicationName.value) {
      const parts = transcript.split(" ");
      medicationName.value = parts.slice(0, 2).join(" ");
    }

    if (!instructions.value) {
      instructions.value = transcript;
    } else {
      instructions.value += ` ${transcript}`;
    }

    if (!dosage.value) {
      dosage.value = transcript;
    }
  };

  recognition.onerror = () => {
    voiceStatus.textContent = "Could not hear clearly. Please try again.";
  };

  recognition.onend = () => {
    isListening = false;
    voiceBtn.textContent = "🎤 Start Speaking";
  };
}

function setupButtons() {
  saveMedicationBtn.addEventListener("click", async () => {
    try {
      await saveMedicationOnly();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  prescriptionForm.addEventListener("submit", async (event) => {
    try {
      await createPrescription(event);
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  voiceBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (isListening) recognition.stop();
    else recognition.start();
  });

  clearVoiceBtn.addEventListener("click", () => {
    instructions.value = "";
    voiceStatus.textContent = "Voice text cleared.";
  });

  refreshBtn.addEventListener("click", async () => {
    hideMessage();
    try {
      await loadUsers();
      await loadPrescriptions();
      showMessage("Data refreshed from backend.");
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  exploreBtn.addEventListener("click", () => {
    document.querySelector(".phone-frame").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  jumpFormBtn.addEventListener("click", () => {
    formSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  manualCardBtn.addEventListener("click", () => {
    formSection.scrollIntoView({ behavior: "smooth", block: "start" });
    medicationName.focus();
  });

  voiceCardBtn.addEventListener("click", () => {
    formSection.scrollIntoView({ behavior: "smooth", block: "start" });
    voiceBtn.click();
  });
}

async function init() {
  setupPhotoUpload();
  setupSpeechRecognition();
  setupButtons();

  try {
    await loadUsers();
    await loadPrescriptions();
    showMessage("Connected to backend APIs successfully.");
  } catch (error) {
    showMessage(`Backend connection issue: ${error.message}`, "error");
  }
}

init();