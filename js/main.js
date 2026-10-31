'use strict';
// ============================================================
//  MAIN LOOP — starts the game, runs the clock, autosaves
// ============================================================

(function start() {
  const away = load();
  M = computeMods();
  UI.init();

  const gain = applyOffline(away);
  if (gain > 0) UI.welcomeBack(away, gain);

  let last = performance.now();
  let acc = 0;
  let saveClock = 0;

  function frame(now) {
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 5) {
      // the tab was in the background for a while: treat it like offline time
      const g = applyOffline(elapsed);
      if (g > 0) UI.welcomeBack(elapsed, g);
      elapsed = 0;
    }
    acc += elapsed;
    let steps = 0;
    while (acc >= TICK && steps < 50) { tick(TICK); acc -= TICK; steps++; }
    if (steps >= 50) acc = 0;

    saveClock += elapsed;
    if (saveClock > 5) { save(); saveClock = 0; }

    UI.refresh();
    setTimeout(() => requestAnimationFrame(frame), 90); // ~10 updates per second is plenty
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  // for testing in the browser console: skip(60) fast-forwards 60 seconds
  window.skip = secs => { for (let i = 0; i < secs / TICK; i++) tick(TICK); UI.refresh(); };
})();
