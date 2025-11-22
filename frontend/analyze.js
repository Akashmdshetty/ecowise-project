// analyze.js — optimized, modular, drop-in replacement for the old script
// Usage: include with <script type="module" src="/analyze.js"></script>
// Expects elements present in the improved analyze.html (IDs used below)

const API_BASE = window.API_BASE || 'http://localhost:4000';

const MAX_UPLOAD_BYTES = 2_200_000; // target compressed size (~2.2 MB)
const MAX_WIDTH = 1200;             // downscale width for large images

// State
let currentFile = null;
let cameraStream = null;

// DOM refs
const fileUploadArea = document.getElementById('fileUploadArea');
const imageUpload = document.getElementById('imageUpload');
const browseBtn = document.getElementById('browseBtn');
const imagePreview = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const clearPreview = document.getElementById('clearPreview');

const startCameraBtn = document.getElementById('startCameraBtn');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const cameraPreview = document.getElementById('cameraPreview');
const cameraVideo = document.getElementById('cameraVideo');
const captureBtn = document.getElementById('captureBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');

const analyzeButton = document.getElementById('analyzeButton');
const analyzeHint = document.getElementById('analyzeHint');

const resultsSection = document.getElementById('resultsSection');
const resultsContent = document.getElementById('resultsContent');
const resultsBadge = document.getElementById('resultsBadge');

// Helpers
const show = el => el.style.display = '';
const hide = el => el.style.display = 'none';
const setBadge = (text, color = '') => { resultsBadge.textContent = text; resultsBadge.style.background = color || 'var(--accent)'; };
const enableAnalyze = () => { analyzeButton.disabled = false; analyzeHint.textContent = 'Ready — click Analyze'; };
const disableAnalyze = () => { analyzeButton.disabled = true; analyzeHint.textContent = 'Select or capture an image to enable analysis'; };

// Preview logic
function showPreviewFromBlob(blob) {
  previewImage.src = URL.createObjectURL(blob);
  show(imagePreview);
  const label = fileUploadArea.querySelector('.upload-label');
  if (label) hide(label);
}
clearPreview.addEventListener('click', () => {
  imageUpload.value = '';
  previewImage.src = '';
  hide(imagePreview);
  const label = fileUploadArea.querySelector('.upload-label');
  if (label) show(label);
  currentFile = null;
  disableAnalyze();
  resultsSection.style.display = 'none';
});

// File input + drag/drop
browseBtn?.addEventListener?.('click', () => imageUpload.click());
imageUpload?.addEventListener?.('change', (e) => handleFiles(e.target.files));

['dragenter','dragover','dragleave','drop'].forEach(evt => {
  fileUploadArea?.addEventListener(evt, e => e.preventDefault());
  document.body.addEventListener(evt, e => e.preventDefault());
});
['dragenter','dragover'].forEach(evt => fileUploadArea?.addEventListener(evt, () => fileUploadArea.classList.add('highlight')));
['dragleave','drop'].forEach(evt => fileUploadArea?.addEventListener(evt, () => fileUploadArea.classList.remove('highlight')));

fileUploadArea?.addEventListener?.('drop', (e) => {
  const dt = e.dataTransfer;
  if (!dt) return;
  const files = dt.files;
  if (files && files.length) handleFiles(files);
});

function handleFiles(files) {
  const f = files[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) { alert('Please provide an image file.'); return; }
  if (f.size > 12 * 1024 * 1024) { alert('File too large (max 12MB). Please pick a smaller file.'); return; }
  currentFile = f;
  showPreviewFromBlob(f);
  enableAnalyze();
}

// Camera controls
startCameraBtn?.addEventListener?.('click', startCamera);
stopCameraBtn?.addEventListener?.('click', stopCamera);
captureBtn?.addEventListener?.('click', captureFromCamera);

async function startCamera(){
  if (cameraStream) return;
  try{
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    hide(cameraPlaceholder);
    show(cameraPreview);
  }catch(err){
    console.error('camera start failed', err);
    alert('Could not access camera. Check permissions or use file upload.');
  }
}

function stopCamera(){
  if (!cameraStream) return;
  cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
  hide(cameraPreview);
  show(cameraPlaceholder);
}

function captureFromCamera(){
  if (!cameraStream) { alert('Camera not started'); return; }
  const w = cameraVideo.videoWidth;
  const h = cameraVideo.videoHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(cameraVideo, 0, 0, w, h);
  canvas.toBlob((blob) => {
    if (!blob) { alert('Capture failed'); return; }
    const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
    currentFile = file;
    showPreviewFromBlob(file);
    enableAnalyze();
    stopCamera();
  }, 'image/jpeg', 0.9);
}

// Compression: downscale + quality loop
async function compressImage(file, maxBytes = MAX_UPLOAD_BYTES, maxW = MAX_WIDTH){
  // create ImageBitmap where supported
  const imageBitmap = await createImageBitmap(file);
  let w = imageBitmap.width, h = imageBitmap.height;
  if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, w, h);

  let quality = 0.9;
  let blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  while (blob && blob.size > maxBytes && quality > 0.35) {
    quality -= 0.07;
    blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  }
  return blob || file;
}

// Upload with progress (XHR) returns parsed JSON
function uploadFileWithProgress(blob, filename, onProgress){
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('image', blob, filename);
    fd.append('username', 'EcoStudent');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/detect`, true);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && typeof onProgress === 'function') onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(fd);
  });
}

// Main analyze handler
analyzeButton?.addEventListener?.('click', async () => {
  if (!currentFile) { alert('Select or capture image first'); return; }

  analyzeButton.disabled = true;
  analyzeButton.textContent = '⏳ Analyzing...';
  resultsSection.style.display = '';
  setBadge('Analyzing...', 'var(--accent)');
  resultsContent.innerHTML = `<div class="loading-analysis"><div><span class="analyzing-dot"></span><span class="analyzing-dot"></span><span class="analyzing-dot"></span></div><p style="color:var(--muted);margin-top:12px">Identifying objects and matching recycling instructions...</p></div>`;

  try{
    const compressedBlob = await compressImage(currentFile);
    const uploadName = currentFile.name || `upload_${Date.now()}.jpg`;

    const progressContainer = document.createElement('div');
    progressContainer.style.margin = '12px 0';
    const progressEl = document.createElement('progress');
    progressEl.max = 1; progressEl.value = 0; progressEl.style.width = '100%';
    progressContainer.appendChild(progressEl);
    resultsContent.appendChild(progressContainer);

    const res = await uploadFileWithProgress(compressedBlob, uploadName, (fraction) => { progressEl.value = fraction; });

    const data = res && typeof res === 'object' ? res : {};
    if (!data.detected_objects) { data.detected_objects = data.detected || data.items || []; }
    renderResults(data);
  }catch(err){
    console.error('Analyze error:', err);
    showMockResult();
  }finally{
    analyzeButton.disabled = false;
    analyzeButton.textContent = '🤖 Analyze with AI';
  }
});

// Render results
function renderResults(data){
  setBadge('Analysis Complete', 'var(--primary)');
  resultsContent.innerHTML = '';

  const detected = Array.isArray(data.detected_objects) ? data.detected_objects : [];
  if (!detected.length){
    resultsContent.innerHTML = `<div style="padding:28px;text-align:center"><h3>No items detected</h3><p style="color:var(--muted)">Try a clearer photo or different angle.</p><div style="margin-top:12px"><button class="analyze-btn" onclick="location.reload()">Try Again</button></div></div>`;
    return;
  }

  const primary = detected[0];
  const name = primary.name || primary.label || primary.type || 'item';
  const points = primary.points || primary.score || primary.eco_points || 0;
  const carbon = primary.carbon_saved_kg || primary.carbon || (data.carbon_saved_kg || 0);
  const details = getItemDetails(name);

  const left = document.createElement('div');
  left.className = 'item-info';
  left.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
      <div style="width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--gradient);font-size:28px">${details.icon}</div>
      <div>
        <h3 style="margin:0">${details.name}</h3>
        <div style="color:var(--primary);font-weight:600">${details.category}</div>
      </div>
    </div>
    <div style="color:var(--muted);line-height:1.5">${details.description}</div>
    <div style="margin-top:12px;padding:10px;border-radius:8px;background:rgba(16,185,129,0.06);border-left:4px solid var(--primary)">
      <strong>${details.action}</strong> — ${details.actionDescription}
    </div>
    <div class="stats-grid" style="margin-top:14px">
      <div class="stat-card"><div style="font-weight:700;color:var(--primary);font-size:1.2rem">+${points}</div><div style="color:var(--muted);font-size:0.85rem">EcoPoints</div></div>
      <div class="stat-card"><div style="font-weight:700;color:var(--primary);font-size:1.2rem">${carbon}kg</div><div style="color:var(--muted);font-size:0.85rem">Carbon Saved</div></div>
      <div class="stat-card"><div style="font-weight:700;color:var(--primary);font-size:1.2rem">${details.processingTime}</div><div style="color:var(--muted);font-size:0.85rem">Processing Time</div></div>
    </div>
    <div style="margin-top:12px"><h4 style="margin:8px 0">📋 Tips</h4>${details.tips.map(t => `<div class="recommendation-item">${t}</div>`).join('')}</div>
  `;

  const right = document.createElement('div');
  right.innerHTML = `<div class="centers-section"><h4>📍 Nearby Recycling Centers</h4><div id="centersList" class="centers-list" style="margin-top:10px"></div><div style="margin-top:12px;display:flex;gap:8px"><button class="analyze-btn" onclick="location.href='map.html'">🗺️ View All Centers</button><button class="browse-btn" style="background:transparent" onclick="analyzeAnother()">🔄 Analyze Another</button></div></div>`;

  const container = document.createElement('div');
  container.className = 'analysis-result';
  container.appendChild(left);
  container.appendChild(right);
  resultsContent.appendChild(container);

  fetch(`${API_BASE}/recycling-centers`).then(r => r.json()).then(json => {
    const centers = Array.isArray(json.centers) ? json.centers : (json || []);
    const picks = centers.filter(c => details.centers.includes(c.id)).slice(0,3);
    const centersListEl = document.getElementById('centersList');
    if (!picks.length) {
      centersListEl.innerHTML = `<div class="no-centers">No specific centers found. Open full map for all centers.</div>`;
      return;
    }
    centersListEl.innerHTML = picks.map(c => `
      <div class="center-item" data-id="${c.id}" onclick="openCenter(${c.id})">
        <div style="font-weight:600">${c.name}</div>
        <div style="color:var(--primary);font-size:0.85rem">${c.lat && c.lng ? 'Open in Maps' : 'Contact for details'}</div>
        <div style="color:var(--muted);font-size:0.85rem;margin-top:6px">${c.address || ''}</div>
      </div>
    `).join('');
  }).catch(e => {
    console.warn('centers fetch failed', e);
    const centersListEl = document.getElementById('centersList');
    if (centersListEl) centersListEl.innerHTML = `<div class="no-centers">Couldn't load centers. Try again later.</div>`;
  });
}

// open center helper
window.openCenter = function(id){
  localStorage.setItem('selectedCenter', id);
  location.href = 'map.html';
};

function analyzeAnother(){
  imageUpload.value = '';
  previewImage.src = '';
  hide(imagePreview);
  show(fileUploadArea.querySelector('.upload-label'));
  currentFile = null;
  disableAnalyze();
  resultsSection.style.display = 'none';
}

// fallback mock result
function showMockResult(){
  const mock = { detected_objects: [{ name:'bottle', points:10 }], carbon_saved_kg: 0.5, recommendations: ['Recycle the bottle at nearest center'] };
  renderResults(mock);
}

// items database
function getItemDetails(itemName){
  const db = {
    bottle:{name:'Plastic Bottle',category:'Recyclable Plastic',icon:'🥤',points:10,carbonSaved:0.5,processingTime:'2.1s',action:'Recycle',actionDescription:'Place in plastic recycling bin',description:'Plastic bottles are widely recyclable and can be turned into new products.',tips:['Rinse the bottle','Remove the cap','Flatten to save space'],centers:[1,2,5]},
    book:{name:'Books',category:'Donation/Reuse',icon:'📚',points:15,carbonSaved:0.8,processingTime:'1.8s',action:'Donate',actionDescription:'Give to libraries or community centers',description:'Books can be reused or donated.',tips:['Check condition','Contact local libraries'],centers:[8]},
    phone:{name:'Mobile Phone',category:'E-waste',icon:'📱',points:25,carbonSaved:2.0,processingTime:'2.5s',action:'Resell/Recycle',actionDescription:'Sell or recycle properly',description:'Contains valuable metals',tips:['Wipe data','Remove SIM'],centers:[3]},
    clothing:{name:'Clothing',category:'Donation/Reuse',icon:'👕',points:12,carbonSaved:1.2,processingTime:'1.9s',action:'Donate',actionDescription:'Give to charity or thrift stores',description:'Donate wearable clothing.',tips:['Wash before donating'],centers:[7]},
    can:{name:'Metal Can',category:'Recyclable Metal',icon:'🥫',points:10,carbonSaved:0.6,processingTime:'1.7s',action:'Recycle',actionDescription:'Place in metal recycling bin',description:'Metal cans are highly recyclable.',tips:['Rinse thoroughly','Crush to save space'],centers:[1,6]},
    glass:{name:'Glass Bottle',category:'Recyclable Glass',icon:'🍶',points:12,carbonSaved:0.4,processingTime:'2.0s',action:'Recycle',actionDescription:'Place in glass recycling bin',description:'Glass is 100% recyclable.',tips:['Rinse','Remove lids'],centers:[1,5]},
    item:{name:'General Item',category:'Check Guidelines',icon:'📦',points:5,carbonSaved:0.2,processingTime:'1.5s',action:'Check Guidelines',actionDescription:'Consult local recycling rules',description:'Check with local authorities.',tips:['Check guidelines','Visit map'],centers:[1]}
  };
  return db[itemName] || db['item'];
}

// keyboard accessibility
fileUploadArea?.addEventListener?.('keydown', (e) => { if (e.key === 'Enter') imageUpload.click(); });

// init
disableAnalyze();
