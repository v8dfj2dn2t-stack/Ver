# Данные для карты России (`russia/index.html`)

Три файла в `russia/js/` собраны скриптами из этой папки:

| файл | что внутри | скрипт |
|---|---|---|
| `russia/js/geo.js` | границы 89 регионов, суша соседних стран, озёра и водохранилища | `geo.py` |
| `russia/js/regions.js` | названия, типы, столицы с координатами, округа, площадь и население | `regions.py` |
| `russia/js/rivers.js` | русла крупных рек с русскими названиями и длинами | `rivers.py` |

## Как пересобрать

```sh
mkdir -p work && cd work
BASE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
curl -O $BASE/ne_10m_admin_1_states_provinces.geojson
curl -O $BASE/ne_10m_rivers_lake_centerlines.geojson
curl -O $BASE/ne_10m_lakes.geojson
curl -O $BASE/ne_10m_populated_places.geojson
curl -O $BASE/ne_50m_admin_0_countries.geojson
# скрипты ждут короткие имена
for f in 10m_admin_1_states_provinces:ne10_admin1 10m_rivers_lake_centerlines:ne10_rivers \
         10m_lakes:ne10_lakes 10m_populated_places:ne10_places 50m_admin_0_countries:ne50_countries; do
  mv "ne_${f%%:*}.geojson" "${f##*:}.geojson"
done

# генерализация границ (нужен mapshaper: npm i -g mapshaper)
mapshaper ne10_admin1.geojson \
  -filter 'admin=="Russia" || ["UA-09","UA-14","UA-23","UA-65"].indexOf(iso_3166_2) > -1' \
  -filter-fields iso_3166_2,adm1_code,name,name_ru \
  -simplify 40% keep-shapes -clean \
  -o precision=0.001 format=geojson ru_regions_40.json

python3 ../geo.py && python3 ../regions.py && python3 ../rivers.py
# положить как russia/js/geo.js, russia/js/regions.js, russia/js/rivers.js
cp russia-geo.js ../../../russia/js/geo.js
cp russia-regions.js ../../../russia/js/regions.js
cp russia-rivers.js ../../../russia/js/rivers.js
```

`rivers.py` сам прореживает точки (алгоритм Дугласа — Пекера), поэтому файл рек
получается примерно в три раза меньше исходного.

## Проверки, которые стоит прогнать после пересборки

* столица каждого субъекта попадает внутрь его же полигона (кроме Ленинградской
  области — её центр Санкт-Петербург в состав области не входит, и Абакана,
  который стоит вплотную к границе Хакасии и после генерализации оказывается
  по другую её сторону, и Херсона, который стоит на самом краю области);
* у всех 89 записей `russia-regions.js` есть геометрия в `russia-geo.js` и наоборот;
* точка подписи (полюс недоступности) лежит внутри своего субъекта.

## Спорные территории

Шесть записей помечены `disputed: true` — Крым и Севастополь (2014) плюс ЛНР, ДНР,
Запорожская и Херсонская области (2022). В `ne_10m_admin_1_states_provinces` они лежат
под кодами `UA-…`, поэтому и попадают в выборку отдельным условием фильтра. На карте
они идут штриховкой и отдельной группой в списке; для четырёх областей 2022 года
площадь и население — довоенные данные по украинской области, а не перепись 2021 года.

## Источники

* Natural Earth 1:10 млн и 1:50 млн — общественное достояние (public domain).
* Площадь и население — Росстат, Всероссийская перепись населения 2021 года.
* Длины рек — справочные, для реки целиком, включая участки вне России.
