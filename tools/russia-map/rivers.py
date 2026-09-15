# -*- coding: utf-8 -*-
"""Extract major Russian rivers from Natural Earth 10m river centerlines."""
import json, math, os, sys

SC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# NE english name -> (russian name, length_km of the whole river, order)
# "order": 1 = greatest rivers (thick), 2 = large, 3 = notable tributaries
RIVERS = {
 'Volga':        ('Волга', 3531, 1),
 'Ob':           ('Обь', 3650, 1),
 'Malaya Ob':    ('Обь (Малая Обь)', None, 2),
 'Yenisey':      ('Енисей', 3487, 1),
 'Verkhniy Yenisey': ('Верхний Енисей (Улуг-Хем)', None, 2),
 'Bol’shoy Yenisey': ('Большой Енисей (Бий-Хем)', 605, 3),
 'Malyy Yenisey':('Малый Енисей (Каа-Хем)', 563, 3),
 'Lena':         ('Лена', 4400, 1),
 'Amur':         ('Амур', 2824, 1),
 'Irtysh':       ('Иртыш', 4248, 1),
 'Ertis':        ('Иртыш', 4248, 1),
 'Kolyma':       ('Колыма', 2129, 2),
 'Indigirka':    ('Индигирка', 1726, 2),
 'Yana':         ('Яна', 872, 2),
 'Aldan':        ('Алдан', 2273, 2),
 'Vilyuy':       ('Вилюй', 2650, 2),
 'Olenëk':       ('Оленёк', 2292, 2),
 'Anabar':       ('Анабар', 939, 3),
 'Khatanga':     ('Хатанга', 1636, 2),
 'Kheta':        ('Хета', 604, 3),
 'Kotuy':        ('Котуй', 1409, 3),
 'Pyasina':      ('Пясина', 818, 3),
 'Taz':          ('Таз', 1401, 3),
 'Pur':          ('Пур', 389, 3),
 'Nadym':        ('Надым', 545, 3),
 'Angara':       ('Ангара', 1779, 2),
 'Lower Tunguska': ('Нижняя Тунгуска', 2989, 2),
 'Podkamennaya Tunguska': ('Подкаменная Тунгуска', 1865, 2),
 'Selenga':      ('Селенга', 1024, 2),
 'Vitim':        ('Витим', 1837, 3),
 'Olëkma':       ('Олёкма', 1436, 3),
 'Chara':        ('Чара', 851, 3),
 'Uchur':        ('Учур', 812, 3),
 'Maya':         ('Мая', 1053, 3),
 'Markha':       ('Марха', 1181, 3),
 'Tyung':        ('Тюнг', 1092, 3),
 'Kama':         ('Кама', 1805, 2),
 'Vyatka':       ('Вятка', 1314, 3),
 'Belaya':       ('Белая', 1430, 3),
 'Chusovaya':    ('Чусовая', 592, 3),
 'Vishera':      ('Вишера', 415, 3),
 'Oka':          ('Ока', 1500, 2),
 'Sura':         ('Сура', 841, 3),
 'Don':          ('Дон', 1870, 2),
 'Khopr':        ('Хопёр', 979, 3),
 'Donets':       ('Северский Донец', 1053, 3),
 'Ural':         ('Урал', 2428, 2),
 'Kuban':        ('Кубань', 870, 3),
 'Terek':        ('Терек', 623, 3),
 'Severnaya Dvina': ('Северная Двина', 744, 2),
 'Sukhona':      ('Сухона', 558, 3),
 'Vychegda':     ('Вычегда', 1130, 3),
 'Pinega':       ('Пинега', 779, 3),
 'Vym':          ('Вымь', 499, 3),
 'Luza':         ('Луза', 574, 3),
 'Unzha':        ('Унжа', 426, 3),
 'Mezen':        ('Мезень', 966, 3),
 'Onega':        ('Онега', 416, 3),
 'Pechora':      ('Печора', 1809, 2),
 'Usa':          ('Уса', 565, 3),
 'Neva':         ('Нева', 74, 3),
 'Svir':         ('Свирь', 224, 3),
 'Volkhov':      ('Волхов', 224, 3),
 'Msta':         ('Мста', 445, 3),
 'Tvertsa':      ('Тверца', 188, 3),
 'Sheksna':      ('Шексна', 139, 3),
 'Suda':         ('Суда', 184, 3),
 'Velikaya':     ('Великая', 430, 3),
 'Tuloma':       ('Тулома', 64, 3),
 'Kola':         ('Кола', 83, 3),
 'Voronya':      ('Воронья', 155, 3),
 'Kem':          ('Кемь', 191, 3),
 'Tobol':        ('Тобол', 1591, 2),
 'Ishim':        ('Ишим', 2450, 2),
 'Esil':         ('Ишим', 2450, 2),
 'Tura':         ('Тура', 1030, 3),
 'Chulym':       ('Чулым', 1799, 3),
 'Tom’':         ('Томь', 827, 3),
 'Kondoma':      ('Кондома', 392, 3),
 'Katun':        ('Катунь', 688, 3),
 'Biya':         ('Бия', 301, 3),
 'Chulyshman':   ('Чулышман', 241, 3),
 'Vasyugan':     ('Васюган', 1082, 3),
 'Vakh':         ('Вах', 964, 3),
 'Bol’shoy Yugan': ('Большой Юган', 1063, 3),
 'Severnaya Sos’va': ('Северная Сосьва', 754, 3),
 'Zeya':         ('Зея', 1242, 2),
 'Selemdzha':    ('Селемджа', 647, 3),
 'Bureya':       ('Бурея', 623, 3),
 'Amgun’':       ('Амгунь', 723, 3),
 'Ussuri':       ('Уссури', 897, 2),
 'Bikin':        ('Бикин', 560, 3),
 'Shilka':       ('Шилка', 560, 2),
 'Ingoda':       ('Ингода', 708, 3),
 'Onon':         ('Онон', 1032, 3),
 'Argun’':       ('Аргунь', 1620, 2),
 'Anadyr’':      ('Анадырь', 1150, 2),
 'Omolon':       ('Омолон', 1114, 3),
 'Bol’shoy Anyuy': ('Большой Анюй', 693, 3),
 'Alazeya':      ('Алазея', 1590, 3),
 'Adycha':       ('Адыча', 715, 3),
 'Penzhina':     ('Пенжина', 713, 3),
 'Kamchatka':    ('Камчатка', 758, 2),
 'Poronay':      ('Поронай', 350, 3),
 'Tumnin':       ('Тумнин', 364, 3),
 'Kureyka':      ('Курейка', 888, 3),
 'Taymura':      ('Таймура', 522, 3),
 'Nizhnyaya Taymyra': ('Нижняя Таймыра', 187, 3),
 'Verkhnyaya Taymyra': ('Верхняя Таймыра', 567, 3),
 'Popigay':      ('Попигай', 532, 3),
 'Moma':         ('Мома', 406, 3),
 'Seym':         ('Сейм', 748, 3),
 'Desna':        ('Десна', 1130, 3),
 'Tsna':         ('Цна', 451, 3),
 'Chuna':        ('Чуна (Уда)', 1203, 3),
 'Uda':          ('Уда', 467, 3),
 'Mana':         ('Мана', 475, 3),
 'Kukhtuy':      ('Кухтуй', 147, 3),
 'Selennyakh':   ('Селеннях', 796, 3),
 'Dulgalakh':    ('Дулгалах', 507, 3),
 'Sartang':      ('Сартанг', 620, 3),
 'Bytantay':     ('Бытантай', 586, 3),
 'Ozhogina':     ('Ожогина', 523, 3),
 'Oloy':         ('Олой', 471, 3),
 'Palyavaam':    ('Паляваам', 416, 3),
 'Udzha':        ('Уджа', 334, 3),
 'Bol’shaya Kuonamka': ('Большая Куонамка', 457, 3),
 'Nizhnyaya Tunguska': ('Нижняя Тунгуска', 2989, 2),
}

# Bounding box of Russia (rivers are kept only where they run through it).
def in_russia(x, y):
    if y < 40 or y > 83: return False
    if x >= 19 and x <= 180: return True
    if x <= -168: return True   # Chukotka east of the date line
    return False

def rdp(pts, eps):
    if len(pts) < 3: return pts
    keep = [False]*len(pts); keep[0]=keep[-1]=True
    stack=[(0,len(pts)-1)]
    while stack:
        a,b = stack.pop()
        ax,ay = pts[a]; bx,by = pts[b]
        dx,dy = bx-ax, by-ay
        den = math.hypot(dx,dy)
        best=-1.0; idx=-1
        for i in range(a+1,b):
            x,y = pts[i]
            d = abs(dy*x - dx*y + bx*ay - by*ax)/den if den else math.hypot(x-ax,y-ay)
            if d > best: best=d; idx=i
        if best > eps and idx>0:
            keep[idx]=True; stack.append((a,idx)); stack.append((idx,b))
    return [pt for pt,k in zip(pts,keep) if k]

def parts(geom):
    if geom['type'] == 'LineString': return [geom['coordinates']]
    if geom['type'] == 'MultiLineString': return geom['coordinates']
    return []

def main():
    src = json.load(open(os.path.join(SC, 'ne10_rivers.geojson')))
    out = {}
    for f in src['features']:
        p = f['properties']
        nm = p.get('name')
        if nm not in RIVERS: continue
        ru, length, order = RIVERS[nm]
        for line in parts(f['geometry']):
            if not any(in_russia(c[0], c[1]) for c in line): continue
            line = rdp([[c[0], c[1]] for c in line], 0.004 if order == 1 else 0.008 if order == 2 else 0.015)
            line = [[round(c[0], 3), round(c[1], 3)] for c in line]
            r = out.setdefault(ru, {'name': ru, 'length': length, 'order': order, 'lines': []})
            r['lines'].append(line)
    rivers = sorted(out.values(), key=lambda r: (r['order'], -(r['length'] or 0)))
    print(len(rivers), 'rivers', sum(len(r['lines']) for r in rivers), 'segments')
    json.dump(rivers, open(os.path.join(SC, 'rivers.json'), 'w'), ensure_ascii=False)

main()
