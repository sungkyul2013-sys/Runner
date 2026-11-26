import osmium, math, struct, base64, sys, json
LON0, LON1, LAT0, LAT1 = 127.055, 127.110, 37.495, 37.528
CLON, CLAT = (LON0+LON1)/2, (LAT0+LAT1)/2
KX = math.cos(math.radians(CLAT))*111320.0; KZ = 110540.0
def proj(lon, lat): return ((lon-CLON)*KX, -(lat-CLAT)*KZ)
def inb(lon, lat): return LON0 <= lon <= LON1 and LAT0 <= lat <= LAT1
def dp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dmax, idx = 0, 0
    ax, az = a; bx, bz = b; L = math.hypot(bx-ax, bz-az) or 1e-9
    for i in range(1, len(pts)-1):
        px, pz = pts[i]; d = abs((bx-ax)*(az-pz)-(ax-px)*(bz-az))/L
        if d > dmax: dmax, idx = d, i
    if dmax > eps: return dp(pts[:idx+1], eps)[:-1] + dp(pts[idx:], eps)
    return [a, b]
def ring(nodes, eps):
    pts = [proj(n.lon, n.lat) for n in nodes]
    if len(pts) > 3 and pts[0] == pts[-1]: pts = pts[:-1]
    if len(pts) < 3: return None
    k = max(range(len(pts)), key=lambda i: (pts[i][0]-pts[0][0])**2 + (pts[i][1]-pts[0][1])**2)
    s = dp(pts[:k+1], eps)[:-1] + dp(pts[k:] + [pts[0]], eps)[:-1]
    return s if len(s) >= 3 else None
def num(v):
    try: return float(str(v).split(';')[0].replace('m','').strip())
    except: return None
B, W, P, R = [], [], [], []
ERR = 0
ROADW = {'motorway':26,'trunk':24,'primary':20,'secondary':15,'tertiary':11,'motorway_link':9,'trunk_link':9,'primary_link':8,'secondary_link':7,'residential':7,'unclassified':7,'service':4,'living_street':5}
class H(osmium.SimpleHandler):
    def area(self, a):
        t = a.tags
        kind = None
        if 'building' in t or 'building:part' in t: kind = 'b'
        elif t.get('natural') == 'water' or t.get('waterway') == 'riverbank' or t.get('water'): kind = 'w'
        elif t.get('leisure') in ('park','garden','pitch','golf_course','stadium') or t.get('landuse') in ('grass','recreation_ground','forest','meadow','village_green') or t.get('natural') in ('wood','scrub'): kind = 'p'
        if not kind: return
        try:
            for outer in a.outer_rings():
                o = list(outer)
                if not o: continue
                if not any(inb(n.lon, n.lat) for n in o[::max(1,len(o)//8)]): continue
                r = ring(o, 0.6 if kind=='b' else 4)
                if not r: continue
                holes = []
                if kind != 'b':
                    for inner in a.inner_rings(outer):
                        h = ring(list(inner), 4)
                        if h: holes.append(h)
                if kind == 'b':
                    h = num(t.get('height')); lv = num(t.get('building:levels'))
                    mh = num(t.get('min_height')) or 0
                    if h is None: h = lv*3.4+1 if lv else None
                    B.append((r, h, mh, t.get('building',''), t.get('name','')))
                elif kind == 'w': W.append((r, holes))
                else: P.append((r, holes))
        except Exception as e:
            global ERR
            if ERR < 3: print("ERR", repr(e), file=sys.stderr); ERR += 1
    def way(self, w):
        hw = w.tags.get('highway')
        if hw not in ROADW: return
        try:
            nodes = list(w.nodes)
            if not any(inb(n.lon, n.lat) for n in nodes): return
            pts = dp([proj(n.lon, n.lat) for n in nodes], 2.0)
            if len(pts) >= 2: R.append((ROADW[hw], pts, hw))
        except Exception: pass
h = H()
fp = osmium.FileProcessor(sys.argv[1]).with_locations().with_areas()
for obj in fp:
    if obj.is_area(): h.area(obj)
    elif obj.is_way(): h.way(obj)
hs = [b[1] for b in B if b[1]]
print('buildings', len(B), 'with height', len(hs), 'max', max(hs) if hs else 0, 'water', len(W), 'parks', len(P), 'roads', len(R), file=sys.stderr)
top = sorted([b for b in B if b[1]], key=lambda b: -b[1])[:12]
for b in top: print(' ', round(b[1]), b[4], file=sys.stderr)
# --- binary encode: int16 quarter-metres
out = bytearray()
def q(v): return max(-32767, min(32767, int(round(v*4))))
def put_ring(r):
    out.extend(struct.pack('<H', len(r)))
    for x, z in r: out.extend(struct.pack('<hh', q(x), q(z)))
out.extend(struct.pack('<4sIIII', b'SEO1', len(B), len(W), len(P), len(R)))
KIND = {'apartments':1,'residential':1,'house':2,'commercial':3,'office':3,'retail':3,'industrial':4,'school':5,'university':5,'church':6,'stadium':7,'yes':0}
for r, h, mh, kind, name in B:
    out.extend(struct.pack('<HHB', int(min(65000, (h or 0)*10)), int(min(65000, mh*10)), KIND.get(kind, 0)))
    put_ring(r)
for lst in (W, P):
    for r, holes in lst:
        out.extend(struct.pack('<B', len(holes)))
        put_ring(r)
        for h in holes: put_ring(h)
for w, pts, hw in R:
    out.extend(struct.pack('<B', w)); put_ring(pts)
print('bytes', len(out), file=sys.stderr)
open(sys.argv[2], 'w').write('// Gangnam/Songpa (Seoul) — building footprints, water, parks and roads.\n// Source: OpenStreetMap contributors (ODbL 1.0), via github.com/maiego/osm-seoul extract.\n// Encoded by flight/scripts/extract_seoul.py (int16 quarter-metre local coordinates).\nexport default "' + base64.b64encode(bytes(out)).decode() + '";\n')
