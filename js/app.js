/* ===================================================================
 * app.js — состояние приложения и связывание UI с картой/поиском/
 * маршрутизацией.
 * =================================================================== */

(function () {
  const graph = buildCampusGraph(BUILDINGS, CAMPUS_LAYOUT);
  const searchIndex = buildSearchIndex(BUILDINGS);

  const state = {
    currentBuildingId: BUILDINGS[0].id,
    currentLevel: BUILDINGS[0].floors[0].level,
    showCampusOverview: true,
    categoryFilter: null,
    highlightRoomId: null,
    route: null,       // { path, distance, segments, fromItem, toItem }
    routeFromItem: null,
    routeToItem: null,
    mode: 'explore',
  };

  const svg = document.getElementById('map-svg');
  const viewport = document.getElementById('map-viewport');
  const panzoom = createPanZoom(svg, viewport);

  const el = {
    buildingList: document.getElementById('building-list'),
    legend: document.getElementById('legend'),
    floorTabs: document.getElementById('floor-tabs'),
    breadcrumb: document.getElementById('breadcrumb'),
    roomDetail: document.getElementById('room-detail'),
    modeTabs: document.getElementById('mode-tabs'),
    panelExplore: document.getElementById('panel-explore'),
    panelRoute: document.getElementById('panel-route'),
    globalSearch: document.getElementById('global-search'),
    globalSearchResults: document.getElementById('global-search-results'),
    routeFrom: document.getElementById('route-from'),
    routeFromResults: document.getElementById('route-from-results'),
    routeTo: document.getElementById('route-to'),
    routeToResults: document.getElementById('route-to-results'),
    swapBtn: document.getElementById('swap-btn'),
    buildRouteBtn: document.getElementById('build-route-btn'),
    routeSummary: document.getElementById('route-summary'),
    routeSteps: document.getElementById('route-steps'),
    zoomIn: document.getElementById('zoom-in'),
    zoomOut: document.getElementById('zoom-out'),
    zoomReset: document.getElementById('zoom-reset'),
    showCampusBtn: document.getElementById('show-campus'),
  };

  function currentBuilding() { return BUILDINGS.find(b => b.id === state.currentBuildingId); }
  function currentFloor() {
    const b = currentBuilding();
    return b.floors.find(f => f.level === state.currentLevel) || b.floors[0];
  }

  // -------------------------------------------------------------
  // Навигация
  // -------------------------------------------------------------
  function selectBuilding(id, level) {
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) return;
    state.currentBuildingId = id;
    state.currentLevel = level || b.floors[0].level;
    state.showCampusOverview = false;
    renderFloorTabs();
    renderBreadcrumb();
    renderMap();
    renderBuildingList();
  }

  function selectLevel(level) {
    state.currentLevel = level;
    renderFloorTabs();
    renderBreadcrumb();
    renderMap();
  }

  function toggleCampusOverview() {
    state.showCampusOverview = true;
    renderBreadcrumb();
    renderMap();
  }

  // -------------------------------------------------------------
  // Рендер бокового списка корпусов
  // -------------------------------------------------------------
  function renderBuildingList() {
    clear(el.buildingList);
    BUILDINGS.forEach(b => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'building-card' + (!state.showCampusOverview && state.currentBuildingId === b.id ? ' active' : '');
      card.innerHTML = `
        <div class="building-card-code">${b.code}</div>
        <div>
          <div class="building-card-name">${b.name}</div>
          <div class="building-card-addr">${b.address}</div>
        </div>`;
      card.addEventListener('click', () => selectBuilding(b.id));
      el.buildingList.appendChild(card);
    });
  }

  function renderFloorTabs() {
    const b = currentBuilding();
    clear(el.floorTabs);
    b.floors.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'floor-tab' + (f.level === state.currentLevel && !state.showCampusOverview ? ' active' : '');
      btn.textContent = `${f.level} эт.`;
      btn.addEventListener('click', () => selectLevel(f.level));
      el.floorTabs.appendChild(btn);
    });
    el.floorTabs.style.display = state.showCampusOverview ? 'none' : 'flex';
  }

  function renderBreadcrumb() {
    if (state.showCampusOverview) {
      el.breadcrumb.textContent = 'Обзор кампуса — все корпуса МГИМО';
    } else {
      const b = currentBuilding(), f = currentFloor();
      el.breadcrumb.textContent = `${b.name} · ${f.name}`;
    }
  }

  // -------------------------------------------------------------
  // Карта
  // -------------------------------------------------------------
  function getRouteNodeIdsForView() {
    if (!state.route) return null;
    const path = state.route.path;
    if (state.showCampusOverview) {
      return path.filter(id => {
        const n = graph.nodes.get(id);
        return n.type === 'hub' || n.type === 'entrance';
      });
    }
    return path.filter(id => {
      const n = graph.nodes.get(id);
      return n.type !== 'hub' && n.buildingId === state.currentBuildingId && n.level === state.currentLevel;
    });
  }

  function renderMap() {
    const routeIds = getRouteNodeIdsForView();
    const isStart = !!(routeIds && routeIds.length && state.route && routeIds[0] === state.route.path[0]);
    const isEnd = !!(routeIds && routeIds.length && state.route && routeIds[routeIds.length - 1] === state.route.path[state.route.path.length - 1]);

    if (state.showCampusOverview) {
      svg.setAttribute('viewBox', computeCampusViewBox(CAMPUS_LAYOUT).join(' '));
      renderCampusOverview(viewport, graph, BUILDINGS, CAMPUS_LAYOUT, {
        highlightBuildingId: state.currentBuildingId,
        routeNodeIds: routeIds,
        isRouteStart: isStart,
        isRouteEnd: isEnd,
        onSelectBuilding: (id) => selectBuilding(id),
      });
    } else {
      const b = currentBuilding(), f = currentFloor();
      svg.setAttribute('viewBox', computeFloorViewBox(f).join(' '));
      renderFloorPlan(viewport, graph, b, f, {
        highlightRoomId: state.highlightRoomId,
        categoryFilter: state.categoryFilter,
        routeNodeIds: routeIds,
        isRouteStart: isStart,
        isRouteEnd: isEnd,
        onRoomClick: (roomId) => showRoomDetail(roomId),
      });
    }
    panzoom.reset();
  }

  function showRoomDetail(roomId) {
    const idx = searchIndex.find(x => x.id === roomId);
    state.highlightRoomId = roomId;
    renderMap();
    if (!idx) { el.roomDetail.classList.add('hidden'); return; }
    el.roomDetail.classList.remove('hidden');
    const catColor = idx.categoryKey ? CATEGORIES[idx.categoryKey].color : '#333';
    el.roomDetail.innerHTML = `
      <button class="room-detail-close" aria-label="Закрыть">×</button>
      <div class="room-detail-cat" style="color:${catColor}">${idx.categoryLabel}</div>
      <div class="room-detail-title">${idx.name}</div>
      <div class="room-detail-meta">${idx.buildingName} · ${idx.level} этаж${idx.capacity ? ` · вместимость ${idx.capacity}` : ''}</div>
      <div class="room-detail-actions">
        <button class="btn-small" id="set-from-btn">Отсюда маршрут</button>
        <button class="btn-small btn-primary" id="set-to-btn">Сюда маршрут</button>
      </div>`;
    el.roomDetail.querySelector('.room-detail-close').addEventListener('click', () => {
      el.roomDetail.classList.add('hidden');
      state.highlightRoomId = null;
      renderMap();
    });
    el.roomDetail.querySelector('#set-from-btn').addEventListener('click', () => {
      pickRouteItem('from', idx);
      switchMode('route');
    });
    el.roomDetail.querySelector('#set-to-btn').addEventListener('click', () => {
      pickRouteItem('to', idx);
      switchMode('route');
    });
  }

  function navigateToIndexItem(item) {
    selectBuilding(item.buildingId, item.level);
    if (item.kind === 'room') showRoomDetail(item.id);
  }

  // -------------------------------------------------------------
  // Поиск (универсальный виджет)
  // -------------------------------------------------------------
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function renderDropdown(dropdownEl, results, onPick) {
    clear(dropdownEl);
    if (!results.length) {
      dropdownEl.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
      dropdownEl.classList.add('open');
      return;
    }
    results.forEach(item => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'search-result-item';
      row.innerHTML = `
        <span class="search-result-num">${item.number || '—'}</span>
        <span class="search-result-body">
          <span class="search-result-name">${item.name}</span>
          <span class="search-result-meta">${item.categoryLabel} · ${item.buildingName}, ${item.level} эт.</span>
        </span>`;
      row.addEventListener('click', () => onPick(item));
      dropdownEl.appendChild(row);
    });
    dropdownEl.classList.add('open');
  }

  function attachSearchField(inputEl, dropdownEl, onPick, opts = {}) {
    let timer = null;
    inputEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = inputEl.value;
        if (!q.trim()) { dropdownEl.classList.remove('open'); clear(dropdownEl); return; }
        const results = searchRooms(searchIndex, q, { categoryFilter: opts.categoryFilter ? opts.categoryFilter() : null });
        renderDropdown(dropdownEl, results, (item) => {
          inputEl.value = `${item.number ? item.number + ' — ' : ''}${item.name}`;
          dropdownEl.classList.remove('open');
          onPick(item);
        });
      }, 120);
    });
    inputEl.addEventListener('focus', () => { if (dropdownEl.childElementCount) dropdownEl.classList.add('open'); });
    document.addEventListener('click', (e) => {
      if (e.target !== inputEl && !dropdownEl.contains(e.target)) dropdownEl.classList.remove('open');
    });
  }

  attachSearchField(el.globalSearch, el.globalSearchResults, navigateToIndexItem, { categoryFilter: () => state.categoryFilter });
  attachSearchField(el.routeFrom, el.routeFromResults, (item) => pickRouteItem('from', item));
  attachSearchField(el.routeTo, el.routeToResults, (item) => pickRouteItem('to', item));

  function pickRouteItem(which, item) {
    if (which === 'from') {
      state.routeFromItem = item;
      el.routeFrom.value = `${item.number ? item.number + ' — ' : ''}${item.name}`;
    } else {
      state.routeToItem = item;
      el.routeTo.value = `${item.number ? item.number + ' — ' : ''}${item.name}`;
    }
  }

  el.swapBtn.addEventListener('click', () => {
    const f = state.routeFromItem, t = state.routeToItem;
    state.routeFromItem = t; state.routeToItem = f;
    el.routeFrom.value = t ? `${t.number ? t.number + ' — ' : ''}${t.name}` : '';
    el.routeTo.value = f ? `${f.number ? f.number + ' — ' : ''}${f.name}` : '';
  });

  // -------------------------------------------------------------
  // Маршрутизация
  // -------------------------------------------------------------
  function metersLabel(m) { return `${Math.round(m)} м`; }

  function segmentDistance(nodeIds) {
    let total = 0;
    for (let i = 1; i < nodeIds.length; i++) {
      const edges = graph.adj.get(nodeIds[i - 1]) || [];
      const e = edges.find(x => x.to === nodeIds[i]);
      if (e) total += e.weight;
    }
    return total;
  }

  function nodeShortLabel(id) {
    const n = graph.nodes.get(id);
    if (n.type === 'room') return n.room.name;
    if (n.type === 'entrance') return `входа в ${n.buildingName}`;
    if (n.type === 'stair') return 'лестницы';
    if (n.type === 'elevator') return 'лифта';
    return 'коридора';
  }

  function describeSegments(segments) {
    const steps = [];
    segments.forEach((seg, i) => {
      const dist = segmentDistance(seg.nodeIds);
      if (seg.type === 'campus') {
        const fromN = graph.nodes.get(seg.nodeIds[0]);
        const toN = graph.nodes.get(seg.nodeIds[seg.nodeIds.length - 1]);
        const fromLabel = fromN.type === 'entrance' ? fromN.buildingName : 'территории кампуса';
        const toLabel = toN.type === 'entrance' ? toN.buildingName : 'территории кампуса';
        steps.push({ segIndex: i, text: `Пройти по территории кампуса: от «${fromLabel}» до «${toLabel}» (~${metersLabel(dist)})` });
      } else {
        const b = BUILDINGS.find(x => x.id === seg.buildingId);
        const floor = b.floors.find(x => x.level === seg.level);
        const startId = seg.nodeIds[0], endId = seg.nodeIds[seg.nodeIds.length - 1];
        const startType = graph.nodes.get(startId).type;
        const prevSeg = segments[i - 1];
        let intro = `${b.name}, ${floor.name}`;
        if (prevSeg && prevSeg.type === 'floor' && prevSeg.buildingId === seg.buildingId) {
          const viaType = startType === 'elevator' ? 'на лифте' : 'по лестнице';
          const dir = seg.level > prevSeg.level ? 'подняться' : 'спуститься';
          intro = `${dir.charAt(0).toUpperCase() + dir.slice(1)} ${viaType} на ${seg.level} этаж (${b.name})`;
        }
        const endLabel = nodeShortLabel(endId);
        steps.push({ segIndex: i, text: `${intro} — далее до ${endLabel} (~${metersLabel(dist)})` });
      }
    });
    return steps;
  }

  function jumpToSegment(i) {
    state.highlightRoomId = null;
    el.roomDetail.classList.add('hidden');
    const seg = state.route.segments[i];
    if (seg.type === 'campus') {
      toggleCampusOverview();
    } else {
      selectBuilding(seg.buildingId, seg.level);
    }
  }

  function buildRoute() {
    if (!state.routeFromItem || !state.routeToItem) {
      el.routeSummary.innerHTML = '<div class="route-warning">Выберите точку «Откуда» и «Куда» из подсказок поиска.</div>';
      return;
    }
    const result = dijkstra(graph, state.routeFromItem.id, state.routeToItem.id);
    if (!result) {
      el.routeSummary.innerHTML = '<div class="route-warning">Маршрут не найден.</div>';
      return;
    }
    const segments = splitRouteIntoSegments(graph, result.path);
    state.route = { path: result.path, distance: result.distance, segments, fromItem: state.routeFromItem, toItem: state.routeToItem };

    el.routeSummary.innerHTML = `
      <div class="route-summary-card">
        <div class="route-summary-dist">≈ ${metersLabel(result.distance)}</div>
        <div class="route-summary-sub">пешком, ${segments.filter(s => s.type === 'floor').length} этаж(ей) маршрута</div>
      </div>`;

    const steps = describeSegments(segments);
    clear(el.routeSteps);
    steps.forEach((s, idx) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'route-step';
      item.innerHTML = `<span class="route-step-num">${idx + 1}</span><span>${s.text}</span>`;
      item.addEventListener('click', () => jumpToSegment(s.segIndex));
      el.routeSteps.appendChild(item);
    });

    jumpToSegment(0);
  }

  el.buildRouteBtn.addEventListener('click', buildRoute);

  // -------------------------------------------------------------
  // Режимы (Карта / Маршрут), легенда, зум
  // -------------------------------------------------------------
  function switchMode(mode) {
    state.mode = mode;
    [...el.modeTabs.children].forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    el.panelExplore.classList.toggle('hidden', mode !== 'explore');
    el.panelRoute.classList.toggle('hidden', mode !== 'route');
  }
  [...el.modeTabs.children].forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));

  function refreshLegend() {
    renderLegend(el.legend, CATEGORIES, state.categoryFilter, (label) => {
      state.categoryFilter = label;
      refreshLegend();
      renderMap();
    });
  }
  refreshLegend();

  el.zoomIn.addEventListener('click', () => panzoom.zoomBy(1.25));
  el.zoomOut.addEventListener('click', () => panzoom.zoomBy(1 / 1.25));
  el.zoomReset.addEventListener('click', () => panzoom.reset());
  el.showCampusBtn.addEventListener('click', toggleCampusOverview);

  // -------------------------------------------------------------
  // Инициализация
  // -------------------------------------------------------------
  renderBuildingList();
  renderFloorTabs();
  renderBreadcrumb();
  renderMap();
})();
