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

let recognition = null;
let isListening = false;

let prescriptions = [];
let todaysReminders = [];

const toast = document.getElementById("toast");

function showToast(message, type = "success") {
    toast.textContent = message;
    toast.className = `toast active ${type}`;
    setTimeout(() => { toast.classList.remove('active'); }, 3000);
}

async function toggleBtnLoading(btn, isLoading) {
    if(!btn) return;
    if(isLoading) {
        btn.classList.add('btn-loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

// --- API Communication Modules --- 
const API_BASE = "http://localhost:3000/api";

async function getOrCreateUser(fullName, role) {
    const email = `${fullName.replace(/\s+/g, '').toLowerCase() || 'unknown'}_${role}@system.com`;
    try {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, full_name: fullName, role })
        });
        const data = await response.json();
        if (data.success) return data.data.user_id;
        
        const res2 = await fetch(`${API_BASE}/users`);
        const data2 = await res2.json();
        const existing = data2.data.find(u => u.email === email);
        if (existing) return existing.user_id;
    } catch(e) { console.error(e); }
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
    } catch(e) { console.error(e); }
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
     } catch(e) { console.error(e); }
     return null;
}

async function createSchedule(rxId, time, dosageAmt) {
    try {
        let t = time;
        if(t && t.length === 5) t = t + ":00";
        if(!t) t = "08:00:00";
        
        const response = await fetch(`${API_BASE}/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prescription_id: rxId, time_of_day: t, dosage_amount: dosageAmt || "unknown"
            })
        });
        const data = await response.json();
        return data.data?.schedule_id;
    } catch(e) { console.error(e); }
    return null;
}

async function loadServerData() {
    try {
        const uData = localStorage.getItem('safemeds_user');
        if(!uData) return;
        const u = JSON.parse(uData);
        
        const rxResp = await fetch(`${API_BASE}/prescriptions?patientId=${u.id}`);
        const schResp = await fetch(`${API_BASE}/schedules?patientId=${u.id}`);
        if(!rxResp.ok || !schResp.ok) return;

        const rxData = await rxResp.json();
        const schData = await schResp.json();

        const groupedMap = new Map();
        
        rxData.data.forEach(p => {
             let safeDate = p.start_date ? p.start_date.split('T')[0] : 'Unknown';
             let groupKey = `${p.patient_name}_${p.doctor_name}_${safeDate}`;
             if(!groupedMap.has(groupKey)) {
                 let meta = { age: '-', gender: '-', symptoms: '-', height: '-', weight: '-', temp: '-' };
                 try {
                     if(p.instructions && p.instructions.includes('{')) {
                         meta = JSON.parse(p.instructions);
                     }
                 } catch(e){}

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

             let schedules = schData.data.filter(s => s.prescription_id === p.prescription_id);
             schedules.forEach(s => {
                 group.medications.push({
                     serverSchId: s.schedule_id,
                     serverRxId: p.prescription_id,
                     name: p.medication_name || "-",
                     dosage: p.dosage || "-",
                     freq: p.frequency || "-",
                     route: p.dosage_form || "-",
                     timeline: "-", 
                     pills: p.total_pills || 0,
                     time: s.time_of_day ? s.time_of_day.substring(0,5) : "08:00", 
                 });
             });
        });

        prescriptions = Array.from(groupedMap.values());
        generateTodaysReminders();
        
        if(btnShowToday.classList.contains('active')) renderTodays();
        else if(btnShowAll.classList.contains('active')) renderAllMeds();
        else renderPrescriptions();

    } catch(err) {
        console.error("Failed to load server data", err);
    }
}

// Request Notification Permission
if ("Notification" in window) {
  if (Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission();
  }
}

let triggeredToday = new Set(); // To keep track of alarms so they don't ring repeatedly the same minute

function generateTodaysReminders() {
    const allMeds = getAllMedications();
    
    // Convert current meds into reminder slots without losing status of existing ones
    allMeds.forEach((med, index) => {
        const remId = `${med.serverSchId}`; // Use server schedule ID for consistency
        const existing = todaysReminders.find(r => r.id === remId);
        
        let t24 = med.time || "08:00";
        let [h, m] = t24.split(":");
        let H = parseInt(h);
        let ampm = H >= 12 ? "PM" : "AM";
        let h12 = H % 12 || 12;
        let displayTime = `${h12.toString().padStart(2, '0')}:${m} ${ampm}`;

        // Calculate daily requirement for this specific drug
        const dailyReq = allMeds.filter(m => m.serverRxId === med.serverRxId).length;

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
                status: "pending",
                skipReason: ""
            });
        } else {
             // update if they were edited
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
        }
    });

    // Remove any reminders that are no longer in prescribed meds
    const prescribedIds = allMeds.map((med) => `${med.serverSchId}`);
    todaysReminders = todaysReminders.filter(rem => prescribedIds.includes(rem.id));
}

// OS Notification Scheduler every minute check
setInterval(() => {
    const now = new Date();
    let hours = now.getHours().toString().padStart(2, '0');
    let minutes = now.getMinutes().toString().padStart(2, '0');
    let current24h = `${hours}:${minutes}`;

    // Reset triggered set at midnight
    if (current24h === "00:00") {
        if(triggeredToday.size > 0) triggeredToday.clear();
        todaysReminders.forEach(r => { r.status = "pending"; r.skipReason = ""; });
        renderTodays();
    }

    todaysReminders.forEach(rem => {
       if (rem.status === 'pending' && rem.mappedTime24 === current24h && !triggeredToday.has(rem.id)) {
           triggeredToday.add(rem.id);
           window.triggerAlarm(rem.id);

           // SMS Logic
           const uData = JSON.parse(localStorage.getItem('safemeds_user'));
           if(uData && uData.smsEnabled && uData.phone && rem.serverSchId) {
               fetch(`${API_BASE}/reminders`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        schedule_id: rem.serverSchId,
                        patient_id: uData.id,
                        reminder_time: new Date().toISOString(),
                        reminder_type: "sms"
                    })
               }).catch(e => console.error("SMS skip", e));
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

// --- Initialization / Onboarding ---
window.addEventListener('DOMContentLoaded', async () => {
    const userData = localStorage.getItem('safemeds_user');
    if (!userData) {
        onboardModal.classList.add('active');
    } else {
        const u = JSON.parse(userData);
        document.getElementById('rxPatientName').value = u.name;
        
        // Populate profile badge
        const pb = document.getElementById('profileBadge');
        if (pb) {
             pb.style.display = 'flex';
        }
        
        // Also update existing name if it was a default placeholder in previous session
        await loadServerData();
    }
    renderTodays();
});

onboardBtn.addEventListener('click', async () => {
    const name = onboardName.value.trim();
    const phone = onboardPhone.value.trim();
    const sms = onboardSmsToggle.checked;

    if(!name || !phone) return alert("Please enter name and phone.");

    await toggleBtnLoading(onboardBtn, true);
    const userId = await getOrCreateUser(name, 'patient');
    if(userId) {
        localStorage.setItem('safemeds_user', JSON.stringify({
            id: userId,
            name: name,
            phone: phone,
            smsEnabled: sms
        }));
        onboardModal.classList.remove('active');
        document.getElementById('rxPatientName').value = name;
        await loadServerData();
        showToast("Profile created successfully!");
    }
    await toggleBtnLoading(onboardBtn, false);
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

const mapBtn = document.getElementById("mapBtn");
const mapModal = document.getElementById("mapModal");
const closeMapBtn = document.getElementById("closeMapBtn");
const currentLocBtn = document.getElementById("currentLocBtn");
const searchMapLocBtn = document.getElementById("searchMapLocBtn");
const mapLocationInput = document.getElementById("mapLocationInput");
const mapStoreList = document.getElementById("mapStoreList");
const autocompleteResults = document.getElementById("autocompleteResults");

let map = null;
let mapMarkers = [];
let debounceTimer;

mapBtn.addEventListener("click", () => {
  mapModal.classList.add("active");

  if (!map) {
    map = tt.map({
      key: ttKey,
      container: 'mapContainer',
      center: [78.0322, 30.3165],
      zoom: 13
    });
  }

  setTimeout(() => map.resize(), 100);
});

closeMapBtn.addEventListener("click", () => {
  mapModal.classList.remove("active");
});

mapLocationInput.addEventListener("input", (e) => {
  clearTimeout(debounceTimer);
  const query = e.target.value.trim();

  if (query.length < 3) {
    autocompleteResults.innerHTML = "";
    autocompleteResults.classList.add("hidden");
    return;
  }

  debounceTimer = setTimeout(() => {
    const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${ttKey}&countrySet=IN&limit=5`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        autocompleteResults.innerHTML = "";

        if (data.results && data.results.length > 0) {
          autocompleteResults.classList.remove("hidden");

          data.results.forEach(item => {
            const div = document.createElement("div");
            div.className = "autocomplete-item";

            const mainText = item.poi ? item.poi.name : (item.address.streetName || item.address.municipality || "Unknown Location");
            const exactAddress = item.address.freeformAddress || mainText;

            div.innerHTML = `<strong style="color: var(--text-main); font-size: 0.95rem;">${mainText}</strong><br><small style="color: var(--muted); font-size: 0.8rem;">${exactAddress}</small>`;

            div.onclick = () => {
              mapLocationInput.value = exactAddress;
              autocompleteResults.classList.add("hidden");
              fetchStoresAndMap(item.position.lat, item.position.lon);
            };

            autocompleteResults.appendChild(div);
          });
        } else {
          autocompleteResults.classList.add("hidden");
        }
      })
      .catch(err => console.error("Autocomplete Error: ", err));
  }, 400);
});

document.addEventListener("click", (e) => {
  if (!mapLocationInput.contains(e.target) && !autocompleteResults.contains(e.target)) {
    autocompleteResults.classList.add("hidden");
  }
});

currentLocBtn.addEventListener("click", () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        mapLocationInput.value = "Current Location";
        fetchStoresAndMap(lat, lng);
      },
      (error) => alert("Unable to retrieve location.")
    );
  }
});

searchMapLocBtn.addEventListener("click", () => {
  const query = mapLocationInput.value.trim();
  if (!query) return;

  const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${ttKey}&countrySet=IN&limit=1`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.results && data.results.length > 0) {
        fetchStoresAndMap(data.results[0].position.lat, data.results[0].position.lon);
      } else {
        alert("Location not found.");
      }
    });
});

function fetchStoresAndMap(lat, lng) {
  map.flyTo({ center: [lng, lat], zoom: 14 });

  mapMarkers.forEach(m => m.remove());
  mapMarkers = [];

  const userMarkerElement = document.createElement('div');
  userMarkerElement.style.backgroundColor = '#ea4335';
  userMarkerElement.style.width = '16px';
  userMarkerElement.style.height = '16px';
  userMarkerElement.style.borderRadius = '50%';
  userMarkerElement.style.border = '2px solid white';
  userMarkerElement.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';

  const userMarker = new tt.Marker({ element: userMarkerElement })
    .setLngLat([lng, lat])
    .addTo(map);

  mapMarkers.push(userMarker);

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
      return;
    }

    let storeHtml = '<h4 style="margin-top:0; border-bottom: 2px solid var(--border); padding-bottom: 12px; position:sticky; top:0; background:white; z-index:10;">Nearest 10 Pharmacies</h4>';

    response.results.forEach(place => {
      const pLat = place.position.lat;
      const pLng = place.position.lng;
      const name = place.poi ? place.poi.name : 'Pharmacy';
      const address = place.address ? place.address.freeformAddress : '';
      const distKm = place.dist ? (place.dist / 1000).toFixed(1) : '-';

      const marker = new tt.Marker()
        .setLngLat([pLng, pLat])
        .addTo(map);

      const popup = new tt.Popup({ offset: 30 }).setHTML(`<b>${name}</b><br>${address}`);
      marker.setPopup(popup);
      mapMarkers.push(marker);

      storeHtml += `
        <div style="padding: 12px 0; border-bottom: 1px dashed #ddd; cursor:pointer;" onclick="map.flyTo({center: [${pLng}, ${pLat}], zoom: 16});">
          <strong style="color: var(--text-main); font-size: 1.05rem;">${name}</strong><br>
          <small style="color: var(--btn-blue); font-weight: 600;">📍 ~${distKm} km away</small><br>
          <small style="color: var(--muted);">${address}</small>
        </div>
      `;
    });

    mapStoreList.innerHTML = storeHtml;
  }).catch(err => {
    mapStoreList.innerHTML = '<p style="color:var(--btn-red); text-align:center; margin-top:50px;">Error loading pharmacies.</p>';
  });
}

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

  // Push notification
  if ("Notification" in window && Notification.permission === "granted") {
     new Notification(`Medication Reminder: ${rem.name}`, {
         body: `It's time to take ${rem.dosage} via ${rem.route} scheduled at ${rem.time}.`,
         icon: 'https://cdn-icons-png.flaticon.com/512/2966/2966327.png'
     });
  }
};

ringingDoneBtn.addEventListener("click", async () => {
  const btn = ringingDoneBtn;
  const id = ringingMedId.value;
  const reminder = todaysReminders.find(r => r.id === id);
  if (reminder) {
      reminder.status = "taken";
      if(reminder.serverRxId) {
          await toggleBtnLoading(btn, true);
          await fetch(`${API_BASE}/prescriptions/${reminder.serverRxId}/take`, { method: "PUT" });
          await loadServerData(); // Repull to get updated counts
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

cancelSkipBtn.addEventListener("click", () => {
  skipModal.classList.remove("active");
});

confirmSkipBtn.addEventListener("click", async () => {
  const id = skipMedId.value;
  const reason = skipReasonInput.value.trim();

  if (!reason) return alert("Please provide a reason for skipping.");

  const btn = confirmSkipBtn;
  const reminder = todaysReminders.find(r => r.id === id);
  if (reminder) {
    if(reminder.serverRxId) {
        await toggleBtnLoading(btn, true);
        await fetch(`${API_BASE}/prescriptions/${reminder.serverRxId}/skip`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason })
        });
        await loadServerData();
        await toggleBtnLoading(btn, false);
    } else {
        reminder.status = "skipped";
        reminder.skipReason = reason;
        renderTodays();
    }
    
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
    todaysList.innerHTML = "<p style='color:var(--muted);'>No valid reminders found in your prescriptions.</p>";
    return;
  }

  todaysList.innerHTML = filteredReminders.map(rem => {
    let statusIcon = "";
    let actions = "";

    if (rem.status === "taken") {
      statusIcon = `<span class="check-icon green-check">✔️</span>`;
    } else if (rem.status === "skipped") {
      statusIcon = `
        <div style="text-align:right;">
          <span class="check-icon red-cross" style="margin-left:auto;">✖</span>
          <div style="font-size:0.75rem; color:var(--btn-red); margin-top:4px;">Reason: ${rem.skipReason}</div>
        </div>
      `;
    } else {
      statusIcon = `<span class="check-icon">ℹ️</span>`;
      actions = `
        <div style="margin-top:12px; border-top: 1px dashed var(--border); padding-top: 12px; text-align: right;">
          <button class="btn-action" style="padding: 8px 16px; font-size: 0.85rem; flex-direction:row; display:inline-flex; background:var(--btn-blue);" onclick="triggerAlarm('${rem.id}')">🔔 Simulate Reminder</button>
        </div>
      `;
    }

    return `
      <div class="med-item sch-item">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span class="sch-icon teal-icon">${rem.icon}</span> 
          <div style="flex-grow:1;">
            <strong>${rem.time} - ${rem.name}</strong><br>
            <small style="color:var(--btn-blue); font-size: 0.85rem;">Dosage: ${rem.dosage} | Route: ${rem.route}</small>
          </div>
          ${statusIcon}
        </div>
        ${actions}
      </div>
    `;
  }).join("");
}

function renderAllMeds() {
  const meds = getAllMedications();
  if (meds.length === 0) {
    medList.innerHTML = "<p style='color:var(--muted);'>No medicines saved.</p>";
    document.getElementById("refillAlertsContainer").innerHTML = "";
    return;
  }

  // Handle Auto-Refill Alerts
  const lowMeds = meds.filter(m => m.pills <= 5);
  const alertsContainer = document.getElementById("refillAlertsContainer");
  if (lowMeds.length > 0) {
     alertsContainer.innerHTML = lowMeds.map(m => `
       <div style="background: #ffebe5; border: 1px solid var(--btn-red); border-radius: 8px; padding: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
         <div>
            <strong style="color: var(--btn-red);">⚠ Refill Alert: ${m.name}</strong><br>
            <small style="color: var(--text-main);">Only ${m.pills} pills remaining.</small>
         </div>
         <button class="btn-action" style="padding: 8px 16px; background: var(--btn-green); color: white;" onclick="expressRefill('${m.serverRxId}', ${m.pills})">+30 Pills</button>
       </div>
     `).join("");
  } else {
     alertsContainer.innerHTML = "";
  }

  medList.innerHTML = meds.map((med, index) => `
    <div class="med-item">
      <span>${index + 1}.</span> 
      <div style="flex-grow:1;">
        ${med.name} - ${med.dosage}<br>
        <small style="color:var(--btn-blue); font-size: 0.85rem;">Time: ${med.time || '-'} | Freq: ${med.freq} | Route: ${med.route} | Timeline: ${med.timeline || '-'} days</small>
        <span style="font-size: 0.75rem; margin-left:8px; padding:3px 8px; border-radius:4px; font-weight:bold; color: white; background: ${med.pills <= 5 ? 'var(--btn-red)' : 'var(--btn-green)'};">💊 ${med.pills || 0} left ${med.pills <= 5 ? '(Refill Alert!)' : ''}</span>
      </div>
      <div style="display:flex; gap:8px;">
          <button class="btn-action" style="padding: 6px 12px; font-size:0.8rem; background:var(--btn-blue); color:white;" onclick="openSideEffect('${med.serverRxId}', event)">+ Add Notes</button>
          <button class="btn-action" style="padding: 6px 12px; font-size:0.8rem; background:var(--btn-edit);" onclick="openEditMed('${med.rxId}', '${med.name}', event)">Edit</button>
          <button class="btn-action" style="padding: 6px 12px; font-size:0.8rem; background:var(--btn-red);" onclick="deleteMed('${med.rxId}', '${med.name}', event)">Delete</button>
      </div>
    </div>
  `).join("");
}

window.expressRefill = async function(serverRxId, currentPills) {
    if(!serverRxId || serverRxId === 'undefined') return alert("Please sync this prescription to the server first.");
    const newCount = parseInt(currentPills || 0) + 30;
    try {
        await fetch(`${API_BASE}/prescriptions/${serverRxId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ total_pills: newCount })
        });
        showToast("Medicine practically refilled (+30 pills)!");
        await loadServerData();
    } catch(err) {
        alert("Failed to refill.");
    }
}

function renderPrescriptions() {
  if (prescriptions.length === 0) {
    rxList.innerHTML = "<p style='color:var(--muted);'>No prescriptions saved.</p>";
    return;
  }

  rxList.innerHTML = "";
  prescriptions.forEach((rx, index) => {
    const div = document.createElement("div");
    div.className = "med-item clickable";
    div.innerHTML = `
      <span>📄</span> 
      <div style="flex-grow: 1;">
        <strong>Prescription ${index + 1}</strong>: ${rx.patientName || 'Unknown Patient'}<br>
        <small style="color:var(--btn-blue); font-size: 0.85rem;">Dr. ${rx.doctorName || '-'} | Date: ${rx.date || '-'} | Meds: ${rx.medications.length}</small>
      </div>
      <div style="display:flex; gap:8px;">
          <button class="btn-action" style="padding: 6px 12px; font-size:0.8rem; background:var(--btn-edit);" onclick="openEditRx('${rx.id}', event)">Edit</button>
          <button class="btn-action" style="padding: 6px 12px; font-size:0.8rem; background:var(--btn-red);" onclick="deleteRx('${rx.id}', event)">Delete</button>
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

closeRxDetailsBtn.addEventListener("click", () => {
  rxDetailsModal.classList.remove("active");
});

window.deleteMed = async function (rxId, medName, event) {
  event.stopPropagation();
  if (confirm(`Are you sure you want to delete ${medName}?`)) {
    const rx = prescriptions.find(r => r.id === rxId);
    if (rx) {
        const m = rx.medications.find(x => x.name === medName);
        if(m && m.serverRxId) {
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

  const newName = document.getElementById('editMedName').value;
  const newDosage = document.getElementById('editMedDosage').value;
  const newFreq = document.getElementById('editMedFreq').value;
  const newRoute = document.getElementById('editMedRoute').value;
  const newTimeline = document.getElementById('editMedTimeline').value || '-';
  const newPills = document.getElementById('editMedPills').value || 0;
  const newTime = document.getElementById('editMedTime').value || '';

  await toggleBtnLoading(btn, true);
  if (med.serverRxId) {
      await fetch(`${API_BASE}/prescriptions/${med.serverRxId}`, { method: 'DELETE' });
  }

  const metaString = JSON.stringify({ age: rx.age, gender: rx.gender, symptoms: rx.symptoms, height: rx.height, weight: rx.weight, temp: rx.temp });
  const patientId = await getOrCreateUser(rx.patientName, 'patient');
  let doctorId = null;
  if(rx.doctorName && rx.doctorName !== '-') doctorId = await getOrCreateUser(rx.doctorName, 'doctor');
  
  const medId = await getOrCreateMedication(newName, newRoute);
  if(medId && patientId) {
      const newRxId = await createPrescription(patientId, doctorId, medId, newDosage, newFreq, metaString, rx.date, newPills);
      if(newRxId) {
           await createSchedule(newRxId, newTime, newDosage);
      }
  }

  document.getElementById('editMedModal').classList.remove('active');
  await loadServerData();
  await toggleBtnLoading(btn, false);
  showToast("Medicine updated successfully.");
});

document.getElementById('cancelEditMedBtn').addEventListener('click', () => {
  document.getElementById('editMedModal').classList.remove('active');
});

window.deleteRx = async function (rxId, event) {
  event.stopPropagation();
  if (confirm("Are you sure you want to delete this entire prescription?")) {
    const rx = prescriptions.find(r => r.id === rxId);
    if(rx) {
        if(rx.originalRxIds && rx.originalRxIds.length > 0) {
            for(let id of rx.originalRxIds) {
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

  const pName = document.getElementById('editRxPatient').value || '-';
  const dName = document.getElementById('editRxDoctor').value || '-';
  const metaString = JSON.stringify({ 
      age: document.getElementById('editRxAge').value || '-', 
      gender: document.getElementById('editRxGender').value || '-', 
      symptoms: document.getElementById('editRxSymptoms').value || '-', 
      height: document.getElementById('editRxHeight').value || '-', 
      weight: document.getElementById('editRxWeight').value || '-', 
      temp: document.getElementById('editRxTemp').value || '-' 
  });
  const date = document.getElementById('editRxDate').value || '-';

  await toggleBtnLoading(btn, true);
  if(rx.originalRxIds) {
      for(let id of rx.originalRxIds) {
          await fetch(`${API_BASE}/prescriptions/${id}`, { method: 'DELETE' });
      }
  }

  const patientId = await getOrCreateUser(pName, 'patient');
  let doctorId = null;
  if(dName !== '-') doctorId = await getOrCreateUser(dName, 'doctor');

  for(let med of currentEditRxMeds) {
      const medId = await getOrCreateMedication(med.name, med.route);
      if(medId && patientId) {
          const newRxId = await createPrescription(patientId, doctorId, medId, med.dosage, med.freq, metaString, date, med.pills);
          if(newRxId) {
               await createSchedule(newRxId, med.time, med.dosage);
          }
      }
  }

  document.getElementById('editRxModal').classList.remove('active');
  await loadServerData();
  await toggleBtnLoading(btn, false);
  showToast("Prescription updated successfully.");
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

closeAddRxBtn.addEventListener("click", () => {
  addRxModal.classList.remove("active");
});

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
    recognition.lang = 'en-US';

    recognition.onstart = function() {
        showToast("Mic Active: Speak your prescription details...");
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        openAddRxModal();
        document.getElementById("rxDate").valueAsDate = new Date();
        document.getElementById("rxSymptoms").value = "Voice Transcription: " + transcript;
        
        const firstMedName = medicationsContainer.querySelector('.med-name');
        if (firstMedName && transcript) {
             firstMedName.value = transcript; 
        }
    };

    recognition.onerror = function(event) {
        showToast("Voice error: " + event.error);
    };

    recognition.start();
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
                    const freqInput = clone.querySelector('.med-frequency');
                    const routeInput = clone.querySelector('.med-route');
                    const durInput = clone.querySelector('.med-duration');
                    
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
    } catch(err) {
        console.error(err);
        sympInput.value = "Failed to process OCR text through Extraction Engine.";
        if (medicationsContainer.children.length === 0) addNewMedRow();
    }
}

fileInput.addEventListener("change", async (e) => {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    
    // Check if it's an image
    if (file.type.startsWith('image/')) {
        openAddRxModal();
        document.getElementById("rxDate").valueAsDate = new Date();
        const sympInput = document.getElementById("rxSymptoms");
        sympInput.value = "Scanning image for text...";
        
        try {
            if (typeof Tesseract !== 'undefined') {
                const result = await Tesseract.recognize(file, 'eng');
                const text = result.data.text;
                await processExtractedText(text, sympInput);
            } else {
                sympInput.value = "Tesseract failed to load.";
            }
        } catch (err) {
            console.error("OCR failed", err);
            sympInput.value = "OCR Failed.";
        }
    } else if (file.type === "application/pdf") {
        openAddRxModal();
        document.getElementById("rxDate").valueAsDate = new Date();
        const sympInput = document.getElementById("rxSymptoms");
        sympInput.value = "Loading and rasterizing PDF document...";
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            const page = await pdf.getPage(1);
            
            const scale = 2.0;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: context, viewport }).promise;
            
            const imgDataUrl = canvas.toDataURL('image/png');
            sympInput.value = "Scanning rasterized PDF with OCR...";
            
            if (typeof Tesseract !== 'undefined') {
                 const result = await Tesseract.recognize(imgDataUrl, 'eng');
                 const text = result.data.text;
                 await processExtractedText(text, sympInput);
            } else {
                 sympInput.value = "Tesseract failed to load.";
            }
        } catch (err) {
            console.error("PDF Parsing failed", err);
            sympInput.value = "PDF OCR Failed.";
        }
    } else {
        openAddRxModal();
        document.getElementById("rxDate").valueAsDate = new Date();
    }
  }
});

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
// ... rest of the extraction logic ...
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
  // --- BEGIN API SYNC ---
  const uData = JSON.parse(localStorage.getItem('safemeds_user'));
  const patientId = uData.id;
  const pName = uData.name; // Use verified name for records
  
  let doctorId = null;
  if(dName && dName !== '-') {
      doctorId = await getOrCreateUser(dName, 'doctor');
  }

  const metaString = JSON.stringify({ age: ageVal, gender: genderVal, symptoms: symp, height: h, weight: w, temp: t });

  for(let med of extractedMeds) {
      const medId = await getOrCreateMedication(med.name, med.route);
      if(medId && patientId) {
          const rxId = await createPrescription(patientId, doctorId, medId, med.dosage, med.freq, metaString, date, med.pills);
          if(rxId) {
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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.onstart = () => { isListening = true; voiceBtn.style.opacity = "0.6"; };
  recognition.onresult = (e) => {
    openAddRxModal();
    const firstMedName = medicationsContainer.querySelector('.med-name');
    if (firstMedName) firstMedName.value = e.results[0][0].transcript;
  };
  recognition.onend = () => { isListening = false; voiceBtn.style.opacity = "1"; };
}

voiceBtn.addEventListener("click", () => {
  if (!recognition) return openAddRxModal();
  if (isListening) recognition.stop();
  else recognition.start();
});

// --- Side Effect Logic ---
window.openSideEffect = function(rxId, event) {
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
    if(!text) return alert("Please enter the symptoms.");

    await toggleBtnLoading(btn, true);
    const resp = await fetch(`${API_BASE}/prescriptions/${rxId}/side_effect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms: text })
    });
    const data = await resp.json();
    if(data.success) {
        showToast("Side effect logged.");
        sideEffectModal.classList.remove('active');
    }
    await toggleBtnLoading(btn, false);
});

// --- History Board Logic ---
viewHistoryBtn.addEventListener('click', async () => {
    const userData = localStorage.getItem('safemeds_user');
    if(!userData) return alert("Please complete onboarding first.");
    const u = JSON.parse(userData);

    historyContainer.innerHTML = '<div style="text-align:center; padding:20px;">Fetching history...</div>';
    historyModal.classList.add('active');

    try {
        const res = await fetch(`${API_BASE}/history/${u.id}`);
        const data = await res.json();
        
        if(!data.success || Object.keys(data.data).length === 0) {
            historyContainer.innerHTML = '<div style="text-align:center; padding:40px; color:var(--muted);">No medication history found yet.</div>';
            return;
        }

        let html = "";
        for(let day in data.data) {
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
    } catch(err) {
        console.error("History Render Error:", err);
        historyContainer.innerHTML = '<div style="color:red; text-align:center; padding:20px;">Failed to load history from server.</div>';
    }
});

// --- Profile / Account Deletion ---
const profileBadge = document.getElementById("profileBadge");
const profileModal = document.getElementById("profileModal");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");

if (profileBadge) {
    profileBadge.addEventListener("click", () => {
        const uData = localStorage.getItem('safemeds_user');
        if(uData) {
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
        } catch(err) {
            console.error("Delete Error:", err);
            alert("Failed to delete account. Please try again.");
            await toggleBtnLoading(deleteAccountBtn, false);
        }
    });
}

closeHistoryBtn.addEventListener('click', () => historyModal.classList.remove('active'));

resetHistoryBtn.addEventListener('click', async () => {
    if(!confirm("Are you sure you want to permanently delete your entire medication history? This cannot be undone.")) return;
    
    const uData = JSON.parse(localStorage.getItem('safemeds_user'));
    if(uData) {
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

// Native Notification Helper
window.triggerAlarm = function(id) {
  const reminder = todaysReminders.find(r => r.id === id);
  if (reminder && reminder.status === "pending") {
    ringingMedId.value = id;
    const details = document.getElementById("ringingDetails");
    details.innerHTML = `
      <h2 style="margin:0; color:var(--btn-blue);">${reminder.name}</h2>
      <p style="margin:8px 0; font-size:1.1rem;">${reminder.dosage}</p>
      <div style="display:inline-block; padding:4px 12px; background:rgba(0,0,0,0.05); border-radius:20px; font-size:0.85rem;">
        Route: ${reminder.route}
      </div>
    `;
    ringingModal.classList.add('active');

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Medication Reminder", {
        body: `Time to take ${reminder.dosage} of ${reminder.name}.`,
        icon: "/SafeMedsLogo.png"
      });
    }
  }
};

// Final initialization handled via DOMContentLoaded above.