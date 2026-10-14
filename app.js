(() => {
  "use strict";

  const BOOKS = window.BOOKS || [];
  // Orden de las baldas: literatura → pensamiento y arte → familia y educación → fe → consulta y empresa.
  const THEMES = [
    ["Narrativa", "#8c2f2b"], ["Poesía", "#7a4b86"], ["Teatro", "#a3423a"], ["Clásicos grecolatinos", "#b08a3e"],
    ["Filosofía", "#3e4f86"], ["Historia y actualidad", "#9a6a2f"], ["Arte", "#b4532f"],
    ["Educación", "#3d7a5a"], ["Familia y crianza", "#c0703a"], ["Cocina", "#b5602e"], ["Teología del cuerpo", "#a2456a"],
    ["Fe y espiritualidad", "#2f7480"], ["Magisterio de la Iglesia", "#b8892f"], ["Schoenstatt", "#2f7a6a"],
    ["Obras de consulta", "#6b6257"], ["Ciencia y técnica", "#466a78"], ["Liderazgo y empresa", "#2f5d7c"],
  ];
  const THEME_COLOR = Object.fromEntries(THEMES);
  const THEME_ORDER = Object.fromEntries(THEMES.map(([t], i) => [t, i]));
  const THEME_SHORT = { "Clásicos grecolatinos": "Clásicos", "Historia y actualidad": "Historia" };
  const themeLabel = (t) => THEME_SHORT[t] || t;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ——— Preparación de datos ———
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4));
    return .2126 * r + .7152 * g + .0722 * b;
  };
  BOOKS.forEach((b) => {
    const h = hash(b.id);
    b.text = lum(b.color) > .36 ? "#221e1a" : "#fbf6ec";
    b.w = Math.round(Math.min(58, Math.max(26, 15 + (b.pages || 220) / 14)));
    b.h = b.theme === "Obras de consulta" ? 214 : 164 + (h % 46);
    b.band = h % 4;
    b.surname = b.sortKey === "~" ? "" : b.sortKey;
    // En el lomo va el título principal, sin subtítulo (como en los libros de verdad).
    const main = b.title.replace(/\s*\(([^)]{6,})\)$/, "").split(/(?<=\S)(?:\. |: )/)[0];
    b.spineTitle = main.length >= 4 ? main : b.title;
    b._hay = norm([b.title, b.author, b.theme, b.originalTitle, (b.tags || []).join(" "), b.note, b.summary, b.language].join(" · "));
    b._ti = norm(b.title); b._au = norm(b.author);
  });
  const byId = Object.fromEntries(BOOKS.map((b) => [b.id, b]));

  // ——— Estado ———
  const state = {
    q: "",
    sort: store.get("bib.sort", "theme"),
    view: (() => {
      const saved = store.get("bib.view", "");
      if (saved === "shelf" || saved === "grid") return saved;
      return matchMedia("(max-width: 560px)").matches ? "grid" : "shelf";
    })(),
    theme: null,
    read: "",   // filtro de lecturas: "", "bea", "alfredo", "both", "none", "!bea", "!alfredo"
    list: [],
  };

  // ——— Cabecera ———
  const authors = new Set(BOOKS.map((b) => b.author));
  $("#stats").innerHTML = `<b>${BOOKS.length}</b> libros · <b>${authors.size}</b> autores · <b>${new Set(BOOKS.map((b) => b.theme)).size}</b> temas`;

  // ——— Portadas ———
  // size "thumb": solo la miniatura (rejilla, miniaturas). size "full": la miniatura de fondo
  // (aparece al instante) y encima la imagen grande, que entra con un fundido al cargar.
  function coverHTML(b, eager = false, size = "full") {
    const st = `--c:${b.color};--t:${b.text};--ratio:${b.ratio}`;
    if (b.cover && size === "thumb") {
      return `<div class="cover" style="${st}"><img src="${esc(b.thumb)}" alt="Portada de ${esc(b.title)}" ${eager ? "" : 'loading="lazy"'} decoding="async"></div>`;
    }
    if (b.cover) {
      const ok = loadedFull.has(b.id) ? " ok" : "";
      return `<div class="cover" style="${st};background-image:url('${esc(b.thumb)}')"><img class="hi${ok}" src="${esc(b.cover)}" alt="Portada de ${esc(b.title)}" decoding="async" fetchpriority="high" onload="this.classList.add('ok')"></div>`;
    }
    return `<div class="cover cover--gen" style="${st}">
      <div><div class="cover__t">${esc(b.title)}</div><div class="cover__orn"></div></div>
      <div class="cover__a">${esc(b.author)}</div></div>`;
  }

  // ——— Precarga de portadas (para que el libro salga ya con su portada) ———
  const preloaded = new Map();
  const loadedFull = new Set();
  function load(url) {
    if (!preloaded.has(url)) {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      preloaded.set(url, (img.decode ? img.decode() : new Promise((r) => (img.onload = r))).catch(() => {}));
    }
    return preloaded.get(url);
  }
  const preloadThumb = (b) => (b?.thumb ? load(b.thumb) : Promise.resolve());
  function preload(b) {
    if (!b?.cover) return Promise.resolve();
    preloadThumb(b);
    return load(b.cover).then(() => loadedFull.add(b.id));
  }
  // Antes de que el libro salga basta con la miniatura (pesa poco y suele estar ya en caché).
  const preloadSoon = (b, ms = 350) => Promise.race([preloadThumb(b), new Promise((r) => setTimeout(r, ms))]);

  // Precarga en segundo plano de las miniaturas de los lomos que se ven en pantalla.
  const thumbQueue = [];
  let thumbBusy = 0;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));
  function pumpThumbs() {
    while (thumbBusy < 6 && thumbQueue.length) {
      const b = thumbQueue.shift();
      thumbBusy++;
      preloadThumb(b).finally(() => { thumbBusy--; idle(pumpThumbs); });
    }
  }
  const spineObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      spineObserver.unobserve(e.target);
      const b = byId[e.target.dataset.id];
      if (b?.thumb) thumbQueue.push(b);
    });
    idle(pumpThumbs);
  }, { rootMargin: "300px 0px" }) : null;

  // ——— Agrupación y orden ———
  const stripArticle = (t) => norm(t).replace(/^[¿¡«"'.…\s]+/, "").replace(/^(el|la|los|las|un|una|the|a|an)\s+/, "");
  const cmp = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });
  function era(b) {
    const y = b.year;
    if (y == null) return b.theme === "Clásicos grecolatinos" ? [0, "Antigüedad"] : [9, "Sin fecha"];
    if (y < 500) return [0, "Antigüedad"];
    if (y < 1800) return [1, "Siglos XV – XVIII"];
    if (y < 1900) return [2, "Siglo XIX"];
    if (y < 1950) return [3, "1900 – 1949"];
    if (y < 2000) return [4, "1950 – 1999"];
    if (y < 2010) return [5, "2000 – 2009"];
    if (y < 2020) return [6, "2010 – 2019"];
    return [7, "De 2020 a hoy"];
  }
  function groupsFor(list) {
    const g = new Map();
    const add = (key, label, order, b) => {
      if (!g.has(key)) g.set(key, { key, label, order, items: [] });
      g.get(key).items.push(b);
    };
    if (state.sort === "theme") {
      list.forEach((b) => add(b.theme, b.theme, THEME_ORDER[b.theme] ?? 99, b));
      g.forEach((x) => x.items.sort((a, b) => a.shelf - b.shelf));
    } else if (state.sort === "author") {
      list.forEach((b) => {
        const l = b.sortKey === "~" ? "·" : norm(b.sortKey)[0].toUpperCase();
        add(l, l === "·" ? "?" : l, l === "·" ? "~" : l, b);
      });
      g.forEach((x) => x.items.sort((a, b) => cmp(a.sortKey, b.sortKey) || cmp(a.author, b.author) || cmp(a.title, b.title)));
    } else if (state.sort === "title") {
      list.forEach((b) => {
        const s = stripArticle(b.title); const l = /[0-9]/.test(s[0]) ? "0–9" : s[0].toUpperCase();
        add(l, l, l === "0–9" ? " " : l, b);
      });
      g.forEach((x) => x.items.sort((a, b) => cmp(stripArticle(a.title), stripArticle(b.title))));
    } else {
      list.forEach((b) => { const [o, l] = era(b); add(l, l, o, b); });
      g.forEach((x) => x.items.sort((a, b) => (a.year ?? 1e9) - (b.year ?? 1e9) || cmp(a.title, b.title)));
    }
    return [...g.values()].sort((a, b) => (typeof a.order === "number" ? a.order - b.order : cmp(String(a.order), String(b.order))));
  }

  function filtered() {
    const terms = norm(state.q).split(/\s+/).filter(Boolean);
    return BOOKS.filter((b) => (!state.theme || b.theme === state.theme) && matchesRead(b) && terms.every((t) => b._hay.includes(t)));
  }

  // ——— Lecturas de Bea y Alfredo ———
  // Se guardan en un repositorio público aparte (aschoch/biblioteca-lecturas, lecturas.json).
  // Cualquiera puede verlas; para marcarlas, cada dispositivo se conecta una vez con un
  // token de GitHub que solo puede escribir en ese repositorio.
  const READERS = [
    { id: "bea", name: "Bea", color: "#b85079" },
    { id: "alfredo", name: "Alfredo", color: "#3a6d93" },
  ];
  const READER = Object.fromEntries(READERS.map((r) => [r.id, r]));
  const READS_API = "https://api.github.com/repos/aschoch/biblioteca-lecturas/contents/lecturas.json";
  const parseReads = (o) => Object.fromEntries(READERS.map((r) => [r.id, (o && typeof o[r.id] === "object" && o[r.id]) || {}]));
  let reads = parseReads((() => { try { return JSON.parse(store.get("bib.reads", "{}")); } catch { return {}; } })());
  let token = store.get("bib.token", "");
  const pending = [];          // cambios aún no guardados: { who, id, value }
  const isRead = (who, id) => !!reads[who]?.[id];
  const today = () => new Date().toISOString().slice(0, 10);

  function readStatsHTML() {
    return READERS.map((r) => `<span class="rstat" style="--rc:${r.color}"><i></i>${r.name} <b>${Object.keys(reads[r.id]).filter((id) => byId[id]).length}</b></span>`).join("");
  }
  // Pareja de marcas (✓ / ○) para un libro. size: "sm" (vista del libro) o "lg" (ficha).
  function readFlagsHTML(b, size = "sm") {
    return `<div class="rflags rflags--${size}" role="group" aria-label="Leído por">${READERS.map((r) => {
      const on = isRead(r.id, b.id);
      return `<button class="rflag${on ? " on" : ""}" data-read="${r.id}" data-book="${b.id}" style="--rc:${r.color}"
        aria-pressed="${on}" aria-label="${r.name}: ${on ? "leído" : "sin leer"}">
        <span class="rflag__dot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.5 3.5 7.5-8"/></svg></span>
        <span class="rflag__name">${r.name}</span></button>`;
    }).join("")}</div>`;
  }
  function readDotsHTML(b) {
    const who = READERS.filter((r) => isRead(r.id, b.id));
    return who.length ? `<span class="rdots" aria-hidden="true">${who.map((r) => `<i style="--rc:${r.color}"></i>`).join("")}</span>` : "";
  }
  function matchesRead(b) {
    const f = state.read;
    if (!f) return true;
    const be = isRead("bea", b.id), al = isRead("alfredo", b.id);
    return { bea: be, alfredo: al, both: be && al, none: !be && !al, "!bea": !be, "!alfredo": !al }[f];
  }
  const READ_FILTERS = [
    ["", "Lecturas"], ["bea", "Leídos por Bea"], ["alfredo", "Leídos por Alfredo"], ["both", "Leídos por los dos"],
    ["!bea", "Pendientes de Bea"], ["!alfredo", "Pendientes de Alfredo"], ["none", "Sin leer por nadie"],
  ];

  // Refresca todo lo que depende de las lecturas sin redibujar la estantería entera.
  function refreshReads(changedId) {
    $("#rstats").innerHTML = readStatsHTML();
    $$(`.rflags`).forEach((el) => {
      const id = el.querySelector("[data-book]")?.dataset.book;
      if (!changedId || id === changedId) el.outerHTML = readFlagsHTML(byId[id], el.classList.contains("rflags--lg") ? "lg" : "sm");
    });
    $$(changedId ? `.spine[data-id="${changedId}"], .tile[data-id="${changedId}"]` : ".spine, .tile", lib).forEach((el) => {
      const b = byId[el.dataset.id];
      el.querySelector(".rdots")?.remove();
      const host = el.classList.contains("tile") ? el.querySelector(".tile__cover") : el;
      host.insertAdjacentHTML("beforeend", readDotsHTML(b));
    });
    renderChips();
    if (state.read && !changedId) render();
  }

  async function fetchReads() {
    try {
      const r = await fetch(READS_API + "?t=" + Date.now(), {
        headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      const data = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, "")))));
      return { data: parseReads(data), sha: j.sha };
    } catch {
      return null;
    }
  }
  async function loadReads() {
    const got = await fetchReads();
    if (!got) return;
    reads = got.data;
    pending.forEach((op) => applyOp(reads, op));   // no perder lo marcado mientras cargaba
    store.set("bib.reads", JSON.stringify(reads));
    refreshReads();
  }
  function applyOp(target, { who, id, value }) {
    if (value) target[who][id] = target[who][id] || value;
    else delete target[who][id];
  }

  let saveTimer = null, saving = false;
  function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flushReads, 900); }
  async function flushReads(attempt = 0) {
    if (saving || !pending.length || !token) return;
    saving = true;
    const batch = pending.splice(0, pending.length);
    try {
      const got = await fetchReads();
      if (!got) throw new Error("read");
      const next = got.data;
      batch.forEach((op) => applyOp(next, op));
      const sorted = Object.fromEntries(READERS.map((r) => [r.id, Object.fromEntries(Object.entries(next[r.id]).sort())]));
      const msg = batch.length === 1
        ? `${READER[batch[0].who].name} ${batch[0].value ? "ha leído" : "desmarca"} «${byId[batch[0].id]?.title || batch[0].id}»`
        : `Actualiza ${batch.length} lecturas`;
      const body = { message: msg, sha: got.sha, content: btoa(unescape(encodeURIComponent(JSON.stringify(sorted, null, 1) + "\n"))) };
      const r = await fetch(READS_API, {
        method: "PUT",
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        pending.unshift(...batch);
        saving = false;
        toast("Este dispositivo ya no tiene permiso para marcar lecturas");
        openAccess();
        return;
      }
      if (!r.ok) throw new Error(r.status);   // 409: alguien guardó a la vez → reintentar
      const before = JSON.stringify(reads);
      reads = sorted;
      pending.forEach((op) => applyOp(reads, op));
      store.set("bib.reads", JSON.stringify(reads));
      saving = false;
      if (JSON.stringify(reads) !== before) refreshReads();   // trae también lo marcado desde el otro móvil
      if (pending.length) queueSave();
    } catch {
      pending.unshift(...batch);
      saving = false;
      if (attempt < 3) setTimeout(() => flushReads(attempt + 1), 800 * (attempt + 1));
      else toast("No se pudo guardar. Se reintentará al volver a marcar.");
    }
  }
  addEventListener("pagehide", () => { if (pending.length) flushReads(); });

  function toggleRead(who, id) {
    if (!token) { openAccess(who, id); return; }
    const value = isRead(who, id) ? null : today();
    const op = { who, id, value };
    applyOp(reads, op);
    pending.push(op);
    store.set("bib.reads", JSON.stringify(reads));
    navigator.vibrate?.(value ? 10 : 6);
    refreshReads(id);
    const btn = $(`.rflags [data-read="${who}"][data-book="${id}"]`);
    if (btn && value && !reduceMotion) btn.querySelector(".rflag__dot")?.animate(
      [{ transform: "scale(.6)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
    if (state.read) render();
    queueSave();
  }

  // ——— Conectar este dispositivo ———
  const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new?" + new URLSearchParams({
    name: "Biblioteca · lecturas",
    description: "Marcar lecturas en aschoch.github.io/biblioteca",
    target_name: "aschoch",
    expires_in: "none",
    contents: "write",
  });
  let afterConnect = null;
  function openAccess(who, id) {
    afterConnect = who && id ? () => toggleRead(who, id) : null;
    const dlg = $("#access");
    dlg.querySelector("#tokenUrl").href = TOKEN_URL;
    dlg.classList.toggle("connected", !!token);
    $("#accessErr").textContent = "";
    $("#tokenInput").value = "";
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  async function connect(t) {
    t = (t || "").trim();
    if (!t) return false;
    try {
      const r = await fetch("https://api.github.com/repos/aschoch/biblioteca-lecturas", { headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json" } });
      const j = r.ok ? await r.json() : null;
      if (!j?.permissions?.push) throw new Error("perm");
    } catch {
      return false;
    }
    token = t;
    store.set("bib.token", t);
    return true;
  }

  // ——— Pintado ———
  const lib = $("#library");
  function spineHTML(b, extra = "") {
    return `<div class="slot"><button class="spine${extra}" data-id="${b.id}" data-band="${b.band}"
      style="--c:${b.color};--t:${b.text};--w:${b.w}px;--h:${b.h}px"
      aria-label="${esc(b.title)}, de ${esc(b.author)}" title="${esc(b.title)} — ${esc(b.author)}">
      <span class="spine__title">${esc(b.spineTitle)}</span>
      <span class="spine__author">${esc(b.surname)}</span>${readDotsHTML(b)}</button></div>`;
  }
  // ——— Ajuste del texto en los lomos ———
  // Busca el mayor tamaño de letra (y el menor número de líneas) con el que el
  // título cabe entero en el lomo. Si no cabe ni así, se quita el apellido.
  const meter = document.createElement("span");
  meter.setAttribute("aria-hidden", "true");
  meter.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;contain:layout style";
  document.body.appendChild(meter);
  const widthCache = new Map();
  function textWidth(text, kind) {
    const key = kind + "|" + text;
    if (!widthCache.has(key)) {
      meter.className = kind === "serif" ? "measure-serif" : "measure-sans";
      meter.textContent = text;
      widthCache.set(key, meter.getBoundingClientRect().width);
    }
    return widthCache.get(key); // medido a 20px
  }
  function wrap(words, fs, avail, maxLines, kind) {
    const w = (t) => textWidth(t, kind) * fs / 20 * 1.04;
    const lines = [];
    let cur = "";
    for (const word of words) {
      const test = cur ? cur + " " + word : word;
      if (w(test) <= avail) { cur = test; continue; }
      if (!cur || lines.length + 1 >= maxLines) return null;
      lines.push(cur); cur = word;
      if (w(cur) > avail) return null;
    }
    lines.push(cur);
    return lines;
  }
  function fitText(text, { avail, cross, max, min, kind, lh }) {
    const words = text.split(/\s+/);
    for (let fs = max; fs >= min; fs -= .5) {
      const maxLines = Math.max(1, Math.min(3, Math.floor(cross / (fs * lh))));
      for (let n = 1; n <= maxLines; n++) {
        const lines = wrap(words, fs, avail, n, kind);
        if (lines) return { fs, lines };
      }
    }
    return null;
  }
  function truncate(text, fs, avail, kind) {
    const w = (t) => textWidth(t, kind) * fs / 20 * 1.04;
    let t = text;
    while (t.length > 1 && w(t + "…") > avail) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  }
  function fitSpines(root = lib) {
    $$(".spine", root).forEach((el) => {
      const b = byId[el.dataset.id];
      const cross = b.w - 8;
      const tEl = $(".spine__title", el), aEl = $(".spine__author", el);
      const authorLen = b.surname ? Math.min(b.h * .4, textWidth(b.surname.toUpperCase(), "sans") * 8 / 20 * 1.12 + b.surname.length * .96) : 0;
      let res = fitText(b.spineTitle, { avail: b.h - 28 - (authorLen ? authorLen + 8 : 0), cross, max: b.w >= 40 ? 15 : 13.5, min: 9, kind: "serif", lh: 1.1 });
      let showAuthor = !!b.surname;
      if (!res) {
        showAuthor = false;
        res = fitText(b.spineTitle, { avail: b.h - 26, cross, max: 12, min: 8.5, kind: "serif", lh: 1.1 });
      }
      if (!res) res = { fs: 9, lines: [truncate(b.spineTitle, 9, b.h - 26, "serif")] };
      const natural = b.surname ? textWidth(b.surname.toUpperCase(), "sans") * 8 / 20 * 1.12 : 0;
      aEl.style.fontSize = natural > b.h * .34 ? Math.max(6, 8 * b.h * .34 / natural) + "px" : "";
      tEl.style.fontSize = res.fs + "px";
      tEl.innerHTML = res.lines.map((l) => `<span>${esc(l)}</span>`).join("");
      aEl.hidden = !showAuthor;
    });
    $$(".divider:not(.divider--letter)", root).forEach((el) => {
      const lab = $(".divider__label", el);
      const text = lab.dataset.text || (lab.dataset.text = lab.textContent);
      const res = fitText(text.toUpperCase(), { avail: 118, cross: 24, max: 10, min: 7.5, kind: "sans", lh: 1.25 });
      if (res) { lab.style.fontSize = res.fs + "px"; lab.innerHTML = res.lines.map(esc).join("<br>"); }
    });
  }
  if (document.fonts?.ready) document.fonts.ready.then(() => { widthCache.clear(); fitSpines(); });

  function tileHTML(b) {
    return `<button class="tile" data-id="${b.id}" aria-label="${esc(b.title)}, de ${esc(b.author)}">
      <div class="tile__cover">${coverHTML(b, false, "thumb")}${readDotsHTML(b)}</div>
      <p class="tile__t">${esc(b.title)}</p><p class="tile__a">${esc(b.author)}</p></button>`;
  }

  function render() {
    const list = filtered();
    const groups = groupsFor(list);
    state.list = groups.flatMap((g) => g.items);
    renderStatus(list.length);
    if (!list.length) {
      const bits = [];
      if (state.q) bits.push(`«${esc(state.q)}»`);
      if (state.theme) bits.push(esc(state.theme));
      if (state.read) {
        const t = READ_FILTERS.find(([k]) => k === state.read)[1];
        bits.push(t.toLowerCase());
      }
      const tail = bits.length ? ` con ${bits.join(" · ")}` : "";
      lib.innerHTML = `<div class="empty"><p>Ningún libro coincide${tail}.</p>
        <button class="btn" data-reset>Ver todos los libros</button></div>`;
      return;
    }
    const count = (n) => `${n} ${n === 1 ? "libro" : "libros"}`;
    if (state.view === "grid") {
      lib.innerHTML = groups.map((g) => `<section class="group" aria-label="${esc(g.label)}">
        <header class="group__head"><h2>${esc(g.label)}</h2><span>${count(g.items.length)}</span></header>
        <div class="grid">${g.items.map(tileHTML).join("")}</div></section>`).join("");
      return;
    }
    // Estantería continua, como en casa: cada grupo empieza con un separador.
    const short = state.sort === "author" || state.sort === "title";
    lib.innerHTML = `<div class="case${state.q ? " searching" : ""}">${groups.map((g) => {
      const c = state.sort === "theme" ? THEME_COLOR[g.label] : null;
      const divider = `<div class="slot slot--divider"><div class="divider${short ? " divider--letter" : ""}" ${c ? `style="--c:${c}"` : ""} role="heading" aria-level="2">
        <span class="divider__label">${esc(g.label)}</span><span class="divider__count">${g.items.length}</span></div></div>`;
      return divider + g.items.map((b) => spineHTML(b)).join("");
    }).join("")}</div>`;
    fitSpines();
    if (spineObserver) { spineObserver.disconnect(); $$(".spine", lib).forEach((el) => spineObserver.observe(el)); }
  }

  // Resumen de la búsqueda o el filtro activo, con un atajo para quitarlos.
  function renderStatus(n) {
    const el = $("#results");
    if (!n || (!state.q && !state.theme && !state.read)) { el.hidden = true; el.innerHTML = ""; return; }
    const parts = [];
    if (state.read) { const t = READ_FILTERS.find(([k]) => k === state.read)[1]; parts.push(`· <b>${t[0].toLowerCase() + t.slice(1)}</b>`); }
    if (state.q) parts.push(`para «${esc(state.q)}»`);
    if (state.theme) parts.push(`en <b>${esc(state.theme)}</b>`);
    el.hidden = false;
    el.innerHTML = `<span><b>${n}</b> ${n === 1 ? "libro" : "libros"} ${parts.join(" ")}</span>
      <button class="results__reset" data-reset>Quitar filtros</button>`;
  }
  function resetFilters() {
    clearTimeout(qt);
    qInput.value = ""; state.q = ""; state.theme = null; state.read = "";
    syncClear(); renderChips(); render(); scrollToLibrary();
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-reset]") && stage.hidden) resetFilters(); });

  // Si estamos más abajo de la estantería, volver a su principio tras cambiar lo que se ve.
  const libraryTop = () => $(".masthead").offsetHeight;
  function scrollToLibrary() {
    const top = libraryTop();
    if (scrollY > top + 4) window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  }

  // ——— Chips de temas ———
  function renderChips() {
    const counts = {};
    BOOKS.forEach((b) => (counts[b.theme] = (counts[b.theme] || 0) + 1));
    const rcount = (k) => BOOKS.filter((b) => { const keep = state.read; state.read = k; const ok = matchesRead(b); state.read = keep; return ok; }).length;
    const label = READ_FILTERS.find(([k]) => k === state.read)[1];
    $("#chips").innerHTML =
      `<label class="chip chip--read" aria-pressed="${!!state.read}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13"/></svg>
        <span>${label}</span>${state.read ? `<small>${rcount(state.read)}</small>` : ""}
        <svg class="chip__caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>
        <select id="readFilter" aria-label="Filtrar por lecturas">${READ_FILTERS.map(([k, t]) =>
          `<option value="${k}"${k === state.read ? " selected" : ""}>${k ? `${t} (${rcount(k)})` : "Todas las lecturas"}</option>`).join("")}</select>
      </label><span class="chips__sep" aria-hidden="true"></span>` +
      `<button class="chip" data-theme="" aria-pressed="${!state.theme}">Todos <small>${BOOKS.length}</small></button>` +
      THEMES.filter(([t]) => counts[t]).map(([t, c]) =>
        `<button class="chip" data-theme="${esc(t)}" style="--c:${c}" aria-pressed="${state.theme === t}" aria-label="${esc(t)}"><i></i>${esc(themeLabel(t))} <small>${counts[t]}</small></button>`).join("");
    syncFilterLabel();
  }
  function syncFilterLabel() {
    const btn = $("#filterToggle");
    if (!btn) return;
    const text = state.theme ? themeLabel(state.theme) : state.read ? READ_FILTERS.find(([k]) => k === state.read)[1] : "Filtros";
    $("#filterToggleLabel").textContent = text;
    btn.classList.toggle("is-on", !!(state.theme || state.read));
    btn.style.setProperty("--c", state.theme ? (THEME_COLOR[state.theme] || "var(--muted)") : "transparent");
    btn.setAttribute("aria-pressed", String(!!(state.theme || state.read)));
  }
  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c || c.classList.contains("chip--read")) return;
    state.theme = c.dataset.theme || null;
    renderChips(); render(); scrollToLibrary();
    if (narrowQ.matches) closeFilters();
    const active = $(`.chip[aria-pressed="true"]:not(.filter-toggle)`);
    active?.scrollIntoView({ inline: "center", block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  });
  $("#chips").addEventListener("change", (e) => {
    if (e.target.id !== "readFilter") return;
    state.read = e.target.value;
    renderChips(); render(); scrollToLibrary();
    if (narrowQ.matches) closeFilters();
  });
  const chipsEl = $("#chips");
  const syncChipFade = () => {
    chipsEl.classList.toggle("at-start", chipsEl.scrollLeft < 4);
    chipsEl.classList.toggle("at-end", chipsEl.scrollLeft + chipsEl.clientWidth > chipsEl.scrollWidth - 4);
  };
  chipsEl.addEventListener("scroll", syncChipFade, { passive: true });
  addEventListener("resize", syncChipFade);
  requestAnimationFrame(syncChipFade);

  // ——— Controles ———
  function syncSeg() {
    $$("#sort button").forEach((b) => b.setAttribute("aria-checked", b.dataset.sort === state.sort));
    $$("#view button").forEach((b) => b.setAttribute("aria-checked", b.dataset.view === state.view));
  }
  $("#sort").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.sort = b.dataset.sort; store.set("bib.sort", state.sort); syncSeg(); render(); scrollToLibrary();
    if (narrowQ.matches) closeFilters();
  });
  $("#view").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.view = b.dataset.view; store.set("bib.view", state.view); syncSeg(); render(); scrollToLibrary();
    if (narrowQ.matches) closeFilters();
  });
  let qt;
  const qInput = $("#q");
  const qClear = $("#qClear");
  const syncClear = () => {
    const has = qInput.value.length > 0;
    qClear.hidden = !has;
    $(".search").classList.toggle("has-value", has);
  };
  // Tocar en cualquier parte de la caja enfoca el campo.
  $(".search").addEventListener("click", (e) => { if (!e.target.closest("button")) qInput.focus(); });
  // Mantener el foco (y el teclado del móvil) al pulsar la x.
  qClear.addEventListener("pointerdown", (e) => e.preventDefault());
  qClear.addEventListener("click", () => {
    clearTimeout(qt);
    qInput.value = ""; state.q = ""; syncClear(); render();
    qInput.focus();
  });
  // «Buscar» en el teclado del móvil: aplica ya la búsqueda y cierra el teclado.
  qInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    clearTimeout(qt); state.q = qInput.value.trim(); render(); qInput.blur();
  });
  qInput.addEventListener("input", () => {
    syncClear();
    clearTimeout(qt);
    qt = setTimeout(() => { state.q = qInput.value.trim(); render(); scrollToLibrary(); }, 90);
  });
  function setQuery(q) {
    qInput.value = q; state.q = q; state.theme = null; syncClear(); renderChips(); render();
    window.scrollTo({ top: libraryTop(), behavior: reduceMotion ? "auto" : "smooth" });
  }

  // La barra no cambia de alto al desplazarse: en iOS eso ancla mal el scroll y salta arriba.
  const toolbar = $("#toolbar"), toTop = $("#toTop");
  const syncStuck = () => {
    const stickAt = parseFloat(getComputedStyle(toolbar).top) || 0;
    toolbar.classList.toggle("stuck", $(".masthead").getBoundingClientRect().bottom <= stickAt + 0.5);
  };
  syncStuck();
  const narrowQ = matchMedia("(max-width: 560px)");
  // En el móvil el orden vive en la hoja: la barra no lo repite y no cambia de alto al desplazarse.
  function restoreControls() {
    const controls = $(".controls");
    if (narrowQ.matches) {
      $("#filtersSort").appendChild($("#sort"));
      controls.appendChild($("#view"));
    } else {
      controls.appendChild($("#sort"));
      controls.appendChild($("#view"));
      $(".chipfold__in").appendChild($("#chips"));
    }
    $("#controlsSlot").appendChild(controls);
  }
  function placeChrome() {
    const meta = $("#meta"), random = $("#random"), inner = $(".toolbar__inner");
    if (narrowQ.matches) {
      inner.insertBefore(random, $("#controlsSlot"));
      toolbar.insertBefore(meta, $("#chipFold"));
      $("#filtersChips").appendChild($("#chips"));
      restoreControls();
    } else {
      meta.appendChild(random);
      $(".masthead .wrap").appendChild(meta);
      restoreControls();
      closeFilters();
    }
  }
  function openFilters() {
    $("#filtersChips").appendChild($("#chips"));
    $("#filtersSort").appendChild($("#sort"));
    const dlg = $("#filters");
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    $("#filterToggle").setAttribute("aria-expanded", "true");
  }
  function closeFilters() {
    const dlg = $("#filters");
    if (!dlg) return;
    restoreControls();
    if (dlg.open && dlg.close) dlg.close();
    else dlg.removeAttribute("open");
    $("#filterToggle")?.setAttribute("aria-expanded", "false");
  }
  placeChrome();
  narrowQ.addEventListener("change", placeChrome);
  $("#filterToggle").addEventListener("click", () => { if (narrowQ.matches) openFilters(); });
  $("#filters").addEventListener("click", (e) => {
    if (e.target === $("#filters") || e.target.closest("[data-close-filters]")) closeFilters();
  });
  $("#filters").addEventListener("close", () => {
    restoreControls();
    $("#filterToggle")?.setAttribute("aria-expanded", "false");
  });
  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      syncStuck();
      toTop.classList.toggle("show", scrollY > innerHeight * 1.5);
      ticking = false;
    });
  }, { passive: true });
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));

  // Sorpréndeme: saca un libro al azar de lo que se está viendo.
  $("#random").addEventListener("click", async () => {
    const list = state.list.length ? state.list : BOOKS;
    const b = list[Math.floor(Math.random() * list.length)];
    preload(b);
    const el = $(`.spine[data-id="${b.id}"], .tile[data-id="${b.id}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      await wait(reduceMotion ? 0 : 550);
    }
    openBook(b.id, el);
  });

  // ¿Se está usando el teclado? Solo entonces movemos el foco al abrir y cerrar
  // (evita el contorno de foco tras tocar o hacer clic).
  let keyboardNav = false;
  document.addEventListener("keydown", (e) => { if (e.key === "Tab" || e.key.startsWith("Arrow") || e.key === "Enter" || e.key === "Escape") keyboardNav = true; }, true);
  document.addEventListener("pointerdown", () => { keyboardNav = false; }, true);
  const focusIfKeyboard = (el) => { if (el && keyboardNav) el.focus({ preventScroll: true }); };

  // ——— Escenario ———
  const stage = $("#stage");
  const inner = $("#bookInner");
  const scroller = $("#stageScroll");
  const detail = $(".detail");
  const backdrop = $(".stage__backdrop");
  const phoneStage = matchMedia("(max-width: 760px)");
  let current = null;   // libro abierto
  let source = null;    // elemento de la estantería desde el que salió

  const baseTitle = document.title;
  function fillStage(b) {
    document.title = `${b.title} · ${baseTitle}`;
    const list = state.list.length ? state.list : BOOKS;
    const i = list.indexOf(b);
    if (i >= 0) [list[i - 1], list[i + 1]].forEach(preload);
    inner.innerHTML = coverHTML(b, true) + `
      <span class="b3 b3--pages" aria-hidden="true"></span>
      <span class="b3 b3--top" aria-hidden="true"></span>
      <span class="b3 b3--bottom" aria-hidden="true"></span>
      <span class="b3 b3--spine" aria-hidden="true">${spineFaceHTML(b)}</span>`;
    inner.style.setProperty("--ratio", b.ratio);
    fitSpines(inner);
    sizeBook();
    $("#p-title").textContent = b.title;
    $("#p-author").innerHTML = `<button type="button" data-search="${esc(b.author)}">${esc(b.author)}</button>`;
    $("#p-reads").innerHTML = readFlagsHTML(b, "sm");
    $("#info").innerHTML = infoHTML(b);
    $("#stageScroll").scrollTop = 0;
  }

  // Grosor del libro relativo a su altura: el mismo que tiene su lomo en la balda.
  const depthOf = (b) => Math.min(.2, b.w / b.h);
  function spineFaceHTML(b) {
    return `<div class="spine" data-id="${b.id}" data-band="${b.band}" style="--c:${b.color};--t:${b.text};--w:${b.w}px;--h:${b.h}px">
      <span class="spine__title">${esc(b.spineTitle)}</span><span class="spine__author">${esc(b.surname)}</span></div>`;
  }
  // Ajusta el grosor (y la escala del lomo) al tamaño real con el que se ve el libro.
  function sizeBook() {
    if (!current) return;
    const H = inner.offsetHeight;
    if (!H) return;
    const d = H * depthOf(current);
    inner.style.setProperty("--d", d + "px");
    inner.style.setProperty("--sx", d / current.w);
    inner.style.setProperty("--sy", H / current.h);
  }
  if ("ResizeObserver" in window) new ResizeObserver(sizeBook).observe(inner);

  function infoHTML(b) {
    const facts = [
      b.year != null && ["Publicado", b.year < 0 ? `${-b.year} a. C.` : b.year],
      b.pages && ["Páginas", `≈ ${b.pages}`],
      b.language && ["Idioma original", b.language[0].toUpperCase() + b.language.slice(1)],
      b.originalTitle && b.originalTitle !== b.title && ["Título original", `<i>${esc(b.originalTitle)}</i>`],
    ].filter(Boolean);
    const sameAuthor = b.author !== "Autor desconocido" ? BOOKS.filter((x) => x.author === b.author && x.id !== b.id) : [];
    const shelf = BOOKS.filter((x) => x.theme === b.theme && x.id !== b.id && !sameAuthor.includes(x))
      .sort((x, y) => Math.abs(x.shelf - b.shelf) - Math.abs(y.shelf - b.shelf)).slice(0, 10);
    const mini = (x) => `<button class="mini" data-goto="${x.id}">${coverHTML(x, false, "thumb")}<span>${esc(x.title)}</span></button>`;
    return `
      <span class="theme-pill" style="--c:${THEME_COLOR[b.theme] || "#888"}"><i></i>${esc(b.theme)}</span>
      <h2 class="info__title" id="d-title">${esc(b.title)}</h2>
      <p class="info__author">de <button data-search="${esc(b.author)}">${esc(b.author)}</button></p>
      ${readFlagsHTML(b, "lg")}
      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div class="fact${k === "Título original" ? " fact--wide" : ""}"><dt>${k}</dt><dd>${typeof v === "string" && v.startsWith("<i>") ? v : esc(v)}</dd></div>`).join("")}</dl>` : '<div style="height:26px"></div>'}
      ${b.summary ? `<p class="summary">${esc(b.summary)}</p>` : ""}
      ${b.note ? `<p class="note">${esc(b.note)}</p>` : ""}
      ${b.authorBio ? `<h3>Sobre el autor</h3><p class="bio">${esc(b.authorBio)}</p>` : ""}
      ${b.tags?.length ? `<h3>Temas</h3><div class="tags">${b.tags.map((t) => `<button class="tag" data-search="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
      ${sameAuthor.length ? `<h3>Más de ${esc(b.author)}</h3><div class="mini-row">${sameAuthor.map(mini).join("")}</div>` : ""}
      ${shelf.length ? `<h3>En la misma balda</h3><div class="mini-row">${shelf.map(mini).join("")}</div>` : ""}
      <div class="share">
        <button class="btn btn--ghost" data-share>${canShare ? "Compartir" : "Copiar enlace"}</button>
      </div>
      ${pagerHTML(b)}`;
  }

  const canShare = !!navigator.share && matchMedia("(hover: none)").matches;
  function pagerHTML(b) {
    const list = state.list.length ? state.list : BOOKS;
    const i = list.indexOf(b);
    if (i < 0 || list.length < 2) return "";
    const prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
    return `<nav class="pager" aria-label="Otros libros">
      <button class="pager__btn" data-step="-1"><small>← Anterior</small><span>${esc(prev.title)}</span></button>
      <span class="pager__pos">${i + 1} de ${list.length}</span>
      <button class="pager__btn pager__btn--next" data-step="1"><small>Siguiente →</small><span>${esc(next.title)}</span></button>
    </nav>`;
  }

  function rectOf(el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 60); });
  // Visible de verdad: no tapado por la barra fija de búsqueda.
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    const top = el.closest("#library") ? $("#toolbar").getBoundingClientRect().bottom : 0;
    return r.top + r.height * .4 > top && r.bottom - r.height * .4 < innerHeight && r.right > 0 && r.left < innerWidth;
  };

  // Vuelo plano de la portada (vista de portadas).
  function flyFlat(from, to, b, reverse = false) {
    if (reduceMotion) return Promise.resolve();
    const f = document.createElement("div");
    f.className = "flyer";
    f.innerHTML = coverHTML(b, true);
    Object.assign(f.style, { left: to.x + "px", top: to.y + "px", width: to.w + "px", height: to.h + "px" });
    $(".cover", f).style.cssText += ";width:100%;height:100%;border-radius:3px 8px 8px 3px;box-shadow:var(--shadow-lg);font-size:22px";
    document.body.appendChild(f);
    const frames = [
      { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w}, ${from.h / to.h})` },
      { transform: "translate(0,0) scale(1,1) perspective(900px) rotateY(-14deg)" },
    ];
    if (reverse) frames.reverse();
    const anim = f.animate(frames, { duration: 460, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    return Promise.race([anim.finished, wait(860)]).catch(() => {}).then(() => f.remove());
  }

  // Vuelo en 3D entre el lomo y el centro de la pantalla: un libro de verdad,
  // con tapa, lomo, cantos de páginas y grosor, que gira 90° sobre sí mismo.
  // Vuelo en 3D entre el lomo y el centro de la pantalla. Es la misma caja que el libro
  // de la ficha (mismo grosor, misma inclinación), así que al terminar encaja sin saltos.
  // Al sacarlo: primero sale de la balda hacia nosotros, luego gira y vuela al centro.
  function flyBook(spineEl, b, { reverse = false } = {}) {
    if (reduceMotion) return Promise.resolve();
    const posed = stage.classList.contains("open") && !phoneStage.matches;
    const ry0 = posed ? -8 : -14, rx0 = posed ? 0 : 2;
    const btn = $("#book3d").getBoundingClientRect();
    const W = inner.offsetWidth, H = inner.offsetHeight;
    const cx = btn.left + btn.width / 2, cy = btn.top + H / 2;
    const sr = spineEl.getBoundingClientRect();
    const D = H * depthOf(b), half = D / 2;
    const s = sr.height / H, sxs = sr.width / D;     // escala para encajar justo en el lomo
    const f = document.createElement("div");
    f.className = "book-box";
    Object.assign(f.style, { left: cx - W / 2 + "px", top: cy - H / 2 + "px", width: W + "px", height: H + "px" });
    f.innerHTML = `
      <div class="bb bb--front" style="transform:translateZ(${half}px)">${coverHTML(b, true)}</div>
      <div class="bb bb--back" style="background:${b.color};transform:rotateY(180deg) translateZ(${half}px)"></div>
      <div class="bb bb--side" style="width:${D}px;left:${(W - D) / 2}px;transform:rotateY(-90deg) translateZ(${W / 2}px)"></div>
      <div class="bb bb--pages" style="width:${D}px;left:${(W - D) / 2}px;transform:rotateY(90deg) translateZ(${W / 2}px)"></div>
      <div class="bb bb--pages bb--top" style="height:${D}px;top:${(H - D) / 2}px;transform:rotateX(90deg) translateZ(${H / 2}px)"></div>
      <div class="bb bb--pages bb--top" style="height:${D}px;top:${(H - D) / 2}px;transform:rotateX(-90deg) translateZ(${H / 2}px)"></div>`;
    // El lomo es una copia del de la estantería, escalada para cubrir la cara exacta.
    const clone = spineEl.cloneNode(true);
    clone.classList.remove("is-out");
    clone.removeAttribute("id");
    Object.assign(clone.style, { position: "absolute", left: 0, top: 0, transform: `scale(${D / sr.width}, ${H / sr.height})`, transformOrigin: "0 0", transition: "none", opacity: 1, boxShadow: "none" });
    $(".bb--side", f).appendChild(clone);
    document.body.appendChild(f);
    const dx = sr.left + sr.width / 2 - cx, dy = sr.top + sr.height / 2 - cy;
    // translateZ final (zc): desplaza la caja para que la tapa quede en el plano, como en la ficha.
    const tf = (x, y, sx, sy, z, ry, rx, zc) =>
      `translate(${x}px, ${y}px) scale(${sx}, ${sy}) perspective(1600px) translateZ(${z}px) rotateY(${ry}deg) rotateX(${rx}deg) translateZ(${zc}px)`;
    const atShelf = tf(dx, dy, sxs, s, -W / 2, 90, 0, 0);
    const pulled = tf(dx, dy - sr.height * .08, sxs * 1.14, s * 1.14, -W / 2, 84, 0, 0);
    const mid = tf(dx * .42, dy * .42 - 28, (1 + s) / 2 + .05, (1 + s) / 2 + .05, -W / 5, 38, rx0 / 2, -half / 2);
    const front = tf(0, 0, 1, 1, 0, ry0, rx0, -half);
    const frames = reverse
      ? [ // guardar: vuela hasta la balda y entra
          { transform: front, easing: "cubic-bezier(.45,0,.55,1)" },
          { transform: mid, offset: .45, easing: "cubic-bezier(.3,0,.3,1)" },
          { transform: pulled, offset: .8, easing: "cubic-bezier(.2,.7,.3,1)" },
          { transform: atShelf },
        ]
      : [ // sacar: sale de la balda, gira y vuela al centro
          { transform: atShelf, easing: "cubic-bezier(.3,0,.3,1)" },
          { transform: pulled, offset: .2, easing: "cubic-bezier(.45,0,.55,1)" },
          { transform: mid, offset: .58, easing: "cubic-bezier(.2,.6,.25,1)" },
          { transform: front },
        ];
    const duration = reverse ? 850 : 950;
    const anim = f.animate(frames, { duration, easing: "linear", fill: "forwards" });
    // Por si el navegador pausa la animación (pestaña en segundo plano): nunca nos quedamos esperando.
    return Promise.race([anim.finished, wait(duration + 400)]).catch(() => {}).then(() => f.remove());
  }

  let pushed = false;   // ¿hemos añadido una entrada al historial al abrir?
  let closing = false;

  // Al cambiar de libro con la ficha abierta, el anterior vuelve a su hueco en la balda.
  function releaseSpines() {
    $$(".spine.is-out").forEach((sp) => sp.classList.remove("is-out"));
  }

  // En el móvil la ficha ya está debajo de la portada. `peekY` la deja bajo el pliegue;
  // al soltar, el mismo desplazamiento pasa a ser scroll nativo (sin cambiar de maqueta).
  let phase = "peek";
  let peekY = 0;
  let yAnim = null;
  let gestureGen = 0;
  let swallowClick = false;
  function currentY() {
    if (detail.getAnimations().length) {
      const c = getComputedStyle(detail).transform;
      if (!c || c === "none") return 0;
      const m = /matrix(?:3d)?\(([^)]+)\)/.exec(c);
      if (!m) return 0;
      const p = m[1].split(",").map((n) => parseFloat(n));
      return p.length === 16 ? p[13] : p[5];
    }
    const inline = /translateY\(([-\d.]+)px\)/.exec(detail.style.transform || "");
    if (inline) return +inline[1];
    const both = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(detail.style.transform || "");
    return both ? +both[2] : 0;
  }
  function applyY(y) {
    detail.style.transform = Math.abs(y) < 0.5 ? "" : `translateY(${y}px)`;
  }
  function freezeY() {
    const y = currentY();
    yAnim = null;
    detail.getAnimations().forEach((a) => a.cancel());
    applyY(y);
    return y;
  }
  function resist(over) {
    const a = Math.abs(over);
    return Math.sign(over) * (a * 180) / (a + 180);
  }
  function maxScroll() {
    return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  }
  function measurePeek() {
    const view = scroller.clientHeight;
    if (!view) return 0;
    const infoTop = $("#info").offsetTop;
    const btn = $("#openCard");
    const btnBottom = btn.offsetTop + btn.offsetHeight;
    const want = Math.max(0, view - 28 - infoTop);
    const maxShift = Math.max(0, view - 12 - btnBottom);
    return Math.min(want, maxShift);
  }
  function parkPeek() {
    phase = "peek";
    stage.classList.remove("open");
    peekY = measurePeek();
    scroller.scrollTop = 0;
    scroller.style.overflowY = "hidden";
    scroller.style.touchAction = "none";
    backdrop.style.background = "";
    backdrop.style.opacity = "";
    applyY(peekY);
    $(".stage__body").setAttribute("aria-labelledby", "p-title");
  }
  function commitScroll(scroll) {
    phase = "ficha";
    stage.classList.add("open");
    scroller.style.overflowY = "";
    scroller.style.touchAction = "";
    backdrop.style.background = "";
    backdrop.style.opacity = "";
    scroller.scrollTop = Math.max(0, scroll);
    applyY(0);
    $(".stage__body").setAttribute("aria-labelledby", "p-title");
    if (current) setHash(current.id, "replace");
    focusIfKeyboard($("#p-title"));
  }
  function animateY(to) {
    const from = freezeY();
    if (reduceMotion || Math.abs(to - from) < 0.5) {
      applyY(to);
      return Promise.resolve();
    }
    const anim = detail.animate(
      [{ transform: `translateY(${from}px)` }, { transform: Math.abs(to) < 0.5 ? "none" : `translateY(${to}px)` }],
      { duration: Math.min(420, Math.max(180, Math.abs(to - from) * 0.7)), easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
    );
    yAnim = anim;
    return Promise.race([anim.finished.catch(() => {}), wait(520)]).then(() => {
      if (yAnim !== anim) return;
      yAnim = null;
      applyY(to);
      anim.cancel();
    });
  }
  function paintSheet(y) {
    const t = peekY > 0 ? 1 - Math.min(1, Math.max(0, y / peekY)) : (y <= 0 ? 1 : 0);
    const pct = Math.round((82 + 18 * t) * 10) / 10;
    backdrop.style.background = `color-mix(in srgb, var(--paper) ${pct}%, transparent)`;
  }
  function revealFicha() {
    if (phase === "ficha" && currentY() >= -1 && scroller.scrollTop <= 1) return Promise.resolve();
    const gen = gestureGen;
    stage.classList.add("open");
    backdrop.style.background = "";
    backdrop.style.opacity = "";
    return animateY(0).then(() => { if (gen === gestureGen) commitScroll(0); });
  }

  async function openBook(id, el, { card = false, push = true } = {}) {
    const b = byId[id]; if (!b) return;
    const wasOpen = !stage.hidden;
    current = b;
    if (!wasOpen) source = el || null;
    fillStage(b);
    stage.classList.toggle("flying", !wasOpen && !!el?.classList.contains("spine"));
    stage.hidden = false;
    const phone = phoneStage.matches;
    stage.classList.toggle("open", card && !phone);
    document.body.classList.add("locked");
    frame().then(() => stage.classList.add("show"));
    if (push) setHash(b.id, wasOpen ? "replace" : "push");
    if (phone) $(".stage__body").setAttribute("aria-labelledby", "p-title");

    if (phone) {
      await frame();
      if (card) commitScroll(0);
      else parkPeek();
    }

    if (!wasOpen && el) {
      const isSpine = el.classList.contains("spine");
      inner.style.visibility = "hidden";
      await preloadSoon(b);
      await frame();
      if (isSpine) {
        el.classList.add("is-out");
        await flyBook(el, b);
        stage.classList.remove("flying");
      } else {
        await flyFlat(rectOf($(".cover", el) || el), rectOf(inner), b);
      }
      inner.style.visibility = "";
    }
    focusIfKeyboard(phone ? (card ? $("#p-title") : $("#book3d")) : (card ? $("#d-title") : $("#book3d")));
  }

  async function openCard() {
    if (!current) return;
    if (phoneStage.matches) return revealFicha();
    const before = rectOf(inner);
    stage.classList.add("open");
    setHash(current.id, "replace");
    const after = rectOf(inner);
    if (!reduceMotion) {
      inner.animate([
        { transform: `translate(${before.x - after.x}px, ${before.y - after.y}px) scale(${before.w / after.w})`, transformOrigin: "0 0" },
        { transform: "translate(0,0) scale(1)", transformOrigin: "0 0" },
      ], { duration: 560, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    focusIfKeyboard($("#d-title"));
  }

  function finishClose(target, push) {
    $$(".spine.is-out").forEach((s) => s.classList.remove("is-out"));
    stage.hidden = true; stage.classList.remove("open", "dragging", "flying");
    inner.style.visibility = "";
    yAnim = null;
    detail.getAnimations().forEach((a) => a.cancel());
    detail.style.transform = ""; detail.style.opacity = "";
    backdrop.style.opacity = ""; backdrop.style.background = "";
    scroller.style.overflowY = ""; scroller.style.touchAction = ""; scroller.scrollTop = 0;
    phase = "peek"; peekY = 0;
    document.body.classList.remove("locked");
    if (keyboardNav) focusIfKeyboard(target);
    else if (document.activeElement && document.activeElement !== document.body && !document.activeElement.matches("input")) document.activeElement.blur();
    current = null; source = null; closing = false;
    document.title = baseTitle;
    if (push) {
      if (pushed) { pushed = false; history.back(); }
      else if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    }
  }

  async function closeStage({ push = true } = {}) {
    if (stage.hidden || closing) return;
    closing = true;
    const b = current;
    const target = (source && source.isConnected ? source : null) || (b && $(`.spine[data-id="${b.id}"], .tile[data-id="${b.id}"]`));
    const canFly = b && target && inView(target) && inView($("#book3d")) && !reduceMotion;
    detail.style.opacity = "";
    stage.classList.remove("show");
    if (canFly) {
      const isSpine = target.classList.contains("spine");
      const to = rectOf(inner);
      inner.style.visibility = "hidden";
      if (isSpine) {
        target.classList.add("is-out");
        await flyBook(target, b, { reverse: true });
      } else {
        await flyFlat(rectOf($(".cover", target) || target), to, b, true);
      }
    } else {
      await wait(reduceMotion ? 0 : 300);
    }
    finishClose(target, push);
  }

  // Pasar de libro; `from` es el desplazamiento del dedo si viene de un gesto.
  async function step(dir, from = 0) {
    if (!current) return;
    const list = state.list.length ? state.list : BOOKS;
    const i = list.indexOf(current);
    const next = list[(i + dir + list.length) % list.length];
    gestureGen++;
    yAnim = null;
    if (!reduceMotion) {
      const out = dir > 0 ? -1 : 1;
      await detail.animate([
        { transform: `translateX(${from}px)`, opacity: detail.style.opacity || 1 },
        { transform: `translateX(${out * innerWidth * .5}px)`, opacity: 0 },
      ], { duration: 170, easing: "cubic-bezier(.4,0,1,1)" }).finished.catch(() => {});
    }
    detail.style.transform = ""; detail.style.opacity = "";
    releaseSpines();
    current = next; source = $(`.spine[data-id="${next.id}"], .tile[data-id="${next.id}"]`);
    fillStage(next);
    setHash(next.id, "replace");
    if (phoneStage.matches) {
      parkPeek();
      if (!reduceMotion) {
        const rest = peekY ? `translateY(${peekY}px)` : "none";
        detail.animate([
          { opacity: 0, transform: `translate(${(dir > 0 ? 1 : -1) * 60}px, ${peekY}px)` },
          { opacity: 1, transform: rest },
        ], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
        applyY(peekY);
      }
      return;
    }
    if (!reduceMotion) detail.animate([{ opacity: 0, transform: `translateX(${(dir > 0 ? 1 : -1) * 60}px)` }, { opacity: 1, transform: "none" }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  function setHash(id, mode = "replace") {
    const h = `#/libro/${id}`;
    if (location.hash === h) return;
    if (mode === "push") { history.pushState(null, "", h); pushed = true; }
    else history.replaceState(null, "", h);
  }
  function fromHash() {
    const m = location.hash.match(/^#\/libro\/(.+)$/);
    if (m && byId[decodeURIComponent(m[1])]) {
      const id = decodeURIComponent(m[1]);
      if (current?.id !== id) openBook(id, null, { card: true, push: false });
    } else if (!stage.hidden) { pushed = false; closeStage({ push: false }); }
  }

  // ——— Eventos ———
  // El lomo dibujado puede medir 26 px; el toque vale si cae a 22 px del centro (44 px de ancho).
  function hitBook(e) {
    const tile = e.target.closest(".tile");
    if (tile) return tile;
    const direct = e.target.closest(".spine");
    if (direct && direct.contains(e.target)) return direct;
    const slot = e.target.closest(".slot");
    if (!slot || slot.classList.contains("slot--divider")) return null;
    const x = e.clientX, y = e.clientY;
    let best = null, bestD = Infinity;
    for (const s of [slot.previousElementSibling, slot, slot.nextElementSibling]) {
      const sp = s && $(".spine", s);
      if (!sp) continue;
      const r = sp.getBoundingClientRect();
      if (y < r.top - 8 || y > r.bottom + 12) continue;
      const d = Math.abs(x - (r.left + r.width / 2));
      if (d <= 22 && d < bestD) { best = sp; bestD = d; }
    }
    return best;
  }
  lib.addEventListener("pointerover", (e) => { const el = e.target.closest(".spine, .tile"); if (el) preload(byId[el.dataset.id]); }, { passive: true });
  lib.addEventListener("pointerdown", (e) => { const el = hitBook(e); if (el) preload(byId[el.dataset.id]); }, { passive: true });
  lib.addEventListener("click", (e) => {
    const el = hitBook(e);
    if (el) openBook(el.dataset.id, el);
  });
  $("#book3d").addEventListener("click", () => { if (suppressClick) return; if (!stage.classList.contains("open")) openCard(); });

  // ——— Girar el libro en 3D manteniéndolo pulsado ———
  // Ratón: arrastrar. Táctil: mantener pulsado un instante y mover el dedo.
  // Al soltar, el libro vuelve a su sitio con un pequeño rebote.
  const book3d = $("#book3d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let tilt = null, suppressClick = false;
  function tiltTo(dx, dy) {
    const open = stage.classList.contains("open");
    const ry = (open ? -8 : -14) + clamp(dx * .4, -60, 60);
    const rx = (open ? 0 : 2) + clamp(-dy * .3, -30, 30);
    inner.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg) scale(1.04)`;
  }
  function startTilt() {
    if (!tilt) return;
    tilt.active = true;
    book3d.classList.add("tilting");
    inner.classList.remove("springing");
    inner.style.transform = inner.style.transform || getComputedStyle(inner).transform;
    navigator.vibrate?.(8);
  }
  function endTilt() {
    if (!tilt) return;
    clearTimeout(tilt.timer);
    if (tilt.active) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 60);
      book3d.classList.remove("tilting");
      inner.classList.add("springing");
      inner.style.transform = "";
      setTimeout(() => inner.classList.remove("springing"), 820);
    }
    tilt = null;
  }
  book3d.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    tilt = { x0: e.clientX, y0: e.clientY, active: false };
  });
  addEventListener("pointermove", (e) => {
    if (!tilt || e.pointerType !== "mouse") return;
    const dx = e.clientX - tilt.x0, dy = e.clientY - tilt.y0;
    if (!tilt.active && Math.hypot(dx, dy) > 5) startTilt();
    if (tilt.active) tiltTo(dx, dy);
  });
  addEventListener("pointerup", (e) => { if (e.pointerType === "mouse") endTilt(); });
  book3d.addEventListener("dragstart", (e) => e.preventDefault());
  $("#openCard").addEventListener("click", openCard);
  $("#prev").addEventListener("click", () => step(-1));
  $("#next").addEventListener("click", () => step(1));
  stage.addEventListener("click", (e) => {
    if (swallowClick) return;
    if (e.target.closest("[data-close]")) return closeStage();
    if (e.target === scroller || e.target === detail) return closeStage();
    const rf = e.target.closest("[data-read]");
    if (rf) { toggleRead(rf.dataset.read, rf.dataset.book); return; }
    const st = e.target.closest("[data-step]");
    if (st) { scroller.scrollTo({ top: 0 }); return step(+st.dataset.step); }
    const go = e.target.closest("[data-goto]");
    if (go) { releaseSpines(); gestureGen++; yAnim = null; current = byId[go.dataset.goto]; source = null; fillStage(current); setHash(current.id, "replace");
      if (phoneStage.matches) parkPeek();
      if (!reduceMotion) detail.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 }); return; }
    const s = e.target.closest("[data-search]");
    if (s) { const q = s.dataset.search; closeStage().then(() => setQuery(q)); return; }
    if (e.target.closest("[data-share]")) {
      const url = location.href;
      (canShare
        ? navigator.share({ title: current.title, url }).catch(() => {})
        : navigator.clipboard.writeText(url).then(() => toast("Enlace copiado"))).catch?.(() => {});
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!stage.hidden) {
      if (e.key === "Escape") { e.preventDefault(); closeStage(); }
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (!stage.classList.contains("open") && e.key === "Enter" && document.activeElement === $("#book3d")) { e.preventDefault(); openCard(); }
      return;
    }
    if (e.key === "/" && document.activeElement !== qInput) { e.preventDefault(); qInput.focus(); qInput.select(); }
    else if (e.key === "Escape" && document.activeElement === qInput && qInput.value) { setQuery(""); }
  });
  window.addEventListener("popstate", fromHash);
  window.addEventListener("hashchange", fromHash);

  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 1800); }

  // ——— Gestos táctiles ———
  //  · en el móvil, subir desde la vista arrastra la misma columna 1:1; al soltar encaja
  //    y, a partir de ahí, el dedo solo hace scroll (nunca las dos cosas a la vez)
  //  · bajar con la ficha arriba del todo vuelve a la vista, o cierra si el gesto sigue
  //  · deslizar desde el borde izquierdo hacia la derecha: volver (cerrar)
  //  · deslizar a izquierda/derecha: libro siguiente/anterior
  let g = null;
  function restTransform() {
    return phoneStage.matches && phase === "peek" && peekY ? `translateY(${peekY}px)` : "none";
  }
  function settle() {
    stage.classList.remove("dragging");
    const to = restTransform();
    detail.animate([
      { transform: detail.style.transform || "none", opacity: detail.style.opacity || 1 },
      { transform: to, opacity: 1 },
    ], { duration: reduceMotion ? 1 : 320, easing: "cubic-bezier(.2,.8,.2,1)" });
    detail.style.transform = to === "none" ? "" : to;
    detail.style.opacity = "";
    backdrop.style.opacity = "";
    if (!phoneStage.matches) return;
    if (phase === "ficha") {
      scroller.style.overflowY = "";
      scroller.style.touchAction = "";
      backdrop.style.background = "";
    } else {
      scroller.style.overflowY = "hidden";
      scroller.style.touchAction = "none";
      scroller.scrollTop = 0;
    }
  }
  function releaseSheet(snap, dt, gen) {
    const y = snap.sheetY ?? currentY();
    const vy = snap.dy / dt;
    const alive = () => gen === gestureGen;
    // Un poco por encima del reposo de la ficha todavía encaja ahí; más adentro se queda donde el dedo lo dejó.
    if (y < -96) {
      if (alive()) commitScroll(-y);
      return;
    }
    const towardFicha = vy < -0.4 || y <= 0 || (vy < 0.25 && y < peekY * 0.5);
    if (towardFicha) {
      phase = "ficha";
      stage.classList.add("open");
      backdrop.style.background = "";
      backdrop.style.opacity = "";
      animateY(0).then(() => { if (alive()) commitScroll(0); });
      return;
    }
    if (y > peekY + 72 || (vy > 0.55 && y > peekY + 28)) {
      if (alive()) closeStage();
      return;
    }
    backdrop.style.background = "";
    backdrop.style.opacity = "";
    animateY(peekY).then(() => {
      if (!alive()) return;
      phase = "peek";
      stage.classList.remove("open");
      scroller.scrollTop = 0;
      scroller.style.overflowY = "hidden";
      scroller.style.touchAction = "none";
      applyY(peekY);
    });
  }
  stage.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || closing) { g = null; return; }
    gestureGen++;
    freezeY();
    const t = e.touches[0];
    g = { x0: t.clientX, y0: t.clientY, t0: performance.now(), mode: null, dx: 0, dy: 0, inRow: !!e.target.closest(".mini-row"), atTop: scroller.scrollTop <= 1 };
    if (e.target.closest("#book3d")) {
      tilt = { x0: t.clientX, y0: t.clientY, active: false };
      tilt.timer = setTimeout(() => { if (g && !g.mode) startTilt(); }, 260);
    }
  }, { passive: true });
  stage.addEventListener("touchmove", (e) => {
    if (!g) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (tilt?.active) { e.preventDefault(); tiltTo(dx, dy); return; }
    if (tilt && Math.hypot(dx, dy) > 10) { clearTimeout(tilt.timer); tilt = null; }
    if (!g.mode) {
      if (Math.hypot(dx, dy) < 10) return;
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      const phone = phoneStage.matches;
      // Con la columna en transform (vista, o snap aún no entregado al scroll) el dedo solo arrastra.
      const tracking = phone && scroller.style.overflowY === "hidden";
      if (g.x0 < 30 && dx > 0 && horizontal) g.mode = "edge";
      else if (tracking && !horizontal) g.mode = "sheet";
      else if (phone && phase === "ficha" && g.atTop && dy > 0 && !horizontal) g.mode = "sheet";
      else if (!phone && !stage.classList.contains("open") && dy < 0 && !horizontal) g.mode = "up";
      else if (!phone && dy > 0 && !horizontal && g.atTop) g.mode = "down";
      else if (horizontal && !g.inRow) g.mode = "side";
      else g.mode = "native";
      if (g.mode === "sheet") {
        g.originY = currentY();
        if (phase === "ficha") {
          peekY = measurePeek() || peekY;
          scroller.style.overflowY = "hidden";
          scroller.style.touchAction = "none";
        }
      }
      if (g.mode === "down" || g.mode === "side" || g.mode === "edge") g.baseY = phone && phase === "peek" ? peekY : 0;
      if (g.mode === "native" && phone && phase === "peek" && peekY < 8 && dy < 0 && !horizontal) commitScroll(0);
      if (g.mode !== "native") stage.classList.add("dragging");
    }
    if (g.mode === "native") return;
    e.preventDefault();
    g.dx = dx; g.dy = dy;
    const base = g.baseY || 0;
    if (g.mode === "sheet") {
      const raw = g.originY + dy;
      const minY = -maxScroll();
      let y = raw;
      if (raw > peekY) y = peekY + resist(raw - peekY);
      else if (raw < minY) y = minY + resist(raw - minY);
      g.sheetY = y;
      applyY(y);
      paintSheet(y);
      backdrop.style.opacity = y > peekY ? String(1 - Math.min((y - peekY) / 450, .75)) : "";
    } else if (g.mode === "up") {
      const y = Math.min(0, dy);
      const eased = -Math.pow(-y, .8);
      detail.style.transform = `translateY(${eased}px)`;
      inner.style.transform = `rotateY(${-14 + Math.min(10, -y / 12)}deg) scale(${1 + Math.min(.06, -y / 2500)})`;
    } else if (g.mode === "down") {
      const y = Math.max(0, dy);
      detail.style.transform = `translateY(${base + y}px) scale(${1 - Math.min(y, 600) / 2000})`;
      backdrop.style.opacity = String(1 - Math.min(y / 450, .75));
    } else if (g.mode === "edge") {
      const x = Math.max(0, dx);
      detail.style.transform = `translate(${x}px, ${base}px)`;
      backdrop.style.opacity = String(1 - Math.min(x / innerWidth, .75));
    } else {
      detail.style.transform = `translate(${dx}px, ${base}px) rotate(${dx / 60}deg)`;
      detail.style.opacity = String(1 - Math.min(Math.abs(dx) / innerWidth, .6));
    }
  }, { passive: false });
  stage.addEventListener("touchend", () => {
    if (tilt) { const was = tilt.active; endTilt(); if (was) { g = null; return; } }
    if (!g || !g.mode || g.mode === "native") { g = null; return; }
    const snap = g; g = null;
    const dt = Math.max(1, performance.now() - snap.t0);
    stage.classList.remove("dragging");
    if (Math.hypot(snap.dx, snap.dy) > 10) {
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 500);
    }
    if (snap.mode === "sheet") return releaseSheet(snap, dt, gestureGen);
    if (snap.mode === "up") {
      inner.style.transform = "";
      if (snap.dy < -70 || (snap.dy / dt < -.45 && snap.dy < -25)) { detail.style.transform = ""; return openCard(); }
    }
    if (snap.mode === "down" && (snap.dy > 110 || (snap.dy / dt > .5 && snap.dy > 30))) return closeStage();
    if (snap.mode === "edge" && (snap.dx > 90 || (snap.dx / dt > .5 && snap.dx > 30))) return closeStage();
    if (snap.mode === "side" && (Math.abs(snap.dx) > 80 || (Math.abs(snap.dx) / dt > .45 && Math.abs(snap.dx) > 30))) return step(snap.dx < 0 ? 1 : -1, snap.dx);
    settle();
  });
  stage.addEventListener("touchcancel", () => { endTilt(); inner.style.transform = ""; if (g?.mode && g.mode !== "native") settle(); g = null; });
  addEventListener("resize", () => {
    if (stage.hidden || !phoneStage.matches || phase !== "peek" || g) return;
    const y = measurePeek();
    if (Math.abs(y - peekY) < 1) return;
    peekY = y;
    applyY(peekY);
  });

  // ——— Diálogo de acceso ———
  const accessDlg = $("#access");
  const closeAccess = () => { if (accessDlg.close) accessDlg.close(); else accessDlg.removeAttribute("open"); };
  accessDlg.addEventListener("click", async (e) => {
    if (e.target === accessDlg || e.target.closest("[data-close-access]")) return closeAccess();
    if (e.target.closest("#tokenSave")) {
      const btn = e.target.closest("#tokenSave");
      btn.disabled = true; btn.textContent = "Comprobando…";
      const ok = await connect($("#tokenInput").value);
      btn.disabled = false; btn.textContent = "Conectar";
      if (!ok) { $("#accessErr").textContent = "Ese token no puede escribir en aschoch/biblioteca-lecturas. Revisa el repositorio y el permiso «Contents: Read and write»."; return; }
      closeAccess();
      toast("Listo: este dispositivo ya puede marcar lecturas");
      afterConnect?.(); afterConnect = null;
      flushReads();
    }
    if (e.target.closest("#shareAccess")) {
      const url = `${location.origin}${location.pathname}#acceso=${encodeURIComponent(token)}`;
      const text = "Enlace para marcar lecturas en nuestra biblioteca (no lo compartas con nadie más)";
      if (navigator.share && matchMedia("(hover: none)").matches) navigator.share({ title: "Biblioteca", text, url }).catch(() => {});
      else navigator.clipboard.writeText(url).then(() => toast("Enlace de acceso copiado")).catch(() => {});
    }
    if (e.target.closest("#disconnect")) {
      token = ""; store.set("bib.token", "");
      closeAccess(); toast("Este dispositivo ya no puede marcar lecturas");
    }
  });
  $("#editReads").addEventListener("click", () => openAccess());

  // Enlace de acceso enviado por WhatsApp: …#acceso=TOKEN
  (async () => {
    const m = location.hash.match(/^#acceso=(.+)$/);
    if (!m) return;
    history.replaceState(null, "", location.pathname + location.search);
    const ok = await connect(decodeURIComponent(m[1]));
    toast(ok ? "Listo: este dispositivo ya puede marcar lecturas" : "El enlace de acceso no es válido");
  })();

  // ——— Arranque ———
  $("#rstats").innerHTML = readStatsHTML();
  syncSeg(); renderChips(); render(); fromHash();
  loadReads();
  // Al volver a la pestaña (p. ej. tras marcar algo en el otro móvil), traer lo último.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !pending.length && !saving) loadReads(); });
})();
