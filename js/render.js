/* ===================================================================
 * render.js — отрисовка SVG-схем: обзорная карта кампуса и планы
 * этажей корпусов, включая наложение построенного маршрута.
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

function truncate(str, n) { return str.length > n ? str.slice(0, n - 1) + '…' : str; }

// ---------------------------------------------------------------------
// Легенда категорий
// ---------------------------------------------------------------------
function renderLegend(container, categories, activeFilter, onToggle) {
  clearNode(container);
  Object.entries(categories).forEach(([key, cat]) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'legend-item' + (activeFilter === cat.label ? ' active' : '');
    item.innerHTML = `<span class="legend-swatch" style="background:${cat.color}"></span>${cat.label}`;
    item.addEventListener('click', () => onToggle(activeFilter === cat.label ? null : cat.label));
    container.appendChild(item);
  });
}

// ---------------------------------------------------------------------
// Обзорная карта кампуса
// ---------------------------------------------------------------------
function computeCampusViewBox(layout) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  Object.values(layout.buildings).forEach(b => {
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  });
  const pad = 80;
  return [minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2];
}

function renderCampusOverview(viewport, graph, buildings, layout, opts = {}) {
  clearNode(viewport);
  const { highlightBuildingId = null, routeNodeIds = null, onSelectBuilding = () => {} } = opts;

  // Фоновые дорожки от каждого входа к условному центру территории.
  const hub = layout.hub;
  buildings.forEach(b => {
    const bl = layout.buildings[b.id];
    const doorX = bl.x + bl.w / 2, doorY = bl.y + bl.h / 2;
    viewport.appendChild(se('line', {
      x1: doorX, y1: doorY, x2: hub.x, y2: hub.y,
      class: 'campus-path',
    }));
  });

  // Маршрут по территории (если задан)
  if (routeNodeIds && routeNodeIds.length > 1) {
    const pts = routeNodeIds
      .map(id => graph.nodes.get(id))
      .filter(n => n && n.campusX !== undefined)
      .map(n => `${n.campusX},${n.campusY}`)
      .join(' ');
    if (pts) {
      viewport.appendChild(se('polyline', { points: pts, class: 'route-line route-line--campus' }));
    }
  }

  buildings.forEach(b => {
    const bl = layout.buildings[b.id];
    const g = se('g', { class: 'campus-building' + (highlightBuildingId === b.id ? ' active' : '') });
    g.style.cursor = 'pointer';
    g.appendChild(se('rect', {
      x: bl.x, y: bl.y, width: bl.w, height: bl.h, rx: 10,
      class: 'campus-building-rect',
    }));
    const label = se('text', { x: bl.x + bl.w / 2, y: bl.y + bl.h / 2 - 6, class: 'campus-building-label' });
    label.textContent = b.name;
    const sub = se('text', { x: bl.x + bl.w / 2, y: bl.y + bl.h / 2 + 14, class: 'campus-building-sub' });
    sub.textContent = b.code;
    g.appendChild(label);
    g.appendChild(sub);
    g.addEventListener('click', () => onSelectBuilding(b.id));
    viewport.appendChild(g);
  });

  // Точки старта/финиша маршрута на территории
  if (routeNodeIds && routeNodeIds.length) {
    const first = graph.nodes.get(routeNodeIds[0]);
    const last = graph.nodes.get(routeNodeIds[routeNodeIds.length - 1]);
    if (opts.isRouteStart && first) viewport.appendChild(pin(first.campusX, first.campusY, 'start'));
    if (opts.isRouteEnd && last) viewport.appendChild(pin(last.campusX, last.campusY, 'end'));
  }
}

function pin(x, y, kind) {
  const g = se('g', { class: `route-pin route-pin--${kind}`, transform: `translate(${x} ${y})` });
  g.appendChild(se('circle', { r: 11, class: 'route-pin-halo' }));
  g.appendChild(se('circle', { r: 6, class: 'route-pin-dot' }));
  return g;
}

// ---------------------------------------------------------------------
// План этажа
// ---------------------------------------------------------------------
function computeFloorViewBox(floor) {
  const G = window.MAP_GEOM;
  const width = G.MARGIN_X * 2 + (floor.units - 1) * G.UNIT + G.ROOM_W;
  const height = G.CORRIDOR_Y * 2 + G.ROOM_H + 60;
  return [-40, 0, width + 40, height];
}

function iconBadge(x, y, text, cls) {
  const g = se('g', { class: `map-icon ${cls}`, transform: `translate(${x} ${y})` });
  g.appendChild(se('rect', { x: -22, y: -18, width: 44, height: 36, rx: 6, class: 'map-icon-box' }));
  const t = se('text', { class: 'map-icon-label', y: 5 });
  t.textContent = text;
  g.appendChild(t);
  return g;
}

function renderFloorPlan(viewport, graph, building, floor, opts = {}) {
  clearNode(viewport);
  const G = window.MAP_GEOM;
  const {
    highlightRoomId = null, categoryFilter = null,
    routeNodeIds = null, isRouteStart = false, isRouteEnd = false,
    onRoomClick = () => {},
  } = opts;

  const corridorWidth = G.MARGIN_X + (floor.units - 1) * G.UNIT + G.MARGIN_X;
  viewport.appendChild(se('rect', {
    x: G.MARGIN_X - 40, y: G.CORRIDOR_Y, width: corridorWidth - G.MARGIN_X * 2 + 80, height: G.CORRIDOR_H,
    class: 'corridor',
  }));

  // Лестницы
  ['stairA', 'stairB'].forEach(prefix => {
    const id = `${prefix}-${building.id}-${floor.level}`;
    const n = graph.nodes.get(id);
    if (!n) return;
    viewport.appendChild(iconBadge(n.floorX, n.floorY, 'Лестница', 'map-icon--stair'));
  });

  // Лифт
  if (floor.elevator) {
    const n = graph.nodes.get(`elev-${building.id}-${floor.level}`);
    if (n) viewport.appendChild(iconBadge(n.floorX, n.floorY, 'Лифт', 'map-icon--elevator'));
  }

  // Вход
  if (floor.entrance) {
    const n = graph.nodes.get(`entrance-${building.id}`);
    if (n) viewport.appendChild(iconBadge(n.floorX, n.floorY, 'Вход', 'map-icon--entrance'));
  }

  // Комнаты
  floor.rooms.forEach(r => {
    const n = graph.nodes.get(r.id);
    if (!n) return;
    const cat = CATEGORIES[r.category];
    const dimmed = categoryFilter && cat.label !== categoryFilter;
    const isHighlighted = r.id === highlightRoomId;
    const g = se('g', {
      class: 'room' + (isHighlighted ? ' room--highlight' : '') + (dimmed ? ' room--dim' : ''),
      transform: `translate(${n.floorX - G.ROOM_W / 2} ${n.floorY - G.ROOM_H / 2})`,
    });
    g.style.cursor = 'pointer';
    g.appendChild(se('rect', {
      width: G.ROOM_W, height: G.ROOM_H, rx: 6,
      class: 'room-rect', style: `--room-color:${cat.color}`,
    }));
    const num = se('text', { x: G.ROOM_W / 2, y: 22, class: 'room-number' });
    num.textContent = r.number || cat.short;
    const nm = se('text', { x: G.ROOM_W / 2, y: 38, class: 'room-name' });
    nm.textContent = truncate(cat.label, 14);
    g.appendChild(num);
    g.appendChild(nm);
    g.addEventListener('click', () => onRoomClick(r.id));
    viewport.appendChild(g);
  });

  // Маршрут на этаже
  if (routeNodeIds && routeNodeIds.length > 1) {
    const pts = routeNodeIds
      .map(id => graph.nodes.get(id))
      .filter(Boolean)
      .map(n => `${n.floorX},${n.floorY}`)
      .join(' ');
    viewport.appendChild(se('polyline', { points: pts, class: 'route-line' }));

    const first = graph.nodes.get(routeNodeIds[0]);
    const last = graph.nodes.get(routeNodeIds[routeNodeIds.length - 1]);
    if (isRouteStart && first) viewport.appendChild(pin(first.floorX, first.floorY, 'start'));
    if (isRouteEnd && last) viewport.appendChild(pin(last.floorX, last.floorY, 'end'));
  }
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    renderLegend, renderCampusOverview, renderFloorPlan,
    computeCampusViewBox, computeFloorViewBox,
  });
}
