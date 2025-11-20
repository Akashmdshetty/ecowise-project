/* script.js — improved for EcoWise
   Features:
   - token-aware requests
   - unified fetch with timeout
   - improved UI handling (loading states, modals)
   - file validation & preview
   - demo mode (uses local project path)
*/

// Configuration
const API_BASE = 'http://localhost:5000';
const API_TIMEOUT = 12_000; // 12s
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PROJECT_ZIP_URL = '/mnt/data/ecowise-project[1].zip'; // dev: local project zip path

// State
let authToken = localStorage.getItem('ecowise_token') || null;
let currentUser = 'EcoStudent'; // fallback until /me resolves
let inDemoMode = false;
let demoTimer = null;

// --- Utilities ---
function log(...args) { console.log('ecowise:', ...args); }

function getAuthHeaders(headers = {}) {
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return headers;
}

async function fetchWithTimeout(url, opts = {}, timeout = API_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  opts.signal = controller.signal;
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch(e) { json = text; }
    return { ok: res.ok, status: res.status, json, rawText: text };
  } finally {
    clearTimeout(id);
  }
}

function showInlineMessage(containerId, message, isError = true) {
  const container = document.getElementById(containerId);
  if (!container) {
    alert(message);
    return;
  }
  container.innerHTML = `<div class="${isError ? 'msg-error' : 'msg-success'}" role="status" aria-live="polite">${message}</div>`;
  if (!isError) {
    setTimeout(() => { container.innerHTML = ''; }, 3000);
  }
}

function createModal(html, options = {}) {
  // single modal at a time
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'ecowiseModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" style="background:#fff;color:#111;border-radius:10px;max-width:720px;width:95%;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 10px 40px rgba(2,6,23,0.2)">
      ${html}
    </div>
  `;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal() {
  const existing = document.getElementById('ecowiseModal');
  if (existing) existing.remove();
}

function copyToClipboard(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const tmp = document.createElement('textarea');
  tmp.value = text; document.body.appendChild(tmp); tmp.select();
  try { document.execCommand('copy'); } finally { tmp.remove(); }
}

function openTel(phone) {
  // safe open
  window.location.href = `tel:${phone}`;
}

function openUrl(url) {
  window.open(url, '_blank', 'noopener');
}

// --- Authentication helpers ---
async function getCurrentUserFromServer() {
  if (!authToken) return null;
  try {
    const { ok, json } = await fetchWithTimeout(`${API_BASE}/me`, {
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    });
    if (ok && json && json.user) {
      return json.user.username;
    }
  } catch (err) {
    log('me fetch error', err);
  }
  return null;
}

function requireAuth() {
  if (!authToken) {
    // fallback UX: show login redirect suggestion
    showInlineMessage('resultsContent', 'You need to be logged in to perform this action. <a href="login.html">Login</a>', true);
    throw new Error('auth-required');
  }
}

// --- Image handling & UI ---
const imageUploadEl = document.getElementById('imageUpload');
const imagePreviewEl = document.getElementById('imagePreview');
const resultsSectionEl = document.getElementById('results');
const resultsContentEl = document.getElementById('resultsContent');

function validateImageFile(file) {
  if (!file) return 'No file selected';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Unsupported file type — use JPG/PNG/GIF/WebP';
  if (file.size > MAX_IMAGE_SIZE) return 'Image too large — keep under 5 MB';
  return null;
}

function showImagePreview(file) {
  if (!file) { imagePreviewEl.innerHTML = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreviewEl.innerHTML = `
      <div class="image-preview-container" style="display:flex;gap:12px;align-items:center">
        <img src="${e.target.result}" alt="preview" style="max-width:120px;border-radius:8px;box-shadow:0 6px 18px rgba(2,6,23,0.08)"/>
        <div>
          <div style="font-weight:600">${file.name}</div>
          <div style="color:#6b7280;font-size:0.9rem">${(file.size/1024).toFixed(1)} KB • ${file.type}</div>
        </div>
      </div>
    `;
  };
  reader.readAsDataURL(file);
}

// ensure single listener
if (imageUploadEl) {
  imageUploadEl.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    const err = validateImageFile(f);
    if (err) {
      showInlineMessage('resultsContent', err, true);
      imagePreviewEl.innerHTML = '';
      return;
    }
    showImagePreview(f);
    resultsSectionEl.style.display = 'none'; // hide previous results
  });
}

// --- Analysis & results ---
async function analyzeImage() {
  try {
    requireAuth();
  } catch (e) { return; }

  const file = imageUploadEl.files && imageUploadEl.files[0];
  const validationError = validateImageFile(file);
  if (validationError) {
    showInlineMessage('resultsContent', validationError, true);
    return;
  }

  // UI loading
  resultsSectionEl.style.display = 'block';
  resultsContentEl.innerHTML = `<div style="padding:18px">🔄 AI analyzing <strong>${file.name}</strong> — please wait...</div>`;

  // Disable analyze button (if present)
  const analyzeBtn = document.getElementById('analyzeButton');
  if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.dataset.orig = analyzeBtn.innerHTML; analyzeBtn.innerHTML = 'Analyzing...'; }

  try {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('username', currentUser);

    const { ok, status, json } = await fetchWithTimeout(`${API_BASE}/detect`, {
      method: 'POST',
      headers: getAuthHeaders(), // don't set content-type for FormData
      body: fd
    }, API_TIMEOUT);

    if (!ok) {
      const serverMsg = json && (json.error || json.message) ? json.error || json.message : `Server error (${status})`;
      resultsContentEl.innerHTML = `<div style="padding:18px;color:#b91c1c">❌ ${serverMsg}</div>`;
      return;
    }

    // display results
    displayResults(json);
    // refresh profile after successful analyze
    await loadUserProfile();

  } catch (err) {
    log('analyzeImage error', err);
    resultsContentEl.innerHTML = `<div style="padding:18px;color:#b91c1c">❌ Analysis failed — ensure server is running on port 5000</div>`;
  } finally {
    if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.innerHTML = analyzeBtn.dataset.orig || 'Analyze'; }
  }
}

function displayResults(result) {
  // sanitize minimal output using textContent where possible (we assume server returns simple strings)
  if (!result) {
    resultsContentEl.innerHTML = '<div style="padding:18px">No result</div>';
    return;
  }

  // Build results HTML
  const itemsHtml = (result.detected_objects || []).map(obj => {
    const conf = Math.round((obj.confidence || 0) * 100);
    const name = String(obj.name || 'item');
    const type = String(obj.type || '');
    return `<li style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee">
              <span>${name}</span>
              <span style="color:#6b7280">${type} • ${conf}%</span>
            </li>`;
  }).join('');

  const recsHtml = (result.recommendations || []).map(r => `<li style="padding:6px 0">${r}</li>`).join('');

  resultsContentEl.innerHTML = `
    <div style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">✅ Analysis Complete</h3>
        <div style="color:#10b981;font-weight:700">+${result.eco_points || 0} pts</div>
      </div>

      <div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
        <div style="background:#f8fafc;padding:10px;border-radius:8px">
          <div style="font-size:0.9rem;color:#6b7280">Objects</div>
          <div style="font-size:1.2rem;font-weight:700">${result.objects_detected || (result.detected_objects||[]).length}</div>
        </div>
        <div style="background:#f8fafc;padding:10px;border-radius:8px">
          <div style="font-size:0.9rem;color:#6b7280">EcoPoints</div>
          <div style="font-size:1.2rem;font-weight:700">+${result.eco_points || 0}</div>
        </div>
        <div style="background:#f8fafc;padding:10px;border-radius:8px">
          <div style="font-size:0.9rem;color:#6b7280">Carbon Saved</div>
          <div style="font-size:1.2rem;font-weight:700">${result.carbon_saved_kg || 0}kg</div>
        </div>
      </div>

      <section style="margin-top:14px">
        <h4 style="margin:0 0 8px 0">📄 Detected Items</h4>
        <ul style="list-style:none;padding:0;margin:0;border-top:1px solid #eee">${itemsHtml || '<li style="padding:8px 0;color:#6b7280">Nothing recognized</li>'}</ul>
      </section>

      <section style="margin-top:12px">
        <h4 style="margin:0 0 8px 0">💡 Recommendations</h4>
        <ul style="margin:0;padding-left:16px">${recsHtml || '<li style="color:#6b7280">No recommendations</li>'}</ul>
      </section>

      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="showRecyclingCenters()" style="padding:8px 12px;border-radius:8px;border:none;background:#10b981;color:#fff;cursor:pointer">📍 Find Nearby Centers</button>
        <button onclick="showUserHistory()" style="padding:8px 12px;border-radius:8px;border:1px solid #e6e9ef;background:#fff;cursor:pointer">📊 View History</button>
        <button onclick="shareResults()" style="padding:8px 12px;border-radius:8px;border:1px solid #e6e9ef;background:#fff;cursor:pointer">📤 Share</button>
      </div>

      <div id="locations" style="display:none;margin-top:12px;"></div>
      <div id="history" style="display:none;margin-top:12px;"></div>
    </div>
  `;
}

// --- Recycling centers, directions, modals ---
async function showRecyclingCenters() {
  try {
    const { ok, json } = await fetchWithTimeout(`${API_BASE}/recycling-centers`, {
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });
    if (!ok) {
      showInlineMessage('resultsContent', 'Unable to load centers', true);
      return;
    }
    const centers = Array.isArray(json) ? json : (json.centers || []);
    const listHtml = centers.map(center => {
      const icon = center.type === 'recycling' ? '♻️' : '🤝';
      return `
        <div style="border:1px solid #eef2ff;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1">
            <div style="font-weight:700">${center.name}</div>
            <div style="color:#6b7280;font-size:0.9rem">${center.address}</div>
            <div style="margin-top:8px;font-size:0.85rem"><strong>Accepts:</strong> ${center.services.join(', ')}</div>
          </div>
          <div style="margin-left:12px;text-align:right">
            <div style="font-weight:700;color:#10b981">${center.distance || '--'}</div>
            <div style="margin-top:8px">
              <button onclick="event.stopPropagation(); showCenterDetails(${center.id})" style="margin-bottom:6px;padding:6px 8px;border-radius:6px;border:none;background:#3b82f6;color:#fff;cursor:pointer">Details</button><br/>
              <button onclick="event.stopPropagation(); getDirections(${center.id})" style="padding:6px 8px;border-radius:6px;border:1px solid #e6e9ef;background:white;cursor:pointer">Directions</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const container = document.getElementById('locations');
    container.innerHTML = `<div>${listHtml || '<div style="color:#6b7280">No centers found</div>'}</div>`;
    container.style.display = 'block';
    document.getElementById('history').style.display = 'none';
  } catch (err) {
    log('showRecyclingCenters error', err);
    showInlineMessage('resultsContent', 'Could not load recycling centers', true);
  }
}

async function showCenterDetails(centerId) {
  try {
    const { ok, json } = await fetchWithTimeout(`${API_BASE}/recycling-centers`, {
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });
    if (!ok) throw new Error('no centers');

    const centers = Array.isArray(json) ? json : (json.centers || []);
    const center = centers.find(c => c.id === centerId);
    if (!center) {
      showInlineMessage('resultsContent', 'Center not found', true);
      return;
    }

    const html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">${center.name}</h3>
        <button onclick="closeModal()" style="background:transparent;border:none;font-size:20px;cursor:pointer">×</button>
      </div>
      <div style="color:#6b7280;margin-bottom:10px">${center.address}</div>
      <div style="margin-bottom:8px"><strong>Hours:</strong> ${center.hours}</div>
      <div style="margin-bottom:8px"><strong>Phone:</strong> ${center.phone}</div>
      <div style="margin-bottom:8px"><strong>Accepts:</strong> ${center.services.join(', ')}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button onclick="getDirections(${center.id})" style="padding:8px 10px;border-radius:8px;background:#10b981;color:#fff;border:none;cursor:pointer">Get Directions</button>
        <button onclick="callCenter('${center.phone}')" style="padding:8px 10px;border-radius:8px;border:1px solid #e6e9ef;background:#fff;cursor:pointer">Call</button>
        ${center.website ? `<button onclick="openUrl('${center.website}')" style="padding:8px 10px;border-radius:8px;border:1px solid #e6e9ef;background:#fff;cursor:pointer">Visit Site</button>` : ''}
      </div>
    `;
    createModal(html);
  } catch (err) {
    log('showCenterDetails err', err);
    showInlineMessage('resultsContent', 'Unable to show center details', true);
  }
}

async function getDirections(centerId) {
  try {
    const { ok, json } = await fetchWithTimeout(`${API_BASE}/get-directions/${centerId}`, {
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });
    if (!ok) {
      showInlineMessage('resultsContent', 'Directions not available', true);
      return;
    }

    const d = json;
    const transportHtml = (d.transport || []).map(t => `<div style="margin-bottom:6px">${getTransportIcon(t)} ${t}</div>`).join('');
    const landmarksHtml = (d.landmarks || []).map(l => `<div style="margin-bottom:6px">📍 ${l}</div>`).join('');

    const html = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Directions to ${d.name}</h3>
        <button onclick="closeModal()" style="background:transparent;border:none;font-size:20px;cursor:pointer">×</button>
      </div>
      <div style="margin-top:12px">
        <h4>Route</h4>
        <div style="color:#374151">${d.directions || 'No textual directions available'}</div>

        <h4 style="margin-top:12px">Transport</h4>
        <div>${transportHtml || '<div style="color:#6b7280">No transport info</div>'}</div>

        <h4 style="margin-top:12px">Nearby Landmarks</h4>
        <div>${landmarksHtml || '<div style="color:#6b7280">No landmarks listed</div>'}</div>

        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="callCenter('${d.phone || ''}')" style="padding:8px 10px;border-radius:8px;background:#3b82f6;color:#fff;border:none;cursor:pointer">Call</button>
          <button onclick="shareDirections('${d.name}', '${(d.directions||'').replace(/'/g, "\\'")}')" style="padding:8px 10px;border-radius:8px;border:1px solid #e6e9ef;background:#fff;cursor:pointer">Share</button>
        </div>
      </div>
    `;
    createModal(html);
  } catch (err) {
    log('getDirections err', err);
    showInlineMessage('resultsContent', 'Could not fetch directions', true);
  }
}

function getTransportIcon(text) {
  if (!text) return '🚗';
  if (/Bus/i.test(text)) return '🚌';
  if (/Auto|Rickshaw|Three/i.test(text)) return '🛺';
  if (/Walk|Foot/i.test(text)) return '🚶‍♂️';
  return '🚗';
}

function shareDirections(name, directionsText) {
  const text = `Directions to ${name}:\n${directionsText}\nShared via EcoWise`;
  if (navigator.share) {
    navigator.share({ title: `Directions to ${name}`, text, url: window.location.href }).catch(() => copyToClipboard(text));
  } else {
    copyToClipboard(text).then(() => showInlineMessage('resultsContent', 'Directions copied to clipboard', false));
  }
}

// --- History & Leaderboard ---
async function showUserHistory() {
  try {
    requireAuth();
  } catch (e) { return; }

  try {
    const { ok, json } = await fetchWithTimeout(`${API_BASE}/user/${currentUser}/history`, {
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });
    if (!ok) {
      showInlineMessage('resultsContent', 'Unable to load history', true);
      return;
    }
    const history = json.history || [];
    const html = history.length ? history.map(item => `
      <div style="border-bottom:1px solid #eef2ff;padding:8px 0;display:flex;justify-content:space-between">
        <div>
          <div style="font-weight:700">${item.filename}</div>
          <div style="color:#6b7280;font-size:0.85rem">${new Date(item.processed_at).toLocaleString()}</div>
        </div>
        <div style="text-align:right;color:#10b981;font-weight:700">+${item.points_earned} pts</div>
      </div>
    `).join('') : '<div style="color:#6b7280">No history yet</div>';

    const container = document.getElementById('history');
    container.innerHTML = `<div>${html}</div>`;
    container.style.display = 'block';
    document.getElementById('locations').style.display = 'none';
  } catch (err) {
    log('showUserHistory err', err);
    showInlineMessage('resultsContent', 'Could not load history', true);
  }
}

async function showLeaderboard() {
  try {
    const { ok, json } = await fetchWithTimeout(`${API_BASE}/leaderboard`, {
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });
    if (!ok) { showInlineMessage('resultsContent', 'Failed to load leaderboard', true); return; }
    const list = Array.isArray(json) ? json : (json.leaderboard || []);
    const html = list.map((u, i) => `<div style="padding:8px;border-bottom:1px solid #eef2ff;display:flex;justify-content:space-between">
        <div><strong>${i+1}. ${u.username}</strong><div style="color:#6b7280">${u.level}</div></div>
        <div style="font-weight:700;color:#10b981">${u.eco_points} pts</div>
      </div>`).join('');
    createModal(`<h3>🏆 Leaderboard</h3><div style="margin-top:12px">${html}</div>`);
  } catch (err) {
    log('showLeaderboard err', err);
    showInlineMessage('resultsContent', 'Could not fetch leaderboard', true);
  }
}

// --- Export user data ---
async function exportUserData() {
  try {
    requireAuth();
  } catch (e) { return; }

  try {
    const [uRes, hRes] = await Promise.all([
      fetchWithTimeout(`${API_BASE}/user/${currentUser}`, { headers: getAuthHeaders({ 'Content-Type': 'application/json' }) }),
      fetchWithTimeout(`${API_BASE}/user/${currentUser}/history`, { headers: getAuthHeaders({ 'Content-Type': 'application/json' }) }),
    ]);
    if (!uRes.ok || !hRes.ok) throw new Error('Failed to fetch data');

    const user = uRes.json || {};
    const history = (hRes.json && hRes.json.history) || [];

    const exportPayload = { user, history, exported_at: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecowise_export_${currentUser}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showInlineMessage('resultsContent', 'Export complete', false);
  } catch (err) {
    log('exportUserData err', err);
    showInlineMessage('resultsContent', 'Export failed', true);
  }
}

// --- Demo mode (presentation) ---
function startDemoMode() {
  if (inDemoMode) return;
  inDemoMode = true;

  // demo images inside the project ZIP — using project zip path for reference per dev instruction
  const demoImages = [
    `${PROJECT_ZIP_URL}#plastic_water_bottle.jpg`,
    `${PROJECT_ZIP_URL}#old_smartphone.png`,
    `${PROJECT_ZIP_URL}#science_textbook.jpeg`,
    `${PROJECT_ZIP_URL}#blue_jeans.jpg`,
    `${PROJECT_ZIP_URL}#soda_cans.png`
  ];

  let idx = 0;
  showInlineMessage('resultsContent', '🚀 Demo mode started — processing sample images...', false);

  demoTimer = setInterval(async () => {
    if (idx >= demoImages.length) {
      clearInterval(demoTimer);
      inDemoMode = false;
      showInlineMessage('resultsContent', '🎉 Demo finished', false);
      return;
    }

    // simulate selecting a file by creating a blob (empty but with filename) — server should handle missing data in demo
    const fileName = demoImages[idx].split('#').pop();
    const demoFile = new File([new Blob([''])], fileName, { type: 'image/jpeg' });

    // create a DataTransfer to set input.files
    const dt = new DataTransfer();
    dt.items.add(demoFile);
    imageUploadEl.files = dt.files;
    showImagePreview(demoFile);

    // call analyze (silent fail handled inside)
    await analyzeImage();
    idx++;
  }, 2800);

  // quick UX notice
  setTimeout(() => showInlineMessage('resultsContent', 'Demo running — check results panel', false), 500);
}

// stop demo if needed
function stopDemoMode() {
  if (demoTimer) clearInterval(demoTimer);
  inDemoMode = false;
}

// --- share results (simple) ---
function shareResults() {
  const text = `I just recycled with EcoWise! Join me in making Hassan greener 🌱`;
  if (navigator.share) navigator.share({ title: 'EcoWise', text }).catch(() => copyToClipboard(text));
  else copyToClipboard(text).then(() => showInlineMessage('resultsContent', 'Share text copied to clipboard', false));
}

// --- load profile & initialization ---
async function loadUserProfile() {
  // show placeholder
  const profileContainer = document.getElementById('profileContent');
  if (profileContainer) profileContainer.innerHTML = '<div style="color:#6b7280">Loading profile...</div>';

  // try to fetch /me to get username
  try {
    if (!authToken) {
      // try to proceed anonymously but still load endpoint if available
      log('No token found in localStorage');
    } else {
      const me = await getCurrentUserFromServer();
      if (me) currentUser = me;
    }

    // fetch profile
    const { ok, json } = await fetchWithTimeout(`${API_BASE}/user/${currentUser}`, {
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });

    if (!ok) {
      if (profileContainer) profileContainer.innerHTML = '<div style="color:#6b7280">Could not load profile (server error)</div>';
      return;
    }

    const profile = json;
    // render simple profile
    if (profileContainer) {
      profileContainer.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700">${profile.username}</div>
            <div style="color:#6b7280;font-size:0.9rem">${profile.level || 'Eco Friend'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;color:#10b981">${profile.eco_points || 0}</div>
            <div style="font-size:0.85rem;color:#6b7280">EcoPoints</div>
          </div>
        </div>
      `;
    }

    // update currentUser with server canonical username
    if (profile.username) currentUser = profile.username;

  } catch (err) {
    log('loadUserProfile err', err);
    if (profileContainer) profileContainer.innerHTML = '<div style="color:#6b7280">Backend not reachable</div>';
  }
}

// --- small helpers to wire buttons present in markup (if exist) ---
document.addEventListener('DOMContentLoaded', () => {
  // wire analyze button
  const analyzeBtn = document.getElementById('analyzeButton');
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeImage);

  // wire demo mode button if present
  const demoBtn = document.querySelector('.demo-btn');
  if (demoBtn) demoBtn.addEventListener('click', startDemoMode);

  // wire export button
  const exportBtn = document.querySelector('.export-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportUserData);

  // initial profile load
  loadUserProfile();
});

// expose a couple of functions for console/dev testing
window.ecowise = {
  analyzeImage,
  showRecyclingCenters,
  showUserHistory,
  showLeaderboard,
  exportUserData,
  startDemoMode,
  PROJECT_ZIP_URL
};
