import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, get, set, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const C = window.CONFIG;
const app = initializeApp(C.firebase), db = getDatabase(app), auth = getAuth(app);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PUSH_URL = (C.PUSH_URL || '').replace(/\/+$/, '');
const hasServer = !!PUSH_URL && !PUSH_URL.includes('YOUR');

let users = [], live = false;
$('srv-url').innerText = hasServer ? PUSH_URL : 'config.js এ PUSH_URL বসানো হয়নি';

/* ---------- লগইন (UID দিয়ে অ্যাডমিন চেনা) ---------- */
const authMsg = c => ({ 'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড ভুল', 'auth/invalid-email': 'ইমেইল সঠিক নয়', 'auth/user-not-found': 'এই ইমেইলে অ্যাকাউন্ট নেই', 'auth/wrong-password': 'পাসওয়ার্ড ভুল', 'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে, একটু পরে আবার দিন', 'auth/network-request-failed': 'ইন্টারনেট সংযোগ নেই' }[c] || 'লগইন ব্যর্থ');
async function login() {
  const e = $('l-email').value.trim(), p = $('l-pass').value;
  if (!e || !p) return ($('l-err').innerText = 'ইমেইল ও পাসওয়ার্ড দিন');
  $('l-err').innerText = ''; $('l-btn').disabled = true;
  try { await signInWithEmailAndPassword(auth, e, p); } catch (x) { $('l-err').innerText = authMsg(x.code); }
  $('l-btn').disabled = false;
}
function showDenied(uid) {
  $('l-err').innerText = 'এই অ্যাকাউন্ট অ্যাডমিন নয়';
  const b = $('l-uid'); b.hidden = false; b.dataset.uid = uid; b.innerHTML = '<small>আপনার UID (চেপে কপি করুন)</small>' + esc(uid); $('l-hint').hidden = false;
}
const copyUid = el => navigator.clipboard?.writeText(el.dataset.uid || '').then(() => { el.querySelector('small').innerText = 'কপি হয়েছে ✓'; }).catch(() => {});

onAuthStateChanged(auth, async u => {
  if (!u) { $('login').hidden = false; $('main').hidden = true; return; }
  let isAdmin = false;
  try { isAdmin = (await get(ref(db, 'admins/' + u.uid))).val() === true; } catch (e) { isAdmin = false; }
  if (!isAdmin) { await signOut(auth); return showDenied(u.uid); }
  $('login').hidden = true; $('main').hidden = false;
  if (!live) { live = true; startLive(); }
});

/* ---------- ইউজার তালিকা (লাইভ) ---------- */
function startLive() {
  onValue(ref(db, 'users'), s => {
    users = Object.entries(s.val() || {}).map(([uid, v]) => ({ uid, ...v })).sort((a, b) => (a.username || a.email || '').localeCompare(b.username || b.email || ''));
    $('u-count').innerText = `(${users.length} জন, পুশ চালু ${users.filter(u => u.fcmToken).length} জনের)`;
    fillTargets(); renderUsers();
  }, e => { $('u-list').innerHTML = `<div class="empty">ইউজার তালিকা পড়া যায়নি: ${esc(e.message)}<br>README এর রুলস দেখুন</div>`; });
}
function fillTargets() {
  const sel = $('c-to'), cur = sel.value || 'all';
  sel.innerHTML = '<option value="all">📢 সব ইউজার</option>' + users.map(u => `<option value="${esc(u.uid)}">${esc(u.username || 'User')} — ${esc(u.email || '')}${u.fcmToken ? ' 🟢' : ''}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'all';
}
function renderUsers() {
  const q = $('u-search').value.trim().toLowerCase();
  const list = users.filter(u => !q || (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
  $('u-list').innerHTML = list.map(u => `<div class="u"><div><b>${esc(u.username || 'User')}</b><small>${esc(u.email || '')}</small></div><span class="pill ${u.fcmToken ? 'ok' : 'wait'}">${u.fcmToken ? 'পুশ চালু' : 'পুশ বন্ধ'}</span></div>`).join('') || '<div class="empty">কোনো ইউজার নেই</div>';
}
$('u-search').addEventListener('input', renderUsers);

/* ---------- সার্ভার ---------- */
const st = (cls, t) => { const e = $('srv-st'); e.className = 'pill ' + cls; e.innerText = t; };
async function ping() {
  if (!hasServer) return st('no', 'লিংক নেই');
  st('wait', 'পরীক্ষা হচ্ছে…');
  try {
    const t = (await (await fetch(PUSH_URL + '/?status')).text()).trim();
    if (t === 'ok') return st('wait', 'চালু আছে (পুরনো সংস্করণ, কী যাচাই হয়নি)');
    const j = JSON.parse(t), bad = Object.entries(j).filter(([, v]) => v !== 'ok');
    if (!bad.length) return st('ok', 'চালু আছে, SA_JSON ও DB_URL ঠিক ✓');
    st('no', 'চালু, কিন্তু ঠিক নেই: ' + bad.map(([k, v]) => `${k} (${v})`).join(', '));
  } catch (e) { st('no', 'পৌঁছানো যায়নি'); }
}
const MAP = {
  sent: ['ok', '✅ পুশ গেছে'], 'no-token': ['wait', '⚠️ পুশ চালু নেই (অ্যাপে দেখবে)'], skip: ['wait', 'আগেই পাঠানো হয়েছে'],
  fail: ['no', '❌ পুশ ব্যর্থ (Deno Logs দেখুন)'], 'no-server': ['wait', 'সার্ভার লিংক নেই'], 'net-error': ['no', '❌ সার্ভারে পৌঁছানো যায়নি'],
  error: ['no', '❌ সার্ভারে ত্রুটি'], 'not-configured': ['no', '❌ সার্ভারে SA_JSON / DB_URL ঠিক নেই'], bad: ['no', '❌ অবৈধ অনুরোধ']
};
async function pushTo(uid, nid) {
  if (!hasServer) return 'no-server';
  try { const r = await fetch(PUSH_URL, { method: 'POST', body: JSON.stringify({ uid, nid }) }); return (await r.text()).trim(); }
  catch (e) { return 'net-error'; }
}

/* ---------- বার্তা পাঠানো ---------- */
async function send() {
  const to = $('c-to').value, title = $('c-title').value.trim(), body = $('c-body').value.trim(), type = $('c-type').value;
  $('c-err').innerText = '';
  if (!title || !body) return ($('c-err').innerText = 'শিরোনাম ও বার্তা দুটোই লিখুন');
  const targets = (to === 'all' ? users : users.filter(u => u.uid === to)).slice(0, 200);
  if (!targets.length) return ($('c-err').innerText = 'কোনো ইউজার পাওয়া যায়নি');
  $('c-btn').disabled = true; $('c-btn').innerText = 'পাঠানো হচ্ছে…';
  const out = [];
  const job = async u => {
    try {
      const nr = push(ref(db, 'user_notifications/' + u.uid));
      await set(nr, { title, body, type, kind: 'admin', read: false, time: new Date().toLocaleString(), ts: serverTimestamp() });
      out.push({ u, r: await pushTo(u.uid, nr.key) });
    } catch (e) { out.push({ u, r: 'db-error:' + e.message }); }
  };
  for (let i = 0; i < targets.length; i += 5) await Promise.all(targets.slice(i, i + 5).map(job));
  const n = k => out.filter(x => x.r === k).length;
  $('r-sum').innerText = `মোট ${out.length} জন • পুশ গেছে ${n('sent')} • অ্যাপের ভেতরে পাবে ${out.length - n('sent')}`;
  $('r-list').innerHTML = out.map(({ u, r }) => { const m = r.startsWith('not-configured') ? ['no', '❌ সার্ভারে ' + esc(r.split(':')[1] || 'SA_JSON / DB_URL') + ' বসানো নেই'] : (MAP[r] || ['no', '❌ ' + esc(r)]); return `<div class="res"><span>${esc(u.username || u.email || u.uid)}</span><span class="pill ${m[0]}">${m[1]}</span></div>`; }).join('');
  $('results').hidden = false;
  $('c-title').value = ''; $('c-body').value = '';
  $('c-btn').disabled = false; $('c-btn').innerText = 'পাঠান';
}

/* ---------- বাটন ---------- */
const A = { login, logout: () => signOut(auth), copyUid, ping, send };
document.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a && A[a.dataset.act]) A[a.dataset.act](a); });
$('l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
