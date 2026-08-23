const SIDES = Object.freeze(["bottom", "top", "right", "left"]);

export function normalizeRect(rect) {
  if (!rect) return { x: 0, y: 0, w: 0, h: 0 };
  return {
    x: Number(rect.x) || 0,
    y: Number(rect.y) || 0,
    w: Math.max(0, Number(rect.w) || 0),
    h: Math.max(0, Number(rect.h) || 0),
  };
}

export function rectsOverlap(first, second, clearance = 0) {
  const a = normalizeRect(first);
  const b = normalizeRect(second);
  return a.x < b.x + b.w + clearance
    && a.x + a.w + clearance > b.x
    && a.y < b.y + b.h + clearance
    && a.y + a.h + clearance > b.y;
}

export function rectFullyInsideBounds(rect, bounds, inset = 0) {
  const subject = normalizeRect(rect);
  const frame = normalizeRect(bounds);
  const safeInset = Math.max(0, Number(inset) || 0);
  return subject.x >= frame.x + safeInset
    && subject.y >= frame.y + safeInset
    && subject.x + subject.w <= frame.x + frame.w - safeInset
    && subject.y + subject.h <= frame.y + frame.h - safeInset;
}

function overlapArea(first, second, clearance = 0) {
  const a = normalizeRect(first);
  const b = normalizeRect(second);
  const overlapWidth = Math.min(a.x + a.w, b.x + b.w + clearance) - Math.max(a.x, b.x - clearance);
  const overlapHeight = Math.min(a.y + a.h, b.y + b.h + clearance) - Math.max(a.y, b.y - clearance);
  return Math.max(0, overlapWidth) * Math.max(0, overlapHeight);
}

function centerCandidate(side, objectRect, width, height, gap, offset = 0) {
  const object = normalizeRect(objectRect);
  const centerX = object.x + object.w / 2;
  const centerY = object.y + object.h / 2;
  if (side === "top") return { x: centerX + offset, y: object.y - gap - height / 2 };
  if (side === "right") return { x: object.x + object.w + gap + width / 2, y: centerY + offset };
  if (side === "left") return { x: object.x - gap - width / 2, y: centerY + offset };
  return { x: centerX + offset, y: object.y + object.h + gap + height / 2 };
}

function clampCenter(candidate, width, height, bounds) {
  const normalizedBounds = normalizeRect(bounds);
  const minX = normalizedBounds.x + width / 2;
  const maxX = normalizedBounds.x + normalizedBounds.w - width / 2;
  const minY = normalizedBounds.y + height / 2;
  const maxY = normalizedBounds.y + normalizedBounds.h - height / 2;
  return {
    x: Math.max(minX, Math.min(maxX, candidate.x)),
    y: Math.max(minY, Math.min(maxY, candidate.y)),
  };
}

/**
 * Places a centered plaque beside its object. Candidates are tried in the
 * caller's semantic order, then nudged along the same edge. The winning box
 * always stays inside bounds and favors clear floor over short travel.
 */
export function placeCanvasLabel({
  objectRect,
  width,
  height,
  bounds,
  obstacles = [],
  occupied = [],
  preferredSides = SIDES,
  gap = 7,
  clearance = 2,
}) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const object = normalizeRect(objectRect);
  const order = [...new Set([...preferredSides, ...SIDES])].filter((side) => SIDES.includes(side));
  const avoid = [object, ...obstacles.map(normalizeRect), ...occupied.map(normalizeRect)];
  const candidates = [];

  order.forEach((side, sideIndex) => {
    const along = side === "top" || side === "bottom" ? safeWidth : safeHeight;
    const offsets = [0, -along * 0.55, along * 0.55, -along * 1.1, along * 1.1];
    offsets.forEach((offset, offsetIndex) => {
      const raw = centerCandidate(side, object, safeWidth, safeHeight, gap, offset);
      const center = clampCenter(raw, safeWidth, safeHeight, bounds);
      const rect = { x: center.x - safeWidth / 2, y: center.y - safeHeight / 2, w: safeWidth, h: safeHeight };
      const overlaps = avoid.filter((obstacle) => rectsOverlap(rect, obstacle, clearance));
      const collisionArea = overlaps.reduce((total, obstacle) => total + overlapArea(rect, obstacle, clearance), 0);
      const clampTravel = Math.hypot(center.x - raw.x, center.y - raw.y);
      candidates.push({
        ...center,
        rect,
        side,
        score: overlaps.length * 1_000_000 + collisionArea * 1_000 + clampTravel * 20 + sideIndex * 5_000 + offsetIndex * 25,
      });
    });
  });

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
}
