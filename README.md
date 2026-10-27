# Spirit Tactics

An original free-movement tactics RPG for the browser (vanilla JS, single `index.html`, no build step).
Inspired by the mechanics of classic free-roam tactics games. All names, characters, story and art are original.

## Stage 1: battle core (done)
- Free movement, no grid: move anywhere inside your radius and split movement before/after acting.
- Confine: the Warden fights alone and confines spirits into objects on the field. A spirit takes on the object's stat bonuses and its title. Every stage allows 8 confines, and each spirit can be used once per battle.
- Turn limits: each object gives a set number of turns (rock 6, tree 5, barrel 4, flower 3). When time runs out the spirit leaves, the object is used up, and held items drop.
- Titles on units, objects and items change stats.
- Lift & throw objects, allies and foes. Landing outside the island (or being knocked past the edge) is out of bounds: a unit takes 30% of its max HP and is put back on the island edge, so it only dies if that hit is enough. Objects that go out of bounds are lost.
- Lift a foe who is holding a weapon to try to steal it (any class; Rogues and Thief-titled units are better at it). It keeps its title and gives its skill to the thief.
- Lift a weapon on the field to equip it. Items held at the end of a battle are kept (shown on the results screen).
- Enemy AI, a boss, win/lose screens.

## Stage 2: island hub (done)
- Walkable home island (joystick bottom-left, or tap the ground / a building). Your spirits wander around.
- Shortcut dock under the island opens any building with one tap, no walking needed.
- Soulwright: create characters by class, name and level (cost grows with level; max = your highest level).
- Titlesmith: move a title from any character or item onto another (200 Bordin; the target's old title is replaced).
- Your house: roster, stats, equip/unequip items from storage, release characters.
- Ferry: set sail to the battle. Your roster and their items come along. After a win you get Bordin, and every weapon held or left on the field goes home. A loss changes nothing.
- Autosaves to localStorage (`?reset` starts a fresh save).
- Trader and Archive are placeholders for stage 4.

## Stage 3: sea chart and progression (done)
- Ferry opens a sea chart: 7 stages as islands linked by sailing routes, plus a list view grouped into 3 chapters.
- Each stage unlocks when the one before it is cleared. Recommended level rises from 3 to 15; reward = level x 150 Bordin.
- Stages 2-7 are generated from a fixed seed (same island every time): their own shape and ground colour, objects and titles on the west side, foes and a named boss on the east side.
- EXP: the unit that defeats a foe gets EXP (more for bosses and higher-level foes; knocking or throwing out of bounds counts). On a win, the Warden and every confined spirit also get a bonus. EXP is kept even when you lose.
- Level-ups show on the results screen; the house shows an EXP bar.

## Stage 4a: shop and battle items (done)
- Trader: Buy and Sell tabs. Tap an item to see how every character would change if they held it, best match first, with an Equip button on each row (buys it and hands it over; their old item goes to storage).
- New weapons: Woodcutter Axe (ATK +20, SPD -4, Chop: heavy hit with knockback) and Reed Spear (ATK +12, Pierce: hits every unit in a line).
- Healing Herb (40 HP) and Spirit Tonic (10 SP), bought in any quantity. In battle, the Item button uses one on yourself or an ally next to you, and takes your action.
- Selling: storage weapons sell for half price (titled ones for 50% more); herbs and tonics for half.
- Menus now cover the whole screen.

## Stage 4b: Archive fusion (done)
- Characters: fuse two spirits of the same class. The first one stays and gains 2 levels (3 if the consumed one is the same level or higher), keeps its title (or inherits the other's if it has none). The consumed spirit leaves and its item goes to storage. Cost 60 Bordin x the kept spirit's level. Max level 50. The Warden cannot be fused.
- Items: fuse two copies of the same item in storage into one with +1 tier (max +5). Each tier adds 2 to every bonus the item gives, and shrinks penalties by 1 (the axe's SPD -4 becomes -2 at +2). Keeps the first item's title, or inherits. Cost 150 Bordin x the result tier.
- Tiers carry into battle, through stealing and equipping, and back home as loot. They raise sell prices (+60 per tier).
- Preview of the result before you commit; picking one side dims anything that can't be fused with it.

## Fidelity pass 1: turn order and Lift (done)
Checked against public descriptions of the original game (search summaries only, not the game itself):
- Turns are now individual and ordered by SPD, not "your phase / enemy phase". A bar at the top of the field shows the next 8 turns. Only the active unit can be commanded; tap others to inspect them. The Turn counter counts the Warden's turns.
- A spirit's turn limit counts its own turns. After its last turn it leaves, and it cannot be confined again that battle. A newly confined spirit acts right after the Warden's turn.
- Lift does three things: equips a weapon on the ground, steals from an armed foe, or lifts anything else (which can then be thrown). The separate Equip button and the Rogue's Steal skill are gone; Rogues have Jab instead.
- Set by the owner: out of bounds hurts but does not kill; 8 confines per map; weapons your team had equipped (including ones stolen from foes) that go out of bounds come back to storage after a win. The 30% damage is a guess.
- Still to check against the original: boss immunity to out-of-bounds, weight rules, EXP and level-up formulas, shop prices, fusion and title rules.

## Planned stages
5. More classes, skills, stages, random dungeons, post-game.

## Tests
`NODE_PATH=$(npm root -g) node tests/battle.js` and `tests/hub.js`, `tests/progress.js`, `tests/shop.js`, `tests/archive.js`, `tests/turns.js` and `tests/rules.js` (headless Chromium at 390x800, screenshots in `tests/shots/`).
