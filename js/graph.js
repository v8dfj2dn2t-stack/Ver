/* ===================================================================
 * graph.js — построение графа проходимости кампуса (комнаты, коридоры,
 * лестницы, лифты, входы, связи между корпусами) и поиск маршрута
 * (алгоритм Дейкстры).
 * =================================================================== */

function buildCampusGraph(buildings, campusLayout) {
  const nodes = new Map(); // id -> node meta
  const adj = new Map();   // id -> [{to, weight}]

  function addNode(id, meta) {
    nodes.set(id, meta);
    if (!adj.has(id)) adj.set(id, []);
    return id;
  }
  function addEdge(a, b, weight) {
    if (!nodes.has(a) || !nodes.has(b)) return;
    adj.get(a).push({ to: b, weight });
    adj.get(b).push({ to: a, weight });
  }

  const G = window.MAP_GEOM;

  // Хаб — условный центр территории кампуса, связывающий входы корпусов.
  addNode('hub', { type: 'hub', label: 'Территория кампуса', campusX: campusLayout.hub.x, campusY: campusLayout.hub.y });

  buildings.forEach(b => {
    const layout = campusLayout.buildings[b.id];
    let prevFloorStairA = null, prevFloorStairB = null, prevFloorElev = null;
    let prevLevel = null;

    b.floors.forEach(floor => {
      const corridorIds = [];
      for (let u = 0; u < floor.units; u++) {
        const id = `c-${b.id}-${floor.level}-${u}`;
        corridorIds.push(id);
        addNode(id, {
          type: 'corridor', buildingId: b.id, buildingName: b.name, level: floor.level,
          floorX: G.MARGIN_X + u * G.UNIT, floorY: G.CORRIDOR_Y + G.CORRIDOR_H / 2,
          label: `Коридор, ${floor.name}`,
        });
        if (u > 0) addEdge(corridorIds[u - 1], corridorIds[u], G.UNIT / 16);
      }

      // Комнаты
      floor.rooms.forEach(r => {
        const cx = G.MARGIN_X + r.unit * G.UNIT + G.ROOM_W / 2;
        const cy = r.side === 'top'
          ? G.CORRIDOR_Y - G.ROOM_H / 2 - 4
          : G.CORRIDOR_Y + G.CORRIDOR_H + G.ROOM_H / 2 + 4;
        addNode(r.id, {
          type: 'room', buildingId: b.id, buildingName: b.name, level: floor.level,
          floorX: cx, floorY: cy, label: r.name, room: r,
        });
        addEdge(r.id, corridorIds[r.unit], 3);
      });

      // Лестницы по краям коридора (условно "A" — начало, "B" — конец)
      const stairAId = `stairA-${b.id}-${floor.level}`;
      const stairBId = `stairB-${b.id}-${floor.level}`;
      addNode(stairAId, {
        type: 'stair', buildingId: b.id, buildingName: b.name, level: floor.level,
        floorX: G.MARGIN_X + 0 * G.UNIT, floorY: G.CORRIDOR_Y + G.CORRIDOR_H / 2,
        label: `Лестница А, ${floor.name}`,
      });
      addNode(stairBId, {
        type: 'stair', buildingId: b.id, buildingName: b.name, level: floor.level,
        floorX: G.MARGIN_X + (floor.units - 1) * G.UNIT, floorY: G.CORRIDOR_Y + G.CORRIDOR_H / 2,
        label: `Лестница Б, ${floor.name}`,
      });
      addEdge(stairAId, corridorIds[0], 1);
      addEdge(stairBId, corridorIds[corridorIds.length - 1], 1);
      if (prevLevel !== null && floor.level === prevLevel + 1) {
        addEdge(prevFloorStairA, stairAId, 15);
        addEdge(prevFloorStairB, stairBId, 15);
      }
      prevFloorStairA = stairAId;
      prevFloorStairB = stairBId;

      // Лифт (если есть на этаже)
      let elevId = null;
      if (floor.elevator) {
        const midU = Math.floor(floor.units / 2);
        elevId = `elev-${b.id}-${floor.level}`;
        addNode(elevId, {
          type: 'elevator', buildingId: b.id, buildingName: b.name, level: floor.level,
          floorX: G.MARGIN_X + midU * G.UNIT, floorY: G.CORRIDOR_Y - G.CORRIDOR_H,
          label: `Лифт, ${floor.name}`,
        });
        addEdge(elevId, corridorIds[midU], 2);
        if (prevFloorElev && prevLevel !== null && floor.level === prevLevel + 1) {
          addEdge(prevFloorElev, elevId, 8);
        }
      }
      prevFloorElev = elevId;
      prevLevel = floor.level;

      // Вход с улицы (обычно 1 этаж)
      if (floor.entrance) {
        const entId = `entrance-${b.id}`;
        addNode(entId, {
          type: 'entrance', buildingId: b.id, buildingName: b.name, level: floor.level,
          floorX: G.MARGIN_X + 0 * G.UNIT, floorY: G.CORRIDOR_Y + G.CORRIDOR_H / 2 + 30,
          campusX: layout.x + layout.w / 2, campusY: layout.y + layout.h / 2,
          label: `Вход, ${b.name}`,
        });
        addEdge(entId, corridorIds[0], 4);
        addEdge(entId, 'hub', layout.walkToHub);
      }
    });
  });

  return { nodes, adj };
}

function dijkstra(graph, startId, endId) {
  const { nodes, adj } = graph;
  if (!nodes.has(startId) || !nodes.has(endId)) return null;

  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  nodes.forEach((_, id) => dist.set(id, Infinity));
  dist.set(startId, 0);

  while (true) {
    let u = null, best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) { best = d; u = id; }
    }
    if (u === null) break;
    if (u === endId) break;
    visited.add(u);
    for (const { to, weight } of adj.get(u) || []) {
      if (visited.has(to)) continue;
      const nd = dist.get(u) + weight;
      if (nd < dist.get(to)) {
        dist.set(to, nd);
        prev.set(to, u);
      }
    }
  }

  if (dist.get(endId) === Infinity) return null;

  const path = [endId];
  let cur = endId;
  while (cur !== startId) {
    cur = prev.get(cur);
    if (cur === undefined) return null;
    path.unshift(cur);
  }
  return { path, distance: dist.get(endId) };
}

/**
 * Разбивает путь на сегменты по (buildingId, level), плюс отдельные
 * "campus"-сегменты для переходов между корпусами по территории.
 */
function splitRouteIntoSegments(graph, path) {
  const { nodes } = graph;
  const segments = [];
  let cur = null;

  for (const id of path) {
    const meta = nodes.get(id);
    const key = meta.type === 'hub' || meta.type === 'entrance'
      ? `campus`
      : `${meta.buildingId}:${meta.level}`;
    if (!cur || cur.key !== key) {
      cur = { key, type: key === 'campus' ? 'campus' : 'floor', buildingId: meta.buildingId, level: meta.level, nodeIds: [] };
      segments.push(cur);
    }
    cur.nodeIds.push(id);
  }

  // Гарантируем, что вход в здание попадает и в campus-сегмент, и в
  // сегмент этажа, чтобы линия маршрута не прерывалась визуально.
  for (let i = 1; i < segments.length; i++) {
    const prevSeg = segments[i - 1];
    const seg = segments[i];
    const bridgeId = prevSeg.nodeIds[prevSeg.nodeIds.length - 1];
    if (seg.type === 'floor' && !seg.nodeIds.includes(bridgeId)) {
      seg.nodeIds.unshift(bridgeId);
    }
    if (prevSeg.type === 'floor') {
      const firstOfNext = seg.nodeIds[0];
      if (!prevSeg.nodeIds.includes(firstOfNext)) prevSeg.nodeIds.push(firstOfNext);
    }
  }

  return segments;
}

if (typeof window !== 'undefined') {
  window.buildCampusGraph = buildCampusGraph;
  window.dijkstra = dijkstra;
  window.splitRouteIntoSegments = splitRouteIntoSegments;
}
