/* ===================================================================
 * search.js — индекс поиска по кабинетам/аудиториям (по названию,
 * номеру или назначению) и вспомогательные функции ранжирования.
 * =================================================================== */

function normalize(s) {
  return (s || '').toString().toLowerCase().replace(/ё/g, 'е').trim();
}

function buildSearchIndex(buildings) {
  const index = [];

  buildings.forEach(b => {
    // Точки входа тоже можно искать/выбирать как точку маршрута.
    const groundFloor = b.floors.find(f => f.entrance);
    if (groundFloor) {
      index.push({
        id: `entrance-${b.id}`,
        kind: 'entrance',
        number: '',
        name: `Вход в корпус — ${b.name}`,
        categoryLabel: 'Вход в здание',
        categoryKey: null,
        buildingId: b.id,
        buildingName: b.name,
        level: groundFloor.level,
        searchText: normalize(`вход ${b.name} ${b.code} ${b.address}`),
      });
    }

    b.floors.forEach(floor => {
      floor.rooms.forEach(r => {
        const cat = CATEGORIES[r.category];
        index.push({
          id: r.id,
          kind: 'room',
          number: r.number,
          name: r.name,
          categoryLabel: cat.label,
          categoryKey: r.category,
          buildingId: b.id,
          buildingName: b.name,
          level: floor.level,
          capacity: r.capacity,
          searchText: normalize(`${r.number} ${r.name} ${cat.label} ${cat.short} ${b.name} ${b.code} ${floor.name}`),
        });
      });
    });
  });

  return index;
}

/**
 * Ранжированный поиск: точное совпадение номера > начало строки > вхождение.
 */
function searchRooms(index, query, opts = {}) {
  const q = normalize(query);
  if (!q) return [];
  const { categoryFilter = null, buildingFilter = null, limit = 40 } = opts;

  const results = [];
  for (const item of index) {
    if (categoryFilter && item.categoryLabel !== categoryFilter) continue;
    if (buildingFilter && item.buildingId !== buildingFilter) continue;

    const numNorm = normalize(item.number);
    let score = -1;
    if (numNorm && numNorm === q) score = 100;
    else if (numNorm && numNorm.startsWith(q)) score = 80;
    else if (normalize(item.name).startsWith(q)) score = 70;
    else if (item.searchText.includes(q)) score = 40;

    if (score > 0) results.push({ item, score });
  }

  results.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'ru'));
  return results.slice(0, limit).map(r => r.item);
}

if (typeof window !== 'undefined') {
  window.buildSearchIndex = buildSearchIndex;
  window.searchRooms = searchRooms;
  window.normalizeSearch = normalize;
}
