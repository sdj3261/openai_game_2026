import assert from "node:assert/strict";
import test from "node:test";

import { MAX_CLONES, canCreateClone, canEscape } from "./game-rules.js";

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
