// ---------- المزامنة المشفرة عبر Dropbox ----------
// ملف واحد مشفر (AES-256-GCM) في مجلد التطبيق داخل Dropbox. لا دمج تلقائي: عند التعارض يُسأل المستخدم.
// يُحمَّل بعد app.js ويستعمل دوالّه ومتغيراته العامة (state, save, norm, putFile ...).
(function () {
  'use strict';
  const APP_KEY = 'a5we6valz1kokfn';
  const PATH = '/earnings-sync.enc';
  const LS = 'earnings_sync';
  const ITER = 600000;
  const API = 'https://api.dropboxapi.com/2';
  const CONTENT = 'https://content.dropboxapi.com/2';
  const TOKEN = 'https://api.dropboxapi.com/oauth2/token';
  const E8 = new TextEncoder(), D8 = new TextDecoder();
  const MSG = {
    net: 'لا يوجد اتصال بالإنترنت',
    auth: 'انتهى الربط مع Dropbox. أعد الربط',
    code: 'الرمز غير صحيح أو انتهت صلاحيته',
    key: 'كلمة سر المزامنة لا تطابق ملف السحابة',
    api: 'تعذر الاتصال بـ Dropbox',
    format: 'ملف السحابة غير صالح',
    gone: 'اختفى ملف السحابة. حاول مجددًا',
    empty: 'نسخة السحابة فارغة ولم تُطبَّق',
    copy: 'تعذر حفظ نسخة أمان قبل الاستبدال، فلم تُطبَّق المزامنة',
    conflict: 'تغيّرت السحابة أثناء الرفع. حاول مجددًا'
  };
  let S = {};
  try { S = JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { S = {}; }
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} };
  const linked = () => !!(S.rt && S.key && S.salt);
  const fail = c => { const e = new Error(c); e.code = c; return e; };
  let at = '', atExp = 0, busy = false, redo = false, lockWait = false, confOpen = false;
  let pushT = 0, lastRun = 0, conf = null, phase = '', authUrl = '', cloudEnv = null, wizBusy = false;

  // ---------- الشبكة وDropbox ----------
  async function http(url, opt) {
    try { return await fetch(url, opt); } catch (e) { throw fail('net'); }
  }
  async function accessToken() {
    if (at && Date.now() < atExp - 60000) return at;
    if (!S.rt) throw fail('auth');
    const r = await http(TOKEN, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: S.rt, client_id: APP_KEY }) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j.access_token) {
      if (j.error === 'invalid_grant') { S.rt = ''; persist(); throw fail('auth'); }
      throw fail('api');
    }
    at = j.access_token; atExp = Date.now() + (Number(j.expires_in) || 14400) * 1000;
    return at;
  }
  async function authed(go) {
    let r = await go(await accessToken());
    if (r.status === 401) { at = ''; r = await go(await accessToken()); }
    return r;
  }
  async function remoteMeta() {
    const r = await authed(t => http(API + '/files/get_metadata', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: PATH }) }));
    if (r.status === 409) { let x = ''; try { x = await r.text(); } catch (e) {} if (/not_found/.test(x)) return null; throw fail('api'); }
    if (!r.ok) throw fail('api');
    const j = await r.json();
    return { rev: j.rev };
  }
  async function download() {
    const r = await authed(t => http(CONTENT + '/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Dropbox-API-Arg': JSON.stringify({ path: PATH }) } }));
    if (r.status === 409) return null;
    if (!r.ok) throw fail('api');
    let rev = ''; try { rev = JSON.parse(r.headers.get('dropbox-api-result') || '{}').rev || ''; } catch (e) {}
    return { text: await r.text(), rev };
  }
  async function upload(text, rev) {
    const mode = rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' };
    const r = await authed(t => http(CONTENT + '/files/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: PATH, mode, autorename: false, mute: true }) }, body: text }));
    if (r.status === 409) return { conflict: true };
    if (!r.ok) throw fail('api');
    return { rev: (await r.json()).rev };
  }

  // ---------- الربط (PKCE بلا إعادة توجيه: يُلصق الرمز في التطبيق) ----------
  const b64u = u8 => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function newAuth() {
    const v = S.pk || b64u(crypto.getRandomValues(new Uint8Array(48)));
    const ch = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', E8.encode(v))));
    S.pk = v; persist();
    authUrl = 'https://www.dropbox.com/oauth2/authorize?' + new URLSearchParams({ client_id: APP_KEY, response_type: 'code', code_challenge: ch, code_challenge_method: 'S256', token_access_type: 'offline' }).toString();
  }
  async function exchange(code) {
    if (!S.pk) throw fail('code');
    const r = await http(TOKEN, { method: 'POST', body: new URLSearchParams({ code, grant_type: 'authorization_code', code_verifier: S.pk, client_id: APP_KEY }) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j.refresh_token) throw fail('code');
    S.rt = j.refresh_token; S.pk = '';
    at = j.access_token || ''; atExp = Date.now() + (Number(j.expires_in) || 14400) * 1000;
    persist();
  }

  // ---------- التشفير ----------
  async function derive(pw, salt, iter) {
    const base = await crypto.subtle.importKey('raw', E8.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, 256));
  }
  const aes = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function seal(plain) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(unb64(S.key)), E8.encode(plain)));
    return JSON.stringify({ app: 'earnings-sync', v: 1, kdf: 'PBKDF2-SHA256', iter: S.iter || ITER, salt: S.salt, iv: b64(iv), data: b64(ct) });
  }
  function parseEnv(t) {
    let d; try { d = JSON.parse(t); } catch (e) { throw fail('format'); }
    if (!d || d.app !== 'earnings-sync' || !d.salt || !d.iv || !d.data) throw fail('format');
    return d;
  }
  const unseal = async (d, raw) => D8.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(d.iv) }, await aes(raw), unb64(d.data)));
  const iterOf = d => Math.min(Math.max(Number(d.iter) || ITER, 100000), 2000000);

  // ---------- لقطة البيانات (بلا الرمز والبصمة والوردية الجارية) ----------
  const snapOf = st => { const { pin, bio, open, ...rest } = st; return JSON.parse(JSON.stringify({ app: 'earnings', version: 5, ...rest })); };
  const snap = () => snapOf(state);
  const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v;
  const hashOf = async o => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', E8.encode(JSON.stringify(canon(o))))));
  function brief(o) {
    const it = Array.isArray(o.items) ? o.items : [], ar = Array.isArray(o.archive) ? o.archive : [];
    const last = it.map(i => i.date).filter(Boolean).sort().pop();
    return it.length + ' سجل، ' + ar.length + ' دفعة مؤرشفة' + (last ? '، آخر سجل ' + last : '');
  }
  const fmtT = ms => new Date(ms).toLocaleString('ar-u-nu-latn', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const dlgOpen = () => !!document.querySelector('dialog[open]');

  // ---------- المزامنة ----------
  async function pullData(meta) {
    const d = await download();
    if (!d) throw fail('gone');
    let plain;
    try { plain = await unseal(parseEnv(d.text), unb64(S.key)); } catch (e) { throw e.code ? e : fail('key'); }
    let obj; try { obj = JSON.parse(plain); } catch (e) { throw fail('format'); }
    if (!obj || !Array.isArray(obj.items)) throw fail('format');
    return { obj, rev: d.rev || meta.rev };
  }
  function applyObj(obj, ui) {
    clearTimeout(bkTimer);
    const keep = { pin: state.pin, bio: state.bio, open: state.open, prefs: state.prefs };
    if (ui) { try { $('menu').close(); $('filesDlg').close(); } catch (e) {} }
    state = norm(obj);
    state.pin = keep.pin; state.bio = keep.bio; state.open = keep.open;
    if (!obj.prefs) state.prefs = keep.prefs;
    applyTheme(); save(); adoptPrefs();
  }
  async function applyCloud(obj, rev, o) {
    o = o || {};
    if (isEmpty(norm(obj)) && !isEmpty(state) && !o.force) throw fail('empty');
    if (!o.ui && dlgOpen()) throw fail('busyui');
    const unsynced = !S.rev || (await hashOf(snap())) !== S.h;
    if (unsynced && isNative() && !isEmpty(state)) { // تغييرات محلية لم تُزامَن: نسخة أمان قبل الاستبدال
      try { await putFile('earnings-before-sync-' + stamp() + '.json', await backupText()); } catch (e) { throw fail('copy'); }
    }
    applyObj(obj, o.ui);
    S.rev = rev; S.h = await hashOf(snap());
  }
  async function push(cur, h, rev) {
    if (isEmpty(state)) return false; // الفراغ لا يُرفع تلقائيًا فوق بيانات السحابة
    const r = await upload(await seal(JSON.stringify({ ...cur, savedAt: new Date().toISOString() })), rev);
    if (r.conflict) throw fail('conflict');
    S.rev = r.rev; S.h = h;
    return true;
  }
  function askConflict(d) {
    if (confOpen) return;
    confOpen = true; conf = d;
    $('syConfInfo').innerHTML = '<b>هذا الهاتف:</b> ' + esc(brief(snap())) + '<br><b>السحابة:</b> ' + esc(brief(d.obj)) + (d.obj.savedAt ? '<br><small>حُفظت ' + esc(fmtT(Date.parse(d.obj.savedAt))) + '</small>' : '');
    $('syConf').showModal();
  }
  // يعيد: same | pushed | pulled | ask
  async function flow(reason, manual) {
    if (reason === 'save' && S.rev) {
      const c0 = snap(), h0 = await hashOf(c0);
      if (h0 === S.h) return 'same';
      return (await push(c0, h0, S.rev)) ? 'pushed' : 'same';
    }
    const meta = await remoteMeta();
    const cur = snap(), h = await hashOf(cur), dirty = h !== S.h;
    if (!meta) { // لا ملف في السحابة
      if (isEmpty(state)) return 'same';
      return (await push(cur, h, '')) ? 'pushed' : 'same';
    }
    if (meta.rev === S.rev) {
      if (!dirty) return 'same';
      return (await push(cur, h, S.rev)) ? 'pushed' : 'same';
    }
    // تغيّرت السحابة (أو هذا أول ربط)
    const d = await pullData(meta);
    if (isEmpty(state) || (!dirty && S.rev)) { await applyCloud(d.obj, d.rev, { ui: manual }); return 'pulled'; }
    if ((await hashOf(snapOf(norm(d.obj)))) === h) { S.rev = d.rev; S.h = h; return 'same'; } // المحتوى متطابق
    askConflict(d);
    return 'ask';
  }
  async function run(reason, manual) {
    if (!linked()) { if (manual) toast('اربط Dropbox أولًا'); return; }
    if (busy) { if (reason === 'save') redo = true; else if (manual) toast('جارٍ المزامنة…'); return; }
    if (!$('lock').hidden) { if (!lockWait) { lockWait = true; setTimeout(() => { lockWait = false; run(reason, manual); }, 4000); } return; }
    busy = true; lastRun = Date.now(); ui();
    try {
      let res = 'same';
      for (let n = 0; n < 2; n++) {
        try { res = await flow(n ? 'again' : reason, manual); break; }
        catch (e) { if (!(e.code === 'conflict' && n === 0)) throw e; }
      }
      S.err = '';
      if (res !== 'ask') S.at = Date.now();
      if (res === 'pulled') toast('حُدِّثت بياناتك من السحابة');
      else if (manual && res === 'pushed') toast('تم رفع بياناتك');
      else if (manual && res === 'same') toast('كل شيء متزامن');
    } catch (e) {
      const c = e.code || 'api';
      if (c === 'busyui') setTimeout(() => run('retry'), 20000);
      else { S.err = c; if (manual) toast(MSG[c] || MSG.api); }
    } finally { busy = false; persist(); ui(); if (redo) { redo = false; schedulePush(); } }
  }
  async function guarded(fn, okMsg) {
    if (busy) return toast('جارٍ مزامنة أخرى، حاول بعد لحظات');
    busy = true; ui();
    try { await fn(); S.err = ''; S.at = Date.now(); if (okMsg) toast(okMsg); }
    catch (e) { const c = e.code || 'api'; S.err = c; toast(MSG[c] || MSG.api); }
    finally { busy = false; persist(); ui(); }
  }
  function schedulePush() {
    if (!linked()) return;
    clearTimeout(pushT); pushT = setTimeout(() => run('save'), 6000);
  }

  // ---------- نافذة التعارض ----------
  $('syConf').addEventListener('close', () => { confOpen = false; });
  $('syKeepLocal').onclick = () => {
    if (!confirm('ستُستبدل نسخة السحابة بنسخة هذا الهاتف. تبقى النسخة القديمة في سجل إصدارات Dropbox مدة محدودة. متابعة؟')) return;
    const d = conf; $('syConf').close();
    guarded(async () => { const cur = snap(); if (!(await push(cur, await hashOf(cur), d.rev))) throw fail('empty'); }, 'حُفظت نسخة هذا الهاتف في السحابة');
  };
  $('syTakeCloud').onclick = () => {
    if (!confirm('ستُستبدل بيانات هذا الهاتف بنسخة السحابة. تُحفظ أولًا نسخة أمان من بيانات هذا الهاتف في مجلد النسخ الاحتياطي. متابعة؟')) return;
    const d = conf; $('syConf').close();
    guarded(() => applyCloud(d.obj, d.rev, { force: true, ui: true }), 'تم أخذ نسخة السحابة');
  };
  $('syLater').onclick = () => $('syConf').close();

  // ---------- نافذة الربط ----------
  function setPhase(p) {
    phase = p;
    $('syA').hidden = p !== 'code'; $('syB').hidden = p !== 'new'; $('syC').hidden = p !== 'old';
    $('syNext').textContent = p === 'new' ? 'تفعيل المزامنة' : 'متابعة';
    $('syTitle').textContent = p === 'code' ? 'ربط Dropbox' : 'كلمة سر المزامنة';
  }
  async function openLink() {
    if (!(window.crypto && crypto.subtle)) return toast('التشفير غير متاح على هذا الجهاز');
    try { await newAuth(); } catch (e) { return toast('تعذر بدء الربط'); }
    $('syCode').value = ''; $('syPw').value = ''; $('syPw2').value = ''; $('syPwOld').value = '';
    setPhase('code'); $('syDlg').showModal();
  }
  $('syOpen').onclick = () => { try { window.open(authUrl, '_blank'); } catch (e) { toast('تعذر فتح المتصفح. انسخ الرابط'); } };
  $('syCopy').onclick = () => {
    try { navigator.clipboard.writeText(authUrl).then(() => toast('نُسخ الرابط. الصقه في المتصفح'), () => toast('تعذر النسخ')); }
    catch (e) { toast('تعذر النسخ'); }
  };
  $('syCancel').onclick = () => $('syDlg').close();
  $('syNext').onclick = async () => {
    if (wizBusy) return;
    wizBusy = true; $('syNext').disabled = true;
    try {
      if (phase === 'code') {
        const code = $('syCode').value.trim();
        if (!code) return toast('الصق الرمز الذي ظهر في Dropbox');
        await exchange(code);
        const d = await download();
        if (d) { cloudEnv = parseEnv(d.text); setPhase('old'); } else { cloudEnv = null; setPhase('new'); }
      } else if (phase === 'new') {
        const a = $('syPw').value;
        if (a.length < 8) return toast('كلمة السر 8 أحرف على الأقل');
        if (a !== $('syPw2').value) return toast('التأكيد غير مطابق');
        if (!confirm('تنبيه: إن نسيت كلمة السر ولم يعد عندك هاتف مرتبط، فلا يمكن استرجاع بيانات السحابة أبدًا. متابعة؟')) return;
        $('syNext').textContent = 'جارٍ التفعيل…';
        const salt = crypto.getRandomValues(new Uint8Array(16));
        S.key = b64(await derive(a, salt, ITER)); S.salt = b64(salt); S.iter = ITER; S.rev = ''; S.h = ''; S.err = ''; persist();
        $('syDlg').close(); ui(); run('manual', true);
      } else if (phase === 'old') {
        const a = $('syPwOld').value;
        if (!a) return toast('أدخل كلمة السر');
        $('syNext').textContent = 'جارٍ التحقق…';
        const raw = await derive(a, unb64(cloudEnv.salt), iterOf(cloudEnv));
        try { await unseal(cloudEnv, raw); } catch (e) { setPhase('old'); return toast('كلمة السر غير صحيحة'); }
        S.key = b64(raw); S.salt = cloudEnv.salt; S.iter = iterOf(cloudEnv); S.rev = ''; S.h = ''; S.err = ''; persist();
        $('syDlg').close(); ui(); run('manual', true);
      }
    } catch (e) { setPhase(phase); toast(MSG[e.code] || MSG.api); }
    finally { wizBusy = false; $('syNext').disabled = false; }
  };
  async function unlink() {
    if (!confirm('فصل المزامنة عن هذا الهاتف؟ تبقى بياناتك هنا كما هي، ويبقى الملف المشفر في Dropbox.')) return;
    try { const t = await accessToken(); await fetch(API + '/auth/token/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); } catch (e) {}
    S = {}; at = ''; atExp = 0; clearTimeout(pushT); persist(); ui(); toast('تم فصل المزامنة');
  }

  // ---------- صفحة الإعدادات ----------
  function ui() {
    if (!$('syWhere')) return;
    const on = linked();
    $('syLink').hidden = on; $('syNow').hidden = !on; $('syOff').hidden = !on;
    let h = on ? 'المزامنة مفعّلة مع Dropbox' : 'المزامنة غير مفعّلة';
    if (on && busy) h += '<br>جارٍ المزامنة…';
    else if (on && S.at) h += '<br>آخر مزامنة ناجحة: ' + fmtT(S.at);
    if (S.err && MSG[S.err]) h += '<br><span style="color:var(--neg)">' + esc(MSG[S.err]) + '</span>';
    $('syWhere').innerHTML = h;
    $('sySt').textContent = on ? 'مفعّلة' : 'غير مفعّلة';
  }
  $('syLink').onclick = openLink;
  $('syNow').onclick = () => run('manual', true);
  $('syOff').onclick = unlink;

  // ---------- الربط مع التطبيق ----------
  MT.sync = 'المزامنة';
  const _save = save;
  save = function () { const r = _save.apply(this, arguments); schedulePush(); return r; };
  const _mGo = mGo;
  mGo = function (p) { const r = _mGo.apply(this, arguments); if (p === 'sync') ui(); return r; };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastRun > 20000) run('show'); });
  window.addEventListener('online', () => run('online'));
  ui();
  setTimeout(() => run('open'), 2500);
  window.__sync = { run, flow, S: () => S, seal, hashOf, snap, linked };
})();
