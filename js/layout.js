/* ===================================================================
 * layout.js — геометрия этажа: из описания блоков (коридор + помещения
 * по сторонам) строит контур здания, прямоугольники помещений, двери
 * и осевые линии коридоров.
 * =================================================================== */

const PX_PER_M = 18; // масштаб схемы: пикселей на метр

const _layoutCache = new Map();

function layoutFloor(building, floor) {
  const key = `${building.id}:${floor.level}`;
  if (_layoutCache.has(key)) return _layoutCache.get(key);

  const { SLOT, DEPTH, CORRIDOR } = GEOM;
  const rooms = [];
  const corridors = [];
  const shells = [];

  floor.blocks.forEach(blk => {
    const horizontal = blk.axis === 'h';
    const len = blk.slots * SLOT;
    const hasA = blk.a.length > 0;
    const hasB = blk.b.length > 0;

    // Коридор
    const corridorRect = horizontal
      ? { x: blk.x, y: blk.y - CORRIDOR / 2, w: len, h: CORRIDOR }
      : { x: blk.x - CORRIDOR / 2, y: blk.y, w: CORRIDOR, h: len };
    corridors.push({
      blockId: blk.id, axis: blk.axis, rect: corridorRect,
      x1: blk.x, y1: blk.y,
      x2: horizontal ? blk.x + len : blk.x,
      y2: horizontal ? blk.y : blk.y + len,
      slots: blk.slots,
    });

    // Наружный контур блока
    shells.push(horizontal
      ? {
          x: blk.x,
          y: blk.y - CORRIDOR / 2 - (hasA ? DEPTH : 0),
          w: len,
          h: CORRIDOR + (hasA ? DEPTH : 0) + (hasB ? DEPTH : 0),
        }
      : {
          x: blk.x - CORRIDOR / 2 - (hasA ? DEPTH : 0),
          y: blk.y,
          w: CORRIDOR + (hasA ? DEPTH : 0) + (hasB ? DEPTH : 0),
          h: len,
        });

    // Помещения по сторонам
    ['a', 'b'].forEach(side => {
      let offset = 0;
      blk[side].forEach(spec => {
        const w = (spec.w || 1) * SLOT;
        let rect, door, attach;

        if (horizontal) {
          const rx = blk.x + offset;
          const ry = side === 'a'
            ? blk.y - CORRIDOR / 2 - DEPTH
            : blk.y + CORRIDOR / 2;
          rect = { x: rx, y: ry, w, h: DEPTH };
          const doorX = rx + w / 2;
          door = { x: doorX, y: side === 'a' ? ry + DEPTH : ry };
          attach = { x: doorX, y: blk.y };
        } else {
          const ry = blk.y + offset;
          const rx = side === 'a'
            ? blk.x - CORRIDOR / 2 - DEPTH
            : blk.x + CORRIDOR / 2;
          rect = { x: rx, y: ry, w: DEPTH, h: w };
          const doorY = ry + w / 2;
          door = { x: side === 'a' ? rx + DEPTH : rx, y: doorY };
          attach = { x: blk.x, y: doorY };
        }

        rooms.push({
          id: rid(),
          buildingId: building.id,
          buildingName: building.name,
          level: floor.level,
          floorLabel: floor.label,
          blockId: blk.id,
          side,
          number: spec.number || '',
          name: spec.name,
          category: spec.cat,
          stack: spec.stack || null,
          link: spec.link || null,
          passageKey: spec.key || null,
          isEntrance: !!spec.isEntrance,
          rect, door, attach,
          cx: rect.x + rect.w / 2,
          cy: rect.y + rect.h / 2,
        });

        offset += w;
      });
    });
  });

  // Габариты этажа
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  shells.forEach(s => {
    minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
  });

  const result = {
    building, floor, rooms, corridors, shells,
    bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
  _layoutCache.set(key, result);
  return result;
}

/** Все этажи всех корпусов — для построения графа и индекса поиска. */
function layoutAll(buildings) {
  const all = [];
  buildings.forEach(b => b.floors.forEach(f => all.push(layoutFloor(b, f))));
  return all;
}

if (typeof window !== 'undefined') {
  Object.assign(window, { layoutFloor, layoutAll, PX_PER_M });
}
