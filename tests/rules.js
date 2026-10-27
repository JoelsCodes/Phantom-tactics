// Headless rules test: out-of-bounds damage instead of death, and 8 confines on every stage.
// Run: NODE_PATH=$(npm root -g) node tests/rules.js
const { chromium } = require('playwright');
const path = require('path');
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

  ok(await p.evaluate(() => STAGES.every(s => s.conf === 8)), 'every stage allows 8 confines');
  await p.evaluate(() => startBattle(STAGES[2]));
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => G.confLeft === 8 && /8\/8/.test(document.querySelector('#top').textContent)), 'battle starts with 8/8 confines');

  // Marona knocked out of bounds: hurt, not dead, and back on the island.
  const m = await p.evaluate(async () => {
    const h = host(), max = stat(h, 'hp');
    await knock(h, h.x + 50, h.y, 999);
    return { alive: alive(h), lost: max - h.hp, max, inside: inIsland(h.x, h.y), over: G.over, falling: h.falling };
  });
  ok(m.alive && !m.over && m.lost === Math.round(m.max * 0.3) && m.inside && m.falling == null, `Marona survives going out of bounds: -${m.lost} of ${m.max} HP, back on the island`);

  // A spirit carrying something keeps it when it lands back on the island.
  const c = await p.evaluate(async () => {
    const plain = objs().filter(o => !OT[o.type].equip), y = confine(ROSTER[1], plain[0]), rock = plain[1];
    y.lift = rock; rock.liftedBy = y; rock.x = y.x; rock.y = y.y;
    await knock(y, y.x + 50, y.y, 999);
    return { alive: alive(y), carry: y.lift === rock, same: Math.hypot(rock.x - y.x, rock.y - y.y) < 1 };
  });
  ok(c.alive && c.carry && c.same, 'a spirit knocked out of bounds keeps its carried object with it');

  // A weak enemy dies from the fall and the thrower gets the EXP.
  const k = await p.evaluate(async () => {
    const q = units('p').find(u => u.name === 'Ysolde'), e = units('e')[0];
    e.hp = 2; const before = G.stats.defeated, n = units('e').length;
    await knock(e, e.x - 50, e.y, 999, q);
    return { dead: !alive(e), defeated: G.stats.defeated - before, left: n - units('e').length, exp: G.exp[q.rid] || 0 };
  });
  ok(k.dead && k.defeated === 1 && k.left === 1 && k.exp > 0, 'an enemy with too little HP is defeated by the fall, and the thrower earns EXP');

  // Objects thrown out of bounds are lost.
  const o = await p.evaluate(async () => {
    const r = objs().find(o => !OT[o.type].equip), n = objs().length;
    await fallOut(r); return { n, after: objs().length, has: objs().includes(r) };
  });
  ok(!o.has && o.after === o.n - 1, 'an object that goes out of bounds is lost');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
