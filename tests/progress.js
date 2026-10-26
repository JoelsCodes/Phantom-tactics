// Headless progression test: sea chart, unlocking, generated stages, EXP and level-ups.
// Run: NODE_PATH=$(npm root -g) node tests/progress.js
const { chromium } = require('playwright');
const path = require('path');
const out = process.env.OUT || path.join(__dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(__dirname, '..', 'index.html') + '?fast&reset';
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url);
  await p.evaluate(() => localStorage.clear());
  await p.waitForTimeout(300);

  // Every generated stage: host, objects and foes on the island, nothing overlapping, a boss present.
  const bad = await p.evaluate(() => STAGES.map((s, i) => {
    const pts = [[s.host.x, s.host.y], ...s.objs.map(o => [o[1], o[2]]), ...s.foes.map(f => [f.x, f.y])];
    const out = pts.filter(([x, y]) => !pip(x, y, s.island)).length;
    let close = 0; for (let a = 0; a < pts.length; a++) for (let c = a + 1; c < pts.length; c++) if (dist(...pts[a], ...pts[c]) < 30) close++;
    return { i, out, close, boss: s.foes.some(f => f.boss), n: s.foes.length, objs: s.objs.length };
  }));
  ok(bad.every(s => !s.out && !s.close && s.boss && s.n >= 6 && s.objs >= 10), '7 stages: everything on the island, spaced out, boss present ' + JSON.stringify(bad.map(s => s.n + '/' + s.objs)));
  ok(await p.evaluate(() => STAGES.every((s, i) => i === 0 || s.lv > STAGES[i - 1].lv)), 'recommended level rises every stage');

  // Sea chart: only stage 1 open, tapping a locked island does nothing.
  await p.click('#dock [data-v=ferry]');
  ok(await p.evaluate(() => MODE === 'chart' && STAGES.map((s, i) => unlocked(i)).join() === 'true,false,false,false,false,false,false'), 'chart opens with only stage 1 unlocked');
  await p.click('#chart [data-s="3"]', { force: true });
  ok(await p.evaluate(() => C.sel === 0), 'locked island cannot be selected');
  await p.screenshot({ path: out + '/chart-1.png' });
  await p.click('[data-h=clist]');
  ok(await p.evaluate(() => document.querySelectorAll('#chart .card').length === 7), 'list view shows all 7 stages');
  await p.click('[data-h=clist]');

  // Win stage 1 with kills credited to Brannoc: EXP + level up, stage 2 unlocks.
  await p.click('[data-h=sail]');
  const r = await p.evaluate(async () => {
    const lv0 = SAVE.roster[0].lv, h0 = SAVE.host.lv;
    const br = confine(ROSTER[0], objs().find(o => o.type === 'rock'));
    for (const e of units('e')) damage(e, 9999, br);
    checkEnd();
    return { over: G.over, ups: G.ups, lv0, lv1: SAVE.roster[0].lv, h0, h1: SAVE.host.lv, txt: document.querySelector('#ovIn').textContent };
  });
  ok(r.over === 'win' && r.lv1 > r.lv0, `Brannoc levels up from kills (Lv ${r.lv0} -> ${r.lv1})`);
  ok(r.ups.some(u => u.name === 'Wren' && u.gain > 0), 'Warden gets the win bonus EXP');
  ok(/Lv \d+ → \d+!/.test(r.txt), 'results screen shows the level-up');
  await p.screenshot({ path: out + '/chart-2-win.png' });
  await p.click('#again');
  await p.click('#dock [data-v=ferry]');
  const ch = await p.evaluate(() => ({ u: STAGES.map((s, i) => unlocked(i)).slice(0, 3).join(), sel: C.sel, cleared: SAVE.cleared }));
  ok(ch.u === 'true,true,false' && ch.sel === 1 && ch.cleared.mossy, 'stage 2 unlocked and pre-selected after the win');
  await p.screenshot({ path: out + '/chart-3.png' });

  // Lose stage 2: EXP kept, stage 3 still locked.
  await p.click('[data-h=sail]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: out + '/chart-4-stage2.png' });
  const lose = await p.evaluate(() => {
    const id = STAGE.id, e = units('e')[0], hst = host(), q = confine(ROSTER[4], objs()[0]);
    damage(e, 9999, q); const x = SAVE.roster[4].exp || 0;
    removeUnit(hst); checkEnd();
    return { id, over: G.over, expBefore: x, exp: SAVE.roster[4].exp, lv: SAVE.roster[4].lv };
  });
  ok(lose.id === 'salt' && lose.over === 'lose', 'stage 2 (Saltreed Shore) battle, lost');
  ok(lose.exp > 0 || lose.lv > 3, 'EXP earned before losing is kept');
  await p.click('#again');
  ok(await p.evaluate(() => !unlocked(2)), 'a loss does not unlock the next stage');

  // Auto-play the last stage a few turns to make sure generated foes and objects behave.
  const ap = await p.evaluate(async () => {
    startBattle(STAGES[6]);
    for (let t = 0; t < 3 && !G.over; t++) {
      const h = host();
      for (const s of ROSTER) { if (!G.confLeft || G.used[s.id]) continue; const o = objs().filter(o => dist(h.x, h.y, o.x, o.y) <= CONF_RANGE)[0]; if (o) confine(s, o) }
      await enemyPhase();
    }
    return { turn: G.turn, over: G.over, foes: units('e').length };
  });
  ok(ap.turn >= 2, 'Ashen Spire plays through enemy phases (' + JSON.stringify(ap) + ')');
  await p.screenshot({ path: out + '/chart-5-spire.png' });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
