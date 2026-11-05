// عناصر العمل: سجل بما نفّذته (جهاز + مشكلة + ثمن)، مقارنته بأجر اليوم، واقتراحات إدخال سريعة.
// يُحمَّل بعد app.js ويستعمل دوالّه ومتغيراته العامة (state, save, savePrefs, esc, num, money, fmtDay, undoBar ...).
// لا يمسّ حساب الأجر: البيانات في state.jobs والإعدادات في state.jobsCfg (تدخل النسخ الاحتياطية والمزامنة تلقائيًا).
(function () {
  'use strict';
  const cfg = () => state.jobsCfg;
  const on = () => !!(state.jobsCfg && state.jobsCfg.on);
  const k1 = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const SEP = /\s*(?:،|,|\+|\/|\n)\s*/;
  const splitPr = s => String(s || '').split(SEP).map(x => x.trim()).filter(Boolean);
  const tailSplit = v => { const m = /^([\s\S]*(?:،|,|\+|\/)\s*)([^،,+\/]*)$/.exec(v); return m ? { head: m[1], tail: m[2] } : { head: '', tail: v }; };
  const sum = a => round2(a.reduce((t, j) => t + j.amt, 0));
  const defDate = () => (state.open && state.open.date) || today();
  const wageOf = d => round2(state.items.reduce((t, i) => t + (i.date === d && i.type === 'work' && !i.remote ? i.amount : 0), 0));
  let editId = 0, showDays = 31, query = '';

  // ---------- التبويب ----------
  function apply() { // يُستدعى من render(): إظهار التبويب أو إخفاؤه حسب الإعداد
    const o = on();
    $('tabJobs').hidden = !o;
    document.querySelector('.tabs').classList.toggle('five', o);
    if (!o && view === 'jobs') setView('list');
  }
  function render() {
    const box = $('jList'); if (!box) return;
    const q = k1(query);
    $('jqClr').hidden = !query;
    const all = state.jobs.filter(j => !q || k1(j.dev + ' ' + j.pr).includes(q));
    if (!all.length) {
      $('jSum').textContent = '';
      box.innerHTML = q ? emptyBox('search', 'لا توجد نتائج مطابقة.') : emptyBox('list', 'لا توجد عناصر بعد.<br>اضغط «عنصر» لتسجيل أول عنصر.');
      return;
    }
    $('jSum').innerHTML = 'العدد: ' + all.length + ' • المجموع: ' + money(sum(all));
    const days = {};
    all.forEach(j => (days[j.date] = days[j.date] || []).push(j));
    const keys = Object.keys(days).sort().reverse(), shown = keys.slice(0, showDays);
    box.innerHTML = shown.map(d => {
      const g = days[d].sort((a, b) => a.t - b.t || a.id - b.id);
      const shopL = g.filter(j => !j.remote), shop = sum(shopL), rem = sum(g.filter(j => j.remote)), wage = wageOf(d), p = [];
      if (wage > 0) p.push('أجر ' + num(wage));
      if (shopL.length) p.push('عناصر <b>' + num(shop) + '</b>');
      if (wage > 0 && shop > 0) p.push(num(Math.round(shop / wage * 10) / 10) + '×');
      if (rem > 0) p.push('عن بعد ' + num(rem));
      return '<div class="jcard"><div class="jh"><b>' + fmtDay(d) + '</b><span class="jc">' + p.join(' • ') + '</span></div>' +
        g.map(j => '<button class="jrow" type="button" data-id="' + j.id + '"><span class="jt"><b><bdi>' + esc(j.dev) + '</bdi></b><span class="jm">' +
          (j.pr ? ' · ' + esc(j.pr) : '') + (j.remote ? ' · عن بعد' : '') + '</span></span><span class="jp num">' + money(j.amt) + '</span></button>').join('') + '</div>';
    }).join('') + (keys.length > shown.length ? '<button class="jmore" id="jMore" type="button">عرض أيام أقدم</button>' : '');
  }
  $('jList').onclick = e => {
    if (e.target.closest('#jMore')) { showDays += 31; render(); return; }
    const b = e.target.closest('.jrow'); if (b) openDlg(Number(b.dataset.id));
  };
  $('jq').oninput = () => { query = $('jq').value; showDays = 31; render(); };
  $('jqClr').onclick = () => { query = ''; $('jq').value = ''; render(); $('jq').focus(); };

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
    if (!(kind === 'd' ? cfg().sd : cfg().sp)) { el.innerHTML = ''; return; }
    const hid = hiddenSet(kind), ts = kind === 'p' ? tailSplit(v) : { head: '', tail: v };
    const q = k1(ts.tail), before = new Set(splitPr(ts.head).map(k1));
    let list = tally(kind).filter(o => !hid.has(o.k) && !before.has(o.k) && (!q || (o.k.includes(q) && o.k !== q)));
    if (q) list.sort((a, b) => b.k.startsWith(q) - a.k.startsWith(q));
    el.innerHTML = list.slice(0, cfg().n).map(o => '<button type="button" class="sg" data-v="' + esc(o.s) + '">' + esc(o.s) + '</button>').join('');
  }
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
      if (j) Object.assign(j, { dev, pr, amt, date, remote });
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

  // ---------- المشاركة: «ما تم تنفيذه» تحت كل يوم ----------
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

  // ---------- صفحة الإعدادات ----------
  function manage() {
    const c = cfg();
    const sec = (kind, title) => {
      const hid = hiddenSet(kind), vis = tally(kind).filter(o => !hid.has(o.k)).slice(0, 40);
      return '<div class="mh">' + title + '</div>' + (vis.length
        ? vis.map(o => '<div class="mrow"><span>' + esc(o.s) + '</span><small>' + o.n + '</small><button type="button" data-k="' + kind + '" data-v="' + esc(o.k) + '" aria-label="إخفاء من الاقتراحات">×</button></div>').join('')
        : '<div class="hint">لا توجد اقتراحات بعد.</div>');
    };
    const nh = c.hd.length + c.hp.length;
    $('jManage').innerHTML = '<div class="hint" style="margin-top:8px">اضغط × لإخفاء اقتراح من الشريط. لا يُحذف أي عنصر مسجَّل.</div>' + sec('d', 'الأجهزة') + sec('p', 'المشاكل') +
      (nh ? '<button class="mlink" type="button" data-reset="1">إظهار الاقتراحات المخفية (' + nh + ')</button>' : '');
  }
  function cfgShow() {
    const c = cfg();
    $('jOn').checked = c.on; $('jSet').hidden = !c.on;
    $('jSugD').checked = c.sd; $('jSugP').checked = c.sp;
    [...$('jNum').children].forEach(b => b.classList.toggle('on', Number(b.dataset.n) === c.n));
    manage();
  }
  $('jOn').onchange = () => { cfg().on = $('jOn').checked; savePrefs(); $('jSet').hidden = !cfg().on; apply(); };
  $('jSugD').onchange = () => { cfg().sd = $('jSugD').checked; savePrefs(); };
  $('jSugP').onchange = () => { cfg().sp = $('jSugP').checked; savePrefs(); };
  $('jNum').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    cfg().n = Number(b.dataset.n); savePrefs(); cfgShow();
  };
  $('jManage').onclick = e => {
    const c = cfg();
    if (e.target.closest('[data-reset]')) { c.hd = []; c.hp = []; savePrefs(); manage(); return; }
    const b = e.target.closest('button[data-k]'); if (!b) return;
    const arr = b.dataset.k === 'd' ? c.hd : c.hp;
    if (!arr.includes(b.dataset.v)) arr.push(b.dataset.v);
    savePrefs(); manage();
  };

  window.Jobs = { apply, render, cfgShow, canShare, shareOn, setShare, lines, datesIn };
  apply();
  if (view === 'jobs') render();
})();
