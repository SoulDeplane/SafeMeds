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
const prescriptionList = document.getElementById("prescriptionList");
const uploadPhotoBtn = document.getElementById("uploadPhotoBtn");
const photoInput = document.getElementById("photoInput");
const photoStatus = document.getElementById("photoStatus");
const previewImage = document.getElementById("previewImage");
const voiceBtn = document.getElementById("voiceBtn");
const clearVoiceBtn = document.getElementById("clearVoiceBtn");
const voiceStatus = document.getElementById("voiceStatus");
const messageBox = document.getElementById("messageBox");
const usersCount = document.getElementById("usersCount");
const prescriptionCount = document.getElementById("prescriptionCount");
const refreshBtn = document.getElementById("refreshBtn");
const photoCardBtn = document.getElementById("photoCardBtn");
const voiceCardBtn = document.getElementById("voiceCardBtn");
const manualCardBtn = document.getElementById("manualCardBtn");

let recognition = null;
let isListening = false;
let uploadedImageName = "";

// Navigation
const navItems = document.querySelectorAll(".nav-item");
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const section = item.getAttribute("data-section");
    switchSection(section);
  });
});

function switchSection(sectionId) {
  // Hide all sections
  document.querySelectorAll(".content-section").forEach((sec) => {
    sec.classList.remove("active");
  });
  // Show selected section
  document.getElementById(sectionId + "-section").classList.add("active");
  // Update nav active
  navItems.forEach((item) => item.classList.remove("active"));
  document
    .querySelector(`[data-section="${sectionId}"]`)
    .classList.add("active");
  // Load data for section
  if (sectionId === "users") loadUsersCrud();
  else if (sectionId === "medications") loadMedications();
  else if (sectionId === "prescriptions") loadPrescriptionsCrud();
  else if (sectionId === "schedules") loadSchedules();
  else if (sectionId === "reminders") loadReminders();
}

function showMessage(text, type = "success") {
  messageBox.textContent = text;
  messageBox.className = `message-box ${type}`;
}

function hideMessage() {
  messageBox.textContent = "";
  messageBox.className = "message-box hidden";
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

  const patients = users.filter((user) => user.role === "patient");
  const doctors = users.filter((user) => user.role === "doctor");

  patients.forEach((user) => {
    patientSelect.innerHTML += `<option value="${user.user_id}">${user.full_name}</option>`;
  });

  doctors.forEach((user) => {
    doctorSelect.innerHTML += `<option value="${user.user_id}">${user.full_name}</option>`;
  });

  usersCount.textContent = users.length;
}

function getRecordIcon(form) {
  const value = String(form || "").toLowerCase();
  if (value === "liquid") return "🧴";
  if (value === "capsule") return "💊";
  return "💊";
}

function renderPrescriptions(items) {
  prescriptionList.innerHTML = "";

  if (!items.length) {
    prescriptionList.innerHTML = `
      <div class="record-card">
        <p class="record-extra">No prescriptions found yet. Create one using the form.</p>
      </div>
    `;
    prescriptionCount.textContent = "0";
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "record-card";
    card.innerHTML = `
      <div class="record-top">
        <div class="record-title-wrap">
          <div class="record-icon">${getRecordIcon(item.dosage_form)}</div>
          <div>
            <h4>${item.medication_name || "Medication"}</h4>
            <p>${item.dosage_form || "form"}${item.strength ? ` • ${item.strength}` : ""}</p>
            <p>${item.patient_name || "Unknown patient"}${item.doctor_name ? ` • Dr. ${item.doctor_name}` : ""}</p>
          </div>
        </div>
        <span class="record-status">${item.is_active ? "Active" : "Inactive"}</span>
      </div>
      <p class="record-extra">Dosage: ${item.dosage || "-"}</p>
      <p class="record-extra">Frequency: ${item.frequency || "-"}</p>
      <p class="record-extra">Start: ${item.start_date || "-"}</p>
      <p class="record-extra">End: ${item.end_date || "-"}</p>
      <p class="record-extra">Instructions: ${item.instructions || "No instructions"}</p>
      ${uploadedImageName ? `<p class="record-extra">Selected local photo: ${uploadedImageName}</p>` : ""}
    `;
    prescriptionList.appendChild(card);
  });

  prescriptionCount.textContent = items.length;
}

async function loadPrescriptions() {
  const result = await apiRequest("/prescriptions");
  const items = Array.isArray(result.data) ? result.data : [];
  renderPrescriptions(items);
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

  const medicationPayload = {
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
    !medicationPayload.medication_name ||
    !prescriptionPayloadBase.dosage ||
    !prescriptionPayloadBase.frequency ||
    !prescriptionPayloadBase.start_date
  ) {
    showMessage(
      "Patient, medication, dosage, frequency and start date are required.",
      "error",
    );
    return;
  }

  const medicationResult = await apiRequest("/medications", {
    method: "POST",
    body: JSON.stringify(medicationPayload),
  });

  const prescriptionPayload = {
    ...prescriptionPayloadBase,
    medication_id: medicationResult.data.medication_id,
  };

  const prescriptionResult = await apiRequest("/prescriptions", {
    method: "POST",
    body: JSON.stringify(prescriptionPayload),
  });

  // Optional schedule + first reminder creation (based on the form fields).
  let scheduleCreated = false;
  let reminderCreated = false;

  if (scheduleTime.value) {
    const scheduleResult = await apiRequest("/schedules", {
      method: "POST",
      body: JSON.stringify({
        prescription_id: prescriptionResult.data.prescription_id,
        time_of_day: scheduleTime.value,
        dosage_amount: dosage.value.trim(),
      }),
    });
    scheduleCreated = true;

    if (reminderType.value) {
      const reminderTime = `${startDate.value} ${scheduleTime.value}:00`;
      await apiRequest("/reminders", {
        method: "POST",
        body: JSON.stringify({
          schedule_id: scheduleResult.data.schedule_id,
          patient_id: patientSelect.value,
          reminder_time: reminderTime,
          reminder_type: reminderType.value,
        }),
      });
      reminderCreated = true;
    }
  }

  let successText = "Prescription created successfully.";
  if (scheduleCreated)
    successText += ` Schedule saved at ${scheduleTime.value}.`;
  if (reminderCreated)
    successText += ` Reminder created (${reminderType.value}) for ${startDate.value}.`;
  if (uploadedImageName) {
    successText += ` Local prescription image selected: ${uploadedImageName}.`;
  }

  showMessage(successText, "success");
  clearForm();
  await loadPrescriptions();
}

function clearForm() {
  prescriptionForm.reset();
  uploadedImageName = "";
  photoStatus.textContent = "No image selected";
  previewImage.src = "";
  previewImage.classList.add("hidden");
  voiceStatus.textContent =
    "Speak medicine name, dosage, frequency or instructions.";
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
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceStatus.textContent =
      "Speech recognition is not supported in this browser. Use Chrome.";
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

function setupActions() {
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

  clearVoiceBtn.addEventListener("click", () => {
    instructions.value = "";
    voiceStatus.textContent = "Voice text cleared.";
  });

  voiceBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (isListening) recognition.stop();
    else recognition.start();
  });

  voiceCardBtn.addEventListener("click", () => {
    if (voiceBtn) voiceBtn.click();
  });

  manualCardBtn.addEventListener("click", () => {
    medicationName.focus();
  });

  refreshBtn.addEventListener("click", async () => {
    hideMessage();
    try {
      await loadUsers();
      await loadPrescriptions();
      showMessage("Dashboard refreshed from backend.");
    } catch (error) {
      showMessage(error.message, "error");
    }
  });
}

// CRUD Functions

// Users
async function loadUsersCrud() {
  const result = await apiRequest("/users");
  const users = Array.isArray(result.data) ? result.data : [];
  renderUsersTable(users);
}

function renderUsersTable(users) {
  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "";
  users.forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${user.full_name}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td>${user.is_active ? "Yes" : "No"}</td>
      <td>
        <button class="btn btn-light" onclick="editUser('${user.user_id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteUser('${user.user_id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function showUserForm(user = null) {
  document.getElementById("userFormTitle").textContent = user
    ? "Edit User"
    : "Add User";
  document.getElementById("userId").value = user ? user.user_id : "";
  document.getElementById("userEmail").value = user ? user.email : "";
  document.getElementById("userFullName").value = user ? user.full_name : "";
  document.getElementById("userPhone").value = user ? user.phone_number : "";
  document.getElementById("userDob").value = user ? user.date_of_birth : "";
  document.getElementById("userRole").value = user ? user.role : "patient";
  document.getElementById("userActive").checked = user ? user.is_active : true;
  document.getElementById("userFormSection").classList.remove("hidden");
}

function hideUserForm() {
  document.getElementById("userFormSection").classList.add("hidden");
}

async function saveUser(event) {
  event.preventDefault();
  const id = document.getElementById("userId").value;
  const data = {
    email: document.getElementById("userEmail").value,
    full_name: document.getElementById("userFullName").value,
    phone_number: document.getElementById("userPhone").value,
    date_of_birth: document.getElementById("userDob").value,
    role: document.getElementById("userRole").value,
    is_active: document.getElementById("userActive").checked,
  };
  try {
    if (id) {
      await apiRequest(`/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } else {
      await apiRequest("/users", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    hideUserForm();
    loadUsersCrud();
    showMessage("User saved successfully.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function editUser(id) {
  const result = await apiRequest(`/users/${id}`);
  showUserForm(result.data);
}

async function deleteUser(id) {
  if (confirm("Are you sure you want to delete this user?")) {
    try {
      await apiRequest(`/users/${id}`, { method: "DELETE" });
      loadUsersCrud();
      showMessage("User deleted successfully.");
    } catch (error) {
      showMessage(error.message, "error");
    }
  }
}

// Medications
async function loadMedications() {
  const result = await apiRequest("/medications");
  const meds = Array.isArray(result.data) ? result.data : [];
  renderMedicationsTable(meds);
}

function renderMedicationsTable(meds) {
  const tbody = document.querySelector("#medicationsTable tbody");
  tbody.innerHTML = "";
  meds.forEach((med) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${med.medication_name}</td>
      <td>${med.dosage_form}</td>
      <td>${med.strength || ""}</td>
      <td>
        <button class="btn btn-light" onclick="editMedication('${med.medication_id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteMedication('${med.medication_id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function showMedicationForm(med = null) {
  document.getElementById("medicationFormTitle").textContent = med
    ? "Edit Medication"
    : "Add Medication";
  document.getElementById("medicationId").value = med ? med.medication_id : "";
  document.getElementById("medName").value = med ? med.medication_name : "";
  document.getElementById("medForm").value = med ? med.dosage_form : "tablet";
  document.getElementById("medStrength").value = med ? med.strength : "";
  document.getElementById("medicationFormSection").classList.remove("hidden");
}

function hideMedicationForm() {
  document.getElementById("medicationFormSection").classList.add("hidden");
}

async function saveMedication(event) {
  event.preventDefault();
  const id = document.getElementById("medicationId").value;
  const data = {
    medication_name: document.getElementById("medName").value,
    dosage_form: document.getElementById("medForm").value,
    strength: document.getElementById("medStrength").value,
  };
  try {
    if (id) {
      await apiRequest(`/medications/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } else {
      await apiRequest("/medications", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    hideMedicationForm();
    loadMedications();
    showMessage("Medication saved successfully.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function editMedication(id) {
  const result = await apiRequest(`/medications/${id}`);
  showMedicationForm(result.data);
}

async function deleteMedication(id) {
  if (confirm("Are you sure you want to delete this medication?")) {
    try {
      await apiRequest(`/medications/${id}`, { method: "DELETE" });
      loadMedications();
      showMessage("Medication deleted successfully.");
    } catch (error) {
      showMessage(error.message, "error");
    }
  }
}

// Prescriptions
async function loadPrescriptionsCrud() {
  const result = await apiRequest("/prescriptions");
  const items = Array.isArray(result.data) ? result.data : [];
  renderPrescriptionsTable(items);
}

function renderPrescriptionsTable(items) {
  const tbody = document.querySelector("#prescriptionsTable tbody");
  tbody.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.patient_name}</td>
      <td>${item.doctor_name || ""}</td>
      <td>${item.medication_name}</td>
      <td>${item.dosage}</td>
      <td>${item.frequency}</td>
      <td>${item.is_active ? "Yes" : "No"}</td>
      <td>
        <button class="btn btn-light" onclick="editPrescription('${item.prescription_id}')">Edit</button>
        <button class="btn btn-danger" onclick="deletePrescription('${item.prescription_id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function showPrescriptionForm(pres = null) {
  document.getElementById("prescriptionFormTitle").textContent = pres
    ? "Edit Prescription"
    : "Add Prescription";
  document.getElementById("prescriptionId").value = pres
    ? pres.prescription_id
    : "";
  document.getElementById("presPatient").value = pres ? pres.patient_id : "";
  document.getElementById("presDoctor").value = pres ? pres.doctor_id : "";
  document.getElementById("presMedication").value = pres
    ? pres.medication_id
    : "";
  document.getElementById("presDosage").value = pres ? pres.dosage : "";
  document.getElementById("presFrequency").value = pres ? pres.frequency : "";
  document.getElementById("presStartDate").value = pres ? pres.start_date : "";
  document.getElementById("presEndDate").value = pres ? pres.end_date : "";
  document.getElementById("presInstructions").value = pres
    ? pres.instructions
    : "";
  document.getElementById("presActive").checked = pres ? pres.is_active : true;
  document.getElementById("prescriptionFormSection").classList.remove("hidden");
}

function hidePrescriptionForm() {
  document.getElementById("prescriptionFormSection").classList.add("hidden");
}

async function savePrescription(event) {
  event.preventDefault();
  const id = document.getElementById("prescriptionId").value;
  const data = {
    patient_id: document.getElementById("presPatient").value,
    doctor_id: document.getElementById("presDoctor").value || null,
    medication_id: document.getElementById("presMedication").value,
    dosage: document.getElementById("presDosage").value,
    frequency: document.getElementById("presFrequency").value,
    start_date: document.getElementById("presStartDate").value,
    end_date: document.getElementById("presEndDate").value || null,
    instructions: document.getElementById("presInstructions").value || null,
    is_active: document.getElementById("presActive").checked,
  };
  try {
    if (id) {
      await apiRequest(`/prescriptions/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } else {
      await apiRequest("/prescriptions", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    hidePrescriptionForm();
    loadPrescriptionsCrud();
    showMessage("Prescription saved successfully.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function editPrescription(id) {
  const result = await apiRequest(`/prescriptions/${id}`);
  showPrescriptionForm(result.data);
}

async function deletePrescription(id) {
  if (confirm("Are you sure you want to delete this prescription?")) {
    try {
      await apiRequest(`/prescriptions/${id}`, { method: "DELETE" });
      loadPrescriptionsCrud();
      showMessage("Prescription deleted successfully.");
    } catch (error) {
      showMessage(error.message, "error");
    }
  }
}

// Schedules
async function loadSchedules() {
  const result = await apiRequest("/schedules");
  const items = Array.isArray(result.data) ? result.data : [];
  renderSchedulesTable(items);
}

function renderSchedulesTable(items) {
  const tbody = document.querySelector("#schedulesTable tbody");
  tbody.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.patient_name} - ${item.medication_name}</td>
      <td>${item.time_of_day}</td>
      <td>${item.dosage_amount}</td>
      <td>${item.is_active ? "Yes" : "No"}</td>
      <td>
        <button class="btn btn-light" onclick="editSchedule('${item.schedule_id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteSchedule('${item.schedule_id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function showScheduleForm(sch = null) {
  document.getElementById("scheduleFormTitle").textContent = sch
    ? "Edit Schedule"
    : "Add Schedule";
  document.getElementById("scheduleId").value = sch ? sch.schedule_id : "";
  document.getElementById("schPrescription").value = sch
    ? sch.prescription_id
    : "";
  document.getElementById("schTime").value = sch ? sch.time_of_day : "";
  document.getElementById("schDosage").value = sch ? sch.dosage_amount : "";
  document.getElementById("schActive").checked = sch ? sch.is_active : true;
  document.getElementById("scheduleFormSection").classList.remove("hidden");
}

function hideScheduleForm() {
  document.getElementById("scheduleFormSection").classList.add("hidden");
}

async function saveSchedule(event) {
  event.preventDefault();
  const id = document.getElementById("scheduleId").value;
  const data = {
    prescription_id: document.getElementById("schPrescription").value,
    time_of_day: document.getElementById("schTime").value,
    dosage_amount: document.getElementById("schDosage").value,
    is_active: document.getElementById("schActive").checked,
  };
  try {
    if (id) {
      await apiRequest(`/schedules/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } else {
      await apiRequest("/schedules", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    hideScheduleForm();
    loadSchedules();
    showMessage("Schedule saved successfully.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function editSchedule(id) {
  const result = await apiRequest(`/schedules/${id}`);
  showScheduleForm(result.data);
}

async function deleteSchedule(id) {
  if (confirm("Are you sure you want to delete this schedule?")) {
    try {
      await apiRequest(`/schedules/${id}`, { method: "DELETE" });
      loadSchedules();
      showMessage("Schedule deleted successfully.");
    } catch (error) {
      showMessage(error.message, "error");
    }
  }
}

// Reminders
async function loadReminders() {
  const result = await apiRequest("/reminders");
  const items = Array.isArray(result.data) ? result.data : [];
  renderRemindersTable(items);
}

function renderRemindersTable(items) {
  const tbody = document.querySelector("#remindersTable tbody");
  tbody.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.patient_name}</td>
      <td>${item.reminder_time}</td>
      <td>${item.reminder_type}</td>
      <td>${item.status}</td>
      <td>
        <button class="btn btn-light" onclick="editReminder('${item.reminder_id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteReminder('${item.reminder_id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function showReminderForm(rem = null) {
  document.getElementById("reminderFormTitle").textContent = rem
    ? "Edit Reminder"
    : "Add Reminder";
  document.getElementById("reminderId").value = rem ? rem.reminder_id : "";
  document.getElementById("remSchedule").value = rem ? rem.schedule_id : "";
  document.getElementById("remPatient").value = rem ? rem.patient_id : "";
  document.getElementById("remTime").value = rem ? rem.reminder_time : "";
  document.getElementById("remType").value = rem
    ? rem.reminder_type
    : "notification";
  document.getElementById("remStatus").value = rem ? rem.status : "pending";
  document.getElementById("reminderFormSection").classList.remove("hidden");
}

function hideReminderForm() {
  document.getElementById("reminderFormSection").classList.add("hidden");
}

async function saveReminder(event) {
  event.preventDefault();
  const id = document.getElementById("reminderId").value;
  const data = {
    schedule_id: document.getElementById("remSchedule").value,
    patient_id: document.getElementById("remPatient").value,
    reminder_time: document.getElementById("remTime").value,
    reminder_type: document.getElementById("remType").value,
    status: document.getElementById("remStatus").value,
  };
  try {
    if (id) {
      await apiRequest(`/reminders/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } else {
      await apiRequest("/reminders", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    hideReminderForm();
    loadReminders();
    showMessage("Reminder saved successfully.");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function editReminder(id) {
  const result = await apiRequest(`/reminders/${id}`);
  showReminderForm(result.data);
}

async function deleteReminder(id) {
  if (confirm("Are you sure you want to delete this reminder?")) {
    try {
      await apiRequest(`/reminders/${id}`, { method: "DELETE" });
      loadReminders();
      showMessage("Reminder deleted successfully.");
    } catch (error) {
      showMessage(error.message, "error");
    }
  }
}

// Populate select dropdowns
async function populatePrescriptionSelects() {
  // Patients
  const usersResult = await apiRequest("/users");
  const patients = usersResult.data.filter((u) => u.role === "patient");
  const doctors = usersResult.data.filter((u) => u.role === "doctor");
  const patientSelect = document.getElementById("presPatient");
  const doctorSelect = document.getElementById("presDoctor");
  patientSelect.innerHTML = '<option value="">Select Patient</option>';
  doctorSelect.innerHTML = '<option value="">Select Doctor</option>';
  patients.forEach(
    (p) =>
      (patientSelect.innerHTML += `<option value="${p.user_id}">${p.full_name}</option>`),
  );
  doctors.forEach(
    (d) =>
      (doctorSelect.innerHTML += `<option value="${d.user_id}">${d.full_name}</option>`),
  );

  // Medications
  const medsResult = await apiRequest("/medications");
  const medSelect = document.getElementById("presMedication");
  medSelect.innerHTML = '<option value="">Select Medication</option>';
  medsResult.data.forEach(
    (m) =>
      (medSelect.innerHTML += `<option value="${m.medication_id}">${m.medication_name}</option>`),
  );
}

async function populateScheduleSelects() {
  const presResult = await apiRequest("/prescriptions");
  const presSelect = document.getElementById("schPrescription");
  presSelect.innerHTML = '<option value="">Select Prescription</option>';
  presResult.data.forEach(
    (p) =>
      (presSelect.innerHTML += `<option value="${p.prescription_id}">${p.patient_name} - ${p.medication_name}</option>`),
  );
}

async function populateReminderSelects() {
  // Schedules
  const schedResult = await apiRequest("/schedules");
  const schedSelect = document.getElementById("remSchedule");
  schedSelect.innerHTML = '<option value="">Select Schedule</option>';
  schedResult.data.forEach(
    (s) =>
      (schedSelect.innerHTML += `<option value="${s.schedule_id}">${s.patient_name} - ${s.medication_name} at ${s.time_of_day}</option>`),
  );

  // Patients
  const usersResult = await apiRequest("/users");
  const patients = usersResult.data.filter((u) => u.role === "patient");
  const patientSelect = document.getElementById("remPatient");
  patientSelect.innerHTML = '<option value="">Select Patient</option>';
  patients.forEach(
    (p) =>
      (patientSelect.innerHTML += `<option value="${p.user_id}">${p.full_name}</option>`),
  );
}

// Event listeners for CRUD buttons
document
  .getElementById("addUserBtn")
  .addEventListener("click", () => showUserForm());
document
  .getElementById("cancelUserBtn")
  .addEventListener("click", hideUserForm);
document.getElementById("userForm").addEventListener("submit", saveUser);

document
  .getElementById("addMedicationBtn")
  .addEventListener("click", () => showMedicationForm());
document
  .getElementById("cancelMedicationBtn")
  .addEventListener("click", hideMedicationForm);
document
  .getElementById("medicationForm")
  .addEventListener("submit", saveMedication);

document
  .getElementById("addPrescriptionBtn")
  .addEventListener("click", async () => {
    await populatePrescriptionSelects();
    showPrescriptionForm();
  });
document
  .getElementById("cancelPrescriptionBtn")
  .addEventListener("click", hidePrescriptionForm);
document
  .getElementById("prescriptionForm")
  .addEventListener("submit", savePrescription);

document
  .getElementById("addScheduleBtn")
  .addEventListener("click", async () => {
    await populateScheduleSelects();
    showScheduleForm();
  });
document
  .getElementById("cancelScheduleBtn")
  .addEventListener("click", hideScheduleForm);
document
  .getElementById("scheduleForm")
  .addEventListener("submit", saveSchedule);

document
  .getElementById("addReminderBtn")
  .addEventListener("click", async () => {
    await populateReminderSelects();
    showReminderForm();
  });
document
  .getElementById("cancelReminderBtn")
  .addEventListener("click", hideReminderForm);
document
  .getElementById("reminderForm")
  .addEventListener("submit", saveReminder);

async function init() {
  setupPhotoUpload();
  setupSpeechRecognition();
  setupActions();

  try {
    await loadUsers();
    await loadPrescriptions();
    showMessage("Connected to backend APIs successfully.");
  } catch (error) {
    showMessage(`Backend connection issue: ${error.message}`, "error");
  }
}

init();
