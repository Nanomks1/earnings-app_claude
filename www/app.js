const KEY = 'earnings_v1';
const BK_DIR = 'EarningsBackup';
const AUTO_NAME = 'earnings-backup.json';
const DEF_RATE = 10;
const DEF_COLOR = '#2c6e69';
const PALETTE = ['#2c6e69', '#3d6a8f', '#4a7c59', '#6b5b95', '#a0623a', '#a14d63', '#4b5563', '#7a6a3a'];
const WD = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function norm(d) {
  const s = { v: 5, items: [], archive: [], carry: 0, currency: 'DH', rate: DEF_RATE, auto: true, pin: '', bio: false, search: true, color: DEF_COLOR, open: null, forgetH: 12, fs: 0 };
  if (!d || typeof d !== 'object') return s;
  if (typeof d.currency === 'string') s.currency = d.currency;
  if (Number(d.rate) > 0) s.rate = Number(d.rate);
  s.auto = d.auto !== false;
  s.pin = typeof d.pin === 'string' ? d.pin : '';
  s.bio = d.bio === true;
  s.search = d.search !== false;
  s.carry = Number(d.carry) || 0;
  s.forgetH = d.forgetH === undefined ? 12 : Math.max(0, Math.min(48, Math.round(Number(d.forgetH)) || 0));
  s.fs = [0, 1, 2].includes(Number(d.fs)) ? Number(d.fs) : 0;
  if (/^#[0-9a-f]{6}$/i.test(d.color || '')) s.color = d.color;
  if (d.open && d.open.date && d.open.start) s.open = { date: d.open.date, start: d.open.start };
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
  return s;
}
let state;
try { state = norm(JSON.parse(localStorage.getItem(KEY))); } catch (e) { state = norm(null); }
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

function save(noBackup) {
  localStorage.setItem(KEY, JSON.stringify(state));
  render(); syncWidget();
  if (state.auto && !noBackup) { clearTimeout(bkTimer); bkTimer = setTimeout(autoBackup, 800); }
}

// ---------- الألوان وشريط الحالة ----------
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = a => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const isDark = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme() {
  const base = state.color || DEF_COLOR, dark = isDark(), [r, g, b] = hex2rgb(base);
  const pri = dark ? mix(base, '#000000', .3) : base;
  const root = document.documentElement.style, set = (k, v) => root.setProperty(k, v);
  set('--pri', pri);
  set('--fs', [1, 1.1, 1.2][state.fs || 0]);
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
  $('sw').innerHTML = PALETTE.map(c => `<button data-c="${c}" style="background:${c}" class="${c.toLowerCase() === state.color.toLowerCase() ? 'sel' : ''}" aria-label="لون"></button>`).join('')
    + `<input type="color" id="colCustom" value="${state.color}" aria-label="لون مخصص">`;
}
$('sw').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  state.color = b.dataset.c; applyTheme(); buildSwatches(); localStorage.setItem(KEY, JSON.stringify(state));
};
$('sw').addEventListener('input', e => {
  if (e.target.id !== 'colCustom') return;
  state.color = e.target.value; applyTheme(); localStorage.setItem(KEY, JSON.stringify(state));
  [...document.querySelectorAll('#sw button')].forEach(b => b.classList.remove('sel'));
});

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
function renderShift() {
  const o = state.open;
  $('shift').innerHTML = !o
    ? `<button class="clock" id="clockIn"><span class="bub">${ic('play')}</span><span><b>تسجيل دخول العمل</b><small>اضغط عند وصولك للعمل</small></span></button>`
    : `<div class="open"><div class="top"><span class="pulse"></span><div style="flex:1"><b>أنت الآن في العمل</b><br><small>دخلت <span dir="ltr">${o.start}</span></small></div><div class="el num" id="elapsed">${fmtHM(elapsedMins())}</div></div>
       ${elapsedMins() > OPEN_WARN ? '<div class="note warn" id="openWarn">مضى وقت طويل على الدخول. تأكد من وقت الخروج.</div>' : ''}
       <div class="btns"><button id="clockOut">${ic('stop')}تسجيل الخروج</button><button id="clockCancel" aria-label="إلغاء">${ic('x')}</button></div></div>`;
}
setInterval(() => {
  const e = $('elapsed'); if (!e || !state.open) return;
  e.textContent = fmtHM(elapsedMins());
  if ((elapsedMins() > OPEN_WARN) !== !!$('openWarn')) renderShift();
}, 30000);
$('shift').onclick = e => {
  const id = e.target.closest('button') && e.target.closest('button').id;
  if (id === 'clockIn') { $('iDate').value = today(); $('iTime').value = nowTime(); $('inDlg').showModal(); }
  else if (id === 'clockOut') {
    const long = elapsedMins() > 1440;
    openForm('work', null, { date: state.open.date, start: state.open.start, end: long ? '' : nowTime() });
    if (long) $('fDur').textContent = 'مضى أكثر من 24 ساعة على الدخول. أدخل وقت الخروج الصحيح.';
    else if (elapsedMins() > OPEN_WARN) $('fDur').textContent += ' — مدة طويلة، راجع وقت الخروج.';
  }
  else if (id === 'clockCancel') { if (confirm('إلغاء تسجيل الدخول الحالي؟')) { state.open = null; save(); } }
};
$('iCancel').onclick = () => $('inDlg').close();
$('iOk').onclick = () => {
  if (!$('iDate').value || !toMin($('iTime').value) && $('iTime').value !== '00:00') return toast('أدخل التاريخ والوقت');
  state.open = { date: $('iDate').value, start: $('iTime').value };
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
  return periodText('ملخص العمل', ['🗓 ' + head], list, withDetail === undefined ? $('sDetail').checked : withDetail, null, netKey(list), true);
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
async function doShare(text) {
  const S = plugin('Share');
  try {
    if (S) await S.share({ title: 'العمل', text, dialogTitle: 'مشاركة' });
    else if (navigator.share) await navigator.share({ title: 'العمل', text });
    else { await navigator.clipboard.writeText(text); toast('تم نسخ النص'); }
  } catch (e) {}
}
let pendingShare = null, pendingPdf = null;
function askShare(title, build, pdf) {
  pendingShare = build; pendingPdf = pdf || null;
  $('shPdfRow').style.display = pdf ? '' : 'none';
  $('shTitle').textContent = title;
  $('shDetail').checked = localStorage.getItem('earnings_sd') !== '0';
  $('shDlg').showModal();
}
$('shCancel').onclick = () => $('shDlg').close();
$('shGo').onclick = async () => {
  const d = $('shDetail').checked; localStorage.setItem('earnings_sd', d ? '1' : '0');
  const text = pendingShare(d); $('shDlg').close(); await doShare(text);
};
$('shPdf').onclick = async () => {
  const d = $('shDetail').checked; localStorage.setItem('earnings_sd', d ? '1' : '0');
  const p = pendingPdf(d); $('shDlg').close(); await sharePdf(p.cfg, p.name);
};
$('shCopy').onclick = async () => {
  const d = $('shDetail').checked; localStorage.setItem('earnings_sd', d ? '1' : '0');
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
$('sShare').onclick = () => doShare(summaryText());

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
function reportPages(cfg) {
  const items = cfg.items;
  if (!items.length) return null;
  const c = calc(items), W = 1240, H = 1754, M = 80, R = W - M, dk = isDark(), INK = dk ? '#e8eaed' : '#1b1f24', GR = dk ? '#9aa3ad' : '#6b7280', PG = dk ? '#14181d' : '#ffffff', HB = dk ? '#242a31' : '#eef1f4', LN = dk ? '#2e353d' : '#e5e8ec', RD = dk ? '#f87171' : '#b91c1c', pages = [];
  let cv, x, y;
  const T = (s, px, wt, dir, al, xx, yy, col) => { x.font = wt + ' ' + px + 'px sans-serif'; x.direction = dir; x.textAlign = al; x.fillStyle = col || INK; x.fillText(s, xx, yy); };
  const cols = [['date', 300], ['type', 130], ['from', 120], ['to', 120], ['brk', 130], ['hrs', 130], ['amt', 150]];
  let cum = 0; cols.forEach(k => { k.push(R - cum, R - cum - k[1] / 2); cum += k[1]; });
  const head = () => {
    x.fillStyle = HB; x.fillRect(M, y - 38, W - 2 * M, 54);
    const names = ['التاريخ', 'النوع', 'من', 'إلى', 'استراحة', 'الساعات', 'المبلغ' + (state.currency ? ' (' + state.currency + ')' : '')];
    cols.forEach((k, i) => i === 0 ? T(names[i], 26, '700', 'rtl', 'right', k[2] - 12, y, INK) : T(names[i], 26, '700', 'rtl', 'center', k[3], y, INK));
    y += 56;
  };
  const newPage = first => { cv = document.createElement('canvas'); cv.width = W; cv.height = H; x = cv.getContext('2d'); x.fillStyle = PG; x.fillRect(0, 0, W, H); pages.push(cv); y = 120; if (!first) head(); };
  newPage(true);
  T(cfg.title, 54, '700', 'rtl', 'right', R, y, INK); y += 64;
  if (cfg.sub) { T(cfg.sub, 30, '400', 'rtl', 'right', R, y, GR); y += 54; }
  const sum = [['عدد الأيام', ltr(String(c.days))], ['ساعات العمل', ltr(fmtHM(c.mins))], ['أجر العمل بالساعات', money(c.work - c.ramt)]];
  if (c.ramt) sum.push(['أجر العمل عن بعد', money(c.ramt)]);
  if (c.adv) sum.push(['الكريدي', '−' + money(c.adv)]);
  sum.push(['الصافي', money(c.work - c.adv), true]);
  (cfg.extra || []).forEach(r => sum.push(r));
  sum.forEach(([k, v, b]) => { T(k + ': ' + v, 32, b ? '700' : '400', 'rtl', 'right', R, y, INK); y += 46; });
  if (cfg.detail) { y += 40; head(); }
  (cfg.detail ? items : []).forEach(i => {
    if (y > H - 130) newPage(false);
    const wk = i.type === 'work' && !i.remote, d = dt(i.date).toLocaleDateString('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
    const v = [d, i.type === 'adv' ? 'كريدي' : i.remote ? 'عن بعد' : 'عمل', wk && i.start || '—', wk && i.end || '—', wk && i.brk ? i.brk + ' د' : '—', wk ? fmtHM(i.mins) : '—', (i.type === 'adv' ? '−' : '') + num(i.amount)];
    cols.forEach((k, j) => j === 0 ? T(v[j], 27, '400', 'rtl', 'right', k[2] - 12, y, INK) : T(v[j], 27, '400', j === 1 ? 'rtl' : 'ltr', 'center', k[3], y, i.type === 'adv' && j === 6 ? RD : INK));
    x.fillStyle = LN; x.fillRect(M, y + 16, W - 2 * M, 2); y += 54;
  });
  pages.forEach((p, k) => { x = p.getContext('2d'); T('صفحة ' + (k + 1) + ' من ' + pages.length, 22, '400', 'rtl', 'center', W / 2, H - 50, GR); });
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
  $('fBrk').value = item && item.brk || '';
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
$('fSave').onclick = () => {
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
      const same = $('fStart').value === $('fEnd').value;
      if (same ? !confirm('البداية تساوي النهاية، وستُحسب المدة 24 ساعة. متابعة؟') : m > LONG_MIN && !confirm('مدة الوردية ' + fmtDur(m) + '، وهي طويلة. هل هي صحيحة؟')) return;
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
$('fDel').onclick = () => {
  const it = editing;
  state.items = state.items.filter(i => i.id !== it.id);
  $('form').close(); save();
  undoBar('تم حذف السجل', () => { if (!state.items.some(i => i.id === it.id)) { state.items = [...state.items, it]; save(); toast('تمت استعادة السجل'); } });
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
$('pOk').onclick = () => {
  const r = parseFloat($('pRecv').value), paidAt = $('pDate').value;
  if (isNaN(r) || r < 0 || !paidAt) return toast('أدخل التاريخ والمبلغ');
  if (!confirm('تأكيد استلام ' + num(r) + cur() + '؟ ستنتقل الفترة الحالية إلى الأرشيف.')) return;
  const c = calc(state.items), d = due();
  state.archive.push({ id: Date.now(), paidAt, due: d, received: r, carryIn: state.carry, remain: round2(d - r),
    note: $('pNote').value.trim(), items: state.items, work: c.work, adv: c.adv, mins: c.mins, days: c.days });
  state.carry = round2(d - r);
  state.items = [];
  $('payDlg').close(); save(); setView('arc'); toast('تم الاستلام ونُقلت الفترة إلى الأرشيف');
};
$('arch').onclick = e => {
  if (e.target.closest('#shareAll')) { askShare('مشاركة كل الدفعات', d => archivesText(d)); return; }
  const ed = e.target.closest('.ed1');
  if (ed) { const a = state.archive.find(x => x.id == ed.dataset.id); if (a) openAp(a); return; }
  const s1 = e.target.closest('.sh1');
  if (s1) { const a = state.archive.find(x => x.id == s1.dataset.id); if (a) askShare('مشاركة الدفعة', d => archiveText(a, d), d => ({ cfg: archiveCfg(a, d), name: 'work-batch-' + a.paidAt + '.pdf' })); return; }
  if (!e.target.closest('#undoPay')) return;
  if (!confirm('التراجع عن آخر دفعة؟ ستعود أيامها إلى الفترة الحالية.')) return;
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
$('aOk').onclick = () => {
  const a = apEdit, r = parseFloat($('aRecv').value), paidAt = $('aDate').value;
  if (!a || isNaN(r) || r < 0 || !paidAt) return toast('أدخل التاريخ والمبلغ');
  const delta = round2(r - a.received);
  if (delta && !confirm('تغيير المبلغ المستلم بمقدار ' + signed(delta) + ' سيعدّل الرصيد المرحَّل بعده. متابعة؟')) return;
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
async function hashPin(p) {
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('work|' + p));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  return 'x' + p;
}
let entered = '', hiddenAt = 0, pinFail = {};
try { pinFail = JSON.parse(localStorage.getItem('earnings_pinfail')) || {}; } catch (e) {}
const savePinFail = () => { try { localStorage.setItem('earnings_pinfail', JSON.stringify(pinFail)); } catch (e) {} };
(function buildPad() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  $('pad').innerHTML = keys.map((k, n) => k ? `<button data-k="${k}">${k}</button>` : n === 9 ? `<button data-k="bio" id="bioKey" aria-label="بصمة" style="visibility:hidden">${ic('finger')}</button>` : '<span></span>').join('');
})();
function drawDots() { [...document.querySelectorAll('#lock .dots span')].forEach((s, i) => s.classList.toggle('on', i < entered.length)); }
function showLock() { if (!state.pin) return; entered = ''; drawDots(); bioKeyShow(); $('lock').hidden = false; tryBio(); }
$('pad').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.dataset.k;
  if (k === 'bio') return tryBio();
  if (Date.now() < (pinFail.until || 0)) return toast('محاولات كثيرة. انتظر ' + Math.ceil((pinFail.until - Date.now()) / 1000) + ' ثانية');
  if (k === '⌫') entered = entered.slice(0, -1); else if (entered.length < 4) entered += k;
  drawDots();
  if (entered.length === 4) {
    if (await hashPin(entered) === state.pin) { $('lock').hidden = true; setTimeout(checkForgot, 400); entered = ''; pinFail = {}; savePinFail(); }
    else {
      pinFail.n = (pinFail.n || 0) + 1;
      if (pinFail.n % 5 === 0) { const sec = Math.min(30 * (pinFail.n / 5), 600); pinFail.until = Date.now() + sec * 1000; toast('5 محاولات خاطئة. انتظر ' + sec + ' ثانية'); }
      savePinFail();
      $('lock').classList.add('shake'); setTimeout(() => { $('lock').classList.remove('shake'); entered = ''; drawDots(); }, 350); }
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (state.pin && hiddenAt && Date.now() - hiddenAt > 30000) showLock();
});

function openPin() {
  ['pinOld', 'pinNew', 'pinNew2'].forEach(i => $(i).value = '');
  $('pinOldWrap').hidden = !state.pin; $('pinRemove').hidden = !state.pin;
  $('pinDlg').showModal();
}
$('pinBtn').onclick = openPin;
$('pinCancel').onclick = () => $('pinDlg').close();
async function pinOldOk() { return !state.pin || (await hashPin($('pinOld').value)) === state.pin; }
$('pinSave').onclick = async () => {
  if (!(await pinOldOk())) return toast('الرمز الحالي غير صحيح');
  const a = $('pinNew').value;
  if (!/^\d{4}$/.test(a)) return toast('الرمز يجب أن يكون 4 أرقام');
  if (a !== $('pinNew2').value) return toast('التأكيد غير مطابق');
  state.pin = await hashPin(a); $('pinDlg').close(); save(); updPinLabel(); toast('تم حفظ الرمز');
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
  updFs(); updIc(); updWg(); updPinLabel(); $('bioRow').hidden = !bioOk; $('bioChk').checked = !!state.bio; updBkWhere(); updEnc(); buildSwatches(); showVer(); $('menu').showModal();
};
async function showVer() { // رقم النسخة من التطبيق نفسه (يتغير مع كل بناء)
  const A = plugin('App'); if (!A || !A.getInfo) return;
  try { const i = await A.getInfo(); $('appVer').textContent = 'النسخة ' + ltr(i.version + (i.build ? ' (' + i.build + ')' : '')); $('appVer').hidden = false; } catch (e) {}
}
$('menuClose').onclick = () => {
  if (mPage) { mGo(''); return; }
  state.currency = $('cur').value.trim();
  const r = parseFloat($('rate').value); if (r > 0) state.rate = r;
  state.auto = $('auto').checked;
  const fh = parseInt($('forgetH').value, 10); if (!isNaN(fh)) state.forgetH = Math.max(0, Math.min(48, fh));
  $('menu').close(); save(); checkForgot();
};

function updFs() { [...$('fsSeg').children].forEach(b => b.classList.toggle('on', +b.dataset.v === (state.fs || 0))); }
$('fsSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.fs = +b.dataset.v; applyTheme(); updFs(); localStorage.setItem(KEY, JSON.stringify(state)); };

// ---------- أيقونة التطبيق (شكلان × ثمانية ألوان) ----------
const IC_KEY = 'earnings_icon';
const icPref = { style: 'a', follow: true, idx: 0, applied: 'a0' };
try { Object.assign(icPref, JSON.parse(localStorage.getItem(IC_KEY)) || {}); } catch (e) {}
const icSave = () => { try { localStorage.setItem(IC_KEY, JSON.stringify(icPref)); } catch (e) {} };
function nearestColor(hex) {
  const t = hex2rgb(hex); let bi = 0, bd = 1e9;
  PALETTE.forEach((p, i) => { const r = hex2rgb(p), d = (r[0] - t[0]) ** 2 + (r[1] - t[1]) ** 2 + (r[2] - t[2]) ** 2; if (d < bd) { bd = d; bi = i; } });
  return bi;
}
let icTimer;
function iconSync() {
  if (!isNative()) return;
  if (icPref.follow) icPref.idx = nearestColor(state.color || DEF_COLOR);
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
const WG_KEY = 'earnings_wg2';
const wgPref = { bg: 0, fg: 0, ic: 0, label: true };
try { Object.assign(wgPref, JSON.parse(localStorage.getItem(WG_KEY)) || {}); } catch (e) {}
function wgApply() {
  try { localStorage.setItem(WG_KEY, JSON.stringify(wgPref)); } catch (e) {}
  const W = nplug('WorkWidget'); if (W && W.setStyle) { try { W.setStyle(wgPref); } catch (e) {} }
}
function updWg() {
  $('wgBox').hidden = !isNative(); $('rowWg').hidden = !isNative();
  [['wgBg', 'bg'], ['wgFg', 'fg'], ['wgIc', 'ic']].forEach(([id, k]) => [...$(id).children].forEach(b => b.classList.toggle('on', +b.dataset.v === wgPref[k])));
  $('wgLabel').checked = wgPref.label;
}
[['wgBg', 'bg'], ['wgFg', 'fg'], ['wgIc', 'ic']].forEach(([id, k]) => {
  $(id).onclick = e => { const b = e.target.closest('button'); if (!b) return; wgPref[k] = +b.dataset.v; wgApply(); updWg(); };
});
$('wgLabel').onchange = () => { wgPref.label = $('wgLabel').checked; wgApply(); };

// ---------- النسخ الاحتياطي ----------
const stamp = () => { const d = new Date(); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()); };
const payload = () => JSON.stringify({ app: 'earnings', version: 5, savedAt: new Date().toISOString(), ...state }, null, 1);
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
$('encSave').onclick = () => {
  const a = $('encPw').value;
  if (!(window.crypto && crypto.subtle)) return toast('التشفير غير متاح على هذا الجهاز');
  if (a.length < 6) return toast('كلمة السر 6 أحرف على الأقل');
  if (a !== $('encPw2').value) return toast('التأكيد غير مطابق');
  if (!confirm('تنبيه: إن نسيت كلمة السر لا يمكن استرجاع النسخ المشفرة أبدًا. متابعة؟')) return;
  enc = { on: true, pw: a }; saveEnc(); $('encDlg').close(); updEnc(); autoBackup(); toast('تم تفعيل تشفير النسخ الاحتياطي');
};
$('encOff').onclick = () => {
  if (!confirm('إيقاف التشفير؟ ستُحفظ النسخ القادمة بدون تشفير.')) return;
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

async function applyBackup(text) {
  try {
    const d = await readBackup(text);
    if (!d) return;
    if (!Array.isArray(d.items)) throw 0;
    if (!confirm('سيتم استبدال البيانات الحالية بالنسخة الاحتياطية. متابعة؟')) return;
    if (isNative() && !isEmpty(state)) { // نسخة من بياناتك الحالية قبل استبدالها
      try { await putFile('earnings-before-restore-' + stamp() + '.json', await backupText()); }
      catch (e) { if (!confirm('تعذر حفظ نسخة من بياناتك الحالية قبل الاستعادة. متابعة رغم ذلك؟')) return; }
    }
    clearTimeout(bkTimer);
    const keepPin = state.pin, keepBio = state.bio;
    state = norm(d); state.bio = keepBio;
    if (typeof d.pin !== 'string') state.pin = keepPin;
    applyTheme(); save(true); $('menu').close(); $('filesDlg').close(); toast('تمت الاستعادة');
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
function syncWidget() { // يعكس حالة الدخول الحالية على الودجت
  if (!widgetReady) return;
  const W = nplug('WorkWidget'); if (!W) return;
  clearTimeout(wsT);
  wsT = setTimeout(() => {
    const o = state.open;
    try { W.setOpen(o ? { open: true, date: o.date, start: o.start, ts: new Date(o.date + 'T' + o.start).getTime() } : { open: false }); } catch (e) {}
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
        const mins = Math.round((ev.endTs - ev.startTs) / 60000);
        changed = true;
        if (state.items.some(i => i.type === 'work' && i.date === ev.date && i.start === ev.start && i.end === ev.end)) state.open = null; // أُضيف سابقًا
        else if (!(mins > 0)) { state.open = null; msg = 'تجاهلتُ خروجًا من الودجت: المدة أقل من دقيقة'; }
        else if (mins > OPEN_WARN) { state.open = { date: ev.date, start: ev.start }; msg = 'الخروج من الودجت جاء بعد وقت طويل. سجّل الخروج يدويًا'; }
        else {
          state.items.push({ id: Date.now() + (n++), type: 'work', date: ev.date, note: '', remote: false, start: ev.start, end: ev.end, brk: 0, mins, rate: state.rate, amount: mins / 60 * state.rate });
          state.open = null; msg = 'سُجّل يوم العمل من الودجت';
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) pullWidget(); });
(function () { const A = plugin('App'); if (A && A.addListener) A.addListener('appStateChange', st => { if (st && st.isActive) pullWidget(); }); })();

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
  setTimeout(() => {
    if (state.open && confirm('أنت مسجّل دخول منذ ' + Math.floor(m / 60) + ' ساعة (من ' + o.start + '). هل نسيت تسجيل الخروج؟\n\nموافق = تسجيل الخروج الآن')) { const b = $('clockOut'); if (b) b.click(); }
  }, 300);
}
function foregroundChecks() { try { checkBkStale(); checkForgot(); wfBadge(); } catch (e) {} }

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
pullWidget();

// ---------- تتبع الواي فاي ----------
let wfOnSaved = null, wfReturn = false, wfAll = [], wfMerge = {};
const WF_GAP = 10 * 60000;
const WF_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const wfHM = t => { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const wfYMD = t => { const d = new Date(t); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const wfDoneSet = () => { try { return new Set(JSON.parse(localStorage.getItem('earnings_wf_done')) || []); } catch (e) { return new Set(); } };
const wfMarkDone = keys => { const s = wfDoneSet(); keys.forEach(k => s.add(k)); try { localStorage.setItem('earnings_wf_done', JSON.stringify([...s].slice(-400))); } catch (e) {} };
const wfIsDone = (x, done) => x.keys.every(k => done.has(k));

async function wfCfgShow() {
  const W = nplug('WifiTrack');
  if (!W) { $('wfInfo').textContent = 'متاح في التطبيق فقط'; return; }
  let c; try { c = await W.getConfig(); } catch (e) { return; }
  $('wfOn').checked = !!c.on; $('wfRootChk').checked = !!c.root;
  $('wfRootChk').disabled = !c.on; $('wfRootRow').style.opacity = c.on ? '' : '.5';
  const ws = (c.workSsid || '').trim();
  $('wfInfo').innerHTML = 'شبكة العمل: ' + (ws ? esc(ws) : 'غير محدّدة') + (c.on && !c.root ? '<br>الروت مطفأ: لا يمكن معرفة اسم الشبكة، فتُسجَّل الأحداث بلا اسم.' : '') + (c.on && c.root && !ws ? '<br>اتصل بشبكة العمل ثم اضغط «اعتمد الشبكة الحالية».' : '') + (c.on ? '<br><small>آخر حدث من النظام: ' + (c.cbT ? wfHM(c.cbT) + ' (' + c.cbN + ')' : 'لا شيء') + '</small>' : '');
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
  try { const r = await W.markWork(); toast('اعتُمدت الشبكة: ' + String(r.ssid).trim()); }
  catch (e) { const m = (e && e.message) || e; toast(m === 'root-off' ? 'فعّل استعمال الروت أولًا' : m === 'no-wifi' ? 'لا يوجد اتصال واي فاي الآن' : 'تعذرت القراءة'); }
  wfCfgShow();
};
$('wfBat').onclick = async () => {
  const W = nplug('WifiTrack'); if (!W) return toast('متاح في التطبيق فقط');
  try { await W.batteryExempt(); toast('استُثني التطبيق من توفير البطارية'); }
  catch (e) { const m = (e && e.message) || e; toast(m === 'root-off' ? 'فعّل استعمال الروت أولًا' : 'تعذر الاستثناء'); }
};
$('wfClear').onclick = async () => {
  const W = nplug('WifiTrack'); if (!W) return;
  if (!confirm('مسح كل أحداث الواي فاي المسجّلة؟ سجلاتك لن تتأثر.')) return;
  try { await W.clearEvents(); localStorage.removeItem('earnings_wf_done'); toast('تم المسح'); wfBadge(); } catch (e) { toast('تعذر المسح'); }
};

function wfSessions(ev, now) {
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
    if (p && !p.open && p.e !== null && x.s - p.e < WF_GAP && p.ssid === x.ssid) { p.e = x.e; p.open = !!x.open; p.ea = x.ea; p.keys.push(x.s); p.parts++; }
    else out.push({ ...x, keys: [x.s], parts: 1, open: !!x.open });
  }
  out.forEach(x => { x.pend = x.e !== null && !x.open && now - x.e < WF_GAP; });
  return out;
}
function wfRow(x, done) {
  const dn = wfIsDone(x, done);
  const t = (x.l ? '~' : '') + wfHM(x.s) + ' – ' + (x.open ? '…' : (x.ea ? '~' : '') + wfHM(x.e));
  let sub = x.open ? 'متصل الآن' : x.pend ? 'ينتظر تأكيد الخروج' : fmtDur((x.e - x.s) / 60000);
  if (x.parts > 1) sub += ' • دُمجت ' + x.parts + ' فترات';
  const btn = dn ? '<span style="color:var(--mut)">أُضيفت</span>' : (x.open || x.pend) ? '' : '<span class="acts" style="margin:0"><button class="ok" type="button" data-wfs="' + x.s + '">أضف</button></span>';
  return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--bd)' + (dn ? ';opacity:.6' : '') + '"><div style="flex:1"><span dir="ltr" style="font-weight:700">' + t + '</span><div style="color:var(--mut);font-size:calc(13px*var(--fs,1))">' + esc(sub) + '</div></div>' + btn + '</div>';
}
function wfBlock(list, done) {
  const by = {}; list.forEach(x => { const k = wfYMD(x.s); (by[k] = by[k] || []).push(x); });
  return Object.keys(by).sort().reverse().slice(0, 14).map(day => {
    const L = by[day], d = new Date(day + 'T00:00:00');
    const dup = allItems().some(i => i.type === 'work' && i.date === day);
    const ok = L.length >= 2 && L.every(x => !x.open && !x.pend && !wfIsDone(x, done));
    let mg = '';
    if (ok) {
      let brk = 0; for (let i = 1; i < L.length; i++) brk += L[i].s - L[i - 1].e;
      brk = Math.round(brk / 60000);
      wfMerge[day] = { s: L[0].s, e: L[L.length - 1].e, brk, keys: L.flatMap(x => x.keys) };
      mg = '<div class="acts" style="margin-top:6px"><button type="button" data-wfd="' + day + '">ادمج الفترات وأضف (استراحة ' + brk + ' د)</button></div>';
    }
    return '<div style="border:1px solid var(--bd);border-radius:14px;padding:10px 12px;margin:0 0 10px"><div style="font-weight:700;margin-bottom:2px">' + WF_DAYS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + (dup ? ' <small style="color:var(--mut);font-weight:400">• يوجد سجل بهذا اليوم</small>' : '') + '</div>' + L.map(x => wfRow(x, done)).join('') + mg + '</div>';
  }).join('');
}
async function wfRender() {
  const W = nplug('WifiTrack'), box = $('wfSugBody');
  if (!W) { box.textContent = 'متاح في التطبيق فقط'; return; }
  let cfg, ev;
  try { cfg = await W.getConfig(); ev = JSON.parse((await W.getEvents()).json || '[]'); } catch (e) { box.textContent = 'تعذرت قراءة السجل'; return; }
  const now = Date.now(), done = wfDoneSet(), ws = (cfg.workSsid || '').trim();
  wfAll = wfSessions(ev, now); wfMerge = {};
  const work = wfAll.filter(x => x.ssid && ws && x.ssid.trim() === ws), unk = wfAll.filter(x => !x.ssid);
  let h = '';
  if (!cfg.on) h += '<div class="info">التتبع مطفأ. فعّله من إعدادات الواي فاي.</div>';
  else if (cfg.root && !ws) h += '<div class="info">لم تُعتمد شبكة العمل بعد. اتصل بها ثم اضغط «اعتمد الشبكة الحالية» في إعدادات الواي فاي.</div>';
  const w = wfBlock(work, done);
  h += w || (cfg.on && (ws || !cfg.root) && !unk.length ? '<div class="info">لا توجد فترات بعد.</div>' : '');
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
  const a = e.target.closest('[data-wfs]'), m = e.target.closest('[data-wfd]');
  if (a) { const x = wfAll.find(y => y.s === Number(a.dataset.wfs)); if (x) wfOpen(wfYMD(x.s), x.s, x.e, 0, x.keys); }
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
    const cfg = await W.getConfig(), ws = (cfg.workSsid || '').trim();
    if (!cfg.on || !ws) { el.hidden = true; return; }
    const ev = JSON.parse((await W.getEvents()).json || '[]'), done = wfDoneSet(), now = Date.now();
    const n = wfSessions(ev, now).filter(x => x.ssid && x.ssid.trim() === ws && !x.open && !x.pend && now - x.s < 14 * 864e5 && !wfIsDone(x, done)).length;
    el.hidden = !n;
    if (n) el.textContent = 'فترات واي فاي بانتظار المراجعة: ' + n + '. اضغط للمراجعة.';
  } catch (e) { el.hidden = true; }
}
$('wfCard').onclick = () => $('wfSugOpen').onclick();
