const EPSILON = 1e-9;

export const DEFAULT_PROJECTILE_BOUNDS = Object.freeze({ x: 0, y: 0, w: 1200, h: 700 });

// Speeds are pixels per second. Timing values use milliseconds so callers can
// compare them directly with game.js's loopElapsed clock.
export const PROJECTILE_PROFILES = Object.freeze({
  arrow: Object.freeze({
    kind: "arrow",
    speed: 520,
    maxRange: 280,
    telegraphMs: 500,
    cooldownMs: 1900,
    lifetimeMs: 750,
    apexHeight: 22,
    radius: 4,
  }),
  net: Object.freeze({
    kind: "net",
    speed: 340,
    maxRange: 210,
    telegraphMs: 650,
    cooldownMs: 2300,
    lifetimeMs: 900,
    apexHeight: 68,
    radius: 10,
  }),
});

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function nonNegativeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  if (numeric < 0) throw new RangeError(`${label} must be non-negative`);
  return numeric;
}

function positiveNumber(value, label) {
  const numeric = finiteNumber(value, label);
  if (numeric <= 0) throw new RangeError(`${label} must be greater than zero`);
  return numeric;
}

function point2(value, label) {
  if (!value || typeof value !== "object") throw new TypeError(`${label} must be a point`);
  return {
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
  };
}

function circle2(value, label) {
  const point = point2(value, label);
  return {
    ...point,
    radius: nonNegativeNumber(value.radius, `${label}.radius`),
  };
}

function aabb2(value, label) {
  const point = point2(value, label);
  return {
    ...point,
    w: nonNegativeNumber(value.w, `${label}.w`),
    h: nonNegativeNumber(value.h, `${label}.h`),
  };
}

function resolveProfile(profileOrOptions) {
  let options;
  if (profileOrOptions == null) {
    options = PROJECTILE_PROFILES.arrow;
  } else if (typeof profileOrOptions === "string") {
    options = PROJECTILE_PROFILES[profileOrOptions];
    if (!options) throw new RangeError(`unknown projectile profile: ${profileOrOptions}`);
  } else if (typeof profileOrOptions === "object") {
    const base = typeof profileOrOptions.kind === "string"
      ? PROJECTILE_PROFILES[profileOrOptions.kind]
      : PROJECTILE_PROFILES.arrow;
    if (profileOrOptions.kind && !base) {
      throw new RangeError(`unknown projectile profile: ${profileOrOptions.kind}`);
    }
    options = { ...base, ...profileOrOptions };
  } else {
    throw new TypeError("projectile profile must be a profile name or options object");
  }

  return {
    kind: String(options.kind || "custom"),
    speed: positiveNumber(options.speed, "profile.speed"),
    maxRange: positiveNumber(options.maxRange, "profile.maxRange"),
    telegraphMs: nonNegativeNumber(options.telegraphMs, "profile.telegraphMs"),
    cooldownMs: nonNegativeNumber(options.cooldownMs, "profile.cooldownMs"),
    lifetimeMs: positiveNumber(options.lifetimeMs, "profile.lifetimeMs"),
    apexHeight: nonNegativeNumber(options.apexHeight, "profile.apexHeight"),
    radius: nonNegativeNumber(options.radius, "profile.radius"),
  };
}

/**
 * Builds immutable launch data aimed at the target snapshot. Targets beyond
 * maxRange are clamped along the same direction. z is a visual height above
 * the ground plane; x/y remain the coordinates used for swept collision.
 */
export function createProjectileLaunch(origin, target, profileOrOptions = "arrow") {
  const start = point2(origin, "origin");
  const requestedTarget = point2(target, "target");
  const profile = resolveProfile(profileOrOptions);
  const deltaX = requestedTarget.x - start.x;
  const deltaY = requestedTarget.y - start.y;
  const requestedDistance = Math.hypot(deltaX, deltaY);
  if (requestedDistance <= EPSILON) throw new RangeError("origin and target must not overlap");

  const distance = Math.min(requestedDistance, profile.maxRange);
  const directionX = deltaX / requestedDistance;
  const directionY = deltaY / requestedDistance;
  const duration = distance / profile.speed;
  const landing = Object.freeze({
    x: start.x + directionX * distance,
    y: start.y + directionY * distance,
  });
  const velocity = Object.freeze({
    x: directionX * profile.speed,
    y: directionY * profile.speed,
    z: (4 * profile.apexHeight) / duration,
  });
  const gravity = (8 * profile.apexHeight) / (duration * duration);

  return Object.freeze({
    kind: profile.kind,
    origin: Object.freeze(start),
    requestedTarget: Object.freeze(requestedTarget),
    landing,
    velocity,
    gravity,
    duration,
    durationMs: duration * 1000,
    distance,
    requestedDistance,
    apexHeight: profile.apexHeight,
    radius: profile.radius,
    lifetimeMs: profile.lifetimeMs,
  });
}

export function calculateLaunchVelocity(origin, target, profileOrOptions = "arrow") {
  return createProjectileLaunch(origin, target, profileOrOptions).velocity;
}

/**
 * Converts the loop's absolute clock into projectile age. A projectile sampled
 * on the same frame it is spawned has age 0, so its first visual/collision
 * position does not change with frame rate.
 */
export function projectileElapsedMs(clockMs, spawnedAtMs) {
  const clock = nonNegativeNumber(clockMs, "clockMs");
  const spawnedAt = nonNegativeNumber(spawnedAtMs, "spawnedAtMs");
  return Math.max(0, clock - spawnedAt);
}

/**
 * Samples an absolute flight time, making the result independent of frame
 * partitioning. Times past landing remain at the landing point with z = 0.
 */
export function projectileFlightPosition(launch, elapsedSeconds) {
  if (!launch || typeof launch !== "object") throw new TypeError("launch must be launch data");
  const origin = point2(launch.origin, "launch.origin");
  const velocity = point2(launch.velocity, "launch.velocity");
  const velocityZ = finiteNumber(launch.velocity?.z, "launch.velocity.z");
  const gravity = nonNegativeNumber(launch.gravity, "launch.gravity");
  const duration = positiveNumber(launch.duration, "launch.duration");
  const elapsed = nonNegativeNumber(elapsedSeconds, "elapsedSeconds");
  const time = Math.min(elapsed, duration);
  const progress = time / duration;

  return {
    x: origin.x + velocity.x * time,
    y: origin.y + velocity.y * time,
    z: Math.max(0, velocityZ * time - 0.5 * gravity * time * time),
    progress,
    landed: elapsed >= duration,
  };
}

function hitResult(start, end, t, normal) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  return {
    t,
    point: { x: start.x + deltaX * t, y: start.y + deltaY * t },
    normal,
    distance: Math.hypot(deltaX, deltaY) * t,
  };
}

/** Returns the first swept point/circle hit on the closed segment, or null. */
export function segmentCircleHit(from, to, circle, projectileRadius = 0) {
  const start = point2(from, "from");
  const end = point2(to, "to");
  const target = circle2(circle, "circle");
  const sweepRadius = nonNegativeNumber(projectileRadius, "projectileRadius");
  const radius = target.radius + sweepRadius;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const offsetX = start.x - target.x;
  const offsetY = start.y - target.y;
  const startDistanceSquared = offsetX * offsetX + offsetY * offsetY;

  if (startDistanceSquared <= radius * radius + EPSILON) {
    const length = Math.hypot(offsetX, offsetY);
    const normal = length > EPSILON
      ? { x: offsetX / length, y: offsetY / length }
      : { x: 0, y: 0 };
    return hitResult(start, end, 0, normal);
  }

  const a = deltaX * deltaX + deltaY * deltaY;
  if (a <= EPSILON) return null;
  const b = 2 * (offsetX * deltaX + offsetY * deltaY);
  const c = startDistanceSquared - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) return null;

  const root = Math.sqrt(Math.max(0, discriminant));
  const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  const t = candidates.find((candidate) => candidate >= -EPSILON && candidate <= 1 + EPSILON);
  if (t == null) return null;
  const clampedT = Math.max(0, Math.min(1, t));
  const point = {
    x: start.x + deltaX * clampedT,
    y: start.y + deltaY * clampedT,
  };
  const normalX = point.x - target.x;
  const normalY = point.y - target.y;
  const normalLength = Math.hypot(normalX, normalY);
  const normal = normalLength > EPSILON
    ? { x: normalX / normalLength, y: normalY / normalLength }
    : { x: 0, y: 0 };
  return hitResult(start, end, clampedT, normal);
}

/**
 * Returns the first swept point/AABB hit. projectileRadius expands the AABB,
 * which is the conservative Minkowski test wanted for fast game projectiles.
 */
export function segmentAabbHit(from, to, rect, projectileRadius = 0) {
  const start = point2(from, "from");
  const end = point2(to, "to");
  const box = aabb2(rect, "rect");
  const sweepRadius = nonNegativeNumber(projectileRadius, "projectileRadius");
  const minimum = { x: box.x - sweepRadius, y: box.y - sweepRadius };
  const maximum = { x: box.x + box.w + sweepRadius, y: box.y + box.h + sweepRadius };
  const delta = { x: end.x - start.x, y: end.y - start.y };

  if (start.x >= minimum.x && start.x <= maximum.x
      && start.y >= minimum.y && start.y <= maximum.y) {
    return hitResult(start, end, 0, { x: 0, y: 0 });
  }

  let entry = 0;
  let exit = 1;
  let entryNormal = { x: 0, y: 0 };
  for (const axis of ["x", "y"]) {
    if (Math.abs(delta[axis]) <= EPSILON) {
      if (start[axis] < minimum[axis] || start[axis] > maximum[axis]) return null;
      continue;
    }

    let near = (minimum[axis] - start[axis]) / delta[axis];
    let far = (maximum[axis] - start[axis]) / delta[axis];
    let nearSign = -1;
    if (near > far) {
      [near, far] = [far, near];
      nearSign = 1;
    }
    if (near > entry) {
      entry = near;
      entryNormal = axis === "x" ? { x: nearSign, y: 0 } : { x: 0, y: nearSign };
    }
    exit = Math.min(exit, far);
    if (entry - exit > EPSILON) return null;
  }

  if (entry < -EPSILON || entry > 1 + EPSILON || exit < -EPSILON) return null;
  return hitResult(start, end, Math.max(0, Math.min(1, entry)), entryNormal);
}

/**
 * Tests a full movement segment and returns its earliest collision. A wall wins
 * an exact-time tie so a target touching the far side of a wall stays blocked.
 */
export function firstSweptCollision(from, to, options = {}) {
  if (!options || typeof options !== "object") throw new TypeError("options must be an object");
  const start = point2(from, "from");
  const end = point2(to, "to");
  const walls = options.walls ?? [];
  const targets = options.targets ?? [];
  if (!Array.isArray(walls)) throw new TypeError("options.walls must be an array");
  if (!Array.isArray(targets)) throw new TypeError("options.targets must be an array");
  const projectileRadius = nonNegativeNumber(options.projectileRadius ?? 0, "options.projectileRadius");
  let best = null;

  const consider = (hit, kind, collider, index, priority) => {
    if (!hit) return;
    if (!best || hit.t < best.t - EPSILON
        || (Math.abs(hit.t - best.t) <= EPSILON && priority < best.priority)) {
      best = { ...hit, kind, collider, index, priority };
    }
  };

  walls.forEach((wall, index) => {
    consider(segmentAabbHit(start, end, wall, projectileRadius), "wall", wall, index, 0);
  });
  targets.forEach((target, index) => {
    consider(segmentCircleHit(start, end, target, projectileRadius), "target", target, index, 1);
  });

  if (!best) return null;
  const { priority: _priority, ...result } = best;
  return result;
}

export function isOutsideBounds(point, bounds = DEFAULT_PROJECTILE_BOUNDS, padding = 0) {
  const position = point2(point, "point");
  const box = aabb2(bounds, "bounds");
  const safePadding = nonNegativeNumber(padding, "padding");
  return position.x < box.x - safePadding
    || position.x > box.x + box.w + safePadding
    || position.y < box.y - safePadding
    || position.y > box.y + box.h + safePadding;
}

export function isProjectileLifetimeExpired(ageMs, lifetimeMs) {
  const age = nonNegativeNumber(ageMs, "ageMs");
  const lifetime = positiveNumber(lifetimeMs, "lifetimeMs");
  return age >= lifetime;
}

export function shouldRemoveProjectile(projectile, bounds = DEFAULT_PROJECTILE_BOUNDS, padding = 0) {
  if (!projectile || typeof projectile !== "object") throw new TypeError("projectile must be an object");
  const position = projectile.position ?? projectile;
  const outside = isOutsideBounds(position, bounds, padding);
  const expired = isProjectileLifetimeExpired(projectile.ageMs, projectile.lifetimeMs);
  return expired || outside;
}
