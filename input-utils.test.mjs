import assert from "node:assert/strict";
import test from "node:test";

import { describeAnalogStick, projectAnalogStick } from "./input-utils.js";

const rect = { left: 20, top: 40, width: 160, height: 160 };

function approximately(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be close to ${expected}`);
}

test("projectAnalogStick returns a stopped stick at its center", () => {
  const result = projectAnalogStick(100, 120, rect);

  assert.deepEqual(result, {
    x: 0,
    y: 0,
    magnitude: 0,
    knobX: 0,
    knobY: 0,
    maxRadius: 50,
  });
});

test("projectAnalogStick applies its deadzone without moving the player", () => {
  const result = projectAnalogStick(105, 120, rect);

  assert.equal(result.magnitude, 0);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.knobX, 5);
  assert.equal(result.knobY, 0);
});

test("projectAnalogStick clamps an outside pointer and preserves direction", () => {
  const result = projectAnalogStick(300, 320, rect);

  approximately(result.magnitude, 1);
  approximately(result.x, Math.SQRT1_2);
  approximately(result.y, Math.SQRT1_2);
  approximately(Math.hypot(result.knobX, result.knobY), result.maxRadius);
});

test("projectAnalogStick honors custom geometry and deadzone", () => {
  const result = projectAnalogStick(125, 120, rect, { deadzone: 0.2, knobRadius: 20, padding: 10 });

  assert.equal(result.maxRadius, 50);
  approximately(result.magnitude, 0.375);
  approximately(result.x, 0.375);
  assert.equal(result.y, 0);
});

test("describeAnalogStick returns concise Korean direction feedback", () => {
  assert.equal(describeAnalogStick(0, 0, 0), "중앙 · 정지");
  assert.equal(describeAnalogStick(0.1, 0, 0.2), "오른쪽 · 20%");
  assert.equal(describeAnalogStick(0.8, -0.8, 0.9), "위 오른쪽 · 90%");
  assert.equal(describeAnalogStick(-0.7, 0.7, 0.54), "아래 왼쪽 · 54%");
});

test("describeAnalogStick localizes assistive feedback", () => {
  assert.equal(describeAnalogStick(0, 0, 0, "en-US"), "Center · stopped");
  assert.equal(describeAnalogStick(0.5, -0.5, 0.7, "ja"), "上 右 · 70%");
});
