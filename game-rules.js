export const MAX_CLONES = 10;

export function canEscape(status = {}) {
  const candidate = status && typeof status === "object" ? status : {};
  return candidate.hasKey === true;
}

export function canCreateClone(count) {
  const numeric = Number(count);
  return Number.isFinite(numeric) && numeric >= 0 && Math.floor(numeric) < MAX_CLONES;
}
