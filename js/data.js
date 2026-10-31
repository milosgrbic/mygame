'use strict';
// ============================================================
//  GAME DATA — tweak numbers here to balance the game
// ============================================================

// Facilities: things you build more of and upgrade.
// baseCap meaning:
//   checkin / security -> passengers per second per unit
//   gates              -> boarding speed (passengers / second) per gate
//   cleaners           -> cleanliness points restored per second per cleaner
//   shops              -> $ spent per passenger per shop
const FACILITIES = {
  checkin: {
    name: 'Check-in Desks', icon: '🎫', unit: 'desk',
    desc: 'Sell tickets and drop bags. First stop for every passenger.',
    baseCap: 0.5, costBase: 40, costGrowth: 1.55,
    lvlBase: 150, lvlGrowth: 2.1, lvlMult: 1.25, lvlName: 'Train staff',
    start: 1, max: 60, maxLevel: 30, statLabel: 'pax/s',
  },
  security: {
    name: 'Security Lanes', icon: '🛂', unit: 'lane',
    desc: 'Scan bags and passengers. Slow lanes = angry travelers.',
    baseCap: 0.4, costBase: 60, costGrowth: 1.6,
    lvlBase: 200, lvlGrowth: 2.1, lvlMult: 1.25, lvlName: 'Better scanners',
    start: 1, max: 60, maxLevel: 30, statLabel: 'pax/s',
  },
  gates: {
    name: 'Gates', icon: '🚪', unit: 'gate',
    desc: 'Each gate handles one flight at a time. More airlines need more gates.',
    baseCap: 2, costBase: 250, costGrowth: 2.25,
    lvlBase: 500, lvlGrowth: 2.3, lvlMult: 1.25, lvlName: 'Faster boarding',
    start: 1, max: 30, maxLevel: 30, statLabel: 'boarding pax/s per gate',
  },
  cleaners: {
    name: 'Cleaners', icon: '🧹', unit: 'cleaner',
    desc: 'Keep the terminal spotless. Dirty airports make passengers unhappy.',
    baseCap: 0.4, costBase: 30, costGrowth: 1.45,
    lvlBase: 300, lvlGrowth: 2.0, lvlMult: 1.3, lvlName: 'Better equipment',
    start: 0, max: 80, maxLevel: 30, statLabel: 'clean/s',
  },
  shops: {
    name: 'Shops & Cafés', icon: '🛍️', unit: 'shop',
    desc: 'Passengers spend money after security. Happy passengers spend more. Makes a bit of mess.',
    baseCap: 1.0, costBase: 150, costGrowth: 1.65,
    lvlBase: 400, lvlGrowth: 2.1, lvlMult: 1.3, lvlName: 'Better products',
    start: 0, max: 50, maxLevel: 30, statLabel: '$ per passenger',
  },
};

// Airlines: sign contracts to get more flights & passengers.
const AIRLINES = [
  { id: 'skyhop',  name: 'SkyHop Regional',        code: 'SH', color: '#3fa7ff', rep: 0,   sign: 0,     pax: 12,  interval: 20, pay: 3,   desc: 'Small propeller planes. Your very first partner.' },
  { id: 'budget',  name: 'Budget Wings',           code: 'BW', color: '#ffb703', rep: 5,   sign: 400,   pax: 24,  interval: 24, pay: 2.5, desc: 'Cheap tickets, lots of people, low pay.' },
  { id: 'coastal', name: 'Coastal Air',            code: 'CA', color: '#2ec4b6', rep: 15,  sign: 2500,  pax: 30,  interval: 28, pay: 5,   desc: 'Holiday flights to the beach.' },
  { id: 'nordic',  name: 'Nordic Jet',             code: 'NJ', color: '#a0c4ff', rep: 35,  sign: 15000, pax: 50,  interval: 32, pay: 8,   desc: 'Punctual and picky about clean terminals.' },
  { id: 'atlas',   name: 'Atlas Airways',          code: 'AT', color: '#e63946', rep: 70,  sign: 5e4,   pax: 80,  interval: 36, pay: 14,  desc: 'A big national carrier. Needs fast boarding.' },
  { id: 'falcon',  name: 'Royal Falcon',           code: 'RF', color: '#9b5de5', rep: 120, sign: 2.5e5, pax: 120, interval: 40, pay: 24,  desc: 'Luxury long-haul. Pays well.' },
  { id: 'pacific', name: 'Pacific Star',           code: 'PS', color: '#f15bb5', rep: 200, sign: 1.2e6, pax: 180, interval: 45, pay: 40,  desc: 'Huge wide-body jets across the ocean.' },
  { id: 'orbit',   name: 'Orbit Intercontinental', code: 'OI', color: '#00bbf9', rep: 320, sign: 7e6,   pax: 300, interval: 55, pay: 70,  desc: 'The biggest airline in the world.' },
  { id: 'aurora',  name: 'Aurora Luxe',            code: 'AL', color: '#ffd166', rep: 500, sign: 4e7,   pax: 160, interval: 45, pay: 220, desc: 'Private-jet style luxury. Extremely lucrative.' },
];

// Research / one-time upgrades. fx multiplies stats
// (satAdd adds to satisfaction, offline sets offline earnings %).
const RESEARCH = [
  { id: 'online_ci',   icon: '📱', name: 'Online Check-in',        desc: '+25% check-in speed',             cost: 150,    rep: 0,   fx: { checkin: 1.25 } },
  { id: 'trays',       icon: '🧺', name: 'Trays Galore',           desc: '+25% security speed',             cost: 200,    rep: 0,   fx: { security: 1.25 } },
  { id: 'mops',        icon: '🪣', name: 'Better Mops',            desc: '+30% cleaning power',             cost: 250,    rep: 0,   fx: { cleaners: 1.3 } },
  { id: 'groups',      icon: '🔢', name: 'Boarding Groups',        desc: '+30% boarding speed',             cost: 350,    rep: 0,   fx: { gates: 1.3 } },
  { id: 'printers',    icon: '🖨️', name: 'Faster Printers',        desc: '+15% check-in speed',             cost: 400,    rep: 0,   fx: { checkin: 1.15 } },
  { id: 'supervisor',  icon: '🦺', name: 'Helpful Supervisors',    desc: 'Tapping is 2x stronger',          cost: 500,    rep: 0,   fx: { tap: 2 } },
  { id: 'liquids',     icon: '🧴', name: 'Liquids Signs',          desc: '+20% security speed',             cost: 600,    rep: 2,   fx: { security: 1.2 } },
  { id: 'coffee',      icon: '☕', name: 'Coffee Menu',            desc: '+30% shop income',                cost: 800,    rep: 3,   fx: { shops: 1.3 } },
  { id: 'bins',        icon: '🗑️', name: 'Trash Bins Everywhere',  desc: '-25% mess made',                  cost: 1000,   rep: 3,   fx: { dirt: 0.75 } },
  { id: 'wifi',        icon: '📶', name: 'Free Wi-Fi',             desc: '+5% satisfaction',                cost: 1200,   rep: 4,   fx: { satAdd: 0.05 } },
  { id: 'radios',      icon: '📻', name: 'Ground Crew Radios',     desc: '-30% gate turnaround time',       cost: 1500,   rep: 5,   fx: { turnaround: 0.7 } },
  { id: 'ads',         icon: '📢', name: 'Ad Campaign',            desc: '+20% passengers',                 cost: 2000,   rep: 5,   fx: { demand: 1.2 } },
  { id: 'kiosks',      icon: '🖥️', name: 'Self-Service Kiosks',    desc: '+50% check-in speed',             cost: 3000,   rep: 10,  fx: { checkin: 1.5 } },
  { id: 'landing',     icon: '🤝', name: 'Fee Negotiation',        desc: '+20% ticket income',              cost: 3000,   rep: 8,   fx: { ticket: 1.2 } },
  { id: 'seats',       icon: '🛋️', name: 'Comfy Seats',            desc: '+5% satisfaction, +30% lounge space', cost: 4000, rep: 10, fx: { satAdd: 0.05, lounge: 1.3 } },
  { id: 'scanners',    icon: '📡', name: 'Body Scanners',          desc: '+50% security speed',             cost: 5000,   rep: 15,  fx: { security: 1.5 } },
  { id: 'scrubbers',   icon: '🚜', name: 'Floor Scrubbers',        desc: '+60% cleaning power',             cost: 6000,   rep: 12,  fx: { cleaners: 1.6 } },
  { id: 'jetbridge',   icon: '🌉', name: 'Jet Bridges',            desc: '+50% boarding speed',             cost: 8000,   rep: 20,  fx: { gates: 1.5 } },
  { id: 'megaphone',   icon: '📣', name: 'Megaphone',              desc: 'Tapping is 3x stronger',          cost: 10000,  rep: 15,  fx: { tap: 3 } },
  { id: 'boards',      icon: '🪧', name: 'Live Departure Boards',  desc: '+5% satisfaction',                cost: 15000,  rep: 25,  fx: { satAdd: 0.05 } },
  { id: 'dutyfree',    icon: '🛃', name: 'Duty Free License',      desc: '+60% shop income',                cost: 20000,  rep: 30,  fx: { shops: 1.6 } },
  { id: 'nightshift',  icon: '🌙', name: 'Night Shift',            desc: 'Offline earnings 50% → 75%',      cost: 25000,  rep: 30,  fx: { offline: 0.75 } },
  { id: 'priority',    icon: '⚡', name: 'Priority Lane',          desc: '+30% security speed',             cost: 30000,  rep: 35,  fx: { security: 1.3 } },
  { id: 'influencers', icon: '🤳', name: 'Travel Influencers',     desc: '+30% passengers',                 cost: 40000,  rep: 40,  fx: { demand: 1.3 } },
  { id: 'carousel',    icon: '🎠', name: 'Baggage Carousel Upgrade', desc: '+5% satisfaction',              cost: 60000,  rep: 50,  fx: { satAdd: 0.05 } },
  { id: 'lounges',     icon: '🥂', name: 'Premium Lounges',        desc: '+40% ticket income',              cost: 90000,  rep: 60,  fx: { ticket: 1.4 } },
  { id: 'scheduling',  icon: '🗓️', name: 'Smart Gate Scheduling',  desc: '-40% gate turnaround time',       cost: 120000, rep: 70,  fx: { turnaround: 0.6 } },
  { id: 'biometric',   icon: '👁️', name: 'Biometric Check-in',     desc: '2x check-in speed',               cost: 250000, rep: 100, fx: { checkin: 2 } },
  { id: 'aiscreen',    icon: '🤖', name: 'AI Bag Screening',       desc: '2x security speed',               cost: 400000, rep: 120, fx: { security: 2 } },
  { id: 'luxury',      icon: '💎', name: 'Luxury Brands',          desc: '2x shop income',                  cost: 500000, rep: 150, fx: { shops: 2 } },
  { id: 'automation',  icon: '⚙️', name: 'Automation Suite',       desc: 'Offline earnings → 100%',         cost: 1e6,    rep: 150, fx: { offline: 1 } },
  { id: 'hub',         icon: '🌍', name: 'Hub Status',             desc: '+50% ticket income, +25% passengers', cost: 2e6, rep: 200, fx: { ticket: 1.5, demand: 1.25 } },
];

// Goals: a guided chain that teaches the game and gives rewards.
const GOALS = [
  { text: 'Build a 2nd security lane',     reward: 60,     check: s => s.fac.security.count >= 2 },
  { text: 'Build a 2nd check-in desk',     reward: 80,     check: s => s.fac.checkin.count >= 2 },
  { text: 'Hire a cleaner',                reward: 100,    check: s => s.fac.cleaners.count >= 1 },
  { text: 'Serve 100 passengers',          reward: 150,    check: s => s.served >= 100, prog: s => [s.served, 100] },
  { text: 'Buy any upgrade in Upgrades',   reward: 150,    check: s => Object.keys(s.research).length >= 1 },
  { text: 'Open a shop',                   reward: 250,    check: s => s.fac.shops.count >= 1 },
  { text: 'Reach 5 reputation',            reward: 300,    check: s => s.rep >= 5, prog: s => [s.rep, 5] },
  { text: 'Sign Budget Wings',             reward: 400,    check: s => !!s.airlines.budget },
  { text: 'Build a 2nd gate',              reward: 500,    check: s => s.fac.gates.count >= 2 },
  { text: 'Upgrade any facility to level 3', reward: 800,  check: s => Object.values(s.fac).some(f => f.level >= 3) },
  { text: 'Own 5 upgrades',                reward: 1200,   check: s => Object.keys(s.research).length >= 5, prog: s => [Object.keys(s.research).length, 5] },
  { text: 'Earn $10K in total',            reward: 2000,   check: s => s.totalEarned >= 1e4, prog: s => [s.totalEarned, 1e4] },
  { text: 'Sign Coastal Air',              reward: 3000,   check: s => !!s.airlines.coastal },
  { text: 'Have 5 security lanes',         reward: 4000,   check: s => s.fac.security.count >= 5, prog: s => [s.fac.security.count, 5] },
  { text: 'Serve 5,000 passengers',        reward: 8000,   check: s => s.served >= 5000, prog: s => [s.served, 5000] },
  { text: 'Sign Nordic Jet',               reward: 15000,  check: s => !!s.airlines.nordic },
  { text: 'Have 4 gates',                  reward: 25000,  check: s => s.fac.gates.count >= 4, prog: s => [s.fac.gates.count, 4] },
  { text: 'Reach 50 reputation',           reward: 40000,  check: s => s.rep >= 50, prog: s => [s.rep, 50] },
  { text: 'Sign Atlas Airways',            reward: 80000,  check: s => !!s.airlines.atlas },
  { text: 'Earn $1M in total',             reward: 200000, check: s => s.totalEarned >= 1e6, prog: s => [s.totalEarned, 1e6] },
  { text: 'Sign Royal Falcon',             reward: 4e5,    check: s => !!s.airlines.falcon },
  { text: 'Serve 250,000 passengers',      reward: 1e6,    check: s => s.served >= 2.5e5, prog: s => [s.served, 2.5e5] },
  { text: 'Sign Pacific Star',             reward: 2.5e6,  check: s => !!s.airlines.pacific },
  { text: 'Own every upgrade',             reward: 5e6,    check: s => Object.keys(s.research).length >= RESEARCH.length, prog: s => [Object.keys(s.research).length, RESEARCH.length] },
  { text: 'Sign Orbit Intercontinental',   reward: 1.5e7,  check: s => !!s.airlines.orbit },
  { text: 'Sign Aurora Luxe',              reward: 1e8,    check: s => !!s.airlines.aurora },
];

// Random events: decisions that pop up while you play.
// cost/run functions use helpers from game.js.
const EVENTS = [
  {
    id: 'vip', icon: '🕴️', title: 'VIP Delegation',
    text: 'A government delegation is flying out today. Roll out the red carpet?',
    choices: [
      { label: 'Red carpet', cost: () => scaledCost(100, 20),
        run: () => { const g = 2 + S.rep * 0.05; addRep(g); return `The delegation loved it! +${fmt(g)} ⭐`; } },
      { label: 'Treat them like everyone',
        run: () => { if (S.sat >= 0.7) { addRep(1); return 'They were impressed by your normal service. +1 ⭐'; } addRep(-2); return 'They complained about the service. -2 ⭐'; } },
    ],
  },
  {
    id: 'inspector', icon: '🧑‍⚕️', title: 'Health Inspector',
    text: 'A surprise health inspection! They check how clean the terminal is.',
    choices: [
      { label: 'Let them in', run: () => inspection() },
      { label: 'Emergency deep clean first', cost: () => scaledCost(80, 15),
        run: () => { S.clean = 100; return inspection(); } },
    ],
  },
  {
    id: 'storm', icon: '⛈️', title: 'Storm Front',
    text: 'A storm is rolling in. Without a de-icing crew, boarding will slow down a lot.',
    choices: [
      { label: 'Hire de-icing crew', cost: () => scaledCost(60, 15),
        run: () => 'Planes kept flying through the storm. 💪' },
      { label: 'Ride it out',
        run: () => { addBuff('storm', '⛈️ Storm', { gates: 0.3 }, 30); return 'Boarding is slowed for 30s.'; } },
    ],
  },
  {
    id: 'celebrity', icon: '🌟', title: 'Celebrity Spotted!',
    text: 'A famous pop star just posted a selfie from your terminal!',
    choices: [
      { label: 'Awesome!',
        run: () => { addBuff('celeb', '🌟 Fame', { demand: 1.8, shops: 2 }, 40); return 'Fans are rushing in! More passengers & 2x shop income for 40s.'; } },
    ],
  },
  {
    id: 'charter', icon: '🛩️', title: 'Charter Request',
    text: 'A football team needs a charter flight right now. They pay triple!',
    cond: () => S.gates.length >= 1,
    choices: [
      { label: 'Accept charter', run: () => { charterFlight(); return 'The team is heading to security. Get them on board!'; } },
      { label: 'Decline', run: () => 'Maybe next time.' },
    ],
  },
  {
    id: 'strike', icon: '📢', title: 'Security Staff Grumbling',
    text: 'The security team is unhappy and threatening a slowdown. Pay them a bonus?',
    choices: [
      { label: 'Pay bonus', cost: () => scaledCost(80, 20),
        run: () => { addBuff('motivated', '💪 Motivated', { security: 1.5 }, 60); return 'Happy staff work faster! +50% security for 60s.'; } },
      { label: 'Refuse',
        run: () => { addBuff('slowdown', '🐌 Slowdown', { security: 0.5 }, 45); return 'Security slowed to half speed for 45s.'; } },
    ],
  },
  {
    id: 'luggage', icon: '🧳', title: 'Baggage Mix-up',
    text: 'Hundreds of bags were sent to the wrong city. Pay for express couriers?',
    choices: [
      { label: 'Pay couriers', cost: () => scaledCost(70, 15), run: () => 'Bags delivered. Crisis avoided.' },
      { label: 'Let them wait', run: () => { S.anger += 40; return 'Passengers are furious. Satisfaction drops.'; } },
    ],
  },
  {
    id: 'rush', icon: '🏃', title: 'Holiday Rush!',
    text: 'School holidays started. Huge crowds are heading your way!',
    choices: [
      { label: 'Bring it on!',
        run: () => { addBuff('rush', '🏃 Rush', { demand: 2, ticket: 1.3 }, 45); return '2x passengers and +30% ticket income for 45s. Watch your queues!'; } },
    ],
  },
  {
    id: 'investor', icon: '💼', title: 'Investor Visit',
    text: 'An investor toured your airport and liked what they saw.',
    cond: () => S.sat >= 0.65,
    choices: [
      { label: 'Accept investment',
        run: () => { const g = Math.max(300, S.incomeRate * 60); earn(g); return `Received ${fmtMoney(g)}!`; } },
    ],
  },
];
