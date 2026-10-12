/**
 * Backend del planificador "Córdoba 2026".
 * Va pegado en la planilla: Extensiones → Apps Script.
 * Implementar → Nueva implementación → Aplicación web
 *   Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona
 * Copiá la URL que termina en /exec y pegala en config.js (API_URL).
 *
 * Hojas que usa:
 *   "Actividades disponibles"  catálogo (solo lectura)
 *   "Cronograma Final"         se reescribe con lo que decidan en la app
 *   "Gastos"                   gastos cargados en la app
 *   "Necesarios"               la lista se reescribe desde la fila 7 (no toca "Datos importantes")
 *   app_*                      hojas ocultas con los datos de la app
 */

const PEOPLE = ['Javi', 'Bel', 'Facu', 'Anto'];
const TRIP_START = [2026, 11, 25]; // año, mes (0 = enero), día
const TRIP_END = [2027, 0, 7];

const T = {
  votos: ['id', 'Javi', 'Bel', 'Facu', 'Anto'],
  estado: ['id', 'estado', 'dia', 'orden', 'nota'],
  lugares: ['id', 'name', 'zone', 'time', 'diff', 'price', 'detail', 'summary', 'lat', 'lng', 'autor', 'fecha'],
  media: ['mid', 'id', 'url', 'autor', 'fecha'],
  necesarios: ['id', 'categoria', 'item', 'Javi', 'Bel', 'Facu', 'Anto', 'listo', 'orden'],
  extras: ['id', 'dia', 'titulo', 'nota', 'orden'],
  propuesta: ['texto', 'fecha', 'plan']
};
const GASTOS_H = ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Pagó', 'Entre', 'ID'];

// ---------- HTTP ----------

function doGet() {
  return out_(getState_());
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return out_({ error: 'JSON inválido' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    handle_(body);
  } catch (err) {
    return out_({ error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
  return out_(getState_());
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Acciones ----------

function handle_(b) {
  const who = String(b.persona || '');
  const needsPerson = ['vote', 'addLugar', 'addMedia', 'gasto'];
  if (needsPerson.indexOf(b.action) >= 0 && PEOPLE.indexOf(who) < 0) throw new Error('Persona desconocida');

  switch (b.action) {
    case 'vote': {
      const id = str_(b.id, 120);
      const v = Number(b.valor);
      const rows = readRows_('votos');
      const row = rows.find(function (r) { return r.id === id; }) || { id: id };
      row[who] = v === 1 || v === -1 ? v : '';
      upsert_('votos', row);
      break;
    }
    case 'estado': {
      upsert_('estado', cleanEstado_(b));
      renderCrono_();
      break;
    }
    case 'estadoBatch': {
      (b.items || []).slice(0, 200).forEach(function (it) { upsert_('estado', cleanEstado_(it)); });
      renderCrono_();
      break;
    }
    case 'addLugar': {
      const l = b.lugar || {};
      const lat = Number(l.lat), lng = Number(l.lng);
      upsert_('lugares', {
        id: str_(l.id, 120) || ('u-' + Utilities.getUuid().slice(0, 8)),
        name: str_(l.name, 120), zone: str_(l.zone, 80), time: str_(l.time, 120),
        diff: str_(l.diff, 20), price: str_(l.price, 120), detail: str_(l.detail, 1500),
        summary: str_(l.summary, 600),
        lat: isFinite(lat) && lat ? lat : '', lng: isFinite(lng) && lng ? lng : '',
        autor: who, fecha: now_()
      });
      break;
    }
    case 'delLugar': deleteRow_('lugares', str_(b.id, 120)); break;
    case 'addMedia': {
      const url = str_(b.url, 800);
      if (!/^https:\/\//i.test(url)) throw new Error('El link tiene que empezar con https://');
      upsert_('media', { mid: 'm-' + Utilities.getUuid().slice(0, 8), id: str_(b.id, 120), url: url, autor: who, fecha: now_() });
      break;
    }
    case 'delMedia': deleteRow_('media', str_(b.mid, 40)); break;
    case 'gasto': upsertGasto_(b.gasto || {}, who); break;
    case 'delGasto': deleteGasto_(str_(b.id, 40)); break;
    case 'necesario': {
      const n = b.item || {};
      const row = { id: str_(n.id, 40) || ('n-' + Utilities.getUuid().slice(0, 8)), categoria: str_(n.categoria, 60) || 'Varios', item: str_(n.item, 120), listo: n.listo ? 'x' : '', orden: Number(n.orden) || 0 };
      PEOPLE.forEach(function (p) { row[p] = n[p] ? 'x' : ''; });
      upsert_('necesarios', row);
      renderNecesarios_();
      break;
    }
    case 'delNecesario': deleteRow_('necesarios', str_(b.id, 40)); renderNecesarios_(); break;
    case 'extra': {
      const x = b.extra || {};
      upsert_('extras', { id: str_(x.id, 40) || ('x-' + Utilities.getUuid().slice(0, 8)), dia: str_(x.dia, 10), titulo: str_(x.titulo, 120), nota: str_(x.nota, 300), orden: Number(x.orden) || 0 });
      renderCrono_();
      break;
    }
    case 'delExtra': deleteRow_('extras', str_(b.id, 40)); renderCrono_(); break;
    default: throw new Error('Acción desconocida');
  }
}

function cleanEstado_(b) {
  const est = ['confirmado', 'descartado', ''].indexOf(b.estado) >= 0 ? b.estado : '';
  return { id: str_(b.id, 120), estado: est, dia: str_(b.dia, 10), orden: Number(b.orden) || 0, nota: str_(b.nota, 300) };
}

// ---------- Estado completo ----------

function getState_() {
  const cat = getCatalog_();
  const votes = {};
  readRows_('votos').forEach(function (r) {
    const v = {};
    PEOPLE.forEach(function (p) { if (r[p] !== '') v[p] = Number(r[p]); });
    votes[r.id] = v;
  });
  const estado = {};
  readRows_('estado').forEach(function (r) { estado[r.id] = { estado: r.estado, dia: r.dia, orden: Number(r.orden) || 0, nota: r.nota }; });
  const media = {};
  readRows_('media').forEach(function (r) { (media[r.id] = media[r.id] || []).push(r); });
  const prop = readRows_('propuesta')[0] || null;
  return {
    people: PEOPLE,
    days: days_(),
    catalog: cat.items,
    tips: cat.tips,
    lugares: readRows_('lugares'),
    votes: votes,
    estado: estado,
    media: media,
    gastos: readGastos_(),
    necesarios: readRows_('necesarios'),
    extras: readRows_('extras'),
    propuesta: prop,
    ts: Date.now()
  };
}

// Lee "Actividades disponibles": filas de zona (seguidas de "Actividad"), subsecciones y actividades.
function getCatalog_() {
  const s = ss_().getSheetByName('Actividades disponibles');
  const items = [], tips = {}, used = {};
  if (!s) return { items: items, tips: tips };
  const v = s.getRange(1, 2, s.getLastRow(), 5).getDisplayValues();
  let zone = null, sub = '';
  for (let i = 0; i < v.length; i++) {
    const r = v[i];
    const a = String(r[0]).trim();
    const rest = r.slice(1).some(function (x) { return String(x).trim() !== ''; });
    if (!a) continue;
    if (a === 'Actividad') continue;
    const next = v[i + 1] ? String(v[i + 1][0]).trim() : '';
    if (!rest) {
      if (next === 'Actividad') { zone = a; sub = ''; continue; }
      if (!zone) continue;
      if (/tener en cuenta/i.test(a)) continue;
      if (a.length > 70) { (tips[zone] = tips[zone] || []).push(a); continue; }
      sub = a;
      continue;
    }
    if (!zone) continue;
    let id = slug_(zone + ' ' + a);
    if (used[id]) id += '-' + i;
    used[id] = 1;
    items.push({ id: id, name: a, zone: zone, sub: sub, time: r[1], diff: r[2], price: r[3], detail: r[4] });
  }
  return { items: items, tips: tips };
}

// ---------- Hojas visibles ----------

// La hoja es una tabla de Google con columnas tipadas: si algo no encaja, la app sigue guardando igual.
function renderCrono_() { try { renderCronoImpl_(); } catch (e) { console.error('Cronograma Final: ' + e); } }
function renderNecesarios_() { try { renderNecesariosImpl_(); } catch (e) { console.error('Necesarios: ' + e); } }

function renderCronoImpl_() {
  const s = ss_().getSheetByName('Cronograma Final');
  if (!s) return;
  const names = {};
  getCatalog_().items.forEach(function (c) { names[c.id] = c; });
  readRows_('lugares').forEach(function (l) { names[l.id] = l; });
  const votes = {};
  readRows_('votos').forEach(function (r) { votes[r.id] = PEOPLE.filter(function (p) { return Number(r[p]) === 1; }); });
  const byDay = {};
  readRows_('estado').forEach(function (e) {
    if (e.estado !== 'confirmado' || !e.dia || !names[e.id]) return;
    (byDay[e.dia] = byDay[e.dia] || []).push({
      orden: Number(e.orden) || 0,
      row: [names[e.id].name, names[e.id].zone || '', 'Actividad', (votes[e.id] || []).join(', '), e.nota || names[e.id].time || '']
    });
  });
  readRows_('extras').forEach(function (x) {
    if (!x.dia) return;
    (byDay[x.dia] = byDay[x.dia] || []).push({ orden: Number(x.orden) || 0, row: [x.titulo, '', '', PEOPLE.join(', '), x.nota] });
  });
  const out = [];
  days_().forEach(function (d) {
    const list = (byDay[d] || []).sort(function (a, b) { return a.orden - b.orden; });
    const p = d.split('-').map(Number);
    const f = new Date(p[0], p[1] - 1, p[2]);
    if (!list.length) out.push([f, '', '', '', '', '', '']);
    list.forEach(function (it) { out.push([f, '', it.row[0], it.row[1], it.row[2], it.row[3], it.row[4]]); });
  });
  const last = Math.max(s.getLastRow(), 2);
  s.getRange(2, 1, last, 7).clearContent();
  s.getRange(1, 1, 1, 7).setValues([['Fecha de inicio', 'Fecha de finalización', 'Actividad', 'Ubicación', 'Categoría', 'Personas', 'Notas']]);
  s.getRange(2, 1, out.length, 7).setValues(out);
}

function renderNecesariosImpl_() {
  const s = ss_().getSheetByName('Necesarios');
  if (!s) return;
  const rows = readRows_('necesarios').sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0); });
  const cats = [];
  const byCat = {};
  rows.forEach(function (r) {
    if (!byCat[r.categoria]) { byCat[r.categoria] = []; cats.push(r.categoria); }
    byCat[r.categoria].push(r);
  });
  const out = [['Lista de cosas necesarias', '', '', '', '', ''], ['Necesitamos', 'Javi', 'Bel', 'Facu', 'Anto', 'Listo']];
  cats.forEach(function (c) {
    out.push(['', '', '', '', '', '']);
    out.push([c, '', '', '', '', '']);
    byCat[c].forEach(function (r) { out.push([r.item, r.Javi, r.Bel, r.Facu, r.Anto, r.listo ? '✓' : '']); });
  });
  const last = Math.max(s.getLastRow(), 7);
  s.getRange(7, 1, last, 6).clearContent();
  s.getRange(7, 1, out.length, 6).setValues(out);
}

// ---------- Gastos (hoja visible "Gastos") ----------

function gastosSheet_() {
  let s = ss_().getSheetByName('Gastos');
  if (!s) s = ss_().insertSheet('Gastos');
  const h = s.getRange(1, 1, 1, GASTOS_H.length).getDisplayValues()[0];
  if (h.join('|') !== GASTOS_H.join('|')) {
    s.clearContents();
    s.getRange(1, 1, 1, GASTOS_H.length).setValues([GASTOS_H]);
    s.setFrozenRows(1);
    s.getRange('A:A').setNumberFormat('@');
    s.getRange('D:D').setNumberFormat('#,##0.00');
  }
  return s;
}

function readGastos_() {
  const s = gastosSheet_();
  const last = s.getLastRow();
  if (last < 2) return [];
  const disp = s.getRange(2, 1, last - 1, 7).getDisplayValues();
  const raw = s.getRange(2, 4, last - 1, 1).getValues();
  return disp.map(function (r, i) {
    return { fecha: r[0], desc: r[1], cat: r[2], monto: Number(raw[i][0]) || 0, pago: r[4], entre: r[5] ? r[5].split(/\s*,\s*/) : PEOPLE.slice(), id: r[6] };
  }).filter(function (g) { return g.id; });
}

function upsertGasto_(g, who) {
  const s = gastosSheet_();
  const id = str_(g.id, 40) || ('g-' + Utilities.getUuid().slice(0, 8));
  const pago = PEOPLE.indexOf(g.pago) >= 0 ? g.pago : who;
  const entre = (g.entre || PEOPLE).filter(function (p) { return PEOPLE.indexOf(p) >= 0; });
  const row = [str_(g.fecha, 10), str_(g.desc, 160), str_(g.cat, 40), Number(g.monto) || 0, pago, (entre.length ? entre : PEOPLE).join(', '), id];
  const last = s.getLastRow();
  const ids = last >= 2 ? s.getRange(2, 7, last - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  const i = ids.indexOf(id);
  if (i >= 0) s.getRange(i + 2, 1, 1, 7).setValues([row]);
  else s.appendRow(row);
}

function deleteGasto_(id) {
  const s = gastosSheet_();
  const last = s.getLastRow();
  if (last < 2) return;
  const ids = s.getRange(2, 7, last - 1, 1).getDisplayValues().map(function (r) { return r[0]; });
  const i = ids.indexOf(id);
  if (i >= 0) s.deleteRow(i + 2);
}

// ---------- Hojas ocultas app_* ----------

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sh_(name) {
  const n = 'app_' + name;
  let s = ss_().getSheetByName(n);
  if (!s) {
    s = ss_().insertSheet(n);
    s.getRange('A:Z').setNumberFormat('@');
    s.getRange(1, 1, 1, T[name].length).setValues([T[name]]);
    s.hideSheet();
    seed_(name, s);
  }
  return s;
}

function readRows_(name) {
  const s = sh_(name);
  const h = T[name];
  const last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, h.length).getDisplayValues()
    .filter(function (r) { return r.some(function (c) { return c !== ''; }); })
    .map(function (r) { const o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
}

function upsert_(name, obj) {
  const s = sh_(name);
  const h = T[name];
  const key = h[0];
  const last = s.getLastRow();
  const keys = last >= 2 ? s.getRange(2, 1, last - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  const i = keys.indexOf(String(obj[key]));
  const row = h.map(function (k) { return obj[k] === undefined || obj[k] === null ? '' : String(obj[k]); });
  if (i >= 0) s.getRange(i + 2, 1, 1, h.length).setValues([row]);
  else s.getRange(last + 1, 1, 1, h.length).setValues([row]);
}

function deleteRow_(name, id) {
  const s = sh_(name);
  const last = s.getLastRow();
  if (last < 2) return;
  const keys = s.getRange(2, 1, last - 1, 1).getDisplayValues().map(function (r) { return r[0]; });
  const i = keys.indexOf(id);
  if (i >= 0) s.deleteRow(i + 2);
}

// Datos iniciales la primera vez que se crea cada hoja oculta
function seed_(name, s) {
  if (name === 'extras') {
    const rows = [
      ['x-llegada', '2026-12-25', 'Llegada al aeropuerto', 'Viaje', '0'],
      ['x-aloja', '2026-12-25', 'Check-in en el alojamiento', 'Comida, caminata y descanso', '1'],
      ['x-vuelta', '2027-01-07', 'Vuelta', '', '9']
    ];
    s.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  if (name === 'necesarios') {
    // Importa la lista que ya está en la hoja "Necesarios" (desde la fila 10)
    const vis = ss_().getSheetByName('Necesarios');
    if (!vis) return;
    const v = vis.getRange(1, 1, vis.getLastRow(), 5).getDisplayValues();
    const known = ['Cuidado corporal', 'Para acampar', 'Juegos', 'Documentos / basicos', 'Valija'];
    let cat = '', n = 0;
    const rows = [];
    v.slice(9).forEach(function (r) {
      const a = String(r[0]).trim();
      if (!a) return;
      if (known.indexOf(a) >= 0) { cat = a; return; }
      if (!cat) return;
      n++;
      rows.push(['n-' + n, cat, a, r[1] ? 'x' : '', r[2] ? 'x' : '', r[3] ? 'x' : '', r[4] ? 'x' : '', '', String(n)]);
    });
    if (rows.length) s.getRange(2, 1, rows.length, 9).setValues(rows);
  }
}

// ---------- Utilidades ----------

function days_() {
  const out = [];
  let t = Date.UTC(TRIP_START[0], TRIP_START[1], TRIP_START[2]);
  const end = Date.UTC(TRIP_END[0], TRIP_END[1], TRIP_END[2]);
  while (t <= end) { out.push(new Date(t).toISOString().slice(0, 10)); t += 86400000; }
  return out;
}

function fmtDay_(iso) {
  const p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function now_() {
  return Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');
}

function str_(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200);
}

function slug_(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

// Correlo una vez a mano desde el editor para crear las hojas y dar permisos.
function setup() {
  Object.keys(T).forEach(sh_);
  gastosSheet_();
  renderCrono_();
  renderNecesarios_();
}
