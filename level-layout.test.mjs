import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const PLAYER_SPEED = 260;
const PLAYER_RADIUS = 16;
const LOOP_SECONDS = 8;
const STEP = 5;
const BOUNDS = { minX: 82, maxX: 1118, minY: 72, maxY: 628 };

function extractInitializer(source, name) {
  const marker = `const ${name} =`;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing ${marker}`);
  let start = markerIndex + marker.length;
  while (/\s/.test(source[start])) start += 1;
  const pairs = { "[": "]", "{": "}", "(": ")" };
  const open = source[start];
  const close = pairs[open];
  assert.ok(close, `${name} initializer must start with a bracket`);
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
    if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed ${name} initializer`);
}

const source = await readFile(new URL("./game.js", import.meta.url), "utf8");
const THEMES = new Proxy({}, { get: (_target, id) => ({ id: String(id) }) });
const KEY_TYPES = new Proxy({}, { get: (_target, id) => ({ id: String(id), value: 0, palette: {} }) });
const levels = vm.runInNewContext(`(${extractInitializer(source, "levels")})`, { THEMES, KEY_TYPES });

function pointHitsExpandedRect(point, rect) {
  return point.x >= rect.x - PLAYER_RADIUS
    && point.x <= rect.x + rect.w + PLAYER_RADIUS
    && point.y >= rect.y - PLAYER_RADIUS
    && point.y <= rect.y + rect.h + PLAYER_RADIUS;
}

function snap(value, min, max) {
  return Math.max(min, Math.min(max, min + Math.round((value - min) / STEP) * STEP));
}

function keyFor(x, y) {
  return `${x},${y}`;
}

class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].time <= item.time) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }
  pop() {
    const first = this.items[0];
    const last = this.items.pop();
    if (!this.items.length) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      const child = right < this.items.length && this.items[right].time < this.items[left].time ? right : left;
      if (this.items[child].time >= last.time) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return first;
  }
  get length() { return this.items.length; }
}

const directions = [
  [STEP, 0, STEP], [-STEP, 0, STEP], [0, STEP, STEP], [0, -STEP, STEP],
  [STEP, STEP, STEP * Math.SQRT2], [STEP, -STEP, STEP * Math.SQRT2],
  [-STEP, STEP, STEP * Math.SQRT2], [-STEP, -STEP, STEP * Math.SQRT2],
];

function earliestArrival(level, from, to, options = {}) {
  const openTimes = options.openTimes || new Map();
  const permanentlyClosed = new Set(options.permanentlyClosed || []);
  const start = {
    x: snap(from.x, BOUNDS.minX, BOUNDS.maxX),
    y: snap(from.y, BOUNDS.minY, BOUNDS.maxY),
  };
  const target = {
    x: snap(to.x, BOUNDS.minX, BOUNDS.maxX),
    y: snap(to.y, BOUNDS.minY, BOUNDS.maxY),
  };
  const solids = [...level.walls, ...level.doors.filter((_door, index) => permanentlyClosed.has(index))];
  if (solids.some((rect) => pointHitsExpandedRect(start, rect))) return Infinity;
  const heap = new MinHeap();
  const times = new Map([[keyFor(start.x, start.y), options.startTime || 0]]);
  heap.push({ ...start, time: options.startTime || 0 });
  while (heap.length) {
    const current = heap.pop();
    if (current.time !== times.get(keyFor(current.x, current.y))) continue;
    if (Math.hypot(current.x - target.x, current.y - target.y) <= STEP * 0.75) return current.time;
    for (const [dx, dy, distance] of directions) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (next.x < BOUNDS.minX || next.x > BOUNDS.maxX || next.y < BOUNDS.minY || next.y > BOUNDS.maxY) continue;
      if (solids.some((rect) => pointHitsExpandedRect(next, rect))) continue;
      if (dx && dy) {
        const sideA = { x: current.x + dx, y: current.y };
        const sideB = { x: current.x, y: current.y + dy };
        if (solids.some((rect) => pointHitsExpandedRect(sideA, rect) || pointHitsExpandedRect(sideB, rect))) continue;
      }
      let arrival = current.time + distance / PLAYER_SPEED;
      level.doors.forEach((door, index) => {
        if (pointHitsExpandedRect(next, door) && openTimes.has(index)) arrival = Math.max(arrival, openTimes.get(index));
      });
      const nextKey = keyFor(next.x, next.y);
      if (arrival + 1e-9 >= (times.get(nextKey) ?? Infinity)) continue;
      times.set(nextKey, arrival);
      heap.push({ ...next, time: arrival });
    }
  }
  return Infinity;
}

function activationSchedule(level) {
  const openTimes = new Map();
  for (let index = 0; index < level.plates.length; index += 1) {
    const permanentlyClosed = level.doors.map((_door, doorIndex) => doorIndex).filter((doorIndex) => doorIndex >= index);
    const activation = earliestArrival(level, level.start, level.plates[index], { openTimes, permanentlyClosed });
    assert.ok(Number.isFinite(activation), `Stage ${level.code} clone ${index + 1} cannot reach its switch`);
    openTimes.set(index, activation);
  }
  return openTimes;
}

test("nine stages expose a physical clone difficulty curve", () => {
  assert.equal(levels.length, 9);
  assert.deepEqual(Array.from(levels, (level) => level.code), ["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
  assert.deepEqual(Array.from(levels, (level) => level.parEchoes), [0, 1, 1, 2, 1, 2, 2, 2, 3]);
  levels.forEach((level) => {
    assert.equal(level.plates.length, level.parEchoes, `Stage ${level.code} switch count must match target clones`);
    assert.equal(level.doors.length, level.plates.length, `Stage ${level.code} needs one door per switch`);
    const plateIds = new Set(level.plates.map((plate) => plate.id));
    level.doors.forEach((door) => assert.ok(plateIds.has(door.plateId), `Stage ${level.code} door has no switch`));
  });
  const finalTimeGear = levels[8].items.find((item) => item.type === "time");
  assert.equal(finalTimeGear?.duration, 5000, "Stage 09 needs its five-second time gear for the guarded final escape");
});

test("all stage music loops are exactly eight seconds", () => {
  levels.forEach((level) => {
    const duration = level.music.steps.length * 60 / level.music.bpm;
    assert.ok(Math.abs(duration - LOOP_SECONDS) < 1e-9, `Stage ${level.code} music is ${duration}s`);
  });
});

test("every gated stage blocks the key until its clone doors open", () => {
  levels.filter((level) => level.doors.length).forEach((level) => {
    level.doors.forEach((_door, closedDoorIndex) => {
      const arrival = earliestArrival(level, level.start, level.key, { permanentlyClosed: [closedDoorIndex] });
      assert.equal(arrival, Infinity, `Stage ${level.code} can bypass clone door ${closedDoorIndex + 1}`);
    });
  });
});

test("recorded clones can open every door and the final key-to-exit run fits its timer", () => {
  levels.forEach((level) => {
    const openTimes = activationSchedule(level);
    const toKey = earliestArrival(level, level.start, level.key, { openTimes });
    const toExit = earliestArrival(level, level.key, level.exit, { openTimes, startTime: toKey });
    if (process.env.LEVEL_LAYOUT_REPORT === "1") {
      console.log(`Stage ${level.code}: clones ${level.parEchoes}, key ${toKey.toFixed(2)}s, exit ${toExit.toFixed(2)}s`);
    }
    assert.ok(Number.isFinite(toExit), `Stage ${level.code} final run has no route`);
    assert.ok(toExit <= LOOP_SECONDS, `Stage ${level.code} needs ${toExit.toFixed(2)}s but only ${LOOP_SECONDS.toFixed(2)}s is available`);
  });
});
