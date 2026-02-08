/* core.js - Jewels-Ai: Master Engine (v11.6 - Fixed & Consolidated) */

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

// Robust Watermark Loading
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

/* Physics & Tracking State */
let isProcessingHand = false, isProcessingFace = false;
let currentAssetName = "Select a Design"; 
let currentAssetIndex = 0; 
let physics = { earringAngle: 0, earringVelocity: 0, swayOffset: 0, lastHeadX: 0 };
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

/* --- 2. AI CONCIERGE "NILA" --- */
const concierge = {
    synth: window.speechSynthesis,
    voice: null,
    active: true,
    hasStarted: false,
    
    init: function() {
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = this.setVoice;
        }
        this.setVoice();
        setTimeout(() => {
            const bubble = document.getElementById('ai-bubble');
            if(bubble) {
                bubble.innerText = "Tap me to activate Nila";
                bubble.classList.add('bubble-visible');
            }
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
            utter.rate = 1.0; 
            utter.pitch = 1.1;
            utter.onend = () => {
                if(bubble) setTimeout(() => bubble.classList.remove('bubble-visible'), 3000);
                if(avatar) avatar.classList.remove('talking');
            };
            this.synth.speak(utter);
        } else {
            setTimeout(() => {
                 if(avatar) avatar.classList.remove('talking');
                 if(bubble) bubble.classList.remove('bubble-visible');
            }, 3000);
        }
    },

    toggle: function() {
        if (!this.hasStarted) {
            this.hasStarted = true;
            this.speak("Namaste! I am Nila. I am now active.");
            initVoiceControl();
            return;
        }
        this.active = !this.active;
        if(this.active) this.speak("I am listening.");
        else { 
            this.synth.cancel(); 
            const bubble = document.getElementById('ai-bubble');
            if(bubble) bubble.innerText = "Muted"; 
        }
    }
};

/* --- 3. CO-SHOPPING ENGINE --- */
const coShop = {
    peer: null, conn: null, myId: null, active: false, isHost: false, 
    init: function() {
        this.peer = new Peer(null, { debug: 2 });
        this.peer.on('open', (id) => { this.myId = id; this.checkForInvite(); });
        this.peer.on('connection', (c) => { this.handleConnection(c); showToast("Friend Connected!"); this.activateUI(); if (this.isHost) setTimeout(() => this.callGuest(c.peer), 1000); });
        this.peer.on('call', (call) => { call.answer(); call.on('stream', (remoteStream) => { remoteVideo.srcObject = remoteStream; remoteVideo.style.display = 'block'; videoElement.style.display = 'none'; canvasElement.style.display = 'none'; showToast("Watching Host Live"); }); });
    },
    checkForInvite: function() { const urlParams = new URLSearchParams(window.location.search); const roomId = urlParams.get('room'); if (roomId) { this.isHost = false; this.connectToHost(roomId); } else { this.isHost = true; document.body.classList.add('hosting'); } },
    connectToHost: function(hostId) { this.conn = this.peer.connect(hostId); this.conn.on('open', () => { showToast("Connected!"); this.activateUI(); }); this.setupDataListener(); },
    handleConnection: function(c) { this.conn = c; this.setupDataListener(); },
    callGuest: function(guestId) { const stream = canvasElement.captureStream(30); this.peer.call(guestId, stream); },
    setupDataListener: function() { this.conn.on('data', (data) => { if (data.type === 'VOTE') showReaction(data.val); }); },
    sendUpdate: function(category, index) { if (this.conn && this.conn.open) this.conn.send({ type: 'SYNC_ITEM', cat: category, idx: index }); },
    sendVote: function(val) { if (this.conn && this.conn.open) { this.conn.send({ type: 'VOTE', val: val }); showReaction(val); } },
    activateUI: function() { this.active = true; document.getElementById('voting-ui').style.display = 'flex'; document.getElementById('coshop-btn').style.color = '#00ff00'; }
};

/* --- 4. ASSET LOADING --- */
function initBackgroundFetch() { Object.keys(DRIVE_FOLDERS).forEach(key => fetchCategoryData(key)); }

function fetchCategoryData(category) {
    if (CATALOG_PROMISES[category]) return CATALOG_PROMISES[category];
    const fetchPromise = new Promise(async (resolve, reject) => {
        try {
            const url = `https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDERS[category]}' in parents and trashed = false and mimeType contains 'image/'&pageSize=1000&fields=files(id,name,thumbnailLink)&key=${API_KEY}`;
            const response = await fetch(url);
            const data = await response.json();
            JEWELRY_ASSETS[category] = data.files.map(file => ({
                id: file.id, name: file.name,
                thumbSrc: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, "=s400") : `https://drive.google.com/thumbnail?id=${file.id}`,
                fullSrc: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, "=s3000") : `https://drive.google.com/uc?export=view&id=${file.id}`
            }));
            
            if (category === 'earrings') setTimeout(prepareDailyDrop, 2000);
            resolve(JEWELRY_ASSETS[category]);
        } catch (err) { console.error(err); resolve([]); }
    });
    CATALOG_PROMISES[category] = fetchPromise;
    return fetchPromise;
}

function loadAsset(src, id) {
    return new Promise((resolve) => {
        if (!src) { resolve(null); return; }
        if (IMAGE_CACHE[id]) { resolve(IMAGE_CACHE[id]); return; }
        const img = new Image(); 
        img.crossOrigin = 'anonymous'; 
        img.onload = () => { IMAGE_CACHE[id] = img; resolve(img); };
        img.onerror = () => { resolve(null); };
        img.src = src + (src.includes('?') ? '&' : '?') + 't=' + new Date().getTime();
    });
}

function setActiveARImage(img) {
    const type = window.JewelsState.currentType;
    if (type === 'earrings') window.JewelsState.active.earrings = img;
    else if (type === 'chains') window.JewelsState.active.chains = img;
    else if (type === 'rings') window.JewelsState.active.rings = img;
    else if (type === 'bangles') window.JewelsState.active.bangles = img;
}

/* --- 5. APP INIT --- */
window.onload = async () => {
    initBackgroundFetch();
    coShop.init(); 
    concierge.init();
    
    // Bind Close Buttons
    const closePrev = document.querySelector('.close-preview');
    if(closePrev) closePrev.onclick = closePreview;
    const closeGal = document.querySelector('.close-gallery');
    if(closeGal) closeGal.onclick = closeGallery;
    const closeLight = document.querySelector('.close-lightbox');
    if(closeLight) closeLight.onclick = closeLightbox;

    await startCameraFast('user');
    setTimeout(() => { loadingStatus.style.display = 'none'; }, 2000);
    await selectJewelryType('earrings');
};

/* --- 6. LOGIC: SELECTION & STACKING --- */
function toggleStacking() {
    window.JewelsState.stackingEnabled = !window.JewelsState.stackingEnabled;
    const btn = document.getElementById('stacking-btn');
    if (window.JewelsState.stackingEnabled) {
        if(btn) btn.classList.add('active');
        showToast("Mix & Match: ON");
        if(concierge.active) concierge.speak("Stacking enabled.");
    } else {
        if(btn) btn.classList.remove('active');
        showToast("Mix & Match: OFF");
        const current = window.JewelsState.currentType;
        Object.keys(window.JewelsState.active).forEach(key => {
            if (key !== current) window.JewelsState.active[key] = null;
        });
        if(concierge.active) concierge.speak("Single mode active.");
    }
}

async function selectJewelryType(type) {
  if (window.JewelsState.currentType === type && type !== undefined) return;
  window.JewelsState.currentType = type;
  if(concierge.hasStarted) concierge.speak(`Selected ${type}.`);
  const targetMode = (type === 'rings' || type === 'bangles') ? 'environment' : 'user';
  startCameraFast(targetMode); 
  if (!window.JewelsState.stackingEnabled) {
      window.JewelsState.active = { earrings: null, chains: null, rings: null, bangles: null };
  }
  const container = document.getElementById('jewelry-options'); 
  container.innerHTML = ''; 
  let assets = JEWELRY_ASSETS[type] || await fetchCategoryData(type);
  assets.forEach((asset, i) => {
    const btnImg = new Image(); 
    btnImg.src = asset.thumbSrc; btnImg.className = "thumb-btn"; 
    btnImg.onclick = () => { applyAssetInstantly(asset, i, true); };
    container.appendChild(btnImg);
  });
  applyAssetInstantly(assets[0], 0, false);
}

async function applyAssetInstantly(asset, index, shouldBroadcast = true) {
    currentAssetIndex = index; 
    currentAssetName = asset.name; 
    highlightButtonByIndex(index);
    const thumbImg = new Image(); 
    thumbImg.src = asset.thumbSrc; thumbImg.crossOrigin = 'anonymous'; 
    setActiveARImage(thumbImg);
    if (shouldBroadcast && coShop.active && coShop.isHost) {
        coShop.sendUpdate(window.JewelsState.currentType, index);
    }
    const highResImg = await loadAsset(asset.fullSrc, asset.id);
    if (currentAssetName === asset.name && highResImg) setActiveARImage(highResImg);
}

function highlightButtonByIndex(index) {
    const children = document.getElementById('jewelry-options').children;
    for (let i = 0; i < children.length; i++) {
        children[i].style.borderColor = (i === index) ? "var(--accent)" : "rgba(255,255,255,0.2)"; 
        if(i===index) children[i].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
}

/* --- 7. CONSOLIDATED VOICE CONTROL --- */
const voiceCommands = {
    'next': () => window.changeProduct(1),
    'previous': () => window.changeProduct(-1),
    'back': () => window.changeProduct(-1),
    'mix mode': () => window.toggleStacking(),
    'stacking': () => window.toggleStacking(),
    'screenshot': () => window.takeSnapshot(),
    'photo': () => window.takeSnapshot(),
    'earrings': () => window.selectJewelryType('earrings'),
    'rings': () => window.selectJewelryType('rings'),
    'price': () => { if(window.speakProductDetails) window.speakProductDetails(); },
    'clear': () => {
        window.JewelsState.active = { earrings: null, chains: null, rings: null, bangles: null };
        window.showToast("Cleared all items");
    }
};

function initVoiceControl() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-IN'; 
    recognition.onstart = () => { 
        voiceEnabled = true;
        const btn = document.getElementById('voice-control-btn');
        if(btn) btn.classList.add('listening');
    };
    recognition.onresult = (event) => {
        const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
        Object.keys(voiceCommands).forEach(key => {
            if (command.includes(key)) voiceCommands[key]();
        });
    };
    recognition.onend = () => { if (voiceEnabled) try { recognition.start(); } catch(e) {} };
    try { recognition.start(); } catch(e) {}
}

/* --- 8. CAMERA & TRACKING --- */
async function startCameraFast(mode = 'user') {
    if (!coShop.isHost && coShop.active) return; 
    if (videoElement.srcObject && currentCameraMode === mode) return;
    currentCameraMode = mode;
    if (videoElement.srcObject) videoElement.srcObject.getTracks().forEach(t => t.stop());
    if (mode === 'environment') videoElement.classList.add('no-mirror'); else videoElement.classList.remove('no-mirror');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
        videoElement.srcObject = stream;
        videoElement.onloadeddata = () => { videoElement.play(); detectLoop(); };
    } catch (err) { console.error("Camera Error", err); }
}

async function detectLoop() {
    if (videoElement.readyState >= 2 && !remoteVideo.srcObject) { 
        if (!isProcessingFace) { isProcessingFace = true; await faceMesh.send({image: videoElement}); isProcessingFace = false; }
        if (!isProcessingHand) { isProcessingHand = true; await hands.send({image: videoElement}); isProcessingHand = false; }
    }
    requestAnimationFrame(detectLoop);
}

/* --- 9. RENDER LOOPS (Face & Hand) --- */
const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ refineLandmarks: true, minDetectionConfidence: 0.5 });
faceMesh.onResults((results) => {
  const earringImg = window.JewelsState.active.earrings;
  const necklaceImg = window.JewelsState.active.chains;
  if (!earringImg && !necklaceImg) return;
  const w = videoElement.videoWidth; const h = videoElement.videoHeight;
  canvasElement.width = w; canvasElement.height = h;
  canvasCtx.save();
  if (currentCameraMode === 'environment') canvasCtx.setTransform(1,0,0,1,0,0);
  else { canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1); }
  canvasCtx.drawImage(videoElement, 0, 0, w, h);
  if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
    const lm = results.multiFaceLandmarks[0]; 
    const leftEar = { x: lm[132].x * w, y: lm[132].y * h }; 
    const rightEar = { x: lm[361].x * w, y: lm[361].y * h };
    const neck = { x: lm[152].x * w, y: lm[152].y * h };
    const earDist = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);
    if (earringImg && earringImg.complete) {
      let ew = earDist * 0.25; let eh = (earringImg.height/earringImg.width) * ew;
      canvasCtx.drawImage(earringImg, leftEar.x - ew/2, leftEar.y, ew, eh);
      canvasCtx.drawImage(earringImg, rightEar.x - ew/2, rightEar.y, ew, eh);
    }
    if (necklaceImg && necklaceImg.complete) {
      const nw = earDist * 0.85; const nh = (necklaceImg.height/necklaceImg.width) * nw;
      canvasCtx.drawImage(necklaceImg, neck.x - nw/2, neck.y + 20, nw, nh);
    }
  }
  canvasCtx.restore();
});

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, minDetectionConfidence: 0.5 });
hands.onResults((results) => {
  const w = videoElement.videoWidth; const h = videoElement.videoHeight;
  
  // GESTURE DETECTION
  if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
      const lm = results.multiHandLandmarks[0];
      const indexTipX = lm[8].x; 
      if (!autoTryRunning && (Date.now() - lastGestureTime > GESTURE_COOLDOWN)) {
          if (previousHandX !== null) {
              const diff = indexTipX - previousHandX;
              if (Math.abs(diff) > 0.04) { 
                  const dir = (diff > 0) ? -1 : 1; // Mirrored fix
                  changeProduct(dir); 
                  triggerVisualFeedback(dir === -1 ? "⬅️ Previous" : "Next ➡️");
                  lastGestureTime = Date.now(); 
                  previousHandX = null; 
              }
          }
          if (Date.now() - lastGestureTime > 100) previousHandX = indexTipX;
      }
  } else previousHandX = null;

  const ringImg = window.JewelsState.active.rings;
  const bangleImg = window.JewelsState.active.bangles;
  if (!ringImg && !bangleImg) return;
  canvasElement.width = w; canvasElement.height = h;
  canvasCtx.save();
  if (currentCameraMode === 'environment') canvasCtx.setTransform(1,0,0,1,0,0);
  else { canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1); }
  canvasCtx.drawImage(videoElement, 0, 0, w, h);
  if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
      const lm = results.multiHandLandmarks[0];
      const mcp = { x: lm[13].x * w, y: lm[13].y * h };
      const wrist = { x: lm[0].x * w, y: lm[0].y * h }; 
      if (ringImg) canvasCtx.drawImage(ringImg, mcp.x - 15, mcp.y - 15, 30, 30);
      if (bangleImg) canvasCtx.drawImage(bangleImg, wrist.x - 40, wrist.y - 40, 80, 80);
  }
  canvasCtx.restore();
});

/* --- 10. UTILITY & EXPORTS --- */
function triggerFlash() { 
    if(!flashOverlay) return; 
    flashOverlay.classList.add('flash-active'); 
    setTimeout(()=>flashOverlay.classList.remove('flash-active'),300); 
}

function takeSnapshot() {
    triggerFlash();
    const data = captureToGallery();
    if (data) {
        currentPreviewData = data;
        document.getElementById('preview-image').src = data.url;
        document.getElementById('preview-modal').style.display = 'flex';
    }
}

function captureToGallery() {
    const temp = document.createElement('canvas');
    temp.width = videoElement.videoWidth; temp.height = videoElement.videoHeight;
    const tctx = temp.getContext('2d');
    if (currentCameraMode === 'user') { tctx.translate(temp.width,0); tctx.scale(-1,1); }
    tctx.drawImage(videoElement, 0, 0);
    tctx.setTransform(1,0,0,1,0,0);
    tctx.drawImage(canvasElement, 0, 0);
    return { url: temp.toDataURL('image/png'), name: `Jewels-Ai_${Date.now()}.png` };
}

function closePreview() { document.getElementById('preview-modal').style.display = 'none'; }
function closeGallery() { document.getElementById('gallery-modal').style.display = 'none'; }
function closeLightbox() { document.getElementById('lightbox-overlay').style.display = 'none'; }
function prepareDailyDrop() { if(JEWELRY_ASSETS['earrings']) { dailyItem={item:JEWELRY_ASSETS['earrings'][0], index:0, type:'earrings'}; document.getElementById('daily-img').src=dailyItem.item.thumbSrc; } }

// Global Exports
window.selectJewelryType = selectJewelryType;
window.changeProduct = changeProduct;
window.takeSnapshot = takeSnapshot;
window.toggleStacking = toggleStacking;
window.closePreview = closePreview;
window.closeGallery = closeGallery;
window.closeLightbox = closeLightbox;
window.toggleVoiceControl = () => concierge.toggle();
window.showToast = (msg) => { let x=document.getElementById("toast-notification"); x.innerText=msg; x.className="show"; setTimeout(()=>x.className="",3000); };