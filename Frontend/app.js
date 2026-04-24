const ttKey = "kg27RdQBPFFGddZ9vn0LmKNRDgICOqym";
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

const voiceBtn = document.getElementById("voiceBtn");
const scanBtn = document.getElementById("scanBtn");
const uploadBtn = document.getElementById("uploadBtn");
const manualBtn = document.getElementById("manualBtn");
const fileInput = document.getElementById("fileInput");

const addRxModal = document.getElementById("addRxModal");
const rxDetailsModal = document.getElementById("rxDetailsModal");
const ringingModal = document.getElementById("ringingModal");
const skipModal = document.getElementById("skipModal");

const closeAddRxBtn = document.getElementById("closeAddRxBtn");
const closeRxDetailsBtn = document.getElementById("closeRxDetailsBtn");
const ringingDoneBtn = document.getElementById("ringingDoneBtn");
const ringingSkipBtn = document.getElementById("ringingSkipBtn");
const confirmSkipBtn = document.getElementById("confirmSkipBtn");
const cancelSkipBtn = document.getElementById("cancelSkipBtn");

const skipReasonInput = document.getElementById("skipReasonInput");
const ringingMedId = document.getElementById("ringingMedId");
const skipMedId = document.getElementById("skipMedId");

const onboardModal = document.getElementById("onboardModal");
const onboardBtn = document.getElementById("onboardBtn");
const onboardName = document.getElementById("onboardName");
const onboardPhone = document.getElementById("onboardPhone");
const onboardSmsToggle = document.getElementById("onboardSmsToggle");
const authChoiceModal = document.getElementById("authChoiceModal");
const choiceLoginBtn = document.getElementById("choiceLoginBtn");
const choiceSignupBtn = document.getElementById("choiceSignupBtn");
const backOnboardBtn = document.getElementById("backOnboardBtn");

const sideEffectModal = document.getElementById("sideEffectModal");
const sideEffectText = document.getElementById("sideEffectText");
const sideEffectRxId = document.getElementById("sideEffectRxId");
const saveSideEffectBtn = document.getElementById("saveSideEffectBtn");
const cancelSideEffectBtn = document.getElementById("cancelSideEffectBtn");

const historyModal = document.getElementById("historyModal");
const historyContainer = document.getElementById("historyContainer");
const viewHistoryBtn = document.getElementById("viewHistoryBtn");
const closeHistoryBtn = document.getElementById("closeHistoryBtn");
const resetHistoryBtn = document.getElementById("resetHistoryBtn");
const printHistoryBtn = document.getElementById("printHistoryBtn");
const logoutBtn = document.getElementById("logoutBtn");
const updatePhoneBtn = document.getElementById("updatePhoneBtn");
const updatePhoneInput = document.getElementById("updatePhoneInput");

const rxForm = document.getElementById("rxForm");
const medicationsContainer = document.getElementById("medicationsContainer");
const addMedRowBtn = document.getElementById("addMedRowBtn");
const medRowTemplate = document.getElementById("medRowTemplate");

const btnShowToday = document.getElementById("btnShowToday");
const btnShowAll = document.getElementById("btnShowAll");
const btnShowRx = document.getElementById("btnShowRx");

const todaysContainer = document.getElementById("todaysContainer");
const allMedsContainer = document.getElementById("allMedsContainer");
const allRxContainer = document.getElementById("allRxContainer");
const todaysList = document.getElementById("todaysList");
const medList = document.getElementById("medList");
const rxList = document.getElementById("rxList");

let prescriptions = [];
let todaysReminders = [];
let lastFetchedHistory = null;
let lowMedNotified = new Set();
const toast = document.getElementById("toast");

function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = `toast active ${type}`;
  setTimeout(() => { toast.classList.remove('active'); }, 3000);
}

async function toggleBtnLoading(btn, isLoading) {
  if (!btn) return;
  if (isLoading) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

const API_BASE = "http://localhost:3000/api";

function normalizePhoneIN(p) {
  return String(p || "").replace(/\D/g, "").slice(-10);
}

async function getOrCreateUser(fullName, role, phone) {
  const normalized = normalizePhoneIN(phone);
  const phoneKey = normalized || "nophone"; // used only as part of the email uniqueness key
  const nameKey = fullName.replace(/\s+/g, '').toLowerCase() || 'unknown';
  const email = `${nameKey}_${phoneKey}_${role}@safemeds.local`;
  try {
    const response = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: fullName, phone_number: normalized || null, role })
    });
    const data = await response.json();
    if (data.success) return data.data.user_id;
    const res2 = await fetch(`${API_BASE}/users`);
    const data2 = await res2.json();
    const existing = data2.data.find(u => u.email === email);
    if (existing) return existing.user_id;
  } catch (e) { console.error(e); }
  return null;
}

async function getOrCreateMedication(name, route) {
  try {
    const response = await fetch(`${API_BASE}/medications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medication_name: name, dosage_form: route || "oral", strength: '-' })
    });
    const data = await response.json();
    return data.data?.medication_id;
  } catch (e) { console.error(e); }
  return null;
}

async function createPrescription(patientId, doctorId, medId, dosage, freq, instructions, startDate, totalPills) {
  try {
    const response = await fetch(`${API_BASE}/prescriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: patientId, doctor_id: doctorId, medication_id: medId,
        dosage: dosage || "Unknown", frequency: freq || "Unknown", start_date: startDate || new Date().toISOString().split('T')[0],
        instructions: instructions, total_pills: totalPills || 0
      })
    });
    const data = await response.json();
    return data.data?.prescription_id;
  } catch (e) { console.error(e); }
  return null;
}

async function createSchedule(rxId, time, dosageAmt) {
  try {
    let t = time;
    if (t && t.length === 5) t = t + ":00";
    if (!t) t = "08:00:00";
    const response = await fetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prescription_id: rxId, time_of_day: t, dosage_amount: dosageAmt || "unknown"
      })
    });
    const data = await response.json();
    return data.data?.schedule_id;
  } catch (e) { console.error(e); }
  return null;
}

async function loadServerData() {
  try {
    const uData = localStorage.getItem('safemeds_user');
    if (!uData) return;
    const u = JSON.parse(uData);
    const rxResp = await fetch(`${API_BASE}/prescriptions?patientId=${u.id}`);
    const schResp = await fetch(`${API_BASE}/schedules?patientId=${u.id}`);
<<<<<<< HEAD
    const logResp = await fetch(`${API_BASE}/history/${u.id}`);
    if (!rxResp.ok || !schResp.ok || !logResp.ok) return;
    const rxData = await rxResp.json();
    const schData = await schResp.json();
    const logData = await logResp.json();
    
    // Process history to find today's handled reminders
    const todayLogs = [];
    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (logData.success && logData.data[todayStr]) {
      logData.data[todayStr].forEach(l => todayLogs.push(l));
    }
    window.todayAdherenceLogs = todayLogs; 
=======
    const histResp = await fetch(`${API_BASE}/history/${u.id}`);
    
    if (!rxResp.ok || !schResp.ok || !histResp.ok) return;
    
    const rxData = await rxResp.json();
    const schData = await schResp.json();
    const histData = await histResp.json();
>>>>>>> 4f4168d16d2e40cb3c87c8a5df1f1a33cc55010e

    const groupedMap = new Map();
    rxData.data.forEach(p => {
      let safeDate = p.start_date ? p.start_date.split('T')[0] : 'Unknown';
      let groupKey = `${p.patient_name}_${p.doctor_name}_${safeDate}`;
      if (!groupedMap.has(groupKey)) {
        let meta = { age: '-', gender: '-', symptoms: '-', height: '-', weight: '-', temp: '-' };
        try {
          if (p.instructions && p.instructions.includes('{')) {
            meta = JSON.parse(p.instructions);
          }
        } catch (e) { }
        groupedMap.set(groupKey, {
          id: p.prescription_id,
          patientName: p.patient_name || "-",
          age: meta.age || "-",
          gender: meta.gender || "-",
          doctorName: p.doctor_name || "-",
          date: safeDate,
          symptoms: meta.symptoms || "-",
          height: meta.height || "-",
          weight: meta.weight || "-",
          temp: meta.temp || "-",
          medications: [],
          originalRxIds: []
        });
      }
      let group = groupedMap.get(groupKey);
      group.originalRxIds.push(p.prescription_id);
      group.isPaused = p.is_paused || false;
      let schedules = schData.data.filter(s => s.prescription_id === p.prescription_id);
      schedules.forEach(s => {
        group.medications.push({
          serverSchId: s.schedule_id,
          serverRxId: p.prescription_id,
          name: p.medication_name || "-",
          dosage: p.dosage || "-",
          freq: p.frequency || "-",
          route: p.dosage_form || "-",
          isPaused: p.is_paused || false,
          timeline: "-",
          pills: p.total_pills || 0,
          time: s.time_of_day ? s.time_of_day.substring(0, 5) : "08:00",
        });
      });
    });
    prescriptions = Array.from(groupedMap.values());
    lastFetchedHistory = histData.data;
    
    generateTodaysReminders();
    
    if (btnShowToday.classList.contains('active')) renderTodays();
    else if (btnShowAll.classList.contains('active')) renderAllMeds();
    else renderPrescriptions();
  } catch (err) {
    console.error("Failed to load server data", err);
  }
}

if ("Notification" in window) {
  if (Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission();
  }
}

// Register the service worker so notifications can fire when the tab is
// backgrounded or the browser window is minimised. Falls back gracefully on
// browsers without SW support (notifications still work via new Notification()
// as long as the tab is open).
let swRegistration = null;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then((reg) => {
    swRegistration = reg;
  }).catch((err) => {
    console.warn("Service worker registration failed:", err);
  });
}

// Single entry point for showing a medication notification. Prefers the
// service worker (OS-level, persistent) and falls back to the in-page
// Notification constructor.
async function showMedNotification(title, options) {
  if (!("Notification" in window)) {
    console.warn("[notify] browser has no Notification API");
    return;
  }
  if (Notification.permission !== "granted") {
    console.warn(`[notify] permission is '${Notification.permission}' — click 'Enable Notifications' in the header to grant it`);
    return;
  }
  const payload = {
    body: options.body,
    icon: options.icon || 'https://cdn-icons-png.flaticon.com/512/2966/2966327.png',
    badge: options.icon || 'https://cdn-icons-png.flaticon.com/512/2966/2966327.png',
    requireInteraction: true,
    tag: options.tag || 'safemeds-reminder',
    renotify: true,
  };
  try {
    const reg = swRegistration || (navigator.serviceWorker && await navigator.serviceWorker.ready);
    if (reg && reg.showNotification) {
      await reg.showNotification(title, payload);
      console.log("[notify] fired via service worker:", title);
      return;
    }
  } catch (err) {
    console.warn("[notify] SW path failed, falling back to page-local:", err);
  }
  try {
    new Notification(title, payload);
    console.log("[notify] fired via page-local Notification():", title);
  } catch (err) {
    console.warn("[notify] Notification() failed:", err);
  }
}

// Visible banner + button so the user has a clear, user-gesture-triggered
// path to granting notification permission — the silent requestPermission()
// on page load is often ignored by Chrome/Brave until the user interacts.
function syncNotifButton() {
  const btn = document.getElementById("enableNotifsBtn");
  if (!btn) return;
  if (!("Notification" in window)) {
    btn.style.display = "none";
    return;
  }
  if (Notification.permission === "granted") {
    btn.style.display = "none";
  } else if (Notification.permission === "denied") {
    btn.style.display = "flex";
    btn.textContent = "🔕 Notifications blocked — click for help";
  } else {
    btn.style.display = "flex";
    btn.textContent = "🔔 Enable Notifications";
  }
}
document.addEventListener("DOMContentLoaded", syncNotifButton);
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("enableNotifsBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (Notification.permission === "denied") {
      alert("Your browser has blocked notifications for this site. Open site settings (🔒 icon next to the URL) and set Notifications to Allow, then reload.");
      return;
    }
    const result = await Notification.requestPermission();
    syncNotifButton();
    if (result === "granted") {
      showToast("Notifications enabled ✓");
      showMedNotification("SafeMeds", { body: "Notifications are working — reminders will appear as desktop toasts.", tag: "test" });
    } else {
      showToast("Notifications not enabled", "warn");
    }
  });
});

let triggeredToday = new Set();

function generateTodaysReminders() {
  const allMeds = getAllMedications();
  const todayKey = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const todaysHistory = lastFetchedHistory ? lastFetchedHistory[todayKey] || [] : [];

  allMeds.forEach((med, index) => {
    const remId = `${med.serverSchId}`;
    const existing = todaysReminders.find(r => r.id === remId);
    let t24 = med.time || "08:00";
    let [h, m] = t24.split(":");
    let H = parseInt(h);
    let ampm = H >= 12 ? "PM" : "AM";
    let h12 = H % 12 || 12;
    let displayTime = `${h12.toString().padStart(2, '0')}:${m} ${ampm}`;
    const dailyReq = allMeds.filter(m => m.serverRxId === med.serverRxId).length;

    // Check if this specific medication and time was already logged today
    // Note: This is a simple heuristic based on medication name and time
    const historyEntry = todaysHistory.find(h => 
      h.medication.toLowerCase() === med.name.toLowerCase() && 
      h.time.replace(/^0/, '') === displayTime.replace(/^0/, '')
    );

    const initialStatus = historyEntry ? historyEntry.status : "pending";
    const initialReason = historyEntry ? historyEntry.reason : "";

    if (!existing) {
      todaysReminders.push({
        id: remId,
        serverRxId: med.serverRxId,
        serverSchId: med.serverSchId,
        mappedTime24: t24,
        time: displayTime,
        name: med.name,
        dosage: med.dosage,
        route: med.route,
        pills: med.pills || 0,
        dailyRequirement: dailyReq,
        icon: H < 12 ? "☀️" : (H < 18 ? "🕒" : "🌙"),
<<<<<<< HEAD
        isPaused: med.isPaused || false,
        status: "pending",
        skipReason: ""
=======
        status: initialStatus,
        skipReason: initialReason
>>>>>>> 4f4168d16d2e40cb3c87c8a5df1f1a33cc55010e
      });
    } else {
      existing.serverRxId = med.serverRxId;
      existing.serverSchId = med.serverSchId;
      existing.mappedTime24 = t24;
      existing.time = displayTime;
      existing.name = med.name;
      existing.dosage = med.dosage;
      existing.route = med.route;
      existing.pills = med.pills || 0;
      existing.dailyRequirement = dailyReq;
      existing.icon = H < 12 ? "☀️" : (H < 18 ? "🕒" : "🌙");
<<<<<<< HEAD
      existing.isPaused = med.isPaused || false;
    }

    // Update status from server logs
    const currentRem = todaysReminders.find(r => r.id === remId);
    if (window.todayAdherenceLogs && currentRem) {
      // Match on name plus 24-hour time. Prefer scheduled_time (exactly the dose's
      // configured slot) and fall back to actual_time so older logs still resolve.
      const remTime = currentRem.mappedTime24.substring(0, 5);
      const log = window.todayAdherenceLogs.find(l => {
        if ((l.medication || '').toLowerCase() !== currentRem.name.toLowerCase()) return false;
        const sch = (l.scheduled_time || '').substring(0, 5);
        const act = (l.time || '').split(' ')[0];
        return sch === remTime || act === remTime;
      });
      if (log) {
        currentRem.status = log.status;
        if (log.status === 'skipped') currentRem.skipReason = log.reason || "Skipped";
=======
      // Only set status if it's currently pending (don't overwrite local UI state if already changed)
      if (existing.status === "pending") {
        existing.status = initialStatus;
        existing.skipReason = initialReason;
>>>>>>> 4f4168d16d2e40cb3c87c8a5df1f1a33cc55010e
      }
    }
  });
  const prescribedIds = allMeds.map((med) => `${med.serverSchId}`);
  todaysReminders = todaysReminders.filter(rem => prescribedIds.includes(rem.id));
}

setInterval(() => {
  const now = new Date();
  let hours = now.getHours().toString().padStart(2, '0');
  let minutes = now.getMinutes().toString().padStart(2, '0');
  let current24h = `${hours}:${minutes}`;

  if (current24h === "00:00") {
    if (triggeredToday.size > 0) triggeredToday.clear();
    todaysReminders.forEach(r => { r.status = "pending"; r.skipReason = ""; });
    renderTodays();
  }

  todaysReminders.forEach(rem => {
    if (rem.status === 'pending' && rem.mappedTime24 === current24h && !triggeredToday.has(rem.id) && !rem.isPaused) {
      triggeredToday.add(rem.id);
      window.triggerAlarm(rem.id);
      const uData = JSON.parse(localStorage.getItem('safemeds_user'));
      if (uData && uData.smsEnabled && uData.phone) {
        triggerSMSReminder(uData.phone, rem.name);
        
        // Also log the reminder in the DB
        if (rem.serverSchId) {
          fetch(`${API_BASE}/reminders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              schedule_id: rem.serverSchId,
              patient_id: uData.id,
              reminder_time: new Date().toISOString(),
              reminder_type: "sms"
            })
          }).catch(e => console.error("SMS log skip", e));
        }
      }
    }
  });
}, 5000);

function getAllMedications() {
  const meds = [];
  prescriptions.forEach(rx => {
    rx.medications.forEach(med => {
      meds.push({ ...med, rxId: rx.id });
    });
  });
  return meds;
}

window.addEventListener('DOMContentLoaded', async () => {
  const userData = localStorage.getItem('safemeds_user');
  if (!userData) {
    authChoiceModal.classList.add('active');
  } else {
    const u = JSON.parse(userData);
    document.getElementById('rxPatientName').value = u.name;
    const pb = document.getElementById('profileBadge');
    if (pb) pb.style.display = 'flex';
    await loadServerData();
  }
  renderTodays();
});

onboardBtn.addEventListener('click', async () => {
  const name = onboardName.value.trim();
  const rawPhone = onboardPhone.value.trim();
  const phone = normalizePhoneIN(rawPhone);
  const sms = onboardSmsToggle.checked;
  if (!name || !phone) return alert("Please enter name and a valid 10-digit phone.");
  await toggleBtnLoading(onboardBtn, true);

  // We're inside a user-gesture click handler — this is the reliable moment
  // to request notification permission. The silent request on page load is
  // frequently suppressed by Chromium browsers.
  if ("Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (_) {}
    syncNotifButton();
  }

  let userId = null;
  let loggedIn = false;
  try {
    const resp = await fetch(`${API_BASE}/users/check?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`);
    const check = await resp.json();
    if (check.success && check.exists && check.user) {
      userId = check.user.user_id;
      loggedIn = true;
    }
  } catch (e) { console.error("profile lookup failed", e); }

  if (!userId) userId = await getOrCreateUser(name, 'patient', phone);

  if (userId) {
    localStorage.setItem('safemeds_user', JSON.stringify({
      id: userId,
      name: name,
      phone: phone,
      smsEnabled: sms
    }));
    onboardModal.classList.remove('active');
    document.getElementById('rxPatientName').value = name;
    await loadServerData();
    showToast(loggedIn ? "Welcome back!" : "Profile created successfully!");
  }
  await toggleBtnLoading(onboardBtn, false);
});

async function checkUserExistence() {
  const name = onboardName.value.trim();
  const phone = onboardPhone.value.trim();
  if (name.length > 2 && phone.length > 5) {
    try {
      const resp = await fetch(`${API_BASE}/users/check?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`);
      const data = await resp.json();
      if (data.exists) {
        onboardBtn.textContent = "Login";
        onboardBtn.style.background = "#1a73e8"; // Use a slightly different blue for login
      } else {
        onboardBtn.textContent = "Save Profile";
        onboardBtn.style.background = "var(--btn-teal)";
      }
    } catch (err) { }
  } else {
    onboardBtn.textContent = "Save Profile";
    onboardBtn.style.background = "var(--btn-teal)";
  }
}

onboardName.addEventListener("input", checkUserExistence);
onboardPhone.addEventListener("input", checkUserExistence);

choiceLoginBtn.addEventListener("click", () => {
  authChoiceModal.classList.remove("active");
  onboardModal.classList.add("active");
  onboardBtn.textContent = "Login";
  onboardBtn.style.background = "#1a73e8";
});

choiceSignupBtn.addEventListener("click", () => {
  authChoiceModal.classList.remove("active");
  onboardModal.classList.add("active");
  onboardBtn.textContent = "Save Profile";
  onboardBtn.style.background = "var(--btn-teal)";
});

backOnboardBtn.addEventListener("click", () => {
  onboardModal.classList.remove("active");
  authChoiceModal.classList.add("active");
});

function switchView(view) {
  btnShowToday.classList.remove("active");
  btnShowAll.classList.remove("active");
  btnShowRx.classList.remove("active");
  todaysContainer.classList.add("hidden");
  allMedsContainer.classList.add("hidden");
  allRxContainer.classList.add("hidden");
  if (view === "today") {
    btnShowToday.classList.add("active");
    todaysContainer.classList.remove("hidden");
    renderTodays();
  } else if (view === "all") {
    btnShowAll.classList.add("active");
    allMedsContainer.classList.remove("hidden");
    renderAllMeds();
  } else if (view === "rx") {
    btnShowRx.classList.add("active");
    allRxContainer.classList.remove("hidden");
    renderPrescriptions();
  }
}

btnShowToday.addEventListener("click", () => switchView("today"));
btnShowAll.addEventListener("click", () => switchView("all"));
btnShowRx.addEventListener("click", () => switchView("rx"));

const currentLocBtn = document.getElementById("currentLocBtn");
const searchMapLocBtn = document.getElementById("searchMapLocBtn");
const mapLocationInput = document.getElementById("mapLocationInput");
const mapStoreList = document.getElementById("mapStoreList");
const autocompleteResults = document.getElementById("autocompleteResults");
const expandedMapModal = document.getElementById("expandedMapModal");
const expandMapBtn = document.getElementById("expandMapBtn");
const closeExpandedMapBtn = document.getElementById("closeExpandedMapBtn");
const modalMapStoreList = document.getElementById("modalMapStoreList");
const modalMapLocationInput = document.getElementById("modalMapLocationInput");
const modalSearchMapLocBtn = document.getElementById("modalSearchMapLocBtn");
const modalCurrentLocBtn = document.getElementById("modalCurrentLocBtn");
const modalAutocompleteResults = document.getElementById("modalAutocompleteResults");

let map = null;
let modalMap = null;
let mapMarkers = [];            // legacy — now holds pharmacy markers for main map
let modalMapMarkers = [];       // pharmacy markers for modal map
let userMarker = null;          // user location dot on main map
let modalUserMarker = null;     // user location dot on modal map
let debounceTimer;
let currentMapCenter = [78.0322, 30.3165];

window.addEventListener('load', () => {
  if (!map) {
    map = tt.map({
      key: ttKey,
      container: 'mapContainer',
      center: currentMapCenter,
      zoom: 13
    });
    setTimeout(() => map.resize(), 500);

    map.on('moveend', () => {
      currentMapCenter = map.getCenter();
    });
  }
});

let modalExpanded = false;
expandMapBtn.addEventListener('click', () => {
  modalExpanded = true;
  expandedMapModal.classList.add('active');
  if (!modalMap) {
    modalMap = tt.map({
      key: ttKey,
      container: 'modalMapContainer',
      center: currentMapCenter,
      zoom: map ? map.getZoom() : 13
    });
    modalMap.on('load', () => {
      setTimeout(() => modalMap.resize(), 50);
    });
  } else {
    modalMap.setCenter(currentMapCenter);
    modalMap.setZoom(map ? map.getZoom() : 13);
  }
  // Resize after modal transition completes so tiles render at full size
  setTimeout(() => { if (modalMap) modalMap.resize(); }, 350);
  syncModalStoreList();
});

closeExpandedMapBtn.addEventListener('click', () => {
  modalExpanded = false;
  expandedMapModal.classList.remove('active');
});

function syncModalStoreList() {
  if (modalMapStoreList && mapStoreList) {
    modalMapStoreList.innerHTML = mapStoreList.innerHTML;
  }
}

mapLocationInput.addEventListener("input", (e) => {
  clearTimeout(debounceTimer);
  const query = e.target.value.trim();
  if (query.length < 3) {
    autocompleteResults.innerHTML = "";
    autocompleteResults.classList.add("hidden");
    return;
  }
  handleAutocomplete(query, mapLocationInput, autocompleteResults);
});

modalMapLocationInput.addEventListener("input", (e) => {
  clearTimeout(debounceTimer);
  const query = e.target.value.trim();
  if (query.length < 3) {
    modalAutocompleteResults.innerHTML = "";
    modalAutocompleteResults.classList.add("hidden");
    return;
  }
  handleAutocomplete(query, modalMapLocationInput, modalAutocompleteResults);
});

function handleAutocomplete(query, inputEl, resultsEl) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Bias results to the current map view (Google-style "search near here")
    const lon = Array.isArray(currentMapCenter) ? currentMapCenter[0] : currentMapCenter.lng;
    const lat = Array.isArray(currentMapCenter) ? currentMapCenter[1] : currentMapCenter.lat;
    const params = new URLSearchParams({
      key: ttKey,
      countrySet: "IN",
      limit: "5",
      typeahead: "true",
      lat: String(lat),
      lon: String(lon),
      radius: "50000",
    });
    const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params.toString()}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        resultsEl.innerHTML = "";
        if (data.results && data.results.length > 0) {
          resultsEl.classList.remove("hidden");
          data.results.forEach(item => {
            const div = document.createElement("div");
            div.className = "autocomplete-item";
            const mainText = item.poi ? item.poi.name : (item.address.streetName || item.address.municipality || "Unknown Location");
            const exactAddress = item.address.freeformAddress || mainText;
            div.innerHTML = `<strong style="color: var(--text-main); font-size: 0.95rem;">${mainText}</strong><br><small style="color: var(--muted); font-size: 0.8rem;">${exactAddress}</small>`;
            div.onclick = () => {
              mapLocationInput.value = exactAddress;
              if (modalMapLocationInput) modalMapLocationInput.value = exactAddress;
              autocompleteResults.classList.add("hidden");
              if (modalAutocompleteResults) modalAutocompleteResults.classList.add("hidden");
              fetchStoresAndMap(item.position.lat, item.position.lon);
            };
            resultsEl.appendChild(div);
          });
        } else {
          resultsEl.classList.add("hidden");
        }
      })
      .catch(err => console.error("Autocomplete Error: ", err));
  }, 300);
}

document.addEventListener("click", (e) => {
  if (!mapLocationInput.contains(e.target) && !autocompleteResults.contains(e.target)) {
    autocompleteResults.classList.add("hidden");
  }
  if (modalMapLocationInput && modalAutocompleteResults && !modalMapLocationInput.contains(e.target) && !modalAutocompleteResults.contains(e.target)) {
    modalAutocompleteResults.classList.add("hidden");
  }
});

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lng}.json?key=${ttKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const first = data.addresses && data.addresses[0];
    return first?.address?.freeformAddress || null;
  } catch (e) {
    console.warn("Reverse geocode failed:", e);
    return null;
  }
}

function handleCurrentLocation() {
  if (!navigator.geolocation) {
    return alert("Your browser does not support geolocation.");
  }

  const buttons = [currentLocBtn, modalCurrentLocBtn].filter(Boolean);
  const originalLabels = buttons.map(b => b.textContent);
  buttons.forEach(b => { b.textContent = "Locating…"; b.disabled = true; });
  const restoreButtons = () => {
    buttons.forEach((b, i) => { b.textContent = originalLabels[i]; b.disabled = false; });
  };

  const onSuccess = async (position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const address = await reverseGeocode(lat, lng);
    const shown = address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    mapLocationInput.value = shown;
    if (modalMapLocationInput) modalMapLocationInput.value = shown;
    fetchStoresAndMap(lat, lng);
    restoreButtons();
  };

  const tryLowAccuracy = () => {
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        restoreButtons();
        console.error("Geolocation failed:", err);
        if (err.code === err.PERMISSION_DENIED) {
          alert("Location permission denied. Enable it in your browser's site settings to use Current Location.");
        } else {
          alert("Unable to retrieve your location. Please check your device's location services and try again.");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  navigator.geolocation.getCurrentPosition(
    onSuccess,
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        restoreButtons();
        alert("Location permission denied. Enable it in your browser's site settings to use Current Location.");
        return;
      }
      // Fall back to low-accuracy retry on POSITION_UNAVAILABLE / TIMEOUT
      tryLowAccuracy();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

currentLocBtn.addEventListener("click", handleCurrentLocation);
if (modalCurrentLocBtn) modalCurrentLocBtn.addEventListener("click", handleCurrentLocation);

function handleSearch() {
  const query = (modalExpanded && modalMapLocationInput && modalMapLocationInput.value.trim())
    ? modalMapLocationInput.value.trim()
    : mapLocationInput.value.trim();
  if (!query) return;
  const lon = Array.isArray(currentMapCenter) ? currentMapCenter[0] : currentMapCenter.lng;
  const lat = Array.isArray(currentMapCenter) ? currentMapCenter[1] : currentMapCenter.lat;
  const params = new URLSearchParams({
    key: ttKey,
    countrySet: "IN",
    limit: "5",
    lat: String(lat),
    lon: String(lon),
    radius: "50000",
  });
  const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params.toString()}`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (!data.results || data.results.length === 0) {
        alert("Location not found.");
        return;
      }
      const top = data.results[0];
      const address = top.address.freeformAddress || query;
      mapLocationInput.value = address;
      if (modalMapLocationInput) modalMapLocationInput.value = address;
      fetchStoresAndMap(top.position.lat, top.position.lon);
    })
    .catch(err => {
      console.error("Search error:", err);
      alert("Search failed. Please try again.");
    });
}

searchMapLocBtn.addEventListener("click", handleSearch);
if (modalSearchMapLocBtn) modalSearchMapLocBtn.addEventListener("click", handleSearch);

// Submit search on Enter key
mapLocationInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } });
if (modalMapLocationInput) modalMapLocationInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } });

function makeUserMarkerElement() {
  const el = document.createElement('div');
  el.style.backgroundColor = '#ea4335';
  el.style.width = '16px';
  el.style.height = '16px';
  el.style.borderRadius = '50%';
  el.style.border = '2px solid white';
  el.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';
  return el;
}

function fetchStoresAndMap(lat, lng) {
  if (!map) return;

  currentMapCenter = [lng, lat];
  map.flyTo({ center: [lng, lat], zoom: 14 });

  // Clear pharmacy markers (keep user marker separate)
  mapMarkers.forEach(m => m.remove());
  mapMarkers = [];

  if (modalMap) {
    modalMap.flyTo({ center: [lng, lat], zoom: 14 });
    modalMapMarkers.forEach(m => m.remove());
    modalMapMarkers = [];
  }

  // Reuse / move the single user marker instead of stacking duplicates
  if (userMarker) {
    userMarker.setLngLat([lng, lat]);
  } else {
    userMarker = new tt.Marker({ element: makeUserMarkerElement() }).setLngLat([lng, lat]).addTo(map);
  }
  if (modalMap) {
    if (modalUserMarker) {
      modalUserMarker.setLngLat([lng, lat]);
    } else {
      modalUserMarker = new tt.Marker({ element: makeUserMarkerElement() }).setLngLat([lng, lat]).addTo(modalMap);
    }
  }

  mapStoreList.innerHTML = '<p style="color:var(--muted); text-align:center; margin-top:50px;">Scanning for pharmacies nearby...</p>';
  tt.services.fuzzySearch({
    key: ttKey,
    query: 'pharmacy',
    center: [lng, lat],
    radius: 5000,
    limit: 10
  }).then(response => {
    if (!response.results || response.results.length === 0) {
      mapStoreList.innerHTML = '<p style="color:var(--btn-red); text-align:center; margin-top:50px;">No pharmacies found nearby.</p>';
      syncModalStoreList();
      return;
    }
    let storeHtml = '<h4 style="margin-top:0; border-bottom: 2px solid var(--border); padding-bottom: 12px; position:sticky; top:0; background:white; z-index:10;">Nearest 10 Pharmacies</h4>';
    response.results.forEach(place => {
      const pLat = place.position.lat;
      const pLng = place.position.lng;
      const name = place.poi ? place.poi.name : 'Pharmacy';
      const address = place.address ? place.address.freeformAddress : '';
      const distKm = place.dist ? (place.dist / 1000).toFixed(1) : '-';
      const marker = new tt.Marker().setLngLat([pLng, pLat]).addTo(map);
      marker.setPopup(new tt.Popup({ offset: 30 }).setHTML(`<b>${name}</b><br>${address}`));
      mapMarkers.push(marker);

      if (modalMap) {
        const modalMarker = new tt.Marker().setLngLat([pLng, pLat]).addTo(modalMap);
        modalMarker.setPopup(new tt.Popup({ offset: 30 }).setHTML(`<b>${name}</b><br>${address}`));
        modalMapMarkers.push(modalMarker);
      }

      storeHtml += `
        <div class="store-item" data-lat="${pLat}" data-lng="${pLng}" style="padding: 12px 0; border-bottom: 1px dashed #ddd; cursor:pointer;">
          <strong style="color: var(--text-main); font-size: 1.05rem;">${name}</strong><br>
          <small style="color: var(--btn-blue); font-weight: 600;">📍 ~${distKm} km away</small><br>
          <small style="color: var(--muted);">${address}</small>
        </div>
      `;
    });
    mapStoreList.innerHTML = storeHtml;
    syncModalStoreList();
  }).catch(err => {
    console.error("Pharmacy search failed:", err);
    mapStoreList.innerHTML = '<p style="color:var(--btn-red); text-align:center; margin-top:50px;">Error loading pharmacies.</p>';
  });
}

// Delegated click: fly both maps to a selected pharmacy
function onStoreClick(e) {
  const item = e.target.closest('.store-item');
  if (!item) return;
  const pLat = parseFloat(item.getAttribute('data-lat'));
  const pLng = parseFloat(item.getAttribute('data-lng'));
  if (isNaN(pLat) || isNaN(pLng)) return;
  if (map) map.flyTo({ center: [pLng, pLat], zoom: 16 });
  if (modalMap) modalMap.flyTo({ center: [pLng, pLat], zoom: 16 });
}
mapStoreList.addEventListener('click', onStoreClick);
if (modalMapStoreList) modalMapStoreList.addEventListener('click', onStoreClick);

window.triggerAlarm = function (id) {
  const rem = todaysReminders.find(r => r.id === id);
  if (!rem) return;
  ringingMedId.value = id;
  document.getElementById('ringingDetails').innerHTML = `
    <strong style="font-size: 1.4rem; color: var(--text-main);">${rem.name}</strong><br>
    <span style="color: var(--muted); font-size: 1.1rem; display:inline-block; margin-top:8px;">${rem.dosage} • ${rem.route}</span><br>
    <span style="color: var(--btn-blue); font-weight:bold; display:inline-block; margin-top:8px;">Scheduled for ${rem.time}</span>
  `;
  ringingModal.classList.add('active');
  showMedNotification(`Medication Reminder: ${rem.name}`, {
    body: `It's time to take ${rem.dosage} via ${rem.route} scheduled at ${rem.time}.`,
    tag: `med-reminder-${rem.id}`,
  });
};

ringingDoneBtn.addEventListener("click", async () => {
  const btn = ringingDoneBtn;
  const id = ringingMedId.value;
  const reminder = todaysReminders.find(r => r.id === id);
  if (reminder) {
    reminder.status = "taken";
    if (reminder.serverRxId) {
      await toggleBtnLoading(btn, true);
      const scheduledTime = new Date().toISOString().split('T')[0] + 'T' + reminder.mappedTime24 + ':00';
      try {
        const resp = await fetch(`${API_BASE}/prescriptions/${reminder.serverRxId}/take`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule_id: reminder.serverSchId,
            scheduled_time: scheduledTime
          })
        });
        const resJson = await resp.json().catch(() => ({}));
        if (resJson && resJson.refill_needed) {
          const pillsLeft = resJson.data?.total_pills ?? 0;
          const medName = resJson.medication_name || reminder.name;
          showToast(`Refill needed — only ${pillsLeft} pill(s) left of ${medName}`, "warn");
          showMedNotification("SafeMeds Refill Alert", {
            body: `Only ${pillsLeft} pill(s) of ${medName} remaining. Please refill soon.`,
            tag: `refill-${reminder.serverRxId}`,
          });
          if (resJson.refill_sms && resJson.refill_sms.ok === false) {
            console.warn("Refill SMS not delivered:", resJson.refill_sms);
          }
        }
      } catch (err) {
        console.error("Take request failed:", err);
      }
      await loadServerData();
      await toggleBtnLoading(btn, false);
    }
    showToast("Medication logged as Taken!");
  }
  ringingModal.classList.remove('active');
  renderTodays();
});

ringingSkipBtn.addEventListener("click", () => {
  const id = ringingMedId.value;
  ringingModal.classList.remove('active');
  skipMedId.value = id;
  skipReasonInput.value = "";
  skipModal.classList.add("active");
});

cancelSkipBtn.addEventListener("click", () => skipModal.classList.remove("active"));

confirmSkipBtn.addEventListener("click", async () => {
  const id = skipMedId.value;
  const reason = skipReasonInput.value.trim();
  if (!reason) return alert("Please provide a reason for skipping.");
  const btn = confirmSkipBtn;
  const reminder = todaysReminders.find(r => r.id === id);
  if (reminder) {
    // Set status locally first so it survives the loadServerData re-render.
    // (The server-to-client log match is done on medication name and scheduled_time,
    //  so wait — we also want the server log to be the source of truth on reload.)
    reminder.status = "skipped";
    reminder.skipReason = reason;
    if (reminder.serverRxId) {
      await toggleBtnLoading(btn, true);
      const scheduledTime = new Date().toISOString().split('T')[0] + 'T' + reminder.mappedTime24 + ':00';
      try {
        await fetch(`${API_BASE}/prescriptions/${reminder.serverRxId}/skip`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason,
            schedule_id: reminder.serverSchId,
            scheduled_time: scheduledTime
          })
        });
      } catch (err) {
        console.error("Skip request failed:", err);
      }
      await loadServerData();
      await toggleBtnLoading(btn, false);
    }
    renderTodays();
    skipModal.classList.remove("active");
    showToast("Medication skipped & logged!");
  }
});

function renderTodays() {
  generateTodaysReminders();
  const prescribedMedNames = getAllMedications().map(m => m.name.toLowerCase());
  const filteredReminders = todaysReminders.filter(rem =>
    prescribedMedNames.includes(rem.name.toLowerCase())
  );
  if (filteredReminders.length === 0) {
    todaysList.innerHTML = "<p style='color:var(--muted); text-align:center; margin-top:50px;'>No reminders for today...</p>";
    return;
  }
  todaysList.innerHTML = filteredReminders.map((rem, index) => {
    let statusIcon = "";
    let actions = "";
    if (rem.status === "taken") {
<<<<<<< HEAD
      statusIcon = `<span style="color: var(--btn-green); font-size: 1.5rem; font-weight: bold;">✔️ Taken</span>`;
      actions = ``;
    } else if (rem.status === "skipped") {
      statusIcon = `
        <div style="text-align:right;">
          <span style="color: var(--btn-red); font-size: 1.2rem; font-weight: bold;">❌ Skipped</span>
          <div style="font-size:0.75rem; color:var(--text-light); margin-top:4px;">Reason: ${rem.skipReason}</div>
=======
      statusIcon = `
        <div style="background: rgba(16, 185, 129, 0.1); padding: 8px 12px; border-radius: 12px; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(16, 185, 129, 0.2);">
          <span style="color: #10B981; font-size: 1.2rem; font-weight: bold;">✓</span>
          <span style="color: #065F46; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Taken</span>
        </div>
      `;
    } else if (rem.status === "skipped") {
      statusIcon = `
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <div style="background: rgba(239, 68, 68, 0.1); padding: 8px 12px; border-radius: 12px; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(239, 68, 68, 0.2);">
            <span style="color: #EF4444; font-size: 1.2rem; font-weight: bold;">✕</span>
            <span style="color: #991B1B; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Skipped</span>
          </div>
          <div style="font-size:0.75rem; color: #7F1D1D; font-style: italic; max-width: 150px; text-align: right;">"${rem.skipReason}"</div>
>>>>>>> 4f4168d16d2e40cb3c87c8a5df1f1a33cc55010e
        </div>
      `;
      actions = ``;
    } else {
      actions = `
<<<<<<< HEAD
        <div style="color: var(--btn-blue); font-size: 0.85rem; font-weight: 600;">Upcoming: ${rem.time}</div>
=======
        <div style="background: rgba(59, 130, 246, 0.1); padding: 8px 12px; border-radius: 12px; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(59, 130, 246, 0.2);">
          <span style="color: #3B82F6; font-size: 1rem;">🕒</span>
          <span style="color: #1E40AF; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Scheduled</span>
        </div>
>>>>>>> 4f4168d16d2e40cb3c87c8a5df1f1a33cc55010e
      `;
    }
    const colors = ['bg-teal', 'bg-blue', 'bg-orange'];
    const colorClass = colors[index % colors.length];
    return `
      <div class="med-item" style="${(rem.status === 'taken' || rem.status === 'skipped') ? 'opacity: 0.8; background: #f9f9f9;' : ''}">
        <div class="med-icon-circle ${colorClass}">${rem.icon}</div> 
        <div class="med-details">
          <div class="med-title" style="${(rem.status === 'taken' || rem.status === 'skipped') ? 'text-decoration: line-through; color: var(--muted);' : ''}">${rem.time} - ${rem.name}</div>
          <div class="med-subtitle">Dosage: ${rem.dosage} | Route: ${rem.route}</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:center; min-width: 140px;">
            ${statusIcon}
            ${actions}
        </div>
      </div>
    `;
  }).join("");
}

function renderAllMeds() {
  const meds = getAllMedications();
  if (meds.length === 0) {
    medList.innerHTML = "<p style='color:var(--muted); text-align:center; margin-top:50px;'>No saved medicines...</p>";
    document.getElementById("refillAlertsContainer").innerHTML = "";
    return;
  }
  const lowMeds = meds.filter(m => m.pills <= 3);
  const alertsContainer = document.getElementById("refillAlertsContainer");
  if (lowMeds.length > 0) {
    lowMeds.forEach(m => {
      const notifyKey = `${m.serverRxId}_${m.pills}`;
      if (!lowMedNotified.has(notifyKey)) {
        if ("Notification" in window && Notification.permission === "granted") {
           new Notification("SafeMeds Low Stock Alert", {
             body: `Only ${m.pills} pills remaining for ${m.name}. Please request a refill.`,
             icon: 'https://cdn-icons-png.flaticon.com/512/2966/2966327.png'
           });
           lowMedNotified.add(notifyKey);
        }
      }
    });
    alertsContainer.innerHTML = lowMeds.map(m => `
       <div style="background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <strong style="color: var(--btn-red);">⚠ Refill Alert: ${m.name}</strong><br>
          <small style="color: var(--text-light);">Only ${m.pills} pills remaining.</small>
       </div>
     `).join("");
  } else {
    alertsContainer.innerHTML = "";
  }
  medList.innerHTML = meds.map((med, index) => {
    const colors = ['bg-teal', 'bg-blue', 'bg-orange'];
    const icons = ['💊', '🤍', '⚕️', '🔬'];
    const colorClass = colors[index % colors.length];
    const icon = icons[index % icons.length];
    return `
    <div class="med-item">
      <div class="med-icon-circle ${colorClass}">${icon}</div> 
      <div class="med-details">
        <div class="med-title">
            ${index + 1}. ${med.name}
            <span class="status-badge">${med.dosage}</span>
        </div>
        <div class="med-subtitle">
            Time: ${med.time || '-'} | Route: ${med.route}
        </div>
        <div class="med-subtitle" style="font-size: 0.8rem;">
           <span style="color: ${med.pills <= 3 ? 'var(--btn-red)' : 'var(--btn-teal)'}; font-weight: 600;">
             ${med.pills || 0} pills left
           </span>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end;">
            ${med.isPaused ? '<span style="color:var(--btn-red); font-size:0.75rem; font-weight:bold; text-transform:uppercase;">Paused</span>' : ''}
            <button class="btn-small ${med.isPaused ? 'btn-green' : 'btn-orange'}" onclick="togglePauseMed('${med.serverRxId}', ${med.isPaused ? true : false}, event)">${med.isPaused ? 'Resume' : 'Pause'}</button>
            <button class="btn-small btn-secondary" onclick="openSideEffect('${med.serverRxId}', event)">Notes</button>
          </div>
          <div style="display:flex; gap:8px;">
              <button class="btn-small btn-secondary" onclick="openEditMed('${med.rxId}', '${med.name}', event)">Edit</button>
              <button class="btn-small btn-danger" onclick="deleteMed('${med.rxId}', '${med.name}', event)">Delete</button>
          </div>
      </div>
    </div>
  `}).join("");
}

window.togglePauseMed = async function (serverRxId, currentPaused, event) {
  if (event) event.stopPropagation();
  const newState = !currentPaused;
  console.log(`Toggling pause for ${serverRxId} from ${currentPaused} to ${newState}`);
  try {
    const res = await fetch(`${API_BASE}/prescriptions/${serverRxId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_paused: newState })
    });
    const data = await res.json();
    if (data.success) {
      await loadServerData();
      todaysReminders
        .filter(r => r.serverRxId === serverRxId)
        .forEach(r => {
          r.isPaused = newState;
          if (!newState) triggeredToday.delete(r.id);
        });
      renderTodays();
      if (btnShowAll.classList.contains('active')) renderAllMeds();
      showToast(newState ? "Reminders Paused" : "Reminders Resumed");
    } else {
      console.error("Pause toggle server error", data);
      showToast("Pause/Resume failed: " + (data.error || "unknown"), "error");
    }
  } catch (err) {
    console.error("Pause toggle failed", err);
    showToast("Pause/Resume network error", "error");
  }
};

async function triggerSMSReminder(phone, medName) {
  const message = `SafeMeds Alert: It is time to take your ${medName}. Please stay healthy!`;
  try {
    const response = await fetch(`${API_BASE}/send-reminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumber: phone,
        message: message,
      }),
    });
    const result = await response.json();
    if (result.success) {
      console.log("SMS reminder sent!");
    }
  } catch (err) {
    console.error("Failed to trigger SMS:", err);
  }
}


function renderPrescriptions() {
  if (prescriptions.length === 0) {
    rxList.innerHTML = "<p style='color:var(--muted); text-align:center; margin-top:50px;'>No saved prescriptions...</p>";
    return;
  }
  rxList.innerHTML = "";
  prescriptions.forEach((rx, index) => {
    const div = document.createElement("div");
    div.className = "med-item clickable";
    div.innerHTML = `
      <div class="med-icon-circle bg-blue">📄</div> 
      <div class="med-details" style="flex-grow: 1;">
        <div class="med-title">Prescription ${index + 1}: ${rx.patientName || 'Unknown Patient'}</div>
        <div class="med-subtitle">Dr. ${rx.doctorName || '-'} | Date: ${rx.date || '-'} | Meds: ${rx.medications.length}</div>
      </div>
      <div style="display:flex; gap:8px;">
          <button class="btn-small btn-secondary" onclick="openEditRx('${rx.id}', event)">Edit</button>
          <button class="btn-small btn-danger" onclick="deleteRx('${rx.id}', event)">Delete</button>
      </div>
    `;
    div.addEventListener("click", () => showRxDetails(rx.id));
    rxList.appendChild(div);
  });
}

function showRxDetails(rxId) {
  const rx = prescriptions.find(p => p.id === rxId);
  if (!rx) return;
  const paperContent = document.getElementById("rxPaperContent");
  let medsHtml = rx.medications.map((med, i) => `
    <div class="rx-med-item">
      <p class="rx-med-name">${i + 1}. ${med.name}</p>
      <p class="rx-med-details">Time: ${med.time || '-'} | Dosage: ${med.dosage} | Freq: ${med.freq} | Route: ${med.route} | Timeline: ${med.timeline ? med.timeline + ' days' : '-'}</p>
    </div>
  `).join("");
  paperContent.innerHTML = `
    <div class="rx-header">
      <span class="rx-symbol">Rx</span>
      <div class="rx-doctor">
        ${rx.doctorName ? `Dr. ${rx.doctorName}` : '-'}<br>
        <small>${rx.date || '-'}</small>
      </div>
    </div>
    <div class="rx-vitals">
      <p><strong>Patient:</strong> ${rx.patientName || '-'}</p>
      <p><strong>Age:</strong> ${rx.age && rx.age !== '-' ? rx.age + ' yrs' : '-'}</p>
      <p><strong>Gender:</strong> ${rx.gender || '-'}</p>
      <p><strong>Symptoms:</strong> ${rx.symptoms || '-'}</p>
      <p><strong>Height:</strong> ${rx.height && rx.height !== '-' ? rx.height + ' cm' : '-'}</p>
      <p><strong>Weight:</strong> ${rx.weight && rx.weight !== '-' ? rx.weight + ' kg' : '-'}</p>
      <p><strong>Temp:</strong> ${rx.temp && rx.temp !== '-' ? rx.temp + ' °F' : '-'}</p>
    </div>
    <div class="rx-body">
      <h4>Medications</h4>
      ${medsHtml}
    </div>
  `;
  rxDetailsModal.classList.add("active");
}

closeRxDetailsBtn.addEventListener("click", () => rxDetailsModal.classList.remove("active"));

window.deleteMed = async function (rxId, medName, event) {
  event.stopPropagation();
  if (confirm(`Are you sure you want to delete ${medName}?`)) {
    const rx = prescriptions.find(r => r.id === rxId);
    if (rx) {
      const m = rx.medications.find(x => x.name === medName);
      if (m && m.serverRxId) {
        await fetch(`${API_BASE}/prescriptions/${m.serverRxId}`, { method: 'DELETE' });
        await loadServerData();
        showToast("Medicine deleted.");
      } else {
        rx.medications = rx.medications.filter(m => m.name !== medName);
        renderAllMeds(); renderTodays();
      }
    }
  }
};

window.openEditMed = function (rxId, medName, event) {
  event.stopPropagation();
  const rx = prescriptions.find(r => r.id === rxId);
  const med = rx.medications.find(m => m.name === medName);
  document.getElementById('editMedRxId').value = rxId;
  document.getElementById('editMedOriginalName').value = medName;
  document.getElementById('editMedName').value = med.name;
  document.getElementById('editMedDosage').value = med.dosage;
  document.getElementById('editMedFreq').value = med.freq;
  document.getElementById('editMedRoute').value = med.route;
  document.getElementById('editMedTimeline').value = med.timeline && med.timeline !== '-' ? med.timeline : '';
  document.getElementById('editMedPills').value = med.pills || '';
  document.getElementById('editMedTime').value = med.time || '';
  document.getElementById('editMedModal').classList.add('active');
};

document.getElementById('saveEditMedBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveEditMedBtn');
  const rxId = document.getElementById('editMedRxId').value;
  const oldName = document.getElementById('editMedOriginalName').value;
  const rx = prescriptions.find(r => r.id === rxId);
  const med = rx.medications.find(m => m.name === oldName);
  const newName = document.getElementById('editMedName').value.trim();
  const newDosage = document.getElementById('editMedDosage').value;
  const newFreq = document.getElementById('editMedFreq').value;
  const newRoute = document.getElementById('editMedRoute').value;
  const newPills = parseInt(document.getElementById('editMedPills').value || 0, 10) || 0;
  const newTime = document.getElementById('editMedTime').value || '';

  await toggleBtnLoading(btn, true);
  try {
    if (!med || !med.serverRxId) {
      showToast("This medicine isn't saved to the server yet — cannot edit.", "error");
      return;
    }
    const metaString = JSON.stringify({ age: rx.age, gender: rx.gender, symptoms: rx.symptoms, height: rx.height, weight: rx.weight, temp: rx.temp });

    // If the drug name or route changed, point this prescription at a different medications row.
    let newMedicationId = null;
    if (newName.toLowerCase() !== (med.name || '').toLowerCase() || newRoute !== med.route) {
      newMedicationId = await getOrCreateMedication(newName, newRoute);
    }

    const putBody = {
      dosage: newDosage,
      frequency: newFreq,
      instructions: metaString,
      total_pills: newPills,
    };
    if (newMedicationId) putBody.medication_id = newMedicationId;

    const rxResp = await fetch(`${API_BASE}/prescriptions/${med.serverRxId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody),
    });
    const rxJson = await rxResp.json();
    if (!rxJson.success) throw new Error(rxJson.error || "Prescription update failed");

    // Update the schedule's time and dosage in place (preserves schedule_id + adherence history)
    if (med.serverSchId) {
      let t = newTime;
      if (t && t.length === 5) t = t + ":00";
      const schResp = await fetch(`${API_BASE}/schedules/${med.serverSchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time_of_day: t || undefined, dosage_amount: newDosage || undefined }),
      });
      const schJson = await schResp.json();
      if (!schJson.success) console.warn("Schedule update returned error:", schJson);
    }

    await loadServerData();
    showToast("Medicine updated successfully.");
  } catch (err) {
    console.error("saveEditMed failed:", err);
    showToast("Failed to update medicine: " + err.message, "error");
  } finally {
    document.getElementById('editMedModal').classList.remove('active');
    await toggleBtnLoading(btn, false);
  }
});

document.getElementById('cancelEditMedBtn').addEventListener('click', () => {
  document.getElementById('editMedModal').classList.remove('active');
});

window.deleteRx = async function (rxId, event) {
  event.stopPropagation();
  if (confirm("Are you sure you want to delete this entire prescription?")) {
    const rx = prescriptions.find(r => r.id === rxId);
    if (rx) {
      if (rx.originalRxIds && rx.originalRxIds.length > 0) {
        for (let id of rx.originalRxIds) {
          await fetch(`${API_BASE}/prescriptions/${id}`, { method: 'DELETE' });
        }
        await loadServerData();
        showToast("Prescription deleted.");
      } else {
        prescriptions = prescriptions.filter(r => r.id !== rxId);
        renderPrescriptions(); renderAllMeds(); renderTodays();
      }
    }
  }
};

let currentEditRxMeds = [];
window.openEditRx = function (rxId, event) {
  event.stopPropagation();
  const rx = prescriptions.find(r => r.id === rxId);
  if (!rx) return;
  document.getElementById('editRxId').value = rx.id;
  document.getElementById('editRxPatient').value = rx.patientName !== '-' ? rx.patientName : '';
  document.getElementById('editRxDoctor').value = rx.doctorName !== '-' ? rx.doctorName : '';
  document.getElementById('editRxAge').value = rx.age !== '-' ? rx.age : '';
  document.getElementById('editRxGender').value = rx.gender !== '-' ? rx.gender : '';
  document.getElementById('editRxDate').value = rx.date !== '-' ? rx.date : '';
  document.getElementById('editRxSymptoms').value = rx.symptoms !== '-' ? rx.symptoms : '';
  document.getElementById('editRxHeight').value = rx.height !== '-' ? rx.height : '';
  document.getElementById('editRxWeight').value = rx.weight !== '-' ? rx.weight : '';
  document.getElementById('editRxTemp').value = rx.temp !== '-' ? rx.temp : '';
  currentEditRxMeds = JSON.parse(JSON.stringify(rx.medications));
  populateEditRxMedSelect();
  document.getElementById('editRxMedFields').style.display = 'none';
  document.getElementById('editRxModal').classList.add('active');
};

function populateEditRxMedSelect() {
  const select = document.getElementById('editRxMedSelect');
  select.innerHTML = '<option value="">-- Select a Medicine --</option>';
  currentEditRxMeds.forEach((m, idx) => {
    select.innerHTML += `<option value="${idx}">${m.name}</option>`;
  });
}

document.getElementById('editRxMedSelect').addEventListener('change', (e) => {
  const idx = e.target.value;
  if (idx === "") {
    document.getElementById('editRxMedFields').style.display = 'none';
    return;
  }
  const med = currentEditRxMeds[idx];
  document.getElementById('editRxMedName').value = med.name;
  document.getElementById('editRxMedDosage').value = med.dosage;
  document.getElementById('editRxMedFreq').value = med.freq;
  document.getElementById('editRxMedRoute').value = med.route;
  document.getElementById('editRxMedTimeline').value = med.timeline && med.timeline !== '-' ? med.timeline : '';
  document.getElementById('editRxMedPills').value = med.pills || '';
  document.getElementById('editRxMedTime').value = med.time || '';
  document.getElementById('editRxMedFields').style.display = 'grid';
});

document.getElementById('updateRxMedBtn').addEventListener('click', () => {
  const idx = document.getElementById('editRxMedSelect').value;
  if (idx === "") return;
  currentEditRxMeds[idx].name = document.getElementById('editRxMedName').value;
  currentEditRxMeds[idx].dosage = document.getElementById('editRxMedDosage').value;
  currentEditRxMeds[idx].freq = document.getElementById('editRxMedFreq').value;
  currentEditRxMeds[idx].route = document.getElementById('editRxMedRoute').value;
  currentEditRxMeds[idx].timeline = document.getElementById('editRxMedTimeline').value || '-';
  currentEditRxMeds[idx].pills = document.getElementById('editRxMedPills').value || 0;
  currentEditRxMeds[idx].time = document.getElementById('editRxMedTime').value || '';
  alert("Medicine updated temporarily. Remember to click 'Save All Prescription Changes'.");
  populateEditRxMedSelect();
  document.getElementById('editRxMedSelect').value = idx;
});

document.getElementById('saveEditRxBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveEditRxBtn');
  const rxId = document.getElementById('editRxId').value;
  const rx = prescriptions.find(r => r.id === rxId);
  const metaString = JSON.stringify({
    age: document.getElementById('editRxAge').value || '-',
    gender: document.getElementById('editRxGender').value || '-',
    symptoms: document.getElementById('editRxSymptoms').value || '-',
    height: document.getElementById('editRxHeight').value || '-',
    weight: document.getElementById('editRxWeight').value || '-',
    temp: document.getElementById('editRxTemp').value || '-'
  });
  const date = document.getElementById('editRxDate').value || undefined;

  await toggleBtnLoading(btn, true);
  try {
    // Update each existing prescription + schedule in place.
    // This preserves prescription_id, schedule_id, and adherence_logs history.
    const original = rx.medications || [];
    for (let i = 0; i < currentEditRxMeds.length; i++) {
      const med = currentEditRxMeds[i];
      const ref = original[i]; // Same index — edit modal never reorders, only mutates in place
      if (!ref || !ref.serverRxId) {
        console.warn("No server id for edited row; skipping:", med);
        continue;
      }

      // If name or route changed, swap the medication_id; otherwise leave it.
      let newMedicationId = null;
      if ((med.name || '').toLowerCase() !== (ref.name || '').toLowerCase() || med.route !== ref.route) {
        newMedicationId = await getOrCreateMedication(med.name, med.route);
      }

      const putBody = {
        dosage: med.dosage,
        frequency: med.freq,
        instructions: metaString,
        total_pills: parseInt(med.pills || 0, 10) || 0,
      };
      if (date) putBody.start_date = date;
      if (newMedicationId) putBody.medication_id = newMedicationId;

      const rxResp = await fetch(`${API_BASE}/prescriptions/${ref.serverRxId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      });
      const rxJson = await rxResp.json();
      if (!rxJson.success) throw new Error(`Prescription ${ref.serverRxId}: ${rxJson.error || 'update failed'}`);

      if (ref.serverSchId) {
        let t = med.time;
        if (t && t.length === 5) t = t + ":00";
        await fetch(`${API_BASE}/schedules/${ref.serverSchId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ time_of_day: t || undefined, dosage_amount: med.dosage || undefined }),
        });
      }
    }

    await loadServerData();
    showToast("Prescription updated successfully.");
  } catch (err) {
    console.error("saveEditRx failed:", err);
    showToast("Failed to update prescription: " + err.message, "error");
  } finally {
    document.getElementById('editRxModal').classList.remove('active');
    await toggleBtnLoading(btn, false);
  }
});

document.getElementById('cancelEditRxBtn').addEventListener('click', () => {
  document.getElementById('editRxModal').classList.remove('active');
});

function openAddRxModal() {
  rxForm.reset();
  medicationsContainer.innerHTML = "";
  addNewMedRow();
  addRxModal.classList.add("active");
}

closeAddRxBtn.addEventListener("click", () => addRxModal.classList.remove("active"));
manualBtn.addEventListener("click", openAddRxModal);
uploadBtn.addEventListener("click", () => fileInput.click());
scanBtn.addEventListener("click", () => fileInput.click());

voiceBtn.addEventListener("click", () => {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    return alert("Voice recognition is not supported in this browser. Try Chrome or Edge.");
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  // Prefer Indian English; fall back to the browser default locale if unsupported.
  recognition.lang = (navigator.language && navigator.language.startsWith("en")) ? navigator.language : "en-IN";
  recognition.onstart = function () {
    showToast("Mic Active: Speak your prescription details...");
  };
  recognition.onresult = async function (event) {
    const transcript = event.results[0][0].transcript;
    openAddRxModal();
    const sympInput = document.getElementById("rxSymptoms");
    document.getElementById("rxDate").valueAsDate = new Date();
    sympInput.value = "Voice Transcription: " + transcript;

    // Use the extraction engine to parse the spoken text
    await processExtractedText(transcript, sympInput);
  };
  recognition.onerror = function (event) {
    const code = event.error;
    let msg;
    switch (code) {
      case "not-allowed":
      case "service-not-allowed":
        msg = "Microphone access blocked. Enable it in your browser's site settings and try again.";
        break;
      case "no-speech":
        msg = "No speech detected. Please try again and speak clearly.";
        break;
      case "audio-capture":
        msg = "No microphone found. Please connect one and retry.";
        break;
      case "network":
        msg = "Voice service needs an internet connection.";
        break;
      default:
        msg = "Voice error: " + code;
    }
    showToast(msg, "error");
  };
  try {
    recognition.start();
  } catch (err) {
    console.error("Voice start failed:", err);
    showToast("Could not start voice recognition. Please try again.", "error");
  }
});

async function processExtractedText(text, sympInput) {
  sympInput.value = "Analyzing extracted text via Clinical Extraction engine...";
  try {
    const response = await fetch(`${API_BASE}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const result = await response.json();
    if (result.success && result.data) {
      const data = result.data;
      if (data.patientName) {
        const pnameEl = document.getElementById('rxPatientName');
        if (pnameEl) pnameEl.value = data.patientName;
      }
      if (data.diagnosis) sympInput.value = data.diagnosis;
      else sympInput.value = "OCR and Analysis Complete.";
      if (data.medications && data.medications.length > 0) {
        medicationsContainer.innerHTML = "";
        data.medications.forEach(med => {
          const clone = medRowTemplate.content.cloneNode(true);
          const nameInput = clone.querySelector('.med-name');
          const doseInput = clone.querySelector('.med-dosage');
          const freqInput = clone.querySelector('.med-freq');
          const routeInput = clone.querySelector('.med-route');
          const durInput = clone.querySelector('.med-timeline');
          if (nameInput) nameInput.value = med.name;
          let combinedDose = [];
          if (med.quantity && med.quantity !== "1") combinedDose.push(med.quantity);
          if (med.strength) combinedDose.push(med.strength);
          if (doseInput && combinedDose.length > 0) doseInput.value = combinedDose.join(" ");
          if (freqInput && med.frequency) {
            const lowFreq = med.frequency.toLowerCase();
            if (lowFreq.includes("bid") || lowFreq.includes("twice")) freqInput.value = "2 times a day";
            else if (lowFreq.includes("tid") || lowFreq.includes("thrice")) freqInput.value = "3 times a day";
            else if (lowFreq.includes("qid") || lowFreq.includes("four")) freqInput.value = "4 times a day";
            else if (lowFreq.includes("prn") || lowFreq.includes("needed")) freqInput.value = "As needed";
            else freqInput.value = "Daily";
          }
          if (routeInput && med.route) {
            routeInput.value = med.route;
          }
          if (durInput && med.duration) {
            const daysMatch = med.duration.match(/\d+/);
            if (daysMatch) durInput.value = daysMatch[0];
          }
          const removeBtn = clone.querySelector('.remove-med-row');
          removeBtn.addEventListener('click', function () {
            this.parentElement.remove();
          });
          medicationsContainer.appendChild(clone);
        });
      } else {
        if (medicationsContainer.children.length === 0) addNewMedRow();
      }
    }
  } catch (err) {
    console.error(err);
    sympInput.value = "Failed to process OCR text through Extraction Engine.";
    if (medicationsContainer.children.length === 0) addNewMedRow();
  }
}

fileInput.addEventListener("change", async (e) => {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    if (file.type.startsWith('image/')) {
      openAddRxModal();
      document.getElementById("rxDate").valueAsDate = new Date();
      const sympInput = document.getElementById("rxSymptoms");
      sympInput.value = "Scanning image for text...";
      try {
        const base64Image = await fileToBase64(file);
        const response = await fetch(`${API_BASE}/ocr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image })
        });
        const result = await response.json();
        if (result.success) {
          await processExtractedText(result.text, sympInput);
        } else {
          const detail = result.details ? ` (${result.details})` : "";
          sympInput.value = "OCR failed: " + (result.error || "Unknown error") + detail;
          console.error("OCR server error:", result);
        }
      } catch (err) {
        console.error("OCR failed", err);
        sympInput.value = "OCR Failed: " + (err.message || "network or payload error");
      }
    } else if (file.type === "application/pdf") {
      openAddRxModal();
      document.getElementById("rxDate").valueAsDate = new Date();
      const sympInput = document.getElementById("rxSymptoms");
      sympInput.value = "Scanning PDF with Google Vision API...";
      try {
        const base64Data = await fileToBase64(file);
        const response = await fetch(`${API_BASE}/ocr-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64Data })
        });
        const result = await response.json();
        if (result.success) {
          await processExtractedText(result.text, sympInput);
        } else {
          const detail = result.details ? ` (${result.details})` : "";
          sympInput.value = "PDF OCR failed: " + (result.error || "Unknown error") + detail;
          console.error("PDF OCR server error:", result);
        }
      } catch (err) {
        console.error("PDF OCR failed", err);
        sympInput.value = "PDF OCR Failed: " + (err.message || "network or payload error");
      }
    } else {
      openAddRxModal();
      document.getElementById("rxDate").valueAsDate = new Date();
    }
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

function addNewMedRow() {
  const clone = medRowTemplate.content.cloneNode(true);
  const removeBtn = clone.querySelector('.remove-med-row');
  removeBtn.addEventListener('click', function () {
    this.parentElement.remove();
  });
  medicationsContainer.appendChild(clone);
}

addMedRowBtn.addEventListener("click", addNewMedRow);

rxForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = rxForm.querySelector('button[type="submit"]');
  const dName = document.getElementById("rxDoctorName").value.trim() || "-";
  const ageVal = document.getElementById("rxAge").value.trim() || "-";
  const genderVal = document.getElementById("rxGender").value || "-";
  const date = document.getElementById("rxDate").value || new Date().toISOString().split('T')[0];
  const symp = document.getElementById("rxSymptoms").value.trim() || "-";
  const h = document.getElementById("rxHeight").value || "-";
  const w = document.getElementById("rxWeight").value || "-";
  const t = document.getElementById("rxTemp").value || "-";
  const medRows = medicationsContainer.querySelectorAll('.med-row');
  const extractedMeds = [];
  medRows.forEach(row => {
    const name = row.querySelector('.med-name').value.trim();
    const dosage = row.querySelector('.med-dosage').value.trim();
    const freq = row.querySelector('.med-freq').value.trim();
    const route = row.querySelector('.med-route').value;
    const timeline = row.querySelector('.med-timeline').value;
    const pills = row.querySelector('.med-pills').value || 0;
    const time = row.querySelector('.med-time').value;
    if (name && dosage && freq && time) {
      extractedMeds.push({ name, dosage, freq, route, timeline, pills, time });
    }
  });
  if (extractedMeds.length === 0) {
    alert("Please add at least one medication with a valid time.");
    return;
  }
  await toggleBtnLoading(btn, true);
  const uData = JSON.parse(localStorage.getItem('safemeds_user'));
  const patientId = uData.id;
  const pName = uData.name;
  let doctorId = null;
  if (dName && dName !== '-') {
    doctorId = await getOrCreateUser(dName, 'doctor');
  }
  const metaString = JSON.stringify({ age: ageVal, gender: genderVal, symptoms: symp, height: h, weight: w, temp: t });
  for (let med of extractedMeds) {
    const medId = await getOrCreateMedication(med.name, med.route);
    if (medId && patientId) {
      const rxId = await createPrescription(patientId, doctorId, medId, med.dosage, med.freq, metaString, date, med.pills);
      if (rxId) {
        await createSchedule(rxId, med.time, med.dosage);
      }
    }
  }
  addRxModal.classList.remove("active");
  await loadServerData();
  await toggleBtnLoading(btn, false);
  showToast("Prescription saved successfully!");
  switchView("rx");
});

window.openSideEffect = function (rxId, event) {
  event.stopPropagation();
  sideEffectRxId.value = rxId;
  sideEffectText.value = "";
  sideEffectModal.classList.add('active');
};

cancelSideEffectBtn.addEventListener('click', () => sideEffectModal.classList.remove('active'));

saveSideEffectBtn.addEventListener('click', async () => {
  const btn = saveSideEffectBtn;
  const rxId = sideEffectRxId.value;
  const text = sideEffectText.value.trim();
  if (!text) return alert("Please enter the symptoms.");
  await toggleBtnLoading(btn, true);
  const resp = await fetch(`${API_BASE}/prescriptions/${rxId}/side_effect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symptoms: text })
  });
  const data = await resp.json();
  if (data.success) {
    showToast("Side effect logged.");
    sideEffectModal.classList.remove('active');
  }
  await toggleBtnLoading(btn, false);
});

viewHistoryBtn.addEventListener('click', async () => {
  const userData = localStorage.getItem('safemeds_user');
  if (!userData) return alert("Please complete onboarding first.");
  const u = JSON.parse(userData);
  historyContainer.innerHTML = '<div style="text-align:center; padding:20px;">Fetching history...</div>';
  historyModal.classList.add('active');
  try {
    const res = await fetch(`${API_BASE}/history/${u.id}`);
    const data = await res.json();
    if (!data.success || Object.keys(data.data).length === 0) {
      historyContainer.innerHTML = '<div style="text-align:center; padding:40px; color:var(--muted);">No medication history found yet.</div>';
      return;
    }
    let html = "";
    for (let day in data.data) {
      html += `<h4 style="margin:20px 0 10px 0; color:var(--btn-blue); border-bottom: 2px solid var(--border); padding-bottom:4px;">${day}</h4>`;
      data.data[day].forEach(entry => {
        let statusColor = entry.status === 'taken' ? 'var(--btn-green)' : (entry.status === 'skipped' ? 'var(--btn-red)' : 'var(--muted)');
        html += `
                    <div style="background:var(--white); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong>${entry.time} - ${entry.medication}</strong>
                            <span style="color:white; background:${statusColor}; padding:2px 8px; border-radius:4px; font-size:0.75rem; text-transform:uppercase;">${entry.status}</span>
                        </div>
                        <div style="font-size:0.85rem; margin-top:4px; color:var(--text-main);">
                            <strong>Dosage:</strong> ${entry.dosage || '-'} | <strong>Route:</strong> ${entry.route || '-'}
                        </div>
                        <div style="font-size:0.85rem; margin-top:6px; color:var(--muted);">
                            ${entry.reason !== '-' ? `<div><strong>Reason:</strong> ${entry.reason}</div>` : ''}
                            ${entry.notes !== '-' ? `<div style="color:var(--btn-blue); margin-top:4px;"><strong>Notes/Side Effects:</strong> ${entry.notes}</div>` : ''}
                        </div>
                    </div>
                `;
      });
    }
    historyContainer.innerHTML = html;
  } catch (err) {
    console.error("History Render Error:", err);
    historyContainer.innerHTML = '<div style="color:red; text-align:center; padding:20px;">Failed to load history from server.</div>';
  }
});

const profileBadge = document.getElementById("profileBadge");
const profileModal = document.getElementById("profileModal");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");

if (profileBadge) {
  profileBadge.addEventListener("click", () => {
    const uData = localStorage.getItem('safemeds_user');
    if (uData) {
      const u = JSON.parse(uData);
      document.getElementById("profileNameDisplay").textContent = u.name || "-";
      document.getElementById("profilePhoneDisplay").textContent = u.phone || "-";
      profileModal.classList.add("active");
    }
  });
}

if (closeProfileBtn) {
  closeProfileBtn.addEventListener("click", () => profileModal.classList.remove("active"));
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to logout? This will clear your current profile data from this device.")) {
      localStorage.removeItem('safemeds_user');
      window.location.reload();
    }
  });
}

if (updatePhoneBtn) {
  updatePhoneBtn.addEventListener("click", async () => {
    const newPhone = normalizePhoneIN(updatePhoneInput.value.trim());
    if (newPhone.length !== 10) return alert("Please enter a valid 10-digit phone number.");
    const uData = JSON.parse(localStorage.getItem('safemeds_user'));
    await toggleBtnLoading(updatePhoneBtn, true);
    try {
      const resp = await fetch(`${API_BASE}/users/${uData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: newPhone })
      });
      const data = await resp.json();
      if (data.success) {
        uData.phone = newPhone;
        localStorage.setItem('safemeds_user', JSON.stringify(uData));
        document.getElementById("profilePhoneDisplay").textContent = newPhone;
        updatePhoneInput.value = "";
        showToast("Phone number updated!");
      }
    } catch (err) {
      console.error("Update Phone Error:", err);
    }
    await toggleBtnLoading(updatePhoneBtn, false);
  });
}

if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener("click", async () => {
    const confirmDelete = confirm("Are you absolutely sure you want to permanently delete your account and all associated schedule data? This action cannot be undone.");
    if (!confirmDelete) return;
    const uData = JSON.parse(localStorage.getItem('safemeds_user'));
    await toggleBtnLoading(deleteAccountBtn, true);
    try {
      await fetch(`${API_BASE}/users/${uData.id}`, { method: 'DELETE' });
      localStorage.removeItem('safemeds_user');
      window.location.reload();
    } catch (err) {
      console.error("Delete Error:", err);
      alert("Failed to delete account. Please try again.");
      await toggleBtnLoading(deleteAccountBtn, false);
    }
  });
}

closeHistoryBtn.addEventListener('click', () => historyModal.classList.remove('active'));

resetHistoryBtn.addEventListener('click', async () => {
  if (!confirm("Are you sure you want to permanently delete your entire medication history? This cannot be undone.")) return;
  const uData = JSON.parse(localStorage.getItem('safemeds_user'));
  if (uData) {
    await toggleBtnLoading(resetHistoryBtn, true);
    await fetch(`${API_BASE}/history/${uData.id}`, { method: 'DELETE' });
    historyContainer.innerHTML = '<div style="text-align:center; padding:40px; color:var(--muted);">History cleared.</div>';
    await toggleBtnLoading(resetHistoryBtn, false);
    showToast("History wiped.");
  }
});

printHistoryBtn.addEventListener('click', () => {
  window.print();
});