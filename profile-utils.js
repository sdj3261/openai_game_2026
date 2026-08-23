export const PROFILE_COLORS = Object.freeze([
  "#62e7ff",
  "#9d8cff",
  "#68ffd0",
  "#ff8bd8",
  "#ffd166",
  "#ff7b72",
]);

export const PROFILE_FACES = Object.freeze(["•ᴗ•", "^‿^", ">ᴗ<", "◉‿◉", "ᵔᴥᵔ", "¬‿¬"]);
export const PROFILE_NAME_MAX_LENGTH = 12;
export const DEFAULT_PROFILE = Object.freeze({
  name: "지금이",
  color: PROFILE_COLORS[0],
  face: PROFILE_FACES[0],
});

function sanitizeName(value) {
  return Array.from(String(value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} _-]+/gu, "")
    .replace(/\s+/g, " ")
    .trim())
    .slice(0, PROFILE_NAME_MAX_LENGTH)
    .join("");
}

export function normalizeProfileName(value, fallback = DEFAULT_PROFILE.name) {
  return sanitizeName(value) || sanitizeName(fallback) || DEFAULT_PROFILE.name;
}

export function normalizeProfileColor(value, fallback = DEFAULT_PROFILE.color) {
  const candidate = String(value ?? "").trim().toLowerCase();
  const normalizedFallback = String(fallback ?? "").trim().toLowerCase();
  return PROFILE_COLORS.find((color) => color.toLowerCase() === candidate)
    || PROFILE_COLORS.find((color) => color.toLowerCase() === normalizedFallback)
    || DEFAULT_PROFILE.color;
}

export function normalizeProfileFace(value, fallback = DEFAULT_PROFILE.face) {
  const candidate = String(value ?? "").trim();
  const normalizedFallback = String(fallback ?? "").trim();
  return PROFILE_FACES.includes(candidate)
    ? candidate
    : PROFILE_FACES.includes(normalizedFallback)
      ? normalizedFallback
      : DEFAULT_PROFILE.face;
}

export function normalizeProfile(profile = {}) {
  const candidate = profile && typeof profile === "object" ? profile : {};
  return {
    name: normalizeProfileName(candidate.name),
    color: normalizeProfileColor(candidate.color),
    face: normalizeProfileFace(candidate.face),
  };
}

function finiteNumber(value) {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  try {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  } catch {
    return null;
  }
}

function normalizeNonNegativeNumber(value, fallback = 0, integer = false) {
  const numeric = finiteNumber(value);
  if (numeric == null || numeric < 0) return fallback;
  const safe = Math.min(numeric, Number.MAX_SAFE_INTEGER);
  return integer ? Math.floor(safe) : safe;
}

export function calculateStealthScore(metrics = {}) {
  const candidate = metrics && typeof metrics === "object" ? metrics : {};
  const radarHits = normalizeNonNegativeNumber(candidate.radarHits, 0, true);
  const retries = normalizeNonNegativeNumber(candidate.retries, 0, true);
  const echoes = normalizeNonNegativeNumber(candidate.echoes, 0, true);
  const targetEchoes = normalizeNonNegativeNumber(candidate.targetEchoes, 0, true);
  const time = normalizeNonNegativeNumber(candidate.time, 5000);
  const radarPenalty = radarHits * 1200;
  const retryPenalty = retries * 650;
  const extraEchoes = Math.max(0, echoes - targetEchoes);
  const echoPenalty = extraEchoes * 250;
  const timePenalty = Math.max(0, Math.floor((time - 5000) / 10));
  const totalPenalty = radarPenalty + retryPenalty + echoPenalty + timePenalty;
  const score = Math.max(0, Math.min(10000, 10000 - totalPenalty));
  const grade = score >= 9000 ? "S" : score >= 7500 ? "A" : score >= 6000 ? "B" : "C";

  return {
    score,
    grade,
    breakdown: {
      baseScore: 10000,
      radarHits,
      radarPenalty,
      retries,
      retryPenalty,
      echoes,
      targetEchoes,
      extraEchoes,
      echoPenalty,
      time,
      timePenalty,
      totalPenalty,
    },
  };
}

function scoreValue(value) {
  const numeric = finiteNumber(value);
  return numeric != null && numeric >= 0 ? numeric : Number.POSITIVE_INFINITY;
}

function hasCompletionScore(record) {
  if (!record || typeof record !== "object") return false;
  return finiteNumber(record.score) != null;
}

function completionScoreValue(record) {
  return Math.max(0, Math.min(10000, finiteNumber(record.score)));
}

function completionCountValue(value) {
  return normalizeNonNegativeNumber(value, 0, true);
}

function worldKey(value) {
  const candidate = String(value ?? "").trim().toUpperCase();
  if (/^\d+$/.test(candidate)) return String(Number(candidate)).padStart(2, "0");
  return candidate;
}

function isRankableRecord(record) {
  return Boolean(record && typeof record === "object" && worldKey(record.world))
    && scoreValue(record.time) !== Number.POSITIVE_INFINITY
    && scoreValue(record.echoes) !== Number.POSITIVE_INFINITY
    && Number.isInteger(Number(record.echoes));
}

export function compareCompletionRecords(left, right) {
  const leftHasScore = hasCompletionScore(left);
  const rightHasScore = hasCompletionScore(right);
  if (leftHasScore !== rightHasScore) return leftHasScore ? -1 : 1;

  if (leftHasScore) {
    const leftScore = completionScoreValue(left);
    const rightScore = completionScoreValue(right);
    if (leftScore !== rightScore) return leftScore > rightScore ? -1 : 1;

    for (const field of ["radarHits", "retries", "echoes"]) {
      const leftValue = completionCountValue(left?.[field]);
      const rightValue = completionCountValue(right?.[field]);
      if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
    }

    const leftTime = scoreValue(left?.time);
    const rightTime = scoreValue(right?.time);
    if (leftTime === rightTime) return 0;
    return leftTime < rightTime ? -1 : 1;
  }

  const leftTime = scoreValue(left?.time);
  const rightTime = scoreValue(right?.time);
  if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
  const leftEchoes = scoreValue(left?.echoes);
  const rightEchoes = scoreValue(right?.echoes);
  if (leftEchoes === rightEchoes) return 0;
  return leftEchoes < rightEchoes ? -1 : 1;
}

export function sortCompletionRecords(records = []) {
  return Array.isArray(records) ? [...records].sort(compareCompletionRecords) : [];
}

function recordsForWorld(records, world) {
  const targetWorld = worldKey(world);
  if (!targetWorld || !Array.isArray(records)) return [];
  return records.filter((record) => isRankableRecord(record) && worldKey(record.world) === targetWorld);
}

function normalizeLimit(limit) {
  const numeric = Number(limit);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 5;
}

export function getWorldTopRecords(records, world, limit = 5) {
  return sortCompletionRecords(recordsForWorld(records, world)).slice(0, normalizeLimit(limit));
}

export function getTopRecordsByWorld(records, limit = 5) {
  const grouped = {};
  if (!Array.isArray(records)) return grouped;
  for (const record of records) {
    if (!isRankableRecord(record)) continue;
    const key = worldKey(record.world);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(record);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key] = sortCompletionRecords(grouped[key]).slice(0, normalizeLimit(limit));
  }
  return grouped;
}

export function getWorldRank(records, world, currentRecord) {
  if (!isRankableRecord({ ...currentRecord, world })) return null;
  const betterRecords = recordsForWorld(records, world)
    .filter((record) => compareCompletionRecords(record, currentRecord) < 0);
  return betterRecords.length + 1;
}

export function getWorldLeaderboard(records, world, currentRecord = null, limit = 5) {
  const worldRecords = recordsForWorld(records, world);
  return {
    world: worldKey(world),
    top: sortCompletionRecords(worldRecords).slice(0, normalizeLimit(limit)),
    rank: currentRecord == null ? null : getWorldRank(worldRecords, world, currentRecord),
    total: worldRecords.length,
  };
}
