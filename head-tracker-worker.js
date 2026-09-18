// Classic worker keeps MediaPipe's WASM loader off the UI thread.
self.exports = {};
let detector;
try {
  importScripts('vendor/mediapipe/vision_bundle.js?v=4');
  exports.FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', self.location).href)
    .then(files => exports.FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL('vendor/mediapipe/blaze_face_short_range.tflite', self.location).href, delegate: 'CPU' },
      runningMode: 'IMAGE', minDetectionConfidence: .6
    }))
    .then(value => { detector = value; postMessage({ type: 'ready' }); })
    .catch(error => postMessage({ type: 'error', message: String(error.message || error) }));
} catch (error) { postMessage({ type: 'error', message: String(error.message || error) }); }
self.onmessage = ({ data }) => {
  const bitmap = data.bitmap;
  if (!bitmap) return;
  try {
    const result = detector.detect(bitmap);
    const faces = result.detections.map(detection => {
      const b = detection.boundingBox;
      const eyes = detection.keypoints.slice(0, 2).sort((a, b) => a.x - b.x);
      return { x: (b.originX + b.width / 2) / bitmap.width,
        y: (b.originY + b.height / 2) / bitmap.height,
        width: b.width / bitmap.width, height: b.height / bitmap.height,
        angle: Math.atan2((eyes[1].y - eyes[0].y) * bitmap.height, (eyes[1].x - eyes[0].x) * bitmap.width) };
    });
    postMessage({ type: 'faces', faces });
  } catch (error) { postMessage({ type: 'error', message: String(error.message || error) }); }
  finally { bitmap.close(); }
};
