/* Карта России: субъекты федерации, их столицы и крупные реки.
   Геометрия — Natural Earth 1:10m, проекция — равновеликая коническая Альберса. */
(function () {
'use strict';

// ---------------------------------------------------------------- проекция
var RAD = Math.PI / 180;
var LON0 = 100, PHI1 = 50 * RAD, PHI2 = 70 * RAD, PHI0 = 55 * RAD;
var N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
var C = Math.cos(PHI1) * Math.cos(PHI1) + 2 * N * Math.sin(PHI1);
var RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

function project(lon, lat) {
  var lam = lon - LON0;
  while (lam > 180) lam -= 360;
  while (lam < -180) lam += 360;
  var th = N * lam * RAD;
  var rho = Math.sqrt(Math.max(0, C - 2 * N * Math.sin(lat * RAD))) / N;
  return [rho * Math.sin(th), rho * Math.cos(th) - RHO0];
}

// --------------------------------------------------------------- состояние
var VW = 2000, VH = 1160;           // внутренняя система координат карты
var fit = { k: 1, dx: 0, dy: 0 };   // проекция -> внутренние координаты
var view = { k: 1, x: 0, y: 0 };    // зум/панорама поверх внутренних координат
var geo = window.RU_GEO, meta = window.RU_REGIONS, rivers = window.RU_RIVERS;

var regions = [];                   // подготовленные субъекты
var byCode = {};
var riverData = [];
var selected = null, hovered = null;
var opts = { rivers: true, labels: true, capitals: true, lakes: true,
             allLabels: false, colorBy: 'district' };

var DISTRICTS = [
  ['ЦФО', 'Центральный',       '#7aa8d6'],
  ['СЗФО', 'Северо-Западный',  '#79c0c6'],
  ['ЮФО', 'Южный',             '#e2a87c'],
  ['СКФО', 'Северо-Кавказский','#d99694'],
  ['ПФО', 'Приволжский',       '#9fc487'],
  ['УФО', 'Уральский',         '#c3a5cf'],
  ['СФО', 'Сибирский',         '#e8cd83'],
  ['ДФО', 'Дальневосточный',   '#8fb3a0'],
  ['—',   'Спорная территория','#c9c9c9']
];
var DCOLOR = {}, DNAME = {};
DISTRICTS.forEach(function (d) { DCOLOR[d[0]] = d[2]; DNAME[d[0]] = d[1]; });

var TYPES = [
  ['Республика', '#8fbf9f'], ['Край', '#e3b880'], ['Область', '#8fb0d8'],
  ['Город федерального значения', '#d98f8f'], ['Автономная область', '#c6a9d6'],
  ['Автономный округ', '#a8cfd6'], ['Спорная территория', '#c9c9c9']
];
var TCOLOR = {};
TYPES.forEach(function (t) { TCOLOR[t[0]] = t[1]; });

// --------------------------------------------------------------- геометрия
function prepare() {
  // все точки субъектов -> общий охват -> подгонка под VW x VH
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  var projected = {};
  Object.keys(geo.regions).forEach(function (code) {
    projected[code] = geo.regions[code].map(function (poly) {
      return poly.map(function (ring) {
        return ring.map(function (c) {
          var p = project(c[0], c[1]);
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
          return p;
        });
      });
    });
  });
  var pad = 28;
  fit.k = Math.min((VW - 2 * pad) / (maxX - minX), (VH - 2 * pad) / (maxY - minY));
  fit.dx = pad - minX * fit.k + ((VW - 2 * pad) - (maxX - minX) * fit.k) / 2;
  fit.dy = pad - minY * fit.k + ((VH - 2 * pad) - (maxY - minY) * fit.k) / 2;

  meta.forEach(function (m, i) {
    var polys = (projected[m.code] || []).map(function (poly) {
      return poly.map(function (ring) { return ring.map(toView); });
    });
    var r = {
      code: m.code, name: m.name, short: m.short, type: m.type,
      capital: m.capital, district: m.district, area: m.area, pop: m.pop,
      note: m.note, idx: i, polys: polys,
      capitalXY: m.capitalLL ? toView(project(m.capitalLL[0], m.capitalLL[1])) : null,
      d: polys.map(ringPath).join(''),
      bbox: polyBBox(polys)
    };
    r.mainArea = mainRingArea(polys);
    r.anchor = poleOfInaccessibility(largestRing(polys));
    regions.push(r);
    byCode[r.code] = r;
  });

  geo.land.forEach(function (l) {
    l.d = l.polys.map(function (poly) {
      return ringPath(poly.map(function (ring) { return ring.map(projView); }));
    }).join('');
  });
  geo.lakes.forEach(function (l) {
    var polys = l.polys.map(function (poly) {
      return poly.map(function (ring) { return ring.map(projView); });
    });
    l.d = polys.map(ringPath).join('');
    l.anchor = poleOfInaccessibility(largestRing(polys));
    l.bbox = polyBBox(polys);
  });

  rivers.forEach(function (r) {
    var lines = r.lines.map(function (line) { return line.map(projView); });
    var best = 0, bi = 0, lens = [];
    lines.forEach(function (line, i) {
      var len = lineLength(line);
      lens.push(len);
      if (len > best) { best = len; bi = i; }
    });
    riverData.push({ name: r.name, order: r.order, length: r.length,
                     lines: lines, lens: lens, main: bi, mainLen: best,
                     d: lines.map(linePath).join('') });
  });
  riverData.sort(function (a, b) { return a.order - b.order; });
}

function projView(c) { return toView(project(c[0], c[1])); }
function toView(p) { return [p[0] * fit.k + fit.dx, p[1] * fit.k + fit.dy]; }

function ringPath(poly) {
  var s = '';
  for (var i = 0; i < poly.length; i++) {
    var ring = poly[i];
    if (ring.length < 3) continue;
    s += 'M' + ring[0][0].toFixed(1) + ' ' + ring[0][1].toFixed(1);
    for (var j = 1; j < ring.length; j++) {
      s += 'L' + ring[j][0].toFixed(1) + ' ' + ring[j][1].toFixed(1);
    }
    s += 'Z';
  }
  return s;
}
function linePath(line) {
  var s = 'M' + line[0][0].toFixed(1) + ' ' + line[0][1].toFixed(1);
  for (var i = 1; i < line.length; i++) {
    s += 'L' + line[i][0].toFixed(1) + ' ' + line[i][1].toFixed(1);
  }
  return s;
}
function lineLength(line) {
  var s = 0;
  for (var i = 1; i < line.length; i++) {
    s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  }
  return s;
}
// точка на ломаной по доле длины + направление хода в этой точке
function pointAt(line, f) {
  var target = lineLength(line) * f, run = 0;
  for (var i = 1; i < line.length; i++) {
    var dx = line[i][0] - line[i - 1][0], dy = line[i][1] - line[i - 1][1];
    var d = Math.hypot(dx, dy);
    if (run + d >= target) {
      var t = d ? (target - run) / d : 0;
      return [line[i - 1][0] + dx * t, line[i - 1][1] + dy * t, dx, dy];
    }
    run += d;
  }
  var n = line.length - 1;
  return [line[n][0], line[n][1], line[n][0] - line[n - 1][0], line[n][1] - line[n - 1][1]];
}
function ringArea(ring) {
  var a = 0;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}
function largestRing(polys) {
  var best = null, ba = -1;
  polys.forEach(function (poly) {
    var a = ringArea(poly[0]);
    if (a > ba) { ba = a; best = poly; }
  });
  return best || [[[0, 0], [0, 0], [0, 0]]];
}
function mainRingArea(polys) { return ringArea(largestRing(polys)[0]); }
function polyBBox(polys) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  polys.forEach(function (poly) {
    poly[0].forEach(function (c) {
      if (c[0] < b[0]) b[0] = c[0];
      if (c[1] < b[1]) b[1] = c[1];
      if (c[0] > b[2]) b[2] = c[0];
      if (c[1] > b[3]) b[3] = c[1];
    });
  });
  return b;
}

// «полюс недоступности» — точка внутри полигона, максимально удалённая от границ
// (алгоритм polylabel: очередь ячеек, деление на четыре, отсечение по верхней оценке)
function poleOfInaccessibility(poly) {
  var b = polyBBox([poly]);
  var w = b[2] - b[0], h = b[3] - b[1];
  var cell = Math.min(w, h) / 2;
  if (cell <= 0) return [b[0], b[1], 0];
  var SQ2 = Math.SQRT2;
  var queue = [];
  function push(x, y, half) {
    var d = distToPoly(x, y, poly);
    queue.push({ x: x, y: y, h: half, d: d, max: d + half * SQ2 });
  }
  for (var x = b[0]; x < b[2]; x += cell) {
    for (var y = b[1]; y < b[3]; y += cell) push(x + cell / 2, y + cell / 2, cell / 2);
  }
  var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  var best = { x: cx, y: cy, d: distToPoly(cx, cy, poly) };
  var guard = 0;
  while (queue.length && guard++ < 8000) {
    var bi = 0;
    for (var i = 1; i < queue.length; i++) if (queue[i].max > queue[bi].max) bi = i;
    var c = queue.splice(bi, 1)[0];
    if (c.d > best.d) best = c;
    if (c.max - best.d <= Math.max(0.35, best.d * 0.01)) continue;
    var q = c.h / 2;
    push(c.x - q, c.y - q, q); push(c.x + q, c.y - q, q);
    push(c.x - q, c.y + q, q); push(c.x + q, c.y + q, q);
  }
  return [best.x, best.y, best.d];
}
function distToPoly(x, y, poly) {
  var inside = false, min = Infinity;
  for (var r = 0; r < poly.length; r++) {
    var ring = poly[r];
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var a = ring[j], c = ring[i];
      if ((c[1] > y) !== (a[1] > y) &&
          x < (a[0] - c[0]) * (y - c[1]) / (a[1] - c[1]) + c[0]) inside = !inside;
      min = Math.min(min, segDist(x, y, c, a));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}
function segDist(px, py, a, b) {
  var x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx || dy) {
    var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  return (px - x) * (px - x) + (py - y) * (py - y);
}
function pointInRegion(x, y, r) {
  if (x < r.bbox[0] || x > r.bbox[2] || y < r.bbox[1] || y > r.bbox[3]) return false;
  for (var p = 0; p < r.polys.length; p++) {
    var poly = r.polys[p];
    if (!inRing(x, y, poly[0])) continue;
    var hole = false;
    for (var h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) hole = true;
    if (!hole) return true;
  }
  return false;
}
function inRing(x, y, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var a = ring[j], c = ring[i];
    if ((c[1] > y) !== (a[1] > y) &&
        x < (a[0] - c[0]) * (y - c[1]) / (a[1] - c[1]) + c[0]) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------------- цвета
function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16);
  var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function fillOf(r) {
  var base = opts.colorBy === 'type' ? (TCOLOR[r.type] || '#ccc')
                                     : (DCOLOR[r.district] || '#ccc');
  var amt = [0, 0.16, 0.32, 0.08, 0.24][r.idx % 5];
  return shade(base.charAt(0) === '#' ? base : '#cccccc', amt);
}

// ------------------------------------------------------------------ отрисовка
var svg, gRoot, gLand, gRegions, gLakes, gRivers, gBorders, gLabels, gRiverLabels;
var tooltip, stage;

function el(tag, attrs) {
  var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  return e;
}

function build() {
  svg = document.getElementById('map');
  svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
  gRoot = el('g', { id: 'root' });
  svg.appendChild(gRoot);

  gRoot.appendChild(el('rect', { x: -VW * 4, y: -VH * 4, width: VW * 9,
                                 height: VH * 9, fill: 'var(--sea)' }));

  gLand = el('g', { class: 'land' });
  gRegions = el('g', { class: 'regions' });
  gLakes = el('g', { class: 'lakes' });
  gRivers = el('g', { class: 'rivers' });
  gBorders = el('g', { class: 'borders' });
  gRiverLabels = el('g', { class: 'river-labels' });
  gLabels = el('g', { class: 'labels' });
  [gLand, gRegions, gLakes, gRivers, gBorders, gRiverLabels, gLabels]
    .forEach(function (g) { gRoot.appendChild(g); });

  geo.land.forEach(function (l) {
    gLand.appendChild(el('path', { d: l.d, class: 'foreign' }));
  });

  regions.forEach(function (r) {
    var p = el('path', { d: r.d, class: 'region', fill: fillOf(r),
                         'data-code': r.code });
    r.el = p;
    gRegions.appendChild(p);
  });

  geo.lakes.forEach(function (l) {
    gLakes.appendChild(el('path', { d: l.d, class: 'lake' }));
  });

  var defs = document.getElementById('map-defs') ||
             (function () { var d = el('defs', { id: 'map-defs' }); svg.appendChild(d); return d; })();
  riverData.forEach(function (r, i) {
    var cls = 'river river-o' + r.order;
    gRivers.appendChild(el('path', { d: r.d, class: cls }));
    r.labels = [];
    r.lines.forEach(function (line, j) {
      if (r.lens[j] < 12) return;
      var id = 'rv' + i + '_' + j, idr = id + 'r';
      var back = line.slice().reverse();
      defs.appendChild(el('path', { id: id, d: linePath(line) }));
      defs.appendChild(el('path', { id: idr, d: linePath(back) }));
      var count = Math.max(2, Math.min(60, Math.round(r.lens[j] / 22)));
      for (var q = 0; q < count; q++) {
        var f = (q + 0.5) / count;
        var at = pointAt(line, f);
        // подпись не должна читаться справа налево: берём ход русла в этой точке
        var fwd = at[2] > 0 || (at[2] === 0 && at[3] < 0);
        var t = el('text', { class: 'river-label o' + r.order });
        var tp = el('textPath', { href: '#' + (fwd ? id : idr),
                                  startOffset: ((fwd ? f : 1 - f) * 100).toFixed(2) + '%' });
        tp.setAttribute('xlink:href', '#' + (fwd ? id : idr));
        tp.textContent = r.name;
        t.appendChild(tp);
        gRiverLabels.appendChild(t);
        r.labels.push({ el: t, at: at, len: r.lens[j] });
      }
    });
  });

  // спорные территории — штриховка поверх заливки
  var pat = el('pattern', { id: 'hatch', width: 7, height: 7,
                            patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  pat.appendChild(el('rect', { width: 7, height: 7, fill: 'none' }));
  pat.appendChild(el('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#8a8a8a', 'stroke-width': 2 }));
  defs.appendChild(pat);
  regions.forEach(function (r) {
    if (r.district === '—') {
      gBorders.appendChild(el('path', { d: r.d, class: 'disputed', fill: 'url(#hatch)' }));
    }
    gBorders.appendChild(el('path', { d: r.d, class: 'region-outline' }));
  });
}

// --------------------------------------------------------------- подписи
function screenPt(x, y) {
  return [x * view.k + view.x, y * view.k + view.y];
}
function textWidth(s, size) { return s.length * size * 0.54; }

function renderLabels() {
  var rect = svg.getBoundingClientRect();
  var scale = rect.width / VW;           // внутренние единицы -> пиксели экрана
  var k = view.k;
  var boxes = [];
  var frag = document.createDocumentFragment();

  function fits(cx, cy, w, h) {
    var b = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    if (b[0] < 2 || b[1] < 2 || b[2] > rect.width - 2 || b[3] > rect.height - 2) return null;
    for (var i = 0; i < boxes.length; i++) {
      var o = boxes[i];
      if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return null;
    }
    return b;
  }

  var list = regions.slice().sort(function (a, b) {
    if (a === selected) return 1;
    if (b === selected) return -1;
    return a.mainArea - b.mainArea;
  }).reverse();

  var fs = rect.width < 720 ? 0.82 : 1;     // на узких экранах подписи мельче
  var ATTEMPTS = [[13 * fs, 11.5 * fs, true], [11 * fs, 9.8 * fs, true],
                  [11 * fs, 0, false], [9.2 * fs, 0, false]];
  list.forEach(function (r) {
    if (!opts.labels && r !== selected && r !== hovered) return;
    var forced = (r === selected || r === hovered || opts.allLabels);

    // якорь подписи; если он ушёл за край экрана, пробуем видимую часть субъекта
    var ax = r.anchor[0], ay = r.anchor[1], room = r.anchor[2];
    var sp = screenPt(ax, ay);
    var cx = sp[0] * scale, cy = sp[1] * scale;
    if (cx < 10 || cy < 10 || cx > rect.width - 10 || cy > rect.height - 10) {
      var mx = Math.min(rect.width - 60, Math.max(60, cx));
      var my = Math.min(rect.height - 30, Math.max(30, cy));
      var vx = (mx / scale - view.x) / view.k, vy = (my / scale - view.y) / view.k;
      if (!pointInRegion(vx, vy, r)) return;
      ax = vx; ay = vy; cx = mx; cy = my;
      room = Math.max(room, 12 / (view.k * scale));
    }

    var showCap, nameSize, capSize, box = null, w = 0, h = 0;
    for (var ai = 0; ai < ATTEMPTS.length; ai++) {
      nameSize = ATTEMPTS[ai][0];
      capSize = ATTEMPTS[ai][1];
      showCap = ATTEMPTS[ai][2] && opts.capitals && r.capital !== r.short;
      if (ATTEMPTS[ai][2] && !showCap) continue;      // дубль «только название»
      w = Math.max(textWidth(r.short, nameSize),
                   showCap ? textWidth('● ' + r.capital, capSize) : 0);
      h = showCap ? nameSize + capSize + 3 : nameSize;
      if (!forced && room * view.k * scale < w * 0.14) continue;
      box = forced ? [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
                   : fits(cx, cy, w + 7, h + 5);
      if (box) break;
    }
    if (!box) return;
    boxes.push(box);

    var px = view.k * scale;                           // внутренние единицы -> px
    var g = el('g', { class: 'label' + (r === selected || r === hovered ? ' label-hi' : '') });
    var y0 = ay - (showCap ? (capSize + 3) / 2 / px : 0) + nameSize * 0.34 / px;
    var t1 = el('text', { x: ax, y: y0, class: 'lbl-name', 'font-size': nameSize / px });
    t1.textContent = r.short;
    g.appendChild(t1);
    if (showCap) {
      var t2 = el('text', { x: ax, y: y0 + (nameSize + 1) / px, class: 'lbl-cap',
                            'font-size': capSize / px });
      t2.textContent = '● ' + r.capital;
      g.appendChild(t2);
    }
    frag.appendChild(g);
  });

  // столицы — точки и подписи у самой точки, если хватает места
  if (opts.capitals) {
    var caps = regions.slice().sort(function (a, b) { return b.pop - a.pop; });
    caps.forEach(function (r) {
      if (!r.capitalXY) return;
      var sp = screenPt(r.capitalXY[0], r.capitalXY[1]);
      var cx = sp[0] * scale, cy = sp[1] * scale;
      if (cx < -20 || cy < -20 || cx > rect.width + 20 || cy > rect.height + 20) return;
      var g = el('g', { class: 'capital' + (r === selected ? ' capital-hi' : '') });
      var star = r.capital === 'Москва';
      g.appendChild(el('circle', { cx: r.capitalXY[0], cy: r.capitalXY[1],
                                   r: (star ? 4.6 : 3.1) / (k * scale),
                                   class: star ? 'cap-dot cap-main' : 'cap-dot' }));
      frag.appendChild(g);
    });
  }

  gLabels.textContent = '';
  gLabels.appendChild(frag);

  // подписи рек: вдоль русла, но не чаще чем раз в ~420 px и не поверх других подписей
  riverData.forEach(function (r) {
    if (!r.labels) return;
    var size = (r.order === 1 ? 13 : r.order === 2 ? 12 : 10.8) * (rect.width < 720 ? 0.85 : 1);
    var w = textWidth(r.name, size), placed = [];
    r.labels.forEach(function (lb) {
      lb.el.setAttribute('font-size', size / (k * scale));
      var show = false;
      if (opts.rivers) {
        var sp = screenPt(lb.at[0], lb.at[1]);
        var x = sp[0] * scale, y = sp[1] * scale;
        var lenPx = lb.len * k * scale;
        var m = w / 2 + 14;
        var onScreen = x > m && y > m && x < rect.width - m && y < rect.height - m;
        var big = r.order <= 2 || k > 2.2 || lenPx > 700;
        if (onScreen && big && lenPx > w * 1.6 + 30) {
          var far = placed.every(function (q) { return Math.hypot(q[0] - x, q[1] - y) > 420; });
          var box = far ? fits(x, y, w + 10, size + 6) : null;
          if (box) { boxes.push(box); placed.push([x, y]); show = true; }
        }
      }
      lb.el.style.display = show ? '' : 'none';
    });
  });
}

// ------------------------------------------------------------- зум и панорама
function applyView() {
  gRoot.setAttribute('transform',
    'translate(' + view.x.toFixed(2) + ' ' + view.y.toFixed(2) + ') scale(' + view.k.toFixed(4) + ')');
  gRoot.style.setProperty('--k', view.k);
  scheduleLabels();
  updateScaleBar();
}
var labelTimer = null;
function scheduleLabels() {
  if (labelTimer) cancelAnimationFrame(labelTimer);
  labelTimer = requestAnimationFrame(function () { labelTimer = null; renderLabels(); });
}
function clampView() {
  var minK = 0.85, maxK = 90;
  view.k = Math.min(maxK, Math.max(minK, view.k));
  var m = 200;
  view.x = Math.min(m, Math.max(VW - VW * view.k - m, view.x));
  view.y = Math.min(m, Math.max(VH - VH * view.k - m, view.y));
}
function zoomAt(px, py, factor) {
  var k0 = view.k;
  view.k *= factor;
  clampView();
  var f = view.k / k0;
  view.x = px - (px - view.x) * f;
  view.y = py - (py - view.y) * f;
  clampView();
  applyView();
}
function svgPoint(evt) {
  var rect = svg.getBoundingClientRect();
  var s = VW / rect.width;
  return [(evt.clientX - rect.left) * s, (evt.clientY - rect.top) * s];
}
function mapPoint(evt) {
  var p = svgPoint(evt);
  return [(p[0] - view.x) / view.k, (p[1] - view.y) / view.k];
}
function zoomTo(bbox, pad) {
  var rect = svg.getBoundingClientRect();
  var w = bbox[2] - bbox[0], h = bbox[3] - bbox[1];
  pad = pad || 1.35;
  var k = Math.min(VW / (w * pad), VH / (h * pad));
  view.k = Math.min(60, Math.max(0.85, k));
  view.x = VW / 2 - (bbox[0] + bbox[2]) / 2 * view.k;
  view.y = VH / 2 - (bbox[1] + bbox[3]) / 2 * view.k;
  clampView();
  applyView();
}
function resetView() { view = { k: 1, x: 0, y: 0 }; applyView(); }

// --------------------------------------------------------------- интерфейс
function fmt(n) { return n.toLocaleString('ru-RU'); }

function select(code, zoom) {
  selected = byCode[code] || null;
  regions.forEach(function (r) { r.el.classList.toggle('sel', r === selected); });
  document.querySelectorAll('.reg-item').forEach(function (n) {
    n.classList.toggle('active', n.dataset.code === code);
  });
  renderCard();
  if (selected && zoom) zoomTo(selected.bbox, selected.mainArea < 400 ? 4 : 1.5);
  else scheduleLabels();
  if (selected) {
    var node = document.querySelector('.reg-item[data-code="' + code + '"]');
    if (node) node.scrollIntoView({ block: 'nearest' });
  }
}

function renderCard() {
  var box = document.getElementById('card');
  if (!selected) {
    box.innerHTML = '<p class="hint">Выберите субъект на карте или в списке — ' +
      'покажу название, столицу, федеральный округ, площадь и население.</p>';
    return;
  }
  var r = selected;
  var dens = (r.pop / r.area).toFixed(r.pop / r.area < 10 ? 2 : 1);
  var html = '<h3>' + r.name + '</h3>' +
    '<p class="card-type">' + r.type +
      (r.district !== '—' ? ' · ' + DNAME[r.district] + ' федеральный округ' : '') + '</p>' +
    '<dl>' +
      '<dt>Столица</dt><dd><b>' + r.capital + '</b></dd>' +
      '<dt>Код</dt><dd>' + r.code + '</dd>' +
      '<dt>Площадь</dt><dd>' + fmt(r.area) + ' км²</dd>' +
      '<dt>Население</dt><dd>' + fmt(r.pop) + ' чел.</dd>' +
      '<dt>Плотность</dt><dd>' + dens + ' чел./км²</dd>' +
    '</dl>';
  var rr = riversOf(r);
  if (rr.length) html += '<p class="card-rivers"><span>Крупные реки:</span> ' + rr.join(', ') + '</p>';
  if (r.note) html += '<p class="card-note">' + r.note + '</p>';
  box.innerHTML = html;
}

var riverCache = {};
function riversOf(r) {
  if (riverCache[r.code]) return riverCache[r.code];
  var found = [];
  riverData.forEach(function (rv) {
    if (rv.order > 2 && found.length > 5) return;
    var hit = rv.lines.some(function (line) {
      for (var i = 0; i < line.length; i += 2) {
        if (pointInRegion(line[i][0], line[i][1], r)) return true;
      }
      return false;
    });
    if (hit) found.push(rv.name);
  });
  riverCache[r.code] = found;
  return found;
}

function regionAt(evt) {
  var p = mapPoint(evt);
  for (var i = 0; i < regions.length; i++) {
    if (pointInRegion(p[0], p[1], regions[i])) return regions[i];
  }
  return null;
}

function buildSidebar() {
  var wrap = document.getElementById('region-list');
  var html = '';
  DISTRICTS.forEach(function (d) {
    var list = regions.filter(function (r) { return r.district === d[0]; });
    if (!list.length) return;
    list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    html += '<div class="dist"><h4><i style="background:' + d[2] + '"></i>' +
            (d[0] === '—' ? 'Спорная территория' : d[1] + ' ФО') +
            '<span>' + list.length + '</span></h4>';
    list.forEach(function (r) {
      html += '<button type="button" class="reg-item" data-code="' + r.code + '">' +
              '<span class="ri-name">' + r.short + '</span>' +
              '<span class="ri-cap">' + r.capital + '</span></button>';
    });
    html += '</div>';
  });
  wrap.innerHTML = html;
  wrap.addEventListener('click', function (e) {
    var b = e.target.closest('.reg-item');
    if (b) select(b.dataset.code, true);
  });
}

function buildLegend() {
  var wrap = document.getElementById('legend');
  function paint() {
    var html = '';
    if (opts.colorBy === 'district') {
      DISTRICTS.forEach(function (d) {
        html += '<span class="lg"><i style="background:' + d[2] + '"></i>' +
                (d[0] === '—' ? 'Спорная' : d[1]) + '</span>';
      });
    } else {
      TYPES.forEach(function (t) {
        html += '<span class="lg"><i style="background:' + t[1] + '"></i>' + t[0] + '</span>';
      });
    }
    html += '<span class="lg"><i class="lg-riv"></i>Крупные реки</span>' +
            '<span class="lg"><i class="lg-cap"></i>Столица субъекта</span>';
    wrap.innerHTML = html;
  }
  paint();
  return paint;
}

function buildSearch() {
  var input = document.getElementById('search');
  var drop = document.getElementById('search-results');
  var items = [];
  regions.forEach(function (r) {
    items.push({ t: r.short, s: 'субъект · столица ' + r.capital, code: r.code });
    items.push({ t: r.capital, s: 'столица · ' + r.short, code: r.code });
  });
  riverData.forEach(function (rv) {
    items.push({ t: rv.name, s: 'река' + (rv.length ? ' · ' + fmt(rv.length) + ' км' : ''),
                 river: rv });
  });
  function close() { drop.classList.remove('open'); drop.innerHTML = ''; }
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) return close();
    var hits = items.filter(function (i) {
      return i.t.toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      return a.t.toLowerCase().indexOf(q) - b.t.toLowerCase().indexOf(q) || a.t.length - b.t.length;
    }).slice(0, 12);
    if (!hits.length) { drop.innerHTML = '<div class="sr-empty">Ничего не найдено</div>'; drop.classList.add('open'); return; }
    drop.innerHTML = hits.map(function (h, i) {
      return '<button type="button" data-i="' + i + '"><b>' + h.t + '</b><span>' + h.s + '</span></button>';
    }).join('');
    drop.classList.add('open');
    drop.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var h = hits[+b.dataset.i];
        if (h.code) select(h.code, true);
        else focusRiver(h.river);
        input.value = h.t;
        close();
      });
    });
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); input.blur(); }
    if (e.key === 'Enter') { var f = drop.querySelector('button'); if (f) f.click(); }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-wrap')) close();
  });
}

function focusRiver(rv) {
  var line = rv.lines[rv.main];
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  rv.lines.forEach(function (l) {
    l.forEach(function (c) {
      b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]);
      b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
    });
  });
  selected = null;
  regions.forEach(function (r) { r.el.classList.remove('sel'); });
  renderCard();
  zoomTo(b, 1.25);
  flashRiver(rv);
}
function flashRiver(rv) {
  var p = el('path', { d: rv.d, class: 'river-flash' });
  gRivers.appendChild(p);
  setTimeout(function () { p.remove(); }, 2600);
}

function updateScaleBar() {
  // длина 1 внутренней единицы в километрах на широте центра экрана
  var rect = svg.getBoundingClientRect();
  var px = 120;                                   // целевая длина плашки, px
  var units = px * (VW / rect.width) / view.k;
  var kmPerUnit = 6371 / fit.k;                   // радианы проекции -> км
  var km = units * kmPerUnit;
  var nice = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000];
  var pick = nice[0];
  nice.forEach(function (n) { if (n <= km) pick = n; });
  var w = px * pick / km;
  var bar = document.getElementById('scalebar');
  bar.style.width = w.toFixed(1) + 'px';
  bar.querySelector('span').textContent = fmt(pick) + ' км';
}

function bindMap() {
  stage = document.getElementById('stage');
  tooltip = document.getElementById('tip');
  var drag = null;

  svg.addEventListener('mousedown', function (e) {
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: 0 };
    svg.classList.add('grabbing');
  });
  window.addEventListener('mousemove', function (e) {
    if (drag) {
      var rect = svg.getBoundingClientRect(), s = VW / rect.width;
      view.x = drag.vx + (e.clientX - drag.x) * s;
      view.y = drag.vy + (e.clientY - drag.y) * s;
      drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      clampView(); applyView();
      return;
    }
    if (!e.target.closest || !e.target.closest('#stage')) { hideTip(); return; }
    var r = regionAt(e);
    if (r !== hovered) {
      if (hovered) hovered.el.classList.remove('hover');
      hovered = r;
      if (hovered) hovered.el.classList.add('hover');
      scheduleLabels();
    }
    if (r) showTip(e, r); else hideTip();
  });
  window.addEventListener('mouseup', function (e) {
    if (drag) {
      svg.classList.remove('grabbing');
      if (drag.moved < 5) {
        var r = regionAt(e);
        if (r) select(r.code, false); else select(null, false);
      }
      drag = null;
    }
  });
  svg.addEventListener('dblclick', function (e) {
    var p = svgPoint(e);
    zoomAt(p[0], p[1], 1.9);
  });
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = svgPoint(e);
    zoomAt(p[0], p[1], Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016)));
  }, { passive: false });

  // тач
  var touch = null;
  svg.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, vx: view.x, vy: view.y };
    } else if (e.touches.length === 2) {
      touch = { d: tDist(e), k: view.k, c: tCenter(e), vx: view.x, vy: view.y };
    }
  }, { passive: true });
  svg.addEventListener('touchmove', function (e) {
    if (!touch) return;
    var rect = svg.getBoundingClientRect(), s = VW / rect.width;
    if (e.touches.length === 1 && touch.x != null) {
      view.x = touch.vx + (e.touches[0].clientX - touch.x) * s;
      view.y = touch.vy + (e.touches[0].clientY - touch.y) * s;
      clampView(); applyView();
    } else if (e.touches.length === 2 && touch.d) {
      var f = tDist(e) / touch.d;
      var c = touch.c;
      view.k = touch.k; view.x = touch.vx; view.y = touch.vy;
      clampView();
      zoomAt((c[0] - rect.left) * s, (c[1] - rect.top) * s, f * (touch.k / view.k));
    }
    e.preventDefault();
  }, { passive: false });
  svg.addEventListener('touchend', function () { touch = null; }, { passive: true });
  function tDist(e) {
    return Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                      e.touches[0].clientY - e.touches[1].clientY);
  }
  function tCenter(e) {
    return [(e.touches[0].clientX + e.touches[1].clientX) / 2,
            (e.touches[0].clientY + e.touches[1].clientY) / 2];
  }

  window.addEventListener('resize', scheduleLabels);
  window.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '+' || e.key === '=') zoomAt(VW / 2, VH / 2, 1.3);
    if (e.key === '-') zoomAt(VW / 2, VH / 2, 1 / 1.3);
    if (e.key === '0') resetView();
    if (e.key === 'Escape') select(null, false);
  });
}

function showTip(e, r) {
  tooltip.innerHTML = '<b>' + r.short + '</b><span>' + r.type.toLowerCase() +
                      '</span><em>столица — ' + r.capital + '</em>';
  tooltip.classList.add('open');
  var box = stage.getBoundingClientRect();
  var x = e.clientX - box.left + 16, y = e.clientY - box.top + 16;
  var tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  if (x + tw > box.width) x = e.clientX - box.left - tw - 14;
  if (y + th > box.height) y = e.clientY - box.top - th - 14;
  tooltip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
}
function hideTip() { tooltip.classList.remove('open'); }

function bindControls() {
  var repaintLegend = buildLegend();
  function toggle(id, key, after) {
    var n = document.getElementById(id);
    n.checked = opts[key];
    n.addEventListener('change', function () {
      opts[key] = n.checked;
      if (after) after();
      scheduleLabels();
    });
  }
  toggle('t-rivers', 'rivers', function () {
    gRivers.style.display = opts.rivers ? '' : 'none';
    gRiverLabels.style.display = opts.rivers ? '' : 'none';
  });
  toggle('t-labels', 'labels');
  toggle('t-capitals', 'capitals');
  toggle('t-all', 'allLabels');
  toggle('t-lakes', 'lakes', function () {
    gLakes.style.display = opts.lakes ? '' : 'none';
  });
  document.getElementById('color-by').addEventListener('change', function (e) {
    opts.colorBy = e.target.value;
    regions.forEach(function (r) { r.el.setAttribute('fill', fillOf(r)); });
    repaintLegend();
  });
  document.getElementById('zoom-in').addEventListener('click', function () { zoomAt(VW / 2, VH / 2, 1.35); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomAt(VW / 2, VH / 2, 1 / 1.35); });
  document.getElementById('zoom-reset').addEventListener('click', resetView);
  document.getElementById('download').addEventListener('click', downloadSVG);
  document.getElementById('sidebar-toggle').addEventListener('click', function () {
    document.body.classList.toggle('sidebar-open');
  });
}

function downloadSVG() {
  var clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', VW);
  clone.setAttribute('height', VH);
  var css = document.getElementById('map-style').textContent;
  var style = el('style', {});
  style.textContent = css;
  clone.insertBefore(style, clone.firstChild);
  var blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n',
                       new XMLSerializer().serializeToString(clone)],
                      { type: 'image/svg+xml' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'karta-rossii.svg';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}

function stats() {
  var n = regions.filter(function (r) { return r.district !== '—'; }).length;
  document.getElementById('stats').textContent =
    n + ' субъекта федерации · ' + riverData.length + ' рек · ' +
    geo.lakes.length + ' озёр и водохранилищ';
}

function init() {
  prepare();
  build();
  buildSidebar();
  buildSearch();
  bindMap();
  bindControls();
  stats();
  applyView();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
