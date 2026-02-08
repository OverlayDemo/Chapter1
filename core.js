/* core.js - Jewels-Ai: Master Engine (v12.0 - Physics Optimized) */

/* --- CONFIGURATION --- */
const API_KEY = "AIzaSyAXG3iG2oQjUA_BpnO8dK8y-MHJ7HLrhyE"; 

const DRIVE_FOLDERS = {
  earrings: "1eftKhpOHbCj8hzO11-KioFv03g0Yn61n",
  chains: "1G136WEiA9QBSLtRk0LW1fRb3HDZb4VBD",
  rings: "1iB1qgTE-Yl7w-CVsegecniD_DzklQk90",
  bangles: "1d2b7I8XlhIEb8S_eXnRFBEaNYSwngnba"
};

/* --- GLOBAL STATE --- */
window.JewelsState = {
    active: { earrings: null, chains: null, rings: null, bangles: null }, 
    stackingEnabled: false, 
    currentType: ''
};

const JEWELRY_ASSETS = {}; 
const CATALOG_PROMISES = {}; 
const IMAGE_CACHE = {}; 
let dailyItem = null; 

const watermarkImg = new Image(); 
watermarkImg.crossOrigin = "anonymous"; 
watermarkImg.src = 'logo_watermark.png'; 

/* DOM Elements */
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const remoteVideo = document.getElementById('remote-video');
const canvasCtx = canvasElement.getContext('2d');
const loadingStatus = document.getElementById('loading-status');
const flashOverlay = document.getElementById('flash-overlay'); 
const voiceBtn = document.getElementById('voice-btn');

/* Physics & Tracking State */
let isProcessingHand = false, isProcessingFace = false;
let currentAssetName = "Select a Design"; 
let currentAssetIndex = 0; 
let physics = { 
    earringAngle: 0, 
    earringVelocity: 0,
    chainAngle: 0,
    chainVelocity: 0, 
    swayOffset: 0, 
    lastHeadX: 0 
};
let currentCameraMode = 'user'; 

/* Auto Try & Gallery State */
let autoTryRunning = false; 
let autoTryIndex = 0; 
let autoTryTimeout = null;
let autoSnapshots = [];
let currentPreviewData = { url: null, name: '' };
let currentLightboxIndex = 0;

/* Voice & AI State */
let recognition = null;
let voiceEnabled = false;
let isRecognizing = false;

/* GESTURE VARIABLES */
let lastGestureTime = 0;
const GESTURE_COOLDOWN = 800; 
let previousHandX = null;

/* Stabilizer Variables */
const SMOOTH_FACTOR = 0.8; 
let handSmoother = {
    active: false,
    ring: { x: 0, y: 0, angle: 0, size: 0 },
    bangle: { x: 0, y: 0, angle: 0, size: 0 }
};

/* --- 1. CORE NAVIGATION FUNCTIONS --- */
function changeProduct(direction) { 
    if (!JEWELRY_ASSETS[window.JewelsState.currentType]) return; 
    const list = JEWELRY_ASSETS[window.JewelsState.currentType]; 
    let newIndex = currentAssetIndex + direction; 
    if (newIndex >= list.length) newIndex = 0; 
    if (newIndex < 0) newIndex = list.length - 1; 
    applyAssetInstantly(list[newIndex], newIndex, true); 
}

function triggerVisualFeedback(text) { 
    const feedback = document.createElement('div'); 
    feedback.innerText = text; 
    feedback.style.cssText = 'position:fixed; top:20%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.7); color:#fff; padding:10px 20px; border-radius:20px; z-index:1000; pointer-events:none; font-family:sans-serif; font-size:18px;'; 
    document.body.appendChild(feedback); 
    setTimeout(() => { feedback.remove(); }, 1000); 
}

/* --- 2. AI CONCIERGE --- */
const concierge = {
    synth: window.speechSynthesis,
    voice: null,
    active: true,
    hasStarted: false,
    init: function() {
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = this.setVoice;
        this.setVoice();
        setTimeout(() => {
            const bubble = document.getElementById('ai-bubble');
            if(bubble) { bubble.innerText = "Tap me to activate Nila"; bubble.classList.add('bubble-visible'); }
        }, 1000);
    },
    setVoice: function() {
        const voices = window.speechSynthesis.getVoices();
        concierge.voice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Female")) || voices[0];
    },
    speak: function(text) {
        if (!this.active || !this.synth) return;
        const bubble = document.getElementById('ai-bubble');
        const avatar = document.getElementById('ai-avatar');
        if(bubble) { bubble.innerText = text; bubble.classList.add('bubble-visible'); }
        if(avatar) avatar.classList.add('talking');
        if (this.hasStarted) {
            this.synth.cancel();
            const utter = new SpeechSynthesisUtterance(text);
            utter.voice = this.voice;
            utter.onend = () => {
                if(bubble) setTimeout(() => bubble.classList.remove('bubble-visible'), 3000);
                if(avatar) avatar.classList.remove('talking');
            };
            this.synth.speak(utter);
        }
    },
    toggle: function() {
        if (!this.hasStarted) {
            this.hasStarted = true;
            this.speak("Namaste! I am Nila.");
            if(!voiceEnabled) toggleVoiceControl();
            return;
        }
        this.active = !this.active;
    }
};

/* --- 3. CO-SHOPPING ENGINE --- */
const coShop = {
    peer: null, conn: null, myId: null, active: false, isHost: false, 
    init: function() {
        this.peer = new Peer(null, { debug: 2 });
        this.peer.on('open', (id) => { this.myId = id; this.checkForInvite(); });
        this.peer.on('connection', (c) => { this.handleConnection(c); showToast("Friend Connected!"); this.activateUI(); if (this.isHost) setTimeout(() => this.callGuest(c.peer), 1000); });
        this.peer.on('call', (call) => { call.answer(); call.on('stream', (remoteStream) => { remoteVideo.srcObject = remoteStream; remoteVideo.style.display = 'block'; videoElement.style.display = 'none'; canvasElement.style.display = 'none'; }); });
    },
    checkForInvite: function() { const urlParams = new URLSearchParams(window.location.search); const roomId = urlParams.get('room'); if (roomId) { this.isHost = false; this.connectToHost(roomId); } else { this.isHost = true; document.body.classList.add('hosting'); } },
    connectToHost: function(hostId) { this.conn = this.peer.connect(hostId); this.conn.on('open', () => { showToast("Connected!"); this.activateUI(); }); },
    handleConnection: function(c) { this.conn = c; },
    callGuest: function(guestId) { const stream = canvasElement.captureStream(30); this.peer.call(guestId, stream); },
    sendUpdate: function(category, index) { if (this.conn && this.conn.open) this.conn.send({ type: 'SYNC_ITEM', cat: category, idx: index }); },
    activateUI: function() { this.active = true; document.getElementById('voting-ui').style.display = 'flex'; }
};

/* --- 4. ASSET LOADING --- */
function initBackgroundFetch() { Object.keys(DRIVE_FOLDERS).forEach(key => fetchCategoryData(key)); }
async function fetchCategoryData(category) {
    if (CATALOG_PROMISES[category]) return CATALOG_PROMISES[category];
    const fetchPromise = (async () => {
        try {
            const url = `https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDERS[category]}' in parents and trashed = false and mimeType contains 'image/'&pageSize=1000&fields=files(id,name,thumbnailLink)&key=${API_KEY}`;
            const response = await fetch(url);
            const data = await response.json();
            JEWELRY_ASSETS[category] = data.files.map(file => ({
                id: file.id, name: file.name,
                thumbSrc: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, "=s400") : `https://drive.google.com/thumbnail?id=${file.id}`,
                fullSrc: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, "=s3000") : `https://drive.google.com/uc?export=view&id=${file.id}`
            }));
            return JEWELRY_ASSETS[category];
        } catch (err) { return []; }
    })();
    CATALOG_PROMISES[category] = fetchPromise;
    return fetchPromise;
}

function loadAsset(src, id) {
    return new Promise((resolve) => {
        if (IMAGE_CACHE[id]) return resolve(IMAGE_CACHE[id]);
        const img = new Image(); 
        img.crossOrigin = 'anonymous'; 
        img.onload = () => { IMAGE_CACHE[id] = img; resolve(img); };
        img.src = src;
    });
}

function setActiveARImage(img) {
    const type = window.JewelsState.currentType;
    if (window.JewelsState.active.hasOwnProperty(type)) window.JewelsState.active[type] = img;
}

/* --- 5. APP INIT --- */
window.onload = async () => {
    initBackgroundFetch();
    coShop.init(); 
    concierge.init();
    await startCameraFast('user');
    setTimeout(() => { loadingStatus.style.display = 'none'; }, 2000);
    await selectJewelryType('earrings');
};

/* --- 6. LOGIC: SELECTION & STACKING --- */
function toggleStacking() {
    window.JewelsState.stackingEnabled = !window.JewelsState.stackingEnabled;
    if (!window.JewelsState.stackingEnabled) {
        const current = window.JewelsState.currentType;
        Object.keys(window.JewelsState.active).forEach(key => { if (key !== current) window.JewelsState.active[key] = null; });
    }
}

async function selectJewelryType(type) {
  window.JewelsState.currentType = type;
  const targetMode = (type === 'rings' || type === 'bangles') ? 'environment' : 'user';
  startCameraFast(targetMode); 
  if (!window.JewelsState.stackingEnabled) window.JewelsState.active = { earrings: null, chains: null, rings: null, bangles: null };
  const container = document.getElementById('jewelry-options'); 
  container.innerHTML = ''; 
  let assets = await fetchCategoryData(type);
  assets.forEach((asset, i) => {
    const btnImg = new Image(); btnImg.src = asset.thumbSrc; btnImg.className = "thumb-btn"; 
    btnImg.onclick = () => applyAssetInstantly(asset, i, true);
    container.appendChild(btnImg);
  });
  applyAssetInstantly(assets[0], 0, false);
}

async function applyAssetInstantly(asset, index, shouldBroadcast = true) {
    currentAssetIndex = index; currentAssetName = asset.name; 
    highlightButtonByIndex(index);
    const thumbImg = new Image(); thumbImg.src = asset.thumbSrc; thumbImg.crossOrigin = 'anonymous'; 
    setActiveARImage(thumbImg);
    const highResImg = await loadAsset(asset.fullSrc, asset.id);
    if (currentAssetName === asset.name) setActiveARImage(highResImg);
}

function highlightButtonByIndex(index) {
    const children = document.getElementById('jewelry-options').children;
    for (let i = 0; i < children.length; i++) {
        children[i].style.borderColor = (i === index) ? "var(--accent)" : "rgba(255,255,255,0.2)"; 
    }
}

/* --- 7. VOICE CONTROL --- */
function initVoiceControl() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition(); recognition.continuous = true;
    recognition.onresult = (event) => processVoiceCommand(event.results[event.results.length - 1][0].transcript.toLowerCase());
    try { recognition.start(); } catch(e) {}
}
function toggleVoiceControl() { voiceEnabled = !voiceEnabled; if (voiceEnabled) recognition.start(); else recognition.stop(); }
function processVoiceCommand(cmd) { 
    if (cmd.includes('next')) changeProduct(1); 
    else if (cmd.includes('back')) changeProduct(-1); 
    else if (cmd.includes('photo')) takeSnapshot(); 
}

/* --- 8. CAMERA & TRACKING --- */
async function startCameraFast(mode = 'user') {
    if (videoElement.srcObject && currentCameraMode === mode) return;
    currentCameraMode = mode;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: mode } });
    videoElement.srcObject = stream;
    videoElement.onloadeddata = () => { videoElement.play(); detectLoop(); };
}

async function detectLoop() {
    if (videoElement.readyState >= 2) { 
        if (!isProcessingFace) { isProcessingFace = true; await faceMesh.send({image: videoElement}); isProcessingFace = false; }
        if (!isProcessingHand) { isProcessingHand = true; await hands.send({image: videoElement}); isProcessingHand = false; }
    }
    requestAnimationFrame(detectLoop);
}

/* --- 9. RENDER LOOPS (FACE MESH) --- */
const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ refineLandmarks: true, minDetectionConfidence: 0.5 });
faceMesh.onResults((results) => {
  const earringImg = window.JewelsState.active.earrings;
  const necklaceImg = window.JewelsState.active.chains;
  const w = videoElement.videoWidth, h = videoElement.videoHeight;
  canvasElement.width = w; canvasElement.height = h;
  canvasCtx.save();
  if (currentCameraMode !== 'environment') { canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1); }
  canvasCtx.drawImage(videoElement, 0, 0, w, h);
  
  if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
    const lm = results.multiFaceLandmarks[0]; 
    const leftEar = { x: lm[132].x * w, y: lm[132].y * h }; 
    const rightEar = { x: lm[361].x * w, y: lm[361].y * h };
    const neck = { x: lm[152].x * w, y: lm[152].y * h }; 
    const nose = { x: lm[1].x * w, y: lm[1].y * h };
    
    // PHYSICS CALCULATION
    const headDelta = (lm[1].x - physics.lastHeadX) * w;
    physics.lastHeadX = lm[1].x;

    // Earring Physics
    const gravityTarget = -Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x); 
    physics.earringVelocity += (gravityTarget - physics.earringAngle) * 0.1; 
    physics.earringVelocity *= 0.92; 
    physics.earringAngle += physics.earringVelocity;
    physics.swayOffset += headDelta * -0.005; 
    physics.swayOffset *= 0.85; 

    // Chain Physics (New & Corrected)
    physics.chainVelocity += headDelta * 0.003; 
    physics.chainVelocity *= 0.82; // Slightly more friction than earrings
    physics.chainAngle += physics.chainVelocity;
    physics.chainAngle *= 0.88; // Gravity pull
    
    const earDist = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);
    
    // Render Earrings
    if (earringImg && earringImg.complete) {
      let ew = earDist * 0.25, eh = (earringImg.height/earringImg.width) * ew;
      const totalAngle = physics.earringAngle + (physics.swayOffset * 0.5);
      [leftEar, rightEar].forEach(pt => {
          canvasCtx.save(); canvasCtx.translate(pt.x, pt.y); canvasCtx.rotate(totalAngle);
          canvasCtx.drawImage(earringImg, -ew/2, -eh*0.2, ew, eh); canvasCtx.restore();
      });
    }

    // Render Chain (New & Corrected)
    if (necklaceImg && necklaceImg.complete) {
      const nw = earDist * 0.9, nh = (necklaceImg.height/necklaceImg.width) * nw;
      canvasCtx.save();
      canvasCtx.translate(neck.x, neck.y + (nw * 0.15)); // Anchor at neck base
      canvasCtx.rotate(physics.chainAngle);
      canvasCtx.drawImage(necklaceImg, -nw/2, 0, nw, nh);
      canvasCtx.restore();
    }
  }
  canvasCtx.restore();
});

/* --- 10. RENDER LOOPS (HANDS) --- */
const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, minDetectionConfidence: 0.5 });
hands.onResults((results) => {
  const w = videoElement.videoWidth, h = videoElement.videoHeight;
  const ringImg = window.JewelsState.active.rings, bangleImg = window.JewelsState.active.bangles;
  if (!ringImg && !bangleImg) return;

  if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
      const lm = results.multiHandLandmarks[0];
      const mcp = { x: lm[13].x * w, y: lm[13].y * h };
      const wrist = { x: lm[0].x * w, y: lm[0].y * h };
      
      // Basic smooth rendering logic for rings/bangles
      if (ringImg && ringImg.complete) {
          canvasCtx.save();
          if (currentCameraMode !== 'environment') { canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1); }
          canvasCtx.drawImage(ringImg, mcp.x - 25, mcp.y - 25, 50, 50);
          canvasCtx.restore();
      }
  }
});

/* --- 11. UTILS & EXPORTS --- */
function takeSnapshot() { triggerFlash(); const data = captureToGallery(); if(data) { document.getElementById('preview-image').src = data.url; document.getElementById('preview-modal').style.display='flex'; } }
function triggerFlash() { flashOverlay.classList.add('flash-active'); setTimeout(()=>flashOverlay.classList.remove('flash-active'), 300); }
function lerp(start, end, amt) { return (1 - amt) * start + amt * end; }

window.selectJewelryType = selectJewelryType;
window.toggleStacking = toggleStacking;
window.takeSnapshot = takeSnapshot;