// Animal pens. The one part of the works that is not a belt.
//
// A pen holds one animal that grows through six drawn stages and then keeps
// giving. It is deliberately slower than a machine and needs no line, so it
// suits the corners of the floor a conveyor could never reach — and unlike a
// producer it goes on working while the tab is shut without any routing to walk.

export const PEN_STAGES = 6;

export const PENS = [
  {
    id: 'hog_pen', label: 'Hogfish Pen', animal: 'hogfish',
    out: 'ham', grow: 26, yield: 34, cost: 620,
    blurb: 'A round little hogfish. Grown, it gives ham — the richest thing in the pantry.',
  },
  {
    id: 'cow_pen', label: 'Cowwhale Pen', animal: 'cowwhale',
    out: 'milk', grow: 22, yield: 20, cost: 480,
    blurb: 'Milk on tap, without a churn or a belt in sight.',
  },
  {
    id: 'roe_pen', label: 'Roefish Pen', animal: 'roefish',
    out: 'roe', grow: 30, yield: 40, cost: 780,
    blurb: 'Patient work: a full-grown roefish is worth more than anything a mill makes.',
  },
];

export const PEN_BY_ID = Object.fromEntries(PENS.map((p) => [p.id, p]));

/** Which of the six drawings to show, from how grown the animal is (0..1). */
export const penFrame = (grown) =>
  Math.max(1, Math.min(PEN_STAGES, Math.floor(grown * PEN_STAGES) + 1));

/** Seconds to raise an animal, or to refill after a harvest. */
export const penGrowTime = (pen, speed = 1) => pen.grow / speed;
export const penYieldTime = (pen, speed = 1) => pen.yield / speed;
