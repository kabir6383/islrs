
import React, { forwardRef } from "react";
import Webcam from "react-webcam";

const CameraView = forwardRef(({ facingMode = "user" }, ref) => (
  <div className="w-96 h-72 rounded-lg overflow-hidden border shadow-lg">
    <Webcam
      audio={false}
      ref={ref}
      screenshotFormat="image/jpeg"
      videoConstraints={{
        facingMode: facingMode
      }}
      className="w-full h-full object-cover"
    />
  </div>
));
export default CameraView;
