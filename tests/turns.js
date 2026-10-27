// Headless test for SPD-ordered individual turns, the turn-order bar, spirit turn limits, and Lift (equip / steal / lift).
// Run: NODE_PATH=$(npm root -g) node tests/turns.js
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
  await p.evaluate(() => startBattle(STAGES[0]));
  await p.waitForTimeout(300);

  // Opening state: the Warden acts first, and the bar shows 8 upcoming turns.
  const s0 = await p.evaluate(() => ({ act: G.act.name, host: G.act.host, phase: G.phase, q: peekQueue(8).map(u => u.name[0]).join(''), chips: document.querySelectorAll('#tq .tqc').length, curSize: document.querySelector('#tq .tqc.cur') != null }));
  ok(s0.host && s0.phase === 'player' && s0.chips === 8 && s0.curSize, 'Warden goes first; turn-order bar shows 8 turns (' + s0.q + ')');
  await p.screenshot({ path: out + '/turns-1.png' });

  // Faster units take more turns over the same stretch of time.
  const f = await p.evaluate(() => {
    const q = peekQueue(120), cnt = {};
    for (const u of q) cnt[u.cls] = (cnt[u.cls] || 0) + 1;
    return { bat: cnt.Thornbat, grub: cnt.GrubKnight, spdBat: stat(units('e').find(e => e.cls === 'Thornbat'), 'spd'), spdGrub: stat(units('e').find(e => e.cls === 'GrubKnight'), 'spd') };
  });
  ok(f.spdBat > f.spdGrub && f.bat / 2 > f.grub, `fast Thornbats (SPD ${f.spdBat}) act more often than the Grub Knight (SPD ${f.spdGrub}): ${f.bat} turns for 2 bats vs ${f.grub}`);

  // Confining puts the new spirit right after the Warden's turn; she can't be commanded out of turn.
  const c = await p.evaluate(() => {
    const y = confine(ROSTER[1], objs().find(o => o.type === 'flower' && o.title === 'Sage'));
    return { next: peekQueue(2)[1].name, turns: y.turns };
  });
  ok(c.next === 'Ysolde' && c.turns === 3, 'a newly confined spirit acts next, with its own 3-turn limit');
  await p.evaluate(() => { G.sel = units('p').find(u => u.name === 'Ysolde'); ui() });
  ok(await p.evaluate(() => !document.querySelector('[data-a=move]') && /acts later/.test(document.querySelector('#panel').textContent) && !!document.querySelector('[data-a=selHost]')), 'inspecting a unit out of turn shows no commands and a way back');
  await p.click('[data-a=selHost]');
  ok(await p.evaluate(() => G.sel === G.act && !!document.querySelector('[data-a=move]')), 'Back button returns to the active unit');

  // End the Warden's turn: Ysolde acts, and she disappears after exactly 3 of her own turns.
  await p.click('[data-a=end]');
  const t = await p.evaluate(async () => {
    const y = units('p').find(u => u.name === 'Ysolde'); let mine = 0, guard = 0;
    while (alive(y) && !G.over && guard++ < 200) {
      if (G.act === y) mine++;
      await endTurn();
    }
    return { mine, gone: !alive(y), over: G.over, again: !!units('p').find(u => u.name === 'Ysolde') };
  });
  ok(t.over || (t.mine === 3 && t.gone), 'Ysolde gets exactly 3 of her own turns, then leaves (' + t.mine + ')');
  ok(t.over || await p.evaluate(() => { try { return G.used[ROSTER[1].id] === 1 && G.confLeft === STAGE.conf - 1 } catch (e) { return false } }), 'she stays used: no re-confining this battle');

  // Enemy turns play out by themselves and hand control back to a player unit.
  const e = await p.evaluate(async () => {
    newBattle(); await new Promise(r => setTimeout(r, 100));
    host().b.hp = 9999; host().hp = 9999; // Marona has no spirits here, so keep her alive
    const before = units('e').map(u => [u.x | 0, u.y | 0].join());
    for (let i = 0; i < 3 && !G.over; i++) await endTurn();
    const after = units('e').map(u => [u.x | 0, u.y | 0].join());
    return { moved: before.filter((v, i) => v !== after[i]).length, phase: G.phase, team: G.act.team, busy, over: G.over };
  });
  ok(!e.over && e.moved >= 3 && e.phase === 'player' && e.team === 'p' && !e.busy, `enemies take their own turns (${e.moved} moved) and control returns to the player`);

  // Lift: weapon -> equip, armed foe -> steal (any class), unarmed foe or object -> lift.
  await p.evaluate(async () => {
    newBattle(); await new Promise(r => setTimeout(r, 100));
    Math.random = () => 0;
    window.T = { y: confine(ROSTER[1], objs().find(o => o.type === 'rock')), hx: units('e').find(e => e.cls === 'Hexcap') };
    G.act = T.y; G.sel = T.y; G.phase = 'player'; busy = false;
    T.y.x = T.hx.x - 25; T.y.y = T.hx.y; ui();
  });
  await p.click('[data-a=lift]');
  await p.evaluate(() => tap(...w2s(T.hx.x, T.hx.y - 10)));
  await p.waitForTimeout(500);
  const st = await p.evaluate(() => ({ held: T.y.held && T.y.held.type, foeHeld: !!T.hx.held, lifted: !!T.y.lift, acted: T.y.acted, cls: T.y.cls }));
  ok(st.cls === 'Archer' && st.held === 'staff' && !st.foeHeld && !st.lifted && st.acted, 'an Archer lifts an armed Hexcap: steals its staff instead of picking it up');
  const lf = await p.evaluate(async () => {
    const bat = units('e').find(e => e.cls === 'Thornbat'); T.y.x = bat.x - 20; T.y.y = bat.y; T.y.acted = false; G.mode = 'idle'; ui();
    document.querySelector('[data-a=lift]').click();
    tap(...w2s(bat.x, bat.y - 10));
    return { lifted: T.y.lift === bat, throwBtn: !!document.querySelector('[data-a=throw]') };
  });
  ok(lf.lifted && lf.throwBtn, 'an unarmed foe is lifted as before, and Throw becomes available');
  ok(await p.evaluate(() => CL.Rogue.sk.includes('jab') && !CL.Rogue.sk.includes('steal') && !SK.steal), 'there is no separate Steal skill any more');
  await p.screenshot({ path: out + '/turns-2.png' });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
