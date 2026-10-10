(() => {
  "use strict";

  const BOOKS = window.BOOKS || [];
  const THEMES = [
    ["Liderazgo y empresa", "#2f5d7c"], ["Familia y crianza", "#c0703a"], ["Historia y actualidad", "#9a6a2f"],
    ["Narrativa", "#8c2f2b"], ["Teatro", "#a3423a"], ["Clásicos grecolatinos", "#b08a3e"],
    ["Filosofía", "#3e4f86"], ["Educación", "#3d7a5a"], ["Poesía", "#7a4b86"],
    ["Obras de consulta", "#6b6257"], ["Magisterio de la Iglesia", "#b8892f"],
    ["Fe y espiritualidad", "#2f7480"], ["Schoenstatt", "#2f7a6a"],
  ];
  const THEME_COLOR = Object.fromEntries(THEMES);
  const THEME_ORDER = Object.fromEntries(THEMES.map(([t], i) => [t, i]));

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
    b.w = Math.round(Math.min(58, Math.max(22, 14 + (b.pages || 220) / 14)));
    b.h = b.theme === "Obras de consulta" ? 214 : 164 + (h % 46);
    b.band = h % 4;
    b.surname = b.sortKey === "~" ? "" : b.sortKey;
    b.al = Math.min(84, Math.ceil(b.surname.length * 6.6));
    b._hay = norm([b.title, b.author, b.theme, b.originalTitle, (b.tags || []).join(" "), b.note, b.summary, b.language].join(" · "));
    b._ti = norm(b.title); b._au = norm(b.author);
  });
  const byId = Object.fromEntries(BOOKS.map((b) => [b.id, b]));

  // ——— Estado ———
  const state = {
    q: "",
    sort: store.get("bib.sort", "theme"),
    view: store.get("bib.view", "shelf"),
    theme: null,
    list: [],
  };

  // ——— Cabecera ———
  const authors = new Set(BOOKS.map((b) => b.author));
  $("#stats").innerHTML = `<b>${BOOKS.length}</b> libros · <b>${authors.size}</b> autores · <b>${new Set(BOOKS.map((b) => b.theme)).size}</b> temas`;

  // ——— Portadas ———
  function coverHTML(b, eager = false) {
    const st = `--c:${b.color};--t:${b.text};--ratio:${b.ratio}`;
    if (b.cover) {
      return `<div class="cover" style="${st}"><img src="${esc(b.cover)}" alt="Portada de ${esc(b.title)}" ${eager ? "" : 'loading="lazy"'} decoding="async"></div>`;
    }
    return `<div class="cover cover--gen" style="${st}">
      <div><div class="cover__t">${esc(b.title)}</div><div class="cover__orn"></div></div>
      <div class="cover__a">${esc(b.author)}</div></div>`;
  }

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
    return BOOKS.filter((b) => (!state.theme || b.theme === state.theme) && terms.every((t) => b._hay.includes(t)));
  }

  // ——— Pintado ———
  const lib = $("#library");
  function spineHTML(b, extra = "") {
    const wide = b.w >= 42 ? " spine--wide" : "";
    return `<div class="slot"><button class="spine${wide}${extra}" data-id="${b.id}" data-band="${b.band}"
      style="--c:${b.color};--t:${b.text};--w:${b.w}px;--h:${b.h}px;--al:${b.al}px"
      aria-label="${esc(b.title)}, de ${esc(b.author)}" title="${esc(b.title)} — ${esc(b.author)}">
      <span class="spine__title">${esc(b.title)}</span>
      <span class="spine__author">${esc(b.surname)}</span></button></div>`;
  }
  function tileHTML(b) {
    return `<button class="tile" data-id="${b.id}" aria-label="${esc(b.title)}, de ${esc(b.author)}">
      <div class="tile__cover">${coverHTML(b)}</div>
      <p class="tile__t">${esc(b.title)}</p><p class="tile__a">${esc(b.author)}</p></button>`;
  }

  function render() {
    const list = filtered();
    const groups = groupsFor(list);
    state.list = groups.flatMap((g) => g.items);
    if (!list.length) {
      lib.innerHTML = `<div class="empty"><h3>Ningún libro coincide</h3><p>Prueba con otra palabra, un apellido o un tema.</p></div>`;
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
  }

  // ——— Chips de temas ———
  function renderChips() {
    const counts = {};
    BOOKS.forEach((b) => (counts[b.theme] = (counts[b.theme] || 0) + 1));
    $("#chips").innerHTML =
      `<button class="chip" data-theme="" aria-pressed="${!state.theme}">Todos <small>${BOOKS.length}</small></button>` +
      THEMES.filter(([t]) => counts[t]).map(([t, c]) =>
        `<button class="chip" data-theme="${esc(t)}" style="--c:${c}" aria-pressed="${state.theme === t}"><i></i>${esc(t)} <small>${counts[t]}</small></button>`).join("");
  }
  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    state.theme = c.dataset.theme || null;
    renderChips(); render();
  });

  // ——— Controles ———
  function syncSeg() {
    $$("#sort button").forEach((b) => b.setAttribute("aria-checked", b.dataset.sort === state.sort));
    $$("#view button").forEach((b) => b.setAttribute("aria-checked", b.dataset.view === state.view));
  }
  $("#sort").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.sort = b.dataset.sort; store.set("bib.sort", state.sort); syncSeg(); render();
  });
  $("#view").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.view = b.dataset.view; store.set("bib.view", state.view); syncSeg(); render();
  });
  let qt;
  const qInput = $("#q");
  qInput.addEventListener("input", () => {
    clearTimeout(qt);
    qt = setTimeout(() => { state.q = qInput.value.trim(); render(); }, 90);
  });
  function setQuery(q) {
    qInput.value = q; state.q = q; state.theme = null; renderChips(); render();
    window.scrollTo({ top: Math.max(0, $("#toolbar").offsetTop - 2), behavior: reduceMotion ? "auto" : "smooth" });
  }

  new IntersectionObserver(([e]) => $("#toolbar").classList.toggle("stuck", !e.isIntersecting), { rootMargin: "-1px 0px 0px 0px" })
    .observe($(".masthead"));

  // ——— Escenario ———
  const stage = $("#stage");
  const inner = $("#bookInner");
  let current = null;   // libro abierto
  let source = null;    // elemento de la estantería desde el que salió

  function fillStage(b) {
    inner.innerHTML = coverHTML(b, true) + (b.cover ? '<span class="book3d__pages"></span>' : "");
    inner.style.setProperty("--ratio", b.ratio);
    $("#p-title").textContent = b.title;
    $("#p-author").textContent = b.author;
    $("#info").innerHTML = infoHTML(b);
    $("#stageScroll").scrollTop = 0;
  }

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
    const mini = (x) => `<button class="mini" data-goto="${x.id}">${coverHTML(x)}<span>${esc(x.title)}</span></button>`;
    return `
      <span class="theme-pill" style="--c:${THEME_COLOR[b.theme] || "#888"}"><i></i>${esc(b.theme)}</span>
      <h2 class="info__title" id="d-title">${esc(b.title)}</h2>
      <p class="info__author">de <button data-search="${esc(b.author)}">${esc(b.author)}</button></p>
      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${typeof v === "string" && v.startsWith("<i>") ? v : esc(v)}</dd></div>`).join("")}</dl>` : '<div style="height:26px"></div>'}
      ${b.summary ? `<p class="summary">${esc(b.summary)}</p>` : ""}
      ${b.note ? `<p class="note">${esc(b.note)}</p>` : ""}
      ${b.authorBio ? `<h3>Sobre el autor</h3><p class="bio">${esc(b.authorBio)}</p>` : ""}
      ${b.tags?.length ? `<h3>Temas</h3><div class="tags">${b.tags.map((t) => `<button class="tag" data-search="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
      ${sameAuthor.length ? `<h3>Más de ${esc(b.author)}</h3><div class="mini-row">${sameAuthor.map(mini).join("")}</div>` : ""}
      ${shelf.length ? `<h3>En la misma balda</h3><div class="mini-row">${shelf.map(mini).join("")}</div>` : ""}
      <div class="share">
        <button class="btn btn--ghost" data-share>Copiar enlace</button>
      </div>`;
  }

  function rectOf(el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }

  // Vuelo entre dos rectángulos con la portada; giro 3D para simular que sale de canto.
  function fly(from, to, b, { fromSpine = false, reverse = false } = {}) {
    if (reduceMotion) return Promise.resolve();
    const f = document.createElement("div");
    f.className = "flyer";
    f.innerHTML = coverHTML(b, true);
    Object.assign(f.style, { left: to.x + "px", top: to.y + "px", width: to.w + "px", height: to.h + "px" });
    $(".cover", f).style.cssText += ";width:100%;height:100%;border-radius:3px 8px 8px 3px;box-shadow:var(--shadow-lg);font-size:22px";
    document.body.appendChild(f);
    const sx = from.w / to.w, sy = from.h / to.h;
    const start = fromSpine
      ? `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${Math.max(sx, .12)}, ${sy}) perspective(900px) rotateY(-82deg)`
      : `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${sx}, ${sy})`;
    const mid = fromSpine ? `translate(${(from.x - to.x) * .35}px, ${(from.y - to.y) * .35 - 40}px) scale(${.5 + sx * .5}, ${.6 + sy * .4}) perspective(900px) rotateY(-40deg)` : null;
    const end = "translate(0,0) scale(1,1) perspective(900px) rotateY(-14deg) rotateX(2deg)";
    const frames = mid ? [{ transform: start, opacity: .4 }, { transform: mid, opacity: 1, offset: .45 }, { transform: end, opacity: 1 }]
      : [{ transform: start }, { transform: end }];
    const anim = f.animate(reverse ? frames.reverse() : frames, { duration: fromSpine ? 720 : 480, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    return anim.finished.then(() => f.remove());
  }

  async function openBook(id, el, { card = false, push = true } = {}) {
    const b = byId[id]; if (!b) return;
    const wasOpen = !stage.hidden;
    current = b;
    if (!wasOpen) source = el || null;
    fillStage(b);
    stage.hidden = false;
    stage.classList.toggle("open", card);
    document.body.classList.add("locked");
    requestAnimationFrame(() => stage.classList.add("show"));
    if (card && push) setHash(b.id);

    if (!wasOpen && el) {
      const isSpine = el.classList.contains("spine");
      const fromRect = rectOf(isSpine ? el : ($(".cover", el) || el));
      if (isSpine) el.classList.add("is-out");
      inner.style.visibility = "hidden";
      await new Promise((r) => requestAnimationFrame(r));
      await fly(fromRect, rectOf(inner), b, { fromSpine: isSpine });
      inner.style.visibility = "";
    }
    (card ? $("#d-title") : $("#book3d")).focus({ preventScroll: true });
  }

  async function openCard() {
    if (!current) return;
    const before = rectOf(inner);
    stage.classList.add("open");
    setHash(current.id);
    const after = rectOf(inner);
    if (!reduceMotion) {
      inner.animate([
        { transform: `translate(${before.x - after.x}px, ${before.y - after.y}px) scale(${before.w / after.w})`, transformOrigin: "0 0" },
        { transform: "translate(0,0) scale(1)", transformOrigin: "0 0" },
      ], { duration: 560, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    $("#d-title").focus({ preventScroll: true });
  }

  async function closeStage({ push = true } = {}) {
    if (stage.hidden) return;
    const b = current;
    const spine = source && source.isConnected ? source : (b && $(`.spine[data-id="${b.id}"], .tile[data-id="${b.id}"]`));
    const visible = spine && (() => { const r = spine.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })();
    stage.classList.remove("show");
    if (b && visible && !reduceMotion) {
      const to = rectOf(inner);
      inner.style.visibility = "hidden";
      const isSpine = spine.classList.contains("spine");
      await fly(rectOf(isSpine ? spine : ($(".cover", spine) || spine)), to, b, { fromSpine: isSpine, reverse: true });
    } else {
      await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 280));
    }
    $$(".spine.is-out").forEach((s) => s.classList.remove("is-out"));
    stage.hidden = true; stage.classList.remove("open");
    inner.style.visibility = "";
    document.body.classList.remove("locked");
    if (push && location.hash) history.pushState(null, "", location.pathname + location.search);
    if (spine) spine.focus({ preventScroll: true });
    current = null; source = null;
  }

  function step(dir) {
    if (!current) return;
    const list = state.list.length ? state.list : BOOKS;
    const i = list.indexOf(current);
    const next = list[(i + dir + list.length) % list.length];
    current = next; source = $(`.spine[data-id="${next.id}"], .tile[data-id="${next.id}"]`);
    fillStage(next);
    setHash(next.id, true);
    if (!reduceMotion) $(".detail").animate([{ opacity: 0, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  function setHash(id, replace = false) {
    const h = `#/libro/${id}`;
    if (location.hash === h) return;
    replace || location.hash ? history.replaceState(null, "", h) : history.pushState(null, "", h);
  }
  function fromHash() {
    const m = location.hash.match(/^#\/libro\/(.+)$/);
    if (m && byId[decodeURIComponent(m[1])]) {
      const id = decodeURIComponent(m[1]);
      if (current?.id !== id) openBook(id, null, { card: true, push: false });
    } else if (!stage.hidden) closeStage({ push: false });
  }

  // ——— Eventos ———
  lib.addEventListener("click", (e) => {
    const el = e.target.closest(".spine, .tile");
    if (el) openBook(el.dataset.id, el);
  });
  $("#book3d").addEventListener("click", () => { if (!stage.classList.contains("open")) openCard(); });
  $("#openCard").addEventListener("click", openCard);
  $("#prev").addEventListener("click", () => step(-1));
  $("#next").addEventListener("click", () => step(1));
  stage.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeStage();
    if (e.target === $("#stageScroll") || e.target.classList.contains("detail")) return closeStage();
    const go = e.target.closest("[data-goto]");
    if (go) { current = byId[go.dataset.goto]; source = null; fillStage(current); setHash(current.id, true);
      if (!reduceMotion) $(".detail").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 }); return; }
    const s = e.target.closest("[data-search]");
    if (s) { const q = s.dataset.search; closeStage().then(() => setQuery(q)); return; }
    if (e.target.closest("[data-share]")) {
      const url = location.href;
      (navigator.share && matchMedia("(hover: none)").matches
        ? navigator.share({ title: current.title, url }).catch(() => {})
        : navigator.clipboard.writeText(url).then(() => toast("Enlace copiado"))).catch?.(() => {});
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!stage.hidden) {
      if (e.key === "Escape") { e.preventDefault(); closeStage(); }
      else if (stage.classList.contains("open") && e.key === "ArrowRight") step(1);
      else if (stage.classList.contains("open") && e.key === "ArrowLeft") step(-1);
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

  // Deslizar en móvil para pasar de libro
  let tx = null;
  stage.addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (tx == null || !stage.classList.contains("open")) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 80) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ——— Arranque ———
  syncSeg(); renderChips(); render(); fromHash();
})();
