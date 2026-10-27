// Headless Archive test: character fusion, item fusion (tiers), and that tiers carry into battle and back.
// Run: NODE_PATH=$(npm root -g) node tests/archive.js
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

  // Extra characters: a Soldier with a sword, and an Archer with a title.
  await p.evaluate(() => {
    SAVE.gold = 5000;
    SAVE.roster.push({ id: SAVE.nid++, name: 'Garrow', cls: 'Soldier', lv: 3, title: '', item: { id: SAVE.nid++, type: 'axe', title: '' } });
    SAVE.roster.push({ id: SAVE.nid++, name: 'Pell', cls: 'Archer', lv: 4, title: 'Swift', item: null });
  });
  await p.evaluate(() => toHub());
  const id = n => p.evaluate(n => SAVE.roster.find(r => r.name === n).id, n);
  await p.click('#dock [data-v=arch]');
  ok(await p.evaluate(() => HS.b.id === 'arch' && HS.tab === 'char'), 'Archive opens on the Characters tab');

  // Brannoc (Lv4 Sturdy) keeps, Garrow (Lv3) is consumed: +2 levels, title kept, axe to storage.
  await p.click(`[data-h=apick][data-id="${await id('Brannoc')}"]`);
  ok(await p.evaluate(() => document.querySelectorAll('#sheet .card.off').length) === 5, 'other classes are dimmed once a character is chosen');
  await p.click(`[data-h=apick][data-id="${await id('Garrow')}"]`);
  await p.screenshot({ path: out + '/arch-1.png' });
  const g0 = await p.evaluate(() => SAVE.gold);
  await p.click('[data-h=afuse]');
  const f1 = await p.evaluate(() => ({ lv: SAVE.roster[0].lv, t: SAVE.roster[0].title, names: SAVE.roster.map(r => r.name), items: SAVE.items.map(i => i.type), gold: SAVE.gold, n: H.spirits.length }));
  ok(f1.lv === 6 && f1.t === 'Sturdy' && !f1.names.includes('Garrow'), 'Brannoc Lv 4 -> 6 keeping Sturdy; Garrow consumed');
  ok(f1.items.includes('axe') && f1.gold === g0 - 240, 'consumed spirit\'s axe goes to storage; cost 240');
  ok(f1.n === f1.names.length, 'island spirits match the roster');

  // Ysolde (no title, Lv3) keeps, Pell (Lv4 Swift) consumed: +3 levels and inherits Swift.
  await p.click(`[data-h=apick][data-id="${await id('Ysolde')}"]`);
  await p.click(`[data-h=apick][data-id="${await id('Pell')}"]`);
  await p.click('[data-h=afuse]');
  const f2 = await p.evaluate(() => { const y = SAVE.roster.find(r => r.name === 'Ysolde'); return { lv: y.lv, t: y.title } });
  ok(f2.lv === 6 && f2.t === 'Swift', 'equal-or-higher fodder gives +3 levels and passes on its title');

  // Items: two swords, one Sturdy +1.
  await p.evaluate(() => { SAVE.items.push({ id: SAVE.nid++, type: 'sword', title: 'Sturdy', tier: 1 }, { id: SAVE.nid++, type: 'sword', title: '' }) });
  await p.click('[data-h=atab][data-v=item]');
  const [sa, sb, bow] = await p.evaluate(() => [SAVE.items.find(i => i.type === 'sword' && i.tier), SAVE.items.find(i => i.type === 'sword' && !i.tier), SAVE.items.find(i => i.type === 'axe')].map(i => i.id));
  await p.click(`[data-h=apick][data-id="${sa}"]`);
  ok(await p.evaluate(() => document.querySelectorAll('#sheet .card.off').length) >= 1, 'other item types are dimmed once an item is chosen');
  await p.click(`[data-h=apick][data-id="${sb}"]`);
  await p.screenshot({ path: out + '/arch-2-items.png' });
  const g1 = await p.evaluate(() => SAVE.gold);
  await p.click('[data-h=afuse]');
  const f3 = await p.evaluate(() => { const s = SAVE.items.filter(i => i.type === 'sword'), f = s.find(i => i.tier); return { n: s.length, tier: f.tier, t: f.title, gold: SAVE.gold, atk: equipVal('sword', f.tier, 'atk'), spd: equipVal('axe', 2, 'spd') } });
  ok(f3.n === 2 && f3.tier === 2 && f3.t === 'Sturdy' && f3.gold === g1 - 300, 'two swords fuse into one Sturdy +2 for 300');
  ok(f3.atk === 18 && f3.spd === -2, 'tier 2 sword gives ATK +18; axe SPD penalty shrinks -4 -> -2');

  // Tier carries into battle and comes home again.
  await p.evaluate(() => { const b = SAVE.roster[0]; b.item = SAVE.items.splice(SAVE.items.findIndex(i => i.type === 'sword' && i.tier), 1)[0] });
  await p.click('[data-x=close]');
  await p.evaluate(() => startBattle(STAGES[0]));
  await p.waitForTimeout(200);
  const bt = await p.evaluate(() => { const u = confine(ROSTER[0], objs().find(o => o.type === 'rock')); const a = stat(u, 'atk'); const base = Math.round(u.b.atk * (1 + statParts(u, 'atk').m)); return { tier: u.held.tier, flat: a - base } });
  ok(bt.tier === 2 && bt.flat === 18, 'battle: held sword keeps tier 2 (+18 ATK)');
  await p.evaluate(() => { for (const e of units('e')) removeUnit(e); checkEnd() });
  await p.click('#again');
  ok(await p.evaluate(() => SAVE.roster[0].item && SAVE.roster[0].item.tier === 2), 'after the win the sword is still +2');

  // Limits: cap at +5 and money check.
  await p.evaluate(() => { SAVE.items.push({ id: SAVE.nid++, type: 'bow', title: '', tier: 5 }, { id: SAVE.nid++, type: 'bow', title: '', tier: 0 }) });
  await p.click('#dock [data-v=arch]');
  await p.click('[data-h=atab][data-v=item]');
  const [b5, b0] = await p.evaluate(() => SAVE.items.filter(i => i.type === 'bow').map(i => i.id));
  await p.click(`[data-h=apick][data-id="${b5}"]`);
  await p.click(`[data-h=apick][data-id="${b0}"]`);
  ok(await p.evaluate(() => document.querySelector('[data-h=afuse]').disabled), 'a +5 item cannot be fused further');
  ok(await p.evaluate(() => { const r = SAVE.roster.find(r => r.name === 'Quill'); return !!r }) && errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
