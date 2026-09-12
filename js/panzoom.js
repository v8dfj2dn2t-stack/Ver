/* ===================================================================
 * panzoom.js — простой pan/zoom для SVG-карты (мышь/тач/колесо).
 * =================================================================== */

function createPanZoom(svgEl, viewportEl) {
  let scale = 1, tx = 0, ty = 0;
  let dragging = false, moved = false, lastX = 0, lastY = 0;
  const MIN_SCALE = 0.5, MAX_SCALE = 6;
  const DRAG_THRESHOLD = 4; // px — ниже этого считаем, что это клик, а не перетаскивание

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
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // Указатель специально НЕ захватываем (setPointerCapture): иначе все
  // события, включая click, переадресуются на сам <svg> и клики по
  // помещениям на карте перестают работать.
  svgEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    lastX = e.clientX; lastY = e.clientY;
  });

  svgEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (!moved && Math.hypot(e.clientX - lastX, e.clientY - lastY) < DRAG_THRESHOLD) return;
    moved = true;
    svgEl.classList.add('dragging');
    tx += dx; ty += dy;
    lastX = e.clientX; lastY = e.clientY;
    apply();
  });

  function endDrag() {
    dragging = false;
    svgEl.classList.remove('dragging');
  }
  svgEl.addEventListener('pointerup', endDrag);
  svgEl.addEventListener('pointercancel', endDrag);
  svgEl.addEventListener('pointerleave', endDrag);

  // Если карту тащили — клик по помещению не срабатывает
  svgEl.addEventListener('click', (e) => {
    if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
  }, true);

  apply();
  return { reset, zoomBy, get scale() { return scale; } };
}

if (typeof window !== 'undefined') {
  window.createPanZoom = createPanZoom;
}
