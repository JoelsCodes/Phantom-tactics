// Headless hub test: walking, character creation, Titlesmith, house (equip/release), ferry -> battle -> back, saving.
// Run: NODE_PATH=$(npm root -g) node tests/hub.js
const { chromium } = require('playwright');
const path = require('path');
const out = process.env.OUT || path.join(__dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
const base = 'file://' + path.join(__dirname, '..', 'index.html');
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(base + '?fast&reset');
  await p.evaluate(() => localStorage.clear());
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => MODE === 'hub'), 'game starts on the island');
  await p.screenshot({ path: out + '/hub-1.png' });

  // Joystick: drag up-right from the bottom-left of the canvas.
  const box = await p.locator('#cv').boundingBox();
  const h0 = await p.evaluate(() => ({ x: H.hero.x, y: H.hero.y }));
  await p.mouse.move(box.x + 78, box.y + box.height - 88);
  await p.mouse.down();
  await p.mouse.move(box.x + 118, box.y + box.height - 128, { steps: 4 });
  await p.waitForTimeout(500);
  await p.mouse.up();
  const h1 = await p.evaluate(() => ({ x: H.hero.x, y: H.hero.y }));
  ok(h1.x > h0.x + 10 && h1.y < h0.y - 10, `joystick walks the Warden (${h0.x|0},${h0.y|0} -> ${h1.x|0},${h1.y|0})`);

  // Tap a building: the Warden walks to its door and the menu opens.
  await p.evaluate(() => toHub());
  await p.waitForTimeout(200);
  const t = await p.evaluate(() => { const b = BLD.find(b => b.id === 'soul'); return w2s(b.x, b.y - 10) });
  await p.mouse.click(box.x + t[0], box.y + t[1]);
  await p.waitForFunction(() => document.querySelector('#sheet').classList.contains('on'), null, { timeout: 8000 });
  ok(await p.evaluate(() => HS.b && HS.b.id === 'soul'), 'tapping the Soulwright walks there and opens creation');

  // Create a Lv 2 Rogue named Testy.
  await p.click('[data-h=cls][data-v=Rogue]');
  await p.click('[data-h="lv+"]');
  await p.fill('#cname', 'Testy');
  await p.screenshot({ path: out + '/hub-2-create.png' });
  const g0 = await p.evaluate(() => SAVE.gold);
  await p.click('[data-h=create]');
  const cr = await p.evaluate(() => ({ n: SAVE.roster.length, last: SAVE.roster[SAVE.roster.length - 1], gold: SAVE.gold }));
  ok(cr.n === 6 && cr.last.name === 'Testy' && cr.last.cls === 'Rogue' && cr.last.lv === 2, 'created Testy, Lv 2 Rogue');
  ok(g0 - cr.gold === 140 * 3, 'creation cost charged (' + (g0 - cr.gold) + ')');

  // Titlesmith: move Sturdy from Brannoc onto the sword in storage.
  await p.evaluate(() => openBuilding(BLD.find(b => b.id === 'title')));
  const L = await p.evaluate(() => titleHolders().map(x => x.o.title || ''));
  const srcI = await p.evaluate(() => titleHolders().findIndex(x => x.o.name === 'Brannoc'));
  await p.click(`[data-h=tsrc][data-i="${srcI}"]`);
  const dstI = await p.evaluate(() => titleHolders().findIndex(x => x.o.type === 'sword'));
  await p.click(`[data-h=tdst][data-i="${dstI}"]`);
  await p.screenshot({ path: out + '/hub-3-title.png' });
  await p.click('[data-h=tmove]');
  const tt = await p.evaluate(() => ({ b: SAVE.roster[0].title, s: SAVE.items[0].title, gold: SAVE.gold }));
  ok(tt.b === '' && tt.s === 'Sturdy' && tt.gold === cr.gold - 200, 'Sturdy moved from Brannoc to the sword for 200');

  // House: equip the sword on Ysolde, check stats include it, then release Testy.
  await p.evaluate(() => openBuilding(BLD.find(b => b.id === 'house')));
  await p.click('[data-h=char][data-i="2"]');
  await p.click('[data-h=equip][data-i="0"]');
  const eq = await p.evaluate(() => ({ item: SAVE.roster[1].item, store: SAVE.items.length, def: stat(charUnit(SAVE.roster[1], { team: 'p' }), 'def'), base: charUnit(SAVE.roster[1], { team: 'p' }).b.def }));
  ok(eq.item && eq.item.type === 'sword' && eq.store === 0 && eq.def > eq.base, 'equipped Sturdy sword raises Ysolde\'s DEF');
  await p.screenshot({ path: out + '/hub-4-house.png' });
  await p.click('[data-h=hback]');
  await p.click('[data-h=char][data-i="6"]');
  await p.click('[data-h=release]');
  await p.click('[data-h=release2]');
  ok(await p.evaluate(() => SAVE.roster.length === 5 && !SAVE.roster.some(r => r.name === 'Testy')), 'released Testy');

  // Ferry -> battle: Ysolde brings her sword; win and come home with loot.
  await p.evaluate(() => openBuilding(BLD.find(b => b.id === 'ferry')));
  await p.click('[data-h=sail]');
  const bt = await p.evaluate(() => {
    const y = confine(ROSTER[1], objs().find(o => o.type === 'rock'));
    return { mode: MODE, held: y.held && y.held.type, title: y.held && y.held.title };
  });
  ok(bt.mode === 'battle' && bt.held === 'sword' && bt.title === 'Sturdy', 'roster item goes into battle with its title');
  const win = await p.evaluate(() => {
    for (const e of units('e')) removeUnit(e);
    checkEnd();
    return G.over;
  });
  ok(win === 'win', 'battle won');
  await p.screenshot({ path: out + '/hub-5-win.png' });
  const g1 = await p.evaluate(() => SAVE.gold);
  await p.click('#again');
  const back = await p.evaluate(() => ({ mode: MODE, gold: SAVE.gold, day: SAVE.day, items: SAVE.items.map(i => i.type).sort(), ys: SAVE.roster[1].item && SAVE.roster[1].item.type }));
  ok(back.mode === 'hub' && back.gold === g1 + 600 && back.day === 2, 'back on the island with 600 Bordin, day 2');
  ok(back.ys === 'sword' && back.items.join() === 'bow,staff,sword,sword', 'Ysolde keeps her sword; field weapons go to storage (' + back.items + ')');

  // Save persists across a reload.
  await p.goto(base + '?fast');
  await p.waitForTimeout(300);
  const re = await p.evaluate(() => ({ day: SAVE.day, items: SAVE.items.length, b: SAVE.roster[0].title }));
  ok(re.day === 2 && re.items === 4 && re.b === '', 'save survives a reload');
  await p.screenshot({ path: out + '/hub-6.png' });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
