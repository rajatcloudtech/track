// ─────────────────────────────────────────────
// SAP Career Tracker — app.js
// Update SHEET_CSV below with your Google Sheet
// published CSV URL (File → Share → Publish to web
// → CSV). Leave empty to use local data/ files only.
// ─────────────────────────────────────────────

const SHEET_CSV = ‘https://docs.google.com/spreadsheets/d/e/2PACX-1vRAvDhXN7q0xaRS4ScRQNrpTktkB6neyDzAI5cWaVeMLmwXW94N_AyUmd0fzoLUgKf0iT-21suPjJsd/pub?gid=0&single=true&output=csv’;

// ── DATA ─────────────────────────────────────
const KEY = ‘sap_v3’;
let db = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || defaultDb(); } catch { return defaultDb(); } })();

function defaultDb() {
return {
goals: [], logs: [], heatmap: {}, reviews: [],
phaseProgress: { p1: 0, p2: 0, p3: 0 },
streak: { last: null, count: 0 },
skills: {
sap: {
‘MM End-to-End’: 2, ‘PO/GR/IR Process’: 2, ‘Movement Types’: 2,
‘SE16N Navigation’: 2, ‘Pricing Procedures’: 1, ‘STO/Subcon’: 1, ‘Output Types’: 1
},
tech: {
‘SQL/HANA’: 1, ‘ABAP Reading’: 0, ‘Debugging’: 0,
‘Z-Table/Report’: 1, ‘BADI/Exits’: 0, ‘HANA Studio’: 0
}
}
};
}

function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

// ── UTILS ─────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);

function fmtDate(d) {
return new Date(d + ‘T00:00:00’).toLocaleDateString(‘en-IN’, { day: ‘numeric’, month: ‘short’, year: ‘numeric’ });
}

function esc(s) {
return String(s).replace(/&/g, ‘&’).replace(/</g, ‘<’).replace(/>/g, ‘>’);
}

function toast(msg) {
document.querySelectorAll(’.toast’).forEach(t => t.remove());
const t = document.createElement(‘div’);
t.className = ‘toast’;
t.textContent = msg;
document.body.appendChild(t);
setTimeout(() => t.remove(), 2600);
}

function cp(txt) {
navigator.clipboard?.writeText(txt)
.then(() => toast(‘Copied!’))
.catch(() => toast(‘Long-press to copy’));
}

function tp(id) {
const p = document.getElementById(id);
p.style.display = p.style.display === ‘none’ ? ‘block’ : ‘none’;
}

// ── RFC 4180 CSV PARSER ───────────────────────
// Correctly handles quoted fields containing commas.
// The previous version broke whenever an answer had a comma
// — columns shifted and category/table/status all came out wrong.
function parseCSV(text) {
const lines = text.replace(/\r\n/g, ‘\n’).replace(/\r/g, ‘\n’).trim().split(’\n’);
if (lines.length < 2) return [];

function parseLine(line) {
const cols = [];
let cur = ‘’, inQ = false, i = 0;
while (i < line.length) {
const ch = line[i];
if (inQ) {
if (ch === ‘”’) {
if (line[i + 1] === ‘”’) { cur += ‘”’; i += 2; } // escaped “”
else { inQ = false; i++; }                        // end of quoted field
} else { cur += ch; i++; }
} else {
if (ch === ‘”’) { inQ = true; i++; }
else if (ch === ‘,’) { cols.push(cur); cur = ‘’; i++; }
else { cur += ch; i++; }
}
}
cols.push(cur);
return cols;
}

const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());

return lines.slice(1)
.filter(l => l.trim())
.map(line => {
const cols = parseLine(line);
const obj = {};
headers.forEach((h, i) => obj[h] = (cols[i] || ‘’).trim());
return obj;
})
// Keep rows with a question that are active (blank status = active)
.filter(r => r.question && (!r.status || r.status.toLowerCase() === ‘active’));
}

// ── NAV ───────────────────────────────────────
let curPg = ‘dash’, curTab = ‘flashcards’, curCard = 0, SD = null, activeCat = ‘All’;

function go(id) {
document.querySelectorAll(’.pg’).forEach(p => p.classList.remove(‘on’));
document.querySelectorAll(’.nb’).forEach(b => b.classList.remove(‘on’));
document.getElementById(‘pg-’ + id).classList.add(‘on’);
document.getElementById(‘nb-’ + id).classList.add(‘on’);
document.getElementById(‘scroll’).scrollTo(0, 0);
curPg = id;
({ dash: rDash, study: rStudy, goals: rGoals, log: rLog, more: rMore }[id] || rDash)();
}

// Force a fresh fetch from the sheet — clears the in-memory cache
function reloadStudy() {
SD = null;
activeCat = ‘All’;
curCard = 0;
document.getElementById(‘sstatus’).textContent = ‘reloading…’;
document.getElementById(‘sbody’).innerHTML = ‘<div class="loader">Fetching from Google Sheet…</div>’;
rStudy();
}

// ── STREAK ────────────────────────────────────
function checkStreak() {
const t = today(), s = db.streak;
if (s.last === t) return;
const yest = new Date();
yest.setDate(yest.getDate() - 1);
s.count = (s.last === yest.toISOString().slice(0, 10)) ? s.count + 1 : 1;
s.last = t;
save();
}

// ── DASHBOARD ─────────────────────────────────
function rDash() {
const h = new Date().getHours();
document.getElementById(‘gtime’).textContent = h < 12 ? ‘morning’ : h < 17 ? ‘afternoon’ : ‘evening’;
document.getElementById(‘dlabel’).textContent = new Date().toLocaleDateString(‘en-IN’, { weekday: ‘long’, day: ‘numeric’, month: ‘long’ });

checkStreak();
const s = db.streak.count;
document.getElementById(‘d-str’).textContent = s;
document.getElementById(‘sarea’).innerHTML = s >= 3
? `<div class="streak"><div class="snum">${s}</div><div class="stxt"><strong>${s >= 7 ? '🔥 On fire!' : '⚡ Building momentum'}</strong><span>${s >= 7 ? 'Consistency is your superpower.' : "Don't break the chain."}</span></div></div>`
: ‘’;

const t = today(), tg = db.goals.filter(g => g.date === t), done = tg.filter(g => g.done).length;
document.getElementById(‘d-gl’).textContent = done + ‘/’ + tg.length;
document.getElementById(‘d-gbar’).style.width = (tg.length ? Math.round(done / tg.length * 100) : 0) + ‘%’;
document.getElementById(‘d-glist’).innerHTML = !tg.length
? `<div style="font-size:13px;color:var(--txt3)">No goals today. <span style="color:var(--teal);cursor:pointer" onclick="go('goals')">Add some →</span></div>`
: tg.slice(0, 4).map(g =>
`<div class="gi ${g.done ? 'done' : ''}" onclick="toggleGoal('${g.id}','dash')"> <div class="gck">${g.done ? '✓' : ''}</div> <div class="gt">${esc(g.text)}</div> <div class="pill ${CAT_CLASS[g.cat] || 'pd'}">${g.cat}</div> </div>`).join(’’)
+ (tg.length > 4 ? `<div style="font-size:12px;color:var(--txt3);padding:4px 0">+${tg.length - 4} more…</div>` : ‘’);

const av = […Object.values(db.skills.sap), …Object.values(db.skills.tech)];
document.getElementById(‘d-sk’).textContent = (av.length ? Math.round(av.reduce((a, b) => a + b, 0) / av.length / 5 * 100) : 0) + ‘%’;
document.getElementById(‘d-logs’).textContent = db.logs.length;
const pp = db.phaseProgress;
document.getElementById(‘phlabel’).textContent = pp.p3 > 0 ? ‘3 — Visible’ : pp.p2 > 0 ? ‘2 — Techno’ : ‘1 — Data’;

const top = […Object.entries(db.skills.sap).slice(0, 3), …Object.entries(db.skills.tech).slice(0, 2)];
document.getElementById(‘d-snap’).innerHTML = top.map(([n, v]) => {
const p = Math.round(v / 5 * 100), c = v >= 4 ? ‘ft’ : v >= 3 ? ‘fp’ : v >= 2 ? ‘fa’ : ‘fr’;
return `<div><div class="prow"><span>${n}</span><span>${p}%</span></div><div class="pb"><div class="pf ${c}" style="width:${p}%"></div></div></div>`;
}).join(’’);

rInsights();
}

function rInsights() {
const t = today(), tg = db.goals.filter(g => g.date === t), done = tg.filter(g => g.done).length;
const ins = [];
if (!tg.length) ins.push({ i: ‘◎’, c: ‘var(–teal)’, ti: “Set today’s goals”, b: ‘3 goals: one SAP table, one SQL query, one thing to document.’ });
else if (done === tg.length) ins.push({ i: ‘✦’, c: ‘var(–grn)’, ti: ‘All goals done!’, b: ‘Now log what you learned. Writing cements knowledge more than reading.’ });
else ins.push({ i: ‘→’, c: ‘var(–amb)’, ti: `${tg.length - done} goals remaining`, b: ‘Even 20 focused minutes beats 2 hours of distracted reading.’ });
if (db.skills.tech[‘SQL/HANA’] < 3) ins.push({ i: ‘⊡’, c: ‘var(–pur)’, ti: ‘SQL is your fastest technical win’, b: “Practice: SELECT EBELN, MENGE FROM EKBE WHERE EBELN=‘4500012345’. Run it, understand every column.” });
if (db.logs.length < 3) ins.push({ i: ‘▤’, c: ‘var(–teal)’, ti: ‘Start logging your learnings’, b: ‘Every issue solved without documenting is a lost compounding opportunity.’ });
if (db.skills.tech[‘ABAP Reading’] === 0) ins.push({ i: ‘◈’, c: ‘var(–amb)’, ti: ‘ABAP reading is closer than you think’, b: “Open SE38, find any MM program, follow the SELECT statements. Read — don’t write yet.” });

document.getElementById(‘d-ins’).innerHTML = ins.map(i =>
`<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:8px;padding:11px;background:var(--bg3);border:1px solid var(--b1);border-radius:var(--rs)"> <div style="font-size:17px;color:${i.c};flex-shrink:0">${i.i}</div> <div><div style="font-size:13px;font-weight:600;margin-bottom:2px">${i.ti}</div> <div style="font-size:12px;color:var(--txt2);line-height:1.6">${i.b}</div></div> </div>`).join(’’);
}

// ── STUDY ─────────────────────────────────────
async function rStudy() {
if (!SD) {
const st = document.getElementById(‘sstatus’);
st.textContent = ‘fetching…’;

```
// Step 1: Try Google Sheet CSV
let sheetCards = null;
if (SHEET_CSV) {
  try {
    const res = await fetch(SHEET_CSV, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) throw new Error('0 rows parsed — check sheet columns: category,question,answer,table,status');
    sheetCards = parsed;
    console.log('[Sheet] Loaded', parsed.length, 'cards. First:', parsed[0]);
  } catch (e) {
    console.warn('[Sheet] Failed:', e.message);
  }
}

// Step 2: Load JSON files — each file fails independently
let localCards, tips, tables, mvt;
try {
  const results = await Promise.allSettled([
    fetch('data/study-cards.json').then(r => { if (!r.ok) throw 0; return r.json(); }),
    fetch('data/sql-tips.json').then(r => { if (!r.ok) throw 0; return r.json(); }),
    fetch('data/sap-tables.json').then(r => { if (!r.ok) throw 0; return r.json(); }),
    fetch('data/movement-types.json').then(r => { if (!r.ok) throw 0; return r.json(); }),
  ]);
  localCards = results[0].status === 'fulfilled' ? results[0].value : FALLBACK.cards;
  tips       = results[1].status === 'fulfilled' ? results[1].value : FALLBACK.tips;
  tables     = results[2].status === 'fulfilled' ? results[2].value : FALLBACK.tables;
  mvt        = results[3].status === 'fulfilled' ? results[3].value : FALLBACK.mvt;
} catch {
  localCards = FALLBACK.cards; tips = FALLBACK.tips; tables = FALLBACK.tables; mvt = FALLBACK.mvt;
}

// Step 3: Merge — sheet cards take priority; add local cards not already in sheet
if (sheetCards && sheetCards.length > 0) {
  const seen = new Set(sheetCards.map(c => c.question));
  const extra = localCards.filter(c => !seen.has(c.question));
  SD = { cards: [...sheetCards, ...extra], tips, tables, mvt };
  st.textContent = sheetCards.length + ' sheet + ' + extra.length + ' local';
  toast('✓ ' + sheetCards.length + ' cards from sheet');
} else {
  SD = { cards: localCards, tips, tables, mvt };
  st.textContent = localCards.length + ' cards (local)';
}
```

}

const tabs = [
{ id: ‘flashcards’, l: ‘Flashcards’ }, { id: ‘sql’, l: ‘SQL Tips’ },
{ id: ‘tables’, l: ‘SAP Tables’ }, { id: ‘mvt’, l: ‘Mvt Types’ }, { id: ‘flows’, l: ‘Flows’ }
];
document.getElementById(‘stabs’).innerHTML = tabs.map(t =>
`<div class="tab ${t.id === curTab ? 'on' : ''}" onclick="switchTab('${t.id}',this)">${t.l}</div>`).join(’’);
renderTab(curTab);
}

function switchTab(id, el) {
curTab = id;
document.querySelectorAll(’#stabs .tab’).forEach(t => t.classList.remove(‘on’));
el.classList.add(‘on’);
renderTab(id);
}

function renderTab(tab) {
const b = document.getElementById(‘sbody’);
if (tab === ‘flashcards’) rCards(SD.cards, b);
else if (tab === ‘sql’)    rSQL(SD.tips, b);
else if (tab === ‘tables’) rTables(SD.tables, b);
else if (tab === ‘mvt’)    rMvt(SD.mvt, b);
else                       rFlows(b);
}

// ── FLASHCARDS ────────────────────────────────
function filteredCards() {
const all = SD?.cards || [];
return activeCat === ‘All’ ? all : all.filter(c => c.category === activeCat);
}

function categoryPicker() {
const all = SD?.cards || [];
const cats = [‘All’, …new Set(all.map(c => c.category).filter(Boolean))];
return `<div class="cat-wrap">${cats.map(c => { const cnt = c === 'All' ? all.length : all.filter(x => x.category === c).length; return `<button class=“cat-btn${c === activeCat ? ’ cat-on’ : ‘’}” onclick=“selectCat(’${c.replace(/’/g, “\’”)}’)”>${esc(c)}<span class="cat-cnt">${cnt}</span></button>`; }).join('')}</div>`;
}

function selectCat(cat) { activeCat = cat; curCard = 0; renderTab(‘flashcards’); }

function rCards(cards, b) {
const picker = categoryPicker();
const filtered = filteredCards();
if (!filtered.length) {
b.innerHTML = picker + ‘<div class="empty"><div class="eico">📚</div><div class="etxt">No cards in this category.</div></div>’;
return;
}
if (curCard >= filtered.length) curCard = 0;
const c = filtered[curCard];

b.innerHTML = picker + `<div class="fc" id="fc" onclick="this.classList.toggle('flip')"> <div class="fci"> <div class="ff"> <div class="fcat">${esc(c.category || 'SAP MM')}</div> <div class="fq">${esc(c.question)}</div> <div class="fhint">Tap to reveal answer</div> </div> <div class="fb"> <div class="fcat">Answer</div> <div class="fans">${esc(c.answer)}</div> ${c.table ? '<div style="margin-top:10px">' + c.table.split(',').map(t =>`<span class="ftag">${t.trim()}</span>`).join('') + '</div>' : ''} </div> </div> </div> <div class="cnav"> <div class="cnum">${curCard + 1} / ${filtered.length}</div> <div style="display:flex;gap:8px"> <button class="btn btn-g btn-s" onclick="prevCard(${filtered.length})">←</button> <button class="btn btn-g btn-s" onclick="nextCard(${filtered.length})">→</button> <button class="btn btn-g btn-s" onclick="shuffleCards()">⇌</button> </div> </div> <div style="text-align:center;font-size:11px;color:var(--txt3);padding:0 16px 16px">${filtered.length} cards · tap to flip</div>`;
}

function nextCard(len) { curCard = (curCard + 1) % len; renderTab(‘flashcards’); }
function prevCard(len) { curCard = (curCard - 1 + len) % len; renderTab(‘flashcards’); }

function shuffleCards() {
if (activeCat === ‘All’) {
SD.cards.sort(() => Math.random() - .5);
} else {
const others = SD.cards.filter(c => c.category !== activeCat);
const cat = SD.cards.filter(c => c.category === activeCat);
cat.sort(() => Math.random() - .5);
SD.cards = […others, …cat];
}
curCard = 0;
renderTab(‘flashcards’);
toast(‘Shuffled!’);
}

// ── SQL TIPS ──────────────────────────────────
function rSQL(tips, b) {
if (!tips?.length) { b.innerHTML = ‘<div class="loader">No SQL tips found.</div>’; return; }
b.innerHTML = ‘<div style="padding:12px 16px">’ + tips.map(t => ` <div class="sqltip"> <div class="sth"><div class="sttl">${esc(t.title)}</div><div class="lv l${(t.level || 'b')[0]}">${t.level || 'basic'}</div></div> <div class="stdesc">${esc(t.desc)}</div> <div style="position:relative"> <div class="code">${t.code}</div> <button class="cpbtn" onclick="cp(\`${(t.raw || ‘’).replace(/\/g, ‘\\’).replace(/`/g, '\\`’)}`)”>copy</button>
</div>
<div class="why">💡 ${esc(t.why)}</div>
</div>`).join(’’) + ‘</div>’;
}

// ── SAP TABLES ────────────────────────────────
function rTables(tables, b) {
if (!tables?.length) { b.innerHTML = ‘<div class="loader">No table data found.</div>’; return; }
b.innerHTML = `<div style="padding:12px 16px"><div class="card" style="overflow-x:auto;padding:0"> <table class="rtable"> <thead><tr><th>Table</th><th>Description &amp; When to Use</th></tr></thead> <tbody>${tables.map(t => `
<tr>
<td class="tn2">${esc(t.name)}</td>
<td><div style="color:var(--txt)">${esc(t.description)}</div><div class="tu">${esc(t.useCase)}</div></td>
</tr>`).join(’’)}
</tbody>
</table>

  </div></div>`;
}

// ── MOVEMENT TYPES ────────────────────────────
function rMvt(mvt, b) {
if (!mvt?.length) { b.innerHTML = ‘<div class="loader">No movement type data found.</div>’; return; }
b.innerHTML = `<div style="padding:12px 16px"><div class="card" style="overflow-x:auto;padding:0"> <table class="rtable"> <thead><tr><th>Mvt</th><th>Name &amp; Notes</th></tr></thead> <tbody>${mvt.map(m => `
<tr>
<td class="tn2">${esc(m.code)}</td>
<td><div style="color:var(--txt)">${esc(m.name)}</div><div class="tu">${esc(m.notes)}</div></td>
</tr>`).join(’’)}
</tbody>
</table>

  </div></div>`;
}

// ── PROCESS FLOWS ─────────────────────────────
function rFlows(b) {
const flow = (steps) => steps.map((s, i) => {
const isLast = i === steps.length - 1;
return `<div class="fstep"><div class="fbox">${s[0]}</div><div class="ftbl">${s[1]}</div></div>${isLast ? '' : '<div class="farr">›</div>'}`;
}).join(’’);

b.innerHTML = `<div style="padding:12px 16px;display:flex;flex-direction:column;gap:0">
<div class="card"><div class="ct">Standard Procurement</div><div class="flow">
${flow([[‘PR’,‘EBAN’],[‘PO’,‘EKKO/EKPO’],[‘GR’,‘MKPF/MSEG’],[‘IR’,‘RBKP/RSEG’],[‘Pay’,‘BKPF/BSEG’]])}
</div></div>
<div class="card"><div class="ct">GR/IR Debug Checklist</div>
<div style="font-size:13px;color:var(--txt2);line-height:2;font-family:var(--mono)">
1. EKKO → PO exists? Status OK?<br>
2. EKPO → item qty, price, plant<br>
3. EKBE → SUM GR (BEWTP=E) vs IR (BEWTP=Q)<br>
4. MSEG → movement detail via MBLNR+MJAHR<br>
5. RBKP/RSEG → IR qty and amount<br>
6. BKPF/BSEG → FI doc if accounting issue
</div>
</div>
<div class="card"><div class="ct">STO Flow</div><div class="flow">
${flow([[‘STO PO’,‘EKKO(UB)’],[‘Out Dlv’,‘LIKP/LIPS’],[‘GI 641’,‘MSEG’],[‘GR 101’,‘MSEG’]])}
</div></div>
<div class="card"><div class="ct">Subcontracting Flow</div><div class="flow">
${flow([[‘Sub PO’,‘EKKO(30)’],[‘GI Comp’,‘MSEG 541’],[‘GR FG’,‘MSEG 101’],[‘IR’,‘RBKP/RSEG’]])}
</div></div>

  </div>`;
}

// ── GOALS ─────────────────────────────────────
const CAT_CLASS = { data: ‘pd’, sql: ‘ps’, debug: ‘pb2’, abap: ‘pa’, write: ‘pw’ };

const SUGGESTED = [
{ t: ‘Open SE16N → explore EKBE for any active PO in your project’, c: ‘data’ },
{ t: ‘Write SQL: SUM GR qty vs IR qty in EKBE for one PO’, c: ‘sql’ },
{ t: ‘Understand why mvt 101 creates FI doc but 103 does not’, c: ‘data’ },
{ t: ‘Trace one full PR→PO→GR→IR by document number’, c: ‘data’ },
{ t: ‘Find a price variance between EKPO.NETPR and RBKP for any invoice’, c: ‘debug’ },
{ t: ‘Write 3-line root cause summary for one issue you solved this week’, c: ‘write’ },
{ t: ‘Open SE38, read any MM program, follow the SELECT statements’, c: ‘abap’ },
{ t: ‘Set a breakpoint in debug mode on a GR posting (MIGO)’, c: ‘abap’ },
{ t: ‘Find BADI ME_PROCESS_PO_CUST in SE18 and read its description’, c: ‘abap’ },
{ t: ‘Query MARD to check unrestricted stock for a material+plant’, c: ‘sql’ },
{ t: ‘Write a 1-page doc: How to debug a GR/IR quantity mismatch’, c: ‘write’ },
{ t: ‘Check EKKO.BSTYP to understand PO document categories in your project’, c: ‘data’ },
];

function addGoal() {
const text = document.getElementById(‘gi’).value.trim();
if (!text) { toast(‘Enter a goal first’); return; }
db.goals.push({ id: Date.now().toString(), text, cat: document.getElementById(‘gcat’).value, date: today(), done: false });
save();
document.getElementById(‘gi’).value = ‘’;
document.getElementById(‘addp’).style.display = ‘none’;
rGoals();
toast(‘Goal added ✓’);
}

function toggleGoal(id, src) {
const g = db.goals.find(g => g.id === id);
if (g) { g.done = !g.done; save(); }
if (src === ‘dash’) rDash(); else rGoals();
}

function deleteGoal(id) { db.goals = db.goals.filter(g => g.id !== id); save(); rGoals(); }

function clearDone() {
db.goals = db.goals.filter(g => !(g.done && g.date === today()));
save(); rGoals(); toast(‘Cleared’);
}

function addSuggested(i) {
const s = SUGGESTED[i];
db.goals.push({ id: Date.now().toString(), text: s.t, cat: s.c, date: today(), done: false });
save(); rGoals(); toast(‘Added ✓’);
}

function rGoals() {
const t = today(), tg = db.goals.filter(g => g.date === t);
document.getElementById(‘glist’).innerHTML = !tg.length
? ‘<div class="empty"><div class="eico">◎</div><div class="etxt">No goals today yet.<br>Tap + Add above.</div></div>’
: tg.map(g =>
`<div class="gi ${g.done ? 'done' : ''}" onclick="toggleGoal('${g.id}','goals')"> <div class="gck">${g.done ? '✓' : ''}</div> <div class="gt">${esc(g.text)}</div> <div class="pill ${CAT_CLASS[g.cat] || 'pd'}">${g.cat}</div> <button class="del" onclick="event.stopPropagation();deleteGoal('${g.id}')">×</button> </div>`).join(’’);

document.getElementById(‘suglist’).innerHTML = SUGGESTED.map((s, i) =>
`<div class="gi" style="cursor:default"> <div class="pill ${CAT_CLASS[s.c] || 'pd'}" style="flex-shrink:0">${s.c}</div> <div class="gt" style="font-size:13px">${esc(s.t)}</div> <button class="btn btn-g btn-s" onclick="addSuggested(${i})">+</button> </div>`).join(’’);
}

// ── LOG ───────────────────────────────────────
function saveLog() {
const title = document.getElementById(‘ltitle’).value.trim();
const body = document.getElementById(‘lbody’).value.trim();
if (!title || !body) { toast(‘Add title and notes’); return; }
db.logs.unshift({
id: Date.now().toString(),
title, body,
type: document.getElementById(‘ltype’).value,
tags: document.getElementById(‘ltags’).value.trim(),
date: today()
});
save();
[‘ltitle’, ‘lbody’, ‘ltags’].forEach(id => document.getElementById(id).value = ‘’);
document.getElementById(‘logp’).style.display = ‘none’;
rLog();
toast(‘Saved ✓’);
}

function deleteLog(id) { db.logs = db.logs.filter(l => l.id !== id); save(); rLog(); }

function rLog() {
const ll = document.getElementById(‘llist’);
if (!db.logs.length) {
ll.innerHTML = ‘<div class="empty"><div class="eico">▤</div><div class="etxt">Your learning journal is empty.<br>Every issue you solve is worth documenting.</div></div>’;
return;
}
ll.innerHTML = db.logs.map(l => {
const tags = l.tags ? l.tags.split(’,’).map(t => t.trim()).filter(Boolean) : [];
return `<div class="le ${l.type}"> <div class="lh"> <div class="lt">${esc(l.title)}</div> <div style="display:flex;align-items:center;gap:6px"> <div class="ld">${fmtDate(l.date)}</div> <button class="del" onclick="deleteLog('${l.id}')">×</button> </div> </div> <div class="lb2">${esc(l.body)}</div> ${tags.length ? '<div class="ltags">' + tags.map(t => `<span class="ltag">${t}</span>`).join('') + '</div>' : ''} </div>`;
}).join(’’);
}

// ── MORE ──────────────────────────────────────
function rMore() { rSkills(); }

function mtab(id, el) {
[‘skills’, ‘activity’, ‘review’, ‘roadmap’].forEach(t => document.getElementById(‘mt-’ + t).style.display = ‘none’);
document.querySelectorAll(’#mtabs .tab’).forEach(t => t.classList.remove(‘on’));
document.getElementById(‘mt-’ + id).style.display = ‘block’;
el.classList.add(‘on’);
({ skills: rSkills, activity: rActivity, review: rReviews, roadmap: rRoadmap }[id] || rSkills)();
}

// Skills
function rSkills() {
rSkillGroup(‘sk-sap’, db.skills.sap, ‘dT’);
rSkillGroup(‘sk-tech’, db.skills.tech, ‘dP’);
const all = […Object.entries(db.skills.sap), …Object.entries(db.skills.tech)];
document.getElementById(‘sk-all’).innerHTML = all.map(([n, v]) => {
const p = Math.round(v / 5 * 100), c = v >= 4 ? ‘ft’ : v >= 3 ? ‘fp’ : v >= 2 ? ‘fa’ : ‘fr’;
return `<div><div class="prow"><span>${n}</span><span>${p}%</span></div><div class="pb"><div class="pf ${c}" style="width:${p}%"></div></div></div>`;
}).join(’’);
}

function rSkillGroup(elId, group, dotClass) {
document.getElementById(elId).innerHTML = Object.entries(group).map(([name, val]) =>
`<div class="ski"> <div class="skn">${name}</div> <div class="dots">${[1,2,3,4,5].map(i => `<div class="dot ${val >= i ? dotClass : ''}" onclick="setSkill('${elId}','${name}',${i})">${i}</div>` ).join('')}</div> </div>`).join(’’);
}

function setSkill(elId, name, val) {
const gk = elId === ‘sk-sap’ ? ‘sap’ : ‘tech’;
db.skills[gk][name] = val;
save(); rSkills(); toast(‘Updated ✓’);
}

// Activity
function rActivity() {
const days = [‘M’,‘T’,‘W’,‘T’,‘F’,‘S’,‘S’], wdates = [];
for (let i = 6; i >= 0; i–) { const d = new Date(); d.setDate(d.getDate() - i); wdates.push(d.toISOString().slice(0, 10)); }

document.getElementById(‘wrow’).innerHTML = wdates.map((date, i) =>
`<div class="wd ${(db.heatmap[date] || 0) > 0 ? 'on' : ''} ${date === today() ? 'now' : ''}" onclick="toggleWeekDay('${date}')"> <div class="wdot"></div>${days[i]} </div>`).join(’’);

const cells = [];
for (let i = 89; i >= 0; i–) {
const d = new Date(); d.setDate(d.getDate() - i);
const k = d.toISOString().slice(0, 10), v = db.heatmap[k] || 0;
cells.push(`<div class="hmc hm${v}" onclick="cycleHeatmap('${k}')"></div>`);
}
document.getElementById(‘hmg’).innerHTML = cells.join(’’);

const vals = Object.values(db.heatmap);
const activeDays = vals.filter(v => v > 0).length;
const pts = vals.reduce((a, b) => a + b, 0);
const weekActive = wdates.filter(d => (db.heatmap[d] || 0) > 0).length;
let best = 0, cur = 0;
for (let i = 89; i >= 0; i–) {
const d = new Date(); d.setDate(d.getDate() - i);
const k = d.toISOString().slice(0, 10);
if ((db.heatmap[k] || 0) > 0) { cur++; best = Math.max(best, cur); } else cur = 0;
}
document.getElementById(‘hm-a’).textContent = activeDays;
document.getElementById(‘hm-w’).textContent = weekActive + ‘/7’;
document.getElementById(‘hm-p’).textContent = pts;
document.getElementById(‘hm-b’).textContent = best;
}

function toggleWeekDay(date) { db.heatmap[date] = (db.heatmap[date] || 0) > 0 ? 0 : 2; save(); rActivity(); }
function cycleHeatmap(date) { db.heatmap[date] = ((db.heatmap[date] || 0) + 1) % 5; save(); rActivity(); }

// Weekly review
function saveRv() {
const v = [1,2,3,4].map(i => document.getElementById(‘rv’ + i).value.trim());
if (!v.some(Boolean)) { toast(‘Fill at least one field’); return; }
db.reviews.unshift({ id: Date.now().toString(), date: today(), good: v[0], bad: v[1], next: v[2], win: v[3] });
save();
[1,2,3,4].forEach(i => document.getElementById(‘rv’ + i).value = ‘’);
rReviews(); toast(‘Saved ✓’);
}

function deleteReview(id) { db.reviews = db.reviews.filter(r => r.id !== id); save(); rReviews(); }

function rReviews() {
const pr = document.getElementById(‘past-rv’);
if (!db.reviews.length) { pr.innerHTML = ‘<div class="empty"><div class="eico">◷</div><div class="etxt">No reviews yet.</div></div>’; return; }
const fields = [{ k: ‘good’, l: ‘WENT WELL’ }, { k: ‘bad’, l: ‘SLOWED ME’ }, { k: ‘next’, l: ‘NEXT WEEK’ }, { k: ‘win’, l: ‘SOLVED’ }];
pr.innerHTML = db.reviews.map(r =>
`<div class="card"> <div style="display:flex;justify-content:space-between;margin-bottom:10px"> <div class="ct" style="margin:0">${fmtDate(r.date)}</div> <button class="del" onclick="deleteReview('${r.id}')">×</button> </div> ${fields.filter(f => r[f.k]).map(f => `<div style="margin-bottom:8px">
<div style="font-size:10px;color:var(--txt3);font-family:var(--mono);margin-bottom:3px">${f.l}</div>
<div style="font-size:13px;color:var(--txt2)">${esc(r[f.k])}</div>
</div>`).join('')} </div>`).join(’’);
}

// Roadmap
function rRoadmap() {
const phases = [
{ k: ‘p1’, l: ‘Phase 1 — Data Mastery’, c: ‘var(–teal)’ },
{ k: ‘p2’, l: ‘Phase 2 — Techno-Functional’, c: ‘var(–pur)’ },
{ k: ‘p3’, l: ‘Phase 3 — Visible Expertise’, c: ‘var(–amb)’ },
];
document.getElementById(‘phsl’).innerHTML = phases.map(p => {
const v = db.phaseProgress[p.k] || 0;
return `<div class="psl"> <div class="psl-l" style="color:${p.c}">${p.l}</div> <input type="range" min="0" max="100" value="${v}" oninput="setPhase('${p.k}',this.value,this.nextElementSibling)"> <div class="ppct">${v}%</div> </div> <div class="pb" style="margin-bottom:12px"><div class="pf" style="width:${v}%;background:${p.c}"></div></div>`;
}).join(’’);
}

function setPhase(k, v, el) { db.phaseProgress[k] = parseInt(v); el.textContent = v + ‘%’; save(); }

// ── FALLBACK DATA ─────────────────────────────
// Used when JSON files can’t be fetched (offline / local file open)
const FALLBACK = {
cards: [
{ category: ‘SAP MM Tables’, question: ‘What does EKBE store and why is it critical for GR/IR reconciliation?’, answer: “EKBE is the PO History table — every GR and IR against a PO item. BEWTP=‘E’=GR, ‘Q’=IR. Always SUM — multiple entries per item are normal. First stop for any mismatch.”, table: ‘EKBE, EKKO, EKPO’ },
{ category: ‘SAP MM Tables’, question: ‘What is the difference between MSEG and MKPF?’, answer: ‘MKPF is the material document header (MBLNR, MJAHR, BUDAT). MSEG is the line item (qty, movement type, plant, SLoc, PO ref). Always join on MBLNR+MJAHR — never MBLNR alone.’, table: ‘MKPF, MSEG’ },
{ category: ‘SAP MM Tables’, question: ‘What is EBAN and how do you trace a PR to its resulting PO?’, answer: ‘EBAN stores PR items. EBAKZ flag shows if converted to PO. Join EBAN.BANFN+BNFPO to EKPO.BANFN+BNFPO to trace PR→PO.’, table: ‘EBAN, EKPO’ },
{ category: ‘Movement Types’, question: ‘Why does movement type 101 create an FI document but 103 does not?’, answer: ‘101 posts to unrestricted stock — monetary value, so FI creates doc (debit Inventory, credit GR/IR Clearing). 103 posts to blocked/quality stock — no value transfer yet, so no FI doc.’, table: ‘MSEG, EKBE’ },
{ category: ‘Movement Types’, question: ‘What is movement type 122 and what must you check before posting it?’, answer: “122 is Return to Vendor — reverses GR, reduces stock, creates reverse FI doc. Before posting: check EKBE for BEWTP=‘Q’ entries — if an IR exists, cancel it first (MR8M) to avoid an open GR/IR item.”, table: ‘MSEG, EKBE, RBKP’ },
{ category: ‘Debugging’, question: ‘A user says GR quantity is wrong in PO history. Walk through your investigation.’, answer: ‘1. EKBE: SUM MENGE for BEWTP=E. 2. Look for 102 reversals (negative MENGE). 3. MBLNR → MSEG for movement detail. 4. Confirm in MIGO display. 5. Check partial GRs. 6. Check BUDAT for timing issues.’, table: ‘EKBE, MSEG, MKPF’ },
{ category: ‘SQL/HANA’, question: ‘How do you detect GR/IR quantity mismatches across all open POs?’, answer: “SELECT EBELN, EBELP, SUM(CASE WHEN BEWTP=‘E’ THEN MENGE ELSE 0 END) AS gr_qty, SUM(CASE WHEN BEWTP=‘Q’ THEN MENGE ELSE 0 END) AS ir_qty FROM EKBE WHERE MANDT=‘100’ GROUP BY EBELN, EBELP HAVING gr_qty <> ir_qty”, table: ‘EKBE’ },
{ category: ‘SQL/HANA’, question: ‘Why must you always include the MANDT field in SAP HANA queries?’, answer: ‘SAP is multi-client — the same table stores data for all clients. Without MANDT filter your query returns data from ALL clients mixed together, giving wrong totals. Always add WHERE MANDT='100'.’, table: ‘EKKO, EKBE, MSEG’ },
{ category: ‘Techno-Functional’, question: ‘What is a BADI and how does it differ from a User Exit?’, answer: ‘BADIs are object-oriented enhancement points — multiple active implementations supported, no core modification needed. User Exits are older, FM-based, only one implementation allowed. Key MM BADI: ME_PROCESS_PO_CUST. Use SE18 to explore, SE19 to implement.’, table: ‘’ },
{ category: ‘ABAP’, question: ‘You need to find the function module called during MIGO GR posting. How?’, answer: ‘1. ST05 (SQL/ABAP trace) during a test GR. 2. Core GR FM is MB_CREATE_GOODS_MOVEMENT. 3. Set external breakpoint in SE80. 4. Main program: SAPMM07M. 5. SM50 during posting shows which programs are running.’, table: ‘’ },
],
tips: [
{
title: ‘GR/IR quantity mismatch for a PO’, level: ‘basic’,
desc: “Most common MM issue — quantities don’t reconcile between goods receipt and invoice.”,
code: `<span class="k">SELECT</span> <span class="cn">EBELN</span>, <span class="cn">EBELP</span>,\n  <span class="fn">SUM</span>(<span class="k">CASE WHEN</span> <span class="cn">BEWTP</span>=<span class="str">'E'</span> <span class="k">THEN</span> <span class="cn">MENGE</span> <span class="k">ELSE</span> 0 <span class="k">END</span>) <span class="k">AS</span> gr_qty,\n  <span class="fn">SUM</span>(<span class="k">CASE WHEN</span> <span class="cn">BEWTP</span>=<span class="str">'Q'</span> <span class="k">THEN</span> <span class="cn">MENGE</span> <span class="k">ELSE</span> 0 <span class="k">END</span>) <span class="k">AS</span> ir_qty\n<span class="k">FROM</span> <span class="tn">EKBE</span>\n<span class="k">WHERE</span> <span class="cn">MANDT</span>=<span class="str">'100'</span> <span class="k">AND</span> <span class="cn">EBELN</span>=<span class="str">'4500012345'</span>\n<span class="k">GROUP BY</span> <span class="cn">EBELN</span>, <span class="cn">EBELP</span>\n<span class="k">HAVING</span> gr_qty <> ir_qty`,
raw: `SELECT EBELN, EBELP,\n  SUM(CASE WHEN BEWTP='E' THEN MENGE ELSE 0 END) AS gr_qty,\n  SUM(CASE WHEN BEWTP='Q' THEN MENGE ELSE 0 END) AS ir_qty\nFROM EKBE\nWHERE MANDT='100' AND EBELN='4500012345'\nGROUP BY EBELN, EBELP\nHAVING gr_qty <> ir_qty`,
why: “BEWTP=‘E’=GR, ‘Q’=IR. SUM handles partial GRs and reversals. HAVING filters only mismatched lines.”
},
{
title: ‘All stock movements for a material’, level: ‘basic’,
desc: ‘Trace every goods movement — essential for stock reconciliation.’,
code: `<span class="k">SELECT</span> <span class="cn">H.MBLNR</span>, <span class="cn">H.BUDAT</span>, <span class="cn">H.USNAM</span>, <span class="cn">I.BWART</span>, <span class="cn">I.MENGE</span>, <span class="cn">I.LGORT</span>\n<span class="k">FROM</span> <span class="tn">MKPF</span> <span class="k">AS</span> H\n<span class="k">INNER JOIN</span> <span class="tn">MSEG</span> <span class="k">AS</span> I <span class="k">ON</span> H.MBLNR=I.MBLNR <span class="k">AND</span> H.MJAHR=I.MJAHR\n<span class="k">WHERE</span> I.MATNR=<span class="str">'000000000010001234'</span>\n  <span class="k">AND</span> I.WERKS=<span class="str">'1000'</span> <span class="k">AND</span> H.BUDAT>=<span class="str">'20240101'</span>\n<span class="k">ORDER BY</span> H.BUDAT <span class="k">DESC</span>`,
raw: `SELECT H.MBLNR, H.BUDAT, H.USNAM, I.BWART, I.MENGE, I.LGORT\nFROM MKPF AS H\nINNER JOIN MSEG AS I ON H.MBLNR=I.MBLNR AND H.MJAHR=I.MJAHR\nWHERE I.MATNR='000000000010001234' AND I.WERKS='1000' AND H.BUDAT>='20240101'\nORDER BY H.BUDAT DESC`,
why: ‘Always join MKPF+MSEG on BOTH MBLNR and MJAHR — MBLNR alone is not unique across fiscal years. USNAM shows who posted.’
},
],
tables: [
{ name: ‘EKKO’, description: ‘Purchase Order Header’, useCase: ‘First stop for any PO issue. Vendor (LIFNR), doc type (BSTYP), company code, purchasing org, created by (ERNAM).’ },
{ name: ‘EKPO’, description: ‘Purchase Order Line Item’, useCase: ‘Material, ordered qty (MENGE), net price (NETPR), plant (WERKS), delivery complete flag (ELIKZ), deletion flag (LOEKZ).’ },
{ name: ‘EKBE’, description: ‘PO History — All GR and IR Entries’, useCase: “GR/IR reconciliation. BEWTP=‘E’=GR, ‘Q’=IR. Always SUM — partial GRs and reversals create multiple rows.” },
{ name: ‘MSEG’, description: ‘Material Document Line Item’, useCase: ‘Movement detail: BWART (mvt type), MENGE (qty), LGORT (SLoc), WERKS (plant), EBELN/EBELP (PO ref). Join MKPF on MBLNR+MJAHR.’ },
{ name: ‘MKPF’, description: ‘Material Document Header’, useCase: ‘MBLNR (doc number), MJAHR (year), BUDAT (posting date), USNAM (user). Never join on MBLNR alone.’ },
{ name: ‘MARD’, description: ‘Stock by Storage Location’, useCase: ‘LABST=unrestricted, INSME=quality, EINME=in-transit. Definitive current stock table per material+plant+SLoc.’ },
{ name: ‘RBKP’, description: ‘Invoice Header (MIRO)’, useCase: “LIFNR (vendor), BLDAT (invoice date), RMWWR (gross amount), BSTAT (‘A’=parked, ‘B’=posted), XBLNR (vendor ref).” },
{ name: ‘RSEG’, description: ‘Invoice Line Items’, useCase: ‘EBELN/EBELP (PO ref), MENGE (invoiced qty), DMBTR (amount). Join RBKP on BELNR+GJAHR.’ },
],
mvt: [
{ code: ‘101’, name: ‘GR to Unrestricted Stock’, notes: ‘Most common. Creates FI doc (debit Inventory, credit GR/IR Clearing). Appears in EKBE as BEWTP=E.’ },
{ code: ‘102’, name: ‘Reversal of GR (101)’, notes: ‘Cancels 101. Negative MENGE in EKBE. Original entry stays — always SUM, never count rows.’ },
{ code: ‘103’, name: ‘GR to Blocked/Quality Stock’, notes: ‘No FI doc — no value transfer. Stock sits in INSME field. Accounting happens at mvt 105.’ },
{ code: ‘105’, name: ‘Blocked → Unrestricted Stock’, notes: ‘FI doc created here (debit Inventory, credit GR/IR Clearing). This is when financial value is recognised.’ },
{ code: ‘122’, name: ‘Return to Vendor’, notes: ‘Reverses GR. Reduces stock, creates reverse FI doc. Check EKBE for existing IR before posting.’ },
{ code: ‘261’, name: ‘GI for Production Order’, notes: ‘PP-MM integration. Consumes raw materials for production. Creates FI doc.’ },
{ code: ‘301’, name: ‘Plant-to-Plant Transfer (1-step)’, notes: ‘Direct between plants. No delivery needed. FI posts to both plants.’ },
{ code: ‘311’, name: ‘Storage Location Transfer’, notes: ‘Within same plant. No FI doc — only MARD changes.’ },
{ code: ‘541’, name: ‘GI to Subcontractor’, notes: ‘Components to vendor special stock. No FI doc yet — still company-owned.’ },
{ code: ‘551’, name: ‘Scrapping’, notes: ‘Permanent removal. FI write-off entry. Irreversible.’ },
{ code: ‘601’, name: ‘GI for SD Delivery’, notes: ‘Key SD-MM integration. Posted in VL02N. Creates COGS FI entry.’ },
{ code: ‘641’, name: ‘GI for STO with Delivery’, notes: ‘Goods issue from issuing plant for inter-company STO with outbound delivery.’ },
]
};

// ── INIT ──────────────────────────────────────
rDash();