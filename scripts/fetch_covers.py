"""Busca portadas: Open Library (búsqueda y por ISBN) y Amazon por ISBN.
Guarda covers/<id>.jpg (máx. 640 px de alto) y data/covers.json con color dominante."""
import gzip, json, io, os, sys, time, urllib.parse, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
UA = {"User-Agent": "biblioteca-personal/1.0 (alfredo)"}
books = json.load(open("data/base.json"))
extra = {}
import glob
for p in sorted(glob.glob("data/enrich*.json")):
    for e in json.load(open(p)): extra[e["id"]] = e
meta = json.load(open("data/covers.json")) if os.path.exists("data/covers.json") else {}
overrides = json.load(open("data/cover_overrides.json")) if os.path.exists("data/cover_overrides.json") else {}
force = "--force" in sys.argv
only = [a for a in sys.argv[1:] if not a.startswith("--")]

def get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    if data[:2] == b"\x1f\x8b":  # algunas tiendas sirven la imagen comprimida con gzip
        data = gzip.decompress(data)
    return data

def img_ok(data):
    try:
        im = Image.open(io.BytesIO(data)); im.load()
    except Exception:
        return None
    w, h = im.size
    if w < 120 or h < 160 or h / w < 1.05 or h / w > 2.2:
        return None
    return im.convert("RGB")

def isbn10(i13):
    i13 = i13.replace("-", "")
    if len(i13) == 10: return i13
    if len(i13) != 13 or not i13.startswith("978"): return None
    core = i13[3:12]
    s = sum((10 - k) * int(c) for k, c in enumerate(core)) % 11
    chk = (11 - s) % 11
    return core + ("X" if chk == 10 else str(chk))

def candidates(b):
    e = extra.get(b["id"], {})
    if b["id"] in overrides:
        yield "override", overrides[b["id"]]
    isbn = (e.get("isbn") or "").replace("-", "")
    if isbn:
        yield "ol-isbn", f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false"
        i10 = isbn10(isbn)
        if i10:
            yield "amazon", f"https://images-na.ssl-images-amazon.com/images/P/{i10}.01.LZZZZZZZ.jpg"
    title = b["title"].split(" (")[0]
    author = e.get("author") or b["author"]
    surname = (e.get("sortKey") or b["sortKey"] or "").split(" ")[0]
    for t in (title, title.split(". ")[0]):
        q = {"title": t, "limit": "5", "fields": "title,author_name,cover_i"}
        if surname and author not in ("Alan",): q["author"] = surname
        try:
            d = json.loads(get("https://openlibrary.org/search.json?" + urllib.parse.urlencode(q)))
        except Exception as ex:
            print("  search err", ex); continue
        for doc in d.get("docs", []):
            if doc.get("cover_i"):
                yield "ol-search", f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"
        if t == title.split(". ")[0]: break

def dominant(im):
    small = im.resize((40, 60))
    q = small.quantize(colors=5, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette(); counts = sorted(q.getcolors(), reverse=True)
    def sat(c):
        r, g, b = c; mx, mn = max(c), min(c)
        return (mx - mn) / (mx + 1)
    cols = [tuple(pal[i*3:i*3+3]) for _, i in counts]
    # preferir el color frecuente más saturado; si todos son grises, el más frecuente
    best = max(cols[:3], key=lambda c: sat(c) * 1.5 + 0.0) if any(sat(c) > .25 for c in cols[:3]) else cols[0]
    return "#%02x%02x%02x" % best

for b in books:
    if only and b["id"] not in only: continue
    if b["id"] in meta and meta[b["id"]].get("file") and not force: continue
    got = None
    for src, url in candidates(b):
        try:
            data = get(url)
        except Exception:
            continue
        im = img_ok(data)
        if im:
            got = (src, url, im); break
        time.sleep(0.2)
    if got:
        src, url, im = got
        if im.height > 640: im = im.resize((round(im.width * 640 / im.height), 640), Image.LANCZOS)
        path = f"covers/{b['id']}.jpg"; im.save(path, quality=84, optimize=True, progressive=True)
        meta[b["id"]] = {"file": path, "src": src, "url": url, "color": dominant(im), "w": im.width, "h": im.height}
        print(f"OK   {src:9} {b['title'][:60]}")
    else:
        meta[b["id"]] = {"file": None}
        print(f"MISS           {b['title'][:60]}")
    json.dump(meta, open("data/covers.json", "w"), indent=1)
print(sum(1 for v in meta.values() if v.get("file")), "/", len(books))
