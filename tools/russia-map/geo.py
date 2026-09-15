# -*- coding: utf-8 -*-
"""Assemble the geometry bundle: federal subjects, neighbouring land, lakes."""
import json, os
SC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def rings(geom):
    if geom['type'] == 'Polygon': return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon': return geom['coordinates']
    return []

def round_poly(polys, nd):
    out = []
    for poly in polys:
        rr = []
        for ring in poly:
            pts = [[round(c[0], nd), round(c[1], nd)] for c in ring]
            ded = [pts[0]]
            for p in pts[1:]:
                if p != ded[-1]: ded.append(p)
            if len(ded) >= 4: rr.append(ded)
        if rr: out.append(rr)
    return out

def bbox(polys):
    xs = [c[0] for poly in polys for ring in poly for c in ring]
    ys = [c[1] for poly in polys for ring in poly for c in ring]
    return [min(xs), min(ys), max(xs), max(ys)]

# ---- federal subjects -------------------------------------------------------
src = json.load(open(os.path.join(SC, 'ru_regions_40.json')))
regions = {}
for f in src['features']:
    code = f['properties']['iso_3166_2']
    if code == 'RU-X01~': code = 'RU-YAN'          # small Kara Sea island off Yamal
    regions.setdefault(code, []).extend(rings(f['geometry']))
regions = {k: round_poly(v, 3) for k, v in regions.items()}
print('regions:', len(regions))

# ---- neighbouring land ------------------------------------------------------
land = []
cn = json.load(open(os.path.join(SC, 'ne50_countries.geojson')))
NAMES = {
 'Kazakhstan': 'КАЗАХСТАН', 'China': 'КИТАЙ', 'Mongolia': 'МОНГОЛИЯ',
 'Ukraine': 'УКРАИНА', 'Belarus': 'БЕЛАРУСЬ', 'Finland': 'ФИНЛЯНДИЯ',
 'Norway': 'НОРВЕГИЯ', 'Sweden': 'ШВЕЦИЯ', 'Estonia': 'ЭСТОНИЯ',
 'Latvia': 'ЛАТВИЯ', 'Lithuania': 'ЛИТВА', 'Poland': 'ПОЛЬША',
 'Georgia': 'ГРУЗИЯ', 'Azerbaijan': 'АЗЕРБАЙДЖАН', 'Armenia': 'АРМЕНИЯ',
 'Japan': 'ЯПОНИЯ', 'North Korea': 'КНДР', 'Turkey': 'ТУРЦИЯ',
 'Uzbekistan': 'УЗБЕКИСТАН', 'Turkmenistan': 'ТУРКМЕНИСТАН',
 'Kyrgyzstan': 'КИРГИЗИЯ', 'Tajikistan': 'ТАДЖИКИСТАН',
 'United States of America': 'США', 'Iran': 'ИРАН', 'Moldova': 'МОЛДОВА',
 'Romania': 'РУМЫНИЯ', 'Denmark': 'ДАНИЯ', 'Germany': 'ГЕРМАНИЯ',
 'South Korea': 'РЕСПУБЛИКА КОРЕЯ',
}
def keep(polys):
    out = []
    for poly in polys:
        xs = [c[0] for c in poly[0]]; ys = [c[1] for c in poly[0]]
        if max(ys) < 25 or min(ys) > 85: continue
        if not ((max(xs) > 0 and min(xs) < 180) or max(xs) < -140): continue
        if (max(xs) - min(xs)) * (max(ys) - min(ys)) < 0.35: continue
        out.append(poly)
    return out
for f in cn['features']:
    p = f['properties']
    nm = p.get('ADMIN') or p.get('NAME')
    if nm == 'Russia': continue
    polys = keep(rings(f['geometry']))
    if not polys: continue
    polys = round_poly(polys, 2)
    if not polys: continue
    land.append({'name': NAMES.get(nm), 'polys': polys})
print('land polygons:', sum(len(l['polys']) for l in land))

# ---- lakes ------------------------------------------------------------------
lakes = []
lk = json.load(open(os.path.join(SC, 'ne10_lakes.geojson')))
for f in lk['features']:
    p = f['properties']
    polys = rings(f['geometry'])
    xs = [c[0] for poly in polys for ring in poly for c in ring]
    ys = [c[1] for poly in polys for ring in poly for c in ring]
    if not xs: continue
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    if not (y1 > 40 and ((x0 > 18 and x1 < 181) or x0 < -165)): continue
    size = (x1 - x0) * (y1 - y0)
    rank = p.get('scalerank') or 9
    if size < 0.12 and rank > 4: continue
    polys = round_poly(polys, 3)
    if not polys: continue
    lakes.append({'name': p.get('name_ru'), 'rank': rank, 'size': round(size, 3),
                  'polys': polys})
lakes.sort(key=lambda l: -l['size'])
print('lakes:', len(lakes))

bundle = {'regions': regions, 'land': land, 'lakes': lakes}
out = os.path.join(SC, 'russia-geo.js')
with open(out, 'w') as fh:
    fh.write('window.RU_GEO = ')
    json.dump(bundle, fh, ensure_ascii=False, separators=(',', ':'))
    fh.write(';\n')
print('wrote', out, os.path.getsize(out))
