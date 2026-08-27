import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";

import {
  BlinkCounter,
  LEFT_EYE,
  RIGHT_EYE,
  calibratedThreshold,
  estimatedBlinksPerMinute,
  eyeAspectRatio,
} from "./blink-core.mjs";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const ANALYSIS_INTERVAL_MS = 66;
const CALIBRATION_SAMPLE_TARGET = 36;

const questionnaireSection = document.getElementById("questionnaire-section");
const questionnaireForm = document.getElementById("questionnaire-form");
const questionnaireSummary = document.getElementById("questionnaire-summary");
const monitorSection = document.getElementById("monitor-section");
const summarySection = document.getElementById("summary-section");
const steps = [...document.querySelectorAll(".steps li")];

const video = document.getElementById("camera");
const overlay = document.getElementById("overlay");
const overlayContext = overlay.getContext("2d");
const cameraPlaceholder = document.getElementById("camera-placeholder");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const calibrationPanel = document.getElementById("calibration");
const calibrationProgress = document.getElementById("calibration-progress");
const calibrationLabel = document.getElementById("calibration-label");

const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const restartButton = document.getElementById("restart-button");
const newSessionButton = document.getElementById("new-session-button");
const newQuestionnaireButton = document.getElementById("new-questionnaire-button");

const blinkCount = document.getElementById("blink-count");
const earValue = document.getElementById("ear-value");
const thresholdValue = document.getElementById("threshold-value");
const blinkRate = document.getElementById("blink-rate");
const sessionTime = document.getElementById("session-time");
const eyeState = document.getElementById("eye-state");
const chart = document.getElementById("blink-chart");

const summaryBlinks = document.getElementById("summary-blinks");
const summaryRate = document.getElementById("summary-rate");
const summaryDuration = document.getElementById("summary-duration");
const careTip = document.querySelector("#care-tip p");

let questionnaire = null;
let faceLandmarker = null;
let modelPromise = null;
let mediaStream = null;
let running = false;
let animationFrame = null;
let sessionStartedAt = null;
let stoppedAt = null;
let lastInferenceAt = -Infinity;
let lastVideoTime = -1;
let lastChartSampleAt = -Infinity;
let calibrationSamples = [];
let counter = null;
let chartSamples = [{ seconds: 0, blinks: 0 }];

function setStep(activeStep) {
  steps.forEach((step) => {
    step.classList.toggle("is-active", Number(step.dataset.step) === activeStep);
  });
}

function setStatus(message, tone = "idle") {
  statusText.textContent = message;
  statusDot.className = "status-dot";
  if (tone !== "idle") {
    statusDot.classList.add(`is-${tone}`);
  }
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function resetMetrics() {
  counter = null;
  calibrationSamples = [];
  chartSamples = [{ seconds: 0, blinks: 0 }];
  sessionStartedAt = null;
  stoppedAt = null;
  lastInferenceAt = -Infinity;
  lastVideoTime = -1;
  lastChartSampleAt = -Infinity;
  blinkCount.textContent = "0";
  earValue.textContent = "—";
  thresholdValue.textContent = "—";
  blinkRate.textContent = "0.0";
  sessionTime.textContent = "00:00";
  eyeState.textContent = "尚未偵測";
  calibrationProgress.value = 0;
  calibrationLabel.textContent = "請自然睜眼並看向鏡頭";
  drawBlinkChart();
}

function questionnaireDescription(data) {
  return `${data.screenTime}螢幕時間・乾澀：${data.dryness}`;
}

function buildCareTip() {
  const needsMoreBreaks = questionnaire?.breakHabit === "想到才休息"
    || questionnaire?.breakHabit === "幾乎不休息";
  const reportsDryness = questionnaire?.dryness === "經常"
    || questionnaire?.dryness === "幾乎每天";

  if (needsMoreBreaks && reportsDryness) {
    return "你填寫的問卷顯示休息較少且常感乾澀。建議設定固定休息提醒、刻意完整眨眼；若不適持續，請諮詢眼科專業人員。";
  }
  if (needsMoreBreaks) {
    return "可以嘗試 20-20-20 原則：每 20 分鐘，看向約 20 英尺外至少 20 秒，並在休息時刻意完整眨眼。";
  }
  if (reportsDryness) {
    return "即使已有休息習慣，仍可留意空調、風扇與長時間凝視造成的乾澀；若症狀持續，請諮詢眼科專業人員。";
  }
  return "繼續維持規律休息、適當觀看距離與完整眨眼。這次紀錄只反映短時間的展示結果。";
}

async function createLandmarker(delegate) {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

function loadLandmarker() {
  if (faceLandmarker) {
    return Promise.resolve(faceLandmarker);
  }
  if (!modelPromise) {
    modelPromise = createLandmarker("GPU")
      .catch(() => createLandmarker("CPU"))
      .then((landmarker) => {
        faceLandmarker = landmarker;
        return landmarker;
      })
      .catch((error) => {
        modelPromise = null;
        throw error;
      });
  }
  return modelPromise;
}

function releaseCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  video.srcObject = null;
}

function clearOverlay() {
  overlayContext.clearRect(0, 0, overlay.width, overlay.height);
}

function drawEye(landmarks, indices, color) {
  const points = indices.map((index) => landmarks[index]);
  overlayContext.beginPath();
  points.forEach((point, index) => {
    const x = point.x * overlay.width;
    const y = point.y * overlay.height;
    if (index === 0) {
      overlayContext.moveTo(x, y);
    } else {
      overlayContext.lineTo(x, y);
    }
  });
  overlayContext.closePath();
  overlayContext.strokeStyle = color;
  overlayContext.lineWidth = Math.max(2, overlay.width / 420);
  overlayContext.stroke();

  overlayContext.fillStyle = color;
  points.forEach((point) => {
    overlayContext.beginPath();
    overlayContext.arc(
      point.x * overlay.width,
      point.y * overlay.height,
      Math.max(2.5, overlay.width / 260),
      0,
      Math.PI * 2,
    );
    overlayContext.fill();
  });
}

function drawLandmarks(landmarks, isClosed) {
  clearOverlay();
  const color = isClosed ? "#ffb14e" : "#4de0c8";
  drawEye(landmarks, LEFT_EYE, color);
  drawEye(landmarks, RIGHT_EYE, color);
}

function updateMetrics(ear, now, state = "unknown") {
  const total = counter?.totalBlinks ?? 0;
  const elapsed = sessionStartedAt === null ? 0 : now - sessionStartedAt;
  blinkCount.textContent = String(total);
  earValue.textContent = Number.isFinite(ear) ? ear.toFixed(3) : "—";
  thresholdValue.textContent = counter ? counter.threshold.toFixed(3) : "—";
  blinkRate.textContent = estimatedBlinksPerMinute(total, sessionStartedAt ?? now, now).toFixed(1);
  sessionTime.textContent = formatDuration(elapsed);
  eyeState.textContent = state === "closed" ? "眼睛閉合" : state === "open" ? "眼睛張開" : "等待臉部";
}

function addChartSample(now) {
  if (sessionStartedAt === null || now - lastChartSampleAt < 1_000) {
    return;
  }
  lastChartSampleAt = now;
  chartSamples.push({
    seconds: (now - sessionStartedAt) / 1_000,
    blinks: counter?.totalBlinks ?? 0,
  });
  drawBlinkChart();
}

function drawBlinkChart() {
  const context = chart.getContext("2d");
  const { width, height } = chart;
  const padding = { top: 22, right: 24, bottom: 42, left: 48 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const lastSample = chartSamples.at(-1) ?? { seconds: 0, blinks: 0 };
  const maximumSeconds = Math.max(10, lastSample.seconds);
  const maximumBlinks = Math.max(5, ...chartSamples.map((sample) => sample.blinks));

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.font = "15px Segoe UI, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let line = 0; line <= 5; line += 1) {
    const ratio = line / 5;
    const y = padding.top + graphHeight * ratio;
    const value = Math.round(maximumBlinks * (1 - ratio));
    context.strokeStyle = "#e4ecea";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillStyle = "#6d8184";
    context.fillText(String(value), padding.left - 10, y);
  }

  const xFor = (seconds) => padding.left + (seconds / maximumSeconds) * graphWidth;
  const yFor = (blinks) => padding.top + graphHeight - (blinks / maximumBlinks) * graphHeight;

  context.strokeStyle = "#168f82";
  context.lineWidth = 4;
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(xFor(chartSamples[0].seconds), yFor(chartSamples[0].blinks));
  for (let index = 1; index < chartSamples.length; index += 1) {
    const previous = chartSamples[index - 1];
    const current = chartSamples[index];
    context.lineTo(xFor(current.seconds), yFor(previous.blinks));
    context.lineTo(xFor(current.seconds), yFor(current.blinks));
  }
  context.stroke();

  context.fillStyle = "#6d8184";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText(`時間（秒） 0 – ${Math.ceil(maximumSeconds)}`, padding.left + graphWidth / 2, height - 12);
}

function finishCalibration() {
  if (calibrationSamples.length < 12) {
    calibrationSamples = [];
    calibrationProgress.value = 0;
    calibrationLabel.textContent = "偵測不穩定，請保持自然睜眼";
    return;
  }

  const threshold = calibratedThreshold(calibrationSamples);
  counter = new BlinkCounter({ threshold, minimumClosedFrames: 2, maximumClosedMs: 1_500 });
  calibrationPanel.hidden = true;
  thresholdValue.textContent = threshold.toFixed(3);
  setStatus("偵測中：請自然眨眼", "live");
}

function processFace(landmarks, now) {
  const leftEar = eyeAspectRatio(landmarks, LEFT_EYE, video.videoWidth, video.videoHeight);
  const rightEar = eyeAspectRatio(landmarks, RIGHT_EYE, video.videoWidth, video.videoHeight);
  const ear = (leftEar + rightEar) / 2;

  if (!counter) {
    if (ear > 0.08 && ear < 0.8) {
      calibrationSamples.push(ear);
    }
    const progress = Math.min(100, (calibrationSamples.length / CALIBRATION_SAMPLE_TARGET) * 100);
    calibrationProgress.value = progress;
    calibrationLabel.textContent = `已收集 ${calibrationSamples.length} / ${CALIBRATION_SAMPLE_TARGET} 個樣本`;
    drawLandmarks(landmarks, false);
    updateMetrics(ear, now, "open");
    setStatus("校正中：請自然睜眼並看向鏡頭", "warning");
    if (calibrationSamples.length >= CALIBRATION_SAMPLE_TARGET) {
      finishCalibration();
    }
    return;
  }

  const event = counter.update(ear, now);
  drawLandmarks(landmarks, event.state === "closed");
  updateMetrics(ear, now, event.state);
}

function handleDetectionFailure(error) {
  console.error("Face landmark detection failed:", error);
  running = false;
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
  }
  releaseCamera();
  cameraPlaceholder.hidden = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  calibrationPanel.hidden = true;
  setStatus("偵測發生錯誤，請重新整理後再試一次", "error");
}

function renderLoop(now) {
  if (!running) {
    return;
  }

  if (sessionStartedAt !== null) {
    sessionTime.textContent = formatDuration(now - sessionStartedAt);
  }

  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    && video.currentTime !== lastVideoTime
    && now - lastInferenceAt >= ANALYSIS_INTERVAL_MS
  ) {
    lastVideoTime = video.currentTime;
    lastInferenceAt = now;
    try {
      const result = faceLandmarker.detectForVideo(video, now);
      const landmarks = result.faceLandmarks[0];
      if (landmarks) {
        processFace(landmarks, now);
      } else {
        counter?.resetPartial();
        clearOverlay();
        updateMetrics(Number.NaN, now, "unknown");
        setStatus("未偵測到臉部，請面向鏡頭", "warning");
      }
      addChartSample(now);
    } catch (error) {
      handleDetectionFailure(error);
      return;
    }
  }

  animationFrame = requestAnimationFrame(renderLoop);
}

async function startSession() {
  if (running) {
    return;
  }
  if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    setStatus("鏡頭需要 HTTPS 或 localhost 才能使用", "error");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("此瀏覽器不支援鏡頭存取", "error");
    return;
  }

  startButton.disabled = true;
  summarySection.hidden = true;
  resetMetrics();
  calibrationPanel.hidden = false;
  setStep(2);

  try {
    setStatus("正在載入臉部 landmark 模型…", "warning");
    await loadLandmarker();
    setStatus("等待鏡頭權限…", "warning");
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    video.srcObject = mediaStream;
    await video.play();
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    cameraPlaceholder.hidden = true;
    stopButton.disabled = false;
    running = true;
    sessionStartedAt = performance.now();
    lastChartSampleAt = sessionStartedAt;
    setStatus("校正中：請自然睜眼並看向鏡頭", "warning");
    animationFrame = requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error("Unable to start the demo:", error);
    releaseCamera();
    startButton.disabled = false;
    stopButton.disabled = true;
    calibrationPanel.hidden = true;
    const denied = error?.name === "NotAllowedError";
    setStatus(denied ? "鏡頭權限未開啟，請允許後再試" : "無法啟動鏡頭或模型，請稍後再試", "error");
  }
}

function stopSession(showSummary = true) {
  const now = performance.now();
  if (sessionStartedAt !== null) {
    stoppedAt = now;
    addChartSample(now);
  }
  running = false;
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  releaseCamera();
  clearOverlay();
  cameraPlaceholder.hidden = false;
  calibrationPanel.hidden = true;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStatus("鏡頭已關閉", "idle");

  if (!showSummary || sessionStartedAt === null) {
    return;
  }

  const elapsed = now - sessionStartedAt;
  const total = counter?.totalBlinks ?? 0;
  summaryBlinks.textContent = String(total);
  summaryRate.textContent = estimatedBlinksPerMinute(total, sessionStartedAt, now).toFixed(1);
  summaryDuration.textContent = formatDuration(elapsed);
  careTip.textContent = buildCareTip();
  summarySection.hidden = false;
  setStep(3);
  summarySection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showQuestionnaire() {
  if (running || mediaStream) {
    stopSession(false);
  }
  questionnaire = null;
  questionnaireForm.reset();
  questionnaireSection.hidden = false;
  monitorSection.hidden = true;
  summarySection.hidden = true;
  resetMetrics();
  setStep(1);
  questionnaireSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

questionnaireForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!questionnaireForm.reportValidity()) {
    return;
  }
  const data = Object.fromEntries(new FormData(questionnaireForm));
  delete data.consent;
  questionnaire = data;
  questionnaireSummary.textContent = questionnaireDescription(data);
  questionnaireSection.hidden = true;
  monitorSection.hidden = false;
  summarySection.hidden = true;
  setStep(2);
  monitorSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

startButton.addEventListener("click", startSession);
stopButton.addEventListener("click", () => stopSession(true));
restartButton.addEventListener("click", showQuestionnaire);
newQuestionnaireButton.addEventListener("click", showQuestionnaire);
newSessionButton.addEventListener("click", () => {
  summarySection.hidden = true;
  setStep(2);
  monitorSection.scrollIntoView({ behavior: "smooth", block: "start" });
  startSession();
});

window.addEventListener("pagehide", () => {
  running = false;
  releaseCamera();
});

resetMetrics();
