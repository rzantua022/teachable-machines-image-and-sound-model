// Two Teachable Machine models:
//   image: fingers, from a photo or the live camera
//   sound: animals, from the microphone
const IMAGE_MODEL_FOLDER = "./image-model/";
const SOUND_MODEL_FOLDER = "./audio-model/";

// Below this confidence the results show "Not very sure".
const LOW_CONFIDENCE = 0.6;

const LOADING = "Loading model…";

const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const previewWrap = document.getElementById("previewWrap");
const dropzone = document.getElementById("dropzone");
const changeImage = document.getElementById("changeImage");
const statusLine = document.getElementById("status");
const emptyText = document.getElementById("emptyText");
const predictionResults = document.getElementById("predictionResults");
const predictionList = document.getElementById("predictionList");
const lowNote = document.getElementById("lowNote");
const srStatus = document.getElementById("srStatus");

const imageModelTab = document.getElementById("imageModelTab");
const soundModelTab = document.getElementById("soundModelTab");
const methods = document.getElementById("methods");
const uploadTab = document.getElementById("uploadTab");
const webcamTab = document.getElementById("webcamTab");

const webcamWrap = document.getElementById("webcamWrap");
const webcamContainer = document.getElementById("webcamContainer");
const startCameraButton = document.getElementById("startCameraButton");
const stopCameraButton = document.getElementById("stopCameraButton");
const uploadActions = document.getElementById("uploadActions");
const cameraActions = document.getElementById("cameraActions");

const soundWrap = document.getElementById("soundWrap");
const soundState = document.getElementById("soundState");
const soundActions = document.getElementById("soundActions");
const startSoundButton = document.getElementById("startSoundButton");
const stopSoundButton = document.getElementById("stopSoundButton");

let activeModel = "image";
const modelState = { image: "loading", sound: "idle" }; // idle, loading, ready, failed

// Image model
let model = null;
let imageLabels = [];
let imageReady = false;
let currentObjectUrl = null;
let webcam = null;
let webcamRunning = false;
let activeInput = "upload";
let animationFrameId = null;
let predictionBusy = false;

// Bumped whenever the camera stops, so startCamera() can tell the user left
// while the permission prompt was still open.
let startToken = 0;

// Bumped whenever results are cleared, so a slow photo prediction can't show
// up after the user has moved on.
let classifyToken = 0;

// Sound model
let soundRecognizer = null;
let soundLabels = [];
let soundListening = false;
let soundStarting = false;
let soundToken = 0; // same idea as startToken, for the microphone

let predictionRows = [];
let lastAnnounced = null;
let lastAnnouncedAt = 0;

// ---- Status line ----

function setStatus(text = "", isError = false) {
  statusLine.textContent = text;
  statusLine.classList.toggle("error", isError);
}

function showModelStatus() {
  const state = modelState[activeModel];
  if (state === "loading") setStatus(LOADING);
  else if (state === "failed") setStatus(loadFailureMessage(activeModel), true);
  else setStatus("");
}

function loadFailureMessage(kind) {
  if (location.protocol === "file:") {
    return "Open this page from a local server, not as a file.";
  }
  const folder = kind === "image" ? "image-model" : "audio-model";
  const name = kind === "image" ? "image" : "audio";
  return `Couldn't load the ${name} model. Check the ${folder} folder.`;
}

function displayName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function joinList(items) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// The empty results area lists what the current model can recognise.
function renderHint() {
  const labels = activeModel === "image"
    ? imageLabels
    : soundLabels.filter((label) => !/^background/i.test(label));
  emptyText.textContent = labels.length
    ? `Recognises ${joinList(labels.map((label) => label.toLowerCase()))}.`
    : "";
}

// ---- Image model ----

async function loadModel() {
  modelState.image = "loading";
  if (activeModel === "image") showModelStatus();
  try {
    if (typeof tmImage === "undefined") {
      throw new Error("The Teachable Machine library did not load. Check your internet connection.");
    }
    model = await tmImage.load(
      `${IMAGE_MODEL_FOLDER}model.json`,
      `${IMAGE_MODEL_FOLDER}metadata.json`
    );
    imageLabels = model.getClassLabels();
    modelState.image = "ready";
    if (activeModel === "image") {
      showModelStatus();
      renderHint();
      if (activeInput === "upload" && imageReady && predictionResults.hidden) classifyPhoto();
    }
  } catch (error) {
    console.error("Could not load the image model:", error);
    modelState.image = "failed";
    if (activeModel === "image") showModelStatus();
  }
}

// ---- Sound model ----

async function loadSoundModel() {
  if (soundRecognizer || modelState.sound === "loading") return;
  modelState.sound = "loading";
  if (activeModel === "sound") showModelStatus();
  try {
    if (typeof speechCommands === "undefined") {
      throw new Error("The sound library did not load. Check your internet connection.");
    }
    // The sound library only accepts full http(s) URLs, not relative paths.
    const folder = new URL(SOUND_MODEL_FOLDER, document.baseURI).href;
    const recognizer = speechCommands.create(
      "BROWSER_FFT",
      undefined,
      `${folder}model.json`,
      `${folder}metadata.json`
    );
    await recognizer.ensureModelLoaded();
    soundRecognizer = recognizer;
    soundLabels = recognizer.wordLabels();
    modelState.sound = "ready";
  } catch (error) {
    console.error("Could not load the sound model:", error);
    modelState.sound = "failed";
  }
  if (activeModel === "sound") {
    if (!soundListening && !soundStarting) showModelStatus();
    renderHint();
  }
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
    showModelStatus();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("This browser can't open the microphone here.", true);
    return;
  }

  const token = ++soundToken;
  soundStarting = true;
  startSoundButton.disabled = true;
  setStatus("Waiting for microphone permission…");

  try {
    await soundRecognizer.listen(
      (result) => {
        if (token !== soundToken) return;
        handleSound(result);
      },
      {
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
    soundState.textContent = "Listening";
    stopSoundButton.disabled = false;
    setStatus("");
  } catch (error) {
    console.error("Could not start the microphone:", error);
    safeStopRecognizer();
    if (token !== soundToken) return;
    startSoundButton.disabled = false;
    setStatus(mediaErrorMessage(error, "microphone"), true);
  } finally {
    soundStarting = false;
  }
}

function stopListening() {
  soundToken++;
  soundListening = false;
  safeStopRecognizer();
  soundState.textContent = "Microphone is off";
  startSoundButton.disabled = false;
  stopSoundButton.disabled = true;
}

function handleSound(result) {
  showPredictions(soundLabels.map((label, index) => ({
    className: label,
    probability: result.scores[index]
  })));
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

// Rows are built once and then updated in place. The camera and microphone
// call this over and over, and rebuilding the list each time would flicker.
function showPredictions(predictions) {
  emptyText.hidden = true;
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
  lowNote.hidden = top.probability >= LOW_CONFIDENCE;
  announce(top);
}

// Screen readers hear the best match when it changes, at most every two seconds.
function announce(top) {
  const now = Date.now();
  if (top.className === lastAnnounced || now - lastAnnouncedAt < 2000) return;
  lastAnnounced = top.className;
  lastAnnouncedAt = now;
  srStatus.textContent =
    `${displayName(top.className)}, ${Math.round(top.probability * 100)} percent`;
}

function clearResults() {
  classifyToken++;
  predictionResults.hidden = true;
  predictionList.replaceChildren();
  predictionRows = [];
  emptyText.hidden = false;
  lastAnnounced = null;
  lastAnnouncedAt = 0;
  srStatus.textContent = "";
}

// ---- Photo ----

function setImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("That file isn't an image.", true);
    return;
  }

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);

  preview.onload = () => {
    imageReady = true;
    clearResults();
    selectInput("upload");
    showModelStatus();
    if (model) classifyPhoto();
  };
  preview.onerror = () => {
    imageReady = false;
    selectInput("upload");
    setStatus("This photo couldn't be opened.", true);
  };
  preview.src = currentObjectUrl;
}

async function classifyPhoto() {
  const token = classifyToken;
  try {
    const predictions = await model.predict(preview);
    if (token !== classifyToken) return;
    showPredictions(predictions);
  } catch (error) {
    console.error("Photo prediction failed:", error);
    if (token === classifyToken) setStatus("Couldn't classify this photo.", true);
  }
}

// ---- Switching models and inputs ----

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
  imageModelTab.setAttribute("aria-selected", String(isImage));
  soundModelTab.setAttribute("aria-selected", String(!isImage));
  methods.classList.toggle("is-off", !isImage);
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
  }
  renderHint();
  showModelStatus();
}

// Photo or camera, image model only.
function selectInput(mode) {
  activeInput = mode;
  const upload = mode === "upload";
  uploadTab.setAttribute("aria-selected", String(upload));
  webcamTab.setAttribute("aria-selected", String(!upload));
  dropzone.hidden = !upload || imageReady;
  previewWrap.hidden = !upload || !imageReady;
  webcamWrap.hidden = upload;
  uploadActions.hidden = !upload || !imageReady;
  cameraActions.hidden = upload;
}

function switchInput(mode) {
  if (mode === activeInput) return;
  stopCamera();
  clearResults();
  selectInput(mode);
  showModelStatus();
}

// ---- Camera and microphone errors ----

function mediaErrorMessage(error, device) {
  const name = error && error.name;
  if (!window.isSecureContext) {
    return `The ${device} needs a secure page. Use HTTPS or localhost.`;
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `${displayName(device)} access is blocked. Allow it in your browser settings, then try again.`;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return `No ${device} found.`;
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return `The ${device} is in use by another app.`;
  }
  return `Couldn't start the ${device}.`;
}

// ---- Camera ----

async function startCamera() {
  if (!model) {
    showModelStatus();
    return;
  }
  if (webcamRunning) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("This browser can't open the camera here.", true);
    return;
  }

  const token = ++startToken;
  let cam = null;

  try {
    setStatus("Waiting for camera permission…");
    startCameraButton.disabled = true;

    cam = new tmImage.Webcam(400, 300, true);
    await cam.setup();
    if (token !== startToken) { cam.stop(); return; }
    await cam.play();
    if (token !== startToken) { cam.stop(); return; }

    webcam = cam;
    webcamContainer.replaceChildren(webcam.canvas);
    webcamRunning = true;
    startCameraButton.disabled = true;
    stopCameraButton.disabled = false;
    setStatus("");
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
    setStatus(mediaErrorMessage(error, "camera"), true);
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
      setStatus("Couldn't classify the camera image. See the console.", true);
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
  startCameraButton.disabled = false;
  stopCameraButton.disabled = true;
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

imageModelTab.addEventListener("click", () => switchModel("image"));
soundModelTab.addEventListener("click", () => switchModel("sound"));
uploadTab.addEventListener("click", () => switchInput("upload"));
webcamTab.addEventListener("click", () => switchInput("webcam"));
startCameraButton.addEventListener("click", startCamera);
stopCameraButton.addEventListener("click", stopCamera);
startSoundButton.addEventListener("click", startListening);
stopSoundButton.addEventListener("click", stopListening);

// Release the camera and microphone when the page is closed.
window.addEventListener("pagehide", () => {
  stopCamera();
  stopListening();
});

loadModel();
