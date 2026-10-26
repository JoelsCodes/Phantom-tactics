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

## Planned stages
2. Island hub: walk around, roster, spirit creation by class, NPC buildings.
3. Stage select map and progression, EXP/levels, saving.
4. Shop, item inventory, title transfer between items/characters, fusion.
5. More classes, skills, stages, random dungeons, post-game.

## Tests
`NODE_PATH=$(npm root -g) node tests/battle.js` (headless Chromium at 390x800, screenshots in `tests/shots/`).
