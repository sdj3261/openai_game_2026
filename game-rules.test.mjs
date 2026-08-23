import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CLONES,
  STAGE_NINE_EFFECTS,
  canCollectTeamKey,
  canCreateClone,
  canEscape,
  stageNineBlackoutOpacity,
  stageNineEventShakeIntensity,
  stageNineShakeOffset,
} from "./game-rules.js";

const closeTo = (actual, expected, epsilon = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

test("only the key unlocks the exit", () => {
  assert.equal(canEscape({ hasKey: false, clones: 10, usedNoise: true }), false);
  assert.equal(canEscape({ hasKey: true, clones: 0, usedNoise: false }), true);
  assert.equal(canEscape(null), false);
});

test("the game allows up to ten clones", () => {
  assert.equal(MAX_CLONES, 10);
  assert.equal(canCreateClone(0), true);
  assert.equal(canCreateClone(9), true);
  assert.equal(canCreateClone(10), false);
  assert.equal(canCreateClone(99), false);
  assert.equal(canCreateClone("bad"), false);
});

test("the current duck and every clone use the same key pickup rule", () => {
  for (const actorType of ["player", "clone"]) {
    assert.equal(canCollectTeamKey({ actorType, alreadyCollected: false, distance: 28.99 }), true);
    assert.equal(canCollectTeamKey({ actorType, alreadyCollected: false, distance: 29 }), false);
    assert.equal(canCollectTeamKey({ actorType, alreadyCollected: true, distance: 0 }), false);
  }
  assert.equal(canCollectTeamKey({ alreadyCollected: false, distance: Number.NaN }), false);
});

test("stage nine blackout follows one smooth deterministic envelope per loop", () => {
  const sample = (loopElapsedMs) => stageNineBlackoutOpacity({ levelCode: "09", loopElapsedMs });
  const times = [3500, 3600, 3700, 3800, 3900, 4000, 4100, 4200, 4300, 4400, 4500];
  const firstPass = times.map(sample);
  const secondPass = times.map(sample);
  assert.deepEqual(firstPass, secondPass);
  for (let index = 1; index <= 5; index += 1) assert.ok(firstPass[index] >= firstPass[index - 1]);
  for (let index = 6; index < firstPass.length; index += 1) assert.ok(firstPass[index] <= firstPass[index - 1]);
  assert.equal(sample(STAGE_NINE_EFFECTS.blackoutStartMs), 0);
  closeTo(sample(3750), STAGE_NINE_EFFECTS.blackoutOpacity / 2);
  closeTo(sample(STAGE_NINE_EFFECTS.blackoutPeakMs), STAGE_NINE_EFFECTS.blackoutOpacity);
  closeTo(sample(4250), STAGE_NINE_EFFECTS.blackoutOpacity / 2);
  assert.equal(sample(STAGE_NINE_EFFECTS.blackoutEndMs), 0);
  assert.equal(stageNineBlackoutOpacity({ levelCode: "08", loopElapsedMs: 4000 }), 0);
  assert.equal(stageNineBlackoutOpacity({ levelCode: "09", loopElapsedMs: "bad" }), 0);
});

test("reduced motion keeps the blackout subtle and disables event shake", () => {
  const reducedPeak = stageNineBlackoutOpacity({ levelCode: 9, loopElapsedMs: 4000, reducedMotion: true });
  closeTo(reducedPeak, STAGE_NINE_EFFECTS.reducedBlackoutOpacity);
  assert.ok(reducedPeak < STAGE_NINE_EFFECTS.blackoutOpacity / 2);
  assert.equal(stageNineEventShakeIntensity({ levelCode: 9, event: "door-open", reducedMotion: true }), 0);
  assert.equal(stageNineEventShakeIntensity({ levelCode: 9, event: "boss-alert", reducedMotion: true }), 0);
});

test("only stage nine door openings and boss alerts request shake", () => {
  assert.equal(stageNineEventShakeIntensity({ levelCode: "09", event: "door-open" }), STAGE_NINE_EFFECTS.doorOpenShake);
  assert.equal(stageNineEventShakeIntensity({ levelCode: "09", event: "boss-alert" }), STAGE_NINE_EFFECTS.bossAlertShake);
  assert.equal(stageNineEventShakeIntensity({ levelCode: "09", event: "door-close" }), 0);
  assert.equal(stageNineEventShakeIntensity({ levelCode: "08", event: "boss-alert" }), 0);
});

test("stage nine shake offsets are deterministic, bounded, and motion-safe", () => {
  const options = { levelCode: "09", loopElapsedMs: 4321, intensity: 10 };
  const first = stageNineShakeOffset(options);
  const second = stageNineShakeOffset(options);
  assert.deepEqual(first, second);
  assert.ok(Math.abs(first.x) <= options.intensity * 0.48);
  assert.ok(Math.abs(first.y) <= options.intensity * 0.36);
  assert.deepEqual(stageNineShakeOffset({ ...options, reducedMotion: true }), { x: 0, y: 0 });
  assert.deepEqual(stageNineShakeOffset({ ...options, levelCode: "08" }), { x: 0, y: 0 });
  assert.deepEqual(stageNineShakeOffset({ ...options, intensity: Number.NaN }), { x: 0, y: 0 });
});
