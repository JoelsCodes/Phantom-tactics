# Spirit Tactics

An original free-movement tactics RPG for the browser (vanilla JS, single `index.html`, no build step).
Inspired by the mechanics of classic free-roam tactics games. All names, characters, story and art are original.

## Stage 1: battle core (done)
- Free movement, no grid: move anywhere inside your radius and split movement before/after acting.
- Confine: the Warden fights alone and confines spirits into objects on the field. A spirit takes on the object's stat bonuses and its title. Each battle has a limited number of confines, and each spirit can be used once.
- Turn limits: each object gives a set number of turns (rock 6, tree 5, barrel 4, flower 3). When time runs out the spirit leaves, the object is used up, and held items drop.
- Titles on units, objects and items change stats.
- Lift & throw objects, allies and foes. Landing outside the island = out of bounds. Knockback skills can push foes off.
- Steal a foe's held item; it keeps its title and gives its skill to the thief.
- Equip weapons found on the field. Items held at the end of a battle are kept (shown on the results screen).
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

## Planned stages
4b. Archive: fusion of characters and items.
5. More classes, skills, stages, random dungeons, post-game.

## Tests
`NODE_PATH=$(npm root -g) node tests/battle.js` and `tests/hub.js` (headless Chromium at 390x800, screenshots in `tests/shots/`).
