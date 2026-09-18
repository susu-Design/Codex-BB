# Rage effects local prototype

Local preview: http://localhost:4174/ (server.cjs with PORT=4174).
Direct VFX audition: http://localhost:4174/?preview=vfx
Do not publish or push without a new request.

Implemented:
- rage.js and rage.css: independent per-person four-segment game meters.
- Every two received hehe/question/applause cards add 25 points to recipient.
- Two distinct local voice peaks add 25 to speaker. RMS must exceed .14 for
  100 ms; rearm requires 500 ms below .065; peak cooldown is 1500 ms.
- 25: smoke; 50/75: flame aura; 100: 1.8-second purple lightning burst then aura.
- First voice peak gives a brief smoke cue without adding a whole segment.
- Own values synchronize over PeerJS; receiver owns its card increments.
- Three GIF cards remain independent of the procedural effects.
- Demo controls are in the room under the expandable rage rules panel.

Limitations / remaining work:
- VFX now use rage-painter.js: transparent Canvas layers with curled smoke,
  nested flame ribbons, embers, aura contours, orbiting streaks and branching
  lightning. The center face area is softly cleared. The user rejected this
  procedural art quality and wants the reference animation quality exactly.
  Do not keep adding procedural detail and claim it matches. Requested original
  downloadable animation/transparent assets; screen recordings are not clean VFX.
- Camera tiles now use local MediaPipe 0.10.21 FaceDetector in a worker. Detected
  head location, size and eye-line roll drive the painter transform. Cover-crop
  and CSS mirroring are accounted for. Missing face fades out within 650ms.
  Placeholder illustrations remain fixed. This is not full-body segmentation.
- Demo-only audition controls switch 0/25/50/100 without microphone use.
- Renderer caps pixel ratio at 2 and targets 30fps; disposes on rerender/navigation,
  skips hidden documents, and respects reduced motion. Real-device FPS unmeasured.
- No live transcription or real AI language classifier is connected. Manual
  text regex tests are explicitly labeled non-AI and deduplicate normalized text.
- No decay or resource-spending rule yet; demo reset starts at zero.
- Real two-device camera/audio session has not been retested for these changes.
- Further visual polish and model/transcript integration can continue later.

Verified with local Chrome automation:
- Two-card accumulation, distinct peaks vs sustained loudness, pause behavior.
- Remote value ordering, text deduplication, effects switch, stable stage bounds.
- Desktop 1280px and mobile 390px, no horizontal overflow or JS exceptions.
- Canvas tier animation changes, stable bounds, disposal of old renderers,
  fully transparent zero tier and static reduced-motion rendering verified.
- Actual WASM model tested with the official portrait fixture on a canvas video:
  lateral movement, size changes, mirror mapping, face loss, worker cleanup pass.
  Test fixture is only in /private/tmp, not shipped. User webcam has not been
  accessed or tested. Detection library and model are vendored locally; no
  camera image is sent to an inference service.

User requested a one-time follow-up at 02:30 Asia/Shanghai. A thread heartbeat
named '继续制作吵架助手怒气特效' was created (id automation). It should inspect
current state, continue outstanding work, then pause itself. Do not redeem
usage credits: none were authorized.
