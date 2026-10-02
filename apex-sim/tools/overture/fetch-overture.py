#!/usr/bin/env python3
"""Real map data → a map's JSON (§13.1 실제 지도). Reads Overture Maps (https://overturemaps.org, the open GeoParquet
release on AWS S3, anonymous access) for a square around a point and writes, in the maps' local frame (x east, z south
[m] from the point — the same projection as tools/dem/fetch-dem.mjs):

  roads:     every transportation segment of subtype road: class, subclass, primary name, surface, flags (bridge,
             tunnel, …), width, level, polyline
  buildings: footprints with height / level count / class / name
  water:     lakes, reservoirs, rivers and streams (polygons and lines)

Only the Parquet row groups whose bounding boxes touch the square are read (footers first), so a few MB of a
multi-hundred-GB release come down.

  pip install pyarrow shapely
  python3 tools/overture/fetch-overture.py --lat 38.09 --lon 128.43 --size 8000 --out web/public/data/dem/seorak.osm.json

Data: Overture Maps Foundation (ODbL for the OpenStreetMap-derived layers; see the release's attribution).
"""
import argparse, json, math, time
from concurrent.futures import ThreadPoolExecutor

import pyarrow.fs as pafs
import pyarrow.parquet as pq
import pyarrow.compute as pc
from shapely import wkb
from shapely.geometry import box, LineString, MultiLineString, Polygon, MultiPolygon

ap = argparse.ArgumentParser()
ap.add_argument('--lat', type=float, required=True)
ap.add_argument('--lon', type=float, required=True)
ap.add_argument('--size', type=float, default=8000)
ap.add_argument('--release', default='2026-09-23.1')
ap.add_argument('--out', required=True)
ap.add_argument('--themes', default='segment,building,water')
a = ap.parse_args()

R = 6371008.8
half = a.size / 2
dlat = math.degrees(half / R)
dlon = math.degrees(half / (R * math.cos(math.radians(a.lat))))
W, E, S, N = a.lon - dlon, a.lon + dlon, a.lat - dlat, a.lat + dlat
clip = box(W, S, E, N)
s3 = pafs.S3FileSystem(anonymous=True, region='us-west-2')
root = f'overturemaps-us-west-2/release/{a.release}'


def local(lon, lat):
    x = math.radians(lon - a.lon) * R * math.cos(math.radians(a.lat))
    z = -math.radians(lat - a.lat) * R
    return [round(x, 2), round(z, 2)]


def rows(theme, columns):
    """Rows of `theme` (theme=…/type=…) whose bbox overlaps the square, as pyarrow tables."""
    infos = s3.get_file_info(pafs.FileSelector(f'{root}/{theme}'))
    files = [i.path for i in infos if i.path.endswith('.parquet') or 'part-' in i.path]

    def scan(path):
        f = pq.ParquetFile(path, filesystem=s3)
        md = f.metadata
        idx = {md.schema.column(i).path: i for i in range(md.num_columns)}
        hit = []
        for g in range(md.num_row_groups):
            rg = md.row_group(g)
            st = {k: rg.column(idx[f'bbox.{k}']).statistics for k in ('xmin', 'xmax', 'ymin', 'ymax')}
            if any(s is None or not s.has_min_max for s in st.values()):
                hit.append(g)
                continue
            if st['xmin'].min <= E and st['xmax'].max >= W and st['ymin'].min <= N and st['ymax'].max >= S:
                hit.append(g)
        if not hit:
            return None
        t = f.read_row_groups(hit, columns=columns + ['bbox'])
        b = t.column('bbox')
        m = pc.and_(pc.and_(pc.less_equal(pc.struct_field(b, 'xmin'), E), pc.greater_equal(pc.struct_field(b, 'xmax'), W)),
                    pc.and_(pc.less_equal(pc.struct_field(b, 'ymin'), N), pc.greater_equal(pc.struct_field(b, 'ymax'), S)))
        t = t.filter(m)
        return t if t.num_rows else None

    with ThreadPoolExecutor(32) as ex:
        return [t for t in ex.map(scan, files) if t is not None]


def lines(g):
    g = g.intersection(clip)
    if g.is_empty:
        return []
    parts = g.geoms if hasattr(g, 'geoms') else [g]
    return [[local(x, y) for x, y in p.coords] for p in parts if isinstance(p, LineString) and len(p.coords) >= 2]


def rings(g):
    g = g.intersection(clip)
    if g.is_empty:
        return []
    parts = g.geoms if hasattr(g, 'geoms') else [g]
    return [[local(x, y) for x, y in p.exterior.coords] for p in parts if isinstance(p, Polygon)]


def first(rules):
    if not rules:
        return None
    return rules[0].get('value') if isinstance(rules[0], dict) else None


out = {'meta': {'lat': a.lat, 'lon': a.lon, 'size': a.size, 'release': a.release,
                'source': 'Overture Maps Foundation, https://overturemaps.org (release ' + a.release + ')',
                'attribution': '© OpenStreetMap contributors (ODbL), Overture Maps Foundation'},
       'roads': [], 'buildings': [], 'water': []}
themes = a.themes.split(',')
t0 = time.time()
if 'segment' in themes:
    for t in rows('theme=transportation/type=segment', ['id', 'geometry', 'subtype', 'class', 'subclass', 'names', 'road_surface', 'road_flags', 'width_rules', 'level_rules']):
        for r in t.to_pylist():
            if r['subtype'] != 'road':
                continue
            for pts in lines(wkb.loads(r['geometry'])):
                flags = sorted({v for f in (r['road_flags'] or []) for v in (f.get('values') or [])})
                out['roads'].append({'id': r['id'], 'class': r['class'], 'subclass': r['subclass'],
                                     'name': (r['names'] or {}).get('primary'), 'surface': first(r['road_surface']),
                                     'flags': flags, 'width': first(r['width_rules']), 'level': first(r['level_rules']), 'pts': pts})
if 'building' in themes:
    for t in rows('theme=buildings/type=building', ['id', 'geometry', 'height', 'num_floors', 'class', 'subtype', 'names']):
        for r in t.to_pylist():
            for ring in rings(wkb.loads(r['geometry'])):
                out['buildings'].append({'height': r['height'], 'floors': r['num_floors'], 'class': r['class'] or r['subtype'],
                                         'name': (r['names'] or {}).get('primary'), 'pts': ring})
if 'water' in themes:
    for t in rows('theme=base/type=water', ['id', 'geometry', 'subtype', 'class', 'names']):
        for r in t.to_pylist():
            g = wkb.loads(r['geometry'])
            if isinstance(g, (Polygon, MultiPolygon)):
                for ring in rings(g):
                    out['water'].append({'kind': 'area', 'class': r['class'], 'subtype': r['subtype'], 'name': (r['names'] or {}).get('primary'), 'pts': ring})
            else:
                for pts in lines(g):
                    out['water'].append({'kind': 'line', 'class': r['class'], 'subtype': r['subtype'], 'name': (r['names'] or {}).get('primary'), 'pts': pts})
with open(a.out, 'w') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n')
print(f"{a.out}: {len(out['roads'])} road segments, {len(out['buildings'])} buildings, {len(out['water'])} water features ({time.time() - t0:.0f} s)")
