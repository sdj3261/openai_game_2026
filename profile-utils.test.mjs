import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROFILE,
  PROFILE_COLORS,
  PROFILE_FACES,
  PROFILE_NAME_MAX_LENGTH,
  calculateStealthScore,
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
  assert.deepEqual(normalizeProfile({ name: "  분신!! ", color: "#9D8CFF", face: PROFILE_FACES[2], admin: true }), {
    name: "분신",
    color: "#9d8cff",
    face: PROFILE_FACES[2],
  });
  assert.deepEqual(normalizeProfile(null), DEFAULT_PROFILE);
});

test("calculateStealthScore returns a perfect score and an inspectable breakdown", () => {
  assert.deepEqual(calculateStealthScore({ radarHits: 0, retries: 0, echoes: 0, time: 5000 }), {
    score: 10000,
    grade: "S",
    breakdown: {
      baseScore: 10000,
      radarHits: 0,
      radarPenalty: 0,
      retries: 0,
      retryPenalty: 0,
      echoes: 0,
      targetEchoes: 0,
      extraEchoes: 0,
      echoPenalty: 0,
      time: 5000,
      timePenalty: 0,
      totalPenalty: 0,
    },
  });
});

test("calculateStealthScore applies every penalty using the documented formula", () => {
  const result = calculateStealthScore({ radarHits: 1, retries: 2, echoes: 3, time: 6789 });

  assert.equal(result.breakdown.radarPenalty, 1200);
  assert.equal(result.breakdown.retryPenalty, 1300);
  assert.equal(result.breakdown.echoPenalty, 750);
  assert.equal(result.breakdown.timePenalty, 178);
  assert.equal(result.breakdown.totalPenalty, 3428);
  assert.equal(result.score, 6572);
  assert.equal(result.grade, "B");
});

test("calculateStealthScore only penalizes echoes beyond the stage target", () => {
  const onPlan = calculateStealthScore({ echoes: 2, targetEchoes: 2, time: 5000 });
  const extra = calculateStealthScore({ echoes: 4, targetEchoes: 2, time: 5000 });

  assert.equal(onPlan.breakdown.extraEchoes, 0);
  assert.equal(onPlan.breakdown.echoPenalty, 0);
  assert.equal(onPlan.score, 10000);
  assert.equal(extra.breakdown.extraEchoes, 2);
  assert.equal(extra.breakdown.echoPenalty, 500);
  assert.equal(extra.score, 9500);
});

test("calculateStealthScore uses inclusive grade thresholds and clamps at zero", () => {
  assert.deepEqual(
    [4, 10, 16, 17].map((echoes) => {
      const { score, grade } = calculateStealthScore({ echoes, time: 5000 });
      return { score, grade };
    }),
    [
      { score: 9000, grade: "S" },
      { score: 7500, grade: "A" },
      { score: 6000, grade: "B" },
      { score: 5750, grade: "C" },
    ],
  );

  const clamped = calculateStealthScore({ radarHits: 99, retries: 99, echoes: 99, time: 999999 });
  assert.equal(clamped.score, 0);
  assert.equal(clamped.grade, "C");
});

test("calculateStealthScore normalizes malformed, negative, fractional, and numeric-string input", () => {
  const safe = calculateStealthScore({ radarHits: -2, retries: Number.NaN, echoes: "bad", time: null });
  assert.equal(safe.score, 10000);
  assert.deepEqual(
    {
      radarHits: safe.breakdown.radarHits,
      retries: safe.breakdown.retries,
      echoes: safe.breakdown.echoes,
      time: safe.breakdown.time,
    },
    { radarHits: 0, retries: 0, echoes: 0, time: 5000 },
  );

  const normalized = calculateStealthScore({ radarHits: "2.9", retries: true, echoes: 1.8, time: "5019.9" });
  assert.equal(normalized.breakdown.radarHits, 2);
  assert.equal(normalized.breakdown.retries, 0);
  assert.equal(normalized.breakdown.echoes, 1);
  assert.equal(normalized.breakdown.time, 5019.9);
  assert.equal(normalized.breakdown.timePenalty, 1);
  assert.equal(normalized.score, 7349);

  assert.doesNotThrow(() => calculateStealthScore({ radarHits: Symbol("invalid"), time: {} }));
  assert.equal(calculateStealthScore({ radarHits: Symbol("invalid"), time: {} }).score, 10000);
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

test("scored completion records sort by score, radar hits, retries, echoes, and time", () => {
  const records = [
    { id: "time", world: "01", score: 8000, radarHits: 1, retries: 1, echoes: 1, time: 6100 },
    { id: "echoes", world: "01", score: 8000, radarHits: 1, retries: 1, echoes: 0, time: 9000 },
    { id: "retries", world: "01", score: 8000, radarHits: 1, retries: 0, echoes: 9, time: 9000 },
    { id: "radar", world: "01", score: 8000, radarHits: 0, retries: 9, echoes: 9, time: 9000 },
    { id: "score", world: "01", score: 9000, radarHits: 9, retries: 9, echoes: 9, time: 9000 },
    { id: "slow-time", world: "01", score: 8000, radarHits: 1, retries: 1, echoes: 1, time: 6200 },
  ];

  assert.deepEqual(sortCompletionRecords(records).map((record) => record.id), [
    "score",
    "radar",
    "retries",
    "echoes",
    "time",
    "slow-time",
  ]);
});

test("scored records precede legacy records while legacy ordering remains compatible", () => {
  const records = [
    { id: "legacy-slow", world: "02", time: 2000, echoes: 0 },
    { id: "new-zero", world: "02", score: 0, radarHits: 8, retries: 8, time: 9000, echoes: 8 },
    { id: "legacy-echoes", world: "02", time: 1000, echoes: 2 },
    { id: "invalid-score", world: "02", score: "", time: 1000, echoes: 1 },
    { id: "new-high", world: "02", score: 9000, radarHits: 0, retries: 0, time: 6000, echoes: 1 },
  ];

  assert.deepEqual(sortCompletionRecords(records).map((record) => record.id), [
    "new-high",
    "new-zero",
    "invalid-score",
    "legacy-echoes",
    "legacy-slow",
  ]);
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

test("world top, rank, and leaderboard inherit scored-record migration ordering", () => {
  const records = [
    { id: "legacy-fast", world: "08", time: 1000, echoes: 0 },
    { id: "bronze", world: "08", score: 6100, radarHits: 2, retries: 1, time: 9000, echoes: 2 },
    { id: "gold", world: 8, score: 9200, radarHits: 0, retries: 0, time: 6000, echoes: 2 },
    { id: "other-world", world: "07", score: 9999, radarHits: 0, retries: 0, time: 5000, echoes: 0 },
  ];
  const current = { score: 7500, radarHits: 1, retries: 0, time: 7000, echoes: 1 };

  assert.deepEqual(getWorldTopRecords(records, "8", 3).map((record) => record.id), ["gold", "bronze", "legacy-fast"]);
  assert.equal(getWorldRank(records, "08", current), 2);
  assert.deepEqual(getWorldLeaderboard(records, "08", current, 2), {
    world: "08",
    top: [records[2], records[1]],
    rank: 2,
    total: 3,
  });
});
