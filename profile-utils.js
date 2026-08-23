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

function scoreValue(value) {
  if (value == null || value === "" || typeof value === "boolean") return Number.POSITIVE_INFINITY;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : Number.POSITIVE_INFINITY;
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
