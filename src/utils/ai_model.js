import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import model from "../../public/model/model.json";
import labels from "../../public/model/labels.json";
let model = null;
let modelType = null; // "layers" | "graph"
let labels = null;
let INPUT_SIZE = 84; // fallback

async function loadModelAndLabels() {
  if (!model) {
    try {
      console.log("[ai_model] trying tf.loadLayersModel('/model/model.json') ...");
      model = await tf.loadLayersModel("/model/model.json");
      modelType = "layers";
      console.log("[ai_model] loaded LayersModel");
    } catch (errLayers) {
      console.warn("[ai_model] loadLayersModel failed, trying loadGraphModel:", errLayers);
      try {
        model = await tf.loadGraphModel("/model/model.json");
        modelType = "graph";
        console.log("[ai_model] loaded GraphModel");
      } catch (errGraph) {
        console.error("[ai_model] failed to load model with both loaders:", errGraph);
        throw errGraph;
      }
    }

    try {
      const shape = model.inputs?.[0]?.shape || model.inputs?.[0]?.dim;
      if (Array.isArray(shape)) {
        const maybeH = shape[1] || shape[0];
        const maybeW = shape[2] || shape[1];
        if (maybeH && maybeW && maybeH === maybeW) INPUT_SIZE = maybeH;
        else if (maybeH) INPUT_SIZE = maybeH;
        console.log("[ai_model] inferred input shape:", shape, "using INPUT_SIZE=", INPUT_SIZE);
      }
    } catch (e) {
      console.warn("[ai_model] could not infer input size, using fallback", INPUT_SIZE, e);
    }
  }

  if (!labels) {
    try {
      console.log("[ai_model] loading labels from /model/labels.json ...");
      const res = await fetch("/model/labels.json");
      if (!res.ok) throw new Error("labels.json fetch failed: " + res.status);
      const json = await res.json();
      labels = Array.isArray(json) ? json : Object.values(json);
      console.log("[ai_model] labels loaded:", labels);
    } catch (err) {
      console.error("[ai_model] failed to load labels:", err);
      labels = [];
    }
  }

  return { model, labels, modelType, INPUT_SIZE };
}

export function preprocessImage(imageDataURL) {
  return new Promise((resolve) => {
    if (!imageDataURL || !imageDataURL.startsWith("data:image")) {
      console.error("[ai_model] preprocessImage: invalid imageDataURL");
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageDataURL;
    img.onload = () => {
      const size = INPUT_SIZE || 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const { width: iw, height: ih } = img;
      const scale = Math.max(size / iw, size / ih);
      const sw = iw * scale;
      const sh = ih * scale;
      const dx = (size - sw) / 2;
      const dy = (size - sh) / 2;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, dx, dy, sw, sh);

      let tensor = tf.browser.fromPixels(canvas).toFloat().div(tf.scalar(255.0));
      tensor = tensor.expandDims(0); // [1,H,W,C]
      resolve(tensor);
    };
    img.onerror = (e) => {
      console.error("[ai_model] image load error", e);
      resolve(null);
    };
  });
}

function normalizeExecuteOutput(out) {
  // out can be Tensor, Array<Tensor>, or Object<string, Tensor>
  if (!out) return null;
  if (out instanceof tf.Tensor) return out;
  if (Array.isArray(out) && out.length > 0) return out[0];
  if (typeof out === "object") {
    const firstKey = Object.keys(out)[0];
    return out[firstKey];
  }
  return null;
}

export async function recognizeSign(imageDataURL) {
  console.log("[ai_model] recognizeSign called");
  await loadModelAndLabels();
  if (!model) throw new Error("Model not loaded");

  const tensor = await preprocessImage(imageDataURL);
  if (!tensor) throw new Error("Failed to build tensor from image");

  try {
    let out;
    if (modelType === "layers") {
      out = model.predict(tensor);
    } else {
      // GraphModel: try multiple input formats (full name, no suffix) and tensor/direct
      console.log("[ai_model] graph model inputs:", model.inputs);
      const inputs = model.inputs || [];
      let executed = false;
      let lastErr = null;

      if (inputs.length >= 1) {
        const fullName = inputs[0].name; // may include :0
        const noSuffix = fullName ? fullName.split(":")[0] : null;
        const tryNames = [fullName, noSuffix].filter(Boolean);

        for (const name of tryNames) {
          try {
            out = await model.executeAsync({ [name]: tensor });
            executed = true;
            console.log("[ai_model] executeAsync succeeded with input name:", name);
            break;
          } catch (e) {
            lastErr = e;
            console.warn("[ai_model] executeAsync with name failed:", name, e);
          }
        }
      }

      if (!executed) {
        try {
          // try passing tensor directly
          out = await model.executeAsync(tensor);
          executed = true;
          console.log("[ai_model] executeAsync succeeded by passing tensor directly");
        } catch (e) {
          lastErr = e;
          console.warn("[ai_model] executeAsync(tensor) failed:", e);
        }
      }

      if (!executed) {
        // final attempt: try execute (sync) with same strategies
        try {
          if (model.execute) out = model.execute(tensor);
          else throw lastErr || new Error("executeAsync failed and no execute available");
          executed = true;
          console.log("[ai_model] execute(...) succeeded");
        } catch (e) {
          console.error("[ai_model] all graph execute attempts failed", e);
          if (tensor) tensor.dispose();
          throw e;
        }
      }
    }

    const logits = normalizeExecuteOutput(out);
    if (!logits) throw new Error("Model output is empty or in unexpected format");

    const values = await logits.data();
    const scores = Array.from(values);
    console.log("[ai_model] raw scores:", scores);
    const maxIndex = scores.indexOf(Math.max(...scores));
    const label = labels && labels[maxIndex] !== undefined ? labels[maxIndex] : "Unknown";

    // cleanup
    tensor.dispose();
    if (logits.dispose) logits.dispose();
    if (Array.isArray(out)) out.forEach(t => t && t.dispose && t.dispose());

    return { label, index: maxIndex, scores };
  } catch (err) {
    console.error("[ai_model] predict/execute error", err);
    if (tensor) tensor.dispose();
    throw err;
  }
}