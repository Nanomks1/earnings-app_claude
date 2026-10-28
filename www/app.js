const KEY = 'earnings_v1';
const BK_DIR = 'EarningsBackup';
const AUTO_NAME = 'earnings-backup.json';
const DEF_RATE = 10;
const DEF_COLOR = '#2c6e69';
const PALETTE = ['#2c6e69', '#3d6a8f', '#4a7c59', '#6b5b95', '#a0623a', '#a14d63', '#4b5563', '#7a6a3a', '#ff5a5f', '#29a9e8', '#8bc34a', '#5c6bc0'];
let sysCol = ''; try { sysCol = localStorage.getItem('earnings_syscol') || ''; } catch (e) {}
const WD = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

// مخطط الإعدادات: مكان واحد لكل إعداد (القيمة الافتراضية + التحقق). أي إعداد جديد يُضاف هنا فقط.
const SETTINGS = {
  currency: { def: 'DH', fix: v => typeof v === 'string' ? v : 'DH' },
  rate: { def: DEF_RATE, fix: v => Number(v) > 0 ? Number(v) : DEF_RATE },
  auto: { def: true, fix: v => v !== false },
  pin: { def: '', fix: v => typeof v === 'string' ? v : '' },
  bio: { def: false, fix: v => v === true },
  search: { def: true, fix: v => v !== false },
  color: { def: DEF_COLOR, fix: v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : DEF_COLOR },
  forgetH: { def: 12, fix: v => v === undefined ? 12 : Math.max(0, Math.min(48, Math.round(Number(v)) || 0)) },
  fsv: { def: 100, fix: v => Math.max(85, Math.min(140, Math.round(Number(v)) || 100)) },
  sys: { def: false, fix: v => v === true },
  lockAfter: { def: 60, fix: v => [0, 30, 60, 300].includes(Number(v)) ? Number(v) : 60 },
  trashAuto: { def: true, fix: v => v !== false },
  font: { def: 0, fix: v => Number(v) === 1 ? 1 : 0 },
  secure: { def: false, fix: v => v === true }
};
// تفضيلات الجهاز التي تدخل النسخة الاحتياطية (مظهر الودجت، شكل الأيقونة، خيار التفصيل في المشاركة)
const PREFS_DEF = () => ({ wg: { bg: 0, fg: 0, ic: 0, label: true, on: true, total: true }, ic: { style: 'a', follow: true }, sd: true });
const inSet = (v, a) => a.includes(Number(v)) ? Number(v) : 0;
function normPrefs(p) {
  const o = PREFS_DEF(); if (!p || typeof p !== 'object') return o;
  const w = p.wg && typeof p.wg === 'object' ? p.wg : {}, c = p.ic && typeof p.ic === 'object' ? p.ic : {};
  o.wg = { bg: inSet(w.bg, [0, 1, 2, 3]), fg: inSet(w.fg, [0, 1, 2]), ic: inSet(w.ic, [0, 1, 2]), label: w.label !== false, on: w.on !== false, total: w.total !== false };
  o.ic = { style: ['a', 'b', 'c'].includes(c.style) ? c.style : 'a', follow: c.follow !== false };
  o.sd = p.sd !== false;
  return o;
}
function norm(d) {
  const s = { v: 5, items: [], archive: [], trash: [], carry: 0, open: null, prefs: normPrefs(d && d.prefs) };
  for (const k in SETTINGS) s[k] = SETTINGS[k].def;
  if (!d || typeof d !== 'object') return s;
  for (const k in SETTINGS) s[k] = SETTINGS[k].fix(d[k]);
  if (d.fsv === undefined && [1, 2].includes(Number(d.fs))) s.fsv = Number(d.fs) === 1 ? 113 : 116; // ترحيل من الخطوات القديمة
  s.carry = Number(d.carry) || 0;
  if (d.open && d.open.date && d.open.start) {
    s.open = { date: d.open.date, start: d.open.start };
    const b = Math.round((Number(d.open.brk) || 0) * 100) / 100, bs = Number(d.open.bs) || 0;
    if (b > 0) s.open.brk = b;
    if (bs > 0) s.open.bs = bs;
  }
  const fix = i => {
    const o = { ...i };
    if (o.type !== 'work') { o.type = 'adv'; o.amount = Number(o.amount) || 0; delete o.remote; return o; }
    if (o.remote === undefined) {
      const m = /^\s*عن\s+بعد(?:\s*[:\-–—]\s*|\s+|$)(.*)$/.exec(String(o.note || ''));
      if (m) { o.remote = true; o.note = m[1].trim(); } else o.remote = false;
    } else o.remote = !!o.remote;
    if (o.remote) { // العمل عن بعد: أجرة ثابتة وليس ساعات
      const a = Number(o.amount);
      o.amount = isFinite(a) && a > 0 ? a : (Number(o.mins) || 0) / 60 * (Number(o.rate) > 0 ? Number(o.rate) : DEF_RATE);
      o.mins = 0; delete o.rate; delete o.start; delete o.end; delete o.brk;
    } else {
      o.mins = Number(o.mins) || 0;
      o.rate = Number(o.rate) > 0 ? Number(o.rate) : DEF_RATE;
      o.amount = o.mins / 60 * o.rate;
    }
    return o;
  };
  s.items = (Array.isArray(d.items) ? d.items : []).map(fix);
  s.archive = (Array.isArray(d.archive) ? d.archive : []).map(a => ({ ...a, items: (a.items || []).map(fix) }));
  s.trash = (Array.isArray(d.trash) ? d.trash : []).filter(t => t && t.id).map(t => { const o = fix(t); o.delAt = Number(t.delAt) || 0; return o; });
  return s;
}
let state;
function legacyPrefs() { // ترحيل لمرة واحدة من المفاتيح القديمة المنفصلة
  const rd = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const ic = rd('earnings_icon') || {};
  return normPrefs({ wg: rd('earnings_wg2'), ic: { style: ic.style, follow: ic.follow }, sd: localStorage.getItem('earnings_sd') !== '0' });
}
try { const raw = JSON.parse(localStorage.getItem(KEY)); state = norm(raw); if (!raw || !raw.prefs) state.prefs = legacyPrefs(); } catch (e) { state = norm(null); }
let bk = {};
try { bk = JSON.parse(localStorage.getItem('earnings_bk')) || {}; } catch (e) {}
const saveBk = () => localStorage.setItem('earnings_bk', JSON.stringify(bk));
let enc = {};
try { enc = JSON.parse(localStorage.getItem('earnings_enc')) || {}; } catch (e) {}
const saveEnc = () => localStorage.setItem('earnings_enc', JSON.stringify(enc));
let editing = null, mode = 'work', view = 'list', fromShift = false, sumMode = 'cur';
let fq = '', ft = 'all', fT;
const nz = s => String(s || '').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const kind = i => i.type === 'adv' ? 'adv' : i.remote ? 'remote' : 'work';
const isFlt = () => !!fq || ft !== 'all';
const match = i => (ft === 'all' || kind(i) === ft) && (!fq || nz(i.note).includes(fq));

const $ = id => document.getElementById(id);
const isNative = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
const plugin = n => isNative() ? Capacitor.Plugins[n] : null;
let _saf;
const saf = () => {
  if (!isNative()) return null;
  if (!_saf) { try { _saf = Capacitor.registerPlugin ? Capacitor.registerPlugin('SafBackup') : Capacitor.Plugins.SafBackup; } catch (e) { _saf = Capacitor.Plugins.SafBackup || null; } }
  return _saf;
};
const ic = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
const ltr = s => '\u2066' + s + '\u2069';
const num = n => Number(n).toLocaleString('en', { maximumFractionDigits: 2 });
const cur = () => state.currency ? ' ' + state.currency : '';
const money = n => ltr(num(n) + cur());
const signed = n => ltr((n < 0 ? '−' : '') + num(Math.abs(n)) + cur());
const round2 = n => Math.round(n * 100) / 100;
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const today = () => iso(new Date());
const nowTime = () => { const d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const dt = s => new Date(s + 'T00:00');
const fmtDate = s => dt(s).toLocaleDateString('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = s => dt(s).toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDay = s => dt(s).toLocaleDateString('ar-u-nu-latn', dt(s).getFullYear() === new Date().getFullYear() ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const unit = (n, one, two, few) => n === 1 ? one : n === 2 ? two : n + ' ' + (n <= 10 ? few : one);
const fmtDur = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return [h ? unit(h, 'ساعة', 'ساعتان', 'ساعات') : '', r ? unit(r, 'دقيقة', 'دقيقتان', 'دقائق') : ''].filter(Boolean).join(' و ') || '—'; };
const fmtHM = m => { m = Math.round(m); return Math.floor(m / 60) + ':' + pad2(m % 60); };
const toast = t => { // popover: يظهر فوق النوافذ المفتوحة أيضًا
  const e = $('toast'); e.textContent = t;
  try { if (e.showPopover) { try { e.hidePopover(); } catch (x) {} e.showPopover(); } } catch (x) {}
  e.classList.add('on'); clearTimeout(toast.t); clearTimeout(toast.h);
  toast.t = setTimeout(() => {
    e.classList.remove('on');
    toast.h = setTimeout(() => { try { if (e.hidePopover) e.hidePopover(); } catch (x) {} }, 300);
  }, 3200);
};

function calc(items) {
  const o = { work: 0, adv: 0, mins: 0, ramt: 0, days: 0, wd: 0 }, ds = new Set(), dh = new Set();
  items.forEach(i => {
    if (i.type === 'work') { o.work += i.amount; o.mins += i.mins; if (i.remote) o.ramt += i.amount; else if (i.mins > 0) dh.add(i.date); ds.add(i.date); }
    else o.adv += i.amount;
  });
  o.days = ds.size; o.wd = dh.size;
  return o;
}
const due = () => { const c = calc(state.items); return state.carry + c.work - c.adv; };

let bkTimer;
let undoT;
function hideUndo() { const e = $('undoBar'); e.classList.remove('on'); e._fn = null; clearTimeout(undoT); try { if (e.hidePopover) e.hidePopover(); } catch (x) {} }
function undoBar(msg, fn) {
  const e = $('undoBar'); $('undoMsg').textContent = msg; e._fn = fn;
  try { if (e.showPopover) { try { e.hidePopover(); } catch (x) {} e.showPopover(); } } catch (x) {}
  e.classList.add('on'); clearTimeout(undoT); undoT = setTimeout(hideUndo, 7000);
}
$('undoBtn').onclick = () => { const f = $('undoBar')._fn; hideUndo(); if (f) f(); };

function savePrefs() { // حفظ التفضيلات مع الحالة (فتدخل النسخة الاحتياطية)
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  if (state.auto) { clearTimeout(bkTimer); bkTimer = setTimeout(autoBackup, 800); }
}
function save(noBackup) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('تعذّر الحفظ: مساحة التخزين ممتلئة. أفرغ السلة أو صدّر نسخة احتياطية'); }
  render(); syncWidget();
  if (state.auto && !noBackup) { clearTimeout(bkTimer); bkTimer = setTimeout(autoBackup, 800); }
}

// ---------- الألوان وشريط الحالة ----------
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = a => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const isDark = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
const effColor = () => (state.sys && /^#[0-9a-f]{6}$/i.test(sysCol)) ? sysCol : (state.color || DEF_COLOR);
let customOk = false, customLabel = '', customFonts = [];
const CUSTOM_FAMILY = 'WorkCustom';
function applyTheme() {
  const base = effColor(), dark = isDark(), [r, g, b] = hex2rgb(base);
  const pri = dark ? mix(base, '#000000', .3) : base;
  const root = document.documentElement.style, set = (k, v) => root.setProperty(k, v);
  set('--pri', pri);
  set('--fs', (state.fsv || 100) / 100);
  set('--ff', state.font === 1 && customOk ? '"' + CUSTOM_FAMILY + '",system-ui,"Noto Sans Arabic","Segoe UI",Tahoma,sans-serif' : '');
  try { applySecure(); } catch (e) {}
  set('--pri2', dark ? mix(base, '#000000', .55) : mix(base, '#ffffff', .22));
  set('--onpri', lum(pri) > .5 ? '#10201f' : '#ffffff');
  set('--pritx', dark ? mix(base, '#ffffff', .45) : base);
  set('--tint', `rgba(${r},${g},${b},${dark ? .24 : .12})`);
  set('--prish', dark ? 'none' : `0 12px 24px -10px rgba(${r},${g},${b},.55)`);
  const SB = plugin('StatusBar');
  if (SB) { try { SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' }); } catch (e) {} }
  try { iconSync(); } catch (e) {}
}
if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) {} }
function buildSwatches() {
  const sysB = sysCol ? `<button data-sys="1" style="background:linear-gradient(135deg,${sysCol} 55%,${mix(sysCol, '#ffffff', .6)} 55%)" class="${state.sys ? 'sel' : ''}" aria-label="ألوان النظام"></button>` : '';
  $('sw').innerHTML = sysB + PALETTE.map(c => `<button data-c="${c}" style="background:${c}" class="${!state.sys && c.toLowerCase() === state.color.toLowerCase() ? 'sel' : ''}" aria-label="لون"></button>`).join('')
    + `<button data-custom="1" class="cust ${!state.sys && !PALETTE.some(c => c.toLowerCase() === state.color.toLowerCase()) ? 'sel' : ''}" aria-label="لون مخصص"></button>`
    + (sysCol ? `<div class="hint" style="width:100%;margin:8px 0 0">الدائرة الأولى: ألوان النظام (تتبع الخلفية)${state.sys ? ' — مفعّلة' : ''}</div>` : '');
}
$('sw').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.custom) return openCp();
  if (b.dataset.sys) state.sys = true; else { state.sys = false; state.color = b.dataset.c; }
  applyTheme(); buildSwatches(); localStorage.setItem(KEY, JSON.stringify(state));
};
// ---------- منتقي اللون المخصص (درجة اللون / التشبّع / السطوع + HEX) ----------
function hsv2hex(h, s, v) {
  s /= 100; v /= 100;
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return rgb2hex([f(5) * 255, f(3) * 255, f(1) * 255]);
}
function hex2hsv(hex) {
  const [r, g, b] = hex2rgb(hex).map(x => x / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0; if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60) % 360, mx ? Math.round(d / mx * 100) : 0, Math.round(mx * 100)];
}
function cpRender(fromHex) {
  const h = +$('cpH').value, s = +$('cpS').value, v = +$('cpV').value, hex = hsv2hex(h, s, v);
  $('cpPrev').style.background = hex;
  $('cpS').style.background = `linear-gradient(90deg,${hsv2hex(h, 0, v)},${hsv2hex(h, 100, v)})`;
  $('cpV').style.background = `linear-gradient(90deg,${hsv2hex(h, s, 0)},${hsv2hex(h, s, 100)})`;
  if (!fromHex) $('cpHex').value = hex.slice(1).toUpperCase();
}
function openCp() {
  const c = effColor(), [h, s, v] = hex2hsv(/^#[0-9a-f]{6}$/i.test(c) ? c : DEF_COLOR);
  $('cpH').value = h; $('cpS').value = s; $('cpV').value = v; cpRender();
  $('colDlg').showModal();
}
['cpH', 'cpS', 'cpV'].forEach(id => { $(id).oninput = () => cpRender(); });
$('cpHex').oninput = () => {
  const t = $('cpHex').value.replace(/[^0-9a-f]/gi, '').slice(0, 6); $('cpHex').value = t.toUpperCase();
  if (t.length === 6) { const [h, s, v] = hex2hsv('#' + t); $('cpH').value = h; $('cpS').value = s; $('cpV').value = v; cpRender(true); }
};
$('cpCancel').onclick = () => $('colDlg').close();
$('cpOk').onclick = () => {
  const t = $('cpHex').value;
  state.sys = false; state.color = /^[0-9a-f]{6}$/i.test(t) ? '#' + t.toLowerCase() : hsv2hex(+$('cpH').value, +$('cpS').value, +$('cpV').value);
  applyTheme(); buildSwatches(); localStorage.setItem(KEY, JSON.stringify(state)); $('colDlg').close();
};
async function refreshSysColor() {
  const P = nplug('AppIcon'); if (!P || !P.sysColor) return;
  try {
    const h = String((await P.sysColor()).hex || '').toLowerCase();
    const ok = /^#[0-9a-f]{6}$/.test(h) ? h : '';
    if (ok !== sysCol) { sysCol = ok; try { localStorage.setItem('earnings_syscol', ok); } catch (e) {} buildSwatches(); if (state.sys) applyTheme(); }
  } catch (e) {}
}

// ---------- العرض ----------
const monday = s => { const d = dt(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
function weekLabel(ms) {
  const a = dt(ms), e = new Date(a); e.setDate(e.getDate() + 6);
  const mn = d => d.toLocaleDateString('ar-u-nu-latn', { month: 'long' });
  return 'أسبوع ' + a.getDate() + (a.getMonth() !== e.getMonth() ? ' ' + mn(a) : '') + ' – ' + e.getDate() + ' ' + mn(e);
}
function itemRow(i) {
  const neg = i.type === 'adv';
  const t = i.start && i.end ? `<span dir="ltr">${i.start} – ${i.end}</span> • ` : '';
  const sub = neg ? 'كريدي' : i.remote ? 'عن بعد' : t + fmtDur(i.mins) + (i.brk ? ' (استراحة ' + i.brk + ' د)' : '');
  return `<button class="item" data-id="${i.id}"><span class="bub ${neg ? 'neg' : ''}">${ic(neg ? 'minus' : i.remote ? 'home' : 'clock')}</span>
    <div><div class="d">${fmtDay(i.date)}</div><div class="m">${sub}${i.note ? ' • ' + esc(i.note) : ''}</div></div>
    <div class="amt num ${neg ? 'n' : 'p'}">${neg ? '−' : ''}${money(i.amount)}</div></button>`;
}
function emptyBox(icon, text) { return `<div class="empty"><span class="bub">${ic(icon)}</span><div>${text}</div></div>`; }

function renderFltRes() {
  const box = $('fRes');
  $('flt').hidden = state.search === false || view === 'sum';
  $('qClr').hidden = !fq;
  if (!isFlt()) { box.hidden = true; return; }
  const m = (view === 'arc' ? state.archive.flatMap(a => a.items) : state.items).filter(match), c = calc(m);
  box.hidden = false;
  box.innerHTML = `<span>${unit(m.length, 'نتيجة', 'نتيجتان', 'نتائج')}</span><b class="num">${signed(c.work - c.adv)}</b>`;
}
$('q').oninput = () => { clearTimeout(fT); fT = setTimeout(() => { fq = nz($('q').value.trim()); render(); }, 150); };
$('q').onkeydown = e => { if (e.key === 'Enter') $('q').blur(); };
$('qClr').onclick = () => { $('q').value = ''; fq = ''; render(); $('q').focus(); };
$('srchChk').onchange = () => {
  state.search = $('srchChk').checked;
  if (!state.search) { clearTimeout(fT); fq = ''; ft = 'all'; $('q').value = ''; [...$('fSeg').children].forEach(x => x.classList.toggle('on', x.dataset.t === 'all')); }
  save(); render();
};
$('fSeg').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  ft = b.dataset.t; [...$('fSeg').children].forEach(x => x.classList.toggle('on', x === b)); render();
};

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+@\t\r-]/.test(s) && isNaN(Number(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvText() {
  const all = [];
  state.archive.forEach(a => a.items.forEach(i => all.push([i, 'دفعة ' + a.paidAt])));
  state.items.forEach(i => all.push([i, 'الحالية']));
  all.sort((x, y) => x[0].date.localeCompare(y[0].date) || x[0].id - y[0].id);
  const rows = [['التاريخ', 'النوع', 'البداية', 'النهاية', 'استراحة (دقيقة)', 'المدة (ساعة)', 'المبلغ' + (state.currency ? ' (' + state.currency + ')' : ''), 'ملاحظة', 'الفترة']];
  all.forEach(([i, per]) => rows.push([i.date, i.type === 'adv' ? 'كريدي' : i.remote ? 'عن بعد' : 'عمل', i.start || '', i.end || '', i.brk || '', i.type === 'work' && !i.remote ? round2(i.mins / 60) : '', round2(i.type === 'adv' ? -i.amount : i.amount), i.note || '', per]));
  return '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
$('csvBtn').onclick = async () => {
  if (!allItems().length) return toast('لا توجد سجلات للتصدير');
  const name = 'earnings-' + stamp() + '.csv', text = csvText(), FS = plugin('Filesystem'), S = plugin('Share');
  try {
    if (FS && S) {
      await FS.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      const u = await FS.getUri({ path: name, directory: 'CACHE' });
      await S.share({ title: 'العمل', url: u.uri, dialogTitle: 'تصدير CSV' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch (e) { if (!/cancel/i.test(String((e && e.message) || e))) toast('تعذر التصدير'); }
};

function render() {
  const c = calc(state.items);
  $('total').textContent = signed(due());
  const cells = [['الأجور', money(c.work)], ['الكريدي', signed(-c.adv)]];
  if (state.carry) cells.push(['مرحَّل', signed(state.carry)]);
  $('mini').style.setProperty('--n', cells.length);
  $('mini').innerHTML = cells.map(([k, v]) => `<div><span class="k">${k}</span><span class="v num">${v}</span></div>`).join('');
  renderShift();
  const sorted = state.items.filter(match).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const groups = {};
  sorted.forEach(i => (groups[monday(i.date)] = groups[monday(i.date)] || []).push(i));
  $('list').innerHTML = sorted.length ? Object.keys(groups).sort().reverse().map(k => {
    const g = calc(groups[k]);
    return `<div class="wk"><span>${weekLabel(k)}</span><span class="r"><b class="num">${signed(g.work - g.adv)}</b><button class="wkb" data-wk="${k}" aria-label="مشاركة الأسبوع">${ic('share')}</button></span></div>` + groups[k].map(itemRow).join('');
  }).join('') : isFlt() ? emptyBox('search', 'لا توجد نتائج مطابقة.') : emptyBox('clock', 'لا توجد سجلات في الفترة الحالية.<br>سجّل دخول العمل أو أضف يومًا.');
  renderArchive();
  renderFltRes();
  renderSummary(); renderCal();
}

// ---------- دخول / خروج ----------
const OPEN_WARN = 16 * 60, LONG_MIN = 14 * 60;
const elapsedMins = () => {
  const o = state.open; if (!o) return 0;
  const m = (Date.now() - new Date(o.date + 'T' + o.start).getTime()) / 60000;
  return isNaN(m) ? 0 : Math.max(0, m);
};
// نافذة تأكيد بشكل التطبيق بدل نافذة النظام الأصلية؛ تُرجع Promise<boolean>
let askRes = null;
function ask(title, msg, o) {
  o = o || {};
  return new Promise(res => {
    if (askRes) askRes(false);
    askRes = res;
    $('askT').textContent = title; $('askM').textContent = msg || ''; $('askM').hidden = !msg;
    $('askYes').textContent = o.ok || 'متابعة'; $('askNo').textContent = o.cancel || 'رجوع';
    $('askYes').className = o.danger ? 'dg' : 'ok'; $('askNo').className = o.danger ? 'ok' : '';
    try { $('askDlg').showModal(); } catch (e) { askRes = null; res(false); }
  });
}
function askDone(v) { const r = askRes; askRes = null; if ($('askDlg').open) $('askDlg').close(); if (r) r(v); }
$('askYes').onclick = () => askDone(true);
$('askNo').onclick = () => askDone(false);
$('askDlg').addEventListener('close', () => { if (askRes) askDone(false); });
const brkNow = () => { const o = state.open; return o ? (o.brk || 0) + (o.bs ? Math.max(0, (Date.now() - o.bs) / 60000) : 0) : 0; }; // دقائق الاستراحة (المنتهية + الجارية)
const netMins = () => Math.max(0, elapsedMins() - brkNow());
const brkInfoText = () => { const o = state.open; return !o ? '' : o.bs ? 'في استراحة منذ ' + fmtHM(Math.max(0, (Date.now() - o.bs) / 60000)) : o.brk > 0 ? 'استراحة: ' + Math.round(o.brk) + ' د' : ''; };
function toggleBreak() {
  const o = state.open; if (!o) return;
  if (o.bs) { o.brk = Math.round(((o.brk || 0) + (Date.now() - o.bs) / 60000) * 100) / 100; delete o.bs; toast('انتهت الاستراحة'); }
  else { o.bs = Date.now(); toast('بدأت الاستراحة'); }
  save();
}
function renderShift() {
  const o = state.open;
  $('shift').innerHTML = !o
    ? `<button class="clock" id="clockIn"><span class="bub">${ic('play')}</span><span><b>تسجيل دخول العمل</b><small>اضغط عند وصولك للعمل</small></span></button>`
    : `<div class="open"><div class="top"><span class="pulse"></span><div style="flex:1"><b>أنت الآن في العمل</b><br><small>دخلت <button type="button" class="edst" id="editIn" aria-label="تعديل وقت الدخول"><span dir="ltr">${o.start}</span>${ic('edit')}</button></small>${o.bs || o.brk > 0 ? '<br><small id="brkInfo">' + brkInfoText() + '</small>' : ''}</div><div class="el num" id="elapsed">${fmtHM(netMins())}</div></div>
       ${elapsedMins() > OPEN_WARN ? '<div class="note warn" id="openWarn">مضى وقت طويل على الدخول. تأكد من وقت الخروج.</div>' : ''}
       <div class="btns"><button id="clockOut">${ic('stop')}تسجيل الخروج</button><button id="brkBtn"${o.bs ? ' class="on"' : ''}>${o.bs ? 'إنهاء الاستراحة' : 'استراحة'}</button><button id="clockCancel" aria-label="إلغاء">${ic('x')}</button></div></div>`;
}
setInterval(() => {
  const e = $('elapsed'); if (!e || !state.open) return;
  e.textContent = fmtHM(netMins());
  const bi = $('brkInfo'); if (bi) bi.textContent = brkInfoText();
  if ((elapsedMins() > OPEN_WARN) !== !!$('openWarn')) renderShift();
}, 30000);
function clockOutForm() {
  const long = elapsedMins() > 1440;
  openForm('work', null, { date: state.open.date, start: state.open.start, end: long ? '' : nowTime(), brk: Math.round(brkNow()) });
  if (long) $('fDur').textContent = 'مضى أكثر من 24 ساعة على الدخول. أدخل وقت الخروج الصحيح.';
  else if (elapsedMins() > OPEN_WARN) $('fDur').textContent += ' — مدة طويلة، راجع وقت الخروج.';
}
// اختصارات الأيقونة (ضغطة مطولة): تفتح نفس نافذتي الدخول والخروج في التطبيق للتأكيد
function doShortcut(act) {
  if (!$('lock').hidden) { pendingSc = act; return; }
  if (act === 'in') {
    if (state.open) return toast('أنت مسجّل دخول بالفعل');
    $('iDate').value = today(); $('iTime').value = nowTime(); try { $('inDlg').showModal(); } catch (e) {}
  } else if (act === 'out') {
    if (!state.open) return toast('لا توجد وردية جارية');
    clockOutForm();
  }
}
async function takeShortcut() {
  const W = nplug('WorkWidget'); if (!W || !W.takeShortcut) return;
  try { const r = await W.takeShortcut(); if (r && r.act) doShortcut(r.act); } catch (e) {}
}
$('shift').onclick = async e => {
  const id = e.target.closest('button') && e.target.closest('button').id;
  if (id === 'clockIn') { $('iDate').value = today(); $('iTime').value = nowTime(); $('inDlg').showModal(); }
  else if (id === 'clockOut') clockOutForm();
  else if (id === 'brkBtn') toggleBreak();
  else if (id === 'editIn') { $('iDate').value = state.open.date; $('iTime').value = state.open.start; $('inDlg').showModal(); }
  else if (id === 'clockCancel') { if (await ask('إلغاء تسجيل الدخول؟', 'لن تُحفظ هذه الوردية الجارية.', { ok: 'إلغاء الدخول', danger: true })) { state.open = null; save(); } }
};
$('iCancel').onclick = () => $('inDlg').close();
$('iOk').onclick = async () => {
  if (!$('iDate').value || !toMin($('iTime').value) && $('iTime').value !== '00:00') return toast('أدخل التاريخ والوقت');
  let date = $('iDate').value, time = $('iTime').value;
  const k0 = date + ' ' + time;
  if (!state.open) { // دخول جديد: إن وصلتَ شبكة العمل قبل وقت الضغط بأكثر من 10 دقائق فاسأل
    const ts = new Date(date + 'T' + time).getTime(), a = await wfArrival(ts);
    if (a) {
      const t = wfHM(a.s);
      if (await ask('وصلتَ إلى شبكة العمل قبل ' + fmtDur((ts - a.s) / 60000), 'هل يبدأ الحساب من ' + t + ' بدل ' + time + '؟', { ok: 'ابدأ من ' + t, cancel: 'أبقِ ' + time })) { date = wfYMD(a.s); time = t; }
    }
  }
  state.open = { ...(state.open || {}), date, start: time };
  wfAskedMark('in', k0); wfAskedMark('in', date + ' ' + time);
  $('inDlg').close(); save(); toast('تم حفظ وقت الدخول');
};

function renderArchive() {
  if (isFlt()) {
    const m = state.archive.flatMap(a => a.items).filter(match).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    $('arch').innerHTML = m.length ? m.map(itemRow).join('') : emptyBox('search', 'لا توجد نتائج مطابقة في الأرشيف.');
    return;
  }
  const arc = [...state.archive].reverse();
  $('arch').innerHTML = arc.length ? `<button class="pay" style="margin:0;width:100%" id="shareAll">${ic('share')}مشاركة كل الدفعات</button>` + arc.map(a => {
    const dates = a.items.map(i => i.date).sort();
    const range = dates.length ? fmtShort(dates[0]) + ' ← ' + fmtShort(dates[dates.length - 1]) : '—';
    const lines = [...a.items].sort((x, y) => x.date.localeCompare(y.date)).map(i =>
      `${fmtShort(i.date)}: ${i.type === 'work' ? (i.remote ? 'عن بعد = ' : fmtDur(i.mins) + ' = ') + money(i.amount) : 'كريدي ' + signed(-i.amount)}${i.note ? ' • ' + esc(i.note) : ''}`).join('<br>');
    const rem = round2(a.remain || 0);
    return `<details class="card"><summary><span class="bub">${ic('tcircle')}</span><div><b>${fmtShort(a.paidAt)}</b><small>${range}</small></div><b class="num" style="direction:ltr">${money(a.received)}</b></summary>
      <div class="lines">
        <div class="kv"><span>أيام العمل</span><b>${a.days}</b></div>
        <div class="kv"><span>مجموع الساعات</span><b>${fmtHM(a.mins)}</b></div>
        <div class="kv"><span>الأجور</span><b>${money(a.work)}</b></div>
        <div class="kv"><span>الكريدي</span><b>${signed(-a.adv)}</b></div>
        ${a.carryIn ? `<div class="kv"><span>مرحَّل قبلها</span><b>${signed(a.carryIn)}</b></div>` : ''}
        <div class="kv"><span>المستحق</span><b>${signed(a.due)}</b></div>
        <div class="kv"><span>المستلم</span><b>${money(a.received)}</b></div>
        ${rem ? `<div class="kv"><span>${rem > 0 ? 'بقي لك (رُحِّل)' : 'زيادة (خُصمت لاحقًا)'}</span><b>${signed(rem)}</b></div>` : ''}
        ${a.note ? `<div class="kv"><span>ملاحظة</span><b style="direction:rtl">${esc(a.note)}</b></div>` : ''}
        ${lines ? '<div style="margin-top:8px">' + lines + '</div>' : ''}
        <div style="display:flex;gap:8px;margin-top:12px"><button class="pay ed1" data-id="${a.id}" style="flex:1;width:auto;margin:0;height:42px;font-size:calc(14px*var(--fs,1))">${ic('edit')}تعديل</button><button class="pay sh1" data-id="${a.id}" style="flex:2;width:auto;margin:0;height:42px;font-size:calc(14px*var(--fs,1))">${ic('share')}مشاركة هذه الدفعة</button></div>
      </div></details>`;
  }).join('') + `<button class="pay" style="margin:6px 0 0;width:100%" id="undoPay">${ic('restore')}التراجع عن آخر دفعة</button>`
    : emptyBox('archive', 'لا توجد دفعات سابقة بعد.<br>عند استلام دفعة تظهر هنا.');
}

// ---------- الملخص والمشاركة ----------
const allItems = () => [...state.archive.flatMap(a => a.items), ...state.items];
function inRange() {
  if (sumMode === 'cur') return state.items;
  const from = $('sFrom').value, to = $('sTo').value;
  return allItems().filter(i => (!from || i.date >= from) && (!to || i.date <= to));
}
const RLM = '\u200F';
const SEP = '━━━━━━━━━━━━━━', BOX = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const byDate = (a, b) => a.date.localeCompare(b.date) || a.id - b.id;
const bold = s => '*' + s + '*';
const clean = s => String(s || '').replace(/[*_~`]/g, c => ({ '*': '×', '_': 'ـ', '~': '∼', '`': 'ʼ' }[c]));
const moneyP = n => num(n) + cur();
const signedP = n => (n < 0 ? '−' : '') + num(Math.abs(n)) + cur();
const durS = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? ltr(h + ':' + pad2(r)) + ' ساعة' : ltr(r) + ' دقيقة'; };
function totalsBlock(c, hideNet) {
  const o = ['📆 أيام العمل: ' + ltr(c.days), '⌛ مجموع الساعات: ' + fmtDur(c.mins), '💰 الأجور: ' + money(c.work)];
  if (c.ramt) o.push('🏠 منها عن بعد: ' + money(c.ramt));
  o.push('🔻 الكريدي: ' + signed(-c.adv));
  if (!hideNet) o.push('✅ الصافي: ' + signed(c.work - c.adv));
  return o;
}
// بند واحد = سطر واحد: أيقونة، المبلغ بخط عريض، ثم التفاصيل
function itemLine(i) {
  const n = i.note ? ' • ' + clean(i.note) : '';
  if (i.type !== 'work') return '🔻 ' + bold(ltr(signedP(-i.amount))) + ' • كريدي' + n;
  if (i.remote) return '🏠 ' + bold(ltr(moneyP(i.amount))) + ' • عن بعد' + n;
  return '💰 ' + bold(ltr(moneyP(i.amount))) + ' • ' + (i.start && i.end ? ltr(i.start + ' – ' + i.end) + ' • ' : '') + durS(i.mins) + n;
}
function dayGroups(list) {
  const out = []; let last = null;
  const days = [];
  list.forEach(i => { if (i.date !== last) { days.push([]); last = i.date; } days[days.length - 1].push(i); });
  days.forEach((g, k) => {
    if (k) out.push('');
    const net = g.reduce((t, i) => t + (i.type === 'work' ? i.amount : -i.amount), 0);
    out.push('📌 ' + bold(fmtDay(g[0].date)) + (g.length > 1 ? ' • ' + ltr(signedP(round2(net))) : ''));
    [...g].sort((a, b) => (a.type === 'adv') - (b.type === 'adv')).forEach(i => out.push(itemLine(i)));
  });
  return out;
}
const rangeOf = list => {
  const d = list.map(i => i.date).sort();
  return d.length ? (d[0] === d[d.length - 1] ? fmtShort(d[0]) : fmtShort(d[0]) + ' ← ' + fmtShort(d[d.length - 1])) : '—';
};
const rtl = lines => lines.join('\n').split('\n').map(l => l ? RLM + l : l).join('\n');
function periodText(title, head, list, withDetail, extra, key, hideNet) {
  const out = ['📋 ' + bold(title), ...head, SEP, ...totalsBlock(calc(list), hideNet), ...(extra || [])];
  if (key) out.push('', BOX, key, BOX);
  if (withDetail && list.length) out.push('', '📑 ' + bold('التفاصيل'), ...dayGroups(list));
  return rtl(out);
}
const netKey = list => { const c = calc(list); return '✅ ' + bold('الصافي: ' + ltr(signedP(c.work - c.adv))); };
function summaryText(withDetail) {
  const list = inRange().sort(byDate), from = $('sFrom').value, to = $('sTo').value;
  const head = from && to ? `من ${fmtShort(from)}\nإلى ${fmtShort(to)}` : from ? `من ${fmtShort(from)}` : to ? `حتى ${fmtShort(to)}` : 'كل الفترات';
  return periodText('ملخص العمل', ['🗓 ' + head], list, withDetail === undefined ? true : withDetail, null, netKey(list), true);
}
function currentText(d) {
  const list = [...state.items].sort(byDate), extra = [];
  if (state.carry) extra.push('↩️ مرحَّل من الدفعة السابقة: ' + signed(state.carry));
  return periodText('الفترة الحالية (غير مدفوعة)', ['🗓 ' + rangeOf(list)], list, d, extra, '🧾 ' + bold('المستحق الآن: ' + ltr(signedP(due()))));
}
function weekText(k, d) {
  const list = state.items.filter(i => monday(i.date) === k).sort(byDate);
  return periodText('ملخص أسبوع', ['🗓 ' + weekLabel(k)], list, d, null, netKey(list), true);
}
function archiveText(a, d) {
  const list = [...a.items].sort(byDate), rem = round2(a.remain || 0), extra = [];
  if (a.carryIn) extra.push('↩️ مرحَّل قبلها: ' + signed(a.carryIn));
  extra.push('🧾 المستحق: ' + signed(a.due));
  if (rem) extra.push(rem > 0 ? '⏳ بقي لك (رُحِّل): ' + money(rem) : '➕ زيادة (خُصمت لاحقًا): ' + money(-rem));
  if (a.note) extra.push('📝 ' + clean(a.note));
  return periodText('كشف دفعة', ['🗓 تاريخ الاستلام: ' + fmtShort(a.paidAt), '🗓 الفترة: ' + rangeOf(list)], list, d, extra, '💵 ' + bold('المستلم: ' + ltr(moneyP(a.received))));
}
function archivesText(d) {
  const arc = [...state.archive].sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id - b.id);
  const out = ['📋 ' + bold('كشف الدفعات'), '🗂 عدد الدفعات: ' + ltr(arc.length), SEP];
  let total = 0;
  arc.forEach((a, n) => {
    const list = [...a.items].sort(byDate), rem = round2(a.remain || 0);
    total += a.received;
    out.push('', '📌 ' + bold((n + 1) + ') ' + fmtShort(a.paidAt)), '🗓 ' + rangeOf(list), '🧾 المستحق: ' + signed(a.due), '💵 المستلم: ' + money(a.received));
    if (rem) out.push(rem > 0 ? '⏳ بقي لك: ' + money(rem) : '➕ زيادة: ' + money(-rem));
    if (d && list.length) out.push('', ...dayGroups(list));
  });
  out.push('', BOX, '💵 ' + bold('مجموع المستلم: ' + ltr(moneyP(total))), BOX);
  return rtl(out);
}
function currentCfg(d) {
  const list = [...state.items].sort(byDate), extra = [];
  if (state.carry) extra.push(['مرحَّل من الدفعة السابقة', signed(state.carry)]);
  extra.push(['المستحق الآن', signed(due()), true]);
  return { title: 'الفترة الحالية (غير مدفوعة)', sub: 'الفترة: ' + rangeOf(list), items: list, detail: d, extra };
}
function weekCfg(k, d) {
  return { title: 'ملخص أسبوع', sub: weekLabel(k), items: state.items.filter(i => monday(i.date) === k).sort(byDate), detail: d };
}
function archiveCfg(a, d) {
  const list = [...a.items].sort(byDate), rem = round2(a.remain || 0), extra = [];
  if (a.carryIn) extra.push(['مرحَّل قبلها', signed(a.carryIn)]);
  extra.push(['المستحق', signed(a.due)], ['المستلم', money(a.received), true]);
  if (rem) extra.push([rem > 0 ? 'بقي لك (رُحِّل)' : 'زيادة (خُصمت لاحقًا)', money(Math.abs(rem))]);
  return { title: 'كشف دفعة', sub: 'الاستلام: ' + fmtShort(a.paidAt) + ' • الفترة: ' + rangeOf(list), items: list, detail: d, extra };
}
function summaryCfg(d) {
  const list = [...inRange()].sort(byDate), from = $('sFrom').value, to = $('sTo').value;
  const sub = from && to ? 'من ' + fmtShort(from) + ' إلى ' + fmtShort(to) : from ? 'من ' + fmtShort(from) : to ? 'حتى ' + fmtShort(to) : 'كل الفترات';
  return { title: 'ملخص العمل', sub, items: list, detail: d };
}
function archivesCfg(d) {
  const arc = [...state.archive], items = arc.flatMap(a => a.items).sort(byDate), rec = arc.reduce((t, a) => t + a.received, 0);
  return { title: 'كشف الدفعات', sub: 'عدد الدفعات: ' + arc.length, items, detail: d, extra: [['مجموع المستلم', money(round2(rec)), true]] };
}
async function doShare(text) {
  const S = plugin('Share');
  try {
    if (S) await S.share({ title: 'العمل', text, dialogTitle: 'مشاركة' });
    else if (navigator.share) await navigator.share({ title: 'العمل', text });
    else { await navigator.clipboard.writeText(text); toast('تم نسخ النص'); }
  } catch (e) {}
}
let pendingShare = null, pendingPdf = null;
const setSd = d => { if (state.prefs.sd !== d) { state.prefs.sd = d; savePrefs(); } };
function askShare(title, build, pdf) {
  pendingShare = build; pendingPdf = pdf || null;
  $('shPdf').style.display = pdf ? '' : 'none';
  $('shTitle').textContent = title;
  $('shDetail').checked = state.prefs.sd !== false;
  $('shDlg').showModal();
}
$('shCancel').onclick = () => $('shDlg').close();
$('shGo').onclick = async () => {
  const d = $('shDetail').checked; setSd(d);
  const text = pendingShare(d); $('shDlg').close(); await doShare(text);
};
$('shPdf').onclick = async () => {
  const d = $('shDetail').checked; setSd(d);
  const p = pendingPdf(d); $('shDlg').close(); await sharePdf(p.cfg, p.name);
};
$('shCopy').onclick = async () => {
  const d = $('shDetail').checked; setSd(d);
  const text = pendingShare(d); $('shDlg').close();
  try { await navigator.clipboard.writeText(text); toast('تم نسخ النص'); } catch (e) { toast('تعذر النسخ'); }
};
$('shareCur').onclick = () => {
  if (!state.items.length) return toast('لا توجد سجلات في الفترة الحالية');
  askShare('مشاركة الفترة الحالية', d => currentText(d), d => ({ cfg: currentCfg(d), name: 'work-current-' + today() + '.pdf' }));
};
const stat = (icon, cls, val, label) => `<div class="stat ${cls}"><span class="bub ${cls === 'cr' ? 'neg' : ''}">${ic(icon)}</span><div class="sv num">${val}</div><div class="sl">${label}</div></div>`;
const mv = (n, neg) => `<span dir="ltr">${neg ? '−' : ''}${num(n)}<small>${esc(state.currency)}</small></span>`;
function renderSummary() {
  if (sumMode === 'cur') curDates();
  const c = calc(inRange());
  const dueN = due();
  $('sumOut').innerHTML =
    (sumMode === 'cur' ? stat('tcircle', 'net', mv(Math.abs(dueN), dueN < 0), 'المستحق الآن') + (state.carry ? stat('cash', '', mv(Math.abs(state.carry), state.carry < 0), 'مرحَّل من قبل') : '') : '') +
    stat('calendar', '', c.days, 'أيام العمل') +
    stat('clock', '', `<span dir="ltr">${fmtHM(c.mins)}<small>س</small></span>`, 'مجموع الساعات') +
    stat('cash', '', mv(c.work), 'الأجور' + (c.ramt ? `<small>منها عن بعد ${money(c.ramt)}</small>` : '')) +
    stat('mcircle', 'cr', mv(c.adv, c.adv > 0), 'الكريدي') +
    stat('cash', '', mv(c.days ? Math.round(c.work / c.days * 10) / 10 : 0), 'متوسط أجر اليوم') +
    stat('clock', '', `<span dir="ltr">${fmtHM(c.wd ? c.mins / c.wd : 0)}<small>س</small></span>`, 'متوسط الساعات في اليوم') +
    stat('tcircle', 'net', mv(Math.abs(c.work - c.adv), c.work - c.adv < 0), 'الصافي');
  renderChart(); renderWeekday(); renderMonths(); renderBalance();
}
function renderChart() {
  const days = [];
  for (let k = 6; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(iso(d)); }
  const mins = days.map(d => allItems().filter(i => i.type === 'work' && i.date === d).reduce((s, i) => s + i.mins, 0));
  const max = Math.max(...mins, 1), tot = mins.reduce((a, b) => a + b, 0);
  $('chart').innerHTML = `<div class="ch"><b>ساعات آخر 7 أيام</b><span class="num">${fmtHM(tot)} س</span></div><div class="bars">` +
    days.map((d, n) => {
      const h = mins[n] / 60;
      return `<div class="b ${mins[n] ? 'has' : ''} ${n === 6 ? 'today' : ''}"><span class="bv num">${mins[n] ? +h.toFixed(1) : ''}</span><i style="height:${mins[n] ? Math.max(6, Math.round(mins[n] / max * 84)) : 3}px"></i><span class="bd">${WD[dt(d).getDay()]}</span></div>`;
    }).join('') + '</div>';
}
function renderWeekday() {
  const days = {};
  inRange().forEach(i => { if (i.type === 'work') days[i.date] = (days[i.date] || 0) + i.amount; });
  const sum = Array(7).fill(0), cnt = Array(7).fill(0);
  Object.keys(days).forEach(d => { const w = dt(d).getDay(); sum[w] += days[d]; cnt[w]++; });
  const head = '<div class="ch"><b>متوسط الأجر حسب اليوم</b><span>للفترة المحددة</span></div>';
  if (!cnt.some(Boolean)) { $('chartWd').innerHTML = head + '<div class="nodata">لا توجد أيام عمل في هذه الفترة</div>'; return; }
  const avg = sum.map((t, k) => cnt[k] ? t / cnt[k] : 0), max = Math.max(...avg, 1);
  $('chartWd').innerHTML = head + '<div class="bars">' + [1, 2, 3, 4, 5, 6, 0].map(w =>
    `<div class="b ${cnt[w] ? 'has' : ''}"><span class="bv num">${cnt[w] ? kfmt(avg[w]) : ''}</span><i style="height:${cnt[w] ? Math.max(6, Math.round(avg[w] / max * 84)) : 3}px"></i><span class="bd">${WD[w]}</span></div>`).join('') + '</div>';
}
const kfmt = n => { const a = Math.abs(n), t = a >= 1000 ? (Math.round(a / 100) / 10) + 'k' : String(Math.round(a)); return (n < 0 ? '-' : '') + t; };
function renderMonths() {
  const now = new Date(), ms = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); ms.push({ key: d.getFullYear() + '-' + pad2(d.getMonth() + 1), d, w: 0, c: 0 }); }
  allItems().forEach(i => { const m = ms.find(x => i.date.slice(0, 7) === x.key); if (m) { if (i.type === 'work') m.w += i.amount; else m.c += i.amount; } });
  const max = Math.max(...ms.map(m => Math.max(m.w, m.c)), 1), H = 84;
  const col = (v, cls) => `<div class="col"><span class="v">${v ? kfmt(v) : ''}</span><i class="${cls}" style="height:${v > 0 ? Math.max(3, Math.round(v / max * H)) : 3}px"></i></div>`;
  $('chartMonths').innerHTML = `<div class="ch"><b>الأجور والكريدي حسب الشهر</b><span>آخر 6 أشهر</span></div><div class="mbars">` +
    ms.map(m => `<div class="mb"><div class="pair">${col(m.w, 'w')}${col(m.c, 'c')}</div><span class="bd">${esc(m.d.toLocaleDateString('ar-u-nu-latn', { month: 'short' }))}</span></div>`).join('') +
    `</div><div class="lg"><span><i class="w"></i>الأجور</span><span><i class="c"></i>الكريدي</span></div>`;
}
function balSeries() { // رصيدك (المستحق) بعد كل يوم، ويُعاد ضبطه عند كل دفعة
  const pts = [], per = [...state.archive].sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || '') || a.id - b.id)
    .map(a => ({ items: a.items, start: a.carryIn || 0, end: a.remain, at: a.paidAt })).concat([{ items: state.items, start: state.carry || 0 }]);
  per.forEach(p => {
    let bal = p.start; const days = {};
    [...p.items].sort(byDate).forEach(i => { days[i.date] = (days[i.date] || 0) + (i.type === 'work' ? i.amount : -i.amount); });
    Object.keys(days).sort().forEach(d => { bal += days[d]; pts.push({ d, v: round2(bal) }); });
    if (p.end !== undefined && p.at) { const last = pts[pts.length - 1]; if (last && last.d === p.at) last.v = round2(p.end); else pts.push({ d: p.at, v: round2(p.end) }); }
  });
  return pts;
}
function renderBalance() {
  const from = $('sFrom').value, to = $('sTo').value;
  const pts = balSeries().filter(p => (!from || p.d >= from) && (!to || p.d <= to));
  const head = '<div class="ch"><b>تطور الرصيد</b>' + (pts.length ? `<span class="num">${signed(pts[pts.length - 1].v)}</span>` : '') + '</div>';
  if (pts.length < 2) { $('chartBal').innerHTML = head + '<div class="nodata">لا توجد بيانات كافية في هذه الفترة</div>'; return; }
  const t = p => dt(p.d).getTime(), t0 = t(pts[0]), t1 = t(pts[pts.length - 1]);
  const vs = pts.map(p => p.v), mx = Math.max(...vs, 0), mn = Math.min(...vs, 0), span = mx - mn || 1;
  const X = p => t1 === t0 ? 0 : (t(p) - t0) / (t1 - t0) * 300, Y = v => 8 + (mx - v) / span * 104;
  const line = pts.map(p => X(p).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ');
  const area = '0,' + Y(0).toFixed(1) + ' ' + line + ' 300,' + Y(0).toFixed(1);
  const sd = p => dt(p.d).toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'short' });
  $('chartBal').innerHTML = head +
    `<svg viewBox="0 0 300 120" preserveAspectRatio="none"><line x1="0" x2="300" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="var(--bd)" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` +
    `<polygon points="${area}" fill="var(--tint)"/><polyline points="${line}" fill="none" stroke="var(--pritx)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>` +
    `<div class="ax"><span>${esc(sd(pts[0]))}</span><span>${esc(sd(pts[pts.length - 1]))}</span></div>` +
    `<div class="mm"><span>أدنى: ${signed(Math.min(...vs))}</span><span>أعلى: ${signed(Math.max(...vs))}</span></div>`;
}
function curDates() { // من بداية الفترة الحالية إلى اليوم
  const ds = state.items.map(i => i.date).filter(Boolean).sort();
  $('sFrom').value = ds.length ? ds[0] : today(); $('sTo').value = today();
}
function setMode(m) {
  sumMode = m;
  const d = new Date();
  if (m === 'cur') curDates();
  else if (m === 'month') { $('sFrom').value = iso(new Date(d.getFullYear(), d.getMonth(), 1)); $('sTo').value = today(); }
  else if (m === 'week') { const w = new Date(); w.setDate(w.getDate() - 6); $('sFrom').value = iso(w); $('sTo').value = today(); }
  else if (m === 'all') { $('sFrom').value = ''; $('sTo').value = ''; }
  [...document.querySelectorAll('#sSeg button')].forEach(b => b.classList.toggle('on', b.dataset.m === sumMode));
  renderSummary();
}
$('sSeg').onclick = e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); };
$('sFrom').onchange = $('sTo').onchange = () => { sumMode = 'custom'; [...document.querySelectorAll('#sSeg button')].forEach(b => b.classList.remove('on')); renderSummary(); };
$('sShare').onclick = () => askShare('مشاركة الملخص', d => summaryText(d), d => ({ cfg: summaryCfg(d), name: 'work-summary-' + today() + '.pdf' }));

function setView(v) {
  view = v;
  $('list').hidden = v !== 'list'; $('arch').hidden = v !== 'arc'; $('cal').hidden = v !== 'cal'; $('summary').hidden = v !== 'sum'; $('flt').hidden = v === 'sum' || v === 'cal'; renderFltRes();
  $('tabList').classList.toggle('on', v === 'list');
  $('tabArc').classList.toggle('on', v === 'arc'); $('tabCal').classList.toggle('on', v === 'cal');
  $('tabSum').classList.toggle('on', v === 'sum');
}
$('tabList').onclick = () => setView('list');
$('tabArc').onclick = () => setView('arc'); $('tabCal').onclick = () => setView('cal');
$('tabSum').onclick = () => setView('sum');

// ---------- التقويم الشهري وتقرير PDF ----------
let calM = today().slice(0, 7), calDay = '';
const CAL_WD = ['إث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];
const monthLabel = k => dt(k + '-01').toLocaleDateString('ar-u-nu-latn', { month: 'long', year: 'numeric' });
function renderCal() {
  const [y, m] = calM.split('-').map(Number), n = new Date(y, m, 0).getDate(), lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const items = allItems().filter(i => i.date.slice(0, 7) === calM), by = {};
  items.forEach(i => (by[i.date] = by[i.date] || []).push(i));
  const td = today(); let cells = '';
  for (let k = 0; k < lead; k++) cells += '<div class="cd o"></div>';
  for (let d = 1; d <= n; d++) {
    const ds = calM + '-' + pad2(d), L = by[ds] || [];
    const mins = L.filter(i => i.type === 'work' && !i.remote).reduce((s, i) => s + i.mins, 0);
    const rem = L.some(i => i.type === 'work' && i.remote), adv = L.some(i => i.type === 'adv');
    const cls = mins > 0 ? 'w' : rem ? 'r' : adv ? 'a' : ds < td ? 'e' : '';
    const sub = mins > 0 ? fmtHM(mins) : rem ? 'عن بعد' : adv ? 'كريدي' : '';
    const dots = (mins > 0 && rem ? '<i class="r"></i>' : '') + (adv && (mins > 0 || rem) ? '<i class="a"></i>' : '');
    cells += `<button class="cd ${cls}${ds === td ? ' td' : ''}" data-d="${ds}">${dots}${d}${sub ? '<b>' + sub + '</b>' : ''}</button>`;
  }
  const c = calc(items);
  const box = (k, v) => `<div>${k}<b class="num">${v}</b></div>`;
  $('cal').innerHTML = `<div class="card"><div class="cal-h"><button data-nav="-1" aria-label="الشهر السابق">›</button><b>${monthLabel(calM)}</b><button data-nav="1" aria-label="الشهر التالي">‹</button></div>
    <div class="cg">${CAL_WD.map(w => `<span class="cw">${w}</span>`).join('')}${cells}</div>
    <div class="lg"><span>■ عمل بالساعات</span><span>▢ عن بعد</span><span>◌ يوم بلا سجل</span></div>
    <div class="cs">${box('الأيام', c.days)}${box('الساعات', fmtHM(c.mins))}${box('الأجور', money(c.work))}${c.adv ? box('الكريدي', signed(-c.adv)) : ''}</div></div>
    <button class="pay" id="calPdf" style="margin:12px 0 0;width:100%">${ic('file')}تقرير PDF لهذا الشهر</button>`;
}
function openDay(ds) {
  const L = allItems().filter(i => i.date === ds).sort((a, b) => a.id - b.id), ed = L.filter(i => state.items.includes(i));
  if (L.length === 1 && ed.length === 1) { openForm(modeOf(ed[0]), ed[0]); return; }
  calDay = ds; $('dayTitle').textContent = fmtDay(ds);
  $('dayList').innerHTML = L.length ? L.map(itemRow).join('') : emptyBox('calendar', 'لا توجد سجلات في هذا اليوم.');
  $('dayDlg').showModal();
}
$('cal').onclick = e => {
  const nv = e.target.closest('[data-nav]');
  if (nv) { const [y, m] = calM.split('-').map(Number), d = new Date(y, m - 1 + +nv.dataset.nav, 1); calM = d.getFullYear() + '-' + pad2(d.getMonth() + 1); renderCal(); return; }
  const dd = e.target.closest('[data-d]'); if (dd) { openDay(dd.dataset.d); return; }
  if (e.target.closest('#calPdf')) sharePdf(monthCfg(calM), 'work-report-' + calM + '.pdf');
};
$('dayList').onclick = e => {
  const b = e.target.closest('.item'); if (!b) return;
  const it = state.items.find(i => i.id == b.dataset.id);
  if (!it) return toast('هذا السجل في الأرشيف');
  $('dayDlg').close(); openForm(modeOf(it), it);
};
const addOn = m => { const d = calDay; $('dayDlg').close(); openForm(m); $('fDate').value = d; };
$('dayWork').onclick = () => addOn('work'); $('dayRemote').onclick = () => addOn('remote'); $('dayAdv').onclick = () => addOn('adv');
$('dayClose').onclick = () => $('dayDlg').close();

function monthCfg(key) {
  return { title: 'تقرير ' + monthLabel(key), items: allItems().filter(i => i.date.slice(0, 7) === key).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id), detail: true };
}
const hmAr = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? h + ' س' + (r ? ' ' + r + ' د' : '') : r + ' د'; };
function reportPages(cfg) {
  const items = cfg.items;
  if (!items.length) return null;
  const c = calc(items), W = 1240, H = 1754, M = 70, R = W - M, dk = isDark();
  const P = dk
    ? { INK: '#e8eaed', GR: '#9aa3ad', PG: '#14181d', HB: '#2b3340', CARD: '#1e252d', ZB: '#1a2027', GD: '#3a434d', ACC: '#c9a64a', GO: '#e0bf63', GN: '#4ade80', BL: '#60a5fa', RD: '#f87171', CG: '#14352a', CB: '#16304a', CR: '#3a1a1a' }
    : { INK: '#1b1f24', GR: '#6b7280', PG: '#ffffff', HB: '#e9edf2', CARD: '#f3f5f7', ZB: '#f8fafb', GD: '#cfd6dd', ACC: '#b8942f', GO: '#8a6d1f', GN: '#15803d', BL: '#1d4ed8', RD: '#b91c1c', CG: '#dcfce7', CB: '#dbeafe', CR: '#fee2e2' };
  const pages = [];
  let cv, x, y;
  const T = (s, px, wt, dir, al, xx, yy, col) => { x.font = wt + ' ' + px + 'px sans-serif'; x.direction = dir; x.textAlign = al; x.fillStyle = col || P.INK; x.fillText(s, xx, yy); };
  const rr = (xx, yy, w, h, r, fill, stroke) => {
    x.beginPath(); x.moveTo(xx + r, yy); x.arcTo(xx + w, yy, xx + w, yy + h, r); x.arcTo(xx + w, yy + h, xx, yy + h, r); x.arcTo(xx, yy + h, xx, yy, r); x.arcTo(xx, yy, xx + w, yy, r); x.closePath();
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = 3; x.stroke(); }
  };
  const cw = [300, 130, 110, 110, 110, 160, 180], cols = []; let cum = 0;
  cw.forEach(w => { cols.push({ r: R - cum, l: R - cum - w, c: R - cum - w / 2 }); cum += w; });
  const RH = 68, HH = 64;
  const vlines = (y0, h) => { x.fillStyle = P.GD; cols.forEach(k => x.fillRect(k.l - 1, y0, 2, h)); x.fillRect(R - 1, y0, 2, h); };
  const head = () => {
    x.fillStyle = P.HB; x.fillRect(M, y, W - 2 * M, HH);
    const names = ['التاريخ', 'النوع', 'من', 'إلى', 'استراحة', 'الساعات', 'المبلغ' + (state.currency ? ' (' + state.currency + ')' : '')];
    names.forEach((n, i) => i === 0 ? T(n, 28, '700', 'rtl', 'right', cols[i].r - 16, y + 43, P.GO) : T(n, 28, '700', 'rtl', 'center', cols[i].c, y + 43, P.GO));
    vlines(y, HH); y += HH;
  };
  const newPage = first => {
    cv = document.createElement('canvas'); cv.width = W; cv.height = H; x = cv.getContext('2d');
    x.fillStyle = P.PG; x.fillRect(0, 0, W, H); x.fillStyle = P.ACC; x.fillRect(0, 0, W, 14);
    pages.push(cv); y = first ? 130 : 90; if (!first) head();
  };
  newPage(true);
  T(cfg.title, 72, '700', 'rtl', 'right', R, y, P.INK); y += 60;
  if (cfg.sub) { T(cfg.sub, 36, '400', 'rtl', 'right', R, y, P.GR); y += 40; }
  y += 24;
  const net = c.work - c.adv, cards = [['عدد الأيام', String(c.days), P.INK, 'rtl'], ['ساعات العمل', hmAr(c.mins), P.GO, 'rtl'], ['أجر العمل بالساعات', money(c.work - c.ramt), P.GN, 'ltr']];
  if (c.ramt) cards.push(['أجر العمل عن بعد', money(c.ramt), P.BL, 'ltr']);
  if (c.adv) cards.push(['الكريدي', '−' + money(c.adv), P.RD, 'ltr']);
  cards.push(['الصافي', money(net), net < 0 ? P.RD : P.GN, 'ltr', net < 0 ? P.RD : P.GN]);
  (cfg.extra || []).forEach(r => cards.push([r[0], r[1], P.INK, 'ltr', r[2] ? P.GO : null]));
  const CWD = (W - 2 * M - 24) / 2, CH = 124;
  cards.forEach((k, n) => {
    const col = n % 2, row = Math.floor(n / 2), cx = col ? M : R - CWD, cy = y + row * (CH + 24);
    rr(cx, cy, CWD, CH, 18, P.CARD, k[4]);
    T(k[0], 28, '400', 'rtl', 'right', cx + CWD - 24, cy + 44, P.GR);
    T(k[1], 46, '700', k[3], 'right', cx + CWD - 24, cy + 98, k[2]);
  });
  y += Math.ceil(cards.length / 2) * (CH + 24) + 16;
  if (cfg.detail) {
    if (y + HH + RH * 2 > H - 100) newPage(false); else head();
    items.forEach((i, k) => {
      if (y + RH > H - 100) newPage(false);
      const wk = i.type === 'work' && !i.remote, d = dt(i.date).toLocaleDateString('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
      if (k % 2) { x.fillStyle = P.ZB; x.fillRect(M, y, W - 2 * M, RH); }
      const by = y + 44, kind = i.type === 'adv' ? 'adv' : i.remote ? 'rem' : 'wrk';
      const col = kind === 'adv' ? P.RD : kind === 'rem' ? P.BL : P.GN, chipBg = kind === 'adv' ? P.CR : kind === 'rem' ? P.CB : P.CG;
      T(d, 28, '400', 'rtl', 'right', cols[0].r - 16, by, P.INK);
      rr(cols[1].c - 52, y + 11, 104, 46, 23, chipBg);
      T(kind === 'adv' ? 'كريدي' : kind === 'rem' ? 'عن بعد' : 'عمل', 26, '700', 'rtl', 'center', cols[1].c, by - 1, col);
      T(wk && i.start || '—', 28, '400', 'ltr', 'center', cols[2].c, by, wk ? P.INK : P.GR);
      T(wk && i.end || '—', 28, '400', 'ltr', 'center', cols[3].c, by, wk ? P.INK : P.GR);
      T(wk && i.brk ? i.brk + ' د' : '—', 28, '400', 'rtl', 'center', cols[4].c, by, wk && i.brk ? P.INK : P.GR);
      T(wk ? hmAr(i.mins) : '—', 28, '400', 'rtl', 'center', cols[5].c, by, wk ? P.INK : P.GR);
      T((i.type === 'adv' ? '−' : '') + num(i.amount), 28, '700', 'ltr', 'center', cols[6].c, by, col);
      x.fillStyle = P.GD; x.fillRect(M, y + RH - 2, W - 2 * M, 2); vlines(y, RH); y += RH;
    });
    if (y + RH > H - 100) newPage(false);
    x.fillStyle = P.HB; x.fillRect(M, y, W - 2 * M, RH);
    T('المجموع', 30, '700', 'rtl', 'right', cols[0].r - 16, y + 44, P.INK);
    T(hmAr(c.mins), 28, '700', 'rtl', 'center', cols[5].c, y + 44, P.GO);
    T((net < 0 ? '−' : '') + num(Math.abs(net)), 28, '700', 'ltr', 'center', cols[6].c, y + 44, net < 0 ? P.RD : P.GN);
    x.fillStyle = P.GD; x.fillRect(M, y + RH - 2, W - 2 * M, 2); vlines(y, RH); y += RH;
  }
  const stamp = new Date().toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
  pages.forEach((p, k) => { x = p.getContext('2d'); T('صفحة ' + (k + 1) + ' من ' + pages.length + ' • أُنشئ في ' + stamp, 24, '400', 'rtl', 'center', W / 2, H - 50, P.GR); });
  return pages.map(p => { const s = atob(p.toDataURL('image/jpeg', 0.92).split(',')[1]), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return { w: W, h: H, b }; });
}
function pdfBytes(pg) {
  const enc = new TextEncoder(), chunks = [], offs = []; let pos = 0;
  const add = d => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); pos += b.length; };
  const obj = (id, body) => { offs[id] = pos; add(id + ' 0 obj\n' + body + '\nendobj\n'); };
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [' + pg.map((_, k) => (3 + 3 * k) + ' 0 R').join(' ') + '] /Count ' + pg.length + ' >>');
  pg.forEach((p, k) => {
    const pid = 3 + 3 * k, cid = pid + 1, iid = pid + 2, cs = 'q 595 0 0 842 0 0 cm /Im0 Do Q';
    obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`);
    obj(cid, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
    offs[iid] = pos; add(`${iid} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.b.length} >>\nstream\n`); add(p.b); add('\nendstream\nendobj\n');
  });
  const total = 3 + 3 * pg.length, xr = pos; let xt = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
  for (let i = 1; i < total; i++) xt += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  add(xt + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF');
  const out = new Uint8Array(pos); let q = 0; chunks.forEach(b => { out.set(b, q); q += b.length; }); return out;
}
async function sharePdf(cfg, name) {
  let bytes; try { const pg = reportPages(cfg); if (!pg) return toast('لا توجد سجلات للتقرير'); bytes = pdfBytes(pg); } catch (e) { return toast('تعذر إنشاء التقرير'); }
  name = name.replace(/[^\w.-]/g, '');
  const FS = plugin('Filesystem'), S = plugin('Share');
  try {
    if (FS && S) {
      let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      await FS.writeFile({ path: name, data: btoa(s), directory: 'CACHE' });
      const u = await FS.getUri({ path: name, directory: 'CACHE' });
      await S.share({ title: 'العمل', url: u.uri, dialogTitle: 'تقرير PDF' });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch (e) { if (!/cancel/i.test(String((e && e.message) || e))) toast('تعذر مشاركة التقرير'); }
}
// ---------- النموذج ----------
const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
function workMins() {
  const s = toMin($('fStart').value), e = toMin($('fEnd').value);
  if (s === null || e === null) return null;
  const brk = parseInt($('fBrk').value) || 0;
  const m = (e > s ? e - s : e + 1440 - s) - brk;
  return m > 0 ? m : null;
}
function updDur() {
  const m = workMins();
  $('fDur').textContent = m === null ? '' : 'المدة: ' + fmtDur(m);
}
['fStart', 'fEnd', 'fBrk'].forEach(id => $(id).addEventListener('input', updDur));

const modeOf = it => it.type === 'adv' ? 'adv' : it.remote ? 'remote' : 'work';

function openForm(m, item, pre) {
  mode = m; editing = item || null; fromShift = !!pre;
  $('formTitle').textContent = (item ? 'تعديل ' : 'إضافة ') + (m === 'work' ? 'يوم عمل' : m === 'remote' ? 'عمل عن بعد' : 'كريدي');
  $('workFields').hidden = m !== 'work';
  $('amtWrap').hidden = m === 'work';
  $('fAmtL').textContent = m === 'remote' ? 'أجرة العمل عن بعد' : 'مبلغ الكريدي (يُحسب بالسالب)';
  $('fDate').value = pre ? pre.date : item ? item.date : today();
  $('fStart').value = pre ? pre.start : item && item.start || '';
  $('fEnd').value = pre ? pre.end : item && item.end || '';
  $('fBrk').value = pre && pre.brk ? pre.brk : item && item.brk || '';
  $('fAmt').value = item && m !== 'work' ? item.amount : '';
  $('fNote').value = item ? item.note || '' : '';
  $('fDel').hidden = !item;
  updDur();
  if (item && m === 'work' && !item.start) $('fDur').textContent = 'المدة المسجلة: ' + fmtDur(item.mins) + ' — أدخل البداية والنهاية لتعديلها';
  $('form').showModal();
}
$('addWork').onclick = () => openForm('work');
$('addRemote').onclick = () => openForm('remote');
$('addAdv').onclick = () => openForm('adv');
$('fCancel').onclick = () => $('form').close();
$('list').onclick = e => {
  const w = e.target.closest('.wkb');
  if (w) { const k = w.dataset.wk; askShare('مشاركة الأسبوع', d => weekText(k, d), d => ({ cfg: weekCfg(k, d), name: 'work-week-' + k + '.pdf' })); return; }
  const b = e.target.closest('.item'); if (!b) return;
  const it = state.items.find(i => i.id == b.dataset.id);
  if (it) openForm(modeOf(it), it);
};
function findOverlap(date, s, e, skipId) {
  const t0 = new Date(date + 'T' + s).getTime(); let t1 = new Date(date + 'T' + e).getTime();
  if (isNaN(t0) || isNaN(t1)) return null;
  if (t1 <= t0) t1 += 864e5;
  return state.items.find(i => {
    if (i.id === skipId || i.type !== 'work' || i.remote || !i.start || !i.end) return false;
    const a = new Date(i.date + 'T' + i.start).getTime(); let b = new Date(i.date + 'T' + i.end).getTime();
    if (isNaN(a) || isNaN(b)) return false;
    if (b <= a) b += 864e5;
    return t0 < b && a < t1;
  }) || null;
}
$('fSave').onclick = async () => {
  const date = $('fDate').value;
  if (!date) return toast('أدخل التاريخ');
  const rec = { id: editing ? editing.id : Date.now(), type: mode === 'adv' ? 'adv' : 'work', date, note: $('fNote').value.trim() };
  if (mode === 'remote') {
    const a = parseFloat($('fAmt').value);
    if (isNaN(a) || a <= 0) return toast('أدخل أجرة العمل عن بعد');
    Object.assign(rec, { remote: true, mins: 0, amount: a });
  } else if (mode === 'work') {
    const m = workMins();
    if (m === null) {
      if (editing && editing.mins && !$('fStart').value && !$('fEnd').value) {
        Object.assign(rec, { mins: editing.mins, rate: editing.rate, remote: false });
      } else return toast('أدخل البداية والنهاية (والاستراحة أقل من المدة)');
    } else {
      const ov = findOverlap(date, $('fStart').value, $('fEnd').value, editing ? editing.id : null);
      if (ov && !(await ask('الوقت يتداخل مع سجل آخر', fmtDay(ov.date) + ' ' + ltr(ov.start + ' – ' + ov.end), { ok: 'احفظ رغم ذلك' }))) return;
      const same = $('fStart').value === $('fEnd').value;
      if (same) { if (!(await ask('البداية تساوي النهاية', 'ستُحسب المدة 24 ساعة.', { ok: 'متابعة' }))) return; }
      else if (m > LONG_MIN && !(await ask('مدة الوردية طويلة', 'مدتها ' + fmtDur(m) + '. هل هي صحيحة؟', { ok: 'نعم، صحيحة', cancel: 'تعديل' }))) return;
      Object.assign(rec, { remote: false, start: $('fStart').value, end: $('fEnd').value, brk: parseInt($('fBrk').value) || 0, mins: m, rate: editing && editing.rate ? editing.rate : state.rate });
    }
    rec.amount = rec.mins / 60 * rec.rate;
  } else {
    rec.amount = parseFloat($('fAmt').value);
    if (isNaN(rec.amount) || rec.amount < 0) return toast('أدخل مبلغ الكريدي');
  }
  state.items = editing ? state.items.map(i => i.id === editing.id ? rec : i) : [...state.items, rec];
  if (fromShift) { state.open = null; fromShift = false; }
  if (wfOnSaved) wfOnSaved();
  $('form').close(); save();
};
function restoreItem(t) {
  const { delAt, ...it } = t;
  state.trash = (state.trash || []).filter(x => x.id !== it.id);
  if (!state.items.some(i => i.id === it.id)) state.items = [...state.items, it];
  save(); toast('تمت استعادة السجل');
}
$('fDel').onclick = () => {
  const it = editing;
  state.items = state.items.filter(i => i.id !== it.id);
  state.trash = [{ ...it, delAt: Date.now() }, ...(state.trash || [])];
  $('form').close(); save();
  undoBar('تم حذف السجل (في سلة المحذوفات)', () => restoreItem(it));
};
function updTrashLabel() { const n = (state.trash || []).length; $('trashSt').textContent = n ? unit(n, 'سجل', 'سجلان', 'سجلات') : 'فارغة'; }
function renderTrash() {
  const t = (state.trash || []).slice().sort((a, b) => (b.delAt || 0) - (a.delAt || 0));
  $('trashBody').innerHTML = t.length ? t.map(itemRow).join('') : emptyBox('archive', 'السلة فارغة.');
  $('trashEmpty').hidden = !t.length;
}
function purgeTrash() { // حذف نهائي لما مرّ عليه 30 يومًا في السلة
  if (state.trashAuto === false || !(state.trash || []).length) return;
  const cut = Date.now() - 30 * 864e5;
  const keep = state.trash.filter(t => !t.delAt || t.delAt > cut);
  if (keep.length !== state.trash.length) { state.trash = keep; save(); }
}
setTimeout(purgeTrash, 0);
$('trashAuto').onchange = () => { state.trashAuto = $('trashAuto').checked; savePrefs(); };
$('trashOpen').onclick = () => { $('trashAuto').checked = state.trashAuto !== false; renderTrash(); $('trashDlg').showModal(); };
$('trashClose').onclick = () => $('trashDlg').close();
$('trashBody').onclick = async e => {
  const b = e.target.closest('.item'); if (!b) return;
  const t = (state.trash || []).find(x => x.id == b.dataset.id);
  if (t && await ask('استعادة السجل؟', 'سيعود إلى الفترة الحالية.', { ok: 'استعادة' })) { restoreItem(t); renderTrash(); updTrashLabel(); }
};
$('trashEmpty').onclick = async () => {
  if (!(state.trash || []).length || !(await ask('إفراغ السلة؟', 'لا يمكن استرجاع السجلات بعدها.', { ok: 'إفراغ', danger: true }))) return;
  state.trash = []; save(); renderTrash(); updTrashLabel(); toast('تم إفراغ السلة');
};

// ---------- استلام الدفعة والأرشيف ----------
function updPay() {
  const d = due(), r = parseFloat($('pRecv').value);
  $('pInfo').textContent = 'المستحق: ' + signed(d);
  if (isNaN(r)) { $('pRem').textContent = ''; return; }
  const rem = round2(d - r);
  $('pRem').textContent = rem === 0 ? 'لا يوجد فرق.' : rem > 0
    ? 'بقي لك ' + money(rem) + ' ويُرحَّل إلى الفترة الجديدة.'
    : 'استلمت زيادة ' + money(-rem) + ' وتُخصم من الفترة الجديدة.';
}
$('payBtn').onclick = () => {
  if (!state.items.length && Math.abs(due()) < 0.005) return toast('لا يوجد شيء لاستلامه');
  $('pDate').value = today(); $('pRecv').value = round2(due()); $('pNote').value = '';
  updPay(); $('payDlg').showModal();
};
$('pRecv').addEventListener('input', updPay);
$('pCancel').onclick = () => $('payDlg').close();
$('pOk').onclick = async () => {
  const r = parseFloat($('pRecv').value), paidAt = $('pDate').value;
  if (isNaN(r) || r < 0 || !paidAt) return toast('أدخل التاريخ والمبلغ');
  if (!(await ask('تأكيد الاستلام', 'استلام ' + num(r) + cur() + '. ستنتقل الفترة الحالية إلى الأرشيف.', { ok: 'تأكيد' }))) return;
  const c = calc(state.items), d = due();
  state.archive.push({ id: Date.now(), paidAt, due: d, received: r, carryIn: state.carry, remain: round2(d - r),
    note: $('pNote').value.trim(), items: state.items, work: c.work, adv: c.adv, mins: c.mins, days: c.days });
  state.carry = round2(d - r);
  state.items = [];
  $('payDlg').close(); save(); setView('arc'); toast('تم الاستلام ونُقلت الفترة إلى الأرشيف');
};
$('arch').onclick = async e => {
  if (e.target.closest('#shareAll')) { askShare('مشاركة كل الدفعات', d => archivesText(d), d => ({ cfg: archivesCfg(d), name: 'work-batches-' + today() + '.pdf' })); return; }
  const ed = e.target.closest('.ed1');
  if (ed) { const a = state.archive.find(x => x.id == ed.dataset.id); if (a) openAp(a); return; }
  const s1 = e.target.closest('.sh1');
  if (s1) { const a = state.archive.find(x => x.id == s1.dataset.id); if (a) askShare('مشاركة الدفعة', d => archiveText(a, d), d => ({ cfg: archiveCfg(a, d), name: 'work-batch-' + a.paidAt + '.pdf' })); return; }
  if (!e.target.closest('#undoPay')) return;
  if (!(await ask('التراجع عن آخر دفعة؟', 'ستعود أيامها إلى الفترة الحالية.', { ok: 'تراجع عن الدفعة', danger: true }))) return;
  const a = state.archive.pop();
  state.items = [...a.items, ...state.items];
  state.carry = a.carryIn || 0;
  save(); setView('list'); toast('تم التراجع عن الدفعة');
};

let apEdit = null;
function laterCount() { return apEdit ? state.archive.length - state.archive.findIndex(x => x.id === apEdit.id) - 1 : 0; }
function openAp(a) {
  apEdit = a; $('aDate').value = a.paidAt || ''; $('aRecv').value = a.received; $('aNote').value = a.note || '';
  $('aInfo').textContent = 'المستحق: ' + signed(a.due);
  $('aWarn').textContent = 'تغيير المبلغ المستلم يغيّر الرصيد المرحَّل في الدفعات اللاحقة وفي الفترة الحالية بالفرق نفسه.';
  updAp(); $('apDlg').showModal();
}
function updAp() {
  const r = parseFloat($('aRecv').value);
  if (!apEdit || isNaN(r)) { $('aRem').textContent = ''; return; }
  const rem = round2(apEdit.due - r);
  $('aRem').textContent = rem === 0 ? 'لا يوجد فرق.' : rem > 0 ? 'بقي لك ' + money(rem) + ' ويُرحَّل.' : 'زيادة ' + money(-rem) + ' تُخصم لاحقًا.';
}
$('aRecv').addEventListener('input', updAp);
$('aCancel').onclick = () => $('apDlg').close();
$('aOk').onclick = async () => {
  const a = apEdit, r = parseFloat($('aRecv').value), paidAt = $('aDate').value;
  if (!a || isNaN(r) || r < 0 || !paidAt) return toast('أدخل التاريخ والمبلغ');
  const delta = round2(r - a.received);
  if (delta && !(await ask('تغيير المبلغ المستلم؟', 'التغيير بمقدار ' + signed(delta) + ' سيعدّل الرصيد المرحَّل بعده.', { ok: 'متابعة' }))) return;
  const idx = state.archive.findIndex(x => x.id === a.id);
  a.paidAt = paidAt; a.note = $('aNote').value.trim(); a.received = r; a.remain = round2(a.due - r);
  if (delta) {
    for (let j = idx + 1; j < state.archive.length; j++) {
      const b = state.archive[j];
      b.carryIn = round2((b.carryIn || 0) - delta); b.due = round2(b.due - delta); b.remain = round2((b.remain || 0) - delta);
    }
    state.carry = round2(state.carry - delta);
  }
  apEdit = null; $('apDlg').close(); save(); toast('تم تعديل الدفعة');
};

// ---------- القفل ----------
// صيغة الرمز المخزّن: p2$طول$ملح$بصمة (PBKDF2 بملح عشوائي). الصيغة القديمة (SHA-256 بملح ثابت) تُقبل وتُرقّى عند أول فتح ناجح.
const PIN_ITER = 100000;
const hex = u8 => [...u8].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
async function pbkdf2Pin(p, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('work|' + p), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PIN_ITER, hash: 'SHA-256' }, base, 256)));
}
async function makePin(p) {
  if (window.crypto && crypto.subtle) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return 'p2$' + p.length + '$' + hex(salt) + '$' + await pbkdf2Pin(p, salt);
  }
  return 'x' + p;
}
async function legacyHash(p) {
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('work|' + p));
    return hex(new Uint8Array(b));
  }
  return 'x' + p;
}
async function verifyPin(p, stored) {
  if (!stored) return false;
  if (stored.startsWith('p2$')) {
    const a = stored.split('$');
    if (a.length !== 4 || !window.crypto || !crypto.subtle) return false;
    return (await pbkdf2Pin(p, unhex(a[2]))) === a[3];
  }
  return (await legacyHash(p)) === stored;
}
const pinLen = () => { const m = /^p2\$(\d+)\$/.exec(state.pin || ''); return m ? Math.min(6, Math.max(4, +m[1])) : 4; };
let entered = '', hiddenAt = 0, lastUnlock = 0, pinFail = {};
try { pinFail = JSON.parse(localStorage.getItem('earnings_pinfail')) || {}; } catch (e) {}
const savePinFail = () => { try { localStorage.setItem('earnings_pinfail', JSON.stringify(pinFail)); } catch (e) {} };
(function buildPad() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  $('pad').innerHTML = keys.map((k, n) => k ? `<button data-k="${k}">${k}</button>` : n === 9 ? `<button data-k="bio" id="bioKey" aria-label="بصمة" style="visibility:hidden">${ic('finger')}</button>` : '<span></span>').join('');
})();
function drawDots() {
  const box = document.querySelector('#lock .dots'), n = pinLen();
  if (box.children.length !== n) box.innerHTML = '<span></span>'.repeat(n);
  [...box.children].forEach((s, i) => s.classList.toggle('on', i < entered.length));
}
function showLock() { if (!state.pin) return; entered = ''; drawDots(); bioKeyShow(); $('lock').hidden = false; tryBio(); }
$('pad').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.dataset.k;
  if (k === 'bio') return tryBio();
  if (Date.now() < (pinFail.until || 0)) return toast('محاولات كثيرة. انتظر ' + Math.ceil((pinFail.until - Date.now()) / 1000) + ' ثانية');
  if (k === '⌫') entered = entered.slice(0, -1); else if (entered.length < pinLen()) entered += k;
  drawDots();
  if (entered.length === pinLen()) {
    const tried = entered;
    if (await verifyPin(tried, state.pin)) {
      if (!state.pin.startsWith('p2$') && window.crypto && crypto.subtle) { try { state.pin = await makePin(tried); save(); } catch (e) {} }
      $('lock').hidden = true; setTimeout(checkForgot, 400); entered = ''; pinFail = {}; savePinFail(); }
    else {
      pinFail.n = (pinFail.n || 0) + 1;
      if (pinFail.n % 5 === 0) { const sec = Math.min(30 * (pinFail.n / 5), 600); pinFail.until = Date.now() + sec * 1000; toast('5 محاولات خاطئة. انتظر ' + sec + ' ثانية'); }
      savePinFail();
      $('lock').classList.add('shake'); setTimeout(() => { $('lock').classList.remove('shake'); entered = ''; drawDots(); }, 350); }
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (state.pin && hiddenAt && !bioBusy && Date.now() - lastUnlock > 1500 && Date.now() - hiddenAt >= (state.lockAfter ?? 60) * 1000) showLock();
});
function updLk() { [...$('lkSeg').children].forEach(b => b.classList.toggle('on', +b.dataset.v === (state.lockAfter ?? 60))); }
$('lkSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.lockAfter = +b.dataset.v; updLk(); savePrefs(); };
// بعد فتح القفل: يسجّل وقت الفتح، وينفّذ اختصار الأيقونة المؤجّل إن وُجد
let pendingSc = '';
new MutationObserver(() => {
  if (!$('lock').hidden) return;
  lastUnlock = Date.now();
  if (pendingSc) { const a = pendingSc; pendingSc = ''; setTimeout(() => doShortcut(a), 350); }
}).observe($('lock'), { attributes: true, attributeFilter: ['hidden'] });

function openPin() {
  ['pinOld', 'pinNew', 'pinNew2'].forEach(i => $(i).value = '');
  $('pinOldWrap').hidden = !state.pin; $('pinRemove').hidden = !state.pin;
  $('pinOld').maxLength = 6; setNewLen(state.pin ? pinLen() : 4);
  $('pinDlg').showModal();
}
$('pinBtn').onclick = openPin;
$('pinCancel').onclick = () => $('pinDlg').close();
async function pinOldOk() { return !state.pin || await verifyPin($('pinOld').value, state.pin); }
let newLen = 4;
function setNewLen(n) {
  newLen = n;
  [...$('pinLenSeg').children].forEach(b => b.classList.toggle('on', +b.dataset.v === n));
  ['pinNew', 'pinNew2'].forEach(i => { $(i).maxLength = n; $(i).value = ''; });
}
$('pinLenSeg').onclick = e => { const b = e.target.closest('button'); if (b) setNewLen(+b.dataset.v); };
$('pinSave').onclick = async () => {
  if (!(await pinOldOk())) return toast('الرمز الحالي غير صحيح');
  const a = $('pinNew').value;
  if (!new RegExp('^\\d{' + newLen + '}$').test(a)) return toast('الرمز يجب أن يكون ' + newLen + ' أرقام');
  if (a !== $('pinNew2').value) return toast('التأكيد غير مطابق');
  state.pin = await makePin(a); $('pinDlg').close(); save(); updPinLabel(); toast('تم حفظ الرمز');
};
$('pinRemove').onclick = async () => {
  if (!(await pinOldOk())) return toast('الرمز الحالي غير صحيح');
  state.pin = ''; state.bio = false; $('pinDlg').close(); save(); updPinLabel(); toast('تمت إزالة الرمز');
};
// ---------- البصمة (اختصار لفتح القفل) ----------
let bioOk = false, bioBusy = false;
const nat = {};
const nplug = n => {
  if (!isNative()) return null;
  if (!(n in nat)) { try { nat[n] = Capacitor.registerPlugin ? Capacitor.registerPlugin(n) : (Capacitor.Plugins[n] || null); } catch (e) { nat[n] = Capacitor.Plugins[n] || null; } }
  return nat[n];
};
const bioKeyShow = () => { const k = $('bioKey'); if (k) k.style.visibility = state.bio && bioOk ? 'visible' : 'hidden'; };
async function checkBio() { const B = nplug('Bio'); if (!B) return; try { bioOk = !!(await B.available()).ok; } catch (e) { bioOk = false; } bioKeyShow(); }
async function tryBio() {
  const B = nplug('Bio');
  if (!B || !bioOk || !state.bio || bioBusy || $('lock').hidden) return;
  bioBusy = true;
  try { await B.authenticate(); $('lock').hidden = true; setTimeout(checkForgot, 400); entered = ''; pinFail = {}; savePinFail(); } catch (e) { /* أُلغيت: يبقى الرمز */ }
  bioBusy = false;
}
$('bioChk').onchange = async () => {
  if (!$('bioChk').checked) { state.bio = false; save(); bioKeyShow(); return; }
  if (!state.pin) { $('bioChk').checked = false; return toast('فعّل رمز القفل أولًا'); }
  try { await nplug('Bio').authenticate(); state.bio = true; save(); bioKeyShow(); toast('تم تفعيل البصمة'); }
  catch (e) { $('bioChk').checked = false; toast('لم يتم التحقق من البصمة'); }
};
const updPinLabel = () => { $('pinSt').textContent = state.pin ? 'مفعّل' : 'غير مفعّل'; };

// ---------- الإعدادات ----------
function updBkWhere() {
  const t = ms => new Date(ms).toLocaleString('ar-u-nu-latn', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  let st = '';
  if (lastBk.ok) st = '<br>آخر نسخة تلقائية: ' + t(lastBk.okAt);
  else if (lastBk.at) st = '<br><span style="color:var(--neg)">فشل آخر حفظ تلقائي</span>' + (lastBk.okAt ? ' • آخر نجاح: ' + t(lastBk.okAt) : '');
  $('bkWhere').innerHTML = 'مكان النسخ: ' + esc(bk.tree ? (bk.name || 'المجلد المختار') : 'Documents/EarningsBackup (الافتراضي)') + st;
  $('bkReset').hidden = !bk.tree;
}
const MT = { work: 'العمل', look: 'المظهر', wg: 'الودجت', sec: 'الأمان', bk: 'النسخ الاحتياطي والتصدير', wifi: 'الواي فاي' };
let mPage = '';
function mGo(p) {
  mPage = p; $('mHome').hidden = !!p;
  document.querySelectorAll('#menu .pg').forEach(x => x.classList.toggle('on', x.id === 'pg-' + p));
  $('menuTitle').textContent = p ? MT[p] : 'الإعدادات'; $('menuClose').textContent = p ? 'رجوع' : 'تم'; $('menu').scrollTop = 0;
  if (p === 'wifi') wfCfgShow();
}
$('mHome').onclick = e => { const b = e.target.closest('[data-go]'); if (b) mGo(b.dataset.go); };
$('menuBtn').onclick = () => {
  mGo('');
  $('srchChk').checked = state.search !== false; $('cur').value = state.currency; $('rate').value = state.rate; $('auto').checked = state.auto; $('forgetH').value = state.forgetH;
  updFs(); updFont(); updLk(); $('secChk').checked = !!state.secure; purgeTrash(); updTrashLabel(); updIc(); updWg(); updPinLabel(); $('bioRow').hidden = !bioOk; $('bioChk').checked = !!state.bio; updBkWhere(); updEnc(); buildSwatches(); showVer(); $('menu').showModal();
};
async function showVer() { // رقم النسخة من التطبيق نفسه (يتغير مع كل بناء)
  const A = plugin('App'); if (!A || !A.getInfo) return;
  try { const i = await A.getInfo(); $('appVer').textContent = 'النسخة ' + ltr(i.version + (i.build ? ' (' + i.build + ')' : '')); $('appVer').hidden = false; } catch (e) {}
}
function applyMenuFields() {
  state.currency = $('cur').value.trim();
  const r = parseFloat($('rate').value); if (r > 0) state.rate = r;
  state.auto = $('auto').checked;
  const fh = parseInt($('forgetH').value, 10); if (!isNaN(fh)) state.forgetH = Math.max(0, Math.min(48, fh));
}
['cur', 'rate', 'auto', 'forgetH'].forEach(id => { $(id).onchange = () => { applyMenuFields(); save(); }; }); // يُحفظ فور التغيير لا عند الإغلاق فقط
$('menuClose').onclick = () => {
  if (mPage) { mGo(''); return; }
  applyMenuFields();
  $('menu').close(); save(); checkForgot();
};

// ---------- خط من ملف (يُحفظ في مخزن مستقل ولا يدخل النسخ الاحتياطية) ----------
function fdb() { return new Promise((res, rej) => { const r = indexedDB.open('work-fonts', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function fdbGet() { const db = await fdb(); return new Promise((res, rej) => { const q = db.transaction('f').objectStore('f').get('custom'); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
async function fdbSet(v) { const db = await fdb(); return new Promise((res, rej) => { const t = db.transaction('f', 'readwrite'); t.objectStore('f').put(v, 'custom'); t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); }); }
async function fdbDel() { const db = await fdb(); return new Promise((res, rej) => { const t = db.transaction('f', 'readwrite'); t.objectStore('f').delete('custom'); t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); }); }
function fontWeightOf(n) { // يستنتج الوزن من اسم الملف
  if (/variable|\[wght|-vf\b/.test(n)) return '100 900';
  const m = [[/thin|hairline/, 100], [/extra-?light|ultra-?light/, 200], [/light/, 300], [/semi-?bold|demi-?bold/, 600], [/extra-?bold|ultra-?bold/, 800], [/black|heavy/, 900], [/bold/, 700], [/medium/, 500]];
  for (const [r, w] of m) if (r.test(n)) return String(w);
  return '400';
}
async function loadCustomFont(apply) { // apply=false: يقرأ الاسم فقط دون تحميل الخطوط
  try {
    const rec = await fdbGet();
    customLabel = rec && rec.files && rec.files.length ? (rec.label || 'خط مخصص') : '';
    if (!customLabel || !apply) return false;
    const fresh = rec.files.map(f => new FontFace(CUSTOM_FAMILY, f.data, { weight: f.weight, style: 'normal' }));
    await Promise.all(fresh.map(x => x.load()));
    customFonts.forEach(x => document.fonts.delete(x));
    fresh.forEach(x => document.fonts.add(x)); customFonts = fresh;
    return true;
  } catch (e) { return false; }
}
function updFont() {
  [...$('ffSeg').children].forEach(b => b.classList.toggle('on', +b.dataset.v === (state.font === 1 && customOk ? 1 : 0)));
  $('ffInfo').textContent = customLabel ? 'الملفات: ' + customLabel : 'لم تختر ملف خط بعد';
  $('ffClear').hidden = !customLabel;
}
$('ffSeg').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  const v = +b.dataset.v;
  if (v === 1) {
    if (!customLabel) { $('ffFile').click(); return; }
    customOk = await loadCustomFont(true);
    if (!customOk) { toast('تعذّر تحميل الخط. اختر الملفات من جديد'); updFont(); return; }
  }
  state.font = v; applyTheme(); updFont(); savePrefs();
};
$('ffPick').onclick = () => $('ffFile').click();
$('ffFile').onchange = async () => {
  const fl = [...$('ffFile').files]; $('ffFile').value = '';
  if (!fl.length) return;
  const files = [];
  try {
    for (const f of fl) {
      const n = f.name.toLowerCase();
      if (!/\.(ttf|otf|woff2?)$/.test(n) || /italic|oblique/.test(n) || f.size > 8 * 1024 * 1024) continue;
      files.push({ name: f.name, weight: fontWeightOf(n), data: await f.arrayBuffer() });
    }
  } catch (e) { toast('تعذّرت قراءة الملفات'); return; }
  if (!files.length) { toast('لم أجد ملف خط صالحًا (ttf أو otf)'); return; }
  const label = files.map(f => f.name.replace(/\.[^.]+$/, '')).join(' + ');
  try { await fdbSet({ files, label }); } catch (e) { toast('تعذّر حفظ الخط'); return; }
  customOk = await loadCustomFont(true);
  if (!customOk) { try { await fdbDel(); } catch (e) {} customLabel = ''; updFont(); toast('الملف ليس خطًا سليمًا. لم يتغير شيء'); return; }
  state.font = 1; applyTheme(); updFont(); savePrefs(); toast('تم تطبيق الخط');
};
$('ffClear').onclick = async () => {
  if (!(await ask('إزالة الخط المخصص؟', 'ستعود للخط الحالي.', { ok: 'إزالة', danger: true }))) return;
  try { await fdbDel(); } catch (e) {}
  customFonts.forEach(x => document.fonts.delete(x)); customFonts = []; customOk = false; customLabel = '';
  state.font = 0; applyTheme(); updFont(); savePrefs();
};
loadCustomFont(state.font === 1).then(ok => { customOk = ok; applyTheme(); updFont(); });
function applySecure() {
  const B = nplug('Bio'); if (!B || !B.setSecure) return;
  Promise.resolve(B.setSecure({ on: !!state.secure })).catch(() => {});
}
$('secChk').onchange = () => { state.secure = $('secChk').checked; applySecure(); savePrefs(); };
function updFs() {
  $('fsRange').value = state.fsv;
  $('fsVal').textContent = ltr(state.fsv + '%');
  $('fsPrev').innerHTML = itemRow({ id: 0, type: 'work', date: today(), start: '09:00', end: '17:00', mins: 480, amount: 80, note: 'مثال' });
}
$('fsRange').oninput = () => {
  state.fsv = +$('fsRange').value;
  document.documentElement.style.setProperty('--fs', state.fsv / 100);
  $('fsVal').textContent = ltr(state.fsv + '%');
};
$('fsRange').onchange = () => savePrefs();
$('fsReset').onclick = () => { state.fsv = 100; applyTheme(); updFs(); savePrefs(); };

// ---------- أيقونة التطبيق (شكلان × ثمانية ألوان) ----------
const IC_KEY = 'earnings_icon';
const icPref = { style: 'a', follow: true, idx: 0, applied: 'a0' };
try { Object.assign(icPref, JSON.parse(localStorage.getItem(IC_KEY)) || {}); } catch (e) {}
Object.assign(icPref, state.prefs.ic);
const icSave = () => { // idx/applied خاصان بهذا الجهاز؛ النمط والتتبّع فقط يدخلان النسخة الاحتياطية
  try { localStorage.setItem(IC_KEY, JSON.stringify(icPref)); } catch (e) {}
  const p = state.prefs.ic;
  if (p.style !== icPref.style || p.follow !== icPref.follow) { state.prefs.ic = { style: icPref.style, follow: icPref.follow }; savePrefs(); }
};
function nearestColor(hex) {
  const t = hex2rgb(hex); let bi = 0, bd = 1e9;
  PALETTE.forEach((p, i) => { const r = hex2rgb(p), d = (r[0] - t[0]) ** 2 + (r[1] - t[1]) ** 2 + (r[2] - t[2]) ** 2; if (d < bd) { bd = d; bi = i; } });
  return bi;
}
let icTimer;
function iconSync() {
  if (!isNative()) return;
  if (icPref.follow) icPref.idx = nearestColor(effColor());
  const id = icPref.style + icPref.idx;
  if (icPref.applied === id) return;
  clearTimeout(icTimer);
  icTimer = setTimeout(async () => {
    const P = nplug('AppIcon'); if (!P) return;
    try { await P.set({ id }); icPref.applied = id; icSave(); } catch (e) {}
  }, 800);
}
function updIc() {
  [...$('icSeg').children].forEach(b => b.classList.toggle('on', b.dataset.s === icPref.style));
  $('icFollow').checked = icPref.follow; $('icBox').hidden = !isNative();
}
$('icSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; icPref.style = b.dataset.s; icSave(); updIc(); iconSync(); };
$('icFollow').onchange = () => { icPref.follow = $('icFollow').checked; icSave(); iconSync(); };

// ---------- مظهر الودجت ----------
const wgPref = state.prefs.wg;
function wgPush() { const W = nplug('WorkWidget'); if (W && W.setStyle) { try { W.setStyle(wgPref); } catch (e) {} } }
function wgApply() { savePrefs(); wgPush(); }
function updWg() {
  $('wgBox').hidden = !isNative(); $('rowWg').hidden = !isNative();
  [['wgBg', 'bg'], ['wgFg', 'fg'], ['wgIc', 'ic']].forEach(([id, k]) => [...$(id).children].forEach(b => b.classList.toggle('on', +b.dataset.v === wgPref[k])));
  $('wgLabel').checked = wgPref.label; $('wgOn').checked = wgPref.on !== false; $('wgTotal').checked = wgPref.total !== false;
}
[['wgBg', 'bg'], ['wgFg', 'fg'], ['wgIc', 'ic']].forEach(([id, k]) => {
  $(id).onclick = e => { const b = e.target.closest('button'); if (!b) return; wgPref[k] = +b.dataset.v; wgApply(); updWg(); };
});
$('wgLabel').onchange = () => { wgPref.label = $('wgLabel').checked; wgApply(); };
$('wgTotal').onchange = () => { wgPref.total = $('wgTotal').checked; wgApply(); };
$('wgOn').onchange = () => {
  wgPref.on = $('wgOn').checked; wgApply();
  if (!wgPref.on && state.open) toast('الودجت معطّل. دخولك الجاري محفوظ، اخرج من التطبيق.');
};

// ---------- النسخ الاحتياطي ----------
const stamp = () => { const d = new Date(); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()); };
// الرمز والبصمة لا يدخلان ملفات النسخ الاحتياطي أبدًا
const payload = () => { const { pin, bio, ...rest } = state; return JSON.stringify({ app: 'earnings', version: 5, savedAt: new Date().toISOString(), ...rest }, null, 1); };
const fsWrite = (FS, path, data) => FS.writeFile({ path, data, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
const docsAlt = {};
let warned = false, warnedAuto = false;
const isEmpty = s => !s.items.length && !s.archive.length && !s.carry;
let lastBk = {};
try { lastBk = JSON.parse(localStorage.getItem('earnings_lastbk')) || {}; } catch (e) {}
function markBk(ok) {
  lastBk = { ok, at: Date.now(), okAt: ok ? Date.now() : (lastBk.okAt || 0) };
  try { localStorage.setItem('earnings_lastbk', JSON.stringify(lastBk)); } catch (e) {}
  if (ok) warnedAuto = false;
  else if (!warnedAuto) { warnedAuto = true; toast('تعذر حفظ النسخة التلقائية. افتح الإعدادات وتحقق من مكان النسخ'); }
  try { checkBkStale(); } catch (e) {}
}

async function putFile(name, data) {
  const S = saf();
  if (bk.tree && S) {
    try { await S.writeFile({ tree: bk.tree, name, data }); return { via: 'saf', name }; }
    catch (e) { if (!warned) { warned = true; toast('تعذر الحفظ في المجلد المختار. اخترْه من جديد. حُفظت النسخة في المكان الافتراضي'); } }
  }
  const FS = plugin('Filesystem'); if (!FS) throw new Error('no fs');
  let n = docsAlt[name] || name;
  try { await fsWrite(FS, BK_DIR + '/' + n, data); }
  catch (e) { n = docsAlt[name] = name.replace('.json', '-' + stamp() + '.json'); await fsWrite(FS, BK_DIR + '/' + n, data); }
  return { via: 'docs', name: n };
}
async function readFrom(via, name) {
  if (via === 'saf') return (await saf().readFile({ tree: bk.tree, name })).data;
  return (await plugin('Filesystem').readFile({ path: BK_DIR + '/' + name, directory: 'DOCUMENTS', encoding: 'utf8' })).data;
}
async function readBack(name) { // من مكان النسخ الحالي، وnull إن لم يوجد
  try { return await readFrom(bk.tree && saf() ? 'saf' : 'docs', name); } catch (e) { return null; }
}
function validBackup(t) {
  if (!t) return false;
  try {
    const d = JSON.parse(t);
    if (!d) return false;
    if (d.enc) return !!d.data;
    return Array.isArray(d.items) && (d.items.length > 0 || (Array.isArray(d.archive) && d.archive.length > 0));
  } catch (e) { return false; }
}
// آخر 3 نسخ تلقائية سابقة: تدور مرة في اليوم قبل أن تُستبدل النسخة التلقائية
const SNAPS = ['earnings-snap-1.json', 'earnings-snap-2.json', 'earnings-snap-3.json'];
async function rotateSnap() {
  const day = today();
  if (localStorage.getItem('earnings_snapday') === day) return;
  const cur = await readBack(AUTO_NAME);
  if (validBackup(cur)) {
    const s1 = await readBack(SNAPS[0]), s2 = await readBack(SNAPS[1]);
    if (validBackup(s2)) await putFile(SNAPS[2], s2);
    if (validBackup(s1)) await putFile(SNAPS[1], s1);
    await putFile(SNAPS[0], cur);
  }
  localStorage.setItem('earnings_snapday', day);
}
// نسخ أمان (5): تدور فقط عندما يُنقِص التغيير بيانات (حذف سجل، ضياع دخول جارٍ، نقص أرشيف)، فتُحفظ النسخة السابقة قبل الكتابة فوقها
const SAFES = ['earnings-safe-1.json', 'earnings-safe-2.json', 'earnings-safe-3.json', 'earnings-safe-4.json', 'earnings-safe-5.json'];
const bkSum = s => ({ n: s.items.length, a: s.archive.length, o: s.open ? 1 : 0 });
const bkLoss = (p, c) => !!p && (c.n < p.n || c.a < p.a || (p.o && !c.o && c.n <= p.n));
async function rotateSafe() {
  const cur = await readBack(AUTO_NAME);
  if (!validBackup(cur)) return;
  const old = [];
  for (let i = 0; i < SAFES.length - 1; i++) old.push(await readBack(SAFES[i]));
  for (let i = SAFES.length - 1; i >= 1; i--) if (validBackup(old[i - 1])) await putFile(SAFES[i], old[i - 1]);
  await putFile(SAFES[0], cur);
}
// ---------- التشفير (AES-256-GCM + PBKDF2) ----------
const b64 = u8 => { let t = ''; u8.forEach(c => t += String.fromCharCode(c)); return btoa(t); };
const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
async function deriveKey(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptText(text, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 210000;
  const key = await deriveKey(pw, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  return JSON.stringify({ app: 'earnings', enc: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), data: b64(ct) }, null, 1);
}
async function decryptEnv(d, pw) {
  const iter = Math.min(Math.max(Number(d.iter) || 210000, 100000), 1000000);
  const key = await deriveKey(pw, unb64(d.salt), iter);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(d.iv) }, key, unb64(d.data)));
}
const backupText = async () => { const plain = payload(); return enc.on && enc.pw ? await encryptText(plain, enc.pw) : plain; };

let pwDone = null;
const askPassword = () => new Promise(res => { pwDone = res; $('pwIn').value = ''; $('pwDlg').showModal(); });
function closePw(v) { if (pwDone) { const f = pwDone; pwDone = null; f(v); } $('pwDlg').close(); }
$('pwOk').onclick = () => closePw($('pwIn').value);
$('pwCancel').onclick = () => closePw(null);
$('pwDlg').addEventListener('close', () => { if (pwDone) { const f = pwDone; pwDone = null; f(null); } });
async function readBackup(text) {
  const d = JSON.parse(text);
  if (!d || !d.enc) return d;
  if (enc.pw) { try { return JSON.parse(await decryptEnv(d, enc.pw)); } catch (e) {} }
  const pw = await askPassword();
  if (pw === null) return null;
  try { return JSON.parse(await decryptEnv(d, pw)); } catch (e) { toast('كلمة السر غير صحيحة'); return null; }
}
function updEnc() {
  $('encSt').textContent = enc.on ? 'مفعّل' : 'غير مفعّل';
  $('encNote').textContent = enc.on ? 'التشفير مفعّل لكل النسخ الجديدة. أدخل كلمة سر جديدة إن أردت تغييرها (النسخ القديمة تبقى بكلمة سرها).' : 'تُشفَّر النسخ التلقائية واليدوية بكلمة سر تختارها، وتُحفظ الكلمة داخل التطبيق على هذا الهاتف لتعمل النسخ التلقائية.';
  $('encOff').hidden = !enc.on;
}
$('encBtn').onclick = () => { $('encPw').value = ''; $('encPw2').value = ''; updEnc(); $('encDlg').showModal(); };
$('encCancel').onclick = () => $('encDlg').close();
$('encSave').onclick = async () => {
  const a = $('encPw').value;
  if (!(window.crypto && crypto.subtle)) return toast('التشفير غير متاح على هذا الجهاز');
  if (a.length < 6) return toast('كلمة السر 6 أحرف على الأقل');
  if (a !== $('encPw2').value) return toast('التأكيد غير مطابق');
  if (!(await ask('تفعيل التشفير؟', 'إن نسيت كلمة السر لا يمكن استرجاع النسخ المشفرة أبدًا.', { ok: 'تفعيل التشفير' }))) return;
  enc = { on: true, pw: a }; saveEnc(); $('encDlg').close(); updEnc(); autoBackup(); toast('تم تفعيل تشفير النسخ الاحتياطي');
};
$('encOff').onclick = async () => {
  if (!(await ask('إيقاف التشفير؟', 'ستُحفظ النسخ القادمة بدون تشفير.', { ok: 'إيقاف', danger: true }))) return;
  enc = {}; saveEnc(); $('encDlg').close(); updEnc(); autoBackup(); toast('تم إيقاف التشفير');
};

async function autoBackup() {
  if (!isNative() || isEmpty(state)) return; // لا نكتب بيانات فارغة فوق نسخة سليمة
  try {
    const text = await backupText(), sum = bkSum(state);
    let prev = null; try { prev = JSON.parse(localStorage.getItem('earnings_bksum')); } catch (e) {}
    try { await rotateSnap(); } catch (e) {}
    if (bkLoss(prev, sum)) { try { await rotateSafe(); } catch (e) {} }
    const r = await putFile(AUTO_NAME, text);
    if (await readFrom(r.via, r.name) !== text) throw new Error('verify');
    try { localStorage.setItem('earnings_bksum', JSON.stringify(sum)); } catch (e) {}
    markBk(true);
  } catch (e) { markBk(false); }
}
async function manualBackup() {
  const name = 'earnings-backup-' + (enc.on ? 'enc-' : '') + stamp() + '.json';
  let data;
  try { data = await backupText(); } catch (e) { return toast('تعذر تشفير النسخة'); }
  if (!isNative()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = name; a.click(); return;
  }
  if (!bk.tree) { try { await plugin('Filesystem').requestPermissions(); } catch (e) {} }
  try {
    const w = await putFile(name, data);
    toast('تم الحفظ: ' + w.name + (w.via === 'saf' ? ' في ' + (bk.name || 'المجلد') : ' في Documents/' + BK_DIR));
  } catch (e) { toast('تعذر الحفظ: تحقق من صلاحية التخزين'); }
}

function adoptPrefs() { // بعد الاستعادة: طبّق تفضيلات النسخة على الودجت والأيقونة والواجهة
  Object.assign(wgPref, state.prefs.wg); state.prefs.wg = wgPref;
  Object.assign(icPref, state.prefs.ic);
  wgPush(); try { updWg(); updIc(); iconSync(); } catch (e) {}
}
async function applyBackup(text) {
  try {
    const d = await readBackup(text);
    if (!d) return;
    if (!Array.isArray(d.items)) throw 0;
    if (!(await ask('استعادة النسخة الاحتياطية؟', 'سيتم استبدال البيانات الحالية بها.', { ok: 'استعادة', danger: true }))) return;
    if (isNative() && !isEmpty(state)) { // نسخة من بياناتك الحالية قبل استبدالها
      try { await putFile('earnings-before-restore-' + stamp() + '.json', await backupText()); }
      catch (e) { if (!(await ask('تعذر حفظ نسخة من بياناتك الحالية', 'هل تتابع الاستعادة رغم ذلك؟', { ok: 'تابع', danger: true }))) return; }
    }
    clearTimeout(bkTimer);
    const keepPin = state.pin, keepBio = state.bio, keepPrefs = state.prefs;
    state = norm(d); state.bio = keepBio; if (!d.prefs) state.prefs = keepPrefs; // نسخة قديمة بلا تفضيلات: تبقى تفضيلاتك الحالية
    state.pin = keepPin || (typeof d.pin === 'string' ? d.pin : ''); // رمزك الحالي يبقى؛ رمز النسخ القديمة يُؤخذ فقط إن لم يكن عندك رمز
    applyTheme(); save(true); adoptPrefs(); $('menu').close(); $('filesDlg').close(); toast('تمت الاستعادة');
  } catch (e) { toast('ملف النسخة غير صالح'); }
}
$('bkNow').onclick = manualBackup;
$('bkPick').onclick = async () => {
  const S = saf();
  if (!S) return toast('اختيار المجلد يعمل داخل التطبيق فقط');
  try {
    const r = await S.pickFolder();
    bk = { tree: r.uri, name: r.name }; saveBk(); updBkWhere(); warned = false;
    toast('تم اختيار المجلد'); autoBackup();
  } catch (e) { /* أُلغي الاختيار */ }
};
$('bkReset').onclick = () => { bk = {}; saveBk(); updBkWhere(); toast('عاد الحفظ إلى المكان الافتراضي'); };
$('bkRestore').onclick = async () => {
  const S = saf(), FS = plugin('Filesystem');
  if (!FS && !S) return $('file').click();
  try {
    let text;
    if (bk.tree && S) text = (await S.readFile({ tree: bk.tree, name: AUTO_NAME })).data;
    else { try { await FS.requestPermissions(); } catch (e) {} text = (await FS.readFile({ path: BK_DIR + '/' + AUTO_NAME, directory: 'DOCUMENTS', encoding: 'utf8' })).data; }
    applyBackup(text);
  } catch (e) { toast('لم أجد النسخة التلقائية. اختر ملفًا'); $('file').click(); }
};
const bkLabel = n => /^earnings-backup\.json$/.test(n) ? 'النسخة التلقائية'
  : /^earnings-snap-(\d)/.test(n) ? 'نسخة تلقائية سابقة ' + n.match(/snap-(\d)/)[1]
  : /^earnings-safe-(\d)/.test(n) ? 'نسخة أمان قبل نقص بيانات ' + n.match(/safe-(\d)/)[1]
  : /^earnings-before-restore/.test(n) ? 'قبل آخر استعادة' : 'نسخة يدوية';
async function listBackups() {
  const S = saf();
  if (bk.tree && S) { const r = await S.listFiles({ tree: bk.tree }); return (r.files || []).map(f => ({ name: f.name, uri: f.uri, modified: Number(f.modified) || 0 })); }
  const FS = plugin('Filesystem'); if (!FS) throw new Error('no fs');
  try { await FS.requestPermissions(); } catch (e) {}
  const r = await FS.readdir({ path: BK_DIR, directory: 'DOCUMENTS' });
  return (r.files || []).filter(f => /\.json$/i.test(f.name)).map(f => ({ name: f.name, uri: '', modified: Number(f.mtime) || 0 }));
}
$('bkList').onclick = async () => {
  try {
    const fs = (await listBackups()).sort((a, b) => b.modified - a.modified);
    $('filesList').innerHTML = fs.length ? fs.map(f => `<button data-name="${esc(f.name)}" data-uri="${esc(f.uri)}">${esc(bkLabel(f.name))}<br><small>${esc(f.name)}${f.modified ? ' • ' + new Date(f.modified).toLocaleString('ar-u-nu-latn') : ''}</small></button>`).join('') : emptyBox('file', 'لا توجد ملفات json في المجلد.');
    $('filesDlg').showModal();
  } catch (e) { toast(bk.tree ? 'تعذر قراءة المجلد. اخترْه من جديد' : 'لا توجد نسخ في المكان الافتراضي'); }
};
$('filesList').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  try { applyBackup(b.dataset.uri ? (await saf().readFile({ uri: b.dataset.uri })).data : await readFrom('docs', b.dataset.name)); } catch (err) { toast('تعذر قراءة الملف'); }
};
$('filesClose').onclick = () => $('filesDlg').close();
$('bkFile').onclick = () => $('file').click();
$('file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => applyBackup(r.result); r.readAsText(f);
  e.target.value = '';
};

// ---------- ودجت الشاشة الرئيسية (دخول/خروج بضغطة) ----------
let widgetReady = false, wsT;
function syncWidget() { // يعكس حالة الدخول الحالية والمجموع على الودجت
  if (!widgetReady) return;
  const W = nplug('WorkWidget'); if (!W) return;
  clearTimeout(wsT);
  wsT = setTimeout(() => {
    const o = state.open, dVal = due();
    try { W.setOpen(o ? { open: true, date: o.date, start: o.start, ts: new Date(o.date + 'T' + o.start).getTime(), brk: Math.round(brkNow()) } : { open: false }); } catch (e) {}
    try { W.setTotal({ text: signed(dVal).replace(/[\u2066\u2069]/g, ''), val: dVal, rate: state.rate, cur: state.currency }); } catch (e) {} // ودجت المجموع
  }, 200);
}
async function pullWidget() { // يستلم ما سجّله الودجت وهو مغلق التطبيق
  const W = nplug('WorkWidget');
  if (!W) { widgetReady = true; foregroundChecks(); return; }
  widgetReady = false;
  let evs = [];
  try {
    const r = await W.takeEvents(); let changed = false, msg = '', n = 0;
    evs = r.events || [];
    evs.forEach(ev => {
      if (ev.t === 'in') { if (!state.open) { state.open = { date: ev.date, start: ev.start }; changed = true; } }
      else if (ev.t === 'out') {
        const d0 = new Date(ev.date + 'T' + ev.start).getTime(), d1 = new Date(ev.date + 'T' + ev.end).getTime();
        let mins = Math.round(((d1 - d0) < 0 ? d1 - d0 + 864e5 : d1 - d0) / 60000); // من نصّي البداية والنهاية كما في النموذج
        if (isNaN(mins)) mins = Math.round((ev.endTs - ev.startTs) / 60000);
        changed = true;
        if (state.items.some(i => i.type === 'work' && i.date === ev.date && i.start === ev.start && i.end === ev.end)) state.open = null; // أُضيف سابقًا
        else if (!(mins > 0)) { state.open = null; msg = 'تجاهلتُ خروجًا من الودجت: المدة أقل من دقيقة'; }
        else if (mins > OPEN_WARN) { state.open = { ...(state.open || {}), date: ev.date, start: ev.start }; msg = 'الخروج من الودجت جاء بعد وقت طويل. سجّل الخروج يدويًا'; }
        else {
          const o0 = state.open && state.open.date === ev.date && state.open.start === ev.start ? state.open : null;
          let brk = o0 ? Math.round((o0.brk || 0) + (o0.bs ? Math.max(0, (ev.endTs - o0.bs) / 60000) : 0)) : 0;
          let brkWarn = false;
          if (o0 && o0.bs) brkWarn = true;
          if (brk >= mins) { brk = Math.round(o0 ? (o0.brk || 0) : 0); if (brk >= mins) brk = 0; brkWarn = true; }
          const net = mins - brk;
          state.items.push({ id: Date.now() + (n++), type: 'work', date: ev.date, note: '', remote: false, start: ev.start, end: ev.end, brk, mins: net, rate: state.rate, amount: net / 60 * state.rate });
          state.open = null;
          msg = brkWarn ? 'سُجّل اليوم من الودجت (كانت الاستراحة مفتوحة، راجع السجل)' : 'سُجّل يوم العمل من الودجت';
        }
      }
    });
    if (changed) save();
    if (msg) toast(msg);
  } catch (e) { evs = []; }
  // لا يمسح الودجت أحداثه إلا بعد مهلة من الحفظ؛ لو توقف التطبيق قبلها أُعيدت المعالجة (آمنة التكرار)
  const keys = evs.map(ev => ev.t + ':' + (ev.t === 'out' ? ev.endTs : ev.startTs));
  if (keys.length) setTimeout(() => { try { const p = W.ackEvents({ keys }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }, 8000);
  widgetReady = true; syncWidget(); foregroundChecks();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { Promise.resolve(pullWidget()).then(takeShortcut); refreshSysColor(); } });
(function () { const A = plugin('App'); if (A && A.addListener) A.addListener('appStateChange', st => { if (st && st.isActive) Promise.resolve(pullWidget()).then(takeShortcut); }); })();

// ---------- تنبيهات: نسخة احتياطية قديمة + نسيان الخروج ----------
const BK_STALE_DAYS = 3;
function checkBkStale() {
  const el = $('bkWarn'); if (!el) return;
  const days = lastBk.okAt ? (Date.now() - lastBk.okAt) / 864e5 : Infinity;
  const stale = !isEmpty(state) && days > BK_STALE_DAYS;
  el.hidden = !stale;
  if (!stale) return;
  const n = Math.floor(days);
  el.textContent = isFinite(days) ? `لم تُحفظ نسخة احتياطية ناجحة منذ ${n} ${n < 11 ? 'أيام' : 'يومًا'}. اضغط للتحقق.` : 'لا توجد نسخة احتياطية ناجحة مسجَّلة. اضغط للتحقق.';
}
$('bkWarn').onclick = () => $('menuBtn').onclick();
let forgetAsked = 0;
function checkForgot() {
  const h = state.forgetH, o = state.open;
  if (!o || !(h > 0) || !$('lock').hidden || document.querySelector('dialog[open]')) return;
  const m = elapsedMins();
  if (m < h * 60 || Date.now() - forgetAsked < 3600000) return;
  forgetAsked = Date.now();
  setTimeout(async () => {
    if (state.open && await ask('هل نسيت تسجيل الخروج؟', 'أنت مسجّل دخول منذ ' + Math.floor(m / 60) + ' ساعة (من ' + o.start + ').', { ok: 'سجّل الخروج الآن', cancel: 'ما زلت في العمل' })) { const b = $('clockOut'); if (b) b.click(); }
  }, 300);
}
function foregroundChecks() { try { checkBkStale(); checkForgot(); wfBadge(); wfOpenCheck(); } catch (e) {} }

// ---------- زر الرجوع ----------
let lastBack = 0;
function exitTwice() {
  const now = Date.now();
  if (now - lastBack < 2000) { const A = plugin('App'); if (A && A.exitApp) A.exitApp(); return; }
  lastBack = now; toast('اضغط رجوع مرة أخرى للخروج');
}
function handleBack() {
  if (!$('lock').hidden) return exitTwice();
  const open = [...document.querySelectorAll('dialog[open]')].pop();
  if (open) { if (open.id === 'menu') $('menuClose').onclick(); else open.close(); return; }
  if (view !== 'list') return setView('list');
  exitTwice();
}
(function () { const A = plugin('App'); if (A && A.addListener) A.addListener('backButton', handleBack); })();

applyTheme();
setMode('cur');
render();
showLock();
checkBio().then(tryBio);
Promise.resolve(pullWidget()).then(() => setTimeout(takeShortcut, 300));
refreshSysColor();

// ---------- تتبع الواي فاي ----------
let wfOnSaved = null, wfReturn = false, wfAll = [], wfMerge = {}, wfWork = [], wfRc = {};
const wfRcSel = {};
var wfChk = false;
const WF_GAP = 10 * 60000;
const WF_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const wfHM = t => { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const wfYMD = t => { const d = new Date(t); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const wfDoneSet = () => { try { return new Set(JSON.parse(localStorage.getItem('earnings_wf_done')) || []); } catch (e) { return new Set(); } };
const wfMarkDone = keys => { const s = wfDoneSet(); keys.forEach(k => s.add(k)); try { localStorage.setItem('earnings_wf_done', JSON.stringify([...s].slice(-400))); } catch (e) {} };
const wfIsDone = (x, done) => x.keys.every(k => done.has(k));
const wfSkipSet = () => { try { return new Set(JSON.parse(localStorage.getItem('earnings_wf_skip')) || []); } catch (e) { return new Set(); } };
const wfMarkSkip = keys => { const s = wfSkipSet(); keys.forEach(k => s.add(k)); try { localStorage.setItem('earnings_wf_skip', JSON.stringify([...s].slice(-400))); } catch (e) {} };
const wfSet = c => { let l = []; try { l = JSON.parse(c.workList || '[]'); } catch (e) {} if (!l.length && (c.workSsid || '').trim()) l = [c.workSsid]; return new Set(l.map(v => String(v).trim()).filter(Boolean)); };
const wfIsSkip = (x, sk) => { const s = sk || wfSkipSet(); return x.keys.every(k => s.has(k)); };

async function wfCfgShow() {
  const W = nplug('WifiTrack');
  if (!W) { $('wfInfo').textContent = 'متاح في التطبيق فقط'; return; }
  let c; try { c = await W.getConfig(); } catch (e) { return; }
  $('wfOn').checked = !!c.on; $('wfRootChk').checked = !!c.root;
  $('wfRootChk').disabled = !c.on; $('wfRootRow').style.opacity = c.on ? '' : '.5';
  const wl = [...wfSet(c)], ws = wl.length;
  $('wfInfo').innerHTML = 'شبكات العمل: ' + (ws ? wl.map(n => '<span style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--bd);border-radius:14px;padding:2px 10px;margin:2px">' + esc(n) + '<button type="button" class="wfx" data-ws="' + esc(n) + '" aria-label="حذف" style="background:none;border:0;color:inherit;padding:0 2px;font-size:14px">✕</button></span>').join(' ') : 'غير محدّدة') + (c.on && !c.root ? '<br>الروت مطفأ: لا يمكن معرفة اسم الشبكة، فتُسجَّل الأحداث بلا اسم.' : '') + (c.on && c.root && !ws ? '<br>اتصل بشبكة العمل ثم اضغط «أضف الشبكة الحالية».' : '') + (c.on ? '<br><small>آخر حدث من النظام: ' + (c.cbT ? wfHM(c.cbT) + ' (' + c.cbN + ')' : 'لا شيء') + '</small>' : '');
}
$('wfOn').onchange = async () => {
  const W = nplug('WifiTrack'), v = $('wfOn').checked;
  if (!W) { $('wfOn').checked = false; return toast('متاح في التطبيق فقط'); }
  try { await W.setConfig({ on: v }); } catch (e) { toast('تعذر الحفظ'); }
  wfCfgShow();
};
$('wfRootChk').onchange = async () => {
  const W = nplug('WifiTrack'), v = $('wfRootChk').checked;
  if (!W) { $('wfRootChk').checked = false; return; }
  try { await W.setConfig({ root: v }); if (v) toast('تم تفعيل الروت'); } catch (e) { toast('امنح الروت للتطبيق من مدير الروت ثم أعد المحاولة'); }
  wfCfgShow();
};
$('wfMark').onclick = async () => {
  const W = nplug('WifiTrack'); if (!W) return toast('متاح في التطبيق فقط');
  try { const r = await W.markWork(); toast('أُضيفت الشبكة: ' + String(r.ssid).trim()); }
  catch (e) { const m = (e && e.message) || e; toast(m === 'root-off' ? 'فعّل استعمال الروت أولًا' : m === 'no-wifi' ? 'لا يوجد اتصال واي فاي الآن' : m === 'full' ? 'الحد الأقصى 6 شبكات' : 'تعذرت القراءة'); }
  wfCfgShow();
};
$('wfInfo').addEventListener('click', async e => {
  const b = e.target.closest('.wfx'); if (!b) return;
  const W = nplug('WifiTrack'); if (!W) return;
  try { await W.removeWork({ ssid: b.dataset.ws }); toast('حُذفت الشبكة'); } catch (x) { toast('تعذر الحذف'); }
  wfCfgShow();
});
$('wfBat').onclick = async () => {
  const W = nplug('WifiTrack'); if (!W) return toast('متاح في التطبيق فقط');
  try { await W.batteryExempt(); toast('استُثني التطبيق من توفير البطارية'); }
  catch (e) { const m = (e && e.message) || e; toast(m === 'root-off' ? 'فعّل استعمال الروت أولًا' : 'تعذر الاستثناء'); }
};
$('wfClear').onclick = async () => {
  const W = nplug('WifiTrack'); if (!W) return;
  if (!(await ask('مسح أحداث الواي فاي؟', 'سجلاتك لن تتأثر.', { ok: 'مسح', danger: true }))) return;
  try { await W.clearEvents(); localStorage.removeItem('earnings_wf_done'); localStorage.removeItem('earnings_wf_skip'); toast('تم المسح'); wfBadge(); } catch (e) { toast('تعذر المسح'); }
};

function wfSessions(ev, now, ws) {
  const a = ev.slice().sort((x, y) => x.t - y.t), raw = []; let cur = null;
  for (const e of a) {
    if (e.k === 'c') { if (cur) raw.push({ ...cur, broken: true }); cur = { s: e.t, e: null, ssid: e.s || '', l: e.l === 1 }; }
    else if (e.k === 'd' && cur) { raw.push({ ...cur, e: e.t, ea: e.l === 2 }); cur = null; }
  }
  if (cur) raw.push({ ...cur, open: true });
  const out = [];
  for (const x of raw) {
    if (x.broken) continue;
    const p = out[out.length - 1];
    if (p && !p.open && p.e !== null && x.s - p.e < WF_GAP && (p.ssid === x.ssid || (ws && ws.has(p.ssid.trim()) && ws.has(x.ssid.trim())))) { p.e = x.e; p.open = !!x.open; p.ea = x.ea; p.keys.push(x.s); p.parts++; p.ps.push({ s: x.s, e: x.e }); }
    else out.push({ ...x, keys: [x.s], parts: 1, ps: [{ s: x.s, e: x.e }], open: !!x.open });
  }
  out.forEach(x => { x.pend = x.e !== null && !x.open && now - x.e < WF_GAP; });
  return out;
}
function wfRow(x, done, nb) {
  const dn = wfIsDone(x, done), sk = !dn && wfIsSkip(x);
  const t = (x.l ? '~' : '') + wfHM(x.s) + ' – ' + (x.open ? '…' : (x.ea ? '~' : '') + wfHM(x.e));
  let sub = x.open ? 'متصل الآن' : x.pend ? 'ينتظر تأكيد الخروج' : fmtDur((x.e - x.s) / 60000);
  if (x.parts > 1) sub += ' • دُمجت ' + x.parts + ' فترات';
  const pd = x.parts > 1 && x.ps ? '<details style="margin-top:4px;color:var(--mut);font-size:calc(13px*var(--fs,1))"><summary>تفاصيل الفترات</summary>' + x.ps.map((q, i) => '<div style="padding:2px 0">' + (i + 1) + '. <span dir="ltr">' + wfHM(q.s) + ' – ' + (q.e == null ? '…' : wfHM(q.e)) + '</span>' + (q.e == null ? '' : ' • ' + esc(fmtDur((q.e - q.s) / 60000))) + '</div>').join('') + '</details>' : '';
  const btn = dn ? '<span style="color:var(--mut)">أُضيفت</span>' : sk ? '<span style="color:var(--mut)">تُجوهلت</span>' : (x.open || x.pend || nb) ? '' : '<span class="acts" style="margin:0"><button class="ok" type="button" data-wfs="' + x.s + '">أضف</button><button type="button" data-wfk="' + x.s + '" style="flex:none;padding:0 12px;height:40px;color:var(--mut);font-weight:500">تجاهل</button></span>';
  return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--bd)' + (dn || sk ? ';opacity:.6' : '') + '"><div style="flex:1"><span dir="ltr" style="font-weight:700">' + t + '</span><div style="color:var(--mut);font-size:calc(13px*var(--fs,1))">' + esc(sub) + '</div>' + pd + '</div>' + btn + '</div>';
}
function wfBlock(list, done, rcOn) {
  const by = {}; list.forEach(x => { const k = wfYMD(x.s); (by[k] = by[k] || []).push(x); });
  return Object.keys(by).sort().reverse().slice(0, 14).map(day => {
    const L = by[day], d = new Date(day + 'T00:00:00');
    const dup = allItems().some(i => i.type === 'work' && i.date === day);
    const rc = rcOn ? wfRecon(day, L, done) : null; if (rc) wfRc[day] = rc;
    const ok = !rc && L.length >= 2 && L.every(x => !x.open && !x.pend && !wfIsDone(x, done) && !wfIsSkip(x));
    let mg = '';
    if (ok) {
      let brk = 0; for (let i = 1; i < L.length; i++) brk += L[i].s - L[i - 1].e;
      brk = Math.round(brk / 60000);
      wfMerge[day] = { s: L[0].s, e: L[L.length - 1].e, brk, keys: L.flatMap(x => x.keys) };
      mg = '<div class="acts" style="margin-top:6px"><button type="button" data-wfd="' + day + '">ادمج الفترات وأضف (استراحة ' + brk + ' د)</button></div>';
    }
    return '<div style="border:1px solid var(--bd);border-radius:14px;padding:10px 12px;margin:0 0 10px"><div style="font-weight:700;margin-bottom:2px">' + WF_DAYS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + (dup ? ' <small style="color:var(--mut);font-weight:400">• يوجد سجل بهذا اليوم</small>' : '') + '</div>' + L.map(x => wfRow(x, done, !!rc)).join('') + (rc ? wfRcHtml(rc) : '') + mg + '</div>';
  }).join('');
}
function wfIgnorable() {
  const done = wfDoneSet(), sk = wfSkipSet(), now = Date.now();
  return wfWork.filter(x => !x.open && !x.pend && now - x.s < 14 * 864e5 && !wfIsDone(x, done) && !wfIsSkip(x, sk));
}
async function wfRender() {
  const W = nplug('WifiTrack'), box = $('wfSugBody');
  if (!W) { box.textContent = 'متاح في التطبيق فقط'; return; }
  let cfg, ev;
  try { cfg = await W.getConfig(); ev = JSON.parse((await W.getEvents()).json || '[]'); } catch (e) { box.textContent = 'تعذرت قراءة السجل'; return; }
  const now = Date.now(), done = wfDoneSet(), ws = wfSet(cfg);
  wfAll = wfSessions(ev, now, ws); wfMerge = {}; wfRc = {};
  const work = wfAll.filter(x => x.ssid && ws.has(x.ssid.trim())), unk = wfAll.filter(x => !x.ssid);
  let h = '';
  if (!cfg.on) h += '<div class="info">التتبع مطفأ. فعّله من إعدادات الواي فاي.</div>';
  else if (cfg.root && !ws.size) h += '<div class="info">لم تُضَف شبكة عمل بعد. اتصل بها ثم اضغط «أضف الشبكة الحالية» في إعدادات الواي فاي.</div>';
  wfWork = work;
  const w = wfBlock(work, done, true);
  h += w || (cfg.on && (ws.size || !cfg.root) && !unk.length ? '<div class="info">لا توجد فترات بعد.</div>' : '');
  const ign = wfIgnorable();
  if (ign.length) h += '<button type="button" data-wfall="1" data-lbl="تجاهل الكل (' + ign.length + ')" style="width:100%;height:44px;border-radius:14px;border:1px solid var(--bd);background:var(--card2);color:var(--mut);margin:0 0 10px">تجاهل الكل (' + ign.length + ')</button>';
  if (unk.length) h += '<details style="margin-top:6px"><summary>شبكات غير محدّدة (' + unk.length + ')</summary>' + wfBlock(unk, done) + '</details>';
  box.innerHTML = h;
}
function wfOpen(day, s, e, brk, keys) {
  $('wfSug').close();
  openForm('work');
  $('fDate').value = day; $('fStart').value = wfHM(s); $('fEnd').value = wfHM(e); $('fBrk').value = brk || '';
  updDur();
  wfOnSaved = () => wfMarkDone(keys); wfReturn = true;
}
$('wfSugBody').onclick = e => {
  const rcc = e.target.closest('[data-rcc]'), rca = e.target.closest('[data-rca]'), rce = e.target.closest('[data-rce]'), rck = e.target.closest('[data-rck]');
  if (rcc) { const d = rcc.dataset.day, v = rcc.dataset.rcc; wfRcSel[d] = { ...(wfRcSel[d] || {}), [v[0]]: v[1] }; wfRender(); return; }
  if (rca) return wfRcApply(rca.dataset.rca, false);
  if (rce) return wfRcApply(rce.dataset.rce, true);
  if (rck) { const r = wfRc[rck.dataset.rck]; if (r) { wfMarkSkip(r.keys); toast('أُبقي السجل اليدوي'); wfRender(); wfBadge(); } return; }
  const a = e.target.closest('[data-wfs]'), m = e.target.closest('[data-wfd]'), k = e.target.closest('[data-wfk]'), all = e.target.closest('[data-wfall]');
  if (k) { const x = wfAll.find(y => y.s === Number(k.dataset.wfk)); if (x) { wfMarkSkip(x.keys); wfRender(); wfBadge(); } }
  else if (all) {
    if (!all.dataset.arm) { all.dataset.arm = '1'; all.textContent = 'اضغط مرة أخرى للتأكيد'; setTimeout(() => { if (all.isConnected) { all.dataset.arm = ''; all.textContent = all.dataset.lbl; } }, 3500); return; }
    const L = wfIgnorable(); L.forEach(x => wfMarkSkip(x.keys)); toast('تم تجاهل ' + L.length + ' فترات'); wfRender(); wfBadge();
  }
  else if (a) { const x = wfAll.find(y => y.s === Number(a.dataset.wfs)); if (x) wfOpen(wfYMD(x.s), x.s, x.e, 0, x.keys); }
  else if (m) { const g = wfMerge[m.dataset.wfd]; if (g) wfOpen(m.dataset.wfd, g.s, g.e, g.brk, g.keys); }
};
$('form').addEventListener('close', () => { wfOnSaved = null; if (wfReturn) { wfReturn = false; wfRender().then(() => $('wfSug').showModal()); } });
$('wfSugOpen').onclick = async () => { await wfRender(); $('wfSug').showModal(); };
$('wfSugClose').onclick = () => $('wfSug').close();
$('wfSug').addEventListener('close', wfBadge);
// بطاقة الشاشة الرئيسية: فترات شبكة العمل غير المضافة (آخر 14 يومًا)
async function wfBadge() {
  const el = $('wfCard'); if (!el) return;
  const W = nplug('WifiTrack'); if (!W) { el.hidden = true; return; }
  try {
    const cfg = await W.getConfig(), ws = wfSet(cfg);
    if (!cfg.on || !ws.size) { el.hidden = true; return; }
    const ev = JSON.parse((await W.getEvents()).json || '[]'), done = wfDoneSet(), sk = wfSkipSet(), now = Date.now();
    const n = wfSessions(ev, now, ws).filter(x => x.ssid && ws.has(x.ssid.trim()) && !x.open && !x.pend && now - x.s < 14 * 864e5 && !wfIsDone(x, done) && !wfIsSkip(x, sk)).length;
    el.hidden = !n;
    if (n) el.textContent = 'فترات واي فاي بانتظار المراجعة: ' + n + '. اضغط للمراجعة.';
  } catch (e) { el.hidden = true; }
}
$('wfCard').onclick = () => $('wfSugOpen').onclick();
setInterval(() => { if (!document.hidden) wfBadge(); }, 60000); // تحديث البطاقة والتطبيق مفتوح

// ---------- مطابقة السجل اليدوي/الودجت مع الواي فاي ----------
const wfAskedGet = k => { try { return new Set(JSON.parse(localStorage.getItem('earnings_wf_ask_' + k)) || []); } catch (e) { return new Set(); } };
function wfAskedMark(k, v) { const t = wfAskedGet(k); t.add(v); try { localStorage.setItem('earnings_wf_ask_' + k, JSON.stringify([...t].slice(-60))); } catch (e) {} }
async function wfCtx() { // فترات شبكات العمل فقط (التتبع مفعّل وشبكة محدّدة)
  const W = nplug('WifiTrack'); if (!W) return null;
  try {
    const cfg = await W.getConfig(); if (!cfg.on) return null;
    const ws = wfSet(cfg); if (!ws.size) return null;
    const ev = JSON.parse((await W.getEvents()).json || '[]'), now = Date.now();
    return { now, all: wfSessions(ev, now, ws).filter(x => x.ssid && ws.has(x.ssid.trim())) };
  } catch (e) { return null; }
}
const wfCover = (all, t) => all.find(s => s.s <= t + 60000 && (s.open || (s.e != null && s.e >= t - WF_GAP)));
async function wfArrival(tsIn) { // الفترة التي تشمل لحظة الدخول وبدأت قبلها بأكثر من 10 دقائق
  if (isNaN(tsIn)) return null;
  const c = await wfCtx(); if (!c) return null;
  const x = wfCover(c.all, tsIn);
  return x && tsIn - x.s > WF_GAP ? x : null;
}
async function wfOpenCheck() { // عند فتح التطبيق: دخول متأخر (مثلًا من الودجت) أو نسيان الخروج
  if (!state.open || wfChk || !nplug('WifiTrack')) return;
  wfChk = true;
  try {
    const c = await wfCtx(); if (!c) return;
    await new Promise(r => setTimeout(r, 900));
    const o = state.open;
    if (!o || !$('lock').hidden || document.querySelector('dialog[open]')) return;
    const st = new Date(o.date + 'T' + o.start).getTime(); if (isNaN(st)) return;
    const kin = o.date + ' ' + o.start;
    if (!wfAskedGet('in').has(kin)) {
      const x = wfCover(c.all, st);
      if (x && st - x.s > WF_GAP) {
        wfAskedMark('in', kin);
        const t = wfHM(x.s);
        if (await ask('وصلتَ إلى شبكة العمل قبل ' + fmtDur((st - x.s) / 60000), 'سُجّل الدخول ' + o.start + '. هل يبدأ الحساب من ' + t + '؟', { ok: 'ابدأ من ' + t, cancel: 'أبقِ ' + o.start }) && state.open) {
          state.open = { ...state.open, date: wfYMD(x.s), start: t }; wfAskedMark('in', wfYMD(x.s) + ' ' + t); save(); toast('تم تعديل وقت الدخول');
        }
        return;
      }
    }
    const last = c.all.filter(s => s.s >= st - WF_GAP).slice(-1)[0];
    if (last && !last.open && !last.pend && last.e != null && last.e > st && c.now - last.e > 30 * 60000 && !wfAskedGet('out').has(String(last.e))) {
      wfAskedMark('out', String(last.e));
      const t = wfHM(last.e);
      if (await ask('خرجتَ من شبكة العمل الساعة ' + t, 'ما زلتَ مسجّل دخول. هل تسجّل الخروج عند ' + t + '؟', { ok: 'سجّل الخروج ' + t, cancel: 'ما زلت في العمل' }) && state.open) {
        const oo = state.open, brk = Math.round((oo.brk || 0) + (oo.bs ? Math.max(0, (last.e - oo.bs) / 60000) : 0));
        openForm('work', null, { date: oo.date, start: oo.start, end: t, brk });
      }
    }
  } catch (e) {} finally { wfChk = false; }
}
const wfTs = (d, t) => new Date(d + 'T' + t).getTime();
function wfRecon(day, L, done) { // يقارن سجلًا يدويًا واحدًا بفترات الواي فاي لنفس اليوم
  if (L.some(x => x.open || x.pend || x.e == null)) return null;
  const sk = wfSkipSet(), S = L.filter(x => !wfIsSkip(x, sk));
  if (!S.length || S.every(x => wfIsDone(x, done))) return null;
  const ws = S[0].s, we = S[S.length - 1].e;
  const span = i => { const a = wfTs(i.date, i.start); let b = wfTs(i.date, i.end); if (b <= a) b += 864e5; return [a, b]; };
  const c = state.items.filter(i => i.type === 'work' && !i.remote && i.start && i.end && (([a, b]) => ws < b && a < we)(span(i)));
  if (c.length !== 1) return null;
  const it = c[0], [ms, me] = span(it);
  if (isNaN(ms) || isNaN(me)) return null;
  let wb = 0; for (let i = 1; i < S.length; i++) wb += (S[i].s - S[i - 1].e) / 60000;
  wb = Math.round(wb); const mb = Math.round(it.brk || 0);
  const nS = Math.abs(ws - ms) > WF_GAP, nE = Math.abs(we - me) > WF_GAP, nB = S.length >= 2 && Math.abs(wb - mb) > 10;
  if (!nS && !nE && !nB) return null; // الأوقات متقاربة: لا شيء يظهر
  return { day, it, ms, me, ws, we, mb, wb, nS, nE, nB, keys: S.flatMap(x => x.keys) };
}
function wfRcRes(r) {
  const s = wfRcSel[r.day] || {};
  const rs = r.nS && s.s === 'w' ? r.ws : r.ms, re = r.nE && s.e === 'w' ? r.we : r.me, rb = r.nB && s.b === 'w' ? r.wb : r.mb;
  return { rs, re, rb, mins: Math.round((re - rs) / 60000 - rb) };
}
function wfRcHtml(r) {
  const sel = wfRcSel[r.day] || {}, x = wfRcRes(r);
  const chip = (k, v, lbl, val, on) => '<button type="button" data-day="' + r.day + '" data-rcc="' + k + v + '" style="flex:1;min-height:44px;border-radius:12px;border:1px solid ' + (on ? 'var(--pri)' : 'var(--bd)') + ';background:' + (on ? 'var(--card2)' : 'transparent') + ';color:inherit;font-weight:' + (on ? 700 : 500) + '">' + lbl + '<br><span dir="ltr">' + val + '</span></button>';
  const row = (k, ttl, mv, wv) => { const w = sel[k] === 'w'; return '<div style="margin:8px 0 3px;color:var(--mut);font-size:calc(13px*var(--fs,1))">' + ttl + '</div><div style="display:flex;gap:8px">' + chip(k, 'm', 'يدوي', mv, !w) + chip(k, 'w', 'واي فاي', wv, w) + '</div>'; };
  const ok = x.mins > 0;
  return '<div style="margin-top:8px;padding:8px 10px;border-radius:12px;background:var(--card2)"><div style="font-weight:700">مطابقة اليوم</div><div style="color:var(--mut);font-size:calc(13px*var(--fs,1))">السجل يختلف عن الواي فاي. اختر الأصح:</div>'
    + (r.nS ? row('s', 'الدخول', r.it.start, wfHM(r.ws)) : '') + (r.nE ? row('e', 'الخروج', r.it.end, wfHM(r.we)) : '') + (r.nB ? row('b', 'الاستراحة', r.mb + ' د', r.wb + ' د') : '')
    + '<div style="margin:8px 0;font-weight:700">الناتج: <span dir="ltr">' + wfHM(x.rs) + ' – ' + wfHM(x.re) + '</span> • ' + (ok ? esc(fmtDur(x.mins)) : 'غير صالح') + (x.rb ? ' (استراحة ' + x.rb + ' د)' : '') + '</div>'
    + '<div class="acts" style="margin:0"><button class="ok" type="button" data-rca="' + r.day + '"' + (ok ? '' : ' disabled') + '>طبّق</button><button type="button" data-rce="' + r.day + '">عدّل</button><button type="button" data-rck="' + r.day + '">أبقِ اليدوي</button></div></div>';
}
async function wfRcApply(day, edit) {
  const r = wfRc[day]; if (!r) return;
  const x = wfRcRes(r), date = wfYMD(x.rs), st = wfHM(x.rs), en = wfHM(x.re);
  if (edit) {
    $('wfSug').close(); openForm('work', r.it);
    $('fDate').value = date; $('fStart').value = st; $('fEnd').value = en; $('fBrk').value = x.rb || '';
    updDur(); wfOnSaved = () => wfMarkDone(r.keys); wfReturn = true; return;
  }
  if (!(x.mins > 0)) return toast('الناتج غير صالح. راجع الاستراحة');
  const ov = findOverlap(date, st, en, r.it.id);
  if (ov && !(await ask('الوقت يتداخل مع سجل آخر', fmtDay(ov.date) + ' ' + ltr(ov.start + ' – ' + ov.end), { ok: 'طبّق رغم ذلك' }))) return;
  if (x.mins > LONG_MIN && !(await ask('مدة الوردية طويلة', 'مدتها ' + fmtDur(x.mins) + '. هل هي صحيحة؟', { ok: 'نعم، صحيحة', cancel: 'رجوع' }))) return;
  const rate = r.it.rate || state.rate, rec = { ...r.it, date, start: st, end: en, brk: x.rb, mins: x.mins, rate, amount: x.mins / 60 * rate };
  state.items = state.items.map(i => i.id === rec.id ? rec : i);
  wfMarkDone(r.keys); save(); toast('حُدّث السجل: ' + st + ' – ' + en); wfRender(); wfBadge();
}
