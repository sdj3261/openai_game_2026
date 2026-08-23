const ASSET_VERSION = "0.11.0";

function loadImage(path) {
  const image = new Image();
  image.decoding = "async";
  image.src = `${path}?v=${ASSET_VERSION}`;
  return image;
}

const DUCK_DIRECTIONS = ["down", "left", "right", "up"];

export const DUCK_SPRITES = Object.freeze(Object.fromEntries(
  DUCK_DIRECTIONS.map((direction) => [
    direction,
    Object.freeze(Array.from({ length: 4 }, (_, index) => loadImage(`assets/sprites/duck-player/${direction}/walk-${index + 1}.png`))),
  ]),
));

export const GUARD_ROLE_BY_TYPE = Object.freeze({
  sleepy: "club",
  listener: "listener",
  watcher: "archer",
  scanner: "searchlight",
  chaser: "netgun",
  elite: "captain",
});

export const GUARD_SPRITES = Object.freeze(Object.fromEntries(
  [...new Set(Object.values(GUARD_ROLE_BY_TYPE))].map((role) => [
    role,
    Object.freeze(Array.from({ length: 4 }, (_, index) => loadImage(`assets/sprites/toy-guards/${role}/idle-${index + 1}.png`))),
  ]),
));

export function imageReady(image) {
  return Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

export function duckDirection(angle) {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  if (Math.abs(x) > Math.abs(y)) return x >= 0 ? "right" : "left";
  return y >= 0 ? "down" : "up";
}

export function duckSpriteFor(angle, timeMs, animate = true) {
  const direction = duckDirection(angle);
  const frame = animate ? Math.floor(Math.max(0, timeMs) / 125) % 4 : 0;
  return DUCK_SPRITES[direction][frame];
}

export function guardSpriteFor(type, angle) {
  const role = GUARD_ROLE_BY_TYPE[type] || GUARD_ROLE_BY_TYPE.sleepy;
  const frames = GUARD_SPRITES[role];
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const frame = Math.abs(x) > Math.abs(y)
    ? (x >= 0 ? 1 : 2)
    : (y >= 0 ? 0 : 3);
  return frames[frame];
}

export const SPRITE_ASSET_PATHS = Object.freeze([
  ...DUCK_DIRECTIONS.flatMap((direction) => Array.from({ length: 4 }, (_, index) => `assets/sprites/duck-player/${direction}/walk-${index + 1}.png`)),
  ...[...new Set(Object.values(GUARD_ROLE_BY_TYPE))].flatMap((role) => Array.from({ length: 4 }, (_, index) => `assets/sprites/toy-guards/${role}/idle-${index + 1}.png`)),
]);
