// Headless shop test: buying (to storage, with quantity, buy & equip), selling, battle items, axe/spear skills.
// Run: NODE_PATH=$(npm root -g) node tests/shop.js
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
  const S = () => p.evaluate(() => ({ gold: SAVE.gold, items: SAVE.items.map(i => i.type), bag: { ...SAVE.bag }, r: SAVE.roster.map(r => r.item && r.item.type) }));

  await p.click('#dock [data-v=trade]');
  ok(await p.evaluate(() => document.querySelectorAll('#sheet [data-h=ssel]').length === 7), 'Trader lists 7 items');
  const s0 = await S();

  // Herbs with quantity.
  await p.click('[data-h=ssel][data-v=herb]');
  await p.click('[data-h="q+"]'); await p.click('[data-h="q+"]');
  await p.click('[data-h=buy]');
  const s1 = await S();
  ok(s1.bag.herb === s0.bag.herb + 3 && s1.gold === s0.gold - 120, 'bought 3 herbs for 120');

  // Axe: who-gets-stronger list, best match first, buy to storage.
  await p.click('[data-h=ssel][data-v=axe]');
  const who = await p.evaluate(() => [...document.querySelectorAll('#sheet .who b')].map(b => b.textContent));
  ok(who.length === 6, 'who-gets-stronger lists the Warden and all 5 spirits');
  ok(who[0] === 'Brannoc' && who.slice(-2).includes('Mirelle'), 'fighters first, casters last (' + who.join(', ') + ')');
  await p.screenshot({ path: out + '/shop-1.png' });
  await p.click('[data-h=buy]');
  const s2 = await S();
  ok(s2.items.includes('axe') && s2.gold === s1.gold - 320, 'bought an axe to storage');

  // Buy & equip a spear on Quill.
  await p.click('[data-h=ssel][data-v=spear]');
  const qi = await p.evaluate(() => [SAVE.host, ...SAVE.roster].findIndex(c => c.name === 'Quill'));
  await p.click(`[data-h=buyeq][data-i="${qi}"]`);
  const s3 = await S();
  ok(s3.r[4] === 'spear' && s3.gold === s2.gold - 280, 'buy & equip put the spear on Quill');

  // Sell the starting sword.
  await p.click('[data-h=stab][data-v=sell]');
  await p.screenshot({ path: out + '/shop-2-sell.png' });
  const si = await p.evaluate(() => SAVE.items.findIndex(i => i.type === 'sword'));
  await p.click(`[data-h=sell][data-i="${si}"]`);
  const s4 = await S();
  ok(!s4.items.includes('sword') && s4.gold === s3.gold + 120, 'sold the sword for 120');
  await p.click('[data-h=sellc][data-v=tonic]');
  ok((await S()).gold === s4.gold + 45, 'sold a tonic for 45');

  // Battle: Item button, herb heals an ally, spear pierces two foes in a line, axe chops.
  await p.click('[data-x=close]');
  await p.evaluate(() => startBattle(STAGES[0]));
  await p.waitForTimeout(200);
  const it = await p.evaluate(async () => {
    const h = host(); h.hp = 10; G.sel = h; ui();
    const btn = document.querySelector('[data-a=item]'); if (!btn) return 'no Item button';
    btn.click();
    const card = document.querySelector('#sheet [data-u=herb]'); if (!card) return 'no herb card';
    card.click();
    tap(...w2s(h.x, h.y - 10));
    await new Promise(r => setTimeout(r, 200));
    return { hp: h.hp, herbs: SAVE.bag.herb, acted: h.acted };
  });
  ok(it.hp === 50 && it.herbs === s1.bag.herb - 1 && it.acted, 'herb heals 40 and uses the action (' + JSON.stringify(it) + ')');
  // Attacks can miss at random; pin the roll so these checks are deterministic.
  await p.evaluate(() => { Math.random = () => 0.5 });
  const pr = await p.evaluate(async () => {
    const q = confine(ROSTER[4], objs().find(o => o.type === 'rock'));
    const [a, c] = units('e').slice(0, 2);
    q.x = 200; q.y = 300; a.x = 225; a.y = 300; c.x = 250; c.y = 300; q.sp = 99;
    const h0 = [a.hp, c.hp];
    await useSkill(q, 'pierce', a.x, a.y, a);
    return { a: a.hp < h0[0] || !alive(a), c: c.hp < h0[1] || !alive(c), skills: skills(q) };
  });
  ok(pr.skills.includes('pierce') && pr.a && pr.c, 'Reed Spear grants Pierce, which hits both foes in a line');
  const ax = await p.evaluate(async () => {
    const br = confine(ROSTER[0], objs().find(o => o.type === 'tree'));
    br.held = mkObj('axe', 0, 0); br.sp = 99;
    const e = units('e')[0]; br.x = e.x - 25; br.y = e.y;
    const h0 = e.hp; br.acted = false;
    await useSkill(br, 'chop', e.x, e.y, e);
    return { hit: !alive(e) || e.hp < h0, spd: stat(br, 'spd') < br.b.spd * 1.0 };
  });
  ok(ax.hit && ax.spd, 'Woodcutter Axe: Chop hits, and the axe lowers SPD');
  await p.waitForTimeout(200);
  await p.screenshot({ path: out + '/shop-3-battle.png' });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
