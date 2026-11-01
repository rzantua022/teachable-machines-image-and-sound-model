// Teachable Machine image model.
// model.json, metadata.json and weights.bin are looked for in ./model/ first,
// then next to index.html. Relative paths, so it works on GitHub Pages.
const MODEL_FOLDERS = ["./model/", "./"];

// Below this confidence the result panel adds a "not sure" note.
const LOW_CONFIDENCE = 0.6;

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
const predictionResults = document.getElementById("predictionResults");
const predictionList = document.getElementById("predictionList");
const bestName = document.getElementById("bestName");
const bestPercent = document.getElementById("bestPercent");
const lowNote = document.getElementById("lowNote");
const srStatus = document.getElementById("srStatus");

const uploadTab = document.getElementById("uploadTab");
const webcamTab = document.getElementById("webcamTab");
const webcamWrap = document.getElementById("webcamWrap");
const webcamContainer = document.getElementById("webcamContainer");
const liveBadge = document.getElementById("liveBadge");
const startCameraButton = document.getElementById("startCameraButton");
const stopCameraButton = document.getElementById("stopCameraButton");
const uploadActions = document.getElementById("uploadActions");
const cameraActions = document.getElementById("cameraActions");

// Camera messages use the same status line as everything else.
const cameraNote = inputMessage;

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

let predictionRows = [];
let lastAnnounced = null;
let lastAnnouncedAt = 0;

async function loadFromFolders() {
  let lastError = null;
  for (const folder of MODEL_FOLDERS) {
    try {
      return await tmImage.load(`${folder}model.json`, `${folder}metadata.json`);
    } catch (error) {
      console.warn(`No model in ${folder}`, error);
      lastError = error;
    }
  }
  throw lastError;
}

async function loadModel() {
  try {
    modelStatus.textContent = "Loading model…";
    if (typeof tmImage === "undefined") {
      throw new Error("The Teachable Machine library did not load. Check your internet connection.");
    }
    model = await loadFromFolders();
    modelStatus.textContent = "Model ready";
    statusDot.parentElement.classList.add("ready");
    if (activeInput === "upload") {
      inputMessage.textContent = "Model loaded. Choose a photo of a finger or use your camera.";
    }
    updateButton();
  } catch (error) {
    console.error("Could not load Teachable Machine model:", error);
    modelFailed = true;
    modelStatus.textContent = "Model not loaded";
    statusDot.parentElement.classList.add("failed");
    inputMessage.textContent = location.protocol === "file:"
      ? "Open this page through a web server (VS Code Live Server, or python -m http.server). Double-clicking index.html can't load the model."
      : "Couldn't load the model. Put model.json, metadata.json and weights.bin in a folder named model next to index.html, then reload. Press F12 and open Console for details.";
  }
}

function updateButton() {
  predictButton.disabled = !(model && imageReady && activeInput === "upload");
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

// The rows are built once and then updated in place. Webcam mode calls this
// every frame, and rebuilding the list each time would make the bars flicker.
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
    parts.name.textContent = prediction.className;
    parts.value.textContent = `${percent}%`;
    parts.fill.style.width = `${percent}%`;
    parts.row.style.order = rank;
    parts.row.classList.toggle("is-top", rank === 0);
  });

  const top = predictions[ranking[0]];
  bestName.textContent = top.className;
  bestPercent.textContent = `${formatPercent(top.probability)}%`;
  lowNote.hidden = top.probability >= LOW_CONFIDENCE;

  announce(top);
}

// Screen readers get the best match, not every frame. For the camera that
// means only when it changes, and no more than once every two seconds.
function announce(top) {
  const now = Date.now();
  const changed = top.className !== lastAnnounced;
  if (!changed || now - lastAnnouncedAt < 2000) return;
  lastAnnounced = top.className;
  lastAnnouncedAt = now;
  srStatus.textContent =
    `Best match: ${top.className}, ${Math.round(top.probability * 100)} percent.`;
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

// ---- Input switching ----

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
        ? "The model could not be loaded. Check the model folder."
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

// ---- Camera ----

function cameraErrorMessage(error) {
  const name = error && error.name;
  if (!window.isSecureContext) {
    return "The camera only works on a secure page. Open the site over HTTPS, or from localhost.";
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is blocked. Allow the camera for this site in your browser settings, then press Start camera again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is being used by another app. Close it and try again.";
  }
  return "The camera could not be started. Check your browser's camera permission and try again.";
}

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
    startCameraButton.disabled = false;
    cameraNote.textContent = cameraErrorMessage(error);
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

// ---- Reset ----

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
    : "Add your exported model to the model folder.";
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

uploadTab.addEventListener("click", () => switchInput("upload"));
webcamTab.addEventListener("click", () => switchInput("webcam"));
startCameraButton.addEventListener("click", startCamera);
stopCameraButton.addEventListener("click", stopCamera);
resetButton.addEventListener("click", resetPage);

// Release the camera when the page is closed or navigated away from.
window.addEventListener("pagehide", stopCamera);

loadModel();
