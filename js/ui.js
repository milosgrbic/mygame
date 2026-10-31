'use strict';
// ============================================================
//  UI — screens, buttons, popups
//  Elements use data-* attributes that get refreshed ~10x/sec:
//    data-b="fn:arg"    -> textContent
//    data-h="fn:arg"    -> innerHTML
//    data-w="fn:arg"    -> style.width (%)
//    data-bg="fn:arg"   -> style.background
//    data-show="fn:arg" -> hidden when false
//    data-ok="fn:arg"   -> disabled when false
// ============================================================

const STAGE_IDS = ['checkin', 'security'];

function satEmoji(s) {
  return s >= 0.85 ? '😍' : s >= 0.7 ? '🙂' : s >= 0.5 ? '😐' : s >= 0.3 ? '😠' : '🤬';
}
function heat(frac) { // 0 = good (green), 1 = bad (red)
  frac = clamp(frac, 0, 1);
  const h = 130 - 130 * frac;
  return `hsl(${h}, 75%, 48%)`;
}
function fmtRate(n) { return n < 10 ? n.toFixed(1) : fmt(n); }

// ---------- binders: small functions that produce live values ----------
const B = {
  money: () => fmtMoney(S.money),
  income: () => '+' + fmtMoney(S.incomeRate) + '/s',
  sat: () => Math.round(S.sat * 100) + '%',
  satEmoji: () => satEmoji(S.sat),
  rep: () => fmt(S.rep),
  arrivals: () => fmtRate(demandRate()) + ' pax/s',
  queue: id => fmt(Math.floor(S.q[id])),
  qmax: id => fmt(maxQueue(id)),
  cap: id => fmtRate(cap(id)) + '/s',
  wait: id => fmtTime(waitTime(id)),
  qfill: id => (S.q[id] / maxQueue(id)) * 100,
  qcolor: id => heat(S.q[id] / maxQueue(id) * 1.4),
  bottleneck: id => waitTime(id) > 20,
  tapAmt: id => '+' + fmtRate(tapPower(id)),
  lounge: () => fmt(Math.floor(S.q.lounge)),
  loungeCap: () => fmt(loungeCap()),
  loungeFill: () => (S.q.lounge / loungeCap()) * 100,
  loungeColor: () => heat(S.q.lounge / loungeCap() * 1.2),
  loungeFull: () => S.q.lounge > loungeCap() * 0.9,
  boardRate: () => fmtRate(perUnit('gates')) + '/s per gate',
  holding: () => S.holding.length,
  holdingText: () => S.holding.length ? `🛬 ${S.holding.length} flight${S.holding.length > 1 ? 's' : ''} circling, waiting for a free gate` : '',
  holdingWarn: () => S.holding.length > 0,
  clean: () => Math.round(S.clean) + '%',
  cleanFill: () => S.clean,
  cleanColor: () => heat(1 - S.clean / 100),
  cleanTap: () => '🧽 Tidy up',
  mood: () => {
    const m = RT.mood; if (!m.target && m.target !== 0) return '';
    const rows = [];
    if (m.waitPen > 0.01) rows.push(`<span class="neg">⏳ Long queues (${fmtTime(m.wait)} wait)</span>`);
    if (m.cleanPen > 0.01) rows.push(`<span class="neg">🤢 Dirty terminal</span>`);
    if (m.angerPen > 0.01) rows.push(`<span class="neg">💢 Missed flights / problems</span>`);
    if (m.shopBonus > 0) rows.push(`<span class="pos">🛍️ Shops</span>`);
    if (m.satAdd > 0) rows.push(`<span class="pos">✨ Comfort upgrades</span>`);
    if (!rows.length) rows.push('<span class="pos">👍 Everything is running smoothly</span>');
    return rows.join('');
  },
  goalText: () => GOALS[S.goal] ? GOALS[S.goal].text : 'All goals complete! 🏆',
  goalReward: () => GOALS[S.goal] ? fmtMoney(GOALS[S.goal].reward) : '',
  goalReady: () => !!GOALS[S.goal] && GOALS[S.goal].check(S),
  goalProg: () => {
    const g = GOALS[S.goal]; if (!g || !g.prog) return '';
    const [a, b] = g.prog(S); return `${fmt(Math.min(a, b))} / ${fmt(b)}`;
  },
  goalProgW: () => {
    const g = GOALS[S.goal]; if (!g) return 100;
    if (g.check(S)) return 100;
    if (!g.prog) return 0;
    const [a, b] = g.prog(S); return clamp(a / b * 100, 0, 100);
  },
  // gates
  gateCode: i => { const f = S.gates[i]; return f ? f.code : 'Free'; },
  gateInfo: i => {
    const f = S.gates[i];
    if (!f) return 'waiting for a plane';
    if (f.phase === 'board') return `${Math.floor(f.boarded)}/${f.seats} boarded`;
    return `🧹 turnaround`;
  },
  gateBar: i => {
    const f = S.gates[i];
    if (!f) return 0;
    if (f.phase === 'board') return f.boarded / f.seats * 100;
    return (f.t / f.tMax) * 100;
  },
  gateTime: i => {
    const f = S.gates[i];
    if (!f || f.phase !== 'board') return '';
    return '⏱ ' + Math.ceil(f.window - f.t) + 's';
  },
  gateBg: i => { const f = S.gates[i]; return f && f.phase === 'board' ? f.color : 'rgba(255,255,255,0.15)'; },
  gatePlane: i => { const f = S.gates[i]; return f ? (f.phase === 'board' ? '🛫' : '🧹') : '⬜'; },
  // build
  count: id => S.fac[id].count,
  level: id => S.fac[id].level,
  unitCost: id => S.fac[id].count >= FACILITIES[id].max ? 'MAX' : fmtMoney(unitCost(id)),
  lvlCost: id => S.fac[id].level >= FACILITIES[id].maxLevel ? 'MAX' : fmtMoney(levelCost(id)),
  canUnit: id => S.fac[id].count < FACILITIES[id].max && S.money >= unitCost(id),
  canLvl: id => S.fac[id].level < FACILITIES[id].maxLevel && S.money >= levelCost(id),
  facStat: id => {
    const F = FACILITIES[id];
    if (id === 'gates') return `${fmtRate(perUnit(id))} ${F.statLabel}`;
    if (id === 'shops') return `${fmtMoney(cap(id))} ${F.statLabel}`;
    return `${fmtRate(cap(id))} ${F.statLabel} total`;
  },
  // airlines / research
  canSign: id => { const a = AIRLINES.find(x => x.id === id); return S.rep >= a.rep && S.money >= a.sign; },
  canResearch: id => { const r = RESEARCH.find(x => x.id === id); return S.rep >= r.rep && S.money >= r.cost; },
  // tab badges
  badgeGoals: () => B.goalReady(),
  badgeAirlines: () => AIRLINES.some(a => !S.airlines[a.id] && S.rep >= a.rep && S.money >= a.sign),
  badgeUpgrades: () => RESEARCH.some(r => !S.research[r.id] && S.rep >= r.rep && S.money >= r.cost),
  buffName: i => S.buffs[i] ? S.buffs[i].name + ' ' + Math.ceil(S.buffs[i].t) + 's' : '',
};

function callB(spec) {
  const i = spec.indexOf(':');
  return i < 0 ? B[spec]() : B[spec.slice(0, i)](spec.slice(i + 1));
}

function patch(root) {
  root.querySelectorAll('[data-b]').forEach(el => {
    const v = String(callB(el.dataset.b));
    if (el._v !== v) { el._v = v; el.textContent = v; }
  });
  root.querySelectorAll('[data-h]').forEach(el => {
    const v = callB(el.dataset.h);
    if (el._v !== v) { el._v = v; el.innerHTML = v; }
  });
  root.querySelectorAll('[data-w]').forEach(el => {
    const v = clamp(callB(el.dataset.w), 0, 100).toFixed(1) + '%';
    if (el._v !== v) { el._v = v; el.style.width = v; }
  });
  root.querySelectorAll('[data-bg]').forEach(el => {
    const v = callB(el.dataset.bg);
    if (el._bg !== v) { el._bg = v; el.style.background = v; }
  });
  root.querySelectorAll('[data-show]').forEach(el => {
    const v = !!callB(el.dataset.show);
    if (el.hidden === v) el.hidden = !v;
  });
  root.querySelectorAll('[data-ok]').forEach(el => {
    const v = !!callB(el.dataset.ok);
    if (el.disabled === v) el.disabled = !v;
  });
}

// ---------- screens ----------
const VIEWS = {
  airport: {
    key: () => 'g' + S.gates.length,
    render() {
      const stage = (id, title, icon) => `
        <section class="card stage">
          <div class="stage-head">
            <span class="stage-title">${icon} ${title}</span>
            <span class="badge bad" data-show="bottleneck:${id}">⚠️ BOTTLENECK</span>
          </div>
          <div class="stage-body">
            <div class="stage-stats">
              <div><small>In line</small><b data-b="queue:${id}"></b><small> / <span data-b="qmax:${id}"></span></small></div>
              <div><small>Speed</small><b data-b="cap:${id}"></b></div>
              <div><small>Wait</small><b data-b="wait:${id}"></b></div>
            </div>
            <button class="tap" data-act="tap" data-id="${id}">👆 Help<br><small data-b="tapAmt:${id}"></small></button>
          </div>
          <div class="bar"><div data-w="qfill:${id}" data-bg="qcolor:${id}"></div></div>
        </section>`;
      let gates = '';
      for (let i = 0; i < S.gates.length; i++) {
        gates += `
          <div class="gate">
            <div class="gate-top"><span>G${i + 1}</span><span data-b="gatePlane:${i}"></span></div>
            <div class="gate-code" data-b="gateCode:${i}"></div>
            <div class="gate-info" data-b="gateInfo:${i}"></div>
            <div class="bar thin"><div data-w="gateBar:${i}" data-bg="gateBg:${i}"></div></div>
            <div class="gate-time" data-b="gateTime:${i}"></div>
          </div>`;
      }
      return `
        <section class="card goal-mini" data-act="tab" data-id="goals">
          <div>🎯 <b data-b="goalText"></b></div>
          <div class="goal-right"><span class="badge good" data-show="goalReady">CLAIM!</span><span class="muted" data-b="goalReward"></span></div>
        </section>

        <section class="card mood">
          <div class="mood-top">
            <div class="mood-face" data-b="satEmoji"></div>
            <div class="mood-main">
              <div>Passenger mood <b data-b="sat"></b></div>
              <div class="mood-reasons" data-h="mood"></div>
            </div>
          </div>
          <div class="clean-row">
            <span>🧼 Clean <b data-b="clean"></b></span>
            <div class="bar grow"><div data-w="cleanFill" data-bg="cleanColor"></div></div>
            <button class="tap small" data-act="tap" data-id="clean" data-b="cleanTap"></button>
          </div>
        </section>

        <div class="arrivals">👥 Passengers arriving: <b data-b="arrivals"></b></div>
        ${stage('checkin', 'Check-in', '🎫')}
        <div class="arrow">⬇</div>
        ${stage('security', 'Security', '🛂')}
        <div class="arrow">⬇</div>
        <section class="card stage">
          <div class="stage-head">
            <span class="stage-title">🪑 Departure Lounge</span>
            <span class="badge bad" data-show="loungeFull">⚠️ FULL — need gates!</span>
          </div>
          <div class="stage-body">
            <div class="stage-stats">
              <div><small>Waiting</small><b data-b="lounge"></b><small> / <span data-b="loungeCap"></span></small></div>
              <div><small>Boarding</small><b data-b="boardRate"></b></div>
            </div>
            <button class="tap" data-act="tap" data-id="lounge">👆 Speed<br><small>boarding</small></button>
          </div>
          <div class="bar"><div data-w="loungeFill" data-bg="loungeColor"></div></div>
        </section>
        <div class="arrow">⬇</div>
        <section class="card">
          <div class="stage-head"><span class="stage-title">🚪 Gates</span></div>
          <div class="holding" data-show="holdingWarn" data-b="holdingText"></div>
          <div class="gates">${gates}</div>
        </section>`;
    },
  },

  build: {
    key: () => 'b',
    render() {
      let html = '<h2>🏗️ Build & Staff</h2><p class="muted">More units = more capacity. Upgrades make every unit faster.</p>';
      for (const id in FACILITIES) {
        const F = FACILITIES[id];
        html += `
          <section class="card fac">
            <div class="fac-head">
              <div class="fac-icon">${F.icon}</div>
              <div class="fac-text">
                <div class="fac-name">${F.name} <span class="muted">×<span data-b="count:${id}"></span> · Lv <span data-b="level:${id}"></span></span></div>
                <div class="muted small">${F.desc}</div>
                <div class="fac-stat" data-b="facStat:${id}"></div>
              </div>
            </div>
            <div class="fac-btns">
              <button class="buy" data-act="unit" data-id="${id}" data-ok="canUnit:${id}">+1 ${F.unit}<br><b data-b="unitCost:${id}"></b></button>
              <button class="buy alt" data-act="lvl" data-id="${id}" data-ok="canLvl:${id}">⬆ ${F.lvlName} (+${Math.round((F.lvlMult - 1) * 100)}%)<br><b data-b="lvlCost:${id}"></b></button>
            </div>
          </section>`;
      }
      return html;
    },
  },

  airlines: {
    key: () => 'a' + Object.keys(S.airlines).length + '_' + AIRLINES.filter(a => S.rep >= a.rep).length,
    render() {
      let html = '<h2>✈️ Airlines</h2><p class="muted">Sign contracts to bring more flights. Earn ⭐ reputation by keeping passengers happy to unlock bigger airlines.</p>';
      let lockedShown = 0;
      for (const a of AIRLINES) {
        const signed = !!S.airlines[a.id];
        const repOk = S.rep >= a.rep;
        if (!signed && !repOk) {
          if (lockedShown >= 2) continue;
          lockedShown++;
        }
        const info = `${a.pax} pax every ${a.interval}s · ${fmtMoney(a.pay)}/passenger`;
        html += `
          <section class="card airline ${signed ? 'signed' : ''} ${!signed && !repOk ? 'locked' : ''}" style="--c:${a.color}">
            <div class="airline-head">
              <div class="tail" style="background:${a.color}">${a.code}</div>
              <div class="fac-text">
                <div class="fac-name">${a.name}</div>
                <div class="muted small">${a.desc}</div>
                <div class="fac-stat">${info}</div>
              </div>
            </div>
            ${signed ? '<div class="signed-tag">✅ Operating at your airport</div>'
              : repOk ? `<button class="buy wide" data-act="sign" data-id="${a.id}" data-ok="canSign:${a.id}">✍️ Sign contract — <b>${a.sign ? fmtMoney(a.sign) : 'Free'}</b></button>`
              : `<div class="locked-tag">🔒 Needs ${a.rep} ⭐ reputation</div>`}
          </section>`;
      }
      return html;
    },
  },

  upgrades: {
    key: () => 'u' + Object.keys(S.research).length + '_' + RESEARCH.filter(r => S.rep >= r.rep).length,
    render() {
      const owned = RESEARCH.filter(r => S.research[r.id]);
      const avail = RESEARCH.filter(r => !S.research[r.id] && S.rep >= r.rep);
      const locked = RESEARCH.filter(r => !S.research[r.id] && S.rep < r.rep).slice(0, 3);
      let html = `<h2>🔬 Upgrades</h2><p class="muted">One-time improvements. Owned ${owned.length} / ${RESEARCH.length}</p>`;
      for (const r of avail) {
        html += `
          <section class="card up">
            <div class="up-icon">${r.icon}</div>
            <div class="fac-text"><div class="fac-name">${r.name}</div><div class="fac-stat">${r.desc}</div></div>
            <button class="buy" data-act="research" data-id="${r.id}" data-ok="canResearch:${r.id}">${fmtMoney(r.cost)}</button>
          </section>`;
      }
      for (const r of locked) {
        html += `
          <section class="card up locked">
            <div class="up-icon">🔒</div>
            <div class="fac-text"><div class="fac-name">${r.name}</div><div class="fac-stat">${r.desc}</div></div>
            <div class="locked-tag small">${r.rep} ⭐</div>
          </section>`;
      }
      if (owned.length) {
        html += `<h3>Owned</h3><div class="owned">${owned.map(r => `<span title="${r.name}: ${r.desc}">${r.icon} ${r.name}</span>`).join('')}</div>`;
      }
      return html;
    },
  },

  goals: {
    key: () => 'goal' + S.goal,
    render() {
      const g = GOALS[S.goal];
      const s = S.stats;
      return `
        <h2>🎯 Goals</h2>
        ${g ? `
        <section class="card goal">
          <div class="muted small">Goal ${S.goal + 1} of ${GOALS.length}</div>
          <div class="goal-text">${g.text}</div>
          <div class="bar"><div data-w="goalProgW" style="background:var(--accent)"></div></div>
          <div class="muted small" data-b="goalProg"></div>
          <button class="buy wide" data-act="claim" data-ok="goalReady">🎁 Claim ${fmtMoney(g.reward)}</button>
        </section>` : '<section class="card goal"><div class="goal-text">🏆 You completed every goal! More coming soon.</div></section>'}
        <h3>📊 Airport stats</h3>
        <section class="card stats">
          <div><span>Passengers served</span><b>${fmt(S.served)}</b></div>
          <div><span>Flights departed</span><b>${fmt(s.departed)}</b></div>
          <div><span>Flights cancelled</span><b>${fmt(s.cancelled)}</b></div>
          <div><span>Passengers lost</span><b>${fmt(s.missed)}</b></div>
          <div><span>Total earned</span><b>${fmtMoney(S.totalEarned)}</b></div>
          <div><span>Times you helped</span><b>${fmt(s.taps)}</b></div>
          <div><span>Play time</span><b>${fmtTime(S.playTime)}</b></div>
        </section>
        <h3>⚙️ Settings</h3>
        <section class="card">
          <p class="muted small">Your game saves automatically on this device.</p>
          <button class="buy danger wide" data-act="reset">🗑️ Reset game</button>
        </section>`;
    },
  },
};

// ---------- UI controller ----------
const UI = {
  tab: 'airport',
  viewKey: null,
  el: {},

  init() {
    this.el.view = document.getElementById('view');
    this.el.hud = document.getElementById('hud');
    this.el.tabs = document.getElementById('tabs');
    this.el.buffs = document.getElementById('buffs');
    this.el.toasts = document.getElementById('toasts');
    this.el.modal = document.getElementById('modal');
    this.el.planes = document.getElementById('plane-layer');

    this.el.tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) this.setTab(b.dataset.tab);
    });
    this.el.view.addEventListener('click', e => this.onAction(e));
    this.setTab('airport');
  },

  setTab(t) {
    this.tab = t;
    this.viewKey = null;
    this.el.tabs.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    this.el.view.scrollTop = 0;
    this.refresh();
  },

  refresh() {
    const v = VIEWS[this.tab];
    const k = v.key();
    if (k !== this.viewKey) {
      const scroll = this.el.view.scrollTop;
      this.el.view.innerHTML = v.render();
      this.el.view.scrollTop = scroll;
      this.viewKey = k;
    }
    patch(this.el.view);
    patch(this.el.hud);
    patch(this.el.tabs);
    this.renderBuffs();
  },

  renderBuffs() {
    const key = S.buffs.map(b => b.id).join(',');
    if (this.el.buffs._k !== key) {
      this.el.buffs._k = key;
      this.el.buffs.innerHTML = S.buffs.map((b, i) => `<span class="buff" data-b="buffName:${i}"></span>`).join('');
    }
    patch(this.el.buffs);
  },

  onAction(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'tap': {
        const n = tapStage(id);
        const r = b.getBoundingClientRect();
        const x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top;
        if (n > 0.05) this.floatText(x, y, id === 'clean' ? `+${n.toFixed(1)}% 🧼` : `+${fmtRate(n)} 👤`, '#7CFFB2');
        else this.floatText(x, y, id === 'clean' ? 'Spotless!' : 'Nobody here', '#ccc');
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
        break;
      }
      case 'unit': if (buyUnit(id)) this.bought(b); break;
      case 'lvl': if (buyLevel(id)) this.bought(b); break;
      case 'sign':
        if (signAirline(id)) { const a = AIRLINES.find(x => x.id === id); this.toast(`✍️ ${a.name} will start flying here!`, 'good'); }
        break;
      case 'research': if (buyResearch(id)) this.bought(b); break;
      case 'claim': {
        const r = claimGoal();
        if (r) { this.toast(`🎁 Goal complete! +${fmtMoney(r)}`, 'good'); this.confetti(); }
        break;
      }
      case 'tab': this.setTab(id); return;
      case 'reset':
        this.confirm('Reset everything? This cannot be undone.', () => { resetGame(); this.setTab('airport'); this.toast('Game reset.'); });
        return;
    }
    this.refresh();
  },

  bought(btn) {
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    if (navigator.vibrate) navigator.vibrate(10);
  },

  floatText(x, y, text, color) {
    const d = document.createElement('div');
    d.className = 'float';
    d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    if (color) d.style.color = color;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 900);
  },

  toast(msg, type) {
    const d = document.createElement('div');
    d.className = 'toast ' + (type || '');
    d.textContent = msg;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 2800);
    setTimeout(() => d.remove(), 3300);
  },

  gateDeparted(i, rev) {
    if (this.tab !== 'airport') return;
    const tiles = this.el.view.querySelectorAll('.gate');
    const t = tiles[i];
    if (!t) return;
    const r = t.getBoundingClientRect();
    this.floatText(r.left + r.width / 2, r.top + 10, '+' + fmtMoney(rev), '#ffd166');
  },

  confetti() {
    for (let i = 0; i < 18; i++) {
      const d = document.createElement('div');
      d.className = 'confetti';
      d.textContent = ['🎉', '✨', '💰', '⭐'][i % 4];
      d.style.left = (10 + Math.random() * 80) + 'vw';
      d.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1600);
    }
  },

  spawnBonusPlane() {
    if (this.el.planes.children.length) return; // one at a time
    const p = document.createElement('button');
    p.className = 'bonus-plane';
    p.textContent = '✈️';
    p.style.top = (90 + Math.random() * 180) + 'px';
    p.addEventListener('click', ev => {
      const msg = bonusPlaneReward();
      this.floatText(ev.clientX, ev.clientY, msg, '#ffd166');
      this.toast('✈️ Bonus plane! ' + msg, 'good');
      p.remove();
      this.refresh();
    });
    p.addEventListener('animationend', () => p.remove());
    this.el.planes.appendChild(p);
  },

  showEvent(ev) {
    const choices = ev.choices.map((c, i) => {
      const cost = c.cost ? c.cost() : 0;
      c._cost = cost;
      const can = S.money >= cost;
      return `<button class="buy wide" data-choice="${i}" ${can ? '' : 'disabled'}>${c.label}${cost ? ` — <b>${fmtMoney(cost)}</b>` : ''}</button>`;
    }).join('');
    this.openModal(`
      <div class="modal-icon">${ev.icon}</div>
      <h2>${ev.title}</h2>
      <p>${ev.text}</p>
      <div class="choices">${choices}</div>`, e => {
      const b = e.target.closest('[data-choice]');
      if (!b || b.disabled) return;
      const c = ev.choices[+b.dataset.choice];
      if (c._cost && !spend(c._cost)) return;
      const msg = c.run();
      RT.event = null;
      this.closeModal();
      if (msg) this.toast(msg, 'good');
      this.refresh();
    });
  },

  confirm(text, onYes) {
    this.openModal(`<h2>Are you sure?</h2><p>${text}</p>
      <div class="choices"><button class="buy danger wide" data-c="y">Yes</button><button class="buy wide" data-c="n">Cancel</button></div>`, e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      this.closeModal();
      if (b.dataset.c === 'y') onYes();
    });
  },

  welcomeBack(seconds, gain) {
    this.openModal(`
      <div class="modal-icon">🌙</div>
      <h2>Welcome back!</h2>
      <p>You were away for <b>${fmtTime(seconds)}</b>.<br>Your airport kept running and earned:</p>
      <div class="big-money">${fmtMoney(gain)}</div>
      <p class="muted small">Offline earnings: ${Math.round(M.offline * 100)}% of normal (max 4h). Buy upgrades to improve this.</p>
      <div class="choices"><button class="buy wide" data-c="ok">Collect 💰</button></div>`, e => {
      if (e.target.closest('[data-c]')) { this.closeModal(); this.confetti(); }
    });
  },

  openModal(html, onClick) {
    const m = this.el.modal;
    m.innerHTML = `<div class="modal-box">${html}</div>`;
    m.hidden = false;
    m.onclick = onClick;
  },
  closeModal() {
    this.el.modal.hidden = true;
    this.el.modal.innerHTML = '';
    this.el.modal.onclick = null;
  },
};
