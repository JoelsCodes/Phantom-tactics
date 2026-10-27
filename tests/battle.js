// Headless battle test: confine, move, attack, lift/throw, steal, equip, enemy AI, full auto-played battle.
// Run: NODE_PATH=$(npm root -g) node tests/battle.js
const { chromium } = require('playwright');
const path = require('path');
const out = process.env.OUT || path.join(__dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(__dirname, '..', 'index.html') + '?fast&reset';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url);
  await p.waitForTimeout(300);
  await p.evaluate(() => startBattle());
  await p.waitForTimeout(300);
  await p.screenshot({ path: out + '/1-start.png' });
  const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) };

  // Confine Brannoc into the Sturdy rock through the real UI.
  const r = await p.evaluate(() => {
    const h = host(); G.sel = h; ui();
    document.querySelector('[data-a=confine]').click();
    return document.querySelectorAll('#sheet .card').length;
  });
  ok(r === 5, 'roster lists the 5 starting spirits');
  await p.click('#sheet .card[data-i="0"]');
  const rockScreen = await p.evaluate(() => { const o = objs().find(o => o.type === 'rock' && o.title === 'Sturdy'); return w2s(o.x, o.y) });
  const box = await p.locator('#cv').boundingBox();
  await p.mouse.click(box.x + rockScreen[0], box.y + rockScreen[1] - 6);
  await p.waitForTimeout(100);
  await p.screenshot({ path: out + '/2-confine-preview.png' });
  await p.click('[data-a=doConf]');
  const c = await p.evaluate(() => { const u = units('p').find(u => u.name === 'Brannoc'); return u && { turns: u.turns, def: stat(u, 'def'), base: u.b.def, conf: G.confLeft } });
  ok(c && c.turns === 6, 'confined spirit has rock turn limit (6)');
  ok(c && c.def > c.base * 1.4, 'rock + Sturdy titles raise DEF (' + c.base + ' -> ' + c.def + ')');
  ok(c && c.conf === 7, 'confine count decreased from 8');

  // Steal: confine Quill, move next to Hexcap and steal its staff (retry until success to test the transfer).
  const st = await p.evaluate(async () => {
    const q = confine(ROSTER[4], objs().find(o => o.type === 'barrel' && o.title === 'Fierce'));
    const hx = units('e').find(e => e.cls === 'Hexcap');
    q.x = hx.x - 25; q.y = hx.y;
    let tries = 0;
    while (hx.held && tries < 40) { q.acted = false; q.sp = 99; await stealFrom(q, hx); tries++ }
    return { qHeld: q.held && q.held.type, hxHeld: !!hx.held, title: q.held && q.held.title, skills: skills(q) };
  });
  ok(st.qHeld === 'staff' && !st.hxHeld, 'steal moves the staff from Hexcap to Quill');
  ok(st.title === 'Elder' && st.skills.includes('bolt'), 'stolen item keeps its title and grants its skill');

  // Lift & throw an enemy out of bounds.
  const th = await p.evaluate(async () => {
    const m = confine(ROSTER[3], objs().find(o => o.type === 'tree' && o.title === 'Elder'));
    const bat = units('e').find(e => e.cls === 'Thornbat');
    m.x = bat.x - 20; m.y = bat.y; m.b.atk = 40;
    const max = stat(bat, 'hp'), n0 = units('e').length;
    if (!canLift(m, bat)) return 'cannot lift';
    m.lift = bat; bat.liftedBy = m;
    await throwAt(m, 600, 100);
    return { n0, n1: units('e').length, alive: units('e').includes(bat), lost: max - bat.hp, max, inside: inIsland(bat.x, bat.y), free: !bat.liftedBy && bat.falling == null, ob: G.stats.ob, defeated: G.stats.defeated };
  });
  ok(th.alive && th.n1 === th.n0 && th.ob === 1 && th.defeated === 0, 'thrown enemy is not killed by going out of bounds');
  ok(th.lost === Math.round(th.max * 0.3) && th.inside && th.free, 'it takes 30% max HP and is put back on the island (' + th.lost + '/' + th.max + ')');

  // Lift the bow from the ground: lifting a weapon equips it.
  const eq = await p.evaluate(() => {
    const y = confine(ROSTER[1], objs().find(o => o.type === 'flower' && o.title === 'Sage'));
    const bow = objs().find(o => o.type === 'bow');
    y.x = bow.x + 20; y.y = bow.y; G.act = y; G.sel = y; G.phase = 'player'; busy = false; ui();
    const btn = document.querySelector('[data-a=lift]');
    if (!btn) return 'no lift button';
    btn.click();
    tap(...w2s(bow.x, bow.y));
    return { held: y.held && y.held.type, onField: objs().includes(bow) };
  });
  ok(eq.held === 'bow' && !eq.onField, 'lifting the bow equips it');
  await p.waitForTimeout(200);
  await p.screenshot({ path: out + '/3-mid.png' });

  // Turn limit: keep ending turns until the Moonbloom spirit (3 of her own turns) leaves.
  const tl = await p.evaluate(async () => {
    const y = units('p').find(u => u.name === 'Ysolde');
    const turns0 = y.turns;
    for (let i = 0; i < 80 && !G.over && alive(y); i++) { await endTurn() }
    return { turns0, gone: !units('p').includes(y), bowDropped: objs().some(o => o.type === 'bow'), over: G.over };
  });
  ok(tl.over || (tl.turns0 === 3 && tl.gone), 'flower spirit leaves after its 3 turns');
  ok(tl.over || tl.bowDropped, 'its held bow drops on the field');
  await p.screenshot({ path: out + '/4-after-enemy.png' });

  // Full auto-play from a fresh battle: simple player bot, check the battle finishes without errors.
  const res = await p.evaluate(async () => {
    newBattle();
    let guard = 0;
    while (!G.over && guard++ < 600) {
      const u = G.act;
      if (!u || u.team !== 'p') { await new Promise(r => setTimeout(r, 10)); continue }
      if (u.host) {
        // confine whoever is free into the nearest objects
        for (const s of ROSTER) {
          if (!G.confLeft || G.used[s.id]) break;
          const o = objs().filter(o => !o.liftedBy && dist(u.x, u.y, o.x, o.y) <= CONF_RANGE).sort((a, b) => b.x - a.x)[0];
          if (!o) break;
          confine(s, o);
        }
      }
      {
        const foes = units('e').filter(e => !e.liftedBy); if (!foes.length) break;
        const t = foes.sort((a, b) => dist(u.x, u.y, a.x, a.y) - dist(u.x, u.y, b.x, b.y))[0];
        const sk = skills(u).map(k => ({ k, ...SK[k] })).filter(s => (s.t === 'phys' || s.t === 'mag') && u.sp >= s.sp).sort((a, b) => b.pow - a.pow);
        if (!sk.length) { await endTurn(); continue }
        let s = sk.find(s => dist(u.x, u.y, t.x, t.y) <= s.rng + t.r);
        if (!s && !u.host) {
          const d = dist(u.x, u.y, t.x, t.y), step = Math.min(u.mvLeft, d - 25);
          const p = step > 3 && findFree(u.x + (t.x - u.x) / d * step, u.y + (t.y - u.y) / d * step, u);
          if (p) await moveTo(u, p[0], p[1]);
          s = sk.find(s => dist(u.x, u.y, t.x, t.y) <= s.rng + t.r);
        }
        if (s) await useSkill(u, s.k, t.x, t.y, t);
        if (checkEnd()) break;
      }
      await endTurn();
    }
    return { over: G.over, turn: G.turn, stats: G.stats };
  });
  ok(!!res.over, 'auto-played battle ends (' + res.over + ' on turn ' + res.turn + ', ' + JSON.stringify(res.stats) + ')');
  await p.waitForTimeout(200);
  await p.screenshot({ path: out + '/5-end.png' });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
