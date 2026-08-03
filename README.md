# Bubbleworks Harbor

A cosy 2D isometric restaurant-tycoon / factory-builder, built around the
Bubbleworks Harbor sprite pack. Grow and refine ingredients on conveyor lines,
plate up a menu, then open the doors and wait tables by hand — seating guests,
ringing in orders, and running plates out to tables while the tip clock ticks.

Everything is bought with one currency: **sand dollars**.

![restaurant](docs/shot-restaurant.png)
![factory](docs/shot-factory.png)

## Running it

The game is plain ES modules with no build step and no dependencies, but it does
`fetch` its atlas, so it needs to be served over HTTP rather than opened from
`file://`:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static server works (`npx http-server`, `caddy file-server`, …). Progress
saves to `localStorage` and the works keep producing while the tab is closed,
up to four hours of catch-up.

## Playing

| | |
|---|---|
| **Factory** | Place a machine, drag a conveyor away from it, and end the line at a Pantry Intake. Refiners sit mid-line and turn cheap goods into valuable ones. |
| **Menu Book** | Set how many of each dish to plate up. Ingredients leave the pantry immediately, so only plate what you can sell. Dishes level up with sand dollars plus more of their signature ingredient. |
| **Flyers** | Nobody comes to a place they have not heard of. Of a morning, tap the flyer to print one — ten taps to begin with, fewer as you research it, none once a Promo Stand does it for you. Print as many as the satchel holds; they come down overnight. |
| **Open up** | Guests wander in and wait by the door. Tap one to seat them at a free chair, or tap an empty seat to pull in whoever has been waiting longest. |
| **Handing them out** | Once you are open the flyer button changes job: one tap spends one flyer and brings one guest through the door there and then, instead of waiting on the arrival clock. |
| **Orders** | Tap the `!` bubble over a seated guest to send the ticket to the chef. |
| **Service** | Drag the finished dish off the kitchen pass onto the guest who ordered it. Tap-then-tap works too. |
| **Payment** | Guests pay on how briskly they were served. Let a patience meter empty and they walk out, costing reputation. |
| **Washing up** | A guest who has eaten leaves a plate behind, and that chair is out of service for five seconds while it is scrubbed. The Deep Sink halves it and a Dishwasher all but removes it. |

Fancier furniture finishes (Seaside Pine → Cosy Cottage → Antique) and decor raise the
room's **ambience**, which pulls guests in faster, stretches their patience and
grows their tips. Hiring crew automates the fiddly parts: the Oyster Host seats
guests, the Cuttlefish Server runs plates, cooks add parallel burners, the
Mechanic speeds up the works.

## The long game

| | |
|---|---|
| **Guest Diary** | Every species has a flavour they love and one they cannot stand. Serving the right one is triple hearts and a better tip, and it is the only way to learn what that flavour was. Fill the hearts and they start bringing presents. |
| **Rarity** | Six **VIPs** — a crowned whale shark, a top-hatted seahorse, a pearl manta — pay double. Four **Mythicals** out of deep time pay four times over. Each has its own animation, so a rare guest is a different animal and not a recoloured regular. |
| **Research** | A Harbour Computer on the factory floor banks points while you work. Spend them on flyers, machine speed, the washing-up and trade, from the Research Board under More. |
| **Pottery** | Serving levels the class. At level five the kiln opens: spend clay and money, stop the needle in the band, and one recipe gains a star and a permanent price rise — served from then on on real crockery, plainer or finer with the tier. |
| **Expanding** | Knocking through to the wharf and then the terrace grows the dining room from 9×9 to 13×13 — the only way to fit more tables. It is the Expand tab in the build menu, beside the furniture it makes room for. |
| **Pens** | A pen raises one animal through six drawn stages, then keeps giving. Tap it when the basket is full. Ham and roe come from nowhere else, and neither pen needs a belt. |

The ladder is deliberate: the flyer starts as ten taps a morning, and almost
everything you buy exists to take that job — and the seating, the serving and
the pantry runs — off your hands.

Pinch or scroll to zoom, drag to pan, `Tab` to switch rooms, `R` to turn what
you're placing through its four sides, `Esc` to cancel.

## Layout

```
index.html            markup for the canvas plus the DOM HUD
styles.css            the sticker UI: chunky brown outlines, cream panels
assets/               generated sprites + atlas.json  (see tools/)
tools/                slicers that regenerate assets/ from the source art packs
src/
  main.js             boot, asset loading, fixed-step loop
  game.js             zones, camera, input routing, day cycle
  state.js            save file and every derived stat read off it
  core/               loader, tweens/springs, pointer, blip synth, helpers
  gfx/                canvas drawing kit and the particle system
  world/              iso math, procedural rooms, guests, kitchen, factory
  ui/                 HUD and the bottom-sheet panels
  data/               ingredients, recipes, buildables, staff, guests, progress
```

The world is a single `<canvas>`; the HUD and panels are real DOM so CSS can do
the rounded-sticker styling and native scrolling.

The dock along the bottom floats above the scrim and the sheet on purpose. With
it buried, moving between panels meant close-then-open — so tapping Pantry while
the Diary is up now simply switches, and tapping the panel already showing
closes it.

It carries six keys, not eight, because six is what fits across a phone with a
caption under each glyph and no scrolling. Expanding the room went to a tab in
the build menu — it is a thing you place, and it was a shop that sold one kind
of thing — and the research board went to More with the rest of the long game.
Everything else there is a spring: presses squash, the live key rides up out of
the rail, the coin counter rolls rather than snaps, and Open! breathes until you
press it.

### Notes on the art

Three source packs, all sliced into `assets/` with `assets/atlas.json` as the
index. `art_pack_03` came from the companion **reimagined-sniffle** repo:

- `Bubbleworks_Harbor_Character_Pack_01/` — guests, staff, ingredients, food and
  factory machines. Flat JPEG contact sheets on a magenta key or the cream paper
  backdrop, plus 3-frame character strips (idle / walk / eat).
- `art_pack_02/livestock_pixel_sheet.png` — three animals across six growth
  stages each, plus the ham, milk and roe they give. Pixel art rather than
  vector, so it slices nearest-neighbour and keeps its own scale; the produce
  cells are aliased into the ingredient and food groups so one drawing serves as
  the pantry icon and the plated dish.
- `art_pack_02/` — the dining room: furniture in three finishes, wall joinery
  (doors, windows, counters) in two woods, and three more guests. Every piece of
  furniture ships two drawings: `_f` faces screen down-left, `_b` is the same
  piece turned to face up-right. Mirroring swaps the two ground axes — down-left
  becomes down-right, up-right becomes up-left — so those two plus a flip give
  all four isometric turns, every one a real drawing. Rotate cycles them, and a
  chair picks the one that faces its table.
- `…/additional_assets/07_dolphin_whale_manatee_walrus_character_sheet.jpeg` —
  four more regulars on a 3×4 magenta grid.
- `art_pack_03/vip/` — six VIP and four mythical guests, each a 1152×384 strip
  of idle / walk / eat already on transparency, so this stage only trims and
  rescales to the game's character height.
- `art_pack_03/plates_*_sheet.png` — forty serving dishes, roughly plain
  earthenware through to gilded china. A forged dish draws its plate from the
  band its tier earns, picked by a hash of the recipe id so every dish keeps its
  own crockery.
- `art_pack_03/machines_*_sheet` — thirty machines, including the computers the
  research and promotion buildings now use.
- `art_pack_03/ui_icons_sheet.png` — the interface icons. `skinIcons` swaps them
  over the built-in SVGs at boot, so the markup keeps its `.ico-*` classes as
  the fallback for anything the pack doesn't cover.

Every sheet across the three packs is sliced except the three superseded
furniture sheets and the two painted room plates, which the generated rooms
replace.

```sh
pip install pillow numpy scipy
python3 tools/slice_assets.py    # character pack
python3 tools/slice_pack02.py    # furniture, joinery, extra guests, livestock
python3 tools/slice_pack03.py    # the rare cast, plates, machines, UI icons
```

Both lift the backdrop, group ink blobs so hand-laid items never clip their
neighbours, trim every sprite, and merge into the atlas. The second also
despills: a lamp's clear glass shows the magenta backdrop straight through, so
those pixels are turned back into translucent glass rather than left as a pink
dome.

Rooms are **generated** — checkerboard floor, scalloped border, sheared walls
with cornice and baseboard — because the original painted room plates are
hand-drawn and their floors don't sit on a consistent lattice, so build tiles
could never line up with them. The doors and windows set into those walls are
real sprites from the fixture sheets, sheared onto the wall's own 2:1 basis.
They are drawn as flat elevations carrying a built-in perspective of roughly
0.58 down per across, where the wall recedes at exactly 0.5 — so the shear is
the *difference* between the two, not the wall's full slope, or the piece ends
up plunging at nearly twice the angle of the plaster behind it. The slicer
measures each drawing's own slope (Theil–Sen over its top edge, which shrugs
off a swinging casement) and writes it into the atlas. The joinery changes wood
along with whatever finish the dining room mostly uses. The whole room is rasterised once into an offscreen canvas and
blitted per frame.
