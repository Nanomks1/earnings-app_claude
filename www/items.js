// عناصر العمل: سجل بما نفّذته (جهاز + مشكلة + ثمن)، مقارنته بأجر اليوم، إحصاءات، وتحويل عناصر «عن بعد» إلى أجرة.
// يُحمَّل بعد app.js ويستعمل دوالّه ومتغيراته العامة (state, save, savePrefs, esc, num, money, fmtDay, undoBar ...).
// لا يمسّ حساب الأجر: البيانات في state.jobs والإعدادات في state.jobsCfg (تدخل النسخ الاحتياطية والمزامنة تلقائيًا).
(function () {
  'use strict';
  const cfg = () => state.jobsCfg;
  const on = () => !!(state.jobsCfg && state.jobsCfg.on);
  const k1 = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const SEP = /\s*(?:،|,|\+|\/|\n)\s*/;
  const splitPr = s => String(s || '').split(SEP).map(x => x.trim()).filter(Boolean);
  const prKey = s => splitPr(s).map(k1).sort().join('|');
  const tailSplit = v => { const m = /^([\s\S]*(?:،|,|\+|\/)\s*)([^،,+\/]*)$/.exec(v); return m ? { head: m[1], tail: m[2] } : { head: '', tail: v }; };
  const clean1 = s => String(s || '').replace(/[،,+\/]/g, ' ').replace(/\s+/g, ' ').trim();
  const sum = a => round2(a.reduce((t, j) => t + j.amt, 0));
  const defDate = () => (state.open && state.open.date) || today();
  const ids = () => new Set(allItems().map(i => i.id));
  const settled = (j, have) => !!j.rid && have.has(j.rid);
  const wageMap = () => { const m = {}; allItems().forEach(i => { if (i.type === 'work' && !i.remote) m[i.date] = round2((m[i.date] || 0) + i.amount); }); return m; };
  const minsMap = () => { const m = {}; allItems().forEach(i => { if (i.type === 'work' && !i.remote) m[i.date] = (m[i.date] || 0) + (i.mins || 0); }); return m; };
  const isoD = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  let editId = 0, showDays = 31, query = '', jv = 'list', per = 'm', renKind = '', renKey = '';
  const remSel = new Set();

  // ---------- التبويب ----------
  function apply() { // يُستدعى من render(): إظهار التبويب أو إخفاؤه حسب الإعداد
    const o = on();
    $('tabJobs').hidden = !o;
    document.querySelector('.tabs').classList.toggle('five', o);
    if (!o && view === 'jobs') setView('list');
  }
  function render() {
    if (!$('jList')) return;
    [...$('jView').children].forEach(b => b.classList.toggle('on', b.dataset.v === jv));
    $('jListWrap').hidden = jv !== 'list'; $('jStats').hidden = jv !== 'stats';
    if (jv === 'stats') renderStats(); else renderList();
  }
  $('jView').onclick = e => { const b = e.target.closest('button'); if (!b) return; jv = b.dataset.v === 'stats' ? 'stats' : 'list'; render(); };

  function renderList() {
    const box = $('jList'), srch = cfg().sq !== false, q = srch ? k1(query) : '', have = ids();
    $('jqBox').hidden = !srch; $('jqClr').hidden = !query;
    const all = state.jobs.filter(j => !q || k1(j.dev + ' ' + j.pr).includes(q));
    if (!all.length) {
      $('jSum').textContent = '';
      box.innerHTML = q ? emptyBox('search', 'لا توجد نتائج مطابقة.') : emptyBox('list', 'لا توجد عناصر بعد.<br>اضغط «عنصر» لتسجيل أول عنصر.');
      return;
    }
    $('jSum').innerHTML = '<span>العدد: <b>' + all.length + '</b></span><span>المجموع: <b class="num">' + money(sum(all)) + '</b></span>';
    const wm = wageMap(), days = {};
    all.forEach(j => (days[j.date] = days[j.date] || []).push(j));
    const keys = Object.keys(days).sort().reverse(), shown = keys.slice(0, showDays);
    const pend = q ? [] : state.jobs.filter(j => j.remote && !settled(j, have));
    const conv = pend.length ? '<div class="jcard"><div class="jh"><b>عن بعد · غير محسوبة</b><span class="jc"><b>' + pend.length + '</b> • <b>' + num(sum(pend)) + '</b></span></div><button class="jrow jconv" id="jConv" type="button">حوّل إلى أجرة عن بعد</button></div>' : '';
    box.innerHTML = conv + shown.map(d => {
      const g = days[d].sort((a, b) => a.t - b.t || a.id - b.id);
      const shopL = g.filter(j => !j.remote), shop = sum(shopL), rem = sum(g.filter(j => j.remote)), wage = wm[d] || 0, cells = [];
      const cell = (k, v, hl) => '<div' + (hl ? ' class="jhl"' : '') + '><small>' + k + '</small><b>' + v + '</b></div>';
      if (wage > 0) cells.push(cell('الأجر', money(wage)));
      if (shopL.length) cells.push(cell('العناصر', money(shop), true));
      if (wage > 0 && shop > 0) cells.push(cell('النسبة', num(Math.round(shop / wage * 10) / 10) + '×'));
      if (rem > 0) cells.push(cell('عن بعد', money(rem)));
      return '<div class="jcard"><div class="jh"><b>' + fmtDay(d) + '</b></div><div class="jk">' + cells.join('') + '</div>' +
        g.map(j => '<button class="jrow" type="button" data-id="' + j.id + '"><span class="jt"><b><bdi>' + esc(j.dev) + '</bdi></b>' +
          (j.pr ? '<span class="jm"><bdi>' + esc(j.pr) + '</bdi></span>' : '') + (j.remote ? '<span class="jx">عن بعد' + (settled(j, have) ? ' · محسوبة' : '') + '</span>' : '') +
          '</span><span class="jp num">' + money(j.amt) + '</span></button>').join('') + '</div>';
    }).join('') + (keys.length > shown.length ? '<button class="jmore" id="jMore" type="button">عرض أيام أقدم</button>' : '');
  }
  $('jList').onclick = e => {
    if (e.target.closest('#jMore')) { showDays += 31; render(); return; }
    if (e.target.closest('#jConv')) { openRem(); return; }
    const b = e.target.closest('.jrow'); if (b && b.dataset.id) openDlg(Number(b.dataset.id));
  };
  $('jq').oninput = () => { query = $('jq').value; showDays = 31; render(); };
  $('jqClr').onclick = () => { query = ''; $('jq').value = ''; render(); $('jq').focus(); };

  // ---------- الإحصاءات ----------
  function inRange(p) {
    const t = today();
    if (p === 'm') return d => d.slice(0, 7) === t.slice(0, 7);
    if (p === 'w') { const x = new Date(t + 'T00:00:00'); x.setDate(x.getDate() - 6); const f = isoD(x); return d => d >= f && d <= t; }
    return () => true;
  }
  function renderStats() {
    const box = $('jStats'), rg = inRange(per), J = state.jobs.filter(j => rg(j.date));
    const seg = '<div class="seg" id="jPer">' + [['m', 'هذا الشهر'], ['w', '7 أيام'], ['a', 'الكل']].map(p => '<button type="button" data-p="' + p[0] + '"' + (p[0] === per ? ' class="on"' : '') + '>' + p[1] + '</button>').join('') + '</div>';
    if (!J.length) { box.innerHTML = seg + emptyBox('bars', 'لا توجد عناصر في هذه الفترة.'); return; }
    const tot = sum(J), mx = J.reduce((m, j) => Math.max(m, j.amt), 0), g = (k, v) => '<div class="jg"><small>' + k + '</small><b>' + v + '</b></div>';
    let html = seg + '<div class="jgrid">' + g('العدد', J.length) + g('المجموع', money(tot)) + g('متوسط الثمن', money(round2(tot / J.length))) + g('الأعلى', money(mx)) + '</div>';
    // مقارنة بالأجر (أيام فيها عناصر في المحل)
    const wm = wageMap(), mm = minsMap(), sd = {};
    J.filter(j => !j.remote).forEach(j => { sd[j.date] = round2((sd[j.date] || 0) + j.amt); });
    const dk = Object.keys(sd), shop = round2(dk.reduce((t, d) => t + sd[d], 0)), wage = round2(dk.reduce((t, d) => t + (wm[d] || 0), 0)), hrs = dk.reduce((t, d) => t + (mm[d] || 0), 0) / 60;
    const kv = (k, v) => '<div class="srow"><span>' + k + '</span><b>' + v + '</b></div>';
    let cmp = '';
    if (dk.length) {
      const best = dk.sort((a, b) => sd[b] - sd[a])[0];
      cmp += kv('عناصر المحل', money(shop)) + kv('أجر نفس الأيام', money(wage));
      if (wage > 0 && shop > 0) cmp += kv('النسبة', num(Math.round(shop / wage * 10) / 10) + '×');
      if (hrs > 0) cmp += kv('الثمن لكل ساعة عمل', money(round2(shop / hrs)));
      cmp += kv('أفضل يوم', money(sd[best]) + ' • <bdi dir="rtl">' + fmtShort(best) + '</bdi>');
    }
    if (dk.length) { // أعمدة: الأجر مقابل عناصر المحل لكل يوم (آخر 10 أيام فيها عناصر)
      const ds = Object.keys(sd).sort().slice(-10), mxv = Math.max(1, ...ds.map(d => Math.max(sd[d] || 0, wm[d] || 0))), ht = v => v > 0 ? Math.max(4, Math.round(v / mxv * 84)) : 2;
      html += '<div class="jbox"><div class="mh">الأجر مقابل العناصر لكل يوم</div><div class="jleg"><span><i class="w"></i>الأجر</span><span><i class="it"></i>العناصر</span></div><div class="jdb">' +
        ds.map(d => '<div class="d"><div class="p"><i class="w" style="height:' + ht(wm[d] || 0) + 'px"></i><i class="it" style="height:' + ht(sd[d] || 0) + 'px"></i></div><span class="n num">' + Number(d.slice(8)) + '</span></div>').join('') + '</div></div>';
    }
    const remJ = J.filter(j => j.remote);
    if (remJ.length) {
      const rw = round2(allItems().reduce((t, i) => t + (i.type === 'work' && i.remote && rg(i.date) ? i.amount : 0), 0));
      cmp += kv('عناصر عن بعد', money(sum(remJ))) + kv('أجور عن بعد في الفترة', money(rw));
    }
    if (cmp) html += '<div class="jbox"><div class="mh">مقارنة بالأجر</div>' + cmp + '</div>';
    // حسب الماركة (أول كلمة من اسم الجهاز) وحسب المشكلة
    const grp = fn => { const m = new Map(); J.forEach(j => fn(j).forEach(p => { const o = m.get(p[0]) || { s: p[1], n: 0, t: 0 }; o.n++; o.t = round2(o.t + j.amt); m.set(p[0], o); })); return [...m.values()]; };
    const probs = grp(j => splitPr(j.pr).map(p => [k1(p), p])).sort((a, b) => b.n - a.n || b.t - a.t).slice(0, 8);
    const hrow = (lb, sm, v, pc) => '<div class="hrow"><div class="hl"><span><bdi>' + esc(lb) + '</bdi></span><small>' + sm + '</small><b>' + v + '</b></div><div class="hbar"><i style="width:' + Math.max(3, Math.round(pc)) + '%"></i></div></div>';
    const mxP = Math.max(1, ...probs.map(o => o.n));
    if (probs.length) html += '<div class="jbox"><div class="mh">حسب النوع</div>' + probs.map(o => hrow(o.s, 'متوسط ' + num(round2(o.t / o.n)), o.n + ' • ' + num(o.t), o.n / mxP * 100)).join('') + '</div>';
    box.innerHTML = html;
  }
  $('jStats').onclick = e => { const b = e.target.closest('button[data-p]'); if (!b) return; per = b.dataset.p; render(); };

  // ---------- الاقتراحات (من إدخالاتك السابقة) ----------
  function tally(kind) {
    const m = new Map();
    state.jobs.forEach(j => (kind === 'd' ? [j.dev] : splitPr(j.pr)).forEach(p => {
      if (!p) return;
      const k = k1(p), o = m.get(k) || { k, n: 0, t: 0, s: p };
      o.n++; if (j.t >= o.t) { o.t = j.t; o.s = p; }
      m.set(k, o);
    }));
    return [...m.values()].sort((a, b) => b.n - a.n || b.t - a.t);
  }
  const hiddenSet = kind => new Set(kind === 'd' ? cfg().hd : cfg().hp);
  function fillSug(kind) {
    const el = $(kind === 'd' ? 'jDevSug' : 'jPrSug'), v = $(kind === 'd' ? 'jDev' : 'jPr').value;
    if (!(kind === 'd' ? cfg().sd : cfg().sp)) el.innerHTML = '';
    else {
      const hid = hiddenSet(kind), ts = kind === 'p' ? tailSplit(v) : { head: '', tail: v };
      const q = k1(ts.tail), before = new Set(splitPr(ts.head).map(k1));
      const list = tally(kind).filter(o => !hid.has(o.k) && !before.has(o.k) && (!q || (o.k.includes(q) && o.k !== q)));
      if (q) list.sort((a, b) => b.k.startsWith(q) - a.k.startsWith(q));
      el.innerHTML = list.slice(0, cfg().n).map(o => '<button type="button" class="sg" data-v="' + esc(o.s) + '">' + esc(o.s) + '</button>').join('');
    }
    hint();
  }
  function hint() { // «آخر مرة»: آخر ثمن لنفس الجهاز مع نفس المشكلة
    const b = $('jLast'); b.hidden = true;
    if (!cfg().lp) return;
    const dk = k1($('jDev').value), pk = prKey($('jPr').value);
    if (!dk) return;
    let best = null;
    state.jobs.forEach(j => { if (j.id !== editId && k1(j.dev) === dk && prKey(j.pr) === pk && (!best || j.t >= best.t)) best = j; });
    if (!best || !best.amt) return;
    b.textContent = 'آخر مرة: ' + num(best.amt); b.dataset.v = String(best.amt); b.hidden = false;
  }
  $('jLast').onclick = () => { $('jAmt').value = $('jLast').dataset.v; $('jAmt').focus(); };
  $('jDevSug').onclick = e => {
    const b = e.target.closest('.sg'); if (!b) return;
    $('jDev').value = b.dataset.v; fillSug('d'); $('jPr').focus();
  };
  $('jPrSug').onclick = e => {
    const b = e.target.closest('.sg'); if (!b) return;
    $('jPr').value = tailSplit($('jPr').value).head + b.dataset.v + '، '; fillSug('p'); $('jPr').focus();
  };
  $('jDev').oninput = () => fillSug('d');
  $('jPr').oninput = () => fillSug('p');

  // ---------- نافذة الإدخال ----------
  function openDlg(id) {
    const j = id ? state.jobs.find(x => x.id === id) : null;
    if (id && !j) return;
    editId = j ? j.id : 0;
    $('jobTitle').textContent = j ? 'تعديل العنصر' : 'عنصر جديد';
    $('jDev').value = j ? j.dev : ''; $('jPr').value = j ? j.pr : ''; $('jAmt').value = j && j.amt ? j.amt : '';
    $('jDate').value = j ? j.date : defDate(); $('jRemote').checked = !!(j && j.remote);
    $('jDel').hidden = !j;
    fillSug('d'); fillSug('p');
    $('jobDlg').showModal();
    if (!j) setTimeout(() => { try { $('jDev').focus(); } catch (e) {} }, 60);
  }
  $('addJob').onclick = () => openDlg(0);
  $('jCancel').onclick = () => $('jobDlg').close();
  function saveJob() {
    const dev = $('jDev').value.trim(), pr = splitPr($('jPr').value).join('، '), a = parseFloat($('jAmt').value), date = $('jDate').value;
    if (!dev) return toast('اكتب اسم الجهاز');
    if (!(a >= 0)) return toast('أدخل الثمن');
    if (!JOB_RE.test(date)) return toast('اختر التاريخ');
    const amt = round2(a), remote = $('jRemote').checked;
    if (editId) {
      const j = state.jobs.find(x => x.id === editId);
      if (j) { Object.assign(j, { dev, pr, amt, date, remote }); if (!remote) delete j.rid; }
    } else {
      const id = state.jobs.reduce((m, j) => Math.max(m, j.id + 1), Date.now());
      state.jobs.push({ id, date, t: Date.now(), dev, pr, amt, remote });
    }
    $('jobDlg').close(); save();
  }
  $('jSave').onclick = saveJob;
  $('jAmt').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveJob(); } };
  $('jDel').onclick = () => {
    const i = state.jobs.findIndex(x => x.id === editId); if (i < 0) return;
    const j = state.jobs.splice(i, 1)[0];
    $('jobDlg').close(); save();
    undoBar('حُذف العنصر', () => { if (!state.jobs.some(x => x.id === j.id)) { state.jobs.push(j); save(); } });
  };

  // ---------- تحويل عناصر «عن بعد» إلى أجرة ----------
  function remInfo() {
    const s = state.jobs.filter(j => remSel.has(j.id));
    $('jRemInfo').textContent = 'المحدّد: ' + s.length + ' • مجموع الأثمنة: ' + money(sum(s)) + ' — أدخل أجرتك أنت منها.';
  }
  function openRem() {
    const have = ids(), list = state.jobs.filter(j => j.remote && !settled(j, have)).sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t);
    if (!list.length) return toast('لا توجد عناصر عن بعد غير محسوبة');
    remSel.clear(); list.forEach(j => remSel.add(j.id));
    $('jRemList').innerHTML = list.map(j => '<div class="tg"><span><bdi>' + esc(j.dev) + '</bdi>' + (j.pr ? ' · ' + esc(j.pr) : '') + ' • ' + num(j.amt) + '</span><input type="checkbox" data-id="' + j.id + '" checked></div>').join('');
    $('jRemAmt').value = ''; $('jRemDate').value = today(); remInfo();
    $('jRemDlg').showModal();
  }
  $('jRemList').onchange = e => {
    const b = e.target; if (!b || !b.dataset || !b.dataset.id) return;
    const id = Number(b.dataset.id); if (b.checked) remSel.add(id); else remSel.delete(id);
    remInfo();
  };
  $('jRemCancel').onclick = () => $('jRemDlg').close();
  $('jRemSave').onclick = () => {
    const a = parseFloat($('jRemAmt').value), date = $('jRemDate').value;
    if (!remSel.size) return toast('حدّد عنصرًا واحدًا على الأقل');
    if (isNaN(a) || a <= 0) return toast('أدخل أجرة العمل عن بعد');
    if (!date) return toast('أدخل التاريخ');
    const have = ids(); let id = Date.now(); while (have.has(id)) id++;
    state.items = [...state.items, { id, type: 'work', date, note: '', remote: true, mins: 0, amount: a }];
    state.jobs.forEach(j => { if (remSel.has(j.id)) j.rid = id; });
    $('jRemDlg').close(); save();
  };

  // ---------- المشاركة: «ما تم تنفيذه» ----------
  let shareFlag = false, sharePr = true;
  const isoName = s => '\u2068' + clean(s) + '\u2069'; // اتجاه تلقائي: اسم لاتيني أو عربي يظهر سليمًا
  function lines(d) {
    const g = state.jobs.filter(j => j.date === d).sort((a, b) => a.t - b.t || a.id - b.id);
    if (!g.length) return [];
    const out = g.map(j => '🛠 ' + isoName(j.dev) + (j.pr ? ' — ' + isoName(j.pr) : '') + (j.remote ? ' (عن بعد)' : '') + (sharePr ? ' — ' + bold(ltr(moneyP(j.amt))) : ''));
    if (sharePr && g.length > 1) out.push('🧾 مجموع العناصر: ' + bold(ltr(moneyP(sum(g)))));
    return out;
  }
  const datesIn = (a, z) => [...new Set(state.jobs.filter(j => j.date >= a && j.date <= z).map(j => j.date))];
  const canShare = () => on() && state.jobs.length > 0;
  const shareOn = () => shareFlag && on();
  function setShare(inc, pr, persist) {
    shareFlag = !!inc; sharePr = !!pr;
    if (persist && (cfg().sj !== !!inc || cfg().sc !== !!pr)) { cfg().sj = !!inc; cfg().sc = !!pr; savePrefs(); }
  }
  function attachPdf(c) { // قسم «ما تم تنفيذه» في تقرير الـ PDF ضمن مدى تواريخ التقرير
    if (!c || !shareOn() || !c.items || !c.items.length) return;
    const ds = c.items.map(i => i.date).sort(), a = ds[0], z = ds[ds.length - 1];
    const rows = state.jobs.filter(j => j.date >= a && j.date <= z).sort((x, y) => x.date.localeCompare(y.date) || x.t - y.t || x.id - y.id);
    if (rows.length) { c.jobs = rows.map(j => ({ date: j.date, dev: j.dev, pr: j.pr, amt: j.amt, remote: j.remote })); c.jobsPr = sharePr; }
  }

  // ---------- صفحة الإعدادات ----------
  function manage() {
    const c = cfg();
    const sec = (kind, title) => {
      const hid = hiddenSet(kind), vis = tally(kind).filter(o => !hid.has(o.k)).slice(0, 40);
      return '<div class="mh">' + title + '</div>' + (vis.length
        ? vis.map(o => '<div class="mrow"><span>' + esc(o.s) + '</span><small>' + o.n + '</small><button type="button" data-r="' + kind + '" data-v="' + esc(o.k) + '" aria-label="إعادة تسمية">✎</button><button type="button" data-k="' + kind + '" data-v="' + esc(o.k) + '" aria-label="إخفاء من الاقتراحات">×</button></div>').join('')
        : '<div class="hint">لا توجد اقتراحات بعد.</div>');
    };
    const nh = c.hd.length + c.hp.length;
    $('jManage').innerHTML = '<div class="hint" style="margin-top:8px">✎ لإعادة التسمية أو الدمج في كل العناصر، و× لإخفاء اقتراح من الشريط فقط. لا يُحذف أي عنصر مسجَّل.</div>' + sec('d', 'الأجهزة') + sec('p', 'المشاكل') +
      (nh ? '<button class="mlink" type="button" data-reset="1">إظهار الاقتراحات المخفية (' + nh + ')</button>' : '');
  }
  function cfgShow() {
    const c = cfg();
    $('jOn').checked = c.on; $('jSet').hidden = !c.on; $('jSearch').checked = c.sq !== false;
    $('jSugD').checked = c.sd; $('jSugP').checked = c.sp; $('jLastP').checked = c.lp;
    [...$('jNum').children].forEach(b => b.classList.toggle('on', Number(b.dataset.n) === c.n));
    manage();
  }
  $('jOn').onchange = () => { cfg().on = $('jOn').checked; savePrefs(); $('jSet').hidden = !cfg().on; apply(); };
  $('jSearch').onchange = () => { cfg().sq = $('jSearch').checked; if (!cfg().sq) { query = ''; $('jq').value = ''; showDays = 31; } savePrefs(); render(); };
  $('jSugD').onchange = () => { cfg().sd = $('jSugD').checked; savePrefs(); };
  $('jSugP').onchange = () => { cfg().sp = $('jSugP').checked; savePrefs(); };
  $('jLastP').onchange = () => { cfg().lp = $('jLastP').checked; savePrefs(); };
  $('jNum').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    cfg().n = Number(b.dataset.n); savePrefs(); cfgShow();
  };
  $('jManage').onclick = e => {
    const c = cfg();
    if (e.target.closest('[data-reset]')) { c.hd = []; c.hp = []; savePrefs(); manage(); return; }
    const r = e.target.closest('button[data-r]'); if (r) { openRen(r.dataset.r, r.dataset.v); return; }
    const b = e.target.closest('button[data-k]'); if (!b) return;
    const arr = b.dataset.k === 'd' ? c.hd : c.hp;
    if (!arr.includes(b.dataset.v)) arr.push(b.dataset.v);
    savePrefs(); manage();
  };

  // ---------- إعادة تسمية / دمج وسم ----------
  function openRen(kind, key) {
    const o = tally(kind).find(x => x.k === key); if (!o) return;
    renKind = kind; renKey = key;
    $('jRenInfo').textContent = 'يُغيَّر في كل العناصر المسجَّلة. إن كان الاسم الجديد موجودًا فسيُدمج معه.';
    $('jRenIn').value = o.s;
    $('jRenDlg').showModal();
    setTimeout(() => { try { $('jRenIn').focus(); $('jRenIn').select(); } catch (e) {} }, 60);
  }
  $('jRenCancel').onclick = () => $('jRenDlg').close();
  $('jRenSave').onclick = () => {
    const nv = clean1($('jRenIn').value).slice(0, 80);
    if (!nv) return toast('اكتب الاسم الجديد');
    if (renKind === 'd') state.jobs.forEach(j => { if (k1(j.dev) === renKey) j.dev = nv; });
    else state.jobs.forEach(j => {
      const parts = splitPr(j.pr);
      if (!parts.some(p => k1(p) === renKey)) return;
      const seen = new Set(), out = [];
      parts.forEach(p => { const v = k1(p) === renKey ? nv : p, kk = k1(v); if (!seen.has(kk)) { seen.add(kk); out.push(v); } });
      j.pr = out.join('، ').slice(0, 160);
    });
    $('jRenDlg').close(); save(); manage();
  };

  window.Jobs = { apply, render, cfgShow, canShare, shareOn, setShare, lines, datesIn, attachPdf };
  apply();
  if (view === 'jobs') render();
})();