/* ===================================================================
 * search.js — индекс и поиск помещений по номеру, названию и назначению.
 * =================================================================== */

function normalize(s) {
  return (s || '').toString().toLowerCase().replace(/ё/g, 'е').replace(/[.\s-]+/g, ' ').trim();
}

/** Из названия вида «ГЦ-27», «Ц-019», «102», «45-А» достаём номер. */
function numberFromName(name) {
  const m = name.match(/^([А-ЯЁA-Z]{0,3}-?\d{1,4}[а-яёa-z]?(?:-[А-ЯЁA-Z])?)(?:\s|$)/);
  return m ? m[1] : '';
}

function buildSearchIndex(graph, buildings) {
  const index = [];

  // Помещения с официальных планов этажей
  graph.nodes.forEach((n, id) => {
    if (n.type !== 'planroom') return;
    const cat = CATEGORIES[n.category] || CATEGORIES.service;
    const number = n.code || '';
    index.push({
      id,
      number,
      name: number && n.label !== number ? `${number} — ${n.label}` : n.label,
      info: n.info || '',
      official: true,
      categoryKey: n.category,
      categoryLabel: cat.label,
      buildingId: n.buildingId,
      buildingName: n.buildingName,
      buildingCode: (buildings.find(b => b.id === n.buildingId) || {}).code || '',
      level: n.level,
      floorLabel: n.floorLabel,
      searchText: normalize(`${number} ${n.label} ${n.info || ''} ${cat.label} ${n.buildingName}`),
      numberNorm: normalize(number),
    });
  });

  graph.layouts.forEach(L => {
    const b = L.building;
    // На этажах с официальным планом схематичные помещения не нужны
    if (typeof hasOfficialPlan === 'function' && hasOfficialPlan(b.id, L.floor.level)) return;
    L.rooms.forEach(r => {
      const cat = CATEGORIES[r.category] || CATEGORIES.audience;
      index.push({
        id: r.id,
        number: r.number,
        name: r.name,
        categoryKey: r.category,
        categoryLabel: cat.label,
        buildingId: b.id,
        buildingName: b.name,
        buildingCode: b.code,
        level: r.level,
        floorLabel: r.floorLabel,
        // Название этажа в индекс не идёт: иначе запрос «зал №8» ловил
        // бы все комнаты этажа «2 этаж — деканаты, зал №8».
        searchText: normalize(`${r.number} ${r.name} ${cat.label} ${cat.short} ${b.name} ${b.code}`),
        numberNorm: normalize(r.number),
      });
    });
  });
  return index;
}

/**
 * Ранжирование: точный номер > номер с начала > название с начала >
 * вхождение в любое поле.
 */
function searchRooms(index, query, opts = {}) {
  const q = normalize(query);
  if (!q) return [];
  const { categoryFilter = null, buildingFilter = null, limit = 50 } = opts;

  const out = [];
  for (const item of index) {
    if (categoryFilter && item.categoryKey !== categoryFilter) continue;
    if (buildingFilter && item.buildingId !== buildingFilter) continue;

    let score = 0;
    if (item.numberNorm && item.numberNorm === q) score = 100;
    else if (item.numberNorm && item.numberNorm.startsWith(q)) score = 80;
    else if (normalize(item.name).startsWith(q)) score = 70;
    else if (normalize(item.categoryLabel).startsWith(q)) score = 55;
    else if (item.searchText.includes(q)) score = 40;

    if (score > 0) out.push({ item, score });
  }

  out.sort((a, b) =>
    b.score - a.score ||
    a.item.buildingName.localeCompare(b.item.buildingName, 'ru') ||
    a.item.level - b.item.level ||
    a.item.name.localeCompare(b.item.name, 'ru'));

  return out.slice(0, limit).map(r => r.item);
}

if (typeof window !== 'undefined') {
  Object.assign(window, { buildSearchIndex, searchRooms, normalizeSearch: normalize });
}
