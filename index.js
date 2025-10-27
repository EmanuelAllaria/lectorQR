// Elementos del DOM
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const resultadoEl = document.getElementById('resultado');
const statusEl = document.getElementById('status');
const btnToggleScan = document.getElementById('btnToggleScan');
const btnSwitchCamera = document.getElementById('btnSwitchCamera');
const btnTorch = document.getElementById('btnTorch');
const fileInput = document.getElementById('fileInput');
const btnCopy = document.getElementById('btnCopy');
const btnOpen = document.getElementById('btnOpen');
const btnClearResult = document.getElementById('btnClearResult');
const historialEl = document.getElementById('historial');
const btnClearHistory = document.getElementById('btnClearHistory');
const autoPause = document.getElementById('autoPause');

// Estado
let video = null;
let stream = null;
let rafId = null;
let scanning = true;
let devices = [];
let currentDeviceIndex = 0;
let torchSupported = false;
let torchOn = false;
let lastCode = '';
let lastDetectedAt = 0;
let history = [];

// Utilidades
const isProbablyUrl = (text) => /^(https?:\/\/|www\.)[\w\-]+(\.[\w\-]+)+/i.test(text);
const now = () => Date.now();

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function enableResultActions(enabled) {
  [btnCopy, btnOpen, btnClearResult].forEach(btn => {
    if (btn) btn.disabled = !enabled;
  });
}

function drawLine(begin, end, color) {
  ctx.beginPath();
  ctx.moveTo(begin.x, begin.y);
  ctx.lineTo(end.x, end.y);
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
}

async function enumerateCameras() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices = all.filter(d => d.kind === 'videoinput');
  } catch (e) {
    // Ignorar
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (video) {
    try { video.pause(); } catch {}
    video.srcObject = null;
    video = null;
  }
}

async function startCamera({ deviceId } = {}) {
  stopCamera();

  const constraints = deviceId
    ? { video: { deviceId: { exact: deviceId } } }
    : { video: { facingMode: { ideal: 'environment' } } };

  try {
    setStatus('Solicitando cámara…');
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play();

    // Torch capability
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    torchSupported = !!caps.torch;
    btnTorch.disabled = !torchSupported;

    // Enumerar cámaras por si hace falta
    enumerateCameras();

    scanning = true;
    setStatus('Buscando código…');
    loop();
  } catch (err) {
    console.error(err);
    setStatus('No se pudo acceder a la cámara');
  }
}

function loop() {
  if (!video) return;
  if (!scanning) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });

      if (code) {
        // Dibuja el polígono del QR
        const loc = code.location;
        drawLine(loc.topLeftCorner, loc.topRightCorner, '#22d3ee');
        drawLine(loc.topRightCorner, loc.bottomRightCorner, '#22d3ee');
        drawLine(loc.bottomRightCorner, loc.bottomLeftCorner, '#22d3ee');
        drawLine(loc.bottomLeftCorner, loc.topLeftCorner, '#22d3ee');

        onDetected(code.data);
      } else {
        setStatus('Buscando código…');
      }
    } catch (e) {
      // Continúa aunque falle una iteración
    }
  }

  rafId = requestAnimationFrame(loop);
}

function onDetected(text) {
  const duplicateWithin = 1200; // ms
  const isDuplicate = text === lastCode && (now() - lastDetectedAt) < duplicateWithin;
  if (isDuplicate) return;

  lastCode = text;
  lastDetectedAt = now();

  resultadoEl.textContent = text;
  enableResultActions(true);
  setStatus('Código detectado');

  // Vibración en móviles (si disponible)
  if (navigator.vibrate) {
    try { navigator.vibrate(150); } catch {}
  }

  addToHistory(text);

  if (isProbablyUrl(text)) {
    btnOpen.disabled = false;
  } else {
    btnOpen.disabled = true;
  }

  if (autoPause && autoPause.checked) {
    pauseScan();
  }
}

function pauseScan() {
  scanning = false;
  if (rafId) cancelAnimationFrame(rafId);
  setStatus('Pausado');
  btnToggleScan.textContent = 'Reanudar';
}

function resumeScan() {
  scanning = true;
  setStatus('Buscando código…');
  btnToggleScan.textContent = 'Pausar';
  loop();
}

function toggleScan() {
  scanning ? pauseScan() : resumeScan();
}

async function switchCamera() {
  await enumerateCameras();
  if (!devices.length) {
    // Intento alternar facingMode si no hay lista
    const useFront = btnSwitchCamera.dataset.face !== 'user';
    btnSwitchCamera.dataset.face = useFront ? 'user' : 'environment';
    startCamera({ deviceId: undefined });
    return;
  }
  currentDeviceIndex = (currentDeviceIndex + 1) % devices.length;
  const next = devices[currentDeviceIndex];
  await startCamera({ deviceId: next.deviceId });
}

async function toggleTorch() {
  if (!stream) return;
  try {
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) return;
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    btnTorch.textContent = torchOn ? 'Linterna: ON' : 'Linterna';
  } catch (e) {
    // si falla, deshabilitar
    btnTorch.disabled = true;
  }
}

function readFileAsImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function scanImageFromFile(file) {
  try {
    pauseScan();
    setStatus('Analizando imagen…');
    const img = await readFileAsImage(file);

    // Ajusta el canvas al tamaño de la imagen
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code) {
      const loc = code.location;
      drawLine(loc.topLeftCorner, loc.topRightCorner, '#10b981');
      drawLine(loc.topRightCorner, loc.bottomRightCorner, '#10b981');
      drawLine(loc.bottomRightCorner, loc.bottomLeftCorner, '#10b981');
      drawLine(loc.bottomLeftCorner, loc.topLeftCorner, '#10b981');
      onDetected(code.data);
    } else {
      setStatus('No se detectó ningún código');
    }
  } catch (e) {
    setStatus('Error leyendo la imagen');
  }
}

function copyText(text) {
  return navigator.clipboard?.writeText(text);
}

function normalizeUrl(text) {
  if (/^https?:\/\//i.test(text)) return text;
  if (/^www\./i.test(text)) return `https://${text}`;
  return text;
}

function addToHistory(text) {
  const ts = new Date().toLocaleString();
  const entry = { text, ts };
  history.unshift(entry);
  saveHistory();
  renderHistory();
}

function saveHistory() {
  try { localStorage.setItem('qrHistory', JSON.stringify(history.slice(0, 50))); } catch {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('qrHistory');
    history = raw ? JSON.parse(raw) : [];
  } catch { history = []; }
  renderHistory();
}

function renderHistory() {
  if (!historialEl) return;
  historialEl.innerHTML = '';
  history.forEach((h, idx) => {
    const li = document.createElement('li');
    const top = document.createElement('div');
    top.className = 'hist-item-top';
    const meta = document.createElement('div');
    meta.className = 'hist-meta';
    meta.textContent = h.ts;
    const actions = document.createElement('div');
    actions.className = 'hist-actions';

    const btnCopyItem = document.createElement('button');
    btnCopyItem.className = 'btn btn-secondary';
    btnCopyItem.textContent = 'Copiar';
    btnCopyItem.onclick = () => copyText(h.text);

    const btnOpenItem = document.createElement('button');
    btnOpenItem.className = 'btn btn-secondary';
    btnOpenItem.textContent = 'Abrir';
    const url = normalizeUrl(h.text);
    btnOpenItem.disabled = !isProbablyUrl(url);
    btnOpenItem.onclick = () => window.open(url, '_blank');

    actions.append(btnCopyItem, btnOpenItem);
    top.append(meta, actions);

    const text = document.createElement('div');
    text.className = 'hist-text';
    text.textContent = h.text;

    li.append(top, text);
    historialEl.append(li);
  });
}

function clearResult() {
  resultadoEl.textContent = '';
  lastCode = '';
  enableResultActions(false);
  setStatus(scanning ? 'Buscando código…' : 'Pausado');
}

function clearHistory() {
  history = [];
  saveHistory();
  renderHistory();
}

// Listeners
btnToggleScan?.addEventListener('click', toggleScan);
btnSwitchCamera?.addEventListener('click', switchCamera);
btnTorch?.addEventListener('click', toggleTorch);
btnCopy?.addEventListener('click', () => copyText(resultadoEl.textContent));
btnOpen?.addEventListener('click', () => {
  const url = normalizeUrl(resultadoEl.textContent);
  if (isProbablyUrl(url)) window.open(url, '_blank');
});
btnClearResult?.addEventListener('click', clearResult);
btnClearHistory?.addEventListener('click', clearHistory);
fileInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) scanImageFromFile(file);
  e.target.value = '';
});

// Inicialización
(async function init() {
  loadHistory();
  enableResultActions(false);
  setStatus('Preparando cámara…');
  await startCamera();
})();
