/* ===================================================================
 * plans.js — работа с официальными поэтажными планами МГИМО.
 *
 * План загружается как SVG, вставляется в карту, помещения из
 * официального словаря получают подписи и становятся кликабельными.
 * Маршрут внутри этажа считается по настоящей геометрии: свободное
 * место между помещениями размечается сеткой и по ней ищется путь
 * алгоритмом A*.
 * =================================================================== */

const PLAN_CACHE = new Map();

const planKey = (buildingId, level) => `${buildingId}:${level}`;
const hasOfficialPlan = (buildingId, level) =>
  Object.prototype.hasOwnProperty.call(OFFICIAL_PLANS, planKey(buildingId, level));

/** Загружает и разбирает SVG плана (с кэшированием). */
async function loadPlan(buildingId, level) {
  const key = planKey(buildingId, level);
  if (PLAN_CACHE.has(key)) return PLAN_CACHE.get(key);
  const meta = OFFICIAL_PLANS[key];
  if (!meta) return null;

  const res = await fetch(meta.file);
  if (!res.ok) throw new Error(`Не удалось загрузить план ${meta.file}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.querySelector('svg');
  if (!root) throw new Error(`Некорректный SVG: ${meta.file}`);

  const plan = {
    key, meta,
    viewBox: (root.getAttribute('viewBox') || '0 0 1000 1000').split(/[\s,]+/).map(Number),
    svgRoot: root,
    graph: null,
  };
  PLAN_CACHE.set(key, plan);
  return plan;
}

/**
 * Вставляет план в карту. Возвращает список помещений с их
 * геометрией (bbox в координатах плана).
 */
function mountPlan(viewport, plan) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'official-plan');
  [...plan.svgRoot.childNodes].forEach(node => {
    g.appendChild(document.importNode(node, true));
  });
  viewport.appendChild(g);

  const known = plan.meta.rooms;
  const rooms = [];
  // Всё, что не опознано как помещение, получает нейтральный стиль стен
  g.querySelectorAll('rect, path, polygon, polyline, circle, ellipse').forEach(el => {
    const id = el.getAttribute('id');
    if (id && known[id]) return;
    el.classList.add('plan-shape');
  });

  Object.entries(known).forEach(([id, info]) => {
    const el = g.querySelector(`#${CSS.escape(id)}`);
    if (!el) return;
    let box;
    try { box = el.getBBox(); } catch { return; }
    if (!box || !box.width) return;
    el.classList.add('plan-room');
    el.dataset.planRoom = id;
    el.dataset.cat = info.c;
    rooms.push({ id, planId: plan.key, ...info, box });
  });

  return { group: g, rooms };
}

/**
 * Подписи помещений поверх плана. Размер единый для всего этажа, как на
 * обычном чертеже; подпись рисуется только если влезает в помещение.
 * На плане показываем номер, если он есть, иначе назначение.
 */
function labelPlan(group, rooms, viewBox) {
  const NS = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(NS, 'g');
  layer.setAttribute('class', 'plan-labels');
  const fs = Math.max(viewBox[2], viewBox[3]) / 105;
  const planArea = viewBox[2] * viewBox[3];

  rooms.forEach(r => {
    const { box } = r;
    if (box.width < fs * 2.4 || box.height < fs * 1.5) return;
    // Фоновые фигуры (например декор) — не помещения, их не подписываем
    if (box.width * box.height > planArea * 0.12) return;
    // Безымянные служебные помещения на плане не подписываем: их много,
    // подписи сливаются. Назначение видно по клику.
    if (!r.code && r.c === 'service') return;

    const cx = box.x + box.width / 2;
    const text = r.code || r.n;
    const short = text.length > 40 ? text.slice(0, 39) + '…' : text;
    const perLine = Math.max(5, Math.floor(box.width / (fs * 0.58)));
    const words = short.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (!cur) { cur = w; continue; }
      if ((cur + ' ' + w).length <= perLine) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
      if (lines.length >= 3) break;
    }
    if (cur && lines.length < 3) lines.push(cur);
    const maxLines = Math.max(1, Math.floor(box.height / (fs * 1.25)));
    const shown = lines.slice(0, maxLines);
    // Не подписываем, если текст не влезает целиком — иначе подписи
    // соседних помещений наезжают друг на друга
    if (shown.length < lines.length) return;
    if (shown.some(l => l.length * fs * 0.58 > box.width)) return;
    const top = box.y + box.height / 2 - ((shown.length - 1) * fs * 1.2) / 2;

    shown.forEach((line, i) => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', cx);
      t.setAttribute('y', top + i * fs * 1.2);
      t.setAttribute('font-size', fs);
      t.setAttribute('class', 'plan-label');
      t.textContent = line;
      layer.appendChild(t);
    });
  });

  group.appendChild(layer);
  return layer;
}

// ---------------------------------------------------------------------
// Граф проходимости по настоящей геометрии плана
// ---------------------------------------------------------------------
/**
 * Размечает свободное место сеткой: ячейка проходима, если её центр не
 * попадает ни в одно помещение, но лежит рядом с каким-нибудь из них
 * (коридоры всегда примыкают к помещениям — так отсекается улица).
 */
function buildPlanGrid(group, plan) {
  if (plan.graph) return plan.graph;

  const [vx, vy, vw, vh] = plan.viewBox;
  const cell = Math.max(vw, vh) / 150;          // ~150 ячеек по длинной стороне
  const cols = Math.ceil(vw / cell);
  const rows = Math.ceil(vh / cell);
  const inside = new Uint8Array(cols * rows);   // 1 — внутри помещения
  const near = new Uint8Array(cols * rows);     // 1 — рядом с помещением

  const shapes = [...group.querySelectorAll('.plan-room, .plan-shape')];
  const pt = group.ownerSVGElement.createSVGPoint();

  const NEAR = 4; // радиус «рядом» в ячейках
  shapes.forEach(el => {
    let box;
    try { box = el.getBBox(); } catch { return; }
    if (!box || !box.width || box.width > vw * 0.98) return; // пропускаем фон
    const c0 = Math.max(0, Math.floor((box.x - vx) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((box.x + box.width - vx) / cell));
    const r0 = Math.max(0, Math.floor((box.y - vy) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((box.y + box.height - vy) / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        pt.x = vx + (c + 0.5) * cell;
        pt.y = vy + (r + 0.5) * cell;
        let hit = false;
        try { hit = el.isPointInFill(pt) || el.isPointInStroke(pt); } catch { hit = true; }
        if (hit) inside[r * cols + c] = 1;
      }
    }
    for (let r = Math.max(0, r0 - NEAR); r <= Math.min(rows - 1, r1 + NEAR); r++) {
      for (let c = Math.max(0, c0 - NEAR); c <= Math.min(cols - 1, c1 + NEAR); c++) {
        near[r * cols + c] = 1;
      }
    }
  });

  const walkable = new Uint8Array(cols * rows);
  for (let i = 0; i < walkable.length; i++) {
    walkable[i] = !inside[i] && near[i] ? 1 : 0;
  }

  plan.graph = { cell, cols, rows, vx, vy, walkable };
  return plan.graph;
}

/** Ближайшая проходимая ячейка к точке (поиск по расширяющимся кольцам). */
function nearestWalkable(grid, x, y, maxRings = 22) {
  const { cell, cols, rows, vx, vy, walkable } = grid;
  const c0 = Math.round((x - vx) / cell - 0.5);
  const r0 = Math.round((y - vy) / cell - 0.5);
  for (let ring = 0; ring <= maxRings; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (ring && Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        if (walkable[r * cols + c]) return { r, c };
      }
    }
  }
  return null;
}

const cellCenter = (grid, r, c) => ({
  x: grid.vx + (c + 0.5) * grid.cell,
  y: grid.vy + (r + 0.5) * grid.cell,
});

/** A* по сетке. Возвращает массив точек в координатах плана. */
function findPathOnPlan(grid, from, to) {
  const { cols, rows, walkable } = grid;
  const start = nearestWalkable(grid, from.x, from.y);
  const goal = nearestWalkable(grid, to.x, to.y);
  if (!start || !goal) return null;

  const idx = (r, c) => r * cols + c;
  const h = (r, c) => Math.abs(r - goal.r) + Math.abs(c - goal.c);
  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const open = [{ r: start.r, c: start.c, f: h(start.r, start.c) }];
  gScore[idx(start.r, start.c)] = 0;
  const closed = new Uint8Array(cols * rows);

  const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const cur = open.splice(best, 1)[0];
    const ci = idx(cur.r, cur.c);
    if (closed[ci]) continue;
    closed[ci] = 1;
    if (cur.r === goal.r && cur.c === goal.c) break;

    for (const [dr, dc] of DIRS) {
      const r = cur.r + dr, c = cur.c + dc;
      if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
      const ni = idx(r, c);
      if (!walkable[ni] || closed[ni]) continue;
      // по диагонали ходим только если оба смежных прохода свободны
      if (dr && dc && (!walkable[idx(cur.r, c)] || !walkable[idx(r, cur.c)])) continue;
      const step = dr && dc ? Math.SQRT2 : 1;
      const ng = gScore[ci] + step;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        came[ni] = ci;
        open.push({ r, c, f: ng + h(r, c) });
      }
    }
  }

  const gi = idx(goal.r, goal.c);
  if (came[gi] === -1 && gi !== idx(start.r, start.c)) return null;

  const cells = [];
  for (let i = gi; i !== -1; i = came[i]) {
    cells.push({ r: Math.floor(i / cols), c: i % cols });
    if (i === idx(start.r, start.c)) break;
  }
  cells.reverse();

  // Прореживаем: оставляем точки, где путь меняет направление
  const pts = cells.map(({ r, c }) => cellCenter(grid, r, c));
  const simplified = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = simplified[simplified.length - 1], b = pts[i], d = pts[i + 1];
    const cross = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
    if (Math.abs(cross) > grid.cell * grid.cell * 0.35) simplified.push(b);
  }
  if (pts.length > 1) simplified.push(pts[pts.length - 1]);
  return { points: simplified, cells: cells.length, meters: cells.length * grid.cell };
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    hasOfficialPlan, loadPlan, mountPlan, labelPlan,
    buildPlanGrid, findPathOnPlan, nearestWalkable, planKey,
  });
}
