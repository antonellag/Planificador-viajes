/* Planificador Córdoba 2026 — lógica de la app (sin frameworks). */
(function () {
  "use strict";

  const C = window.TRIP;
  const ENRICH = window.ENRICH || {};
  const MOODS = window.MOODS || {};
  const PEOPLE = C.PEOPLE;
  const PCOLOR = { Javi: "--p-javi", Bel: "--p-bel", Facu: "--p-facu", Anto: "--p-anto" };

  let S = null;            // estado del servidor
  let lastSig = "";        // firma de datos para no re-renderizar de más
  let ME = lsGet("me");
  let view = "cronograma";
  let openId = null;       // lugar abierto en la hoja de detalle
  let sheetMode = null;    // "detail" | "who" | "add" | "invite"
  let map = null, mapState = null, addMap = null;
  let online = true;
  const ui = { zone: "Todas", q: "", filter: "todas", mood: "", showAll: false };
  const commonsCache = {};

  const $ = (s, el) => (el || document).querySelector(s);
  const viewEl = $("#view");

  // ---------- Utilidades ----------
  function lsGet(k) { try { return localStorage.getItem("cba26." + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem("cba26." + k, v); } catch (e) { /* sin storage */ } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function money(n) { return "$" + Math.round(n).toLocaleString("es-AR"); }
  function todayISO() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function av(p, cls, v) { return '<span class="av ' + (cls || "") + '" style="--p:var(' + PCOLOR[p] + ')"' + (v !== undefined ? ' data-v="' + v + '"' : "") + ' title="' + esc(p) + '">' + esc(p[0]) + "</span>"; }
  function dayLabel(iso, opts) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-AR", opts || { weekday: "short", day: "numeric", month: "short" });
  }
  function km(a, b) {
    const R = 6371, toR = x => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function toast(msg, ms) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  const ICON = {
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 1H7"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 13V4h3v9zM17 13l-4 8a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2l2-7a2 2 0 0 1 2-1h10"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/></svg>',
    img: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14l-4-4 4-4M5 10h10a4 4 0 0 1 0 8h-1"/></svg>'
  };

  // ---------- Datos derivados ----------
  function enrichFor(name) {
    if (!enrichFor._idx) {
      enrichFor._idx = {};
      Object.keys(ENRICH).forEach(k => { enrichFor._idx[norm(k)] = ENRICH[k]; });
    }
    return enrichFor._idx[norm(name)] || null;
  }

  function allPlaces() {
    if (!S) return [];
    if (allPlaces._v && allPlaces._sig === lastSig) return allPlaces._v;
    const out = [];
    (S.catalog || []).forEach(c => {
      const e = enrichFor(c.name);
      out.push(Object.assign({}, c, {
        lat: e ? e[0] : null, lng: e ? e[1] : null,
        moods: e ? e[2].split(",") : [],
        summary: e ? e[3] : "",
        q: e && e[4] ? e[4] : c.name + " Córdoba Argentina",
        custom: false
      }));
    });
    (S.lugares || []).forEach(l => {
      out.push({
        id: l.id, name: l.name, zone: l.zone || "Agregados por el grupo", sub: "", time: l.time, diff: l.diff, price: l.price,
        detail: l.detail, summary: l.summary, lat: l.lat ? Number(l.lat) : null, lng: l.lng ? Number(l.lng) : null,
        moods: [], q: l.name + " Córdoba Argentina", custom: true, autor: l.autor
      });
    });
    allPlaces._sig = lastSig;
    allPlaces._v = out;
    return out;
  }
  function placeById(id) { return allPlaces().find(p => p.id === id); }
  function zones() {
    const z = [];
    allPlaces().forEach(p => { if (z.indexOf(p.zone) < 0) z.push(p.zone); });
    return z;
  }
  function votesOf(id) { return (S.votes && S.votes[id]) || {}; }
  function yesCount(id) { const v = votesOf(id); return PEOPLE.filter(p => v[p] === 1).length; }
  function statusOf(id) {
    const e = S.estado && S.estado[id];
    if (e && e.estado === "descartado") return "descartado";
    if (e && e.estado === "confirmado") return "confirmado";
    if (yesCount(id) >= C.THRESHOLD) return "espera";
    return "votando";
  }
  const STATUS_LABEL = { votando: "Votando", espera: "En espera", confirmado: "Confirmado", descartado: "Descartado" };

  // ---------- API ----------
  let queue = Promise.resolve();
  let pending = 0;

  async function load() {
    if (!C.API_URL) { renderSetup(); return; }
    try {
      const r = await fetch(C.API_URL + "?action=state", { cache: "no-store" });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setState(data);
      online = true;
    } catch (e) {
      online = false;
      if (!S) viewEl.innerHTML = '<div class="notice"><h2>No pudimos cargar el viaje</h2><p class="muted">Revisá tu conexión y volvé a intentar.</p><div><button class="btn" data-act="reload" type="button">Reintentar</button></div></div>';
      else renderSync();
    }
  }

  function api(body) {
    body.persona = ME;
    pending++;
    queue = queue.then(async () => {
      try {
        const r = await fetch(C.API_URL, { method: "POST", body: JSON.stringify(body) });
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        pending--;
        online = true;
        if (pending === 0) setState(data, true);
      } catch (e) {
        pending--;
        online = false;
        toast("No se pudo guardar: " + (e.message || "sin conexión") + ". Probá de nuevo.", 4000);
        load();
      }
    });
    return queue;
  }

  function sigOf(d) {
    const copy = Object.assign({}, d);
    delete copy.ts;
    return JSON.stringify(copy);
  }

  function setState(data, force) {
    const sig = sigOf(data);
    if (!force && sig === lastSig) { renderSync(); return; }
    if (pending > 0 && !force) return; // hay cambios propios en camino
    S = data;
    lastSig = sig;
    render();
  }

  // ---------- Render general ----------
  function render() {
    renderMe();
    renderBadge();
    document.querySelectorAll(".tabs a").forEach(a => {
      if (a.dataset.tab === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!S) return;
    if (!ME) openWho();
    const keepScroll = window.scrollY;
    if (view === "explorar") renderExplorar();
    else if (view === "mapa") renderMapa();
    else if (view === "gastos") renderGastos();
    else if (view === "necesarios") renderNecesarios();
    else renderCronograma();
    window.scrollTo(0, keepScroll);
    if (sheetMode === "detail" && openId) {
      const active = document.activeElement;
      if (!(active && $("#sheet").contains(active) && active.tagName === "INPUT")) renderDetail(openId);
    }
    renderSync();
  }

  function renderSync() {
    const el = $("#sync");
    if (!el) return;
    el.className = "sync" + (online ? "" : " off");
    el.innerHTML = "<i></i>" + (online ? "Sincronizado con la planilla" : "Sin conexión, mostrando lo último");
  }

  function renderMe() {
    const b = $("#btn-me");
    b.innerHTML = ME ? av(ME, "sm") + "<span>" + esc(ME) + "</span>" : "¿Quién sos?";
  }

  function renderBadge() {
    const b = $("#badge-espera");
    if (!S) return;
    const n = allPlaces().filter(p => statusOf(p.id) === "espera").length;
    b.textContent = n;
    b.hidden = n === 0;
  }

  function renderCountdown() {
    const start = new Date("2026-12-25T00:00:00-03:00");
    const days = Math.ceil((start - new Date()) / 86400000);
    $("#countdown").textContent = days > 1 ? "faltan " + days + " días" : days === 1 ? "¡mañana!" : days > -14 ? "¡estamos de viaje!" : "viaje terminado";
  }

  function renderSetup() {
    viewEl.innerHTML =
      '<div class="notice"><p class="eyebrow">Falta un paso</p><h2>Conectá la planilla</h2>' +
      '<ol><li>Abrí la planilla del viaje → Extensiones → Apps Script.</li>' +
      '<li>Pegá el archivo <b>apps-script/Code.gs</b> del repo y guardá.</li>' +
      '<li>Implementar → Nueva implementación → Aplicación web (Ejecutar como: yo · Acceso: cualquier persona).</li>' +
      '<li>Copiá la URL que termina en <b>/exec</b> y pegala en <b>config.js</b> → API_URL.</li></ol></div>';
  }

  // ---------- Cronograma ----------
  function renderCronograma() {
    const days = S.days || [];
    const conf = allPlaces().filter(p => statusOf(p.id) === "confirmado");
    const unassigned = conf.filter(p => !(S.estado[p.id] && S.estado[p.id].dia));
    const prop = S.propuesta;
    const today = todayISO();

    let h = '<div class="section-head"><div><p class="eyebrow">Plan del viaje</p><h2>Cronograma</h2>' +
      '<p>Acá queda lo que confirmamos. Las actividades llegan desde la lista de espera y se ordenan por día.</p></div>' +
      '<div class="sync" id="sync"></div></div>';

    // Propuesta de Claude
    if (prop && prop.texto) {
      let plan = null;
      try { plan = prop.plan ? JSON.parse(prop.plan) : null; } catch (e) { plan = null; }
      h += '<section class="prop"><div class="prop-head"><span class="claude-mark">' + ICON.spark + '</span><div><h3>Propuesta de Claude</h3><p class="muted" style="margin:0;font-size:13px">Actualizada ' + esc(prop.fecha || "") + "</p></div></div>" +
        '<div class="md clamp" id="prop-md">' + md(prop.texto) + "</div>" +
        '<div class="row"><button class="btn ghost sm" type="button" data-act="prop-more">Ver completa</button>' +
        (plan && ME === C.OWNER ? '<button class="btn accent sm" type="button" data-act="prop-apply">Aplicar al cronograma</button>' : "") + "</div></section>";
    } else {
      h += '<section class="prop"><div class="prop-head"><span class="claude-mark">' + ICON.spark + '</span><div><h3>Propuesta de Claude</h3></div></div>' +
        '<p class="muted" style="margin:0">Cuando tengan la lista de espera revisada en el mapa, ' + esc(C.OWNER) + ' le pide a Claude que arme el viaje: orden por distancia y horarios, dónde conviene dormir, costos y alertas. La propuesta aparece acá.</p></section>';
    }

    if (unassigned.length) {
      h += '<section class="grid-gap"><h3>Confirmadas sin día (' + unassigned.length + ")</h3><div class=\"list\" style=\"margin-top:10px\">" +
        unassigned.map(p => '<div class="li"><div style="min-width:0"><button class="li-title" type="button" data-act="open" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button><div class="li-sub">' + esc(p.zone) + " · " + esc(p.time || "") + '</div></div><div class="li-actions">' + daySelect(p.id, "", days) + "</div></div>").join("") +
        "</div></section>";
    }

    h += '<div class="days">';
    days.forEach(d => {
      const items = dayItems(d);
      const pts = items.filter(it => it.lat != null);
      let dist = "";
      if (pts.length) {
        let total = 0, prev = C.BASE;
        pts.forEach(p => { total += km(prev, p); prev = p; });
        total += km(prev, C.BASE);
        dist = '<span class="kms">≈ ' + Math.round(total * 1.3) + " km ida y vuelta</span>";
      }
      const dd = new Date(d + "T12:00:00");
      h += '<article class="day' + (d === today ? " today" : "") + '" id="d-' + d + '"><div class="day-head"><div class="d"><span class="dn">' + dd.getDate() + '</span><div><div class="dw">' + esc(dayLabel(d, { weekday: "long" })) + '</div><div class="dm">' + esc(dayLabel(d, { month: "long", year: "numeric" })) + "</div></div></div>" + dist + "</div>";
      h += '<div class="day-items">';
      if (!items.length) h += '<div class="day-empty">Día libre por ahora.</div>';
      items.forEach(it => {
        if (it.kind === "extra") {
          h += '<div class="day-item"><div style="min-width:0"><div class="t plain">' + esc(it.titulo) + "</div>" + (it.nota ? '<div class="s">' + esc(it.nota) + "</div>" : "") + '</div><div class="tools"><button class="icon-btn" type="button" data-act="del-extra" data-id="' + esc(it.id) + '" aria-label="Borrar ' + esc(it.titulo) + '">' + ICON.x + "</button></div></div>";
        } else {
          h += '<div class="day-item"><div style="min-width:0"><button class="t" type="button" data-act="open" data-id="' + esc(it.id) + '">' + esc(it.name) + '</button><div class="s">' + esc(it.zone) + (it.time ? " · " + esc(it.time) : "") + '</div></div><div class="tools">' + daySelect(it.id, d, days) + "</div></div>";
        }
      });
      h += '</div><form class="day-add" data-form="extra" data-dia="' + d + '"><input type="text" id="extra-' + d + '" name="titulo" placeholder="Sumar un plan (ej: asado en el depto)" maxlength="120" aria-label="Sumar plan al ' + esc(dayLabel(d)) + '"><button class="btn ghost sm" type="submit">Sumar</button></form></article>';
    });
    h += "</div>";
    viewEl.innerHTML = h;
  }

  function dayItems(d) {
    const acts = allPlaces().filter(p => statusOf(p.id) === "confirmado" && S.estado[p.id] && S.estado[p.id].dia === d)
      .map(p => Object.assign({ kind: "act", orden: Number(S.estado[p.id].orden) || 0 }, p));
    const ex = (S.extras || []).filter(x => x.dia === d).map(x => Object.assign({ kind: "extra", orden: Number(x.orden) || 0 }, x));
    return acts.concat(ex).sort((a, b) => a.orden - b.orden);
  }

  function daySelect(id, cur, days) {
    let o = '<select data-act="set-day" data-id="' + esc(id) + '" aria-label="Elegir día"><option value="">' + (cur ? "Sacar del día" : "Elegir día…") + "</option>";
    days.forEach(d => { o += '<option value="' + d + '"' + (d === cur ? " selected" : "") + ">" + esc(dayLabel(d)) + "</option>"; });
    return o + "</select>";
  }

  // Markdown mínimo: ### títulos, - listas, **negrita**
  function md(t) {
    const lines = String(t || "").split(/\r?\n/);
    let out = "", inList = false;
    lines.forEach(l => {
      const line = esc(l).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      if (/^\s*[-*]\s+/.test(l)) {
        if (!inList) { out += "<ul>"; inList = true; }
        out += "<li>" + line.replace(/^\s*[-*]\s+/, "") + "</li>";
        return;
      }
      if (inList) { out += "</ul>"; inList = false; }
      if (/^#{1,6}\s/.test(l)) out += "<h4>" + line.replace(/^#{1,6}\s/, "") + "</h4>";
      else if (l.trim()) out += "<p>" + line + "</p>";
    });
    if (inList) out += "</ul>";
    return out;
  }

  // ---------- Explorar ----------
  function renderExplorar() {
    const places = allPlaces();
    const q = norm(ui.q);
    const list = places.filter(p => {
      if (ui.zone !== "Todas" && p.zone !== ui.zone) return false;
      if (ui.mood && p.moods.indexOf(ui.mood) < 0) return false;
      if (q && norm(p.name + " " + p.summary + " " + p.detail + " " + p.zone).indexOf(q) < 0) return false;
      const st = statusOf(p.id);
      if (ui.filter === "falta" && votesOf(p.id)[ME] !== undefined) return false;
      if (ui.filter === "espera" && st !== "espera") return false;
      if (ui.filter === "confirmado" && st !== "confirmado") return false;
      return true;
    });
    const total = places.length;

    let h = '<div class="section-head"><div><p class="eyebrow">Todo lo que se puede hacer</p><h2>Explorar</h2>' +
      "<p>Abrí cada lugar, mirá fotos y videos, y votá. Con " + C.THRESHOLD + " de " + PEOPLE.length + " que quieran ir, pasa a la lista de espera.</p></div>" +
      '<button class="btn accent" type="button" data-act="add-open">' + ICON.plus + "Agregar lugar</button></div>";

    // progreso de votos
    h += '<div class="progress" aria-label="Avance de votos">';
    PEOPLE.forEach(p => {
      const n = places.filter(x => votesOf(x.id)[p] !== undefined).length;
      const pct = total ? Math.round(n / total * 100) : 0;
      h += '<div class="progress-row">' + av(p, "sm") + "<span>" + esc(p) + '</span><div class="bar"><i style="width:' + pct + "%;--p:var(" + PCOLOR[p] + ')"></i></div><span class="num muted">' + n + "/" + total + "</span></div>";
    });
    h += "</div>";

    h += '<div class="field"><label for="q">Buscar</label><input type="search" id="q" value="' + esc(ui.q) + '" placeholder="Cascada, museo, Carlos Paz…" autocomplete="off"></div>';
    h += '<div class="chips" role="group" aria-label="Zona">' + ["Todas"].concat(zones()).map(z => '<button class="chip" type="button" data-act="zone" data-v="' + esc(z) + '" aria-pressed="' + (ui.zone === z) + '">' + esc(z) + "</button>").join("") + "</div>";
    h += '<div class="chips" role="group" aria-label="Filtro">' +
      [["todas", "Todas"], ["falta", "Me falta votar"], ["espera", "En espera"], ["confirmado", "Confirmadas"]].map(f => '<button class="chip" type="button" data-act="filter" data-v="' + f[0] + '" aria-pressed="' + (ui.filter === f[0]) + '">' + f[1] + "</button>").join("") +
      Object.keys(MOODS).map(m => '<button class="chip" type="button" data-act="mood" data-v="' + m + '" aria-pressed="' + (ui.mood === m) + '">' + esc(MOODS[m]) + "</button>").join("") + "</div>";

    if (!list.length) {
      h += '<div class="empty"><strong>No hay lugares con esos filtros</strong>Probá con otra zona o sacá algún filtro.</div>';
      viewEl.innerHTML = h;
      return;
    }

    let curZone = null;
    h += '<div class="cards">';
    list.forEach(p => {
      if (p.zone !== curZone) {
        curZone = p.zone;
        const n = list.filter(x => x.zone === curZone).length;
        h += '<div class="zone-head"><h3>' + esc(curZone) + '</h3><span class="muted num" style="font-size:13px">' + n + (n === 1 ? " lugar" : " lugares") + "</span></div>";
        const tips = (S.tips || {})[curZone];
        if (tips && tips.length && ui.zone === curZone) h += '<div class="tips">' + tips.map(t => "<p>" + esc(t) + "</p>").join("") + "</div>";
      }
      h += card(p);
    });
    h += "</div>";
    const focused = document.activeElement && document.activeElement.id === "q";
    const caret = focused ? document.activeElement.selectionStart : null;
    viewEl.innerHTML = h;
    if (focused) { const i = $("#q"); i.focus(); try { i.setSelectionRange(caret, caret); } catch (e) { /* */ } }
  }

  function card(p) {
    const st = statusOf(p.id);
    const v = votesOf(p.id);
    const mine = v[ME];
    return '<article class="card"><button class="card-main" type="button" data-act="open" data-id="' + esc(p.id) + '">' +
      '<div class="card-top"><span class="eyebrow">' + esc(p.sub || p.zone) + '</span><span class="pill ' + st + '">' + STATUS_LABEL[st] + "</span></div>" +
      "<h3>" + esc(p.name) + "</h3>" +
      (p.summary ? '<p class="summary">' + esc(p.summary) + "</p>" : p.detail ? '<p class="summary">' + esc(p.detail) + "</p>" : "") +
      "</button>" +
      '<div class="card-meta">' + (p.time ? '<span class="tag">' + esc(p.time.split("|")[0].trim()) + "</span>" : "") +
      (p.diff ? '<span class="tag">Dificultad ' + esc(p.diff.toLowerCase()) + "</span>" : "") +
      (p.price ? '<span class="tag">' + esc(p.price.length > 28 ? p.price.slice(0, 26) + "…" : p.price) + "</span>" : "") + "</div>" +
      '<div class="card-foot"><div class="voters">' + PEOPLE.map(x => av(x, "sm", v[x] === undefined ? 0 : v[x])).join("") + "</div>" +
      voteButtons(p.id, mine) + "</div></article>";
  }

  function voteButtons(id, mine) {
    return '<div class="vote"><button class="yes" type="button" data-act="vote" data-id="' + esc(id) + '" data-v="1" aria-pressed="' + (mine === 1) + '">' + ICON.up + "Quiero ir</button>" +
      '<button class="no" type="button" data-act="vote" data-id="' + esc(id) + '" data-v="-1" aria-pressed="' + (mine === -1) + '">' + ICON.down + "Paso</button></div>";
  }

  // ---------- Lista de espera + mapa ----------
  function renderMapa() {
    const places = allPlaces();
    const wait = places.filter(p => statusOf(p.id) === "espera");
    const conf = places.filter(p => statusOf(p.id) === "confirmado");
    const desc = places.filter(p => statusOf(p.id) === "descartado");

    if (map) { mapState = { c: map.getCenter(), z: map.getZoom() }; map.remove(); map = null; }

    let h = '<div class="section-head"><div><p class="eyebrow">Paso 2</p><h2>Lista de espera</h2>' +
      "<p>Lo que tiene " + C.THRESHOLD + " o más votos. Mírenlo en el mapa y decidan si entra en el viaje o si no conviene por distancia o tiempo.</p></div></div>";
    h += '<div id="map" class="map" role="region" aria-label="Mapa de lugares"></div>';
    h += '<div class="legend"><span><i style="background:var(--wait)"></i>En espera (' + wait.length + ')</span><span><i style="background:var(--accent)"></i>Confirmado (' + conf.length + ")</span>" +
      '<span><i style="background:var(--ink)"></i>Base: ' + esc(C.BASE.name) + "</span>" +
      '<label class="row" style="gap:6px;margin-left:auto"><input type="checkbox" id="show-all" ' + (ui.showAll ? "checked" : "") + "> Ver todo el catálogo</label></div>";

    h += "<section><h3>En espera (" + wait.length + ")</h3>";
    if (!wait.length) h += '<div class="empty" style="margin-top:10px"><strong>Todavía no hay nada en espera</strong>Cuando un lugar junte ' + C.THRESHOLD + " votos de “Quiero ir” aparece acá.</div>";
    else h += '<div class="list" style="margin-top:10px">' + wait.map(p => mapRow(p, "espera")).join("") + "</div>";
    h += "</section>";

    h += "<section><h3>Confirmadas (" + conf.length + ')</h3><div class="list" style="margin-top:10px">' +
      (conf.length ? conf.map(p => mapRow(p, "confirmado")).join("") : '<div class="empty">Todavía no confirmaron nada.</div>') + "</div></section>";

    if (desc.length) {
      h += '<details class="fold"><summary>Descartadas (' + desc.length + ')</summary><div class="list" style="margin-top:10px">' + desc.map(p => mapRow(p, "descartado")).join("") + "</div></details>";
    }
    viewEl.innerHTML = h;
    drawMap(wait, conf, places);
  }

  function mapRow(p, st) {
    const dist = p.lat != null ? Math.round(km(C.BASE, p) * 1.3) : null;
    let actions = "";
    if (st === "espera") actions = '<button class="btn accent sm" type="button" data-act="estado" data-id="' + esc(p.id) + '" data-v="confirmado">Lo hacemos</button><button class="btn ghost sm" type="button" data-act="estado" data-id="' + esc(p.id) + '" data-v="descartado">No conviene</button>';
    else if (st === "confirmado") actions = '<button class="btn ghost sm" type="button" data-act="estado" data-id="' + esc(p.id) + '" data-v="">Volver a espera</button>';
    else actions = '<button class="btn ghost sm" type="button" data-act="estado" data-id="' + esc(p.id) + '" data-v="">Recuperar</button>';
    const v = votesOf(p.id);
    return '<div class="li"><div style="min-width:0"><button class="li-title" type="button" data-act="open" data-id="' + esc(p.id) + '">' + esc(p.name) + "</button>" +
      '<div class="li-sub"><span>' + esc(p.zone) + "</span>" + (dist != null ? '<span class="num">≈ ' + dist + " km de la base</span>" : "<span>sin ubicación</span>") +
      '<span class="voters">' + PEOPLE.map(x => av(x, "sm", v[x] === undefined ? 0 : v[x])).join("") + "</span>" +
      (p.lat != null ? '<button class="btn ghost sm" type="button" data-act="focus" data-id="' + esc(p.id) + '">' + ICON.pin + "Ver</button>" : "") +
      '</div></div><div class="li-actions">' + actions + "</div></div>";
  }

  function drawMap(wait, conf, all) {
    const el = $("#map");
    if (!el || !window.L) { if (el) el.innerHTML = '<div class="empty">No se pudo cargar el mapa.</div>'; return; }
    map = L.map(el, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
    const pts = [];
    const add = (p, color, r, op) => {
      if (p.lat == null) return;
      const m = L.circleMarker([p.lat, p.lng], { radius: r, color: "#fff", weight: 2, fillColor: color, fillOpacity: op }).addTo(map);
      m.bindPopup("<b>" + esc(p.name) + "</b><br>" + esc(p.zone) + '<br><a href="#" data-act="open" data-id="' + esc(p.id) + '">Ver detalle</a>');
      m._pid = p.id;
      pts.push([p.lat, p.lng]);
    };
    if (ui.showAll) all.forEach(p => { const st = statusOf(p.id); if (st === "votando") add(p, cssVar("--muted"), 5, .6); });
    wait.forEach(p => add(p, cssVar("--wait"), 9, .95));
    conf.forEach(p => add(p, cssVar("--accent"), 9, .95));
    L.circleMarker([C.BASE.lat, C.BASE.lng], { radius: 7, color: "#fff", weight: 2, fillColor: cssVar("--ink"), fillOpacity: 1 }).addTo(map).bindPopup("<b>" + esc(C.BASE.name) + "</b><br>Base del viaje");
    pts.push([C.BASE.lat, C.BASE.lng]);
    if (mapState) map.setView(mapState.c, mapState.z);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
    else map.setView([C.BASE.lat, C.BASE.lng], 8);
  }

  // ---------- Gastos ----------
  function renderGastos() {
    const g = (S.gastos || []).slice().reverse();
    const total = g.reduce((s, x) => s + x.monto, 0);
    const paid = {}, owed = {};
    PEOPLE.forEach(p => { paid[p] = 0; owed[p] = 0; });
    g.forEach(x => {
      const entre = (x.entre || PEOPLE).filter(p => PEOPLE.indexOf(p) >= 0);
      if (paid[x.pago] !== undefined) paid[x.pago] += x.monto;
      const share = x.monto / (entre.length || 1);
      entre.forEach(p => { owed[p] += share; });
    });
    const bal = PEOPLE.map(p => ({ p, v: paid[p] - owed[p] }));
    const settle = settleUp(bal);

    let h = '<div class="section-head"><div><p class="eyebrow">Plata del viaje</p><h2>Gastos</h2><p>Todo lo que se carga acá también queda en la hoja “Gastos” de la planilla.</p></div></div>';
    h += '<div class="stats"><div class="stat"><div class="v">' + money(total) + '</div><div class="k">Gastado en total</div></div>' +
      '<div class="stat"><div class="v">' + money(total / PEOPLE.length) + '</div><div class="k">Por persona (promedio)</div></div>' +
      '<div class="stat"><div class="v num">' + g.length + '</div><div class="k">Gastos cargados</div></div></div>';

    h += '<section class="form-card"><h3>Cargar gasto</h3><form data-form="gasto" class="grid-gap" style="display:grid;gap:12px">' +
      '<div class="grid-2"><div class="field"><label for="g-desc">Qué fue</label><input type="text" id="g-desc" name="desc" required maxlength="160" placeholder="Nafta, súper, entradas…"></div>' +
      '<div class="field"><label for="g-monto">Monto</label><input type="number" id="g-monto" name="monto" required min="1" step="1" inputmode="numeric" placeholder="25000"></div></div>' +
      '<div class="grid-2"><div class="field"><label for="g-pago">Pagó</label><select id="g-pago" name="pago">' + PEOPLE.map(p => "<option" + (p === ME ? " selected" : "") + ">" + esc(p) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label for="g-cat">Categoría</label><select id="g-cat" name="cat">' + ["Comida", "Súper", "Nafta y peajes", "Alojamiento", "Auto", "Entradas y excursiones", "Salidas", "Otros"].map(c => "<option>" + c + "</option>").join("") + "</select></div></div>" +
      '<div class="grid-2"><div class="field"><label for="g-fecha">Fecha</label><input type="date" id="g-fecha" name="fecha" value="' + todayISO() + '"></div>' +
      '<div class="field"><span style="font-size:13px;font-weight:600">Entre quiénes se divide</span><div class="checks">' + PEOPLE.map(p => '<label class="check-chip"><input type="checkbox" name="entre" value="' + esc(p) + '" checked>' + av(p, "sm") + esc(p) + "</label>").join("") + "</div></div></div>" +
      '<div><button class="btn accent" type="submit">Guardar gasto</button></div></form></section>';

    h += '<section class="form-card"><h3>Cómo quedan las cuentas</h3><div class="bal">' +
      bal.map(b => '<div class="bal-row">' + av(b.p, "sm") + "<span>" + esc(b.p) + "</span><span class=\"amt " + (b.v > 0.5 ? "pos" : b.v < -0.5 ? "neg" : "") + '">' + (b.v > 0.5 ? "le deben " + money(b.v) : b.v < -0.5 ? "debe " + money(-b.v) : "está al día") + "</span></div>").join("") +
      "</div>" + (settle.length ? '<p class="eyebrow" style="margin-top:6px">Para saldar</p><div class="bal">' + settle.map(s => '<div class="bal-row">' + av(s.from, "sm") + esc(s.from) + " le pasa a " + av(s.to, "sm") + esc(s.to) + '<span class="amt">' + money(s.v) + "</span></div>").join("") + "</div>" : "") + "</section>";

    h += "<section><h3>Movimientos</h3>";
    if (!g.length) h += '<div class="empty" style="margin-top:10px"><strong>Todavía no hay gastos</strong>Cargá el primero con el formulario de arriba: el alquiler del auto, el depto o la primera compra en el súper.</div>';
    else h += '<div class="list g-list" style="margin-top:10px">' + g.map(x =>
      '<div class="li">' + av(x.pago, "") + '<div style="min-width:0"><div style="font-weight:600">' + esc(x.desc) + '</div><div class="li-sub"><span>' + esc(x.fecha) + "</span><span>" + esc(x.cat) + "</span><span>entre " + esc((x.entre || []).join(", ")) + '</span></div></div><div class="row" style="gap:8px"><span class="g-amt">' + money(x.monto) + '</span><button class="icon-btn" type="button" data-act="del-gasto" data-id="' + esc(x.id) + '" aria-label="Borrar gasto ' + esc(x.desc) + '">' + ICON.trash + "</button></div></div>").join("") + "</div>";
    h += "</section>";
    viewEl.innerHTML = h;
  }

  function settleUp(bal) {
    const debt = bal.filter(b => b.v < -0.5).map(b => ({ p: b.p, v: -b.v })).sort((a, b) => b.v - a.v);
    const cred = bal.filter(b => b.v > 0.5).map(b => ({ p: b.p, v: b.v })).sort((a, b) => b.v - a.v);
    const out = [];
    let i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      const v = Math.min(debt[i].v, cred[j].v);
      out.push({ from: debt[i].p, to: cred[j].p, v });
      debt[i].v -= v; cred[j].v -= v;
      if (debt[i].v < 0.5) i++;
      if (cred[j].v < 0.5) j++;
    }
    return out;
  }

  // ---------- Necesarios ----------
  function renderNecesarios() {
    const items = (S.necesarios || []).slice().sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    const cats = [];
    items.forEach(i => { if (cats.indexOf(i.categoria) < 0) cats.push(i.categoria); });
    const done = items.filter(i => i.listo).length;

    let h = '<div class="section-head"><div><p class="eyebrow">Para la valija</p><h2>Necesarios</h2><p>Marcá quién lleva cada cosa y tildala cuando ya esté en la mochila. Se guarda en la hoja “Necesarios”.</p></div><span class="muted num">' + done + "/" + items.length + " listos</span></div>";
    cats.forEach(c => {
      const list = items.filter(i => i.categoria === c);
      const ok = list.filter(i => i.listo).length;
      h += '<details class="need-cat" open><summary><span>' + esc(c) + '</span><span class="muted num" style="font-weight:500;font-size:13px">' + ok + "/" + list.length + "</span></summary>";
      list.forEach(i => {
        h += '<div class="need-row' + (i.listo ? " done" : "") + '"><input type="checkbox" id="nd-' + esc(i.id) + '" data-act="need-done" data-id="' + esc(i.id) + '"' + (i.listo ? " checked" : "") + ' aria-label="Listo: ' + esc(i.item) + '">' +
          '<label class="need-name" for="nd-' + esc(i.id) + '">' + esc(i.item) + "</label>" +
          '<div class="who">' + PEOPLE.map(p => '<button type="button" data-act="need-who" data-id="' + esc(i.id) + '" data-p="' + esc(p) + '" aria-pressed="' + !!i[p] + '" aria-label="' + esc(p) + " lleva " + esc(i.item) + '"><span class="av sm" style="--p:var(' + PCOLOR[p] + ')" data-on="' + (i[p] ? 1 : 0) + '">' + esc(p[0]) + "</span></button>").join("") + "</div>" +
          '<button class="icon-btn" type="button" data-act="need-del" data-id="' + esc(i.id) + '" aria-label="Borrar ' + esc(i.item) + '">' + ICON.x + "</button></div>";
      });
      h += '<form class="day-add" data-form="need" data-cat="' + esc(c) + '"><input type="text" name="item" id="need-add-' + norm(c).replace(/ /g, "-") + '" placeholder="Agregar a ' + esc(c) + '" maxlength="120" aria-label="Agregar a ' + esc(c) + '"><button class="btn ghost sm" type="submit">Sumar</button></form></details>';
    });
    h += '<section class="form-card"><h3>Nueva categoría</h3><form data-form="need-cat" class="grid-2"><div class="field"><label for="nc-cat">Categoría</label><input type="text" id="nc-cat" name="cat" required maxlength="60" placeholder="Botiquín"></div><div class="field"><label for="nc-item">Primer ítem</label><input type="text" id="nc-item" name="item" required maxlength="120" placeholder="Ibuprofeno"></div><div><button class="btn accent" type="submit">Crear</button></div></form></section>';
    viewEl.innerHTML = h;
  }

  // ---------- Hoja de detalle ----------
  function openSheet(mode) {
    sheetMode = mode;
    $("#sheet").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeSheet() {
    if (sheetMode === "who" && !ME) return;
    sheetMode = null; openId = null;
    $("#sheet").hidden = true;
    document.body.style.overflow = "";
    if (addMap) { addMap.remove(); addMap = null; }
  }

  function openDetail(id) {
    openId = id;
    openSheet("detail");
    renderDetail(id);
    $(".sheet").scrollTop = 0;
  }

  function renderDetail(id) {
    const p = placeById(id);
    if (!p) { closeSheet(); return; }
    const st = statusOf(p.id);
    const v = votesOf(p.id);
    const media = (S.media && S.media[p.id]) || [];
    const q = encodeURIComponent(p.q || p.name);
    const mapsQ = p.lat != null ? p.lat + "," + p.lng : q;
    let h = '<div class="sheet-top"><div style="min-width:0"><p class="eyebrow">' + esc(p.zone) + (p.sub ? " · " + esc(p.sub) : "") + '</p><h2 id="sheet-title">' + esc(p.name) + '</h2><div class="row" style="margin-top:8px;gap:6px"><span class="pill ' + st + '">' + STATUS_LABEL[st] + "</span>" + p.moods.map(m => '<span class="tag">' + esc(MOODS[m] || m) + "</span>").join("") + "</div></div>" +
      '<button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">' + ICON.x + "</button></div>";
    h += '<p class="why"><b>Por qué ir</b>' + esc(p.summary || p.detail || "Sin resumen todavía.") + "</p>";

    h += '<section class="grid-gap" style="display:grid;gap:10px"><h3>Fotos</h3><div class="gallery" id="gallery"><div class="ph"></div><div class="ph"></div></div>' +
      '<p class="muted" style="margin:0;font-size:12px">Fotos libres de Wikimedia Commons. Si no aparece el lugar justo, usá los links de abajo.</p></section>';

    h += '<section style="display:grid;gap:10px"><h3>Fotos y videos del grupo</h3>';
    if (media.length) {
      h += '<div class="media-list">' + media.map(m => mediaHTML(m)).join("") + "</div>";
    } else h += '<p class="muted" style="margin:0">Todavía nadie compartió nada. Pegá un link de YouTube, TikTok, Instagram o una foto.</p>';
    h += '<form data-form="media" class="row"><input type="url" id="media-url" name="url" placeholder="https://www.youtube.com/watch?v=…" required aria-label="Link de foto o video" style="flex:1;min-width:200px"><button class="btn ghost" type="submit">Compartir</button></form></section>';

    h += '<section style="display:grid;gap:10px"><h3>Buscar más</h3><div class="links">' +
      '<a href="https://www.youtube.com/results?search_query=' + q + '" target="_blank" rel="noopener">' + ICON.play + "Videos en YouTube</a>" +
      '<a href="https://www.tiktok.com/search?q=' + q + '" target="_blank" rel="noopener">' + ICON.play + "Videos en TikTok</a>" +
      '<a href="https://www.google.com/search?tbm=isch&q=' + q + '" target="_blank" rel="noopener">' + ICON.img + "Fotos en Google</a>" +
      '<a href="https://www.google.com/maps/search/?api=1&query=' + mapsQ + '" target="_blank" rel="noopener">' + ICON.pin + "Abrir en Maps</a></div></section>";

    h += '<section style="display:grid;gap:10px"><h3>Datos</h3><dl class="facts">' +
      (p.time ? "<dt>Tiempo</dt><dd>" + esc(p.time) + "</dd>" : "") +
      (p.diff ? "<dt>Dificultad</dt><dd>" + esc(p.diff) + "</dd>" : "") +
      (p.price ? "<dt>¿Se paga?</dt><dd>" + esc(p.price) + "</dd>" : "") +
      (p.lat != null ? '<dt>Distancia</dt><dd class="num">≈ ' + Math.round(km(C.BASE, p) * 1.3) + " km desde " + esc(C.BASE.name) + "</dd>" : "") +
      (p.detail ? "<dt>Detalle</dt><dd>" + esc(p.detail) + "</dd>" : "") +
      (p.custom ? "<dt>Lo sumó</dt><dd>" + esc(p.autor || "") + "</dd>" : "") + "</dl></section>";
    if (p.custom && p.autor === ME) h += '<div><button class="btn danger sm" type="button" data-act="del-lugar" data-id="' + esc(p.id) + '">' + ICON.trash + "Borrar este lugar</button></div>";

    $("#sheet-body").innerHTML = h;
    let vote = $(".sheet-vote");
    if (!vote) { vote = document.createElement("div"); vote.className = "sheet-vote"; $(".sheet").appendChild(vote); }
    vote.innerHTML = '<div class="voters">' + PEOPLE.map(x => av(x, "", v[x] === undefined ? 0 : v[x])).join("") + "</div>" + voteButtons(p.id, v[ME]);
    loadGallery(p);
  }

  function mediaHTML(m) {
    const url = m.url;
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
    const del = m.autor === ME ? '<button class="icon-btn" type="button" data-act="del-media" data-id="' + esc(m.mid) + '" aria-label="Borrar">' + ICON.x + "</button>" : "";
    const by = '<div class="by"><span>Compartido por ' + esc(m.autor) + "</span>" + del + "</div>";
    if (yt) return '<div class="media-item"><iframe src="https://www.youtube-nocookie.com/embed/' + yt[1] + '" title="Video de YouTube" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>' + by + "</div>";
    if (/\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(url)) return '<div class="media-item"><a href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="Foto compartida por ' + esc(m.autor) + '" loading="lazy"></a>' + by + "</div>";
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (e) { host = "link"; }
    return '<div class="media-item"><a class="media-link" href="' + esc(url) + '" target="_blank" rel="noopener">' + ICON.link + "<span>" + esc(host) + " · " + esc(url) + "</span></a>" + by + "</div>";
  }

  async function loadGallery(p) {
    const el = $("#gallery");
    if (!el) return;
    const key = p.q || p.name;
    try {
      if (!commonsCache[key]) {
        const u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=720&gsrsearch=" + encodeURIComponent(key);
        const r = await fetch(u);
        const d = await r.json();
        const pages = d.query && d.query.pages ? Object.values(d.query.pages) : [];
        commonsCache[key] = pages.sort((a, b) => (a.index || 0) - (b.index || 0))
          .map(pg => ({ src: pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].thumburl, page: pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].descriptionurl, title: (pg.title || "").replace(/^File:/, "").replace(/\.[a-z]+$/i, "") }))
          .filter(x => x.src && /\.(jpe?g|png|webp)/i.test(x.src)).slice(0, 8);
      }
      if (openId !== p.id) return;
      const imgs = commonsCache[key];
      const target = $("#gallery");
      if (!target) return;
      target.innerHTML = imgs.length ? imgs.map(i => '<figure><a href="' + esc(i.page) + '" target="_blank" rel="noopener"><img src="' + esc(i.src) + '" alt="' + esc(i.title) + '" loading="lazy"></a><figcaption>' + esc(i.title) + "</figcaption></figure>").join("")
        : '<p class="muted" style="margin:0">No encontramos fotos libres de este lugar. Probá con “Fotos en Google”.</p>';
    } catch (e) {
      const target = $("#gallery");
      if (target) target.innerHTML = '<p class="muted" style="margin:0">No se pudieron cargar las fotos.</p>';
    }
  }

  // ---------- Quién sos / invitar / agregar ----------
  function openWho() {
    openSheet("who");
    const old = $(".sheet-vote"); if (old) old.remove();
    $("#sheet-body").innerHTML = '<div class="sheet-top"><div><p class="eyebrow">Bienvenida al viaje</p><h2 id="sheet-title">¿Quién sos?</h2><p class="muted" style="margin:6px 0 0">Así sabemos de quién es cada voto. Lo podés cambiar después.</p></div>' +
      (ME ? '<button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">' + ICON.x + "</button>" : "") + "</div>" +
      '<div class="who-pick">' + PEOPLE.map(p => '<button type="button" data-act="pick-me" data-p="' + esc(p) + '">' + av(p, "") + esc(p) + "</button>").join("") + "</div>";
  }

  function openInvite() {
    const url = location.origin + location.pathname;
    const text = "Sumate a armar el viaje a Córdoba. Entrá, elegí tu nombre y votá los lugares: " + url;
    openSheet("invite");
    const old = $(".sheet-vote"); if (old) old.remove();
    $("#sheet-body").innerHTML = '<div class="sheet-top"><div><p class="eyebrow">Invitación</p><h2 id="sheet-title">Invitá al grupo</h2></div><button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">' + ICON.x + "</button></div>" +
      '<p style="margin:0">Mandales este mensaje por WhatsApp. Cada uno entra, elige su nombre y vota desde el celular.</p>' +
      '<div class="field"><label for="inv-text">Mensaje</label><textarea id="inv-text" readonly>' + esc(text) + "</textarea></div>" +
      '<div class="row"><button class="btn accent" type="button" data-act="copy-invite">Copiar mensaje</button>' +
      '<a class="btn ghost" href="https://wa.me/?text=' + encodeURIComponent(text) + '" target="_blank" rel="noopener">Abrir WhatsApp</a></div>';
  }

  function openAdd() {
    openSheet("add");
    const old = $(".sheet-vote"); if (old) old.remove();
    $("#sheet-body").innerHTML = '<div class="sheet-top"><div><p class="eyebrow">Nuevo lugar</p><h2 id="sheet-title">Agregar al catálogo</h2></div><button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">' + ICON.x + "</button></div>" +
      '<form data-form="lugar" style="display:grid;gap:12px">' +
      '<div class="field"><label for="l-name">Nombre</label><input type="text" id="l-name" name="name" required maxlength="120" placeholder="Cascada de Olaen"></div>' +
      '<div class="field"><label for="l-zone">Zona</label><select id="l-zone" name="zone">' + zones().filter(z => z !== "Agregados por el grupo").map(z => "<option>" + esc(z) + "</option>").join("") + "<option>Agregados por el grupo</option></select></div>" +
      '<div class="field"><label for="l-sum">¿Por qué vale la pena?</label><textarea id="l-sum" name="summary" maxlength="600" placeholder="Qué lo hace especial, para qué mood es ideal"></textarea></div>' +
      '<div class="grid-2"><div class="field"><label for="l-time">Tiempo</label><input type="text" id="l-time" name="time" maxlength="120" placeholder="2 h | Mañana"></div>' +
      '<div class="field"><label for="l-price">¿Se paga?</label><input type="text" id="l-price" name="price" maxlength="120" placeholder="Gratis"></div></div>' +
      '<div class="field"><label for="l-diff">Dificultad</label><select id="l-diff" name="diff"><option>Baja</option><option>Media</option><option>Alta</option></select></div>' +
      '<div class="field"><label for="l-maps">Ubicación</label><input type="url" id="l-maps" name="maps" placeholder="Pegá un link de Google Maps…"><span class="hint">…o tocá el mapa para marcar el punto.</span></div>' +
      '<div id="add-map" class="map small"></div><input type="hidden" name="lat" id="l-lat"><input type="hidden" name="lng" id="l-lng">' +
      '<div class="field"><label for="l-detail">Detalle</label><textarea id="l-detail" name="detail" maxlength="1500" placeholder="Horarios, precios, cómo llegar"></textarea></div>' +
      '<div><button class="btn accent" type="submit">Agregar lugar</button></div></form>';
    setTimeout(() => {
      if (!window.L) return;
      addMap = L.map("add-map").setView([C.BASE.lat, C.BASE.lng], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(addMap);
      let mk = null;
      const setPt = (lat, lng) => {
        $("#l-lat").value = lat; $("#l-lng").value = lng;
        if (mk) mk.setLatLng([lat, lng]); else mk = L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 2, fillColor: cssVar("--accent"), fillOpacity: 1 }).addTo(addMap);
      };
      addMap.on("click", e => setPt(e.latlng.lat.toFixed(5), e.latlng.lng.toFixed(5)));
      $("#l-maps").addEventListener("change", e => {
        const m = e.target.value.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || e.target.value.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || e.target.value.match(/(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/);
        if (m) { setPt(m[1], m[2]); addMap.setView([m[1], m[2]], 12); }
        else toast("Ese link no trae coordenadas. Tocá el mapa para marcar el punto.", 3500);
      });
    }, 60);
  }

  // ---------- Eventos ----------
  document.addEventListener("click", async e => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;
    const id = t.dataset.id;
    if (t.tagName === "A" && act === "open") e.preventDefault();

    if (act === "close") return closeSheet();
    if (act === "reload") return location.reload();
    if (act === "open") return openDetail(id);
    if (act === "pick-me") {
      ME = t.dataset.p; lsSet("me", ME);
      sheetMode = null; closeSheet(); render();
      toast("Hola, " + ME + ". Ya podés votar.");
      return;
    }
    if (!ME && ["vote", "estado", "add-open", "del-gasto", "need-who", "need-del", "del-extra", "prop-apply"].indexOf(act) >= 0) { openWho(); return; }

    if (act === "vote") {
      const val = Number(t.dataset.v);
      const cur = votesOf(id)[ME];
      const next = cur === val ? 0 : val;
      S.votes[id] = Object.assign({}, S.votes[id]);
      if (next) S.votes[id][ME] = next; else delete S.votes[id][ME];
      render();
      if (statusOf(id) === "espera" && yesCount(id) === C.THRESHOLD && next === 1) toast("¡Pasó a la lista de espera!");
      api({ action: "vote", id, valor: next });
      return;
    }
    if (act === "zone") { ui.zone = t.dataset.v; renderExplorar(); return; }
    if (act === "filter") { ui.filter = t.dataset.v; renderExplorar(); return; }
    if (act === "mood") { ui.mood = ui.mood === t.dataset.v ? "" : t.dataset.v; renderExplorar(); return; }
    if (act === "add-open") return openAdd();
    if (act === "estado") {
      const v = t.dataset.v;
      const prev = S.estado[id] || {};
      S.estado[id] = { estado: v, dia: v === "confirmado" ? prev.dia || "" : "", orden: prev.orden || 0, nota: prev.nota || "" };
      render();
      toast(v === "confirmado" ? "Confirmado. Asignale un día en el cronograma." : v === "descartado" ? "Descartado." : "Volvió a la lista de espera.");
      api({ action: "estado", id, estado: v, dia: S.estado[id].dia, orden: S.estado[id].orden, nota: S.estado[id].nota });
      return;
    }
    if (act === "focus") {
      const p = placeById(id);
      if (map && p && p.lat != null) {
        map.setView([p.lat, p.lng], 12);
        map.eachLayer(l => { if (l._pid === id) l.openPopup(); });
        $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    if (act === "del-extra") {
      S.extras = S.extras.filter(x => x.id !== id); render();
      api({ action: "delExtra", id });
      return;
    }
    if (act === "prop-more") { const m = $("#prop-md"); m.classList.toggle("clamp"); t.textContent = m.classList.contains("clamp") ? "Ver completa" : "Ver menos"; return; }
    if (act === "prop-apply") {
      let plan = null;
      try { plan = JSON.parse(S.propuesta.plan); } catch (err) { toast("La propuesta no trae un plan para aplicar."); return; }
      const items = [];
      Object.keys(plan).forEach(d => (plan[d] || []).forEach((pid, i) => { if (placeById(pid)) items.push({ id: pid, estado: "confirmado", dia: d, orden: i, nota: (S.estado[pid] && S.estado[pid].nota) || "" }); }));
      items.forEach(it => { S.estado[it.id] = { estado: "confirmado", dia: it.dia, orden: it.orden, nota: it.nota }; });
      render();
      toast("Propuesta aplicada: " + items.length + " actividades ubicadas.");
      api({ action: "estadoBatch", items });
      return;
    }
    if (act === "del-gasto") {
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.classList.add("btn", "danger", "sm"); t.textContent = "¿Borrar?"; setTimeout(() => { if (t.isConnected) { t.dataset.confirm = ""; t.className = "icon-btn"; t.innerHTML = ICON.trash; } }, 3000); return; }
      S.gastos = S.gastos.filter(g => g.id !== id); render();
      api({ action: "delGasto", id });
      return;
    }
    if (act === "need-who") {
      const it = S.necesarios.find(n => n.id === id);
      if (!it) return;
      it[t.dataset.p] = it[t.dataset.p] ? "" : "x";
      render();
      api({ action: "necesario", item: needPayload(it) });
      return;
    }
    if (act === "need-del") {
      S.necesarios = S.necesarios.filter(n => n.id !== id); render();
      api({ action: "delNecesario", id });
      return;
    }
    if (act === "del-media") {
      S.media[openId] = (S.media[openId] || []).filter(m => m.mid !== id); renderDetail(openId);
      api({ action: "delMedia", mid: id });
      return;
    }
    if (act === "del-lugar") {
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Tocá de nuevo para borrar"; return; }
      S.lugares = S.lugares.filter(l => l.id !== id); allPlaces._v = null; closeSheet(); render();
      api({ action: "delLugar", id });
      return;
    }
    if (act === "copy-invite") {
      const ta = $("#inv-text");
      try { await navigator.clipboard.writeText(ta.value); toast("Mensaje copiado. Pegalo en el grupo."); }
      catch (err) { ta.select(); toast("Seleccioné el mensaje: copialo con el menú."); }
      return;
    }
  });

  document.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.act === "set-day") {
      const id = t.dataset.id;
      const prev = S.estado[id] || {};
      const dia = t.value;
      const orden = dia ? dayItems(dia).length : 0;
      S.estado[id] = { estado: "confirmado", dia, orden, nota: prev.nota || "" };
      render();
      api({ action: "estado", id, estado: "confirmado", dia, orden, nota: prev.nota || "" });
    }
    if (t.dataset.act === "need-done") {
      const it = S.necesarios.find(n => n.id === t.dataset.id);
      if (!it) return;
      it.listo = t.checked ? "x" : "";
      render();
      api({ action: "necesario", item: needPayload(it) });
    }
    if (t.id === "show-all") { ui.showAll = t.checked; renderMapa(); }
  });

  document.addEventListener("input", e => {
    if (e.target.id === "q") { ui.q = e.target.value; clearTimeout(renderExplorar._t); renderExplorar._t = setTimeout(renderExplorar, 180); }
  });

  document.addEventListener("submit", e => {
    const f = e.target.closest("form[data-form]");
    if (!f) return;
    e.preventDefault();
    if (!ME) { openWho(); return; }
    const fd = new FormData(f);
    const kind = f.dataset.form;

    if (kind === "extra") {
      const titulo = String(fd.get("titulo") || "").trim();
      if (!titulo) return;
      const dia = f.dataset.dia;
      const x = { id: "x-" + Math.random().toString(36).slice(2, 10), dia, titulo, nota: "Sumado por " + ME, orden: dayItems(dia).length };
      S.extras = (S.extras || []).concat([x]); render();
      api({ action: "extra", extra: x });
    }
    if (kind === "gasto") {
      const entre = fd.getAll("entre");
      if (!entre.length) { toast("Elegí entre quiénes se divide."); return; }
      const fecha = String(fd.get("fecha") || todayISO()).split("-").reverse().join("/");
      const g = { id: "g-" + Math.random().toString(36).slice(2, 10), fecha, desc: String(fd.get("desc")).trim(), cat: fd.get("cat"), monto: Number(fd.get("monto")), pago: fd.get("pago"), entre };
      if (!g.desc || !(g.monto > 0)) { toast("Completá qué fue y el monto."); return; }
      S.gastos = (S.gastos || []).concat([g]); render();
      toast("Gasto guardado.");
      api({ action: "gasto", gasto: g });
    }
    if (kind === "need") {
      const item = String(fd.get("item") || "").trim();
      if (!item) return;
      addNeed(f.dataset.cat, item);
    }
    if (kind === "need-cat") {
      const cat = String(fd.get("cat") || "").trim(), item = String(fd.get("item") || "").trim();
      if (!cat || !item) return;
      addNeed(cat, item);
    }
    if (kind === "media") {
      const url = String(fd.get("url") || "").trim();
      if (!/^https:\/\//i.test(url)) { toast("El link tiene que empezar con https://"); return; }
      const m = { mid: "tmp", id: openId, url, autor: ME };
      S.media[openId] = (S.media[openId] || []).concat([m]);
      renderDetail(openId);
      toast("Compartido con el grupo.");
      api({ action: "addMedia", id: openId, url });
    }
    if (kind === "lugar") {
      const l = { id: "u-" + Math.random().toString(36).slice(2, 10), name: String(fd.get("name")).trim(), zone: fd.get("zone"), summary: fd.get("summary"), time: fd.get("time"), price: fd.get("price"), diff: fd.get("diff"), detail: fd.get("detail"), lat: fd.get("lat"), lng: fd.get("lng"), autor: ME };
      if (!l.name) { toast("Poné el nombre del lugar."); return; }
      S.lugares = (S.lugares || []).concat([l]); allPlaces._v = null;
      closeSheet(); render();
      toast("Lugar agregado. Ya se puede votar.");
      api({ action: "addLugar", lugar: l });
    }
  });

  function addNeed(cat, item) {
    const orden = (S.necesarios || []).reduce((m, n) => Math.max(m, Number(n.orden) || 0), 0) + 1;
    const n = { id: "n-" + Math.random().toString(36).slice(2, 10), categoria: cat, item, listo: "", orden };
    PEOPLE.forEach(p => { n[p] = ""; });
    S.necesarios = (S.necesarios || []).concat([n]); render();
    api({ action: "necesario", item: needPayload(n) });
  }
  function needPayload(n) {
    const o = { id: n.id, categoria: n.categoria, item: n.item, listo: !!n.listo, orden: n.orden };
    PEOPLE.forEach(p => { o[p] = !!n[p]; });
    return o;
  }

  document.addEventListener("keydown", e => { if (e.key === "Escape" && sheetMode) closeSheet(); });
  $("#btn-me").addEventListener("click", openWho);
  $("#btn-invite").addEventListener("click", openInvite);

  function route() {
    const h = location.hash.replace("#", "");
    view = ["cronograma", "explorar", "mapa", "gastos", "necesarios"].indexOf(h) >= 0 ? h : "cronograma";
    if (view !== "mapa" && map) { map.remove(); map = null; mapState = null; }
    if (S) { render(); window.scrollTo(0, 0); }
    else render();
  }
  window.addEventListener("hashchange", route);

  // refresco periódico para ver los votos de los demás
  setInterval(() => { if (document.visibilityState === "visible" && pending === 0 && C.API_URL) load(); }, 25000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && C.API_URL) load(); });

  renderCountdown();
  route();
  load();
})();
