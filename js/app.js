/* ===================================================================
 * app.js — состояние приложения, связывание UI, карты, поиска и
 * построения маршрутов.
 * =================================================================== */

(function () {
  const graph = buildCampusGraph(BUILDINGS, CAMPUS_LAYOUT);
  const searchIndex = buildSearchIndex(graph, BUILDINGS);

  const state = {
    buildingId: BUILDINGS[0].id,
    level: 1,
    campusView: true,
    picked: false,
    categoryFilter: null,
    highlightRoomId: null,
    route: null,
    from: null,
    to: null,
    mode: 'explore',
  };

  const svg = document.getElementById('map-svg');
  const viewport = document.getElementById('map-viewport');
  const panzoom = createPanZoom(svg, viewport);

  const $ = id => document.getElementById(id);
  const el = {
    buildingList: $('building-list'), legend: $('legend'), floorTabs: $('floor-tabs'),
    breadcrumb: $('breadcrumb'), floorNote: $('floor-note'), roomDetail: $('room-detail'),
    modeTabs: $('mode-tabs'), panelExplore: $('panel-explore'), panelRoute: $('panel-route'),
    globalSearch: $('global-search'), globalSearchResults: $('global-search-results'),
    routeFrom: $('route-from'), routeFromResults: $('route-from-results'),
    routeTo: $('route-to'), routeToResults: $('route-to-results'),
    swapBtn: $('swap-btn'), buildRouteBtn: $('build-route-btn'), clearRouteBtn: $('clear-route-btn'),
    routeSummary: $('route-summary'), routeSteps: $('route-steps'),
    zoomIn: $('zoom-in'), zoomOut: $('zoom-out'), zoomReset: $('zoom-reset'),
    showCampusBtn: $('show-campus'), numberingHint: $('numbering-hint'),
  };

  const clear = node => { while (node.firstChild) node.removeChild(node.firstChild); };
  const building = () => BUILDINGS.find(b => b.id === state.buildingId);
  const floorOf = () => {
    const b = building();
    return b.floors.find(f => f.level === state.level) || b.floors[0];
  };
  const floorTabLabel = lvl => (lvl === 0 ? 'Цоколь' : `${lvl} эт.`);
  const meters = m => `${Math.round(m)} м`;
  const minutes = m => Math.max(1, Math.round(m / 70)); // ~70 м/мин пешком

  // -------------------------------------------------------------
  // Навигация
  // -------------------------------------------------------------
  /** Карточка помещения относится к конкретному этажу — при уходе с него скрываем. */
  function clearRoomDetail() {
    state.highlightRoomId = null;
    el.roomDetail.classList.add('hidden');
  }

  function goToBuilding(id, level) {
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) return;
    clearRoomDetail();
    state.buildingId = id;
    state.level = (level !== undefined && b.floors.some(f => f.level === level))
      ? level
      : (b.floors.find(f => f.level === 1) || b.floors[0]).level;
    state.campusView = false;
    state.picked = true;
    renderAll();
    syncUrl();
  }

  function goToLevel(level) {
    clearRoomDetail();
    state.level = level;
    state.campusView = false;
    renderAll();
    syncUrl();
  }

  function showCampus() {
    clearRoomDetail();
    state.campusView = true;
    renderAll();
    syncUrl();
  }

  /** Адрес страницы отражает текущий вид, чтобы им можно было поделиться. */
  function syncUrl() {
    const p = new URLSearchParams();
    if (state.highlightRoomId) {
      const item = searchIndex.find(x => x.id === state.highlightRoomId);
      if (item && item.number) p.set('room', item.number);
    }
    if (!p.has('room') && !state.campusView) {
      p.set('b', state.buildingId);
      p.set('f', String(state.level));
    }
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  function renderAll() {
    renderBuildingList();
    renderFloorTabs();
    renderHeaderInfo();
    renderMap();
  }

  // -------------------------------------------------------------
  // Боковая панель
  // -------------------------------------------------------------
  function renderBuildingList() {
    clear(el.buildingList);
    BUILDINGS.forEach(b => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'building-card' + (!state.campusView && state.buildingId === b.id ? ' active' : '');
      card.innerHTML = `
        <span class="building-card-code">${b.code}</span>
        <span class="building-card-body">
          <span class="building-card-name">${b.name}</span>
          <span class="building-card-addr">${b.floors.length} эт. · ${b.about}</span>
        </span>`;
      card.addEventListener('click', () => goToBuilding(b.id));
      el.buildingList.appendChild(card);
    });
  }

  function renderFloorTabs() {
    clear(el.floorTabs);
    if (state.campusView) { el.floorTabs.style.display = 'none'; return; }
    el.floorTabs.style.display = 'flex';
    building().floors.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'floor-tab' + (f.level === state.level ? ' active' : '');
      btn.textContent = floorTabLabel(f.level);
      btn.title = f.label;
      btn.addEventListener('click', () => goToLevel(f.level));
      el.floorTabs.appendChild(btn);
    });
  }

  function renderHeaderInfo() {
    if (state.campusView) {
      el.breadcrumb.textContent = 'Территория МГИМО — все корпуса';
      el.floorNote.textContent = 'Нажмите на корпус, чтобы открыть поэтажный план.';
      el.numberingHint.textContent = '';
      return;
    }
    const b = building(), f = floorOf();
    const official = hasOfficialPlan(b.id, f.level);
    el.breadcrumb.innerHTML = `${b.name} · ${f.label}`
      + (official
        ? ' <span class="plan-badge plan-badge--official">официальный план</span>'
        : ' <span class="plan-badge">схема</span>');
    el.floorNote.textContent = official
      ? 'Официальный поэтажный план МГИМО. Нажмите на помещение, чтобы увидеть его назначение.'
      : (f.note || '');
    el.numberingHint.textContent = b.numbering || '';
  }

  // -------------------------------------------------------------
  // Карта
  // -------------------------------------------------------------
  function routeNodesForView() {
    if (!state.route) return null;
    const path = state.route.path;
    if (state.campusView) {
      return path.filter(id => {
        const n = graph.nodes.get(id);
        return n.type === 'hub' || n.type === 'outdoor';
      });
    }
    return path.filter(id => {
      const n = graph.nodes.get(id);
      return n.type !== 'hub' && n.type !== 'outdoor'
        && n.buildingId === state.buildingId && n.level === state.level;
    });
  }

  /** Отрисовка официального поэтажного плана МГИМО. */
  async function renderOfficialFloor() {
    const b = building(), f = floorOf();
    const plan = await loadPlan(b.id, f.level);
    if (!plan) return false;

    while (viewport.firstChild) viewport.removeChild(viewport.firstChild);
    svg.setAttribute('viewBox', plan.viewBox.join(' '));
    const { group, rooms } = mountPlan(viewport, plan);
    labelPlan(group, rooms, plan.viewBox);

    const prefix = `plan:${b.id}:${f.level}:`;
    group.querySelectorAll('.plan-room').forEach(el => {
      el.addEventListener('click', () => showRoomDetail(prefix + el.dataset.planRoom));
      if (state.categoryFilter && el.dataset.cat !== state.categoryFilter) el.classList.add('plan-room--dim');
    });

    if (state.highlightRoomId && state.highlightRoomId.startsWith(prefix)) {
      const svgId = state.highlightRoomId.slice(prefix.length);
      const el = [...group.querySelectorAll('.plan-room')].find(x => x.dataset.planRoom === svgId);
      if (el) el.classList.add('plan-room--highlight');
    }

    drawPlanRoute(group, plan, rooms);
    panzoom.reset();
    return true;
  }

  /** Маршрут по настоящей геометрии плана (A* по свободному месту). */
  function drawPlanRoute(group, plan, rooms) {
    if (!state.route) return;
    const onThisFloor = state.route.path
      .map(id => ({ id, n: graph.nodes.get(id) }))
      .filter(x => x.n.type === 'planroom' && x.n.buildingId === plan.meta.b && x.n.level === plan.meta.lvl);
    if (!onThisFloor.length) return;

    const byId = new Map(rooms.map(r => [r.id, r]));
    const center = svgId => {
      const r = byId.get(svgId);
      return r ? { x: r.box.x + r.box.width / 2, y: r.box.y + r.box.height / 2 } : null;
    };
    const NS = 'http://www.w3.org/2000/svg';

    if (onThisFloor.length >= 2) {
      const from = center(onThisFloor[0].n.svgId);
      const to = center(onThisFloor[onThisFloor.length - 1].n.svgId);
      if (from && to) {
        const grid = buildPlanGrid(group, plan);
        const res = findPathOnPlan(grid, from, to);
        if (res) {
          const d = [{ x: from.x, y: from.y }, ...res.points, { x: to.x, y: to.y }]
            .map((pt, i) => `${i ? 'L' : 'M'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
          const w = Math.max(plan.viewBox[2], plan.viewBox[3]) / 200;
          [['route-shadow', w * 1.9], ['route-line', w]].forEach(([cls, sw]) => {
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', d);
            path.setAttribute('class', cls);
            path.setAttribute('stroke-width', sw);
            group.appendChild(path);
          });
        }
      }
    }

    // Метки начала и конца всего маршрута, если они на этом этаже
    const path = state.route.path;
    const mark = (nodeId, kind) => {
      const n = graph.nodes.get(nodeId);
      if (!n || n.type !== 'planroom' || n.buildingId !== plan.meta.b || n.level !== plan.meta.lvl) return;
      const c = center(n.svgId);
      if (!c) return;
      const r = Math.max(plan.viewBox[2], plan.viewBox[3]) / 90;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `route-pin route-pin--${kind}`);
      g.setAttribute('transform', `translate(${c.x} ${c.y})`);
      const halo = document.createElementNS(NS, 'circle');
      halo.setAttribute('r', r); halo.setAttribute('class', 'route-pin-halo');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', r * 0.55); dot.setAttribute('class', 'route-pin-dot');
      g.appendChild(halo); g.appendChild(dot);
      group.appendChild(g);
    };
    mark(path[0], 'start');
    mark(path[path.length - 1], 'end');
  }

  function renderMap() {
    if (!state.campusView && hasOfficialPlan(state.buildingId, state.level)) {
      renderOfficialFloor().catch(err => {
        console.error(err);
        renderSchematicMap();
      });
      return;
    }
    renderSchematicMap();
  }

  function renderSchematicMap() {
    const ids = routeNodesForView();
    const p = state.route ? state.route.path : null;
    const isStart = !!(ids && ids.length && p && ids[0] === p[0]);
    const isEnd = !!(ids && ids.length && p && ids[ids.length - 1] === p[p.length - 1]);

    if (state.campusView) {
      svg.setAttribute('viewBox', computeCampusViewBox(CAMPUS_LAYOUT).join(' '));
      renderCampusOverview(viewport, graph, BUILDINGS, CAMPUS_LAYOUT, {
        highlightBuildingId: state.picked ? state.buildingId : null,
        routeNodeIds: ids, isRouteStart: isStart, isRouteEnd: isEnd,
        onSelectBuilding: goToBuilding,
      });
    } else {
      const layout = layoutFloor(building(), floorOf());
      svg.setAttribute('viewBox', computeFloorViewBox(layout).join(' '));
      renderFloorPlan(viewport, graph, layout, {
        highlightRoomId: state.highlightRoomId,
        categoryFilter: state.categoryFilter,
        routeNodeIds: ids, isRouteStart: isStart, isRouteEnd: isEnd,
        onRoomClick: showRoomDetail,
      });
    }
    panzoom.reset();
  }

  function showRoomDetail(roomId) {
    const item = searchIndex.find(x => x.id === roomId);
    if (!item) return;
    state.highlightRoomId = roomId;
    renderMap();
    syncUrl();

    const color = (CATEGORIES[item.categoryKey] || {}).color || '#333';
    const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    el.roomDetail.classList.remove('hidden');
    el.roomDetail.innerHTML = `
      <button class="room-detail-close" aria-label="Закрыть">×</button>
      <div class="room-detail-cat" style="color:${color}">${item.categoryLabel}</div>
      <div class="room-detail-title">${item.name}</div>
      <div class="room-detail-meta">${item.buildingName} · ${item.floorLabel}</div>
      ${item.info ? `<div class="room-detail-info">${esc(item.info)}</div>` : ''}
      <div class="room-detail-actions">
        <button class="btn-small" data-act="from">Отсюда</button>
        <button class="btn-small btn-primary" data-act="to">Сюда маршрут</button>
      </div>
      ${item.number ? '<button class="room-detail-share" data-act="share">Скопировать ссылку на аудиторию</button>' : ''}`;
    el.roomDetail.querySelector('.room-detail-close').addEventListener('click', () => {
      clearRoomDetail();
      renderMap();
      syncUrl();
    });
    const share = el.roomDetail.querySelector('[data-act="share"]');
    if (share) share.addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(item.number)}`;
      try {
        await navigator.clipboard.writeText(url);
        share.textContent = 'Ссылка скопирована';
      } catch {
        share.textContent = url;
      }
    });
    el.roomDetail.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        pickPoint(btn.dataset.act, item);
        switchMode('route');
      });
    });
  }

  // -------------------------------------------------------------
  // Поиск
  // -------------------------------------------------------------
  function renderDropdown(box, results, onPick) {
    clear(box);
    if (!results.length) {
      box.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
      box.classList.add('open');
      return;
    }
    results.forEach(item => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'search-result-item';
      row.innerHTML = `
        <span class="search-result-num">${item.number || '·'}</span>
        <span class="search-result-body">
          <span class="search-result-name">${item.name}</span>
          <span class="search-result-meta">${item.categoryLabel} · ${item.buildingName}, ${item.floorLabel}</span>
        </span>`;
      row.addEventListener('click', () => onPick(item));
      box.appendChild(row);
    });
    box.classList.add('open');
  }

  function attachSearch(input, box, onPick, useFilter) {
    let timer = null;
    let active = -1;

    const rows = () => [...box.querySelectorAll('.search-result-item')];
    function highlight(i) {
      const list = rows();
      if (!list.length) return;
      active = (i + list.length) % list.length;
      list.forEach((r, k) => r.classList.toggle('active', k === active));
      list[active].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('keydown', e => {
      const list = rows();
      if (e.key === 'Escape') { box.classList.remove('open'); active = -1; return; }
      if (!box.classList.contains('open') || !list.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        list[active >= 0 ? active : 0].click();
      }
    });

    input.addEventListener('input', () => {
      clearTimeout(timer);
      active = -1;
      timer = setTimeout(() => {
        const q = input.value;
        if (!q.trim()) { box.classList.remove('open'); clear(box); return; }
        const results = searchRooms(searchIndex, q, {
          categoryFilter: useFilter ? state.categoryFilter : null,
        });
        renderDropdown(box, results, item => {
          input.value = `${item.number ? item.number + ' — ' : ''}${item.name}`;
          box.classList.remove('open');
          active = -1;
          onPick(item);
        });
      }, 110);
    });
    input.addEventListener('focus', () => { if (box.childElementCount) box.classList.add('open'); });
    document.addEventListener('click', e => {
      if (e.target !== input && !box.contains(e.target)) box.classList.remove('open');
    });
  }

  attachSearch(el.globalSearch, el.globalSearchResults, item => {
    goToBuilding(item.buildingId, item.level);
    showRoomDetail(item.id);
  }, true);
  attachSearch(el.routeFrom, el.routeFromResults, item => pickPoint('from', item), false);
  attachSearch(el.routeTo, el.routeToResults, item => pickPoint('to', item), false);

  function pickPoint(which, item) {
    const label = `${item.number ? item.number + ' — ' : ''}${item.name}`;
    if (which === 'from') { state.from = item; el.routeFrom.value = label; }
    else { state.to = item; el.routeTo.value = label; }
  }

  el.swapBtn.addEventListener('click', () => {
    const f = state.from, t = state.to;
    state.from = t; state.to = f;
    el.routeFrom.value = t ? `${t.number ? t.number + ' — ' : ''}${t.name}` : '';
    el.routeTo.value = f ? `${f.number ? f.number + ' — ' : ''}${f.name}` : '';
  });

  // -------------------------------------------------------------
  // Маршрут
  // -------------------------------------------------------------
  function segmentDistance(ids) {
    let total = 0;
    for (let i = 1; i < ids.length; i++) {
      const e = edgeBetween(graph, ids[i - 1], ids[i]);
      if (e) total += e.weight;
    }
    return total;
  }

  function endpointLabel(id) {
    const n = graph.nodes.get(id);
    if (n.type === 'room') {
      const r = n.room;
      if (r.category === 'stairs') return 'лестницы';
      if (r.category === 'elevator') return 'лифта';
      if (r.category === 'passage') return 'перехода';
      if (r.category === 'entrance') return 'выхода';
      return r.number ? `${r.name} (${r.number})` : r.name;
    }
    if (n.type === 'planroom') return n.code ? `${n.label} (${n.code})` : n.label;
    if (n.type === 'outdoor') return n.buildingName;
    return 'коридора';
  }

  const leadEdge = (segments, i) => {
    const prev = segments[i - 1];
    return prev ? edgeBetween(graph, prev.nodeIds[prev.nodeIds.length - 1], segments[i].nodeIds[0]) : null;
  };

  /**
   * Проезд лифтом/подъём по лестнице через несколько этажей — это один
   * шаг, а не отдельный шаг на каждый промежуточный этаж.
   */
  function mergeVerticalRuns(segments) {
    const groups = [];
    for (let i = 0; i < segments.length; i++) {
      const lead = leadEdge(segments, i);
      let last = i;
      if (lead && (lead.kind === 'stairs' || lead.kind === 'elevator')) {
        while (last + 1 < segments.length) {
          const nextLead = leadEdge(segments, last + 1);
          if (!nextLead || nextLead.kind !== lead.kind) break;
          if (segmentDistance(segments[last].nodeIds) > 4) break;
          last++;
        }
      }
      groups.push({ first: i, last, lead });
      i = last;
    }
    return groups;
  }

  function buildSteps(segments) {
    return mergeVerticalRuns(segments).map(({ first, last, lead }) => {
      const i = last;
      const seg = segments[i];
      let dist = 0;
      for (let k = first; k <= last; k++) dist += segmentDistance(segments[k].nodeIds);
      const prev = segments[first - 1];

      if (seg.type === 'campus') {
        const fromN = graph.nodes.get(seg.nodeIds[0]).buildingName || 'территории';
        const toN = graph.nodes.get(seg.nodeIds[seg.nodeIds.length - 1]).buildingName || 'территории';
        return {
          seg: i,
          text: fromN === toN
            ? `Выйти на территорию у корпуса «${fromN}»`
            : `Пройти по территории: от «${fromN}» до «${toN}» (~${meters(dist)})`,
        };
      }

      const b = BUILDINGS.find(x => x.id === seg.buildingId);
      const f = b.floors.find(x => x.level === seg.level);
      let action;

      if (!prev) {
        action = `Старт: ${b.name}, ${f.label}`;
      } else if (lead && lead.kind === 'stairs') {
        action = `${seg.level > prev.level ? 'Подняться' : 'Спуститься'} по лестнице на «${f.label}»`;
      } else if (lead && lead.kind === 'elevator') {
        action = `${seg.level > prev.level ? 'Подняться' : 'Спуститься'} на лифте на «${f.label}»`;
      } else if (lead && lead.kind === 'passage') {
        action = `Перейти по переходу в «${b.name}»`;
      } else if (lead && lead.kind === 'door') {
        action = `Войти в «${b.name}»`;
      } else {
        action = `${b.name}, ${f.label}`;
      }

      return {
        seg: i,
        text: `${action} — далее до ${endpointLabel(seg.nodeIds[seg.nodeIds.length - 1])} (~${meters(dist)})`,
      };
    });
  }

  function jumpToSegment(i) {
    const seg = state.route.segments[i];
    state.highlightRoomId = null;
    el.roomDetail.classList.add('hidden');
    if (seg.type === 'campus') showCampus();
    else goToBuilding(seg.buildingId, seg.level);
    [...el.routeSteps.children].forEach((c, idx) => c.classList.toggle('active', idx === i));
  }

  function buildRoute() {
    const warn = msg => {
      el.routeSummary.innerHTML = `<div class="route-warning">${msg}</div>`;
      clear(el.routeSteps);
    };
    if (!state.from || !state.to) return warn('Выберите обе точки из подсказок поиска.');
    if (state.from.id === state.to.id) return warn('Точки совпадают.');

    const res = dijkstra(graph, state.from.id, state.to.id);
    if (!res) return warn('Маршрут не найден.');

    const segments = splitRouteIntoSegments(graph, res.path);
    state.route = { path: res.path, distance: res.distance, segments };

    // Считаем только этажи, по которым действительно идёшь, без
    // транзитных остановок лифта.
    const floors = new Set(segments
      .filter(s => s.type === 'floor' && segmentDistance(s.nodeIds) > 4)
      .map(s => `${s.buildingId}:${s.level}`));
    el.routeSummary.innerHTML = `
      <div class="route-summary-card">
        <div class="route-summary-dist">≈ ${meters(res.distance)}</div>
        <div class="route-summary-sub">около ${minutes(res.distance)} мин пешком · ${floors.size} этаж(ей) на пути</div>
      </div>`;
    el.clearRouteBtn.classList.remove('hidden');

    clear(el.routeSteps);
    buildSteps(segments).forEach((s, idx) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'route-step';
      item.innerHTML = `<span class="route-step-num">${idx + 1}</span><span class="route-step-text">${s.text}</span>`;
      item.addEventListener('click', () => jumpToSegment(s.seg));
      el.routeSteps.appendChild(item);
    });

    jumpToSegment(0);
  }

  function clearRoute() {
    state.route = null;
    clear(el.routeSteps);
    el.routeSummary.innerHTML = '';
    el.clearRouteBtn.classList.add('hidden');
    renderMap();
  }

  el.buildRouteBtn.addEventListener('click', buildRoute);
  el.clearRouteBtn.addEventListener('click', clearRoute);

  // -------------------------------------------------------------
  // Режимы, легенда, зум
  // -------------------------------------------------------------
  function switchMode(mode) {
    state.mode = mode;
    [...el.modeTabs.children].forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    el.panelExplore.classList.toggle('hidden', mode !== 'explore');
    el.panelRoute.classList.toggle('hidden', mode !== 'route');
  }
  [...el.modeTabs.children].forEach(b => b.addEventListener('click', () => switchMode(b.dataset.mode)));

  function refreshLegend() {
    renderLegend(el.legend, CATEGORIES, state.categoryFilter, key => {
      state.categoryFilter = key;
      refreshLegend();
      renderMap();
    });
  }

  el.zoomIn.addEventListener('click', () => panzoom.zoomBy(1.25));
  el.zoomOut.addEventListener('click', () => panzoom.zoomBy(1 / 1.25));
  el.zoomReset.addEventListener('click', () => panzoom.reset());
  el.showCampusBtn.addEventListener('click', showCampus);

  // Ссылки вида ?room=4016 (аудитория) и ?b=corpusV&f=4 (этаж корпуса)
  const params = new URLSearchParams(location.search);
  let deepLink = null;
  const wanted = params.get('room');
  if (wanted) {
    const hit = searchRooms(searchIndex, wanted, { limit: 1 })[0];
    if (hit) {
      state.buildingId = hit.buildingId;
      state.level = hit.level;
      state.campusView = false;
      state.picked = true;
      deepLink = hit.id;
    }
  } else if (params.get('b')) {
    const b = BUILDINGS.find(x => x.id === params.get('b'));
    if (b) {
      const lvl = Number(params.get('f'));
      state.buildingId = b.id;
      state.level = b.floors.some(f => f.level === lvl) ? lvl : b.floors[0].level;
      state.campusView = false;
      state.picked = true;
    }
  }

  refreshLegend();
  renderAll();
  if (deepLink) showRoomDetail(deepLink);
})();
