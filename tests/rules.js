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
  // Equipped items that go out of bounds come back to storage after a win; ground weapons nobody on your team held do not.
  const r = await p.evaluate(async () => {
    newBattle(); await new Promise(r => setTimeout(r, 100));
    SAVE.roster[0].item = { id: SAVE.nid++, type: 'axe', title: 'Fierce', tier: 2 }; SAVE.items = [];
    newBattle(); await new Promise(r => setTimeout(r, 100));
    const y = confine(ROSTER[0], objs().find(o => !OT[o.type].equip)), axe = y.held;
    y.held = null; axe.x = 40; axe.y = 100; ents.push(axe);
    await fallOut(axe, y);                                   // equipped by your team: returns
    const wild = objs().find(o => OT[o.type].equip && !o.mine); await fallOut(wild);   // never yours: gone
    const stolen = units('e').find(e => e.held), thief = y;
    const sw = stolen.held; stolen.held = null; thief.held = sw; sw.mine = true; sw.holder = thief.rid; thief.held = null; sw.x = 40; sw.y = 100; ents.push(sw);
    await fallOut(sw, y);                                    // stolen then lost: returns
    return { lost: G.lost.map(l => l.type + ':' + l.title + ':' + l.tier), wildType: wild.type, swType: sw.type };
  });
  ok(r.lost.includes('axe:Fierce:2') && r.lost.length === 2 && !r.lost.some(l => l.startsWith(r.wildType + ':') && l !== r.lost[1]), 'only items your team equipped are marked for return (' + r.lost.join(', ') + ')');
  await p.evaluate(() => { for (const e of units('e')) removeUnit(e); checkEnd() });
  ok(await p.evaluate(() => /Returned from out of bounds/.test(document.querySelector('#ovIn').textContent)), 'results screen lists what was returned');
  await p.click('#again');
  const back = await p.evaluate(() => ({ held: SAVE.roster[0].item && SAVE.roster[0].item.type + ':' + SAVE.roster[0].item.title + ':' + SAVE.roster[0].item.tier, store: SAVE.items.map(i => i.type) }));
  ok(back.held === 'axe:Fierce:2', 'the lost axe is back on the spirit who held it, with its title and tier (' + back.held + ')');
  ok(back.store.includes(r.swType) && !back.store.includes('axe'), 'a second lost item for the same spirit goes to storage (' + back.store.join(', ') + ')');
  // A spirit that lost its weapon and then picked up another: the original goes back on, the pickup goes to storage.
  const sw = await p.evaluate(async () => {
    SAVE.roster[1].item = { id: SAVE.nid++, type: 'spear', title: 'Swift', tier: 1 }; SAVE.items = [];
    newBattle(); await new Promise(r => setTimeout(r, 100));
    const y = confine(ROSTER[1], objs().find(o => !OT[o.type].equip)), sp = y.held; y.held = null; sp.x = 40; sp.y = 100; ents.push(sp);
    await fallOut(sp, y);
    const ground = objs().find(o => OT[o.type].equip); equipFrom(y, ground);
    for (const e of units('e')) removeUnit(e); checkEnd(); document.querySelector('#again').click();
    return { held: SAVE.roster[1].item && SAVE.roster[1].item.type + ':' + SAVE.roster[1].item.title + ':' + SAVE.roster[1].item.tier, store: SAVE.items.map(i => i.type), picked: ground.type };
  });
  ok(sw.held === 'spear:Swift:1' && sw.store.includes(sw.picked), 'lost weapon goes back on; the weapon picked up afterwards goes to storage (' + sw.held + ' / ' + sw.store.join(', ') + ')');
  // On a loss nothing is taken from the save at all.
  const loss = await p.evaluate(async () => {
    SAVE.roster[0].item = { id: SAVE.nid++, type: 'spear', title: '', tier: 0 };
    newBattle(); await new Promise(r => setTimeout(r, 100));
    const y = confine(ROSTER[0], objs().find(o => !OT[o.type].equip)), sp = y.held; y.held = null; sp.x = 40; sp.y = 100; ents.push(sp);
    await fallOut(sp, y); removeUnit(host()); checkEnd(); document.querySelector('#again').click();
    return SAVE.roster[0].item && SAVE.roster[0].item.type;
  });
  ok(loss === 'spear', 'after a loss the spirit still owns its spear');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
