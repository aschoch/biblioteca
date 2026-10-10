# La biblioteca de Alfredo

Una estantería digital con los libros de casa. Pulsa un lomo para sacar el libro de la balda y verle la portada; pulsa la portada para abrir su ficha.

**Web:** https://aschoch.github.io/biblioteca/

## Cómo añadir o corregir un libro

1. Edita `scripts/catalog.py` (título, autor, apellido para ordenar y tema) y ejecútalo: `python3 scripts/catalog.py`.
2. Añade o corrige el resumen y los datos en `data/fixes.json`, por ejemplo:
   ```json
   { "id-del-libro": { "summary": "…", "year": 1999, "author": "…", "sortKey": "…" } }
   ```
3. Si falta una portada, pon su URL en `data/cover_overrides.json` (`{"id-del-libro": "https://…jpg"}`) y ejecuta `python3 scripts/fetch_covers.py id-del-libro --force`.
4. Regenera los datos de la web: `python3 scripts/build.py`, y sube los cambios.

Es una web estática (HTML, CSS y JS sin dependencias), publicada con GitHub Pages.
