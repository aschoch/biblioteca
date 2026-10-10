"""Une catálogo + fichas + portadas en data/books.js (window.BOOKS)."""
import json, os, colorsys, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
base = json.load(open("data/base.json"))
en = {}
import glob
for f in sorted(glob.glob("data/enrich*.json")):
    for e in json.load(open(f)): en[e["id"]] = e
fix = json.load(open("data/fixes.json")) if os.path.exists("data/fixes.json") else {}
cov = json.load(open("data/covers.json"))

THEME_HUES = {"Liderazgo y empresa": 205, "Familia y crianza": 25, "Historia y actualidad": 35,
  "Narrativa": 350, "Teatro": 5, "Clásicos grecolatinos": 40, "Filosofía": 225, "Educación": 150,
  "Poesía": 280, "Obras de consulta": 0, "Magisterio de la Iglesia": 45, "Fe y espiritualidad": 190,
  "Schoenstatt": 165, "Arte": 15, "Teología del cuerpo": 330}

def spine_color(hexc, seed, theme):
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    if hexc:
        r, g, b = (int(hexc[i:i+2], 16) / 255 for i in (1, 3, 5))
        hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    else:
        hh = ((THEME_HUES.get(theme, 30) + (h % 40) - 20) % 360) / 360
        ss = .25 + (h % 30) / 100; ll = .3 + (h >> 8) % 30 / 100
    ll = min(max(ll, .2), .74); ss = min(ss, .62)
    r, g, b = colorsys.hls_to_rgb(hh, ll, ss)
    return "#%02x%02x%02x" % tuple(round(x * 255) for x in (r, g, b))

out = []
for b in base:
    e = {**en.get(b["id"], {}), **fix.get(b["id"], {})}
    c = cov.get(b["id"], {})
    rec = {
        "id": b["id"], "shelf": b["shelf"], "theme": e.get("theme") or b["theme"],
        "title": e.get("title") or b["title"],
        "author": e.get("author") or b["author"] or "Autor desconocido",
        "sortKey": e.get("sortKey") or b["sortKey"] or "~",
        "note": e.get("note", b["note"]),
        "summary": e.get("summary", ""), "authorBio": e.get("authorBio", ""),
        "year": e.get("year"), "originalTitle": e.get("originalTitle"),
        "language": e.get("language"), "pages": e.get("pages"),
        "tags": e.get("tags", []),
        "cover": c.get("file"),
        "ratio": round(c["h"] / c["w"], 3) if c.get("file") else 1.5,
        "color": spine_color(c.get("color"), b["id"], b["theme"]),
    }
    out.append({k: v for k, v in rec.items() if v not in (None, "", [])})
with open("data/books.js", "w") as f:
    f.write("window.BOOKS = ")
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
print(len(out), "libros;", sum(1 for o in out if o.get("cover")), "con portada")
