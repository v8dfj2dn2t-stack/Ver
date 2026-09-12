/* ===================================================================
 * graph.js — граф проходимости: коридоры, помещения, лестницы, лифты,
 * переходы между корпусами и дорожки по территории. Поиск маршрута —
 * алгоритм Дейкстры.
 * =================================================================== */

const JOIN_DIST = 80;      // на таком расстоянии коридоры разных блоков считаются связанными
const STAIR_COST = 12;     // «метров» за этаж по лестнице
const ELEVATOR_COST = 6;   // «метров» за этаж на лифте
const DOOR_COST = 1.5;
const PASSAGE_COST = 25;   // крытый переход между корпусами — короткий и «в тепле»

function buildCampusGraph(buildings, campusLayout) {
  const nodes = new Map();
  const adj = new Map();

  function addNode(id, meta) {
    nodes.set(id, meta);
    if (!adj.has(id)) adj.set(id, []);
    return id;
  }
  function addEdge(a, b, weight, kind) {
    if (!nodes.has(a) || !nodes.has(b) || a === b) return;
    adj.get(a).push({ to: b, weight, kind });
    adj.get(b).push({ to: a, weight, kind });
  }
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) / PX_PER_M;

  const layouts = layoutAll(buildings);
  const stacks = new Map();     // `${buildingId}:${stack}` -> [{level, nodeId, category}]
  const passages = [];          // {buildingId, link, nodeId, level}
  const entrances = [];         // {buildingId, nodeId}

  layouts.forEach(L => {
    const b = L.building, f = L.floor;
    const corridorNodesByBlock = new Map();

    // --- Узлы коридоров ---
    L.corridors.forEach(c => {
      const ids = [];
      for (let i = 0; i <= c.slots; i++) {
        const t = c.slots === 0 ? 0 : i / c.slots;
        const x = c.x1 + (c.x2 - c.x1) * t;
        const y = c.y1 + (c.y2 - c.y1) * t;
        const id = `c:${b.id}:${f.level}:${c.blockId}:${i}`;
        addNode(id, {
          type: 'corridor', buildingId: b.id, buildingName: b.name,
          level: f.level, floorLabel: f.label, blockId: c.blockId,
          x, y, label: `Коридор, ${f.label}`,
        });
        if (i > 0) addEdge(ids[i - 1], id, dist(
          nodes.get(ids[i - 1]).x, nodes.get(ids[i - 1]).y, x, y), 'walk');
        ids.push(id);
      }
      corridorNodesByBlock.set(c.blockId, ids);
    });

    // --- Стыки коридоров разных блоков (углы, Т-образные соединения) ---
    const allCorridorIds = [...corridorNodesByBlock.values()].flat();
    for (let i = 0; i < allCorridorIds.length; i++) {
      for (let j = i + 1; j < allCorridorIds.length; j++) {
        const A = nodes.get(allCorridorIds[i]), B = nodes.get(allCorridorIds[j]);
        if (A.blockId === B.blockId) continue;
        const d = Math.hypot(A.x - B.x, A.y - B.y);
        if (d <= JOIN_DIST) addEdge(allCorridorIds[i], allCorridorIds[j], d / PX_PER_M, 'walk');
      }
    }

    // --- Помещения ---
    L.rooms.forEach(r => {
      addNode(r.id, {
        type: 'room', buildingId: b.id, buildingName: b.name,
        level: f.level, floorLabel: f.label,
        x: r.door.x, y: r.door.y,
        label: r.name, room: r,
      });
      // Присоединяем к ближайшему узлу коридора своего блока
      const ids = corridorNodesByBlock.get(r.blockId) || [];
      let best = null, bestD = Infinity;
      ids.forEach(id => {
        const n = nodes.get(id);
        const d = Math.hypot(n.x - r.attach.x, n.y - r.attach.y);
        if (d < bestD) { bestD = d; best = id; }
      });
      if (best) {
        const n = nodes.get(best);
        addEdge(r.id, best, dist(r.door.x, r.door.y, n.x, n.y) + DOOR_COST, 'walk');
      }

      if (r.stack) {
        const key = `${b.id}:${r.stack}`;
        if (!stacks.has(key)) stacks.set(key, []);
        stacks.get(key).push({ level: f.level, nodeId: r.id, category: r.category });
      }
      if (r.link) {
        // Переход соединяется с переходом того же этажа в соседнем
        // корпусе; явный key связывает концы на разных отметках.
        const key = r.passageKey
          || `${[b.id, r.link].sort().join('|')}@${f.level}`;
        passages.push({ buildingId: b.id, link: r.link, nodeId: r.id, level: f.level, key });
      }
      if (r.isEntrance) entrances.push({ buildingId: b.id, nodeId: r.id });
    });
  });

  // --- Вертикальные связи: лестницы и лифты ---
  stacks.forEach(list => {
    list.sort((p, q) => p.level - q.level);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      const perFloor = cur.category === 'elevator' ? ELEVATOR_COST : STAIR_COST;
      addEdge(prev.nodeId, cur.nodeId, perFloor * (cur.level - prev.level),
        cur.category === 'elevator' ? 'elevator' : 'stairs');
    }
  });

  // --- Территория кампуса ---
  const hub = campusLayout.entranceMarker;
  addNode('campus:hub', {
    type: 'hub', label: 'Территория кампуса',
    campusX: hub.x, campusY: hub.y,
  });

  // У каждого входа своя точка на улице. Общая точка на корпус давала
  // бы «телепорт»: выйти в одну дверь и войти в другую оказалось бы
  // дешевле, чем пройти по коридору.
  const outdoorByBuilding = new Map();
  entrances.forEach((e, i) => {
    const bl = campusLayout.buildings[e.buildingId];
    if (!bl) return;
    const b = buildings.find(x => x.id === e.buildingId);
    const id = `campus:${e.buildingId}:${i}`;
    addNode(id, {
      type: 'outdoor', buildingId: e.buildingId, buildingName: b.name,
      label: `Улица у «${b.name}»`,
      campusX: bl.label.x, campusY: bl.label.y,
    });
    addEdge(e.nodeId, id, 5, 'door');
    addEdge(id, 'campus:hub', bl.walk, 'outdoor');
    if (!outdoorByBuilding.has(e.buildingId)) outdoorByBuilding.set(e.buildingId, id);
  });

  // --- Дорожки по территории между корпусами ---
  (campusLayout.links || []).forEach(([a, bId, w]) => {
    const from = outdoorByBuilding.get(a), to = outdoorByBuilding.get(bId);
    if (from && to) addEdge(from, to, w, 'outdoor');
  });

  // --- Крытые переходы: соединяются напрямую, минуя улицу ---
  const byKey = new Map();
  passages.forEach(p => {
    if (!byKey.has(p.key)) byKey.set(p.key, []);
    byKey.get(p.key).push(p);
  });
  byKey.forEach(group => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i].buildingId === group[j].buildingId) continue;
        addEdge(group[i].nodeId, group[j].nodeId, PASSAGE_COST, 'passage');
      }
    }
  });

  return { nodes, adj, layouts };
}

// ---------------------------------------------------------------------
// Дейкстра на бинарной куче
// ---------------------------------------------------------------------
function dijkstra(graph, startId, endId) {
  const { nodes, adj } = graph;
  if (!nodes.has(startId) || !nodes.has(endId)) return null;

  const dist = new Map([[startId, 0]]);
  const prev = new Map();
  const visited = new Set();
  const heap = [{ id: startId, d: 0 }];

  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].d <= heap[i].d) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].d < heap[m].d) m = l;
        if (r < heap.length && heap[r].d < heap[m].d) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  while (heap.length) {
    const { id: u, d } = pop();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === endId) break;
    for (const e of adj.get(u) || []) {
      if (visited.has(e.to)) continue;
      const nd = d + e.weight;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
        push({ id: e.to, d: nd });
      }
    }
  }

  if (!dist.has(endId)) return null;
  const path = [endId];
  let cur = endId;
  while (cur !== startId) {
    cur = prev.get(cur);
    if (cur === undefined) return null;
    path.unshift(cur);
  }
  return { path, distance: dist.get(endId) };
}

/** Вес ребра между двумя соседними узлами пути. */
function edgeBetween(graph, a, b) {
  return (graph.adj.get(a) || []).find(e => e.to === b) || null;
}

/**
 * Делит маршрут на участки: каждый этаж каждого корпуса — отдельный
 * участок, перемещения по территории — участок 'campus'.
 */
function splitRouteIntoSegments(graph, path) {
  const { nodes } = graph;
  const segments = [];
  let cur = null;

  path.forEach(id => {
    const n = nodes.get(id);
    const outdoor = n.type === 'hub' || n.type === 'outdoor';
    const key = outdoor ? 'campus' : `${n.buildingId}:${n.level}`;
    if (!cur || cur.key !== key) {
      cur = {
        key,
        type: outdoor ? 'campus' : 'floor',
        buildingId: n.buildingId,
        level: n.level,
        nodeIds: [],
      };
      segments.push(cur);
    }
    cur.nodeIds.push(id);
  });

  // Дублируем стыковые узлы, чтобы линия маршрута не обрывалась
  for (let i = 1; i < segments.length; i++) {
    const prevSeg = segments[i - 1], seg = segments[i];
    const bridge = prevSeg.nodeIds[prevSeg.nodeIds.length - 1];
    const prevMeta = nodes.get(bridge);
    const segMeta = nodes.get(seg.nodeIds[0]);
    if (seg.type === 'floor' && prevMeta.buildingId === seg.buildingId && prevMeta.level === seg.level) {
      if (!seg.nodeIds.includes(bridge)) seg.nodeIds.unshift(bridge);
    }
    if (prevSeg.type === 'floor' && segMeta.buildingId === prevSeg.buildingId && segMeta.level === prevSeg.level) {
      if (!prevSeg.nodeIds.includes(seg.nodeIds[0])) prevSeg.nodeIds.push(seg.nodeIds[0]);
    }
  }

  return segments;
}

if (typeof window !== 'undefined') {
  Object.assign(window, { buildCampusGraph, dijkstra, splitRouteIntoSegments, edgeBetween });
}
