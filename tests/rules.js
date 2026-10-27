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
  // ---- Loot rules: only confine-then-unconfine can bring a new weapon home. ----
  const battle = (setup) => p.evaluate(async (setup) => {
    SAVE.items = []; for (const r of SAVE.roster) r.item = null; SAVE.host.item = null;
    eval(setup);
    newBattle(); await new Promise(r => setTimeout(r, 100));
  }, setup);
  const win = () => p.evaluate(() => { for (const e of units('e')) removeUnit(e); checkEnd(); const t = document.querySelector('#ovIn').textContent; document.querySelector('#again').click(); return t });
  const store = () => p.evaluate(() => SAVE.items.map(i => i.type + ':' + i.title + ':' + (i.tier || 0)));

  // 1. A weapon a character set sail with stays theirs even if it is lost out of bounds.
  await battle("SAVE.roster[0].item = { id: SAVE.nid++, type: 'axe', title: 'Fierce', tier: 2 }");
  await p.evaluate(async () => {
    const y = confine(ROSTER[0], objs().find(o => !OT[o.type].equip)), axe = y.held; y.held = null; axe.x = 40; axe.y = 100; ents.push(axe);
    await fallOut(axe, y);
  });
  await win();
  ok(await p.evaluate(() => { const i = SAVE.roster[0].item; return i && i.type === 'axe' && i.title === 'Fierce' && i.tier === 2 }) && (await store()).length === 0, 'a weapon you set sail with stays on its character, even if lost out of bounds');

  // 2. Picking up (or stealing) a weapon never brings it home, even if still held at the end.
  await battle("");
  const t2 = await p.evaluate(async () => {
    Math.random = () => 0;
    const y = confine(ROSTER[1], objs().find(o => !OT[o.type].equip)), w = objs().find(o => OT[o.type].equip);
    equipFrom(y, w);
    const hx = units('e').find(e => e.held), it = hx.held; hx.held = null; ents.push(it); it.x = y.x + 12; it.y = y.y; 
    ROSTER[2] && confine(ROSTER[2], objs().filter(o => !OT[o.type].equip)[0]);
    return { held: y.held && y.held.type };
  });
  const txt2 = await win();
  ok(t2.held && (await store()).length === 0 && /No new weapons came home/.test(txt2), 'a weapon picked up on the field is not brought home, even when still held at the end');

  // 3. Confine into a weapon, then unconfine when its turns run out: random chance (forced to succeed here).
  await battle("");
  const t3 = await p.evaluate(async () => {
    Math.random = () => 0;
    const w = objs().find(o => OT[o.type].equip && o.title) || objs().find(o => OT[o.type].equip), type = w.type, title = w.title;
    const y = confine(ROSTER[0], w);
    y.turns = 1; G.act = y; G.phase = 'player'; busy = false;
    await endTurn();
    return { gone: !alive(y), keep: G.keep.map(k => k.type + ':' + k.title), want: type + ':' + title };
  });
  ok(t3.gone && t3.keep[0] === t3.want, 'confined into a weapon and unconfined: it is brought home with its title (' + t3.want + ')');
  await win();
  ok((await store()).includes(t3.want + ':0'), 'the weapon is in storage after the win');

  // 4. A failed roll loses the weapon.
  await battle("");
  const t4 = await p.evaluate(async () => {
    Math.random = () => 0.99;
    const w = objs().find(o => OT[o.type].equip), y = confine(ROSTER[0], w);
    y.turns = 1; G.act = y; G.phase = 'player'; busy = false;
    await endTurn();
    return { keep: G.keep.length, gone: G.gone.length };
  });
  const txt4 = await win();
  ok(t4.keep === 0 && t4.gone === 1 && (await store()).length === 0 && /Slipped away/.test(txt4), 'a failed roll: the weapon slips away');

  // 5. A spirit still confined into a weapon when you win is unconfined then, and rolls too.
  await battle("");
  await p.evaluate(async () => { Math.random = () => 0; confine(ROSTER[0], objs().find(o => OT[o.type].equip)) });
  const txt5 = await win();
  ok((await store()).length === 1 && /Brought home/.test(txt5), 'a spirit still out at the end of the battle rolls for its weapon');

  // 6. A defeated spirit is not unconfined: no roll. Confining into a weapon you already own gives no duplicate.
  await battle("SAVE.roster[1].item = { id: SAVE.nid++, type: 'sword', title: '', tier: 0 }");
  await p.evaluate(async () => {
    Math.random = () => 0;
    const w = objs().find(o => OT[o.type].equip), y = confine(ROSTER[0], w);
    damage(y, 9999, units('e')[0]);
    const z = confine(ROSTER[1], objs().filter(o => !OT[o.type].equip)[0]), own = z.held; z.held = null; own.x = z.x + 10; own.y = z.y; ents.push(own);
    confine(ROSTER[2], own);
  });
  await win();
  ok((await store()).length === 0 && await p.evaluate(() => SAVE.roster[1].item.type === 'sword'), 'a defeated spirit gives no roll, and confining into your own dropped weapon makes no duplicate');

  // 7. A loss changes nothing.
  await battle("SAVE.roster[0].item = { id: SAVE.nid++, type: 'spear', title: '', tier: 0 }");
  await p.evaluate(async () => { Math.random = () => 0; confine(ROSTER[1], objs().find(o => OT[o.type].equip)); removeUnit(host()); checkEnd(); document.querySelector('#again').click() });
  ok((await store()).length === 0 && await p.evaluate(() => SAVE.roster[0].item.type === 'spear'), 'after a loss nothing is gained or lost');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
