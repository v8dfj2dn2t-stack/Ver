/* ===================================================================
 * panzoom.js — простой pan/zoom для SVG-карты (мышь/тач/колесо).
 * =================================================================== */

function createPanZoom(svgEl, viewportEl) {
  let scale = 1, tx = 0, ty = 0;
  let dragging = false, lastX = 0, lastY = 0;
  const MIN_SCALE = 0.5, MAX_SCALE = 4;

  function apply() {
    viewportEl.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
  }

  function reset() {
    scale = 1; tx = 0; ty = 0;
    apply();
  }

  function zoomBy(factor, cx, cy) {
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    if (cx === undefined) {
      const r = svgEl.getBoundingClientRect();
      cx = r.width / 2; cy = r.height / 2;
    }
    // Держим точку (cx, cy) неподвижной при масштабировании.
    tx = cx - (cx - tx) * (newScale / scale);
    ty = cy - (cy - ty) * (newScale / scale);
    scale = newScale;
    apply();
  }

  svgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svgEl.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, cx, cy);
  }, { passive: false });

  svgEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    svgEl.setPointerCapture(e.pointerId);
    svgEl.classList.add('dragging');
  });
  svgEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tx += (e.clientX - lastX);
    ty += (e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
    apply();
  });
  function endDrag(e) {
    dragging = false;
    svgEl.classList.remove('dragging');
  }
  svgEl.addEventListener('pointerup', endDrag);
  svgEl.addEventListener('pointerleave', endDrag);

  apply();
  return { reset, zoomBy, get scale() { return scale; } };
}

if (typeof window !== 'undefined') {
  window.createPanZoom = createPanZoom;
}
