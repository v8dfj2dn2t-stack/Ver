/* ===================================================================
 * data.js — модель кампуса МГИМО: корпуса, этажи, аудитории, связи.
 *
 * ВАЖНО: расположение аудиторий носит демонстрационный (схематичный)
 * характер — оно построено по типовой логике вуза (коридорная система,
 * лестницы по краям корпуса) и не является выгрузкой реального
 * технического плана БТИ. Названия корпусов, факультетов и кафедр
 * соответствуют публично известной структуре МГИМО, но конкретные
 * номера кабинетов условны и предназначены для демонстрации поиска
 * и навигации. Данные легко заменить на подтверждённые, отредактировав
 * этот файл.
 * =================================================================== */

const CATEGORIES = {
  audience:  { label: 'Аудитория',              short: 'Ауд.',  color: '#3b6fb6' },
  office:    { label: 'Кабинет преподавателя',  short: 'Каб.',  color: '#6b7280' },
  dept:      { label: 'Кафедра',                short: 'Каф.',  color: '#8a5cf6' },
  dean:      { label: 'Деканат',                short: 'Дек.',  color: '#c9a227' },
  admin:     { label: 'Администрация / ректорат', short: 'Адм.', color: '#b45309' },
  lab:       { label: 'Лаборатория',            short: 'Лаб.',  color: '#0ea5e9' },
  computer:  { label: 'Компьютерный класс',     short: 'ПК',    color: '#10b981' },
  language:  { label: 'Лингафонный кабинет',    short: 'Линг.', color: '#14b8a6' },
  library:   { label: 'Библиотека / читальный зал', short: 'Библ.', color: '#7c3aed' },
  hall:      { label: 'Актовый / конференц-зал', short: 'Зал',  color: '#dc2626' },
  food:      { label: 'Буфет / столовая',       short: 'Буф.',  color: '#f59e0b' },
  sport:     { label: 'Спортивный зал',         short: 'Спорт', color: '#059669' },
  pool:      { label: 'Бассейн',                short: 'Басс.', color: '#0284c7' },
  medical:   { label: 'Медицинский пункт',      short: 'Мед.',  color: '#ef4444' },
  wardrobe:  { label: 'Гардероб',               short: 'Гард.', color: '#64748b' },
  restroom:  { label: 'Туалет',                 short: 'WC',    color: '#94a3b8' },
  service:   { label: 'Служебное помещение',    short: 'Служ.', color: '#475569' },
  museum:    { label: 'Музей / выставочный зал', short: 'Муз.',  color: '#9333ea' },
  atrium:    { label: 'Холл / рекреация',       short: 'Холл',  color: '#a3a3a3' },
};

// ---- Геометрия схемы этажа -------------------------------------------
const UNIT = 100;      // px на один шаг коридора
const ROOM_W = 78;
const ROOM_H = 54;
const CORRIDOR_Y = 300;
const CORRIDOR_H = 46;
const MARGIN_X = 90;

let _uid = 0;
function nextId(prefix) { return `${prefix}-${++_uid}`; }

const NO_NUMBER_CATEGORIES = new Set(['wardrobe', 'atrium', 'restroom', 'service']);

/**
 * Строит один этаж по компактному DSL:
 * units          — длина коридора в шагах (лестницы стоят по краям: 0 и units-1)
 * special         — явно заданные кабинеты { unit, side:'top'|'bottom', cat, num, name, capacity }
 * elevator        — есть ли лифт (ставится в середине коридора)
 * entrance        — есть ли вход с улицы на этот этаж (обычно только 1 этаж)
 * fillCat         — категория, которой автозаполняются пустые слоты
 */
function buildFloor(buildingCode, level, opts) {
  const { units, special = [], elevator = false, entrance = false, fillCat = 'audience', name } = opts;
  const occupied = new Set(special.map(r => `${r.unit}:${r.side}`));
  const rooms = [];
  // Автонумерация продолжается после наибольшего явно заданного номера
  // на этаже (например 201..205), чтобы не сталкиваться с ним.
  const levelPrefix = String(level);
  let maxExplicit = 0;
  special.forEach(r => {
    if (!r.num || !r.num.startsWith(levelPrefix)) return;
    const tail = parseInt(r.num.slice(levelPrefix.length), 10);
    if (!isNaN(tail)) maxExplicit = Math.max(maxExplicit, tail);
  });
  let autoIdx = maxExplicit + 1;

  function place(r) {
    const cat = CATEGORIES[r.cat] ? r.cat : 'audience';
    const label = CATEGORIES[cat].label;
    // Служебные помещения (гардероб, холл, туалет и т.п.) в реальных
    // зданиях обычно не имеют номера — не резервируем для них номер и
    // не сдвигаем счётчик, чтобы не сталкивать их с нумерованными
    // аудиториями/кабинетами на том же этаже.
    const numberless = NO_NUMBER_CATEGORIES.has(cat) && !r.num;
    const num = numberless ? '' : (r.num || `${level}${String(autoIdx++).padStart(2, '0')}`);
    rooms.push({
      id: nextId('room'),
      buildingCode, level, unit: r.unit, side: r.side,
      category: cat,
      number: num,
      name: r.name || `${label} ${num}`,
      capacity: r.capacity || null,
    });
  }

  special.forEach(place);

  for (let u = 1; u <= units - 2; u++) {
    for (const side of ['top', 'bottom']) {
      const key = `${u}:${side}`;
      if (occupied.has(key)) continue;
      place({ unit: u, side, cat: fillCat });
    }
  }

  const stairUnits = [0, units - 1];

  return {
    level,
    name: name || `${level} этаж`,
    units,
    entrance,
    elevator,
    stairUnits,
    rooms,
  };
}

function buildBuilding(id, code, name, address, description, floorsSpec) {
  const floors = floorsSpec.map(spec => buildFloor(code, spec.level, spec));
  return { id, code, name, address, description, floors };
}

// ---------------------------------------------------------------------
// Корпус 1 — Главное здание
// ---------------------------------------------------------------------
const MAIN = buildBuilding(
  'main', 'К1', 'Главный корпус',
  'просп. Вернадского, 76',
  'Ректорат, деканаты, актовый зал, крупные поточные аудитории.',
  [
    {
      level: 1, units: 9, entrance: true, elevator: true,
      name: '1 этаж — вестибюль и актовый зал',
      special: [
        { unit: 1, side: 'top', cat: 'wardrobe', name: 'Гардероб' },
        { unit: 1, side: 'bottom', cat: 'atrium', name: 'Вестибюль' },
        { unit: 2, side: 'top', cat: 'hall', num: '101', name: 'Актовый зал', capacity: 400 },
        { unit: 3, side: 'top', cat: 'hall', num: '101', name: 'Актовый зал (продолжение)', capacity: 400 },
        { unit: 2, side: 'bottom', cat: 'food', name: 'Буфет' },
        { unit: 3, side: 'bottom', cat: 'food', name: 'Столовая' },
        { unit: 4, side: 'bottom', cat: 'medical', name: 'Медицинский пункт' },
        { unit: 5, side: 'top', cat: 'admin', num: '110', name: 'Приёмная ректора' },
        { unit: 5, side: 'bottom', cat: 'admin', num: '111', name: 'Ректорат' },
        { unit: 6, side: 'top', cat: 'admin', num: '112', name: 'Управление международных связей' },
        { unit: 6, side: 'bottom', cat: 'audience', num: '113', name: 'Приёмная комиссия', capacity: null },
        { unit: 7, side: 'top', cat: 'restroom', name: 'Туалет' },
        { unit: 7, side: 'bottom', cat: 'restroom', name: 'Туалет' },
      ],
    },
    {
      level: 2, units: 9, elevator: true,
      name: '2 этаж — деканаты',
      special: [
        { unit: 1, side: 'top', cat: 'dean', num: '201', name: 'Деканат факультета международных отношений' },
        { unit: 1, side: 'bottom', cat: 'dean', num: '202', name: 'Деканат международно-правового факультета' },
        { unit: 2, side: 'top', cat: 'dean', num: '203', name: 'Деканат факультета международной журналистики' },
        { unit: 2, side: 'bottom', cat: 'dean', num: '204', name: 'Деканат факультета МЭО' },
        { unit: 3, side: 'top', cat: 'audience', num: '205', name: 'Поточная аудитория 205', capacity: 150 },
        { unit: 4, side: 'top', cat: 'audience', num: '206', name: 'Поточная аудитория 206', capacity: 150 },
        { unit: 5, side: 'bottom', cat: 'office', num: '207', name: 'Кабинет проректора по учебной работе' },
        { unit: 6, side: 'top', cat: 'service', name: 'Учебный отдел' },
      ],
    },
    {
      level: 3, units: 9, elevator: true,
      name: '3 этаж — аудитории',
      special: [
        { unit: 4, side: 'top', cat: 'hall', num: '305', name: 'Конференц-зал им. А.А. Громыко', capacity: 120 },
      ],
    },
    {
      level: 4, units: 7, elevator: true,
      name: '4 этаж — аспирантура',
      special: [
        { unit: 1, side: 'top', cat: 'admin', num: '401', name: 'Отдел аспирантуры и докторантуры' },
        { unit: 2, side: 'bottom', cat: 'library', num: '402', name: 'Зал диссертаций' },
      ],
    },
  ]
);

// ---------------------------------------------------------------------
// Корпус 2 — гуманитарный (международное право, политология, экономика)
// ---------------------------------------------------------------------
const BLD2 = buildBuilding(
  'corpus2', 'К2', 'Корпус 2',
  'просп. Вернадского, 76, стр. 2',
  'Кафедры международного права, политологии, экономического факультета.',
  [
    {
      level: 1, units: 8, entrance: true,
      name: '1 этаж',
      special: [
        { unit: 1, side: 'top', cat: 'wardrobe', name: 'Гардероб' },
        { unit: 1, side: 'bottom', cat: 'food', name: 'Буфет' },
        { unit: 2, side: 'top', cat: 'computer', num: '110', name: 'Компьютерный класс №1' },
        { unit: 2, side: 'bottom', cat: 'computer', num: '111', name: 'Компьютерный класс №2' },
        { unit: 3, side: 'top', cat: 'restroom', name: 'Туалет' },
      ],
    },
    {
      level: 2, units: 8,
      name: '2 этаж — международное право',
      special: [
        { unit: 1, side: 'top', cat: 'dept', num: '201', name: 'Кафедра международного права' },
        { unit: 1, side: 'bottom', cat: 'dept', num: '202', name: 'Кафедра европейского права' },
        { unit: 2, side: 'top', cat: 'office', num: '203', name: 'Кабинет заведующего кафедрой МП' },
        { unit: 6, side: 'bottom', cat: 'audience', num: '208', name: 'Поточная аудитория 208', capacity: 100 },
      ],
    },
    {
      level: 3, units: 8,
      name: '3 этаж — политология и экономика',
      special: [
        { unit: 1, side: 'top', cat: 'dept', num: '301', name: 'Кафедра политической теории' },
        { unit: 1, side: 'bottom', cat: 'dept', num: '302', name: 'Кафедра мировой экономики' },
        { unit: 2, side: 'top', cat: 'lab', num: '303', name: 'Лаборатория экономического анализа' },
      ],
    },
  ]
);

// ---------------------------------------------------------------------
// Корпус 3 — лингвистический (кафедры иностранных языков)
// ---------------------------------------------------------------------
const LANGS = ['английского', 'французского', 'немецкого', 'испанского', 'китайского', 'арабского', 'итальянского', 'японского', 'персидского', 'португальского'];

const BLD3 = buildBuilding(
  'corpus3', 'К3', 'Корпус 3',
  'просп. Вернадского, 78',
  'Кафедры иностранных языков и лингафонные кабинеты — МГИМО преподаёт более 50 языков.',
  [
    {
      level: 1, units: 9, entrance: true,
      name: '1 этаж',
      special: [
        { unit: 1, side: 'top', cat: 'wardrobe', name: 'Гардероб' },
        { unit: 1, side: 'bottom', cat: 'atrium', name: 'Холл' },
        { unit: 2, side: 'top', cat: 'dept', num: '101', name: `Кафедра ${LANGS[0]} языка №1` },
        { unit: 2, side: 'bottom', cat: 'dept', num: '102', name: `Кафедра ${LANGS[1]} языка` },
      ],
    },
    {
      level: 2, units: 9,
      name: '2 этаж — лингафонные кабинеты',
      fillCat: 'language',
      special: [
        { unit: 1, side: 'top', cat: 'dept', num: '201', name: `Кафедра ${LANGS[2]} языка` },
        { unit: 1, side: 'bottom', cat: 'dept', num: '202', name: `Кафедра ${LANGS[3]} языка` },
        { unit: 2, side: 'top', cat: 'language', num: '203', name: 'Лингафонный кабинет №1' },
        { unit: 3, side: 'top', cat: 'language', num: '204', name: 'Лингафонный кабинет №2' },
        { unit: 2, side: 'bottom', cat: 'language', num: '205', name: 'Лингафонный кабинет №3' },
      ],
    },
    {
      level: 3, units: 9,
      name: '3 этаж — восточные и редкие языки',
      special: [
        { unit: 1, side: 'top', cat: 'dept', num: '301', name: `Кафедра ${LANGS[4]} языка` },
        { unit: 1, side: 'bottom', cat: 'dept', num: '302', name: `Кафедра ${LANGS[5]} языка` },
        { unit: 2, side: 'top', cat: 'dept', num: '303', name: `Кафедра ${LANGS[8]} языка` },
        { unit: 2, side: 'bottom', cat: 'language', num: '304', name: 'Лингафонный кабинет №4' },
      ],
    },
  ]
);

// ---------------------------------------------------------------------
// Библиотечный корпус
// ---------------------------------------------------------------------
const LIB = buildBuilding(
  'library', 'БИБ', 'Библиотечный корпус',
  'просп. Вернадского, 76, стр. 4',
  'Научная библиотека МГИМО — читальные залы, абонемент, книгохранилище.',
  [
    {
      level: 1, units: 7, entrance: true,
      name: '1 этаж — абонемент',
      special: [
        { unit: 1, side: 'top', cat: 'wardrobe', name: 'Гардероб' },
        { unit: 2, side: 'top', cat: 'library', num: '101', name: 'Абонемент учебной литературы' },
        { unit: 3, side: 'top', cat: 'library', num: '102', name: 'Зал каталогов' },
        { unit: 2, side: 'bottom', cat: 'service', name: 'Книгохранилище' },
        { unit: 4, side: 'bottom', cat: 'restroom', name: 'Туалет' },
      ],
    },
    {
      level: 2, units: 7,
      name: '2 этаж — читальные залы',
      fillCat: 'library',
      special: [
        { unit: 1, side: 'top', cat: 'library', num: '201', name: 'Читальный зал №1 (периодика)', capacity: 60 },
        { unit: 3, side: 'top', cat: 'library', num: '202', name: 'Читальный зал №2 (диссертации)', capacity: 40 },
        { unit: 2, side: 'bottom', cat: 'library', num: '203', name: 'Зал редких книг' },
      ],
    },
  ]
);

// ---------------------------------------------------------------------
// Спортивный комплекс
// ---------------------------------------------------------------------
const SPORT = buildBuilding(
  'sport', 'СК', 'Спортивный комплекс',
  'просп. Вернадского, 76, стр. 5',
  'Игровые залы, бассейн, тренажёрные залы.',
  [
    {
      level: 1, units: 7, entrance: true,
      name: '1 этаж',
      special: [
        { unit: 1, side: 'top', cat: 'wardrobe', name: 'Раздевалка (муж.)' },
        { unit: 1, side: 'bottom', cat: 'wardrobe', name: 'Раздевалка (жен.)' },
        { unit: 2, side: 'top', cat: 'pool', num: '101', name: 'Бассейн', capacity: 30 },
        { unit: 2, side: 'bottom', cat: 'sport', num: '102', name: 'Тренажёрный зал' },
        { unit: 4, side: 'top', cat: 'medical', name: 'Медицинский пункт' },
      ],
    },
    {
      level: 2, units: 7,
      name: '2 этаж — игровые залы',
      fillCat: 'sport',
      special: [
        { unit: 1, side: 'top', cat: 'sport', num: '201', name: 'Игровой зал (баскетбол/волейбол)', capacity: 80 },
        { unit: 3, side: 'top', cat: 'sport', num: '202', name: 'Зал единоборств' },
        { unit: 2, side: 'bottom', cat: 'sport', num: '203', name: 'Зал аэробики и фитнеса' },
      ],
    },
  ]
);

const BUILDINGS = [MAIN, BLD2, BLD3, LIB, SPORT];

// ---------------------------------------------------------------------
// Схематичное расположение корпусов на территории кампуса (для обзорной
// карты и расчёта пешеходных расстояний между зданиями). Координаты
// условны и не привязаны к реальной геодезии.
// ---------------------------------------------------------------------
const CAMPUS_LAYOUT = {
  hub: { x: 480, y: 420 },
  buildings: {
    main:    { x: 460, y: 200, w: 260, h: 140, walkToHub: 60 },
    corpus2: { x: 780, y: 260, w: 180, h: 120, walkToHub: 90 },
    corpus3: { x: 160, y: 260, w: 180, h: 120, walkToHub: 90 },
    library: { x: 460, y: 560, w: 200, h: 110, walkToHub: 70 },
    sport:   { x: 780, y: 560, w: 200, h: 110, walkToHub: 140 },
  },
};

if (typeof window !== 'undefined') {
  window.CATEGORIES = CATEGORIES;
  window.BUILDINGS = BUILDINGS;
  window.CAMPUS_LAYOUT = CAMPUS_LAYOUT;
  window.MAP_GEOM = { UNIT, ROOM_W, ROOM_H, CORRIDOR_Y, CORRIDOR_H, MARGIN_X };
}
