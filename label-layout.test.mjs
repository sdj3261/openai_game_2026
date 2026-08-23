import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { placeCanvasLabel, rectFullyInsideBounds, rectsOverlap } from "./label-layout.js";

const BOUNDS = { x: 64, y: 62, w: 1072, h: 582 };

function extractInitializer(source, name) {
  const marker = `const ${name} =`;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing ${marker}`);
  let start = markerIndex + marker.length;
  while (/\s/.test(source[start])) start += 1;
  const pairs = { "[": "]", "{": "}", "(": ")" };
  const open = source[start];
  const close = pairs[open];
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name} initializer`);
}

const source = await readFile(new URL("./game.js", import.meta.url), "utf8");
const THEMES = new Proxy({}, { get: (_target, id) => ({ id: String(id) }) });
const KEY_TYPES = new Proxy({}, { get: (_target, id) => ({ id: String(id), value: 0, palette: {} }) });
const levels = vm.runInNewContext(`(${extractInitializer(source, "levels")})`, { THEMES, KEY_TYPES });

function assertInside(rect, label) {
  assert.ok(rect.x >= BOUNDS.x - 1e-9, `${label} crosses the left edge`);
  assert.ok(rect.y >= BOUNDS.y - 1e-9, `${label} crosses the top edge`);
  assert.ok(rect.x + rect.w <= BOUNDS.x + BOUNDS.w + 1e-9, `${label} crosses the right edge`);
  assert.ok(rect.y + rect.h <= BOUNDS.y + BOUNDS.h + 1e-9, `${label} crosses the bottom edge`);
}

function staticObstacles(level) {
  return [
    ...level.walls,
    ...level.doors,
    ...level.plates.map((plate) => ({ x: plate.x - 25, y: plate.y - 25, w: 50, h: 50 })),
    ...(level.items || []).map((item) => ({ x: item.x - 22, y: item.y - 22, w: 44, h: 48 })),
    { x: level.key.x - 25, y: level.key.y - 18, w: 50, h: 38 },
    { x: level.exit.x - 21, y: level.exit.y - 23, w: 42, h: 52 },
  ];
}

function placeAndCheck(level, occupied, objectRect, preferredSides, width, name) {
  const obstacles = staticObstacles(level);
  const placement = placeCanvasLabel({
    objectRect,
    width,
    height: 28,
    bounds: BOUNDS,
    obstacles,
    occupied,
    preferredSides,
    gap: 7,
    clearance: 2,
  });
  assertInside(placement.rect, `Stage ${level.code} ${name}`);
  assert.equal(rectsOverlap(placement.rect, objectRect), false, `Stage ${level.code} ${name} overlaps its object`);
  for (const solid of [...level.walls, ...level.doors]) {
    assert.equal(rectsOverlap(placement.rect, solid), false, `Stage ${level.code} ${name} overlaps a wall or door`);
  }
  for (const prior of occupied) {
    assert.equal(rectsOverlap(placement.rect, prior), false, `Stage ${level.code} ${name} overlaps another plaque`);
  }
  occupied.push(placement.rect);
}

test("all nine stages keep common canvas plaques clear of walls and bounds", () => {
  assert.equal(levels.length, 9);
  for (const level of levels) {
    const occupied = [];
    const exitRect = { x: level.exit.x - 20, y: level.exit.y - 23, w: 40, h: 50 };
    placeAndCheck(level, occupied, exitRect, ["bottom", "left", "top", "right"], 82, "exit label");
    level.plates.forEach((plate, index) => {
      placeAndCheck(level, occupied, { x: plate.x - 22, y: plate.y - 22, w: 44, h: 44 }, ["bottom", "top", "right", "left"], 76, `switch ${index + 1} label`);
    });
    level.doors.forEach((door, index) => {
      const vertical = door.h > door.w;
      placeAndCheck(level, occupied, door, vertical ? ["right", "left", "top", "bottom"] : ["top", "bottom", "right", "left"], 86, `door ${index + 1} label`);
    });
    (level.items || []).forEach((item, index) => {
      placeAndCheck(level, occupied, { x: item.x - 20, y: item.y - 21, w: 40, h: 45 }, ["bottom", "top", "right", "left"], 90, `item ${index + 1} label`);
    });
    placeAndCheck(level, occupied, { x: level.key.x - 24, y: level.key.y - 17, w: 48, h: 35 }, ["bottom", "left", "right", "top"], 90, "key label");
    level.guards.forEach((guard, index) => {
      const size = guard.boss ? 82 : 66;
      placeAndCheck(level, occupied, { x: guard.x - size / 2, y: guard.y - size / 2, w: size, h: size }, ["top", "right", "left", "bottom"], guard.boss ? 82 : 30, `guard ${index + 1} status`);
    });
  }
});

test("vertical and horizontal doors prefer labels outside their long edge", () => {
  const vertical = placeCanvasLabel({ objectRect: { x: 400, y: 200, w: 30, h: 180 }, width: 80, height: 28, bounds: BOUNDS, preferredSides: ["right", "left", "top", "bottom"] });
  const horizontal = placeCanvasLabel({ objectRect: { x: 400, y: 200, w: 180, h: 30 }, width: 80, height: 28, bounds: BOUNDS, preferredSides: ["top", "bottom", "right", "left"] });
  assert.equal(vertical.side, "right");
  assert.equal(horizontal.side, "top");
  assert.equal(rectsOverlap(vertical.rect, { x: 400, y: 200, w: 30, h: 180 }), false);
  assert.equal(rectsOverlap(horizontal.rect, { x: 400, y: 200, w: 180, h: 30 }), false);
  assert.equal(rectFullyInsideBounds({ x: 80, y: 80, w: 90, h: 28 }, BOUNDS, 3), true);
  assert.equal(rectFullyInsideBounds({ x: 40, y: 80, w: 90, h: 28 }, BOUNDS, 3), false);
});
