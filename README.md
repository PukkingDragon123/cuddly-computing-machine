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
| **Open up** | Guests wander in and wait by the door. Tap one to seat them at a free chair, or tap an empty seat to pull in whoever has been waiting longest. |
| **Orders** | Tap the `!` bubble over a seated guest to send the ticket to the chef. |
| **Service** | Drag the finished dish off the kitchen pass onto the guest who ordered it. Tap-then-tap works too. |
| **Payment** | Guests pay on how briskly they were served. Let a patience meter empty and they walk out, costing reputation. |

Fancier furniture finishes (Driftwood → Coral → Whalebone) and decor raise the
room's **ambience**, which pulls guests in faster, stretches their patience and
grows their tips. Hiring crew automates the fiddly parts: the Oyster Host seats
guests, the Cuttlefish Server runs plates, cooks add parallel burners, the
Mechanic speeds up the works.

Pinch or scroll to zoom, drag to pan, `Tab` to switch rooms, `R` to rotate what
you're placing, `Esc` to cancel.

## Layout

```
index.html            markup for the canvas plus the DOM HUD
styles.css            the sticker UI: chunky brown outlines, cream panels
assets/               generated sprites + atlas.json  (see tools/)
tools/slice_assets.py regenerates assets/ from the source art pack
src/
  main.js             boot, asset loading, fixed-step loop
  game.js             zones, camera, input routing, day cycle
  state.js            save file and every derived stat read off it
  core/               loader, tweens/springs, pointer, blip synth, helpers
  gfx/                canvas drawing kit and the particle system
  world/              iso math, procedural rooms, guests, kitchen, factory
  ui/                 HUD and the bottom-sheet panels
  data/               ingredients, recipes, buildables, staff
```

The world is a single `<canvas>`; the HUD and panels are real DOM so CSS can do
the rounded-sticker styling and native scrolling.

### Notes on the art

`Bubbleworks_Harbor_Character_Pack_01/` is the source pack: flat JPEG contact
sheets on a magenta chroma key or the cream paper backdrop, plus 3-frame
character strips (idle / walk / eat).

`tools/slice_assets.py` lifts each backdrop, buckets ink blobs into grid cells
so hand-laid items never clip their neighbours, trims every sprite, and writes
`assets/atlas.json`. Re-run it after changing the pack:

```sh
pip install pillow numpy scipy
python3 tools/slice_assets.py
```

The two isometric room plates are hand-drawn, so their floors don't sit on a
consistent lattice. Rooms are therefore **generated** — checkerboard floor,
scalloped border, sheared walls with cornice and baseboard, all in the plates'
own palette — while the painted doors, windows and portholes are cut out of the
plates and stuck back onto the generated walls. That keeps build tiles perfectly
aligned at any room size without losing the hand-painted charm. The whole room
is rasterised once into an offscreen canvas and blitted per frame.
