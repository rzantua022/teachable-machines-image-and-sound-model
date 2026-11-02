// Two Teachable Machine models on one page:
//   image: fingers, from an uploaded photo or the live camera
//   sound: animals, from the microphone
// Relative paths, so it works on GitHub Pages.
const IMAGE_MODEL_FOLDERS = ["./models/image/", "./model/"];
const SOUND_MODEL_FOLDER = "./models/sound/";

// Below this confidence the result panel adds a "not sure" note.
const LOW_CONFIDENCE = 0.6;

// Text that changes with the selected model.
const COPY = {
  image: {
    title: "Which finger is this?",
    lede: "Upload a photo or use your camera. The model tells you whether it sees a thumb, pointer, middle finger, ring finger or pinky.",
    emptyTitle: "No finger identified yet",
    emptyText: "Add a photo or start the camera and hold up one finger. The model's guesses will appear here, each with a confidence score.",
    lowNote: "The model isn't sure. Show a single finger against a plain background in good light.",
    tip: "For the best result, show one finger at a time, close to the camera, in good light. Angle and background change the result."
  },
  sound: {
    title: "Which animal is this?",
    lede: "Use your microphone. Play or make an animal sound near it, and the model tells you whether it hears a cat, cow, dog, duck, owl, pig, sheep or tuko.",
    emptyTitle: "No animal heard yet",
    emptyText: "Start listening and play an animal sound near your microphone. The model's guesses will appear here, each with a confidence score.",
    lowNote: "The model isn't sure. Play one sound at a time, closer to the microphone, with less other noise.",
    tip: "For the best result, play one sound at a time, close to the microphone, with little other noise. Speakers and rooms change how a sound comes across."
  }
};

const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const previewWrap = document.getElementById("previewWrap");
const dropzone = document.getElementById("dropzone");
const predictButton = document.getElementById("predictButton");
const resetButton = document.getElementById("resetButton");
const changeImage = document.getElementById("changeImage");
const modelStatus = document.getElementById("modelStatus");
const statusDot = document.getElementById("statusDot");
const inputMessage = document.getElementById("inputMessage");
const emptyResult = document.getElementById("emptyResult");
const emptyTitle = document.getElementById("emptyTitle");
const emptyText = document.getElementById("emptyText");
const predictionResults = document.getElementById("predictionResults");
const predictionList = document.getElementById("predictionList");
const bestName = document.getElementById("bestName");
const bestPercent = document.getElementById("bestPercent");
const lowNote = document.getElementById("lowNote");
const tip = document.getElementById("tip");
const srStatus = document.getElementById("srStatus");
const pageTitle = document.getElementById("classifierTitle");
const lede = document.getElementById("lede");

const imageModelTab = document.getElementById("imageModelTab");
const soundModelTab = document.getElementById("soundModelTab");
const imageHead = document.getElementById("imageHead");
const soundHead = document.getElementById("soundHead");

const uploadTab = document.getElementById("uploadTab");
const webcamTab = document.getElementById("webcamTab");
const webcamWrap = document.getElementById("webcamWrap");
const webcamContainer = document.getElementById("webcamContainer");
const liveBadge = document.getElementById("liveBadge");
const startCameraButton = document.getElementById("startCameraButton");
const stopCameraButton = document.getElementById("stopCameraButton");
const uploadActions = document.getElementById("uploadActions");
const cameraActions = document.getElementById("cameraActions");

const soundWrap = document.getElementById("soundWrap");
const spectrogram = document.getElementById("spectrogram");
const soundIdle = document.getElementById("soundIdle");
const soundBadge = document.getElementById("soundBadge");
const soundActions = document.getElementById("soundActions");
const startSoundButton = document.getElementById("startSoundButton");
const stopSoundButton = document.getElementById("stopSoundButton");

// Camera messages use the same status line as everything else.
const cameraNote = inputMessage;

// Which model is showing, and how each one is doing.
let activeModel = "image";
const modelState = { image: "loading", sound: "idle" }; // idle, loading, ready, failed

// Image model
let model = null;
let modelFailed = false;
let imageReady = false;
let currentObjectUrl = null;
let webcam = null;
let webcamRunning = false;
let activeInput = "upload";
let animationFrameId = null;
let predictionBusy = false;

// Bumped every time the camera is stopped. Lets startCamera() notice that the
// user left while the permission prompt was still open.
let startToken = 0;

// Sound model
let soundRecognizer = null;
let soundLabels = [];
let soundFailed = false;
let soundListening = false;
let soundStarting = false;
let soundToken = 0; // same idea as startToken, for the microphone

let predictionRows = [];
let lastAnnounced = null;
let lastAnnouncedAt = 0;

// ---- Status ----

function renderStatus() {
  const state = modelState[activeModel];
  const labels = {
    idle: "Model not loaded",
    loading: "Loading model…",
    ready: "Model ready",
    failed: "Model not loaded"
  };
  const wrapper = statusDot.parentElement;
  modelStatus.textContent = labels[state];
  wrapper.classList.toggle("ready", state === "ready");
  wrapper.classList.toggle("failed", state === "failed");
}

function displayName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ---- Image model ----

async function loadFromFolders() {
  let lastError = null;
  for (const folder of IMAGE_MODEL_FOLDERS) {
    try {
      return await tmImage.load(`${folder}model.json`, `${folder}metadata.json`);
    } catch (error) {
      console.warn(`No image model in ${folder}`, error);
      lastError = error;
    }
  }
  throw lastError;
}

async function loadModel() {
  modelState.image = "loading";
  renderStatus();
  try {
    if (typeof tmImage === "undefined") {
      throw new Error("The Teachable Machine library did not load. Check your internet connection.");
    }
    model = await loadFromFolders();
    modelState.image = "ready";
    renderStatus();
    if (activeModel === "image" && activeInput === "upload") {
      inputMessage.textContent = "Model loaded. Choose a photo of a finger or use your camera.";
    }
    updateButton();
  } catch (error) {
    console.error("Could not load the image model:", error);
    modelFailed = true;
    modelState.image = "failed";
    renderStatus();
    if (activeModel === "image") {
      inputMessage.textContent = loadFailureMessage("image");
    }
  }
}

function loadFailureMessage(kind) {
  if (location.protocol === "file:") {
    return "Open this page through a web server (VS Code Live Server, or python -m http.server). Double-clicking index.html can't load the model.";
  }
  const folder = kind === "image" ? "models/image" : "models/sound";
  return `Couldn't load the ${kind} model. Put model.json, metadata.json and weights.bin in the ${folder} folder, then reload. Press F12 and open Console for details.`;
}

function updateButton() {
  predictButton.disabled = !(model && imageReady && activeInput === "upload");
}

// ---- Sound model ----

async function loadSoundModel() {
  if (soundRecognizer || modelState.sound === "loading") return;
  modelState.sound = "loading";
  soundFailed = false;
  renderStatus();
  try {
    if (typeof speechCommands === "undefined") {
      throw new Error("The sound library did not load. Check your internet connection.");
    }
    // The sound library only accepts full http(s) URLs, not relative paths,
    // so turn ./models/sound/ into an absolute URL based on this page.
    const soundFolder = new URL(SOUND_MODEL_FOLDER, document.baseURI).href;
    const recognizer = speechCommands.create(
      "BROWSER_FFT",
      undefined,
      `${soundFolder}model.json`,
      `${soundFolder}metadata.json`
    );
    await recognizer.ensureModelLoaded();
    soundRecognizer = recognizer;
    soundLabels = recognizer.wordLabels();
    modelState.sound = "ready";
  } catch (error) {
    console.error("Could not load the sound model:", error);
    soundFailed = true;
    modelState.sound = "failed";
  }
  renderStatus();
  if (activeModel === "sound" && !soundListening && !soundStarting) {
    inputMessage.textContent = soundMessage();
  }
}

function soundMessage() {
  if (soundRecognizer) return "Press Start listening, then play an animal sound near your microphone.";
  if (soundFailed) return loadFailureMessage("sound");
  return "Loading the sound model…";
}

function safeStopRecognizer() {
  try {
    if (soundRecognizer && soundRecognizer.isListening()) {
      const result = soundRecognizer.stopListening();
      if (result && result.catch) result.catch(() => {});
    }
  } catch (error) {
    /* it wasn't listening */
  }
}

async function startListening() {
  if (soundListening || soundStarting) return;

  if (!soundRecognizer) {
    inputMessage.textContent = soundMessage();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    inputMessage.textContent =
      "This browser can't open the microphone here. Try a current browser over HTTPS.";
    return;
  }

  const token = ++soundToken;
  soundStarting = true;
  startSoundButton.disabled = true;
  inputMessage.textContent = "Waiting for microphone permission…";

  try {
    await soundRecognizer.listen(
      (result) => {
        if (token !== soundToken) return;
        handleSound(result);
      },
      {
        includeSpectrogram: true,
        probabilityThreshold: 0.75,
        invokeCallbackOnNoiseAndUnknown: true,
        overlapFactor: 0.5
      }
    );

    if (token !== soundToken) {
      // The user left while the permission prompt was open.
      safeStopRecognizer();
      return;
    }

    soundListening = true;
    soundIdle.hidden = true;
    soundBadge.hidden = false;
    stopSoundButton.disabled = false;
    inputMessage.textContent = "Listening. The result updates as you make sounds.";
  } catch (error) {
    console.error("Could not start the microphone:", error);
    safeStopRecognizer();
    if (token !== soundToken) return;
    startSoundButton.disabled = false;
    inputMessage.textContent = mediaErrorMessage(error, "microphone", "Start listening");
  } finally {
    soundStarting = false;
  }
}

function stopListening() {
  soundToken++;
  soundListening = false;
  safeStopRecognizer();
  soundBadge.hidden = true;
  soundIdle.hidden = false;
  clearSpectrogram();
  startSoundButton.disabled = false;
  stopSoundButton.disabled = true;
  inputMessage.textContent = "Stopped listening.";
}

function handleSound(result) {
  const predictions = soundLabels.map((label, index) => ({
    className: label,
    probability: result.scores[index]
  }));
  showPredictions(predictions);
  if (result.spectrogram) drawSpectrogram(result.spectrogram);
}

// A small picture of what the microphone is hearing. Time runs left to right,
// low pitch at the bottom, louder is darker.
const spectrogramContext = spectrogram.getContext("2d");

function drawSpectrogram({ data, frameSize }) {
  const frames = Math.floor(data.length / frameSize);
  if (!frames) return;
  if (spectrogram.width !== frames || spectrogram.height !== frameSize) {
    spectrogram.width = frames;
    spectrogram.height = frameSize;
  }

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const range = max - min || 1;

  const image = spectrogramContext.createImageData(frames, frameSize);
  for (let t = 0; t < frames; t++) {
    for (let f = 0; f < frameSize; f++) {
      const level = (data[t * frameSize + f] - min) / range;
      const p = ((frameSize - 1 - f) * frames + t) * 4;
      image.data[p] = 42;
      image.data[p + 1] = 39;
      image.data[p + 2] = 34;
      image.data[p + 3] = Math.round(level * 255);
    }
  }
  spectrogramContext.putImageData(image, 0, 0);
}

function clearSpectrogram() {
  spectrogramContext.clearRect(0, 0, spectrogram.width, spectrogram.height);
}

// ---- Results ----

function buildRow() {
  const row = document.createElement("li");
  row.className = "prediction-row";

  const label = document.createElement("div");
  label.className = "prediction-label";

  const name = document.createElement("span");
  name.className = "prediction-name";

  const value = document.createElement("span");
  value.className = "prediction-value";

  const track = document.createElement("div");
  track.className = "bar-track";

  const fill = document.createElement("div");
  fill.className = "bar-fill";

  label.append(name, value);
  track.append(fill);
  row.append(label, track);
  return { row, name, value, fill };
}

function formatPercent(probability) {
  return (Math.round(probability * 1000) / 10).toFixed(1);
}

// The rows are built once and then updated in place. The camera and the
// microphone call this over and over, and rebuilding the list each time would
// make the bars flicker.
function showPredictions(predictions) {
  emptyResult.hidden = true;
  predictionResults.hidden = false;

  if (predictionRows.length !== predictions.length) {
    predictionList.replaceChildren();
    predictionRows = predictions.map(() => {
      const built = buildRow();
      predictionList.append(built.row);
      return built;
    });
  }

  const ranking = predictions
    .map((_, index) => index)
    .sort((a, b) => predictions[b].probability - predictions[a].probability);

  ranking.forEach((index, rank) => {
    const prediction = predictions[index];
    const percent = formatPercent(prediction.probability);
    const parts = predictionRows[index];
    parts.name.textContent = displayName(prediction.className);
    parts.value.textContent = `${percent}%`;
    parts.fill.style.width = `${percent}%`;
    parts.row.style.order = rank;
    parts.row.classList.toggle("is-top", rank === 0);
  });

  const top = predictions[ranking[0]];
  bestName.textContent = displayName(top.className);
  bestPercent.textContent = `${formatPercent(top.probability)}%`;
  lowNote.hidden = top.probability >= LOW_CONFIDENCE;

  announce(top);
}

// Screen readers get the best match, not every update. That means only when it
// changes, and no more than once every two seconds.
function announce(top) {
  const now = Date.now();
  const changed = top.className !== lastAnnounced;
  if (!changed || now - lastAnnouncedAt < 2000) return;
  lastAnnounced = top.className;
  lastAnnouncedAt = now;
  srStatus.textContent =
    `Best match: ${displayName(top.className)}, ${Math.round(top.probability * 100)} percent.`;
}

function clearResults() {
  predictionResults.hidden = true;
  predictionList.replaceChildren();
  predictionRows = [];
  emptyResult.hidden = false;
  lastAnnounced = null;
  lastAnnouncedAt = 0;
  srStatus.textContent = "";
}

// ---- Upload ----

function setImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    inputMessage.textContent = "That file isn't an image. Choose a JPG, PNG or WebP.";
    return;
  }

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);

  preview.onload = () => {
    imageReady = true;
    dropzone.hidden = true;
    previewWrap.hidden = false;
    clearResults();
    inputMessage.textContent = "Photo ready. Press Classify photo.";
    updateButton();
  };
  preview.onerror = () => {
    imageReady = false;
    inputMessage.textContent = "This photo could not be opened. Try another file.";
    updateButton();
  };
  preview.src = currentObjectUrl;
}

// ---- Switching between models ----

function switchModel(kind) {
  if (kind === activeModel) return;
  stopCamera();
  stopListening();
  clearResults();
  activeModel = kind;
  applyModelUI();
  if (kind === "sound") loadSoundModel();
}

function applyModelUI() {
  const isImage = activeModel === "image";
  const copy = COPY[activeModel];

  imageModelTab.classList.toggle("active", isImage);
  soundModelTab.classList.toggle("active", !isImage);
  imageModelTab.setAttribute("aria-selected", String(isImage));
  soundModelTab.setAttribute("aria-selected", String(!isImage));

  pageTitle.textContent = copy.title;
  lede.textContent = copy.lede;
  emptyTitle.textContent = copy.emptyTitle;
  emptyText.textContent = copy.emptyText;
  lowNote.textContent = copy.lowNote;
  tip.textContent = copy.tip;

  imageHead.hidden = !isImage;
  soundHead.hidden = isImage;
  soundWrap.hidden = isImage;
  soundActions.hidden = isImage;

  if (isImage) {
    selectInput(activeInput);
  } else {
    dropzone.hidden = true;
    previewWrap.hidden = true;
    webcamWrap.hidden = true;
    uploadActions.hidden = true;
    cameraActions.hidden = true;
    inputMessage.textContent = soundMessage();
  }
  renderStatus();
}

// ---- Switching between upload and camera (image model only) ----

function selectInput(mode) {
  activeInput = mode;
  const uploadSelected = mode === "upload";
  uploadTab.classList.toggle("active", uploadSelected);
  webcamTab.classList.toggle("active", !uploadSelected);
  uploadTab.setAttribute("aria-selected", String(uploadSelected));
  webcamTab.setAttribute("aria-selected", String(!uploadSelected));
  dropzone.hidden = !uploadSelected || imageReady;
  previewWrap.hidden = !uploadSelected || !imageReady;
  webcamWrap.hidden = uploadSelected;
  uploadActions.hidden = !uploadSelected;
  cameraActions.hidden = uploadSelected;
  if (!uploadSelected) {
    inputMessage.textContent = "Press Start camera to classify what it sees.";
  } else {
    inputMessage.textContent = model
      ? "Choose a photo or drag one into the box."
      : modelFailed
        ? loadFailureMessage("image")
        : "Waiting for the model to load.";
  }
  updateButton();
}

function switchInput(mode) {
  if (mode === activeInput) return;
  stopCamera();
  clearResults();
  selectInput(mode);
}

// ---- Camera and microphone permission errors ----

function mediaErrorMessage(error, device, action) {
  const name = error && error.name;
  if (!window.isSecureContext) {
    return `The ${device} only works on a secure page. Open the site over HTTPS, or from localhost.`;
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `${displayName(device)} access is blocked. Allow the ${device} for this site in your browser settings, then press ${action} again.`;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return `No ${device} was found on this device.`;
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return `The ${device} is being used by another app. Close it and try again.`;
  }
  return `The ${device} could not be started. Check your browser's ${device} permission and try again.`;
}

// ---- Camera ----

async function startCamera() {
  if (!model) {
    cameraNote.textContent = modelFailed
      ? "The model could not be loaded, so there is nothing to classify with yet."
      : "The model is still loading. Try again in a moment.";
    return;
  }
  if (webcamRunning) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraNote.textContent =
      "This browser can't open the camera here. Try a current browser over HTTPS.";
    return;
  }

  const token = ++startToken;
  let cam = null;

  try {
    cameraNote.textContent = "Waiting for camera permission…";
    startCameraButton.disabled = true;

    cam = new tmImage.Webcam(400, 300, true);
    await cam.setup();
    if (token !== startToken) { cam.stop(); return; }
    await cam.play();
    if (token !== startToken) { cam.stop(); return; }

    webcam = cam;
    webcamContainer.replaceChildren(webcam.canvas);
    webcamRunning = true;
    liveBadge.hidden = false;
    startCameraButton.disabled = true;
    stopCameraButton.disabled = false;
    cameraNote.textContent = "Camera is on. The result updates as you move.";
    predictLoop();
  } catch (error) {
    console.error("Could not start webcam:", error);
    if (cam) {
      try { cam.stop(); } catch (stopError) { /* nothing to stop */ }
    }
    webcam = null;
    webcamRunning = false;
    if (token !== startToken) return;
    startCameraButton.disabled = false;
    cameraNote.textContent = mediaErrorMessage(error, "camera", "Start camera");
  }
}

async function predictLoop() {
  if (!webcamRunning || !webcam || !model) return;

  webcam.update();

  if (!predictionBusy) {
    predictionBusy = true;
    try {
      const predictions = await model.predict(webcam.canvas);
      if (webcamRunning) showPredictions(predictions);
    } catch (error) {
      console.error("Webcam prediction failed:", error);
      stopCamera();
      cameraNote.textContent = "Classification failed, so the camera was stopped. Check the browser console.";
      return;
    } finally {
      predictionBusy = false;
    }
  }

  if (webcamRunning) {
    animationFrameId = requestAnimationFrame(predictLoop);
  }
}

function stopCamera() {
  startToken++;
  webcamRunning = false;
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;

  if (webcam) {
    webcam.stop();
    webcam = null;
  }

  webcamContainer.replaceChildren();
  liveBadge.hidden = true;
  startCameraButton.disabled = false;
  stopCameraButton.disabled = true;
  cameraNote.textContent = "Camera stopped.";
}

// ---- Reset (image model) ----

function resetPage() {
  stopCamera();
  imageInput.value = "";
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = null;
  preview.removeAttribute("src");
  imageReady = false;
  previewWrap.hidden = true;
  dropzone.hidden = false;
  clearResults();
  selectInput("upload");
  inputMessage.textContent = model
    ? "Choose another photo, or switch to the camera."
    : loadFailureMessage("image");
  updateButton();
}

// ---- Events ----

imageInput.addEventListener("change", (event) => {
  setImage(event.target.files[0]);
});

changeImage.addEventListener("click", () => imageInput.click());

function allowDrop(target) {
  target.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
  target.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
    setImage(event.dataTransfer.files[0]);
  });
}
allowDrop(dropzone);
allowDrop(previewWrap);

predictButton.addEventListener("click", async () => {
  if (!model || !imageReady || activeInput !== "upload") return;
  predictButton.disabled = true;
  predictButton.textContent = "Classifying…";
  try {
    const predictions = await model.predict(preview);
    showPredictions(predictions);
    inputMessage.textContent = "Done. Try another photo to compare.";
  } catch (error) {
    console.error("Prediction failed:", error);
    inputMessage.textContent = "Classification failed. Check the browser console for details.";
  } finally {
    predictButton.textContent = "Classify photo";
    updateButton();
  }
});

imageModelTab.addEventListener("click", () => switchModel("image"));
soundModelTab.addEventListener("click", () => switchModel("sound"));
uploadTab.addEventListener("click", () => switchInput("upload"));
webcamTab.addEventListener("click", () => switchInput("webcam"));
startCameraButton.addEventListener("click", startCamera);
stopCameraButton.addEventListener("click", stopCamera);
startSoundButton.addEventListener("click", startListening);
stopSoundButton.addEventListener("click", stopListening);
resetButton.addEventListener("click", resetPage);

// Release the camera and microphone when the page is closed or navigated away from.
window.addEventListener("pagehide", () => {
  stopCamera();
  stopListening();
});

loadModel();
