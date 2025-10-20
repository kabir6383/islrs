// ai_model_fixed.js
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

let model = null;
let modelType = null; // "layers" | "graph"
let labels = null;
let INPUT_SIZE = 64; // default fallback

// --------------------- LOAD MODEL + LABELS ---------------------
export async function loadModelAndLabels() {
  if (model && labels) return { model, labels, modelType, INPUT_SIZE };

  const modelUrl = "/model/model.json";
  const labelsUrl = "/model/labels.json";

  await tf.setBackend("webgl");
  await tf.ready();

  try {
    console.log("[ai_model] Checking model format:", modelUrl);
    const res = await fetch(modelUrl);
    if (!res.ok) throw new Error(`Model fetch failed: ${res.status}`);
    const json = await res.json();

    // Auto-detect model format
    if (json.format && json.format.toLowerCase().includes("graph")) {
      console.log("[ai_model] Detected GraphModel");
      model = await tf.loadGraphModel(modelUrl);
      modelType = "graph";
    } else {
      console.log("[ai_model] Detected LayersModel");
      model = await tf.loadLayersModel(modelUrl);
      modelType = "layers";
    }

    // Get input shape
    const inputShape = model.inputs?.[0]?.shape;
    if (inputShape && inputShape.length >= 3) {
      const [, h, w] = inputShape;
      INPUT_SIZE = Math.max(1, Math.min(h || INPUT_SIZE, w || INPUT_SIZE));
    }

    console.log(`[ai_model] Model loaded (${modelType}). INPUT_SIZE=${INPUT_SIZE}`);
  } catch (e) {
    console.error("[ai_model] Failed to load model:", e);
    throw new Error(`Failed to load model from ${modelUrl}: ${e.message}`);
  }

  // Load labels
  try {
    const res = await fetch(labelsUrl);
    if (!res.ok) throw new Error(`labels fetch status ${res.status}`);
    const json = await res.json();
    labels = Array.isArray(json) ? json : Object.values(json);
    console.log(`[ai_model] Labels loaded: ${labels.length}`);
  } catch (e) {
    console.warn("[ai_model] Failed to load labels:", e);
    labels = [];
  }

  return { model, labels, modelType, INPUT_SIZE };
}

// --------------------- INPUT BUILDERS ---------------------
function getVideoOrDataURL(input) {
  if (!input) return null;
  if (typeof input === "string" && input.startsWith("data:image"))
    return { type: "dataurl", data: input };
  if (typeof input.getScreenshot === "function") {
    const data = input.getScreenshot();
    return data ? { type: "dataurl", data } : null;
  }
  if (input instanceof HTMLVideoElement) return { type: "video", data: input };
  if (input.video && input.video instanceof HTMLVideoElement)
    return { type: "video", data: input.video };
  return null;
}

async function makeInputTensorFromDataURL(dataURL, size) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = dataURL;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      const tensor = tf.browser
        .fromPixels(canvas)
        .toFloat()
        .div(255.0)
        .expandDims(0);
      resolve(tensor);
    };
    img.onerror = (e) => {
      console.error("[ai_model] Image load error:", e);
      resolve(null);
    };
  });
}

function makeInputTensorFromVideo(videoEl, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, size, size);
  return tf.browser.fromPixels(canvas).toFloat().div(255.0).expandDims(0);
}

function normalizeOutput(out) {
  if (!out) return null;
  if (out instanceof tf.Tensor) return out;
  if (Array.isArray(out)) return out[0];
  if (typeof out === "object") {
    const k = Object.keys(out)[0];
    return out[k];
  }
  return null;
}

// --------------------- MAIN PREDICTION FUNCTION ---------------------
export async function recognizeSign(input) {
  const { model, labels, modelType, INPUT_SIZE } = await loadModelAndLabels();
  if (!model) throw new Error("Model not loaded");

  const src = getVideoOrDataURL(input);
  if (!src) throw new Error("Invalid input (no camera or frame)");

  let tensor = null;
  try {
    tensor =
      src.type === "dataurl"
        ? await makeInputTensorFromDataURL(src.data, INPUT_SIZE)
        : makeInputTensorFromVideo(src.data, INPUT_SIZE);

    if (!tensor) throw new Error("Failed to build input tensor");

    let out;
    if (modelType === "layers") {
      out = model.predict(tensor);
    } else {
      const inputs = model.inputs || [];
      const name = inputs?.[0]?.name?.split(":")[0];
      if (name) out = await model.executeAsync({ [name]: tensor });
      else out = await model.executeAsync(tensor);
    }

    const logits = normalizeOutput(out);
    if (!logits) throw new Error("Model output invalid");

    const vals = Array.from(await logits.data());
    const idx = vals.indexOf(Math.max(...vals));
    const label = labels?.[idx] || "Unknown";

    tensor.dispose();
    logits.dispose?.();
    if (Array.isArray(out)) out.forEach((o) => o?.dispose?.());

    return { label, index: idx, scores: vals };
  } catch (e) {
    if (tensor) tensor.dispose();
    console.error("[ai_model] recognizeSign error:", e);
    throw e;
  }
}