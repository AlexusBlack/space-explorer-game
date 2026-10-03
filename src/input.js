// Pointer-based pan/zoom camera controls. No gesture library (see docs/ui-ux-spec.md).

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

// A tap is a pointerdown->pointerup with little movement and not too much
// time in between — anything else (drag, pinch) is not a tap.
const TAP_MOVE_THRESHOLD = 10;
const TAP_TIME_THRESHOLD = 500;

export function attachCameraControls(canvas, camera, onChange, onTap) {
  const pointers = new Map();
  let lastDragPos = null;
  let pinchStartDist = null;
  let pinchStartZoom = null;
  let tapCandidate = false;
  let tapDownPos = null;
  let tapDownTime = 0;

  function clampZoom(z) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  function midpoint() {
    const pts = [...pointers.values()];
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  function dist() {
    const pts = [...pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 0) {
      tapCandidate = true;
      tapDownPos = { x: e.clientX, y: e.clientY };
      tapDownTime = performance.now();
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      lastDragPos = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      pinchStartDist = dist();
      pinchStartZoom = camera.zoom;
      lastDragPos = null;
      tapCandidate = false;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && lastDragPos) {
      if (tapCandidate && tapDownPos) {
        const moved = Math.hypot(e.clientX - tapDownPos.x, e.clientY - tapDownPos.y);
        if (moved > TAP_MOVE_THRESHOLD) tapCandidate = false;
      }
      const dx = e.clientX - lastDragPos.x;
      const dy = e.clientY - lastDragPos.y;
      camera.x -= dx / camera.zoom;
      camera.y -= dy / camera.zoom;
      lastDragPos = { x: e.clientX, y: e.clientY };
      onChange();
    } else if (pointers.size === 2 && pinchStartDist) {
      const scale = dist() / pinchStartDist;
      camera.zoom = clampZoom(pinchStartZoom * scale);
      onChange();
    }
  });

  function releasePointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinchStartDist = null;
      pinchStartZoom = null;
    }
    if (pointers.size === 1) {
      const [remaining] = pointers.values();
      lastDragPos = { x: remaining.x, y: remaining.y };
    } else {
      lastDragPos = null;
    }
    if (
      pointers.size === 0 &&
      tapCandidate &&
      performance.now() - tapDownTime < TAP_TIME_THRESHOLD &&
      onTap
    ) {
      onTap({ x: e.clientX, y: e.clientY });
    }
    if (pointers.size === 0) tapCandidate = false;
  }

  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.001);
      camera.zoom = clampZoom(camera.zoom * factor);
      onChange();
    },
    { passive: false }
  );
}
