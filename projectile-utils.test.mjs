import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROJECTILE_BOUNDS,
  PROJECTILE_PROFILES,
  calculateLaunchVelocity,
  createProjectileLaunch,
  firstSweptCollision,
  isOutsideBounds,
  isProjectileLifetimeExpired,
  projectileElapsedMs,
  projectileFlightPosition,
  segmentAabbHit,
  segmentCircleHit,
  shouldRemoveProjectile,
} from "./projectile-utils.js";

function approximately(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be close to ${expected}`);
}

function approximatelyPoint(actual, expected, tolerance = 1e-8) {
  approximately(actual.x, expected.x, tolerance);
  approximately(actual.y, expected.y, tolerance);
  if (Object.hasOwn(expected, "z")) approximately(actual.z, expected.z, tolerance);
}

test("projectile profiles expose immutable, playable timing data", () => {
  assert.ok(Object.isFrozen(PROJECTILE_PROFILES));
  assert.ok(Object.isFrozen(PROJECTILE_PROFILES.arrow));
  assert.ok(Object.isFrozen(PROJECTILE_PROFILES.net));
  assert.ok(PROJECTILE_PROFILES.arrow.speed > 260);
  assert.ok(PROJECTILE_PROFILES.net.speed > 260);
  assert.ok(PROJECTILE_PROFILES.arrow.apexHeight < PROJECTILE_PROFILES.net.apexHeight);
  assert.ok(PROJECTILE_PROFILES.arrow.telegraphMs < PROJECTILE_PROFILES.net.telegraphMs);
  for (const profile of Object.values(PROJECTILE_PROFILES)) {
    assert.ok(profile.lifetimeMs >= (profile.maxRange / profile.speed) * 1000);
  }
  assert.deepEqual(DEFAULT_PROJECTILE_BOUNDS, { x: 0, y: 0, w: 1200, h: 700 });
});

test("arrow launch has a low apex and lands exactly at its target", () => {
  const launch = createProjectileLaunch({ x: 100, y: 200 }, { x: 360, y: 200 }, "arrow");
  const velocity = calculateLaunchVelocity({ x: 100, y: 200 }, { x: 360, y: 200 }, "arrow");

  approximately(launch.duration, 0.5);
  approximatelyPoint(velocity, { x: 520, y: 0, z: 176 });
  approximatelyPoint(projectileFlightPosition(launch, launch.duration / 2), { x: 230, y: 200, z: 22 });
  assert.deepEqual(projectileFlightPosition(launch, launch.duration), {
    x: 360,
    y: 200,
    z: 0,
    progress: 1,
    landed: true,
  });
});

test("net round follows a higher parabola and clamps targets beyond range", () => {
  const exact = createProjectileLaunch({ x: 10, y: 10 }, { x: 180, y: 10 }, "net");
  approximately(exact.duration, 0.5);
  approximatelyPoint(projectileFlightPosition(exact, 0.25), { x: 95, y: 10, z: 68 });
  approximatelyPoint(projectileFlightPosition(exact, 0.5), { x: 180, y: 10, z: 0 });

  const clamped = createProjectileLaunch({ x: 0, y: 0 }, { x: 500, y: 0 }, "net");
  approximately(clamped.distance, PROJECTILE_PROFILES.net.maxRange);
  approximatelyPoint(clamped.landing, { x: 210, y: 0 });
  approximatelyPoint(projectileFlightPosition(clamped, 99), { x: 210, y: 0, z: 0 });
});

test("absolute flight sampling is independent of frame partitioning", () => {
  const launch = createProjectileLaunch({ x: 25, y: 40 }, { x: 195, y: 125 }, "net");
  const total = launch.duration * 0.73;
  const direct = projectileFlightPosition(launch, total);

  let sixtyFpsElapsed = 0;
  for (let index = 0; index < 60; index += 1) sixtyFpsElapsed += total / 60;
  let tenFpsElapsed = 0;
  for (let index = 0; index < 10; index += 1) tenFpsElapsed += total / 10;

  approximatelyPoint(projectileFlightPosition(launch, sixtyFpsElapsed), direct);
  approximatelyPoint(projectileFlightPosition(launch, tenFpsElapsed), direct);
});

test("absolute loop clocks keep the spawn frame at age zero", () => {
  assert.equal(projectileElapsedMs(2400, 2400), 0);
  approximately(projectileElapsedMs(2416.67, 2400), 16.67);
  assert.equal(projectileElapsedMs(2390, 2400), 0);
  assert.throws(() => projectileElapsedMs(Number.NaN, 2400), TypeError);
  assert.throws(() => projectileElapsedMs(2400, -1), RangeError);
});

test("wall collision wins when the wall is before the player", () => {
  const wall = { id: "wall", x: 40, y: -10, w: 10, h: 20 };
  const player = { id: "player", x: 80, y: 0, radius: 6 };
  const hit = firstSweptCollision({ x: 0, y: 0 }, { x: 100, y: 0 }, {
    walls: [wall],
    targets: [player],
    projectileRadius: 2,
  });

  assert.equal(hit.kind, "wall");
  assert.equal(hit.collider, wall);
  approximately(hit.t, 0.38);
  approximatelyPoint(hit.point, { x: 38, y: 0 });
});

test("overlapping targets preserve actor order so a clone can shield the player", () => {
  const clone = { id: "clone-1", x: 80, y: 0, radius: 10 };
  const player = { id: "player", x: 80, y: 0, radius: 10 };
  const hit = firstSweptCollision({ x: 0, y: 0 }, { x: 100, y: 0 }, {
    targets: [clone, player],
    projectileRadius: 4,
  });

  assert.equal(hit.kind, "target");
  assert.equal(hit.collider, clone);
});

test("swept circle collision prevents a fast projectile from tunneling", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 1000, y: 0 };
  const target = { x: 500, y: 0, radius: 5 };
  assert.ok(Math.hypot(from.x - target.x, from.y - target.y) > target.radius);
  assert.ok(Math.hypot(to.x - target.x, to.y - target.y) > target.radius);

  const hit = segmentCircleHit(from, to, target, 3);
  assert.ok(hit);
  approximately(hit.t, 0.492);
  approximatelyPoint(hit.point, { x: 492, y: 0 });
});

test("swept AABB collision handles fast motion, padding, and misses", () => {
  const wall = { x: 500, y: 100, w: 20, h: 80 };
  const hit = segmentAabbHit({ x: 0, y: 140 }, { x: 1000, y: 140 }, wall, 4);
  assert.ok(hit);
  approximately(hit.t, 0.496);
  approximatelyPoint(hit.point, { x: 496, y: 140 });
  assert.deepEqual(hit.normal, { x: -1, y: 0 });
  assert.equal(segmentAabbHit({ x: 0, y: 50 }, { x: 1000, y: 50 }, wall, 4), null);
});

test("bounds and lifetime helpers remove offscreen or stale projectiles", () => {
  assert.equal(isOutsideBounds({ x: 1200, y: 700 }), false);
  assert.equal(isOutsideBounds({ x: 1201, y: 350 }), true);
  assert.equal(isOutsideBounds({ x: 1204, y: 350 }, DEFAULT_PROJECTILE_BOUNDS, 5), false);
  assert.equal(isOutsideBounds({ x: 1206, y: 350 }, DEFAULT_PROJECTILE_BOUNDS, 5), true);
  assert.equal(isProjectileLifetimeExpired(749, 750), false);
  assert.equal(isProjectileLifetimeExpired(750, 750), true);
  assert.equal(shouldRemoveProjectile({ position: { x: 400, y: 300 }, ageMs: 200, lifetimeMs: 750 }), false);
  assert.equal(shouldRemoveProjectile({ position: { x: -20, y: 300 }, ageMs: 200, lifetimeMs: 750 }, DEFAULT_PROJECTILE_BOUNDS, 4), true);
  assert.equal(shouldRemoveProjectile({ position: { x: 400, y: 300 }, ageMs: 750, lifetimeMs: 750 }), true);
});

test("malformed physics and collision inputs fail fast", () => {
  assert.throws(() => createProjectileLaunch({ x: 0, y: 0 }, { x: 0, y: 0 }, "arrow"), RangeError);
  assert.throws(() => createProjectileLaunch({ x: Number.NaN, y: 0 }, { x: 10, y: 0 }, "arrow"), TypeError);
  assert.throws(() => createProjectileLaunch({ x: 0, y: 0 }, { x: 10, y: 0 }, "laser"), RangeError);
  assert.throws(() => createProjectileLaunch({ x: 0, y: 0 }, { x: 10, y: 0 }, { speed: 0 }), RangeError);
  assert.throws(() => projectileFlightPosition({}, 0), TypeError);
  assert.throws(() => segmentCircleHit({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0, radius: -1 }), RangeError);
  assert.throws(() => segmentAabbHit({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0, w: -1, h: 2 }), RangeError);
  assert.throws(() => firstSweptCollision({ x: 0, y: 0 }, { x: 10, y: 0 }, { walls: {} }), TypeError);
  assert.throws(() => firstSweptCollision({ x: Number.NaN, y: 0 }, { x: 10, y: 0 }), TypeError);
  assert.throws(() => isOutsideBounds({ x: 0, y: 0 }, { x: 0, y: 0, w: -1, h: 20 }), RangeError);
  assert.throws(() => isProjectileLifetimeExpired("old", 750), TypeError);
  assert.throws(() => shouldRemoveProjectile({ x: 0, y: 0, ageMs: 0 }), TypeError);
});
