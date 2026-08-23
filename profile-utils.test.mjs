import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROFILE,
  PROFILE_COLORS,
  PROFILE_FACES,
  PROFILE_NAME_MAX_LENGTH,
  compareCompletionRecords,
  getTopRecordsByWorld,
  getWorldLeaderboard,
  getWorldRank,
  getWorldTopRecords,
  normalizeProfile,
  normalizeProfileColor,
  normalizeProfileFace,
  normalizeProfileName,
  sortCompletionRecords,
} from "./profile-utils.js";

test("profile option constants are immutable and have safe defaults", () => {
  assert.ok(Object.isFrozen(PROFILE_COLORS));
  assert.ok(Object.isFrozen(PROFILE_FACES));
  assert.ok(PROFILE_COLORS.includes(DEFAULT_PROFILE.color));
  assert.ok(PROFILE_FACES.includes(DEFAULT_PROFILE.face));
  assert.equal(new Set(PROFILE_COLORS).size, PROFILE_COLORS.length);
  assert.equal(new Set(PROFILE_FACES).size, PROFILE_FACES.length);
});

test("normalizeProfileName normalizes width, whitespace, unsafe punctuation, and length", () => {
  assert.equal(normalizeProfileName("  ＬＯＯＰ   도둑! <3  "), "LOOP 도둑 3");
  assert.equal(normalizeProfileName("abcdefghijklmnop"), "abcdefghijkl".slice(0, PROFILE_NAME_MAX_LENGTH));
  assert.equal(normalizeProfileName("<script>"), "script");
  assert.equal(normalizeProfileName("💣💣", "지금이"), "지금이");
});

test("profile color and face values are restricted to exported options", () => {
  assert.equal(normalizeProfileColor("#62E7FF"), PROFILE_COLORS[0]);
  assert.equal(normalizeProfileColor("red", PROFILE_COLORS[2]), PROFILE_COLORS[2]);
  assert.equal(normalizeProfileFace(` ${PROFILE_FACES[3]} `), PROFILE_FACES[3]);
  assert.equal(normalizeProfileFace("not-a-face"), DEFAULT_PROFILE.face);
});

test("normalizeProfile returns only normalized profile fields", () => {
  assert.deepEqual(normalizeProfile({ name: "  아까미!! ", color: "#9D8CFF", face: PROFILE_FACES[2], admin: true }), {
    name: "아까미",
    color: "#9d8cff",
    face: PROFILE_FACES[2],
  });
  assert.deepEqual(normalizeProfile(null), DEFAULT_PROFILE);
});

test("completion records sort by time and then by echoes without mutating input", () => {
  const slower = { id: "slow", world: "01", time: 7800, echoes: 0 };
  const moreEchoes = { id: "more", world: "01", time: 6500, echoes: 2 };
  const best = { id: "best", world: "01", time: 6500, echoes: 1 };
  const invalid = { id: "invalid", world: "01", time: "bad", echoes: 0 };
  const missing = { id: "missing", world: "01", time: null, echoes: null };
  const input = [slower, moreEchoes, invalid, missing, best];

  assert.deepEqual(sortCompletionRecords(input).map((record) => record.id), ["best", "more", "slow", "invalid", "missing"]);
  assert.deepEqual(input.map((record) => record.id), ["slow", "more", "invalid", "missing", "best"]);
  assert.ok(compareCompletionRecords(best, moreEchoes) < 0);
});

test("world top records accept numeric or padded world keys and ignore invalid scores", () => {
  const records = [
    { id: "a", world: "01", time: 7200, echoes: 1 },
    { id: "b", world: 1, time: 6100, echoes: 2 },
    { id: "c", world: "02", time: 5000, echoes: 1 },
    { id: "bad", world: "01", time: -1, echoes: 0 },
    { id: "blank", world: "01", time: "", echoes: "" },
  ];

  assert.deepEqual(getWorldTopRecords(records, "1", 1).map((record) => record.id), ["b"]);
  assert.deepEqual(getTopRecordsByWorld(records, 5)["01"].map((record) => record.id), ["b", "a"]);
  assert.deepEqual(getTopRecordsByWorld(records, 5)["02"].map((record) => record.id), ["c"]);
});

test("world rank uses competition ranking for equal time and echoes", () => {
  const records = [
    { id: "first", world: "03", time: 5100, echoes: 1 },
    { id: "tie", world: "03", time: 6200, echoes: 2 },
    { id: "other", world: "04", time: 1000, echoes: 0 },
  ];
  const current = { id: "current", world: "03", time: 6200, echoes: 2 };

  assert.equal(getWorldRank(records, "03", current), 2);
  assert.equal(getWorldRank(records, "03", { time: 7000, echoes: 0 }), 3);
  assert.equal(getWorldRank(records, "03", { time: "bad", echoes: 0 }), null);
});

test("world leaderboard returns top records, current rank, and valid total", () => {
  const records = [
    { id: "one", world: "05", time: 5000, echoes: 3 },
    { id: "two", world: "05", time: 6000, echoes: 2 },
    { id: "three", world: "05", time: 7000, echoes: 1 },
  ];
  const result = getWorldLeaderboard(records, 5, { time: 6500, echoes: 2 }, 2);

  assert.equal(result.world, "05");
  assert.deepEqual(result.top.map((record) => record.id), ["one", "two"]);
  assert.equal(result.rank, 3);
  assert.equal(result.total, 3);
});
