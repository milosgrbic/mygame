'use strict';
// ============================================================
//  GAME LOGIC — simulation, economy, saving
// ============================================================

const SAVE_KEY = 'skyhub_save_v1';
const TICK = 0.1;             // simulation step in seconds
const MAX_OFFLINE = 4 * 3600; // max offline time rewarded (seconds)

let S = null;   // the saved game state
let M = null;   // current modifiers (from upgrades + buffs)
const RT = { earnAcc: 0, earnClock: 0, event: null, mood: {} }; // runtime only, not saved

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fmt(n) {
  if (!isFinite(n)) return '∞';
  const neg = n < 0; n = Math.abs(n);
  let s;
  if (n < 1000) s = (n < 10 && n % 1 !== 0) ? n.toFixed(1) : Math.floor(n).toString();
  else {
    const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    let i = -1;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    s = (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)) + u[i];
  }
  return (neg ? '-' : '') + s;
}
const fmtMoney = n => '$' + fmt(n);
function fmtTime(sec) {
  sec = Math.floor(sec);
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
  return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm';
}

// ---------- state ----------
function defaultState() {
  const fac = {};
  for (const id in FACILITIES) fac[id] = { count: FACILITIES[id].start, level: 1 };
  return {
    v: 1, money: 150, totalEarned: 0, served: 0, rep: 0, sat: 0.8, clean: 100, anger: 0,
    fac, q: { checkin: 0, security: 0, lounge: 0 }, arrAcc: 0,
    airlines: { skyhop: { timer: 4 } },
    gates: [null], holding: [], research: {}, goal: 0, goalDone: false, buffs: [],
    eventTimer: 75, planeTimer: 40, incomeRate: 0, seq: 100,
    stats: { departed: 0, cancelled: 0, missed: 0, taps: 0, events: 0 },
    lastSave: Date.now(), playTime: 0,
  };
}

function computeMods() {
  const m = { checkin: 1, security: 1, gates: 1, cleaners: 1, shops: 1, ticket: 1, demand: 1,
    turnaround: 1, dirt: 1, satAdd: 0, tap: 1, lounge: 1, offline: 0.5, rep: 1 };
  const apply = fx => {
    for (const k in fx) {
      if (k === 'satAdd') m.satAdd += fx[k];
      else if (k === 'offline') m.offline = Math.max(m.offline, fx[k]);
      else m[k] *= fx[k];
    }
  };
  for (const r of RESEARCH) if (S.research[r.id]) apply(r.fx);
  for (const b of S.buffs) apply(b.fx);
  return m;
}

// ---------- stats ----------
function lvlMult(id) { return Math.pow(FACILITIES[id].lvlMult, S.fac[id].level - 1); }
function perUnit(id) { return FACILITIES[id].baseCap * lvlMult(id) * M[id]; }
function cap(id) { return S.fac[id].count * perUnit(id); }
function demandMult() { return (1 + Math.log10(1 + S.rep) * 0.3) * M.demand; }
function demandRate() {
  let r = 0;
  for (const a of AIRLINES) if (S.airlines[a.id]) r += a.pax / a.interval;
  return r * demandMult();
}
function maxQueue(id) { return 60 + 30 * S.fac[id].count; }
function loungeCap() { return (50 + 40 * S.fac.gates.count) * M.lounge; }
function waitTime(id) { return S.q[id] / Math.max(cap(id), 0.01); }

function unitCost(id) {
  const F = FACILITIES[id];
  return Math.round(F.costBase * Math.pow(F.costGrowth, S.fac[id].count - F.start));
}
function levelCost(id) {
  const F = FACILITIES[id];
  return Math.round(F.lvlBase * Math.pow(F.lvlGrowth, S.fac[id].level - 1));
}
function scaledCost(base, seconds) { return Math.round(Math.max(base, S.incomeRate * seconds)); }

// ---------- money / rep ----------
function earn(x) {
  S.money += x; S.totalEarned += x; RT.earnAcc += x;
}
function spend(x) {
  if (S.money < x) return false;
  S.money -= x; return true;
}
function addRep(x) { S.rep = Math.max(0, S.rep + x); }
function addBuff(id, name, fx, seconds) {
  S.buffs = S.buffs.filter(b => b.id !== id);
  S.buffs.push({ id, name, fx, t: seconds, max: seconds });
}

// ---------- player actions ----------
function buyUnit(id) {
  const F = FACILITIES[id];
  if (S.fac[id].count >= F.max) return false;
  if (!spend(unitCost(id))) return false;
  S.fac[id].count++;
  if (id === 'gates') S.gates.push(null);
  return true;
}
function buyLevel(id) {
  if (S.fac[id].level >= FACILITIES[id].maxLevel) return false;
  if (!spend(levelCost(id))) return false;
  S.fac[id].level++;
  return true;
}
function signAirline(id) {
  const a = AIRLINES.find(x => x.id === id);
  if (!a || S.airlines[id] || S.rep < a.rep) return false;
  if (!spend(a.sign)) return false;
  S.airlines[id] = { timer: 3 };
  return true;
}
function buyResearch(id) {
  const r = RESEARCH.find(x => x.id === id);
  if (!r || S.research[id] || S.rep < r.rep) return false;
  if (!spend(r.cost)) return false;
  S.research[id] = true;
  M = computeMods();
  return true;
}
function claimGoal() {
  const g = GOALS[S.goal];
  if (!g || !g.check(S)) return false;
  earn(g.reward);
  S.goal++;
  return g.reward;
}

// Tapping: the player personally helps out.
function tapPower(id) { return (1 + cap(id)) * M.tap; }
function tapStage(id) {
  S.stats.taps++;
  if (id === 'checkin' || id === 'security') {
    const n = Math.min(S.q[id], tapPower(id));
    S.q[id] -= n;
    if (id === 'checkin') S.q.security += n;
    else { S.q.lounge += n; onSecurityPassed(n); }
    return n;
  }
  if (id === 'lounge') {
    // speed boarding: push lounge passengers onto boarding planes
    let n = (1 + perUnit('gates')) * M.tap, moved = 0;
    for (const f of S.gates) {
      if (!f || f.phase !== 'board' || n <= 0) continue;
      const take = Math.min(S.q.lounge, f.seats - f.boarded, n);
      f.boarded += take; S.q.lounge -= take; n -= take; moved += take;
    }
    return moved;
  }
  if (id === 'clean') {
    const before = S.clean;
    S.clean = Math.min(100, S.clean + (1.5 + cap('cleaners') * 2) * M.tap);
    return S.clean - before;
  }
  return 0;
}

// ---------- simulation ----------
function onSecurityPassed(n) {
  if (n <= 0) return;
  // shops: passengers spend money after security
  if (S.fac.shops.count > 0) earn(n * cap('shops') * (0.4 + 0.8 * S.sat));
  // mess
  S.clean -= n * 0.25 * M.dirt * (1 + 0.04 * S.fac.shops.count);
}

function spawnFlight(a, seats, isCharter) {
  S.holding.push({
    code: a.code + (S.seq++), name: a.name, color: a.color, pay: a.pay,
    seats, boarded: 0, t: 0, phase: 'wait', charter: !!isCharter,
  });
}

function charterFlight() {
  const best = AIRLINES.filter(a => S.airlines[a.id]).reduce((x, y) => (y.pay > x.pay ? y : x));
  const seats = Math.round(30 * demandMult());
  // the team skips check-in and goes straight to security
  S.q.security += seats;
  S.holding.unshift({
    code: 'CH' + (S.seq++), name: 'Charter', color: '#ff7b00', pay: best.pay * 3,
    seats, boarded: 0, t: 0, phase: 'wait', charter: true,
  });
}

function assignGates() {
  for (let i = 0; i < S.gates.length && S.holding.length; i++) {
    if (S.gates[i]) continue;
    const f = S.holding.shift();
    f.phase = 'board'; f.t = 0;
    f.window = 12 + f.seats * 0.15;
    S.gates[i] = f;
  }
  // too many planes circling -> cancellations
  const maxHold = S.gates.length + 2;
  while (S.holding.length > maxHold) {
    let idx = S.holding.findIndex(x => !x.charter);
    if (idx < 0) idx = 0;
    const f = S.holding.splice(idx, 1)[0];
    S.anger += 8; addRep(-0.5); S.stats.cancelled++;
    if (typeof UI !== 'undefined') UI.toast(`✈️ Flight ${f.code} cancelled — no free gate! (-0.5 ⭐)`, 'bad');
  }
}

function depart(i, f) {
  const pax = f.boarded;
  const rev = pax * f.pay * M.ticket * (0.5 + 0.7 * S.sat);
  earn(rev);
  S.served += pax;
  S.stats.departed++;
  // reputation: happy passengers spread the word (harder to gain the bigger you are)
  addRep(pax / 12 * (S.sat - 0.5) * M.rep / (1 + S.rep / 25));
  f.phase = 'turn';
  f.t = 6 * M.turnaround;
  f.tMax = f.t;
  f.rev = rev;
  if (typeof UI !== 'undefined') UI.gateDeparted(i, rev);
}

function overflowQueue(id) {
  const mx = maxQueue(id);
  if (S.q[id] > mx) {
    const ex = S.q[id] - mx;
    S.q[id] = mx;
    S.anger += ex * 0.4;
    S.stats.missed += ex;
  }
}

function tick(dt) {
  M = computeMods();
  S.playTime += dt;

  // buffs run out
  for (const b of S.buffs) b.t -= dt;
  S.buffs = S.buffs.filter(b => b.t > 0);

  // airlines schedule flights, passengers arrive
  const dm = demandMult();
  for (const a of AIRLINES) {
    const st = S.airlines[a.id];
    if (!st) continue;
    st.timer -= dt;
    if (st.timer <= 0) {
      st.timer += a.interval;
      spawnFlight(a, Math.round(a.pax * dm));
    }
    S.arrAcc += (a.pax / a.interval) * dm * dt;
  }
  if (S.arrAcc >= 1) {
    const n = Math.floor(S.arrAcc);
    S.arrAcc -= n;
    S.q.checkin += n;
  }

  // processing chain: check-in -> security -> lounge
  const p1 = Math.min(S.q.checkin, cap('checkin') * dt);
  S.q.checkin -= p1; S.q.security += p1;
  const p2 = Math.min(S.q.security, cap('security') * dt);
  S.q.security -= p2; S.q.lounge += p2;
  onSecurityPassed(p2);

  overflowQueue('checkin');
  overflowQueue('security');
  const lc = loungeCap();
  if (S.q.lounge > lc) {
    const ex = S.q.lounge - lc;
    S.q.lounge = lc; S.anger += ex * 0.5; S.stats.missed += ex;
  }

  // gates
  assignGates();
  const br = perUnit('gates');
  for (let i = 0; i < S.gates.length; i++) {
    const f = S.gates[i];
    if (!f) continue;
    if (f.phase === 'board') {
      f.t += dt;
      const take = Math.min(S.q.lounge, f.seats - f.boarded, br * dt);
      f.boarded += take; S.q.lounge -= take;
      if (f.boarded >= f.seats - 0.001 || f.t >= f.window) depart(i, f);
    } else if (f.phase === 'turn') {
      f.t -= dt;
      if (f.t <= 0) S.gates[i] = null;
    }
  }

  // cleaning
  S.clean = clamp(S.clean + cap('cleaners') * dt, 0, 100);

  // satisfaction
  const wait = waitTime('checkin') + waitTime('security');
  const waitPen = clamp((wait - 15) / 120, 0, 0.5);
  const cleanPen = clamp((80 - S.clean) / 80, 0, 1) * 0.35;
  S.anger *= Math.exp(-dt / 30);
  const angerPen = Math.min(0.4, S.anger / 150);
  const shopBonus = Math.min(0.06, S.fac.shops.count * 0.01);
  const target = clamp(0.8 - waitPen - cleanPen - angerPen + shopBonus + M.satAdd, 0.05, 1);
  S.sat += (target - S.sat) * Math.min(1, dt * 0.08);
  RT.mood = { wait, waitPen, cleanPen, angerPen, shopBonus, satAdd: M.satAdd, target };

  // income rate (smoothed $/s)
  RT.earnClock += dt;
  if (RT.earnClock >= 1) {
    S.incomeRate = S.incomeRate * 0.95 + (RT.earnAcc / RT.earnClock) * 0.05;
    RT.earnAcc = 0; RT.earnClock = 0;
  }

  // random events & bonus planes
  if (!RT.event) S.eventTimer -= dt;
  if (S.eventTimer <= 0 && !RT.event && typeof UI !== 'undefined' && UI.el.modal && UI.el.modal.hidden) {
    const pool = EVENTS.filter(e => !e.cond || e.cond());
    RT.event = pool[Math.floor(Math.random() * pool.length)];
    S.eventTimer = 70 + Math.random() * 60;
    S.stats.events++;
    UI.showEvent(RT.event);
  }
  S.planeTimer -= dt;
  if (S.planeTimer <= 0) {
    S.planeTimer = 60 + Math.random() * 90;
    if (typeof UI !== 'undefined') UI.spawnBonusPlane();
  }
}

function inspection() {
  if (S.clean >= 70) {
    const g = scaledCost(200, 30);
    earn(g); addRep(2);
    return `Spotless! Reward ${fmtMoney(g)} and +2 ⭐`;
  }
  const fine = Math.max(50, Math.round(S.money * 0.1));
  S.money = Math.max(0, S.money - fine); addRep(-2);
  return `Too dirty! Fined ${fmtMoney(fine)} and -2 ⭐. Hire more cleaners!`;
}

function bonusPlaneReward() {
  if (Math.random() < 0.35 && S.incomeRate > 2) {
    addBuff('tailwind', '🌬️ Tailwind', { ticket: 2, shops: 2 }, 30);
    return '🌬️ Tailwind! 2x income for 30s';
  }
  const g = Math.round(Math.max(40, S.incomeRate * 45));
  earn(g);
  return `+${fmtMoney(g)}`;
}

// ---------- save / load ----------
function save() {
  S.lastSave = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage full / private mode */ }
}

function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
  const base = defaultState();
  if (!data) { S = base; return 0; }
  S = Object.assign(base, data);
  for (const id in FACILITIES) if (!S.fac[id]) S.fac[id] = { count: FACILITIES[id].start, level: 1 };
  S.stats = Object.assign(defaultState().stats, S.stats);
  while (S.gates.length < S.fac.gates.count) S.gates.push(null);
  return (Date.now() - (S.lastSave || Date.now())) / 1000;
}

// Gives offline earnings; returns amount earned
function applyOffline(seconds) {
  if (seconds < 30) return 0;
  M = computeMods();
  const secs = Math.min(seconds, MAX_OFFLINE);
  const gain = S.incomeRate * secs * M.offline;
  if (gain > 0) earn(gain);
  RT.earnAcc = 0;
  return gain;
}

function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  S = defaultState();
  M = computeMods();
}
