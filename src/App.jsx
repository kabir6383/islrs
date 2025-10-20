import React, { useRef, useState } from "react";
import CameraView from "./components/CameraView";
import RecognizeButton from "./components/RecognizeButton";
import RotateButton from "./components/RotateButton";
import { recognizeSign } from "./utils/ai_model";
import "./index.css";


export default function App() {
  const [cameraStarted, setCameraStarted] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [currentGesture, setCurrentGesture] = useState("Show a gesture to the camera");
  const [recognizing, setRecognizing] = useState(false);

  const webcamRef = useRef(null);

  const handleStartCamera = () => {
    setCameraStarted(true);
  };

  const handleRecognize = async () => {
    setRecognizing(true);
    try {
      // Assuming recognizeSign is an async function that takes the webcam ref
      const result = await recognizeSign(webcamRef.current);
      const label = result && (result.label ?? result) ? (result.label ?? result) : "Unknown";
      setRecognizedText(label);
      setCurrentGesture("Recognized: " + label);
    } catch (err) {
      console.error("Recognition error (full):", err);
      // show useful error to user
      const msg = err && err.message ? err.message : JSON.stringify(err);
      setRecognizedText("Recognition error: " + msg);
    } finally {
      setRecognizing(false);
    }
  };

  const handleReset = () => {
    setCameraStarted(false);
    setRecognizedText("");
    setCurrentGesture("Show a gesture to the camera");
    setRecognizing(false);
  };

  return (
    <div className="app-container">
      <div className="main-content">
        {/* Camera Panel */}
        <div className="camera-panel">
          {!cameraStarted ? (
            <div className="camera-ready">
              <div className="icon">📷</div>
              <h2>Camera Ready</h2>
              <p>Click start to begin gesture recognition</p>
              <button
                className="button-primary"
                onClick={handleStartCamera}
              >
                Start Camera
              </button>
            </div>
          ) : (
            <div className="camera-stream">
              <CameraView ref={webcamRef} facingMode="user" />
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className="side-panel">
          {/* Current Gesture Card */}
          <div className="current-gesture-card">
            <div className="label">Current Gesture</div>
            <div className="text">{currentGesture}</div>
          </div>
          {/* Recognized Text Area */}
          <div className="recognized-text-area">
            <div className="label">Recognized Text</div>
            <textarea
              readOnly
              value={recognizedText}
              placeholder="Recognized gestures will appear here..."
            />
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="controls-bar">
        <div className="label">Controls</div>
        <div className="controls-container">
          <button
            className="button-recognize"
            onClick={handleRecognize}
            disabled={!cameraStarted || recognizing}
          >
            <span className="inline-icon">▶</span> Start Recognition
          </button>
          <button
            className="button-reset"
            title="Reset"
            onClick={handleReset}
          >
            <svg viewBox="0 0 20 20" fill="none">
              <path
                d="M10 3v4h4M17 9.7a7 7 0 1 1-2.1-5.1"
                stroke="white"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};