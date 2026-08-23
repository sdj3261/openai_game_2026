export const MAX_CLONES = 10;

export const STAGE_NINE_EFFECTS = Object.freeze({
  blackoutStartMs: 3500,
  blackoutPeakMs: 4000,
  blackoutEndMs: 4500,
  blackoutOpacity: 0.22,
  reducedBlackoutOpacity: 0.08,
  doorOpenShake: 6,
  bossAlertShake: 10,
});

function isStageNine(levelCode) {
  const numeric = Number(levelCode);
  return Number.isFinite(numeric) && numeric === 9;
}

export function stageNineBlackoutOpacity(options = {}) {
  const candidate = options && typeof options === "object" ? options : {};
  if (!isStageNine(candidate.levelCode)) return 0;
  const time = Number(candidate.loopElapsedMs);
  if (!Number.isFinite(time) || time <= STAGE_NINE_EFFECTS.blackoutStartMs || time >= STAGE_NINE_EFFECTS.blackoutEndMs) return 0;
  const duration = STAGE_NINE_EFFECTS.blackoutEndMs - STAGE_NINE_EFFECTS.blackoutStartMs;
  const progress = (time - STAGE_NINE_EFFECTS.blackoutStartMs) / duration;
  const envelope = Math.sin(Math.PI * progress) ** 2;
  const peak = candidate.reducedMotion
    ? STAGE_NINE_EFFECTS.reducedBlackoutOpacity
    : STAGE_NINE_EFFECTS.blackoutOpacity;
  return peak * envelope;
}

export function stageNineEventShakeIntensity(options = {}) {
  const candidate = options && typeof options === "object" ? options : {};
  if (!isStageNine(candidate.levelCode) || candidate.reducedMotion) return 0;
  if (candidate.event === "door-open") return STAGE_NINE_EFFECTS.doorOpenShake;
  if (candidate.event === "boss-alert") return STAGE_NINE_EFFECTS.bossAlertShake;
  return 0;
}

export function stageNineShakeOffset(options = {}) {
  const candidate = options && typeof options === "object" ? options : {};
  const time = Number(candidate.loopElapsedMs);
  const intensity = Number(candidate.intensity);
  if (
    !isStageNine(candidate.levelCode)
    || candidate.reducedMotion
    || !Number.isFinite(time)
    || !Number.isFinite(intensity)
    || intensity <= 0
  ) {
    return { x: 0, y: 0 };
  }
  return {
    x: Math.sin(time * 0.035) * intensity * 0.48,
    y: Math.cos(time * 0.047 + 0.8) * intensity * 0.36,
  };
}

export function canEscape(status = {}) {
  const candidate = status && typeof status === "object" ? status : {};
  return candidate.hasKey === true;
}

export function canCreateClone(count) {
  const numeric = Number(count);
  return Number.isFinite(numeric) && numeric >= 0 && Math.floor(numeric) < MAX_CLONES;
}

export function canCollectTeamKey(status = {}) {
  const candidate = status && typeof status === "object" ? status : {};
  const distance = Number(candidate.distance);
  const pickupRadius = Number(candidate.pickupRadius ?? 29);
  return candidate.alreadyCollected !== true
    && Number.isFinite(distance)
    && Number.isFinite(pickupRadius)
    && pickupRadius > 0
    && distance < pickupRadius;
}
