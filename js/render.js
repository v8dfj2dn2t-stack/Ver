/* ===================================================================
 * render.js — отрисовка планов этажей (контур здания, стены, коридоры,
 * помещения, двери, лестницы) и обзорной схемы территории.
 * =================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

function se(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, v);
  }
  children.forEach(c => node.appendChild(c));
  return node;
}
function clearNode(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function txt(node, s) { node.textContent = s; return node; }

function fitText(str, widthPx, fontPx) {
  const max = Math.max(3, Math.floor(widthPx / (fontPx * 0.58)));
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/** Разбивает название на 1–2 строки по ширине. */
function wrapLabel(str, widthPx, fontPx, maxLines = 2) {
  const perLine = Math.max(4, Math.floor(widthPx / (fontPx * 0.58)));
  if (str.length <= perLine) return [str];
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= perLine) cur += ' ' + w;
    else { lines.push(cur); cur = w; if (lines.length === maxLines - 1) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const used = lines.join(' ').length;
    if (used < str.length) lines[maxLines - 1] = fitText(lines[maxLines - 1] + '…', widthPx, fontPx);
  }
  return lines;
}

// ---------------------------------------------------------------------
// Легенда
// ---------------------------------------------------------------------
const LEGEND_HIDDEN = new Set(['stairs', 'elevator', 'passage', 'lobby', 'service', 'restroom', 'language']);

function renderLegend(container, categories, activeFilter, onToggle) {
  clearNode(container);
  Object.entries(categories).forEach(([key, cat]) => {
    if (LEGEND_HIDDEN.has(key)) return;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'legend-item' + (activeFilter === key ? ' active' : '');
    item.innerHTML = `<span class="legend-swatch" style="background:${cat.color}"></span>${cat.label}`;
    item.addEventListener('click', () => onToggle(activeFilter === key ? null : key));
    container.appendChild(item);
  });
}

// ---------------------------------------------------------------------
// Символы на плане
// ---------------------------------------------------------------------
function stairsIcon(rect) {
  const g = se('g', { class: 'sym sym--stairs' });
  const n = 5;
  const vertical = rect.h > rect.w;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (vertical) {
      g.appendChild(se('line', { x1: rect.x + 6, y1: rect.y + rect.h * t, x2: rect.x + rect.w - 6, y2: rect.y + rect.h * t }));
    } else {
      g.appendChild(se('line', { x1: rect.x + rect.w * t, y1: rect.y + 6, x2: rect.x + rect.w * t, y2: rect.y + rect.h - 6 }));
    }
  }
  return g;
}

function elevatorIcon(rect) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const g = se('g', { class: 'sym sym--elevator' });
  g.appendChild(se('rect', { x: cx - 15, y: cy - 16, width: 30, height: 32, rx: 3 }));
  g.appendChild(se('path', { d: `M ${cx - 6} ${cy - 3} l 5 -8 l 5 8 z` }));
  g.appendChild(se('path', { d: `M ${cx - 4} ${cy + 3} l 5 8 l 5 -8 z` }));
  return g;
}

function entranceIcon(rect, room) {
  const g = se('g', { class: 'sym sym--entrance' });
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  // стрелка внутрь здания (от наружной стены к двери)
  const dx = room.door.x - cx, dy = room.door.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const sx = cx - ux * 26, sy = cy - uy * 26;
  const ex = cx + ux * 20, ey = cy + uy * 20;
  g.appendChild(se('line', { x1: sx, y1: sy, x2: ex, y2: ey, 'marker-end': 'url(#arrow-in)' }));
  return g;
}

function passageIcon(rect) {
  const g = se('g', { class: 'sym sym--passage' });
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  g.appendChild(se('line', { x1: cx - 20, y1: cy, x2: cx + 20, y2: cy, 'marker-end': 'url(#arrow-in)' }));
  return g;
}

// ---------------------------------------------------------------------
// План этажа
// ---------------------------------------------------------------------
function computeFloorViewBox(layout) {
  const pad = 70;
  const b = layout.bbox;
  return [b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2];
}

function renderFloorPlan(viewport, graph, layout, opts = {}) {
  clearNode(viewport);
  const { WALL, CORRIDOR } = GEOM;
  const {
    highlightRoomId = null, categoryFilter = null,
    routeNodeIds = null, isRouteStart = false, isRouteEnd = false,
    onRoomClick = () => {},
  } = opts;

  // 1. Стены: контуры блоков, расширенные наружу
  const gWalls = se('g', { class: 'walls' });
  layout.shells.forEach(s => {
    gWalls.appendChild(se('rect', {
      x: s.x - WALL, y: s.y - WALL, width: s.w + WALL * 2, height: s.h + WALL * 2, rx: 2,
      class: 'wall-fill',
    }));
  });
  viewport.appendChild(gWalls);

  // 2. Внутреннее пространство (перекрывает стены на стыках блоков — там проёмы)
  const gFloor = se('g', { class: 'floor-fill' });
  layout.shells.forEach(s => {
    gFloor.appendChild(se('rect', { x: s.x, y: s.y, width: s.w, height: s.h, class: 'floor-rect' }));
  });
  viewport.appendChild(gFloor);

  // 3. Коридоры
  const gCorr = se('g', { class: 'corridors' });
  layout.corridors.forEach(c => {
    gCorr.appendChild(se('rect', {
      x: c.rect.x, y: c.rect.y, width: c.rect.w, height: c.rect.h, class: 'corridor-rect',
    }));
  });
  viewport.appendChild(gCorr);

  // 4. Помещения
  const gRooms = se('g', { class: 'rooms' });
  layout.rooms.forEach(r => {
    const cat = CATEGORIES[r.category] || CATEGORIES.audience;
    const dimmed = categoryFilter && r.category !== categoryFilter;
    const highlighted = r.id === highlightRoomId;
    const isSym = ['stairs', 'elevator', 'entrance', 'passage'].includes(r.category);

    const g = se('g', {
      class: 'room'
        + (highlighted ? ' room--highlight' : '')
        + (dimmed ? ' room--dim' : '')
        + (isSym ? ' room--sym' : ''),
      'data-room': r.id,
    });

    g.appendChild(se('rect', {
      x: r.rect.x, y: r.rect.y, width: r.rect.w, height: r.rect.h,
      class: 'room-rect', fill: cat.color, stroke: cat.color,
    }));

    // Дверь — светлый проём в стене, выходящей на коридор
    const dw = 22;
    const horizontalDoor = Math.abs(r.door.y - r.rect.y) < 1 || Math.abs(r.door.y - (r.rect.y + r.rect.h)) < 1;
    g.appendChild(se('rect', horizontalDoor
      ? { x: r.door.x - dw / 2, y: r.door.y - 3, width: dw, height: 6, class: 'door' }
      : { x: r.door.x - 3, y: r.door.y - dw / 2, width: 6, height: dw, class: 'door' }));

    // Символы
    if (r.category === 'stairs') g.appendChild(stairsIcon(r.rect));
    else if (r.category === 'elevator') g.appendChild(elevatorIcon(r.rect));
    else if (r.category === 'entrance') g.appendChild(entranceIcon(r.rect, r));
    else if (r.category === 'passage') g.appendChild(passageIcon(r.rect));

    // Подписи
    const cx = r.rect.x + r.rect.w / 2;
    const big = r.rect.w >= 170 || r.rect.h >= 170;
    let y = r.rect.y + r.rect.h / 2;

    if (r.number && !isSym) {
      const fs = big ? 17 : 13;
      y = r.rect.y + r.rect.h / 2 - (big ? 12 : 9);
      g.appendChild(txt(se('text', { x: cx, y, class: 'room-number', 'font-size': fs }), r.number));
      y += big ? 20 : 14;
    } else {
      y = r.rect.y + r.rect.h / 2 - (isSym ? -26 : 4);
    }

    const nameFs = big ? 11 : 9;
    const label = r.number && !isSym ? r.name.replace(new RegExp(`\\s*${r.number}$`), '') : r.name;
    wrapLabel(label, r.rect.w - 10, nameFs, isSym ? 1 : 2).forEach((line, i) => {
      g.appendChild(txt(se('text', {
        x: cx, y: y + i * (nameFs + 2), class: 'room-name', 'font-size': nameFs,
      }), line));
    });

    g.addEventListener('click', () => onRoomClick(r.id));
    gRooms.appendChild(g);
  });
  viewport.appendChild(gRooms);

  // 5. Маршрут
  if (routeNodeIds && routeNodeIds.length > 1) {
    const pts = routeNodeIds.map(id => graph.nodes.get(id)).filter(Boolean);
    const d = pts.map((n, i) => `${i ? 'L' : 'M'} ${n.x} ${n.y}`).join(' ');
    viewport.appendChild(se('path', { d, class: 'route-shadow' }));
    viewport.appendChild(se('path', { d, class: 'route-line' }));
    if (isRouteStart) viewport.appendChild(pin(pts[0].x, pts[0].y, 'start'));
    if (isRouteEnd) viewport.appendChild(pin(pts[pts.length - 1].x, pts[pts.length - 1].y, 'end'));
  }

  // 6. Масштабная линейка (10 м)
  const sb = 10 * PX_PER_M;
  const bx = layout.bbox.x, by = layout.bbox.y + layout.bbox.h + 38;
  const gScale = se('g', { class: 'scalebar' });
  gScale.appendChild(se('line', { x1: bx, y1: by, x2: bx + sb, y2: by }));
  gScale.appendChild(se('line', { x1: bx, y1: by - 5, x2: bx, y2: by + 5 }));
  gScale.appendChild(se('line', { x1: bx + sb, y1: by - 5, x2: bx + sb, y2: by + 5 }));
  gScale.appendChild(txt(se('text', { x: bx + sb / 2, y: by - 10, class: 'scalebar-label' }), '10 м'));
  viewport.appendChild(gScale);
}

function pin(x, y, kind) {
  const g = se('g', { class: `route-pin route-pin--${kind}`, transform: `translate(${x} ${y})` });
  g.appendChild(se('circle', { r: 13, class: 'route-pin-halo' }));
  g.appendChild(se('circle', { r: 7, class: 'route-pin-dot' }));
  return g;
}

// ---------------------------------------------------------------------
// Обзорная схема территории
// ---------------------------------------------------------------------
function computeCampusViewBox(layout) {
  return layout.viewBox;
}

function renderCampusOverview(viewport, graph, buildings, layout, opts = {}) {
  clearNode(viewport);
  const { highlightBuildingId = null, routeNodeIds = null, onSelectBuilding = () => {} } = opts;

  const { x: px, y: py } = layout.pivot;
  // Весь план наклонён, как на схеме кампуса; подписи разворачиваем обратно.
  const root = se('g', { transform: `rotate(${layout.rotate} ${px} ${py})` });
  const upright = (x, y) => `rotate(${-layout.rotate} ${x} ${y})`;

  // Крытые переходы между корпусами
  const gPass = se('g', { class: 'campus-passages' });
  (layout.passages || []).forEach(p => {
    const [x, y, w, h] = p.rect;
    gPass.appendChild(se('rect', { x, y, width: w, height: h, class: 'campus-passage' }));
  });
  root.appendChild(gPass);

  // Корпуса
  buildings.forEach(b => {
    const bl = layout.buildings[b.id];
    if (!bl) return;
    const active = highlightBuildingId === b.id;
    const g = se('g', { class: 'campus-building' + (active ? ' active' : '') });
    g.style.cursor = 'pointer';
    g.appendChild(se('path', {
      d: bl.path, class: 'campus-building-shape', fill: bl.color, stroke: bl.color,
    }));

    const lx = bl.label.x, ly = bl.label.y;
    const gl = se('g', { transform: upright(lx, ly), class: 'campus-label' });
    gl.appendChild(se('circle', { cx: lx, cy: ly - 22, r: 15, class: 'campus-badge' }));
    gl.appendChild(txt(se('text', { x: lx, y: ly - 16, class: 'campus-badge-num' }), String(bl.n)));
    gl.appendChild(txt(se('text', { x: lx, y: ly + 8, class: 'campus-building-label' }), b.name));
    gl.appendChild(txt(se('text', { x: lx, y: ly + 24, class: 'campus-building-sub' }), `${b.floors.length} эт.`));
    g.appendChild(gl);

    g.addEventListener('click', () => onSelectBuilding(b.id));
    root.appendChild(g);
  });

  // Отметка главного входа
  const em = layout.entranceMarker;
  if (em) {
    const gm = se('g', { class: 'campus-entrance' });
    gm.appendChild(se('line', { x1: em.x, y1: em.y, x2: em.x - 26, y2: em.y - 46, 'marker-end': 'url(#arrow-in)' }));
    const gt = se('g', { transform: upright(em.x, em.y) });
    gt.appendChild(txt(se('text', { x: em.x + 6, y: em.y + 22, class: 'campus-entrance-label' }), em.label));
    gm.appendChild(gt);
    root.appendChild(gm);
  }

  // Маршрут по территории
  if (routeNodeIds && routeNodeIds.length > 1) {
    const pts = routeNodeIds.map(id => graph.nodes.get(id)).filter(n => n && n.campusX !== undefined);
    if (pts.length > 1) {
      const d = pts.map((n, i) => `${i ? 'L' : 'M'} ${n.campusX} ${n.campusY}`).join(' ');
      root.appendChild(se('path', { d, class: 'route-shadow' }));
      root.appendChild(se('path', { d, class: 'route-line route-line--campus' }));
      if (opts.isRouteStart) root.appendChild(pin(pts[0].campusX, pts[0].campusY, 'start'));
      if (opts.isRouteEnd) root.appendChild(pin(pts[pts.length - 1].campusX, pts[pts.length - 1].campusY, 'end'));
    }
  }

  viewport.appendChild(root);
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    renderLegend, renderFloorPlan, renderCampusOverview,
    computeFloorViewBox, computeCampusViewBox,
  });
}
