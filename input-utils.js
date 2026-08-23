export function projectAnalogStick(clientX, clientY, rect, options = {}) {
  const deadzone = Math.max(0, Math.min(0.9, options.deadzone ?? 0.14));
  const knobRadius = Math.max(0, options.knobRadius ?? 24);
  const padding = Math.max(0, options.padding ?? 6);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const rawX = clientX - centerX;
  const rawY = clientY - centerY;
  const rawDistance = Math.hypot(rawX, rawY);
  const maxRadius = Math.max(1, Math.min(rect.width, rect.height) / 2 - knobRadius - padding);
  const unitX = rawDistance > 0 ? rawX / rawDistance : 0;
  const unitY = rawDistance > 0 ? rawY / rawDistance : 0;
  const clampedDistance = Math.min(rawDistance, maxRadius);
  const rawMagnitude = clampedDistance / maxRadius;
  const magnitude = rawMagnitude <= deadzone ? 0 : (rawMagnitude - deadzone) / (1 - deadzone);

  return {
    x: unitX * magnitude,
    y: unitY * magnitude,
    magnitude,
    knobX: unitX * clampedDistance,
    knobY: unitY * clampedDistance,
    maxRadius,
  };
}

export function describeAnalogStick(x, y, magnitude, language = "ko") {
  const code = ["ko", "en", "ja"].includes(String(language).slice(0, 2).toLowerCase())
    ? String(language).slice(0, 2).toLowerCase()
    : "ko";
  const labels = {
    ko: { center: "중앙 · 정지", right: "오른쪽", left: "왼쪽", down: "아래", up: "위", move: "이동" },
    en: { center: "Center · stopped", right: "right", left: "left", down: "down", up: "up", move: "moving" },
    ja: { center: "中央 · 停止", right: "右", left: "左", down: "下", up: "上", move: "移動" },
  }[code];
  if (magnitude <= 0.01) return labels.center;
  const nx = x / magnitude;
  const ny = y / magnitude;
  const horizontal = nx > 0.28 ? labels.right : nx < -0.28 ? labels.left : "";
  const vertical = ny > 0.28 ? labels.down : ny < -0.28 ? labels.up : "";
  const direction = [vertical, horizontal].filter(Boolean).join(" ") || labels.move;
  return `${direction} · ${Math.round(magnitude * 100)}%`;
}
