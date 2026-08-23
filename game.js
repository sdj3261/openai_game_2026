import { describeAnalogStick, projectAnalogStick } from "./input-utils.js?v=0.11.0";
import {
  DEFAULT_PROFILE,
  LEGACY_DEFAULT_PROFILE_NAME,
  PROFILE_COLORS,
  PROFILE_FACES,
  STEALTH_GRADE_THRESHOLDS,
  calculateStealthScore,
  compareCompletionRecords,
  getWorldLeaderboard,
  getWorldTopRecords,
  normalizeProfile,
  normalizeProfileName,
  prepareStoredProfile,
  serializeStoredProfile,
} from "./profile-utils.js?v=0.11.0";
import { LANGUAGES, resolveLanguage, t } from "./i18n.js?v=0.11.0";
import { MAX_CLONES, canCreateClone, canEscape } from "./game-rules.js?v=0.11.0";
import { duckSpriteFor, guardSpriteFor, imageReady } from "./sprite-assets.js?v=0.11.0";
import { placeCanvasLabel, rectFullyInsideBounds } from "./label-layout.js?v=0.11.0";
import {
  PROJECTILE_PROFILES,
  createProjectileLaunch,
  firstSweptCollision,
  projectileElapsedMs,
  projectileFlightPosition,
  shouldRemoveProjectile,
} from "./projectile-utils.js?v=0.11.0";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const ui = {
  overlay: document.querySelector("#overlay"),
  stageName: document.querySelector("#stageName"),
  objective: document.querySelector("#objective"),
  loopCount: document.querySelector("#loopCount"),
  echoCount: document.querySelector("#echoCount"),
  timer: document.querySelector("#timer"),
  loopLabel: document.querySelector("#loopLabel"),
  echoLabel: document.querySelector("#echoLabel"),
  timeLabel: document.querySelector("#timeLabel"),
  brandText: document.querySelector("#brandText"),
  alertLabel: document.querySelector("#alertLabel"),
  noiseActionLabel: document.querySelector("#noiseActionLabel"),
  cloneActionLabel: document.querySelector("#cloneActionLabel"),
  restartActionLabel: document.querySelector("#restartActionLabel"),
  undoActionLabel: document.querySelector("#undoActionLabel"),
  mapActionLabel: document.querySelector("#mapActionLabel"),
  muteActionLabel: document.querySelector("#muteActionLabel"),
  desktopMoveLabel: document.querySelector("#desktopMoveLabel"),
  desktopClickLabel: document.querySelector("#desktopClickLabel"),
  desktopNoiseLabel: document.querySelector("#desktopNoiseLabel"),
  desktopCloneLabel: document.querySelector("#desktopCloneLabel"),
  alertMeter: document.querySelector("#alertMeter"),
  alertFill: document.querySelector("#alertFill"),
  toast: document.querySelector("#toast"),
  soundCaption: document.querySelector("#soundCaption"),
  gameState: document.querySelector("#gameState"),
  touchActions: [...document.querySelectorAll("[data-game-action]")],
  virtualStick: document.querySelector("#virtualStick"),
  virtualStickKnob: document.querySelector("#virtualStickKnob"),
};

const W = 1200;
const H = 700;
const LOOP_DURATION = 8000;
const SAMPLE_INTERVAL = 1000 / 30;
const PLAYER_SPEED = 260;
const PLAYER_RADIUS = 16;
const MAX_ECHOES = MAX_CLONES;
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const ECHO_COLORS = [
  { body: "#2878ff", trim: "#bfe1ff" },
  { body: "#a855f7", trim: "#f0d5ff" },
  { body: "#10b981", trim: "#c7ffe9" },
  { body: "#ff7a33", trim: "#ffe0bd" },
  { body: "#f43f8f", trim: "#ffd0e4" },
  { body: "#00b8d4", trim: "#c5f7ff" },
  { body: "#f6b91a", trim: "#fff1b8" },
  { body: "#ef4444", trim: "#ffd0d0" },
  { body: "#84cc16", trim: "#e8ffc2" },
  { body: "#5b5ff0", trim: "#d9dcff" },
];

const GUARD_ARCHETYPES = {
  sleepy: { label: "몽둥이 순찰병", symbol: "●", sprite: "club", weapon: "club", visionStyle: "patrol", captureFx: "swing", color: "#d94b5b", speed: 65, range: 180, hearing: 240, fov: 0.82, detectRate: 0.85 },
  listener: { label: "호루라기 청음병", symbol: "♪", sprite: "listener", weapon: "whistle", visionStyle: "hearing", captureFx: "whistle", color: "#e65f45", speed: 90, range: 215, hearing: 700, fov: 1.05, detectRate: 1.0 },
  watcher: { label: "장난감 궁수", symbol: "➶", sprite: "archer", weapon: "bow", visionStyle: "aim", captureFx: "arrow", color: "#b83f65", speed: 72, range: 250, hearing: 260, fov: 1.5, detectRate: 1.15 },
  scanner: { label: "탐조등 감시병", symbol: "☀", sprite: "searchlight", weapon: "searchlight", visionStyle: "scanner", captureFx: "flash", color: "#7c4dcc", speed: 0, range: 235, hearing: 0, fov: 0.72, detectRate: 0.7, rotationSpeed: 0.42 },
  chaser: { label: "그물총 추격병", symbol: "⊕", sprite: "netgun", weapon: "netgun", visionStyle: "chase", captureFx: "net", color: "#e23b54", speed: 122, range: 180, hearing: 500, fov: 0.76, detectRate: 1.25 },
  elite: { label: "경비대장", symbol: "★", sprite: "captain", weapon: "baton", visionStyle: "elite", captureFx: "command", color: "#852d58", speed: 110, range: 270, hearing: 480, fov: 1.28, detectRate: 1.3 },
};

const THEMES = {
  museum: { id: "museum", location: "태엽 박물관", floor: "#eadcb9", glow: "#f7ebcc", grid: "#c8ad7c", wall: "#6480a8", wallDark: "#354c70", accent: "#247fb8" },
  warehouse: { id: "warehouse", location: "장난감 기어 공장", floor: "#e6c58e", glow: "#f4dcae", grid: "#b88945", wall: "#397a73", wallDark: "#234e4b", accent: "#c95b2b" },
  casino: { id: "casino", location: "캔디 아케이드", floor: "#dfc5e6", glow: "#edd9f2", grid: "#af86bd", wall: "#7b426d", wallDark: "#472642", accent: "#b98218" },
  lab: { id: "lab", location: "구름 연구실", floor: "#cde8d8", glow: "#e5f7ee", grid: "#86b9a7", wall: "#3e8178", wallDark: "#24534f", accent: "#167d91" },
  station: { id: "station", location: "달빛 역", floor: "#c5daf2", glow: "#e3effb", grid: "#87a8cf", wall: "#596da9", wallDark: "#33436f", accent: "#dc5c72" },
  castle: { id: "castle", location: "거울 성", floor: "#e0d2f0", glow: "#f0e7fa", grid: "#aa90ca", wall: "#705aa3", wallDark: "#3f356b", accent: "#e2598d" },
  vault: { id: "vault", location: "왕실 금고", floor: "#f0dca9", glow: "#fff0c7", grid: "#c49b52", wall: "#9b623f", wallDark: "#593827", accent: "#a84558" },
  clocktower: { id: "clocktower", location: "자정 시계탑", floor: "#d8c9c2", glow: "#efe1d9", grid: "#a98b8b", wall: "#78394e", wallDark: "#452335", accent: "#bc3159" },
  inferno: { id: "inferno", location: "불타는 지옥 성채", floor: "#3a2026", glow: "#57262b", grid: "#8f3930", wall: "#8b2d24", wallDark: "#351419", accent: "#ff7138" },
};

const KEY_TYPES = Object.freeze({
  clockwork: Object.freeze({ nameKey: "treasureClockwork", value: 300, palette: Object.freeze({ main: "#30d5f2", dark: "#177dcc", light: "#d9fbff", accent: "#7d6cf2" }) }),
  amber: Object.freeze({ nameKey: "treasureAmber", value: 400, palette: Object.freeze({ main: "#f4a340", dark: "#b45d26", light: "#fff0b8", accent: "#dd6b35" }) }),
  candyRuby: Object.freeze({ nameKey: "treasureCandyRuby", value: 500, palette: Object.freeze({ main: "#ff537f", dark: "#bd275d", light: "#ffd4e2", accent: "#b84be3" }) }),
  cloudSapphire: Object.freeze({ nameKey: "treasureCloudSapphire", value: 600, palette: Object.freeze({ main: "#4fa5ff", dark: "#315fc7", light: "#d9f2ff", accent: "#68d7e8" }) }),
  moonPearl: Object.freeze({ nameKey: "treasureMoonPearl", value: 700, palette: Object.freeze({ main: "#d9d7ff", dark: "#7874c7", light: "#ffffff", accent: "#8bc9ff" }) }),
  mirrorOpal: Object.freeze({ nameKey: "treasureMirrorOpal", value: 800, palette: Object.freeze({ main: "#65e1cb", dark: "#347f9c", light: "#e4fff7", accent: "#b869ee" }) }),
  crownEmerald: Object.freeze({ nameKey: "treasureCrownEmerald", value: 900, palette: Object.freeze({ main: "#39cf7a", dark: "#187b52", light: "#d7ffe4", accent: "#ffc857" }) }),
  midnightStar: Object.freeze({ nameKey: "treasureMidnightStar", value: 1200, palette: Object.freeze({ main: "#8f63f2", dark: "#452b9e", light: "#ede2ff", accent: "#ffd166" }) }),
  inferno: Object.freeze({ nameKey: "treasureInferno", value: 1500, palette: Object.freeze({ main: "#ff7138", dark: "#9e241e", light: "#fff0bd", accent: "#ffd166" }) }),
});

const ITEM_TYPES = Object.freeze({
  time: Object.freeze({ nameKey: "itemTimeGear", main: "#4f8cff", dark: "#2656a8", light: "#d9efff", duration: 1500, score: 150 }),
  shield: Object.freeze({ nameKey: "itemRadarShield", main: "#39c99a", dark: "#157963", light: "#d9fff1", charges: 1, score: 250 }),
  bonus: Object.freeze({ nameKey: "itemBonusShard", main: "#ffc857", dark: "#b96b22", light: "#fff2b8", score: 400 }),
});

const levels = [
  {
    code: "01",
    difficulty: 1,
    parEchoes: 0,
    theme: THEMES.museum,
    music: { label: "QUIET STEP", groove: "sparse", bpm: 90, root: 220, type: "triangle", steps: [0, null, 3, null, 7, null, 10, null, 7, null, 3, null] },
    start: { x: 100, y: 585 },
    key: { x: 1025, y: 110 },
    keyType: KEY_TYPES.clockwork,
    items: [{ id: "01-bonus", type: "bonus", x: 180, y: 170, score: 300 }],
    exit: { x: 1080, y: 585 },
    plates: [],
    doors: [],
    walls: [
      { x: 300, y: 390, w: 260, h: 40 },
      { x: 570, y: 220, w: 280, h: 40 },
      { x: 850, y: 390, w: 160, h: 40 },
    ],
    guards: [{
      type: "sleepy", x: 720, y: 350,
      waypoints: [{ x: 720, y: 350 }, { x: 1010, y: 350 }, { x: 1010, y: 520 }, { x: 720, y: 520 }],
    }],
  },
  {
    code: "02",
    difficulty: 2,
    parEchoes: 1,
    theme: THEMES.warehouse,
    music: { label: "FACTORY BEAT", groove: "industrial", bpm: 105, root: 110, type: "square", steps: [0, null, 0, 7, null, 3, 0, null, 10, 7, null, 3, 0, null] },
    start: { x: 100, y: 580 },
    key: { x: 1035, y: 120 },
    keyType: KEY_TYPES.amber,
    items: [{ id: "02-shield", type: "shield", x: 250, y: 160 }],
    exit: { x: 1060, y: 585 },
    plates: [{ id: "A", x: 250, y: 145, r: 30 }],
    doors: [{ x: 930, y: 260, w: 30, h: 180, plateId: "A" }],
    walls: [
      { x: 380, y: 210, w: 450, h: 260 },
      { x: 930, y: 55, w: 30, h: 205 },
      { x: 930, y: 440, w: 30, h: 205 },
    ],
    guards: [{
      type: "listener", x: 880, y: 530,
      waypoints: [{ x: 880, y: 530 }, { x: 1060, y: 530 }, { x: 1060, y: 330 }, { x: 880, y: 330 }],
    }],
  },
  {
    code: "03",
    difficulty: 3,
    parEchoes: 1,
    theme: THEMES.casino,
    music: { label: "CASINO BOUNCE", groove: "bounce", bpm: 120, root: 196, type: "square", steps: [0, 3, 7, 10, 7, 3, 0, null, 0, 3, 7, 12, 10, 7, 3, null] },
    start: { x: 100, y: 585 },
    key: { x: 1015, y: 110 },
    keyType: KEY_TYPES.candyRuby,
    items: [{ id: "03-time", type: "time", x: 620, y: 570 }],
    exit: { x: 1080, y: 585 },
    plates: [{ id: "A", x: 235, y: 120, r: 30 }],
    doors: [{ x: 500, y: 260, w: 30, h: 200, plateId: "A" }],
    walls: [
      { x: 500, y: 55, w: 30, h: 205 },
      { x: 500, y: 460, w: 30, h: 185 },
      { x: 690, y: 250, w: 245, h: 32 },
    ],
    guards: [
      { type: "watcher", name: "고정 궁수", x: 760, y: 140, speed: 0, range: 235, fov: 0.9, detectRate: 0.45, waypoints: [{ x: 760, y: 140 }] },
      { type: "sleepy", name: "몽둥이 순찰병", x: 880, y: 540, speed: 68, range: 150, fov: 0.7, detectRate: 0.65, waypoints: [{ x: 880, y: 540 }, { x: 1050, y: 540 }, { x: 1050, y: 470 }, { x: 880, y: 470 }] },
    ],
  },
  {
    code: "04",
    difficulty: 4,
    parEchoes: 2,
    theme: THEMES.lab,
    music: { label: "LAB ALARM", groove: "alarm", bpm: 135, root: 131, type: "sawtooth", steps: [0, null, 7, 3, 10, 7, 12, null, 7, 0, null, 3, 7, 10, 15, 12, 7, null] },
    start: { x: 100, y: 585 },
    key: { x: 1030, y: 115 },
    keyType: KEY_TYPES.cloudSapphire,
    items: [{ id: "04-bonus", type: "bonus", x: 170, y: 555, score: 400 }],
    exit: { x: 1080, y: 500 },
    plates: [{ id: "A", x: 250, y: 115, r: 30 }, { id: "B", x: 590, y: 115, r: 30 }],
    doors: [{ x: 400, y: 260, w: 30, h: 180, plateId: "A" }, { x: 760, y: 260, w: 30, h: 180, plateId: "B" }],
    walls: [
      { x: 400, y: 55, w: 30, h: 205 }, { x: 400, y: 440, w: 30, h: 205 },
      { x: 760, y: 55, w: 30, h: 205 }, { x: 760, y: 440, w: 30, h: 205 },
    ],
    guards: [
      { type: "listener", x: 600, y: 360, speed: 90, hearing: 520, waypoints: [{ x: 600, y: 360 }, { x: 690, y: 360 }, { x: 690, y: 520 }, { x: 480, y: 520 }, { x: 480, y: 360 }] },
      { type: "scanner", name: "회전 탐조등", x: 900, y: 120, angle: 1.57, range: 235, fov: 0.72, detectRate: 0.65, rotationSpeed: 0.42, waypoints: [{ x: 900, y: 120 }] },
    ],
  },
  {
    code: "05",
    difficulty: 5,
    parEchoes: 1,
    theme: THEMES.station,
    music: { label: "NIGHT TRAIN", groove: "bounce", bpm: 150, root: 147, type: "triangle", steps: [0, null, 3, 7, 10, 7, 3, null, 0, 3, 7, 12, 10, 7, 3, 0, -2, 0, 3, null] },
    start: { x: 100, y: 585 },
    key: { x: 1030, y: 110 },
    keyType: KEY_TYPES.moonPearl,
    items: [{ id: "05-time", type: "time", x: 650, y: 155 }],
    exit: { x: 1080, y: 585 },
    plates: [{ id: "A", x: 255, y: 570, r: 30 }],
    doors: [{ x: 520, y: 260, w: 30, h: 180, plateId: "A" }],
    walls: [
      { x: 520, y: 55, w: 30, h: 205 }, { x: 520, y: 440, w: 30, h: 205 },
      { x: 165, y: 300, w: 225, h: 36 }, { x: 720, y: 390, w: 245, h: 36 },
    ],
    guards: [
      { type: "watcher", name: "역무 궁수", x: 355, y: 150, speed: 0, range: 230, fov: 1.2, detectRate: 0.75, waypoints: [{ x: 355, y: 150 }] },
      { type: "listener", name: "호루라기 역무원", x: 640, y: 350, speed: 88, hearing: 560, range: 150, waypoints: [{ x: 640, y: 350 }, { x: 680, y: 350 }, { x: 680, y: 520 }, { x: 580, y: 520 }] },
      { type: "chaser", name: "그물총 추격병", x: 860, y: 520, speed: 135, range: 170, waypoints: [{ x: 860, y: 520 }, { x: 1060, y: 520 }, { x: 1060, y: 330 }, { x: 780, y: 330 }] },
    ],
  },
  {
    code: "06",
    difficulty: 6,
    parEchoes: 2,
    theme: THEMES.castle,
    music: { label: "MIRROR STEP", groove: "alarm", bpm: 165, root: 165, type: "square", steps: [0, 3, 7, 10, 7, 3, 0, null, 2, 5, 9, 12, 9, 5, 2, null, 0, 3, 7, 12, 10, null] },
    start: { x: 100, y: 585 },
    key: { x: 1030, y: 110 },
    keyType: KEY_TYPES.mirrorOpal,
    items: [{ id: "06-shield", type: "shield", x: 640, y: 160 }],
    exit: { x: 1080, y: 585 },
    plates: [{ id: "A", x: 230, y: 115, r: 30 }, { id: "B", x: 600, y: 570, r: 30 }],
    doors: [{ x: 420, y: 250, w: 30, h: 200, plateId: "A" }, { x: 780, y: 250, w: 30, h: 200, plateId: "B" }],
    walls: [
      { x: 420, y: 55, w: 30, h: 195 }, { x: 420, y: 450, w: 30, h: 195 },
      { x: 780, y: 55, w: 30, h: 195 }, { x: 780, y: 450, w: 30, h: 195 },
      { x: 540, y: 300, w: 150, h: 36 },
    ],
    guards: [
      { type: "sleepy", x: 290, y: 350, speed: 78, waypoints: [{ x: 290, y: 350 }, { x: 290, y: 520 }, { x: 150, y: 520 }, { x: 150, y: 350 }] },
      { type: "listener", x: 610, y: 360, speed: 100, hearing: 560, waypoints: [{ x: 610, y: 360 }, { x: 715, y: 360 }, { x: 715, y: 520 }, { x: 500, y: 520 }] },
      { type: "scanner", name: "역회전 탐조등", x: 950, y: 160, angle: 2.2, range: 255, fov: 0.8, detectRate: 0.8, rotationSpeed: -0.48, waypoints: [{ x: 950, y: 160 }] },
    ],
  },
  {
    code: "07",
    difficulty: 7,
    parEchoes: 2,
    theme: THEMES.vault,
    music: { label: "ROYAL RUSH", groove: "alarm", bpm: 180, root: 123, type: "square", steps: [0, 0, 3, 7, 10, 7, 3, 0, 5, 5, 8, 12, 10, 8, 5, 3, 0, 3, 7, 12, 15, 12, 7, null] },
    start: { x: 100, y: 585 },
    key: { x: 1030, y: 110 },
    keyType: KEY_TYPES.crownEmerald,
    items: [{ id: "07-bonus", type: "bonus", x: 650, y: 105, score: 600 }],
    exit: { x: 1080, y: 585 },
    plates: [{ id: "A", x: 220, y: 115, r: 30 }, { id: "B", x: 560, y: 570, r: 30 }],
    doors: [{ x: 360, y: 240, w: 30, h: 220, plateId: "A" }, { x: 730, y: 240, w: 30, h: 220, plateId: "B" }],
    walls: [
      { x: 360, y: 55, w: 30, h: 185 }, { x: 360, y: 460, w: 30, h: 185 },
      { x: 730, y: 55, w: 30, h: 185 }, { x: 730, y: 460, w: 30, h: 185 },
      { x: 465, y: 295, w: 165, h: 38 }, { x: 850, y: 375, w: 180, h: 38 },
    ],
    guards: [
      { type: "watcher", x: 210, y: 330, speed: 60, range: 205, fov: 1.25, detectRate: 1.0, waypoints: [{ x: 210, y: 330 }, { x: 315, y: 330 }, { x: 315, y: 500 }, { x: 150, y: 500 }] },
      { type: "listener", x: 520, y: 390, speed: 90, hearing: 650, waypoints: [{ x: 520, y: 390 }, { x: 670, y: 390 }, { x: 670, y: 520 }, { x: 440, y: 520 }] },
      { type: "chaser", x: 610, y: 150, speed: 145, range: 165, zone: { x: 420, y: 75, w: 270, h: 210 }, waypoints: [{ x: 610, y: 150 }, { x: 670, y: 150 }, { x: 670, y: 250 }, { x: 480, y: 250 }] },
      { type: "elite", name: "왕실 경비대장", x: 930, y: 450, range: 230, detectRate: 1.0, zone: { x: 790, y: 90, w: 300, h: 480 }, waypoints: [{ x: 930, y: 450 }, { x: 1060, y: 450 }, { x: 1060, y: 230 }, { x: 835, y: 230 }] },
    ],
  },
  {
    code: "08",
    difficulty: 8,
    parEchoes: 2,
    theme: THEMES.clocktower,
    music: { label: "CLOCK BOSS", groove: "boss", bpm: 195, root: 98, type: "sawtooth", steps: [0, 0, 3, 7, 0, 10, 7, 3, 0, -2, 0, 3, 7, 12, 10, 7, 3, 0, 5, 8, 12, 15, 12, 8, 3, null] },
    start: { x: 100, y: 585 },
    key: { x: 1030, y: 110 },
    keyType: KEY_TYPES.midnightStar,
    items: [
      { id: "08-time", type: "time", x: 445, y: 550 },
      { id: "08-shield", type: "shield", x: 830, y: 570 },
      { id: "08-bonus", type: "bonus", x: 610, y: 100, score: 800 },
    ],
    exit: { x: 1080, y: 500 },
    plates: [{ id: "A", x: 225, y: 115, r: 30 }, { id: "B", x: 550, y: 570, r: 30 }],
    doors: [{ x: 350, y: 440, w: 30, h: 140, plateId: "A" }, { x: 700, y: 120, w: 30, h: 150, plateId: "B" }],
    walls: [
      { x: 350, y: 55, w: 30, h: 385 }, { x: 350, y: 580, w: 30, h: 65 },
      { x: 700, y: 55, w: 30, h: 65 }, { x: 700, y: 270, w: 30, h: 375 },
    ],
    guards: [
      { type: "watcher", name: "시계탑 궁수", x: 170, y: 250, speed: 72, range: 245, hearing: 0, fov: 1.5, detectRate: 1.15, waypoints: [{ x: 170, y: 250 }, { x: 300, y: 250 }, { x: 300, y: 360 }, { x: 170, y: 360 }] },
      { type: "listener", name: "청음병", x: 500, y: 380, speed: 92, range: 215, hearing: 720, fov: 1.05, detectRate: 1.05, waypoints: [{ x: 500, y: 380 }, { x: 640, y: 380 }, { x: 640, y: 480 }, { x: 430, y: 480 }, { x: 430, y: 380 }] },
      { type: "chaser", x: 550, y: 155, speed: 150, range: 185, hearing: 420, fov: 0.76, detectRate: 1.3, zone: { x: 430, y: 80, w: 175, h: 300 }, waypoints: [{ x: 550, y: 155 }, { x: 575, y: 155 }, { x: 575, y: 260 }, { x: 470, y: 260 }, { x: 470, y: 155 }] },
      { type: "elite", name: "자정 경비대장", boss: true, x: 940, y: 390, speed: 118, range: 280, hearing: 520, fov: 1.35, detectRate: 1.25, zone: { x: 820, y: 80, w: 300, h: 500 }, waypoints: [{ x: 940, y: 390 }, { x: 1080, y: 390 }, { x: 1080, y: 180 }, { x: 850, y: 180 }, { x: 850, y: 390 }] },
    ],
  },
  {
    code: "09",
    difficulty: 9,
    parEchoes: 3,
    theme: THEMES.inferno,
    music: { label: "INFERNO LAST RUN", groove: "boss", bpm: 210, root: 82, type: "sawtooth", steps: [0, 0, 3, 7, 10, 7, 3, 0, -2, 0, 3, 7, 12, 10, 7, 3, 0, 5, 8, 12, 15, 12, 8, 5, 3, 0, -2, null] },
    start: { x: 100, y: 585 },
    key: { x: 1030, y: 110 },
    keyType: KEY_TYPES.inferno,
    items: [
      { id: "09-time", type: "time", x: 250, y: 565 },
      { id: "09-shield", type: "shield", x: 735, y: 565 },
      { id: "09-bonus", type: "bonus", x: 1010, y: 570, score: 1000 },
    ],
    exit: { x: 1080, y: 585 },
    plates: [
      { id: "A", x: 200, y: 115, r: 30 },
      { id: "B", x: 460, y: 115, r: 30 },
      { id: "C", x: 740, y: 115, r: 30 },
    ],
    doors: [
      { x: 320, y: 440, w: 30, h: 140, plateId: "A" },
      { x: 600, y: 120, w: 30, h: 150, plateId: "B" },
      { x: 880, y: 260, w: 30, h: 180, plateId: "C" },
    ],
    walls: [
      { x: 320, y: 55, w: 30, h: 385 }, { x: 320, y: 580, w: 30, h: 65 },
      { x: 600, y: 55, w: 30, h: 65 }, { x: 600, y: 270, w: 30, h: 375 },
      { x: 880, y: 55, w: 30, h: 205 }, { x: 880, y: 440, w: 30, h: 205 },
      { x: 395, y: 330, w: 140, h: 34 },
      { x: 675, y: 390, w: 135, h: 34 },
      { x: 955, y: 300, w: 105, h: 34 },
    ],
    guards: [
      { type: "sleepy", name: "지옥 문지기", x: 190, y: 350, speed: 82, range: 190, fov: 0.9, detectRate: 1.0, zone: { x: 82, y: 72, w: 220, h: 556 }, waypoints: [{ x: 190, y: 350 }, { x: 270, y: 350 }, { x: 270, y: 520 }, { x: 130, y: 520 }] },
      { type: "listener", name: "불꽃 청음병", x: 455, y: 415, speed: 104, range: 220, hearing: 760, fov: 1.1, detectRate: 1.15, zone: { x: 365, y: 72, w: 220, h: 556 }, waypoints: [{ x: 455, y: 415 }, { x: 550, y: 415 }, { x: 550, y: 540 }, { x: 390, y: 540 }] },
      { type: "scanner", name: "용암 탐조등", x: 735, y: 335, angle: 2.2, range: 270, fov: 0.82, detectRate: 0.95, rotationSpeed: 0.6, zone: { x: 645, y: 72, w: 220, h: 556 }, waypoints: [{ x: 735, y: 335 }] },
      { type: "chaser", name: "화염 그물병", x: 800, y: 520, speed: 150, range: 195, hearing: 600, fov: 0.82, detectRate: 1.35, zone: { x: 645, y: 72, w: 220, h: 556 }, waypoints: [{ x: 800, y: 520 }, { x: 840, y: 520 }, { x: 840, y: 210 }, { x: 680, y: 210 }] },
      { type: "elite", name: "지옥 경비대장", boss: true, x: 1015, y: 395, speed: 128, range: 305, hearing: 620, fov: 1.45, detectRate: 1.4, zone: { x: 925, y: 72, w: 193, h: 556 }, waypoints: [{ x: 1015, y: 395 }, { x: 1080, y: 395 }, { x: 1080, y: 190 }, { x: 950, y: 190 }] },
    ],
  },
];

for (const item of levels) {
  const musicDuration = item.music.steps.length * 60000 / item.music.bpm;
  if (Math.abs(musicDuration - LOOP_DURATION) > 1) throw new Error(`WORLD ${item.code} BGM must be exactly 8 seconds`);
}

const STORAGE_KEYS = {
  profile: "eightSecondCrewProfile",
  settings: "eightSecondCrewSettings",
  stats: "eightSecondCrewStats",
  records: "eightSecondCrewRecords",
};

function readLocalJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const savedSettings = readLocalJson(STORAGE_KEYS.settings, {});
let settings = {
  language: resolveLanguage(savedSettings.language || navigator.languages || navigator.language),
  visualSound: savedSettings.visualSound !== false,
  muted: Boolean(savedSettings.muted),
};
const storedProfileResult = prepareStoredProfile(readLocalJson(STORAGE_KEYS.profile, {}));
let profile = storedProfileResult.profile;
let profileNameCustomized = storedProfileResult.nameCustomized;
if (storedProfileResult.changed) writeLocalJson(STORAGE_KEYS.profile, storedProfileResult.storage);
let gameStats = {
  plays: 0,
  clears: 0,
  catches: 0,
  echoes: 0,
  ...readLocalJson(STORAGE_KEYS.stats, {}),
};
let completionRecords = readLocalJson(STORAGE_KEYS.records, []);
if (!Array.isArray(completionRecords)) completionRecords = [];
if (!profileNameCustomized) {
  let migratedRecordName = false;
  completionRecords = completionRecords.map((record) => {
    if (!record || typeof record !== "object" || record.name !== LEGACY_DEFAULT_PROFILE_NAME) return record;
    migratedRecordName = true;
    return { ...record, name: DEFAULT_PROFILE.name };
  });
  if (migratedRecordName) writeLocalJson(STORAGE_KEYS.records, completionRecords);
}
let lastClearResult = null;
let soundCaptionRemaining = 0;

function saveSettings() {
  writeLocalJson(STORAGE_KEYS.settings, settings);
  document.documentElement.lang = settings.language;
  document.body.dataset.visualSound = String(settings.visualSound);
}

function saveStats() {
  writeLocalJson(STORAGE_KEYS.stats, gameStats);
  writeLocalJson(STORAGE_KEYS.records, completionRecords.slice(-120));
}

function localizedStage(item = level) {
  return {
    title: t(settings.language, `stage.${item.code}.title`),
    cue: t(settings.language, `stage.${item.code}.cue`),
    rule: t(settings.language, `stage.${item.code}.rule`),
  };
}

function showSoundCaption(key, source = null) {
  if (!settings.visualSound || !ui.soundCaption) return;
  let arrow = "";
  if (source && player) {
    const dx = source.x - player.x;
    const dy = source.y - player.y;
    if (Math.abs(dx) > 80 || Math.abs(dy) > 80) {
      arrow = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "← " : "→ ") : (dy < 0 ? "↑ " : "↓ ");
    }
  }
  ui.soundCaption.textContent = `[${arrow}${t(settings.language, key)}]`;
  ui.soundCaption.classList.remove("show");
  void ui.soundCaption.offsetWidth;
  ui.soundCaption.classList.add("show");
  soundCaptionRemaining = 1.25;
}

saveSettings();

const keys = new Set();
let audioContext = null;
let muted = settings.muted;
let state = "menu";
let levelIndex = 0;
let level = levels[0];
let player = null;
let echoes = [];
let guards = [];
let plateStates = new Map();
let doorStates = [];
let currentRecord = null;
let loopElapsed = 0;
let loopNumber = 1;
let lastFrame = performance.now();
let sampleAccumulator = 0;
let particles = [];
let noisePulses = [];
let projectiles = [];
let rewindAmount = 0;
let shake = 0;
let flash = 0;
let caughtTimer = 0;
let currentSecond = -1;
let currentMusicStep = -1;
let toastTimer = null;
let stageStartedAt = 0;
let completedLoopElapsed = 0;
let loopLimit = LOOP_DURATION;
let timeBonusCollected = false;
let keyCollected = false;
let keyValueCollected = 0;
let collectedItemIds = new Set();
let itemBonusScore = 0;
let radarShieldCharges = 0;
let radarShieldBlocking = false;
let runRadarHits = 0;
let runRetries = 0;
let wasSeenByAnyGuard = false;
let doorTutorialShown = false;
let unlocked = Math.max(1, Math.min(levels.length, Number(localStorage.getItem("loopHeistUnlocked")) || 1));
let completed = Math.max(0, Math.min(levels.length, Number(localStorage.getItem("loopHeistCompleted")) || 0));
unlocked = Math.max(unlocked, Math.min(levels.length, completed + 1));
// Local-only stage selector for repeatable screenshots and play QA. It never unlocks the public build.
const localQaStage = ["127.0.0.1", "localhost"].includes(location.hostname)
  ? Number(new URLSearchParams(location.search).get("qaStage"))
  : 0;
let moveTarget = null;
let moveTargetStuckFor = 0;
let lastAlertValue = -1;
let countdownRemaining = 0;
let countdownCue = -1;
let goFlashRemaining = 0;
let canvasSizeDirty = true;
let cameraX = W / 2;
let renderView = { scale: 1, offsetX: 0, offsetY: 0, zoomed: false };
let canvasLabels = [];
let canvasLabelRects = [];
const stickInput = { x: 0, y: 0, magnitude: 0, pointerId: null };

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function itemType(item) { return ITEM_TYPES[item?.type] || null; }
function stageLoopLimit() {
  return LOOP_DURATION + (level.items || []).reduce((total, item) => (
    collectedItemIds.has(item.id) && item.type === "time"
      ? total + (Number(item.duration) || itemType(item)?.duration || 0)
      : total
  ), 0);
}
function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function initAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  if (!audioContext) audioContext = new AudioCtor();
  if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
}

function tone(frequency, duration = 0.08, type = "sine", volume = 0.035, delay = 0) {
  if (muted || !audioContext) return;
  const start = audioContext.currentTime + delay;
  const attackEnd = start + Math.min(0.006, duration * 0.2);
  const end = start + duration;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), attackEnd);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.01);
}

function sound(name) {
  const root = level?.music?.root || 110;
  if (name === "loop") {
    tone(root * 2, 0.12, "square", 0.025);
    tone(root, 0.18, "square", 0.018, 0.08);
  } else if (name === "plate") {
    tone(540, 0.09, "square", 0.025);
  } else if (name === "gem") {
    tone(620, 0.08, "sine", 0.05);
    tone(920, 0.18, "sine", 0.04, 0.08);
  } else if (name === "caught") {
    tone(root * 2, 0.12, "square", 0.045);
    tone(root, 0.22, "square", 0.03, 0.08);
    tone(Math.max(48, root / 2), 0.3, "sawtooth", 0.02, 0.18);
  } else if (name === "complete") {
    [0, 4, 7, 12].forEach((note, i) => tone(root * 2 ** (note / 12), 0.16, "square", 0.025, i * 0.08));
  } else if (name === "noise") {
    tone(110, 0.12, "square", 0.04);
  } else if (name === "door") {
    tone(280, 0.13, "sawtooth", 0.025);
  } else if (name === "timeBonus") {
    tone(root * 2, 0.08, "square", 0.028);
    tone(root * 3, 0.13, "square", 0.024, 0.07);
  } else if (name === "arrow") {
    tone(root * 4, 0.035, "square", 0.025);
    tone(root * 2.5, 0.07, "triangle", 0.014, 0.025);
  } else if (name === "net") {
    tone(root * 1.5, 0.07, "square", 0.025);
    tone(root * 0.75, 0.13, "sawtooth", 0.014, 0.04);
  }
}

function chipDrum(kind) {
  if (kind === "kick") {
    tone(62, 0.085, "square", 0.014);
    tone(44, 0.12, "sine", 0.018, 0.018);
  } else if (kind === "snare") {
    tone(180, 0.045, "square", 0.009);
    tone(920, 0.025, "square", 0.005, 0.012);
  } else if (kind === "hat") {
    tone(1650, 0.018, "square", 0.004);
  }
}

function playMusicStep(step) {
  const music = level.music;
  if (!music) return;
  const bossAlert = music.groove === "boss" && guards.some((guard) => guard.boss && (guard.seesCurrent || guard.targetPoint));

  if (music.groove === "sparse") {
    if ([0, 6].includes(step)) chipDrum("kick");
  } else if (music.groove === "industrial") {
    if ([0, 3, 7, 10].includes(step)) chipDrum("kick");
    if ([2, 6, 9, 13].includes(step)) chipDrum("snare");
  } else if (music.groove === "bounce") {
    chipDrum(step % 4 === 0 ? "kick" : step % 4 === 2 ? "snare" : "hat");
  } else if (music.groove === "alarm") {
    if (step % 3 === 0) chipDrum("kick");
    else chipDrum("hat");
  } else if (music.groove === "boss") {
    chipDrum(step % 4 === 2 ? "snare" : step % 2 === 0 ? "kick" : "hat");
  }

  const semitone = music.steps[step % music.steps.length];
  if (semitone == null) return;
  const frequency = music.root * (2 ** (semitone / 12));
  const leadVolume = 0.011 + level.difficulty * 0.0015;
  tone(frequency, music.groove === "boss" ? 0.11 : 0.16, music.type, leadVolume);
  if (step % (level.difficulty >= 4 ? 2 : 4) === 0) {
    tone(Math.max(48, music.root / 2), 0.2, level.difficulty >= 2 ? "square" : "sine", 0.009);
  }
  if (music.groove === "boss" && step >= music.steps.length - 4) {
    tone(frequency * 2, 0.07, "square", 0.006, 0.035);
  }
  if (bossAlert) {
    tone(music.root * 2 ** (6 / 12), 0.055, "square", 0.008, 0.025);
  }
}

function hexToRgbChannels(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean, 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

function applyTheme() {
  const theme = level.theme || THEMES.museum;
  const root = document.documentElement.style;
  root.setProperty("--theme-floor", theme.floor);
  root.setProperty("--theme-glow", theme.glow);
  root.setProperty("--theme-glow-rgb", hexToRgbChannels(theme.glow));
  root.setProperty("--theme-accent", theme.accent);
  root.setProperty("--theme-accent-rgb", hexToRgbChannels(theme.accent));
  document.body.dataset.theme = theme.id;
  document.body.dataset.difficulty = String(level.difficulty);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.floor);
}

function announce(message) {
  ui.gameState.textContent = message;
}

function showToast(message, duration = 1800) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  announce(message);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove("show"), duration);
}

function setOverlay(html, view) {
  ui.overlay.innerHTML = html;
  ui.overlay.dataset.view = view;
  ui.overlay.scrollTop = 0;
  ui.overlay.classList.add("visible");
  ui.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("dialog-open");
  requestAnimationFrame(() => ui.overlay.querySelector("[data-dialog-title]")?.focus({ preventScroll: true }));
}

function hideOverlay() {
  ui.overlay.classList.remove("visible");
  ui.overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("dialog-open");
  canvas.focus({ preventScroll: true });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function avatarMarkup(subject = profile, extraClass = "") {
  const safe = normalizeProfile(subject);
  const faceIndex = Math.max(0, PROFILE_FACES.indexOf(safe.face));
  return `<span class="toy-avatar ${extraClass}" data-face-index="${faceIndex}" style="--avatar-color:${safe.color}" aria-hidden="true"><i>${escapeHtml(safe.face)}</i><b></b></span>`;
}

function formatRecordTime(milliseconds) {
  return `${(Number(milliseconds || 0) / 1000).toFixed(2)}s`;
}

function formatRecordScore(record) {
  return Number.isFinite(Number(record?.score))
    ? Math.max(0, Math.round(Number(record.score))).toLocaleString(settings.language)
    : formatRecordTime(record?.time);
}

function updateStaticTranslations() {
  lastAlertValue = -1;
  document.title = t(settings.language, "gameTitle");
  ui.brandText.textContent = t(settings.language, "gameTitle");
  ui.loopLabel.textContent = t(settings.language, "loop");
  ui.echoLabel.textContent = t(settings.language, "echoName");
  ui.timeLabel.textContent = t(settings.language, "timeLeft");
  ui.noiseActionLabel.textContent = t(settings.language, "noise");
  ui.cloneActionLabel.textContent = t(settings.language, "clone");
  ui.alertLabel.textContent = t(settings.language, "alert");
  ui.restartActionLabel.textContent = t(settings.language, "restart");
  ui.undoActionLabel.textContent = t(settings.language, "undo");
  ui.mapActionLabel.textContent = t(settings.language, "stageMap");
  ui.muteActionLabel.textContent = muted ? t(settings.language, "on") : t(settings.language, "sound");
  ui.desktopMoveLabel.textContent = t(settings.language, "move");
  ui.desktopClickLabel.textContent = t(settings.language, "clickMove");
  ui.desktopNoiseLabel.textContent = t(settings.language, "noise");
  ui.desktopCloneLabel.textContent = t(settings.language, "clone");
  ui.virtualStick?.setAttribute("aria-label", t(settings.language, "joystickHelp"));
  ui.virtualStick?.setAttribute("aria-valuetext", t(settings.language, "centerStopped"));
  document.querySelector(".virtual-stick__label").textContent = t(settings.language, "move");
  document.querySelector(".skip-link").textContent = t(settings.language, "skipGame");
  document.querySelector(".topbar")?.setAttribute("aria-label", t(settings.language, "operationStatus"));
  document.querySelector(".hud-cluster")?.setAttribute("aria-label", t(settings.language, "timelineInfo"));
  canvas.setAttribute("aria-label", t(settings.language, "canvasLabel"));
  canvas.textContent = t(settings.language, "canvasFallback");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t(settings.language, "gameHelp"));
  document.querySelector("#gameHelp").textContent = t(settings.language, "gameHelp");
  ui.alertMeter?.setAttribute("aria-label", t(settings.language, "alertRisk"));
  document.querySelector(".mobile-gamepad")?.setAttribute("aria-label", t(settings.language, "mobileControls"));
  document.querySelector(".mobile-utility-actions")?.setAttribute("aria-label", t(settings.language, "moreControls"));
  document.querySelector('[data-game-action="restart"]')?.setAttribute("aria-label", t(settings.language, "restartLoop"));
  document.querySelector('[data-game-action="undo"]')?.setAttribute("aria-label", t(settings.language, "undoLastEcho"));
  document.querySelector('[data-game-action="menu"]')?.setAttribute("aria-label", t(settings.language, "stageMap"));
  document.querySelector('[data-game-action="mute"]')?.setAttribute("aria-label", t(settings.language, "soundToggle"));
  document.querySelector(".controls")?.setAttribute("aria-label", t(settings.language, "keyboardHelp"));
}

function showProfileOverlay() {
  state = "menu";
  const colorButtons = PROFILE_COLORS.map((color) => `<button class="profile-color ${color === profile.color ? "is-selected" : ""}" type="button" data-profile-color="${color}" style="--swatch:${color}" aria-label="${t(settings.language, "color")} ${color}"></button>`).join("");
  const faceButtons = PROFILE_FACES.map((face, index) => `<button class="profile-face ${face === profile.face ? "is-selected" : ""}" type="button" data-face-index="${index}" data-profile-face="${escapeHtml(face)}">${escapeHtml(face)}</button>`).join("");
  setOverlay(`
    <section class="panel toy-dialog profile-dialog" aria-labelledby="overlayTitle">
      <h2 id="overlayTitle" data-dialog-title tabindex="-1">${t(settings.language, "profile")}</h2>
      <div class="profile-preview" id="profilePreview">${avatarMarkup(profile, "toy-avatar--large")}</div>
      <label class="field-label" for="profileName">${t(settings.language, "name")}</label>
      <input class="toy-input" id="profileName" maxlength="12" autocomplete="nickname" />
      <fieldset class="profile-options"><legend>${t(settings.language, "color")}</legend><div class="profile-colors">${colorButtons}</div></fieldset>
      <fieldset class="profile-options"><legend>${t(settings.language, "face")}</legend><div class="profile-faces">${faceButtons}</div></fieldset>
      <div class="dialog-actions"><button class="toy-button toy-button--primary" id="saveProfile" type="button">${t(settings.language, "save")}</button><button class="toy-button" id="closeProfile" type="button">${t(settings.language, "back")}</button></div>
    </section>
  `, "profile");
  const nameInput = document.querySelector("#profileName");
  nameInput.value = profile.name;
  let selectedColor = profile.color;
  let selectedFace = profile.face;
  const refreshPreview = () => {
    document.querySelector("#profilePreview").innerHTML = avatarMarkup({ name: nameInput.value, color: selectedColor, face: selectedFace }, "toy-avatar--large");
  };
  document.querySelectorAll("[data-profile-color]").forEach((button) => button.addEventListener("click", () => {
    selectedColor = button.dataset.profileColor;
    document.querySelectorAll("[data-profile-color]").forEach((item) => item.classList.toggle("is-selected", item === button));
    refreshPreview();
  }));
  document.querySelectorAll("[data-profile-face]").forEach((button) => button.addEventListener("click", () => {
    selectedFace = button.dataset.profileFace;
    document.querySelectorAll("[data-profile-face]").forEach((item) => item.classList.toggle("is-selected", item === button));
    refreshPreview();
  }));
  nameInput.addEventListener("input", refreshPreview);
  document.querySelector("#saveProfile").addEventListener("click", () => {
    const previousName = profile.name;
    profile = normalizeProfile({ name: nameInput.value, color: selectedColor, face: selectedFace });
    profileNameCustomized ||= profile.name !== previousName;
    writeLocalJson(STORAGE_KEYS.profile, serializeStoredProfile(profile, profileNameCustomized));
    showMenu(levelIndex);
  });
  document.querySelector("#closeProfile").addEventListener("click", () => showMenu(levelIndex));
}

function showSettingsOverlay() {
  state = "menu";
  const languageOptions = LANGUAGES.map(({ code, label }) => `<option value="${code}" ${code === settings.language ? "selected" : ""}>${label}</option>`).join("");
  setOverlay(`
    <section class="panel toy-dialog settings-dialog" aria-labelledby="overlayTitle">
      <h2 id="overlayTitle" data-dialog-title tabindex="-1">${t(settings.language, "settings")}</h2>
      <section class="game-guide" aria-labelledby="gameGuideTitle">
        <h3 id="gameGuideTitle">${t(settings.language, "guide")}</h3>
        <ol class="game-guide__flow">
          <li>${t(settings.language, "ruleRun")}</li>
          <li>${t(settings.language, "gem")}</li>
          <li>${t(settings.language, "open")}</li>
          <li>${t(settings.language, "exit")}</li>
        </ol>
        <p class="game-guide__summary">${t(settings.language, "guideEight")}</p>
        <ul class="game-guide__actions">
          <li><kbd>Z</kbd><span>${t(settings.language, "guideNoise")}</span></li>
          <li><kbd>X</kbd><span>${t(settings.language, "guideClone")}</span></li>
          <li class="is-wide"><b aria-hidden="true">▣</b><span>${t(settings.language, "guideDoor")}</span></li>
        </ul>
        <p class="game-guide__items">${t(settings.language, "guideItems")}</p>
        <p class="game-guide__note">${t(settings.language, "guideScore", { value: level.parEchoes })}</p>
      </section>
      <label class="setting-row" for="languageSetting"><span><b>${t(settings.language, "language")}</b><small>한국어 / English / 日本語</small></span><select class="toy-select" id="languageSetting">${languageOptions}</select></label>
      <label class="setting-row" for="visualSoundSetting"><span><b>${t(settings.language, "visualSound")}</b><small>${t(settings.language, "visualSoundHelp")}</small></span><input id="visualSoundSetting" type="checkbox" ${settings.visualSound ? "checked" : ""} /></label>
      <label class="setting-row" for="soundSetting"><span><b>${t(settings.language, "sound")}</b><small>${t(settings.language, "gameSound")}</small></span><input id="soundSetting" type="checkbox" ${muted ? "" : "checked"} /></label>
      <div class="caption-demo" aria-hidden="true"><span>♪ ${t(settings.language, "sound")}</span><strong>[${t(settings.language, "guardHeard")}]</strong></div>
      <div class="dialog-actions"><button class="toy-button toy-button--primary" id="saveSettings" type="button">${t(settings.language, "save")}</button><button class="toy-button" id="closeSettings" type="button">${t(settings.language, "back")}</button></div>
    </section>
  `, "settings");
  document.querySelector("#saveSettings").addEventListener("click", () => {
    settings = {
      language: resolveLanguage(document.querySelector("#languageSetting").value),
      visualSound: document.querySelector("#visualSoundSetting").checked,
      muted: !document.querySelector("#soundSetting").checked,
    };
    muted = settings.muted;
    saveSettings();
    updateStaticTranslations();
    showMenu(levelIndex);
  });
  document.querySelector("#closeSettings").addEventListener("click", () => showMenu(levelIndex));
}

function showRecordsOverlay(selectedIndex = levelIndex) {
  state = "menu";
  selectedIndex = clamp(selectedIndex, 0, Math.max(0, unlocked - 1));
  const recordLevel = levels[selectedIndex];
  const recordStage = localizedStage(recordLevel);
  const leaderboard = getWorldLeaderboard(completionRecords, recordLevel.code, null, 5);
  const tabs = levels.map((item, index) => `<button class="record-stage-tab ${index === selectedIndex ? "is-current" : ""}" type="button" data-record-stage="${index}" ${index >= unlocked ? "disabled" : ""} aria-label="${t(settings.language, "stage")} ${Number(item.code)}${index >= unlocked ? `, ${t(settings.language, "locked")}` : ""}">${item.code}</button>`).join("");
  const rows = leaderboard.top.length ? leaderboard.top.map((record, index) => `
    <li class="ranking-row ${record.name === profile.name ? "is-me" : ""}"><b>${index + 1}</b>${avatarMarkup(record, "toy-avatar--tiny")}<span class="ranking-player"><b>${escapeHtml(normalizeProfileName(record.name))}</b><small>${t(settings.language, "radarHitsShort")} ${record.radarHits ?? "-"}, ${t(settings.language, "retriesShort")} ${record.retries ?? "-"}, ${t(settings.language, "echoName")} ${record.echoes}</small></span><strong>${formatRecordScore(record)}</strong></li>
  `).join("") : `<li class="empty-record">${t(settings.language, "noRecord")}</li>`;
  setOverlay(`
    <section class="panel toy-dialog records-dialog" aria-labelledby="overlayTitle">
      <div class="records-heading"><div><h2 id="overlayTitle" data-dialog-title tabindex="-1">${t(settings.language, "records")} / ${t(settings.language, "ranking")}</h2></div>${avatarMarkup(profile)}</div>
      <div class="stat-strip"><div><span>${t(settings.language, "plays")}</span><b>${gameStats.plays}</b></div><div><span>${t(settings.language, "clears")}</span><b>${gameStats.clears}</b></div><div><span>${t(settings.language, "catches")}</span><b>${gameStats.catches}</b></div><div><span>${t(settings.language, "clone")}</span><b>${gameStats.echoes}</b></div></div>
      <nav class="record-stage-tabs" aria-label="${t(settings.language, "stage")}">${tabs}</nav>
      <div class="ranking-title"><span>${t(settings.language, "deviceRanking")}</span><b>${t(settings.language, "stage")} ${Number(recordLevel.code)}: ${escapeHtml(recordStage.title)}</b></div>
      <ol class="ranking-list">${rows}</ol>
      <p class="ranking-note">${t(settings.language, "records")} ${leaderboard.total}</p>
      <button class="records-reset" id="resetRecords" type="button">${t(settings.language, "resetRecords")}</button>
      <div class="dialog-actions"><button class="toy-button toy-button--primary" id="playFromRecords" type="button">${t(settings.language, "play")}</button><button class="toy-button" id="closeRecords" type="button">${t(settings.language, "back")}</button></div>
    </section>
  `, "records");
  document.querySelectorAll("[data-record-stage]").forEach((button) => button.addEventListener("click", () => showRecordsOverlay(Number(button.dataset.recordStage))));
  let resetArmed = false;
  document.querySelector("#resetRecords").addEventListener("click", (event) => {
    if (!resetArmed) {
      resetArmed = true;
      event.currentTarget.textContent = t(settings.language, "confirmReset");
      return;
    }
    gameStats = { plays: 0, clears: 0, catches: 0, echoes: 0 };
    completionRecords = [];
    saveStats();
    showRecordsOverlay(selectedIndex);
    announce(t(settings.language, "recordsReset"));
  });
  document.querySelector("#playFromRecords").addEventListener("click", () => startLevel(selectedIndex));
  document.querySelector("#closeRecords").addEventListener("click", () => showMenu(selectedIndex));
}

function showMenu(selectedIndex = null) {
  const previousState = state;
  state = "menu";
  clearTimeout(toastTimer);
  ui.toast.classList.remove("show");
  ui.toast.textContent = "";
  ui.soundCaption?.classList.remove("show");
  if (ui.soundCaption) ui.soundCaption.textContent = "";
  keys.clear();
  resetStickInput();
  moveTarget = null;
  if (Number.isInteger(selectedIndex)) levelIndex = clamp(selectedIndex, 0, levels.length - 1);
  else if (previousState === "menu" && !player) levelIndex = Math.max(0, completed >= levels.length ? levels.length - 1 : Math.min(completed, unlocked - 1));
  level = levels[levelIndex];
  const stageCopy = localizedStage(level);
  const best = getWorldTopRecords(completionRecords, level.code, 1)[0] || null;
  const stillHero = reducedMotionQuery.matches ? "walk-1.png" : "animation.gif";
  const stillBoss = reducedMotionQuery.matches ? "idle-1.png" : "animation.gif";
  applyTheme();
  updateStaticTranslations();
  updateHud();
  ui.stageName.textContent = `${t(settings.language, "stage")} ${Number(level.code)}: ${stageCopy.title}`;
  ui.objective.textContent = stageCopy.cue;
  const stageNodes = levels.map((item, index) => {
    const locked = index >= unlocked;
    const cleared = index < completed;
    const stage = localizedStage(item);
    const status = cleared ? "✓" : index === levelIndex ? t(settings.language, "now") : locked ? t(settings.language, "locked") : t(settings.language, "next");
    return `
      <button class="world-node ${cleared ? "is-cleared" : ""} ${index === levelIndex ? "is-current" : ""} ${index === levels.length - 1 ? "is-boss" : ""}" type="button" data-stage-select="${index}" ${locked ? "disabled" : ""} aria-label="${t(settings.language, "stage")} ${Number(item.code)} ${stage.title}, ${locked ? t(settings.language, "locked") : status}">
        <span class="world-node__coin" aria-hidden="true">${locked ? "?" : cleared ? "✓" : item.code}</span>
        <b>${index === levelIndex ? status : ""}</b>
      </button>`;
  }).join("");
  setOverlay(`
    <section class="panel arcade-menu toy-menu" aria-labelledby="overlayTitle">
      <header class="toy-menu__top">
        <button class="profile-chip" id="profileAction" data-action="profile" type="button" aria-label="${t(settings.language, "profile")}: ${escapeHtml(profile.name)}">${avatarMarkup(profile)}<span><b>${escapeHtml(profile.name)}</b><small>${t(settings.language, "profile")}</small></span></button>
        <div class="arcade-logo toy-logo">
          <h1 id="overlayTitle" data-dialog-title tabindex="-1">${escapeHtml(t(settings.language, "gameTitle"))}</h1>
        </div>
        <nav class="player-tools" aria-label="${t(settings.language, "playerTools")}"><button class="round-tool" id="recordsAction" data-action="records" type="button" aria-label="${t(settings.language, "ranking")}"><span aria-hidden="true">♛</span><small>${t(settings.language, "records")}</small></button><button class="round-tool" id="settingsAction" data-action="settings" type="button" aria-label="${t(settings.language, "settings")}"><span aria-hidden="true">⚙</span><small>${t(settings.language, "settings")}</small></button></nav>
      </header>
      <div class="arcade-stage-card toy-stage-card" data-stage="${level.code}" data-theme="${level.theme.id}">
        <div class="arcade-stage-info">
          <div class="stage-heading">
            <span class="stage-mascot"><img src="assets/sprites/duck-player/down/${stillHero}?v=0.11.0" alt="" aria-hidden="true"></span>
            <div class="stage-heading__copy"><span class="arcade-rule">${t(settings.language, "stage")} ${Number(level.code)} / ${levels.length}</span><h2 class="stage-title"><span class="stage-title__local">${escapeHtml(stageCopy.title)}</span></h2><p class="stage-summary">${escapeHtml(stageCopy.rule)}</p></div>
            ${levelIndex === levels.length - 1 ? `<span class="stage-boss-preview"><img src="assets/sprites/toy-guards/captain/${stillBoss}?v=0.11.0" alt="" aria-hidden="true"></span>` : ""}
          </div>
          <div class="stage-mission"><span>${t(settings.language, "currentGoal")}</span><b>${escapeHtml(stageCopy.cue)}</b></div>
          <div class="arcade-stats"><span>${t(settings.language, "difficulty")} ${level.difficulty}/${levels.length}</span><span>${t(settings.language, "best")} ${best ? formatRecordScore(best) : "--"}</span></div>
          <button class="arcade-play toy-button toy-button--primary" id="quickStart" data-action="play" type="button"><span aria-hidden="true">▶</span> ${t(settings.language, "play")}</button>
        </div>
      </div>
      <nav class="world-map toy-rail" style="--stage-count:${levels.length}" aria-label="${t(settings.language, "stage")}">${stageNodes}</nav>
    </section>
  `, "menu");
  announce(`${t(settings.language, "stage")} ${Number(level.code)} ${stageCopy.title}. ${stageCopy.cue}`);
  document.querySelector("#quickStart").addEventListener("click", () => startLevel(levelIndex));
  document.querySelector("#profileAction").addEventListener("click", showProfileOverlay);
  document.querySelector("#recordsAction").addEventListener("click", () => showRecordsOverlay(levelIndex));
  document.querySelector("#settingsAction").addEventListener("click", showSettingsOverlay);
  document.querySelectorAll("[data-stage-select]").forEach((button) => button.addEventListener("click", () => showMenu(Number(button.dataset.stageSelect))));
  requestAnimationFrame(() => {
    const rail = document.querySelector(".toy-rail");
    const currentStage = rail?.querySelector(".world-node.is-current");
    if (!rail || !currentStage) return;
    rail.scrollLeft = Math.max(0, currentStage.offsetLeft - (rail.clientWidth - currentStage.offsetWidth) / 2);
  });
}

function makeRecord() {
  return {
    frames: [{ t: 0, x: level.start.x, y: level.start.y, angle: -Math.PI / 2 }],
    events: [],
    colorIndex: echoes.length,
  };
}

function createGuards() {
  return level.guards.map((guard, index) => {
    const archetype = GUARD_ARCHETYPES[guard.type] || GUARD_ARCHETYPES.sleepy;
    const waypoints = guard.waypoints?.length ? guard.waypoints : [{ x: guard.x, y: guard.y }];
    const firstDestination = waypoints[1] || waypoints[0];
    const startingAngle = Number.isFinite(guard.angle)
      ? guard.angle
      : Math.atan2(firstDestination.y - guard.y, firstDestination.x - guard.x);
    return {
      ...archetype,
      ...guard,
      waypoints,
      id: `guard-${index}`,
      name: guard.name || archetype.label,
      x: guard.x,
      y: guard.y,
      angle: startingAngle,
      baseAngle: startingAngle,
      waypointIndex: waypoints.length > 1 ? 1 : 0,
      targetId: null,
      targetPoint: null,
      mode: "patrol",
      modeUntil: 0,
      confusedUntil: 0,
      seesCurrent: false,
      stuckFor: 0,
      weaponReadyAt: 650 + index * 90,
      aimStartedAt: null,
      aimTargetId: null,
      aimTargetPoint: null,
    };
  });
}

function startLevel(index = levelIndex) {
  initAudio();
  levelIndex = index;
  level = levels[index];
  const stageCopy = localizedStage(level);
  cameraX = level.start.x;
  applyTheme();
  echoes = [];
  loopNumber = 1;
  loopLimit = LOOP_DURATION;
  timeBonusCollected = false;
  keyCollected = false;
  keyValueCollected = 0;
  collectedItemIds = new Set();
  itemBonusScore = 0;
  radarShieldCharges = 0;
  radarShieldBlocking = false;
  runRadarHits = 0;
  runRetries = 0;
  wasSeenByAnyGuard = false;
  doorTutorialShown = false;
  stageStartedAt = 0;
  lastClearResult = null;
  gameStats.plays += 1;
  saveStats();
  resetLoop(false);
  countdownRemaining = 1000;
  countdownCue = -1;
  state = "countdown";
  hideOverlay();
  updateHud();
  window.scrollTo({ top: 0, behavior: "instant" });
  ui.stageName.textContent = `${t(settings.language, "stage")} ${Number(level.code)}: ${stageCopy.title}`;
  ui.objective.textContent = stageCopy.cue;
  announce(`${t(settings.language, "stage")} ${Number(level.code)}. ${stageCopy.cue}`);
}

function resetLoop(withEffect = true, preserveStick = false) {
  loopLimit = stageLoopLimit();
  // The key belongs to the current 8-second attempt. Rewinding starts a new
  // attempt, so the player must pick it up and reach the exit in one run.
  keyCollected = false;
  keyValueCollected = 0;
  player = {
    id: "current",
    x: level.start.x,
    y: level.start.y,
    angle: -Math.PI / 2,
    radius: PLAYER_RADIUS,
    hasKey: false,
    exposure: 0,
    noiseCooldown: 0,
    exitHintShown: false,
  };
  currentRecord = makeRecord();
  if (!preserveStick) resetStickInput();
  moveTarget = null;
  moveTargetStuckFor = 0;
  loopElapsed = 0;
  sampleAccumulator = 0;
  currentSecond = -1;
  currentMusicStep = -1;
  wasSeenByAnyGuard = false;
  radarShieldBlocking = false;
  guards = createGuards();
  noisePulses = [];
  projectiles = [];
  plateStates = new Map(level.plates.map((plate) => [plate.id, false]));
  doorStates = level.doors.map(() => false);
  echoes.forEach((echo) => {
    echo.eventIndex = 0;
    echo.x = level.start.x;
    echo.y = level.start.y;
    echo.angle = -Math.PI / 2;
  });
  if (withEffect) {
    rewindAmount = reducedMotionQuery.matches ? 0 : 1;
    flash = reducedMotionQuery.matches ? 0 : 0.45;
    sound("loop");
  }
}

function saveAndRewind() {
  if (state !== "playing" && state !== "awaiting-save") return;
  recordCurrentPose();
  const moved = currentRecord.frames.some((frame) => dist(frame, level.start) > 5);
  const hasAction = currentRecord.events.length > 0;
  if (!moved && !hasAction) {
    showToast(t(settings.language, "moveFirst"), 800);
    return;
  }
  if (!canCreateClone(echoes.length)) {
    showToast(t(settings.language, "echoFull"), 850);
    return;
  }
  const last = currentRecord.frames[currentRecord.frames.length - 1];
  if (last.t < loopLimit) {
    currentRecord.frames.push({ ...last, t: loopLimit });
  }
  echoes.push({
    id: `echo-${Date.now()}-${echoes.length}`,
    recording: currentRecord,
    x: level.start.x,
    y: level.start.y,
    angle: -Math.PI / 2,
    radius: PLAYER_RADIUS,
    eventIndex: 0,
    colorIndex: echoes.length,
  });
  gameStats.echoes += 1;
  saveStats();
  loopNumber += 1;
  state = "playing";
  resetLoop(true);
  showToast(t(settings.language, "echoSaved", { value: echoes.length }), 1100);
}

function restartCurrentLoop() {
  if (state !== "playing" && state !== "awaiting-save") return;
  runRetries += 1;
  loopNumber += 1;
  state = "playing";
  resetLoop(true);
  showToast(t(settings.language, "retry"), 700);
}

function restartWholeLevel() {
  if (state !== "playing" && state !== "caught" && state !== "awaiting-save") return;
  echoes = [];
  loopNumber = 1;
  loopLimit = LOOP_DURATION;
  timeBonusCollected = false;
  keyCollected = false;
  keyValueCollected = 0;
  collectedItemIds = new Set();
  itemBonusScore = 0;
  radarShieldCharges = 0;
  radarShieldBlocking = false;
  runRadarHits = 0;
  runRetries = 0;
  wasSeenByAnyGuard = false;
  doorTutorialShown = false;
  resetLoop(true);
  state = "playing";
  showToast(t(settings.language, "reset"), 700);
}

function undoLastEcho() {
  if (state !== "playing" || echoes.length === 0) {
    showToast(t(settings.language, "noEcho"), 700);
    return;
  }
  echoes.pop();
  loopNumber = echoes.length + 1;
  resetLoop(true);
  showToast(t(settings.language, "echoRemoved"), 800);
}

function recordCurrentPose(time = loopElapsed) {
  const frame = {
    t: Math.min(time, loopLimit),
    x: player.x,
    y: player.y,
    angle: player.angle,
  };
  const last = currentRecord.frames[currentRecord.frames.length - 1];
  if (last && Math.abs(last.t - frame.t) < 0.01) {
    Object.assign(last, frame);
    return last;
  }
  currentRecord.frames.push(frame);
  return frame;
}

function sampleRecording() {
  recordCurrentPose();
}

function poseAt(recording, time) {
  const frames = recording.frames;
  if (time <= 0) return frames[0];
  if (time >= frames[frames.length - 1].t) return frames[frames.length - 1];
  let low = 0;
  let high = frames.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (frames[mid].t <= time) low = mid;
    else high = mid;
  }
  const a = frames[low];
  const b = frames[high];
  const span = Math.max(1, b.t - a.t);
  const t = (time - a.t) / span;
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    angle: a.angle + normalizeAngle(b.angle - a.angle) * t,
  };
}

function updateEchoes() {
  for (const echo of echoes) {
    const pose = poseAt(echo.recording, loopElapsed);
    echo.x = pose.x;
    echo.y = pose.y;
    echo.angle = pose.angle;
    const events = echo.recording.events;
    while (echo.eventIndex < events.length && events[echo.eventIndex].t <= loopElapsed) {
      const event = events[echo.eventIndex++];
      if (event.type === "noise") {
        createNoise(echo.x, echo.y, echo.id, true);
        showSoundCaption("noise", echo);
      }
    }
  }
}

function createNoise(x, y, sourceId, fromEcho = false) {
  noisePulses.push({ x, y, sourceId, life: 1, fromEcho, responderId: null, handled: false });
  burst(x, y, fromEcho ? "#62e7ff" : "#ffd166", 10, 95);
  sound("noise");
}

function triggerNoise() {
  if (state !== "playing" || player.noiseCooldown > 0) return;
  player.noiseCooldown = 0.6;
  currentRecord.events.push({ t: loopElapsed, type: "noise" });
  createNoise(player.x, player.y, player.id, false);
  showToast(`${t(settings.language, "noise")}!`, 650);
  showSoundCaption("noise", player);
}

function getSolidRects() {
  const solids = [...level.walls];
  level.doors.forEach((door, index) => {
    if (!doorStates[index]) solids.push(door);
  });
  return solids;
}

function showDoorTutorial() {
  if (doorTutorialShown) return false;
  doorTutorialShown = true;
  showToast(t(settings.language, "doorTutorial"), 3600);
  return true;
}

function circleHitsRect(entity, rect) {
  const closestX = clamp(entity.x, rect.x, rect.x + rect.w);
  const closestY = clamp(entity.y, rect.y, rect.y + rect.h);
  const dx = entity.x - closestX;
  const dy = entity.y - closestY;
  return dx * dx + dy * dy < entity.radius * entity.radius;
}

function moveCircle(entity, dx, dy, solids = getSolidRects()) {
  const collisions = new Set();
  entity.x += dx;
  entity.x = clamp(entity.x, 66 + entity.radius, W - 66 - entity.radius);
  for (const rect of solids) {
    if (!circleHitsRect(entity, rect)) continue;
    collisions.add(rect);
    if (dx > 0) entity.x = rect.x - entity.radius;
    else if (dx < 0) entity.x = rect.x + rect.w + entity.radius;
  }
  entity.y += dy;
  entity.y = clamp(entity.y, 56 + entity.radius, H - 56 - entity.radius);
  for (const rect of solids) {
    if (!circleHitsRect(entity, rect)) continue;
    collisions.add(rect);
    if (dy > 0) entity.y = rect.y - entity.radius;
    else if (dy < 0) entity.y = rect.y + rect.h + entity.radius;
  }
  return collisions;
}

function collectStageItem(item) {
  const type = itemType(item);
  if (!type || collectedItemIds.has(item.id)) return;
  collectedItemIds.add(item.id);
  const itemName = t(settings.language, type.nameKey);
  let effectLabel = "";
  if (item.type === "time") {
    timeBonusCollected = true;
    loopLimit = stageLoopLimit();
    const duration = Number(item.duration) || type.duration;
    effectLabel = t(settings.language, "timeBonusLabel", { value: (duration / 1000).toFixed(1) });
  } else if (item.type === "shield") {
    radarShieldCharges += Number(item.charges) || type.charges;
    effectLabel = t(settings.language, "shieldReady");
  }
  const scoreValue = Number(item.score) || Number(type.score) || 0;
  if (scoreValue > 0) {
    itemBonusScore += scoreValue;
    const pointsLabel = t(settings.language, "itemPoints", { value: scoreValue.toLocaleString(settings.language) });
    effectLabel = effectLabel ? `${effectLabel}, ${pointsLabel}` : pointsLabel;
  }
  sound("timeBonus");
  flash = reducedMotionQuery.matches ? 0 : 0.42;
  burst(item.x, item.y, type.main, 18, 120);
  showToast(`${t(settings.language, "itemGet", { item: itemName })} ${effectLabel}`, 1150);
  showSoundCaption("itemSound", item);
}

function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;
  let speedScale = 1;
  let manualInput = false;
  if (keys.has("KeyW") || keys.has("ArrowUp")) dy -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) dy += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) dx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;
  if (dx || dy) manualInput = true;
  else if (stickInput.magnitude > 0) {
    dx = stickInput.x;
    dy = stickInput.y;
    speedScale = stickInput.magnitude;
    manualInput = true;
  }
  if (manualInput) {
    moveTarget = null;
    moveTargetStuckFor = 0;
  }
  let followingTarget = false;
  if (!manualInput && moveTarget) {
    const targetDistance = dist(player, moveTarget);
    if (targetDistance < 5) moveTarget = null;
    else {
      dx = (moveTarget.x - player.x) / targetDistance;
      dy = (moveTarget.y - player.y) / targetDistance;
      followingTarget = true;
    }
  }
  if (dx || dy) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    player.angle = Math.atan2(dy, dx);
    const beforeMove = { x: player.x, y: player.y };
    const collisions = moveCircle(player, dx * PLAYER_SPEED * dt * speedScale, dy * PLAYER_SPEED * dt * speedScale);
    const hitClosedDoor = level.doors.some((door, index) => !doorStates[index] && collisions.has(door));
    if (hitClosedDoor) showDoorTutorial();
    if (followingTarget && moveTarget) {
      if (hitClosedDoor) {
        moveTarget = null;
        moveTargetStuckFor = 0;
      } else if (dist(beforeMove, player) < 0.2) moveTargetStuckFor += dt;
      else moveTargetStuckFor = 0;
      if (moveTargetStuckFor > 0.38) {
        moveTarget = null;
        moveTargetStuckFor = 0;
        showToast(t(settings.language, "blocked"), 650);
      }
    }
  }
  player.noiseCooldown = Math.max(0, player.noiseCooldown - dt);

  for (const item of level.items || []) {
    if (!collectedItemIds.has(item.id) && dist(player, item) < 28) collectStageItem(item);
  }

  if (!keyCollected && dist(player, level.key) < 29) {
    keyCollected = true;
    keyValueCollected = level.keyType?.value || 0;
    player.hasKey = true;
    sound("gem");
    flash = reducedMotionQuery.matches ? 0 : 0.7;
    burst(level.key.x, level.key.y, level.keyType?.palette?.accent || "#ffd166", 26, 150);
    const keyName = t(settings.language, level.keyType?.nameKey || "gem");
    showToast(t(settings.language, "treasureGet", { name: keyName, value: keyValueCollected.toLocaleString(settings.language) }), 1400);
    showSoundCaption("gemGet", level.key);
  }
  if (dist(player, level.exit) < 38) {
    if (canEscape({ hasKey: player.hasKey })) completeLevel();
    else if (!player.exitHintShown) {
      player.exitHintShown = true;
      showToast(t(settings.language, "needKey"), 1100);
    }
  } else if (dist(player, level.exit) > 60) {
    player.exitHintShown = false;
  }
}

function updatePlatesAndDoors() {
  const actors = [player, ...echoes];
  level.plates.forEach((plate) => {
    const wasActive = plateStates.get(plate.id);
    const active = actors.some((actor) => dist(actor, plate) < plate.r + 13);
    plateStates.set(plate.id, active);
    if (active && !wasActive) {
      sound("plate");
      burst(plate.x, plate.y, "#7bffd4", 8, 70);
    }
  });
  level.doors.forEach((door, index) => {
    const wasOpen = doorStates[index];
    const open = Boolean(plateStates.get(door.plateId));
    doorStates[index] = open;
    if (open !== wasOpen) {
      sound("door");
      if (open) showSoundCaption("doorOpen", door);
    }
  });
}

const VISION_RAY_SEGMENTS = 36;
const VISION_CORNER_EPSILON = 0.0012;
const VISION_WALL_INSET = 1;

function rayRectIntersectionDistance(origin, directionX, directionY, rect, maxDistance) {
  let near = 0;
  let far = maxDistance;
  const axes = [
    [origin.x, directionX, rect.x, rect.x + rect.w],
    [origin.y, directionY, rect.y, rect.y + rect.h],
  ];

  for (const [position, direction, minimum, maximum] of axes) {
    if (Math.abs(direction) < 0.000001) {
      if (position < minimum || position > maximum) return null;
      continue;
    }
    let first = (minimum - position) / direction;
    let second = (maximum - position) / direction;
    if (first > second) [first, second] = [second, first];
    near = Math.max(near, first);
    far = Math.min(far, second);
    if (far < near) return null;
  }

  return near >= 0 && near <= maxDistance ? near : null;
}

function visionRayOffsets(guard, solids) {
  const halfFov = guard.fov / 2;
  const offsets = [];
  for (let index = 0; index <= VISION_RAY_SEGMENTS; index += 1) {
    offsets.push(lerp(-halfFov, halfFov, index / VISION_RAY_SEGMENTS));
  }

  for (const rect of solids) {
    const corners = [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x + rect.w, rect.y + rect.h],
      [rect.x, rect.y + rect.h],
    ];
    for (const [x, y] of corners) {
      const relative = normalizeAngle(Math.atan2(y - guard.y, x - guard.x) - guard.angle);
      if (Math.abs(relative) > halfFov + VISION_CORNER_EPSILON) continue;
      for (const nudge of [-VISION_CORNER_EPSILON, 0, VISION_CORNER_EPSILON]) {
        offsets.push(clamp(relative + nudge, -halfFov, halfFov));
      }
    }
  }

  offsets.sort((a, b) => a - b);
  return offsets.filter((offset, index) => index === 0 || Math.abs(offset - offsets[index - 1]) > 0.00001);
}

function buildVisionPolygon(guard, solids = getSolidRects()) {
  const points = [{ x: guard.x, y: guard.y }];
  for (const offset of visionRayOffsets(guard, solids)) {
    const angle = guard.angle + offset;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    let distance = guard.range;
    for (const rect of solids) {
      const hit = rayRectIntersectionDistance(guard, directionX, directionY, rect, guard.range);
      if (hit != null) distance = Math.min(distance, Math.max(0, hit - VISION_WALL_INSET));
    }
    points.push({ x: guard.x + directionX * distance, y: guard.y + directionY * distance });
  }
  return points;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointSegmentDistanceSquared(point, a, b) {
  const segmentX = b.x - a.x;
  const segmentY = b.y - a.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const amount = lengthSquared > 0
    ? clamp(((point.x - a.x) * segmentX + (point.y - a.y) * segmentY) / lengthSquared, 0, 1)
    : 0;
  const closestX = a.x + segmentX * amount;
  const closestY = a.y + segmentY * amount;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return dx * dx + dy * dy;
}

function circleIntersectsPolygon(circle, polygon) {
  if (polygon.length < 3) return false;
  if (pointInPolygon(circle, polygon)) return true;
  const radiusSquared = circle.radius * circle.radius;
  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length;
    if (pointSegmentDistanceSquared(circle, polygon[index], polygon[next]) <= radiusSquared) return true;
  }
  return false;
}

function canSee(guard, actor, visionPolygon = buildVisionPolygon(guard)) {
  const radius = actor.radius || PLAYER_RADIUS;
  if (dist(guard, actor) > guard.range + radius) return false;
  return circleIntersectsPolygon({ x: actor.x, y: actor.y, radius }, visionPolygon);
}

function projectileKindForGuard(guard) {
  if (guard.type === "watcher") return "arrow";
  if (guard.type === "chaser") return "net";
  return null;
}

function clearGuardAim(guard) {
  guard.aimStartedAt = null;
  guard.aimTargetId = null;
  guard.aimTargetPoint = null;
}

function updateGuardWeapon(guard, target, clock) {
  const kind = projectileKindForGuard(guard);
  if (!kind || !target || clock < guard.confusedUntil || clock < guard.weaponReadyAt) {
    if (!target || clock < guard.confusedUntil) clearGuardAim(guard);
    return;
  }

  const profile = PROJECTILE_PROFILES[kind];
  if (guard.aimTargetId !== target.id || guard.aimStartedAt == null) {
    guard.aimStartedAt = clock;
    guard.aimTargetId = target.id;
    // 예고가 시작된 순간의 위치를 고정한다. 플레이어는 선을 보고 옆으로
    // 피할 수 있고, 발사 뒤에는 탄이 갑자기 방향을 꺾지 않는다.
    guard.aimTargetPoint = { x: target.x, y: target.y };
  }
  if (clock - guard.aimStartedAt < profile.telegraphMs) return;

  try {
    const launch = createProjectileLaunch(
      { x: guard.x, y: guard.y },
      guard.aimTargetPoint,
      kind,
    );
    projectiles.push({
      id: `${kind}-${guard.id}-${Math.round(clock)}`,
      kind,
      ownerId: guard.id,
      targetId: target.id,
      launch,
      spawnedAtMs: clock,
      ageMs: 0,
      lifetimeMs: launch.lifetimeMs,
      position: { x: launch.origin.x, y: launch.origin.y, z: 0 },
      angle: Math.atan2(launch.velocity.y, launch.velocity.x),
    });
    sound(kind);
    showSoundCaption(kind === "arrow" ? "arrowShot" : "netShot", guard);
  } catch {
    // 목표와 경비가 정확히 겹친 한 프레임에는 발사 대신 접촉 판정을 사용한다.
  }
  guard.weaponReadyAt = clock + profile.cooldownMs;
  clearGuardAim(guard);
}

function updateProjectiles(dt) {
  if (!projectiles.length) return;
  const solids = getSolidRects();
  // 분신과 현재의 내가 정확히 겹친 순간에는 분신이 탄을 대신 맞아야
  // 소리 유인 규칙이 예측 가능하다.
  const actors = [...echoes, player];
  const survivors = [];

  for (const projectile of projectiles) {
    const previous = projectile.position;
    projectile.ageMs = projectileElapsedMs(loopElapsed, projectile.spawnedAtMs);
    const sampled = projectileFlightPosition(projectile.launch, projectile.ageMs / 1000);
    const next = { x: sampled.x, y: sampled.y, z: sampled.z };
    const hit = firstSweptCollision(previous, next, {
      walls: solids,
      targets: actors,
      projectileRadius: projectile.launch.radius,
    });

    if (hit) {
      projectile.position = { x: hit.point.x, y: hit.point.y, z: next.z };
      if (hit.kind === "wall") {
        burst(hit.point.x, hit.point.y, projectile.kind === "arrow" ? "#ffd166" : "#62e7ff", 7, 55);
      } else if (hit.collider === player) {
        burst(hit.point.x, hit.point.y, projectile.kind === "arrow" ? "#ff617d" : "#62e7ff", 15, 100);
        catchPlayer(projectile.kind === "arrow" ? "arrowHit" : "netHit");
      } else {
        const owner = guards.find((guard) => guard.id === projectile.ownerId);
        if (owner) {
          owner.confusedUntil = loopElapsed + 650;
          owner.modeUntil = 0;
          owner.targetId = null;
          owner.targetPoint = null;
          owner.mode = "confused";
          clearGuardAim(owner);
        }
        burst(hit.point.x, hit.point.y, "#62e7ff", 12, 85);
      }
      continue;
    }

    projectile.position = next;
    if (sampled.landed || shouldRemoveProjectile(projectile, undefined, 24)) {
      burst(next.x, next.y, projectile.kind === "arrow" ? "#ffd166" : "#62e7ff", 5, 45);
      continue;
    }
    survivors.push(projectile);
  }
  projectiles = survivors;
}

function updateGuards(dt) {
  const clock = loopElapsed;
  const actors = [player, ...echoes];

  // 한 번의 소음에는 가장 가까운 경비 한 명만 반응한다. 경비가 많을수록
  // 전부 같은 소리에 몰려 오히려 쉬워지는 현상을 막는다.
  for (const pulse of noisePulses) {
    if (pulse.responderId || pulse.life <= 0.35) continue;
    const responder = guards
      .filter((guard) => clock >= guard.confusedUntil && dist(guard, pulse) < guard.hearing)
      .sort((a, b) => dist(a, pulse) - dist(b, pulse))[0];
    if (responder) pulse.responderId = responder.id;
  }

  const currentDetectionRates = [];
  for (const guard of guards) {
    guard.seesCurrent = false;
    if (clock < guard.confusedUntil) {
      guard.visionPolygon = [];
      clearGuardAim(guard);
      continue;
    }

    const heard = noisePulses.find((pulse) => pulse.responderId === guard.id && !pulse.handled);
    if (heard) {
      heard.handled = true;
      guard.targetId = null;
      guard.targetPoint = { x: heard.x, y: heard.y };
      guard.mode = "investigate";
      guard.modeUntil = clock + 2200;
      showSoundCaption("guardHeard", guard);
    }

    let destination = null;
    let speed = guard.speed;
    const freelyScanning = guard.type === "scanner" && !(guard.targetPoint && clock < guard.modeUntil);
    if (guard.targetPoint && clock < guard.modeUntil) {
      destination = guard.targetPoint;
      speed *= 1.55;
    } else if (freelyScanning) {
      guard.targetId = null;
      guard.targetPoint = null;
      guard.mode = "scan";
      guard.angle = guard.baseAngle + (clock / 1000) * guard.rotationSpeed;
    } else {
      guard.targetId = null;
      guard.targetPoint = null;
      guard.mode = "patrol";
      destination = guard.waypoints[guard.waypointIndex];
      if (dist(guard, destination) < 18) {
        guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
        destination = guard.waypoints[guard.waypointIndex];
      }
    }

    guard.radius = guard.boss ? 22 : 15;
    if (destination) {
      const angle = Math.atan2(destination.y - guard.y, destination.x - guard.x);
      guard.angle = angle;
      const before = { x: guard.x, y: guard.y };
      moveCircle(guard, Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
      if (guard.zone) {
        guard.x = clamp(guard.x, guard.zone.x + guard.radius, guard.zone.x + guard.zone.w - guard.radius);
        guard.y = clamp(guard.y, guard.zone.y + guard.radius, guard.zone.y + guard.zone.h - guard.radius);
      }
      const moved = dist(before, guard);
      if (dist(guard, destination) > 20 && moved < 0.35) guard.stuckFor += dt;
      else guard.stuckFor = 0;
      if (guard.stuckFor > 0.4) {
        guard.targetId = null;
        guard.targetPoint = null;
        guard.mode = "patrol";
        guard.modeUntil = 0;
        guard.stuckFor = 0;
        guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
      }
    }

    // 이동이 끝난 바로 그 좌표에서 시야를 한 번만 계산한다. 이 폴리곤을
    // 발각 판정과 렌더링이 함께 사용하므로 화면의 빨간 영역과 실제 판정이 같다.
    const visionPolygon = buildVisionPolygon(guard);
    guard.visionPolygon = visionPolygon;
    const visible = actors.filter((actor) => canSee(guard, actor, visionPolygon));
    const seesCurrent = visible.includes(player);
    guard.seesCurrent = seesCurrent;
    if (guard.boss && seesCurrent && !guard.bossAlertCaptioned) {
      guard.bossAlertCaptioned = true;
      showSoundCaption("bossAlert", guard);
    }
    // 궁수와 그물총병은 발사체가 주 포획 수단이다. 레이더 게이지가 탄보다
    // 먼저 플레이어를 잡지 않도록 시야 누적은 경고 수준으로 낮춘다.
    if (seesCurrent) currentDetectionRates.push(guard.detectRate * (projectileKindForGuard(guard) ? 0.35 : 1));

    let weaponTarget = null;
    if (visible.length) {
      // 분신은 소리로 경비를 유인하지만, 실제 플레이어가 함께 보이면 발각 게이지는
      // 별도로 오른다. 시야가 끊긴 뒤에는 마지막으로 본 위치만 조사한다.
      const visibleEchoes = visible.filter((actor) => actor.id !== player.id)
        .sort((a, b) => dist(guard, a) - dist(guard, b));
      const target = visibleEchoes[0] || player;
      weaponTarget = target;
      guard.targetId = target.id;
      guard.targetPoint = { x: target.x, y: target.y };
      guard.mode = "chase";
      guard.modeUntil = clock + 1350;
    }

    updateGuardWeapon(guard, weaponTarget, clock);

    if (dist(guard, player) < guard.radius + player.radius) return catchPlayer();
    for (const echo of echoes) {
      if (dist(guard, echo) < 26 && guard.targetId === echo.id) {
        guard.confusedUntil = clock + 850;
        guard.modeUntil = 0;
        guard.targetId = null;
        guard.targetPoint = null;
        guard.mode = "confused";
        burst(guard.x, guard.y, "#62e7ff", 12, 90);
        break;
      }
    }
  }

  const seenByRadar = currentDetectionRates.length > 0;
  if (seenByRadar && !radarShieldBlocking && !wasSeenByAnyGuard && radarShieldCharges > 0) {
    radarShieldCharges -= 1;
    radarShieldBlocking = true;
    flash = reducedMotionQuery.matches ? 0 : 0.35;
    burst(player.x, player.y, ITEM_TYPES.shield.main, 16, 105);
    showToast(t(settings.language, "shieldUsed"), 950);
  }
  if (!seenByRadar) radarShieldBlocking = false;
  const seenNow = seenByRadar && !radarShieldBlocking;
  if (seenNow && !wasSeenByAnyGuard) runRadarHits += 1;
  if (seenNow) wasSeenByAnyGuard = true;
  if (seenNow) player.exposure += dt * Math.max(...currentDetectionRates);
  else player.exposure = Math.max(0, player.exposure - dt * 1.15);
  if (!seenNow && player.exposure <= 0.02) wasSeenByAnyGuard = false;
  if (player.exposure >= 1) catchPlayer();
}

function catchPlayer(reasonKey = "caught") {
  if (state !== "playing") return;
  state = "caught";
  caughtTimer = 0.8;
  shake = reducedMotionQuery.matches ? 0 : 14;
  flash = reducedMotionQuery.matches ? 0 : 1;
  gameStats.catches += 1;
  runRetries += 1;
  saveStats();
  sound("caught");
  showToast(t(settings.language, reasonKey), 800);
  showSoundCaption(reasonKey, player);
}

function completeLevel() {
  if (state !== "playing") return;
  state = "complete";
  completedLoopElapsed = loopElapsed;
  const previousBest = getWorldTopRecords(completionRecords, level.code, 1)[0] || null;
  const scoreResult = calculateStealthScore({
    radarHits: runRadarHits,
    retries: runRetries,
    echoes: echoes.length,
    targetEchoes: level.parEchoes,
    time: Math.round(completedLoopElapsed),
    treasureValue: keyValueCollected,
    itemBonus: itemBonusScore,
  });
  const run = {
    id: `${Date.now()}-${level.code}`,
    world: level.code,
    time: Math.round(completedLoopElapsed),
    echoes: echoes.length,
    radarHits: runRadarHits,
    retries: runRetries,
    treasureValue: keyValueCollected,
    itemBonus: itemBonusScore,
    itemsCollected: collectedItemIds.size,
    score: scoreResult.score,
    stealthScore: scoreResult.breakdown.stealthScore,
    targetEchoes: level.parEchoes,
    echoPenalty: scoreResult.breakdown.echoPenalty,
    grade: scoreResult.grade,
    name: profile.name,
    color: profile.color,
    face: profile.face,
    date: Date.now(),
  };
  const newBest = !previousBest || compareCompletionRecords(run, previousBest) < 0;
  completionRecords.push(run);
  const leaderboard = getWorldLeaderboard(completionRecords, level.code, run, 5);
  lastClearResult = { run, previousBest, newBest, rank: leaderboard.rank };
  gameStats.clears += 1;
  saveStats();
  sound("complete");
  flash = reducedMotionQuery.matches ? 0 : 1;
  shake = reducedMotionQuery.matches ? 0 : 7;
  burst(player.x, player.y, "#7bffd4", 42, 190);
  unlocked = Math.max(unlocked, Math.min(levels.length, levelIndex + 2));
  completed = Math.max(completed, levelIndex + 1);
  localStorage.setItem("loopHeistUnlocked", String(unlocked));
  localStorage.setItem("loopHeistCompleted", String(completed));
  setTimeout(showCompleteOverlay, 550);
}

function showCompleteOverlay() {
  const isLast = levelIndex === levels.length - 1;
  const stageCopy = localizedStage(level);
  const nextLevel = levels[levelIndex + 1] || null;
  const nextCopy = nextLevel ? localizedStage(nextLevel) : null;
  const fallbackScore = calculateStealthScore({
    radarHits: runRadarHits,
    retries: runRetries,
    echoes: echoes.length,
    targetEchoes: level.parEchoes,
    time: completedLoopElapsed,
    treasureValue: keyValueCollected,
    itemBonus: itemBonusScore,
  });
  const result = lastClearResult || {
    run: {
      time: completedLoopElapsed,
      echoes: echoes.length,
      radarHits: runRadarHits,
      retries: runRetries,
      treasureValue: keyValueCollected,
      itemBonus: itemBonusScore,
      itemsCollected: collectedItemIds.size,
      stealthScore: fallbackScore.breakdown.stealthScore,
      targetEchoes: level.parEchoes,
      echoPenalty: fallbackScore.breakdown.echoPenalty,
      ...fallbackScore,
    },
    previousBest: null,
    newBest: false,
    rank: null,
  };
  const stealthScore = Number.isFinite(Number(result.run.stealthScore))
    ? Math.max(0, Math.min(10000, Math.round(Number(result.run.stealthScore))))
    : Math.max(0, Math.min(10000, Math.round(Number(fallbackScore.breakdown.stealthScore || 0))));
  const gradeCriteria = STEALTH_GRADE_THRESHOLDS.map(({ grade, min }) => `
    <span class="grade-rule ${grade === result.run.grade ? "is-current" : ""}">${grade} ${Number(min).toLocaleString(settings.language)}+</span>
  `).join("");
  const comparison = result.newBest
    ? `<p class="clear-record is-best"><b>${t(settings.language, "newBest")}</b>${result.previousBest ? `<span>${t(settings.language, "previousBest")}: ${formatRecordScore(result.previousBest)}, ${formatRecordScore(result.run)}</span>` : ""}</p>`
    : `<p class="clear-record"><b>${t(settings.language, "deviceRank")} #${result.rank || "-"}</b><span>${t(settings.language, "best")} ${formatRecordScore(getWorldTopRecords(completionRecords, level.code, 1)[0] || result.run)}</span></p>`;
  setOverlay(`
    <section class="panel arcade-clear toy-clear" aria-labelledby="overlayTitle">
      <p class="arcade-clear__world">${t(settings.language, "stage")} ${Number(level.code)} / ${levels.length}</p>
      <h2 id="overlayTitle" data-dialog-title tabindex="-1">${t(settings.language, "clear")}</h2>
      <strong>${escapeHtml(stageCopy.title)}</strong>
      <div class="arcade-clear__stars clear-grade" aria-label="${t(settings.language, "rankLabel", { value: result.run.grade })}. ${t(settings.language, "totalScore")} ${Number(result.run.score).toLocaleString(settings.language)}">
        <b>${t(settings.language, "rankLabel", { value: result.run.grade })}</b>
        <span>${t(settings.language, "totalScore")} <strong>${t(settings.language, "scorePoints", { value: Number(result.run.score).toLocaleString(settings.language) })}</strong></span>
      </div>
      <div class="grade-criteria">
        <p><b>${t(settings.language, "rankCriteria")}</b><span>${t(settings.language, "stealthScore")} ${t(settings.language, "scorePoints", { value: stealthScore.toLocaleString(settings.language) })}</span></p>
        <div>${gradeCriteria}</div>
      </div>
      <div class="arcade-score">
        <div><span>${t(settings.language, "radarHits")}</span><b>${result.run.radarHits}</b></div>
        <div><span>${t(settings.language, "retries")}</span><b>${result.run.retries}</b></div>
        <div><span>${t(settings.language, "cloneUse", { used: result.run.echoes, max: MAX_ECHOES, target: result.run.targetEchoes ?? level.parEchoes })}</span><b>${Number(result.run.echoPenalty || 0) > 0 ? `−${Number(result.run.echoPenalty).toLocaleString(settings.language)}` : t(settings.language, "noPenalty")}</b></div>
        <div><span>${t(settings.language, "clearTime")}</span><b>${formatRecordTime(result.run.time)}</b></div>
        <div><span>${t(settings.language, "treasureValue")}</span><b>+${Number(result.run.treasureValue || 0).toLocaleString(settings.language)}</b></div>
        <div><span>${t(settings.language, "itemBonusScore")}</span><b>+${Number(result.run.itemBonus || 0).toLocaleString(settings.language)}</b></div>
      </div>
      ${comparison}
      <p class="arcade-unlock">${isLast ? t(settings.language, "allClear") : `${t(settings.language, "stageOpen")}: ${Number(nextLevel.code)} ${escapeHtml(nextCopy.title)}`}</p>
      <div class="arcade-clear__actions">
        <button class="arcade-play toy-button toy-button--primary" id="nextAction" type="button">${isLast ? t(settings.language, "stageMap") : `${t(settings.language, "nextStage")} ▶`}</button>
        <button class="pixel-button toy-button" id="retryAction" type="button">${t(settings.language, "retry")}</button>
        <button class="pixel-button toy-button" id="resultMenu" type="button">${t(settings.language, "stageMap")}</button>
      </div>
    </section>
  `, "complete");
  announce(`${t(settings.language, "stage")} ${Number(level.code)} ${t(settings.language, "clear")}. ${t(settings.language, "rankLabel", { value: result.run.grade })}. ${t(settings.language, "totalScore")} ${result.run.score}. ${t(settings.language, "recordSummary", { time: (completedLoopElapsed / 1000).toFixed(2), echoes: echoes.length })}`);
  document.querySelector("#nextAction").addEventListener("click", () => {
    if (isLast) showMenu();
    else startLevel(levelIndex + 1);
  });
  document.querySelector("#retryAction").addEventListener("click", () => startLevel(levelIndex));
  document.querySelector("#resultMenu").addEventListener("click", showMenu);
}

function burst(x, y, color, count = 12, speed = 100) {
  if (reducedMotionQuery.matches) return;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.25 + Math.random() * 0.75);
    particles.push({
      x, y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 0.5 + Math.random() * 0.6,
      maxLife: 1.1,
      color,
      size: 1.5 + Math.random() * 3,
    });
  }
}

function updateEffects(dt) {
  noisePulses.forEach((pulse) => { pulse.life -= dt * 0.72; });
  noisePulses = noisePulses.filter((pulse) => pulse.life > 0);
  particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.97;
    particle.vy *= 0.97;
    particle.life -= dt;
  });
  particles = particles.filter((particle) => particle.life > 0);
  rewindAmount = Math.max(0, rewindAmount - dt * 2.4);
  flash = Math.max(0, flash - dt * 2.2);
  shake = Math.max(0, shake - dt * 18);
  goFlashRemaining = Math.max(0, goFlashRemaining - dt);
  soundCaptionRemaining = Math.max(0, soundCaptionRemaining - dt);
  if (soundCaptionRemaining === 0) ui.soundCaption?.classList.remove("show");
}

function update(dt, now) {
  updateEffects(dt);
  if (state === "countdown") {
    countdownRemaining -= dt * 1000;
    const cue = countdownRemaining > 500 ? 1 : 0;
    if (cue !== countdownCue) {
      countdownCue = cue;
      tone(level.music.root * (cue ? 2 : 2.5), 0.07, "square", 0.025);
    }
    if (countdownRemaining <= 0) {
      state = "playing";
      stageStartedAt = performance.now();
      goFlashRemaining = 0.34;
      tone(level.music.root * 3, 0.12, "square", 0.03);
      if (level.doors.length) showToast(t(settings.language, "doorTutorial"), 2800);
      else showToast(localizedStage(level).rule, 900);
    }
    updateHud();
    return;
  }
  if (state === "caught") {
    caughtTimer -= dt;
    if (caughtTimer <= 0) {
      state = "playing";
      loopNumber += 1;
      resetLoop(true);
    }
    updateHud();
    return;
  }
  if (state !== "playing") return;

  const gameplayDt = Math.min(dt, Math.max(0, loopLimit - loopElapsed) / 1000);
  loopElapsed = Math.min(loopLimit, loopElapsed + dt * 1000);
  const totalMusicStep = Math.floor(loopElapsed / (60000 / level.music.bpm));
  if (totalMusicStep !== currentMusicStep) {
    currentMusicStep = totalMusicStep;
    document.body.dataset.musicBeat = String(totalMusicStep % 4);
    playMusicStep(totalMusicStep % level.music.steps.length);
  }
  const second = Math.floor(loopElapsed / 1000);
  if (second !== currentSecond && second < 8) {
    currentSecond = second;
    if (loopElapsed >= loopLimit - 1000) tone(520, 0.055, "square", 0.022);
  }

  updateEchoes();
  updatePlatesAndDoors();
  updatePlayer(gameplayDt);
  updatePlatesAndDoors();
  updateGuards(gameplayDt);
  if (state === "playing") updateProjectiles(gameplayDt);
  if (state !== "playing") {
    updateHud();
    return;
  }

  sampleAccumulator += gameplayDt * 1000;
  while (sampleAccumulator >= SAMPLE_INTERVAL) {
    sampleAccumulator -= SAMPLE_INTERVAL;
    sampleRecording();
  }

  if (loopElapsed >= loopLimit && state === "playing") {
    recordCurrentPose(loopLimit);
    keyCollected = false;
    keyValueCollected = 0;
    player.hasKey = false;
    state = "awaiting-save";
    resetStickInput();
    moveTarget = null;
    showToast(t(settings.language, "saveWithX"), 2800);
  }
  updateHud();
}

function updateHud() {
  document.body.dataset.gameState = state;
  ui.loopCount.textContent = String(loopNumber);
  ui.echoCount.textContent = String(echoes.length);
  ui.timer.textContent = (Math.max(0, loopLimit - loopElapsed) / 1000).toFixed(1);
  const exposure = player?.exposure || 0;
  const alertValue = Math.round(clamp(exposure, 0, 1) * 100);
  ui.alertMeter.classList.toggle("active", exposure > 0.02 || guards.some((guard) => guard.seesCurrent));
  ui.alertFill.style.width = `${alertValue}%`;
  if (alertValue !== lastAlertValue) {
    lastAlertValue = alertValue;
    ui.alertMeter.setAttribute("aria-valuenow", String(alertValue));
    ui.alertMeter.setAttribute("aria-valuetext", alertValue === 0 ? t(settings.language, "safe") : t(settings.language, "danger", { value: alertValue }));
  }
  ui.touchActions.forEach((button) => {
    const action = button.dataset.gameAction;
    if (!['menu', 'mute'].includes(action)) {
      const canSaveFrozenLoop = action === "save" && state === "awaiting-save";
      const canRestartFrozenLoop = action === "restart" && state === "awaiting-save";
      const hasPlayableState = state === "playing" || canSaveFrozenLoop || canRestartFrozenLoop;
      button.disabled = !hasPlayableState || (action === "undo" && echoes.length === 0);
    }
    if (action === "mute") {
      button.setAttribute("aria-pressed", String(muted));
      const label = button.querySelector("small, span:last-child");
      if (label) label.textContent = muted ? t(settings.language, "on") : t(settings.language, "sound");
    }
  });
  canvas.dataset.debug = JSON.stringify({
    state,
    levelIndex,
    loopNumber,
    loopElapsed: Math.round(loopElapsed),
    loopLimit,
    scoreRun: { radarHits: runRadarHits, retries: runRetries },
    timeBonusCollected,
    key: { collected: keyCollected, value: keyValueCollected, nameKey: level.keyType?.nameKey },
    items: { collected: [...collectedItemIds], bonus: itemBonusScore, shieldCharges: radarShieldCharges },
    player: player ? { x: Math.round(player.x), y: Math.round(player.y), hasKey: player.hasKey, exposure: Number(player.exposure.toFixed(2)) } : null,
    echoes: echoes.map((echo) => {
      const savedEnd = echo.recording.frames[echo.recording.frames.length - 1];
      return {
        x: Math.round(echo.x),
        y: Math.round(echo.y),
        savedEnd: savedEnd ? { t: Math.round(savedEnd.t), x: Math.round(savedEnd.x), y: Math.round(savedEnd.y) } : null,
      };
    }),
    plates: Object.fromEntries(plateStates),
    doors: [...doorStates],
    doorTutorialShown,
    guards: guards.map((guard) => ({
      name: guard.name, type: guard.type, x: Math.round(guard.x), y: Math.round(guard.y),
      mode: guard.mode, seesCurrent: guard.seesCurrent, range: guard.range, detectRate: guard.detectRate,
      aiming: guard.aimStartedAt != null,
    })),
    projectiles: projectiles.map((projectile) => ({
      kind: projectile.kind,
      x: Math.round(projectile.position.x),
      y: Math.round(projectile.position.y),
      z: Math.round(projectile.position.z || 0),
      ageMs: Math.round(projectile.ageMs),
    })),
    stick: { x: Number(stickInput.x.toFixed(2)), y: Number(stickInput.y.toFixed(2)), magnitude: Number(stickInput.magnitude.toFixed(2)) },
    moveTarget: moveTarget ? { x: Math.round(moveTarget.x), y: Math.round(moveTarget.y) } : null,
  });
}

const CANVAS_ART_PALETTES = {
  museum: { floor: "#eadfca", floorAlt: "#dfcfb3", floorMark: "#b59e78", wallTop: "#6887ae", wallSide: "#344d73", wallHighlight: "#a8bfd2", decor: "#846f50" },
  warehouse: { floor: "#e6c58e", floorAlt: "#d8ad69", floorMark: "#ad7d40", wallTop: "#397a73", wallSide: "#234e4b", wallHighlight: "#79aaa0", decor: "#8a5a2d" },
  casino: { floor: "#dfc5e6", floorAlt: "#cda8d8", floorMark: "#a87fb5", wallTop: "#7b426d", wallSide: "#472642", wallHighlight: "#b477a4", decor: "#7d4e83" },
  lab: { floor: "#cde8d8", floorAlt: "#b5d9ca", floorMark: "#83b29f", wallTop: "#3e8178", wallSide: "#24534f", wallHighlight: "#80b8aa", decor: "#4d8d82" },
  penthouse: { floor: "#dfc9bd", floorAlt: "#d2b3a6", floorMark: "#a97f76", wallTop: "#78394e", wallSide: "#452335", wallHighlight: "#b86b7f", decor: "#8d5960" },
  inferno: { floor: "#3a2026", floorAlt: "#4b2428", floorMark: "#8f3930", wallTop: "#9b3528", wallSide: "#351419", wallHighlight: "#ff8b45", decor: "#d8512f" },
};

const ACTOR_COLORS = {
  outline: "#17233a",
  player: "#4c7dff",
  face: "#fff1ce",
  scarf: "#ff6b6b",
  echo: "#35cff2",
  echoDark: "#15506d",
  guard: "#9c4052",
  guardDark: "#471f31",
  boss: "#852d58",
  bossGold: "#ffc857",
  danger: "#d2263a",
  exit: "#23b97c",
  target: "#f2b84b",
};

function canvasArtPalette(theme = level.theme || THEMES.museum) {
  return CANVAS_ART_PALETTES[theme.id] || {
    floor: theme.floor,
    floorAlt: theme.glow,
    floorMark: theme.grid,
    wallTop: theme.wall,
    wallSide: theme.wallDark,
    wallHighlight: theme.accent,
    decor: theme.grid,
  };
}

function resolvedPlayerColor() {
  const candidateProfile = typeof profile === "object" && profile ? profile : globalThis.profile;
  const candidate = candidateProfile?.color;
  if (typeof candidate !== "string") return ACTOR_COLORS.player;
  const supported = globalThis.CSS?.supports
    ? globalThis.CSS.supports("color", candidate)
    : /^#[0-9a-f]{3,8}$/i.test(candidate);
  return supported ? candidate : ACTOR_COLORS.player;
}

function drawGrid() {
  const palette = canvasArtPalette();
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = palette.floorAlt;
  for (let y = 48; y < H - 48; y += 48) {
    for (let x = 48; x < W - 48; x += 48) {
      if (((x + y) / 48) % 2 === 0) ctx.fillRect(x, y, 48, 48);
    }
  }
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = palette.floorMark;
  for (let y = 62, row = 0; y < H - 54; y += 48, row += 1) {
    for (let x = 62, column = 0; x < W - 54; x += 48, column += 1) {
      ctx.fillRect(x, y, 4, 4);
      if ((column + row) % 3 === 0) {
        ctx.fillRect(x + 7, y, 7, 3);
        ctx.fillRect(x, y + 7, 3, 7);
      }
    }
  }
  ctx.restore();

  ctx.strokeStyle = ACTOR_COLORS.outline;
  ctx.lineWidth = 6;
  ctx.strokeRect(52, 42, W - 104, H - 84);
  ctx.strokeStyle = palette.wallHighlight;
  ctx.lineWidth = 2;
  ctx.strokeRect(58, 48, W - 116, H - 96);
}

function drawThemeDecor(now) {
  const theme = level.theme || THEMES.museum;
  const palette = canvasArtPalette(theme);
  const frame = Math.floor(now / 140);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = palette.decor;

  if (theme.id === "museum") {
    [[150, 120], [410, 100], [790, 125], [1040, 295]].forEach(([x, y], index) => {
      const unit = 5 + (index % 2) * 2;
      ctx.fillRect(x - unit * 3, y - unit, unit * 6, unit * 2);
      ctx.fillRect(x - unit, y - unit * 3, unit * 2, unit * 6);
      ctx.fillStyle = palette.floor;
      ctx.fillRect(x - unit, y - unit, unit * 2, unit * 2);
      ctx.fillStyle = palette.decor;
    });
    for (let x = 95; x < W - 100; x += 128) {
      ctx.fillRect(x, 610, 42, 4);
      ctx.fillRect(x + 10, 602, 4, 12);
      ctx.fillRect(x + 30, 602, 4, 12);
    }
  } else if (theme.id === "warehouse") {
    for (let x = 82; x < W - 80; x += 56) {
      const offset = ((x / 56) % 2) * 8;
      ctx.fillRect(x, 612 - offset, 24, 5);
      ctx.fillRect(x + 6, 604 - offset, 5, 18);
    }
    [[120, 150], [910, 190], [190, 520], [965, 520]].forEach(([x, y]) => {
      ctx.fillRect(x, y, 28, 4);
      ctx.fillRect(x, y, 4, 22);
      ctx.fillRect(x + 24, y, 4, 10);
      ctx.fillRect(x, y + 18, 10, 4);
    });
  } else if (theme.id === "casino") {
    [[170, 350], [620, 125], [1025, 345]].forEach(([x, y], index) => {
      const shift = (frame + index) % 4;
      ctx.fillRect(x - 18, y - 5, 36, 10);
      ctx.fillRect(x - 5, y - 18, 10, 36);
      ctx.fillRect(x - 12 + shift * 2, y - 12, 24 - shift * 4, 24);
      ctx.fillStyle = palette.floorAlt;
      ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.fillStyle = palette.decor;
    });
    for (let x = 82; x < W - 70; x += 72) ctx.fillRect(x, 620, 12, 5);
  } else if (theme.id === "lab") {
    [205, 585, 945].forEach((x, index) => {
      const pulse = (frame + index) % 4;
      ctx.fillRect(x - 42, 330, 84, 4);
      ctx.fillRect(x - 42, 330, 4, 54);
      ctx.fillRect(x + 38, 330, 4, 54);
      ctx.fillRect(x - 4, 314, 8, 20);
      ctx.fillRect(x - 26 + pulse * 12, 372, 14, 7);
    });
    for (let x = 86; x < W - 80; x += 96) {
      ctx.fillRect(x, 190, 62, 3);
      ctx.fillRect(x + 58, 190, 4, 18);
      ctx.fillRect(x + 55, 205, 10, 10);
    }
  } else if (theme.id === "penthouse") {
    for (let y = 110, row = 0; y < 610; y += 46, row += 1) {
      for (let x = 80 + (row % 2) * 28; x < 720; x += 56) {
        ctx.fillRect(x, y, 30, 4);
        ctx.fillRect(x + 26, y, 4, 14);
      }
    }
    for (let x = 790; x < 1120; x += 34) {
      const height = 36 + ((x * 13) % 86);
      ctx.fillRect(x, 600 - height, 24, height);
      ctx.fillStyle = palette.floor;
      ctx.fillRect(x + 6, 584 - height, 4, 4);
      ctx.fillRect(x + 15, 570 - height, 4, 4);
      ctx.fillStyle = palette.decor;
    }
  } else if (theme.id === "station") {
    for (let y = 125; y < 620; y += 92) {
      ctx.fillRect(78, y, W - 156, 5);
      for (let x = 96; x < W - 94; x += 48) ctx.fillRect(x, y - 8, 7, 21);
    }
    for (let x = 150; x < W - 120; x += 220) {
      ctx.fillRect(x, 92, 80, 5);
      ctx.fillRect(x, 92, 5, 24);
      ctx.fillRect(x + 75, 92, 5, 24);
    }
  } else if (theme.id === "castle") {
    [[170, 170], [610, 115], [1010, 310], [620, 560]].forEach(([x, y], index) => {
      const offset = (frame + index) % 3;
      ctx.fillRect(x - 24, y - 3, 48, 6);
      ctx.fillRect(x - 3, y - 24, 6, 48);
      ctx.fillRect(x - 15 + offset * 3, y - 15, 6, 6);
      ctx.fillRect(x + 9 - offset * 3, y + 9, 6, 6);
    });
  } else if (theme.id === "vault") {
    for (let y = 105, row = 0; y < 620; y += 86, row += 1) {
      for (let x = 105 + (row % 2) * 45; x < W - 90; x += 90) {
        ctx.fillRect(x - 12, y - 4, 24, 8);
        ctx.fillRect(x - 4, y - 12, 8, 24);
        ctx.fillStyle = palette.floor;
        ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = palette.decor;
      }
    }
  } else if (theme.id === "clocktower") {
    [[170, 155], [600, 120], [1015, 325], [610, 565]].forEach(([x, y], index) => {
      const tick = (frame + index) % 4;
      ctx.fillRect(x - 22, y - 4, 44, 8);
      ctx.fillRect(x - 4, y - 22, 8, 44);
      ctx.fillStyle = palette.floorAlt;
      ctx.fillRect(x - 8 + tick * 4, y - 8, 16 - tick * 4, 16);
      ctx.fillStyle = palette.decor;
    });
  } else if (theme.id === "inferno") {
    for (let x = 94, index = 0; x < W - 80; x += 92, index += 1) {
      const flame = 8 + ((frame + index) % 3) * 4;
      ctx.fillRect(x, 608 - flame, 8, flame);
      ctx.fillRect(x - 5, 608 - Math.floor(flame * 0.55), 18, 5);
    }
    [[150, 200], [450, 510], [720, 210], [1015, 520]].forEach(([x, y], index) => {
      const pulse = (frame + index) % 4;
      ctx.fillRect(x - 24, y - 3, 48, 6);
      ctx.fillRect(x - 3, y - 24, 6, 48);
      ctx.fillStyle = pulse < 2 ? "#ffb347" : palette.floorAlt;
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = palette.decor;
    });
  }
  ctx.restore();
}

function drawWalls() {
  const palette = canvasArtPalette();
  for (const wall of level.walls) {
    ctx.fillStyle = "rgba(23,35,58,.28)";
    ctx.fillRect(wall.x + 7, wall.y + 8, wall.w, wall.h);

    ctx.fillStyle = ACTOR_COLORS.outline;
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.fillStyle = palette.wallSide;
    ctx.fillRect(wall.x + 3, wall.y + 3, Math.max(0, wall.w - 6), Math.max(0, wall.h - 6));
    ctx.fillStyle = palette.wallTop;
    ctx.fillRect(wall.x + 3, wall.y + 3, Math.max(0, wall.w - 10), Math.max(0, wall.h - 10));

    ctx.fillStyle = palette.wallHighlight;
    if (wall.w > wall.h) {
      ctx.fillRect(wall.x + 7, wall.y + 7, Math.max(0, wall.w - 18), 3);
      for (let x = wall.x + 14; x < wall.x + wall.w - 10; x += 28) ctx.fillRect(x, wall.y + 15, 6, 5);
    } else {
      ctx.fillRect(wall.x + 7, wall.y + 7, 3, Math.max(0, wall.h - 18));
      for (let y = wall.y + 14; y < wall.y + wall.h - 10; y += 28) ctx.fillRect(wall.x + 15, y, 5, 6);
    }
  }
}

const CANVAS_LABEL_BOUNDS = Object.freeze({ x: 64, y: 62, w: W - 128, h: H - 118 });

function canvasLabelFontSize(requestedCssPixels = 12) {
  return clamp(worldUnitsForCssPixels(requestedCssPixels), 11, 16);
}

function canvasLabelObstacles() {
  return [
    ...level.walls,
    ...level.doors,
    ...level.plates.map((plate) => ({ x: plate.x - 25, y: plate.y - 25, w: 50, h: 50 })),
    ...(level.items || [])
      .filter((item) => !collectedItemIds.has(item.id))
      .map((item) => ({ x: item.x - 22, y: item.y - 22, w: 44, h: 48 })),
    ...(keyCollected ? [] : [{ x: level.key.x - 25, y: level.key.y - 18, w: 50, h: 38 }]),
    { x: level.exit.x - 21, y: level.exit.y - 23, w: 42, h: 52 },
  ];
}

function queueCanvasLabel({
  text,
  objectRect,
  preferredSides = ["bottom", "top", "right", "left"],
  color = "#ffffff",
  background = ACTOR_COLORS.outline,
  border = null,
  fontSize = canvasLabelFontSize(),
  minWidth = worldUnitsForCssPixels(58),
  maxWidth = worldUnitsForCssPixels(132),
  horizontalPadding = worldUnitsForCssPixels(8),
  verticalPadding = worldUnitsForCssPixels(5),
  gap = worldUnitsForCssPixels(6),
  obstacles = canvasLabelObstacles(),
}) {
  const labelText = String(text ?? "");
  ctx.save();
  ctx.font = `900 ${fontSize}px "Galmuri11", "Malgun Gothic", sans-serif`;
  const measuredWidth = ctx.measureText(labelText).width;
  ctx.restore();
  const width = clamp(measuredWidth + horizontalPadding * 2, minWidth, maxWidth);
  const height = Math.max(fontSize * 1.45 + verticalPadding * 2, worldUnitsForCssPixels(23));
  const placement = placeCanvasLabel({
    objectRect,
    width,
    height,
    bounds: CANVAS_LABEL_BOUNDS,
    obstacles,
    occupied: canvasLabelRects,
    preferredSides,
    gap,
    clearance: worldUnitsForCssPixels(2),
  });
  canvasLabels.push({
    text: labelText,
    x: placement.x,
    y: placement.y,
    width,
    height,
    fontSize,
    color,
    background,
    border,
    rect: placement.rect,
  });
  canvasLabelRects.push(placement.rect);
}

function drawCanvasLabels() {
  const viewportInset = worldUnitsForCssPixels(3);
  const visibleBounds = {
    x: -renderView.offsetX / Math.max(renderView.scale, 0.001),
    y: -renderView.offsetY / Math.max(renderView.scale, 0.001),
    w: canvas.width / Math.max(renderView.scale, 0.001),
    h: canvas.height / Math.max(renderView.scale, 0.001),
  };
  for (const label of canvasLabels) {
    // Portrait play uses a horizontal tracking camera. Hiding an off-camera
    // plaque as one unit prevents clipped black fragments at either edge.
    if (renderView.zoomed && !rectFullyInsideBounds(label.rect, visibleBounds, viewportInset)) continue;
    const left = Math.round(label.x - label.width / 2);
    const top = Math.round(label.y - label.height / 2);
    const width = Math.round(label.width);
    const height = Math.round(label.height);
    ctx.save();
    ctx.shadowColor = "rgba(4,9,20,.24)";
    ctx.shadowBlur = worldUnitsForCssPixels(2);
    ctx.shadowOffsetY = worldUnitsForCssPixels(1);
    ctx.fillStyle = label.background;
    ctx.fillRect(left, top, width, height);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (label.border) {
      ctx.strokeStyle = label.border;
      ctx.lineWidth = Math.max(1, worldUnitsForCssPixels(1));
      ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
    }
    ctx.fillStyle = label.color;
    ctx.font = `900 ${label.fontSize}px "Galmuri11", "Malgun Gothic", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.text, label.x, label.y + label.fontSize * 0.04, label.width - worldUnitsForCssPixels(8));
    ctx.restore();
  }
}

function drawPlatesAndDoors(now) {
  level.plates.forEach((plate, plateIndex) => {
    const active = plateStates.get(plate.id);
    const visualRadius = 22;
    ctx.save();
    ctx.translate(plate.x, plate.y);
    ctx.shadowBlur = active ? 18 : 5;
    ctx.shadowColor = active ? "#7bffd4" : "#2e7890";
    ctx.fillStyle = active ? "rgba(123,255,212,.22)" : "rgba(49,113,135,.14)";
    ctx.strokeStyle = active ? "#7bffd4" : "#377b8f";
    ctx.lineWidth = active ? 4 : 2;
    ctx.beginPath(); ctx.arc(0, 0, visualRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = active ? 1 : 0.75;
    ctx.fillStyle = active ? "#7bffd4" : "#6a9baa";
    ctx.fillRect(-12, -8, 24, 16);
    ctx.fillStyle = active ? "#173a46" : "#d5eef4";
    ctx.fillRect(-7, -3, 4, 6);
    ctx.fillRect(3, -3, 4, 6);
    ctx.restore();
    queueCanvasLabel({
      text: t(settings.language, "echoPlate", { value: plateIndex + 1 }),
      objectRect: { x: plate.x - visualRadius, y: plate.y - visualRadius, w: visualRadius * 2, h: visualRadius * 2 },
      preferredSides: ["bottom", "top", "right", "left"],
      color: active ? "#d9fff2" : "#ffffff",
      border: active ? "#7bffd4" : "#377b8f",
      minWidth: worldUnitsForCssPixels(66),
    });
  });

  level.doors.forEach((door, index) => {
    const open = doorStates[index];
    ctx.save();
    if (open) {
      ctx.strokeStyle = "rgba(123,255,212,.52)";
      ctx.setLineDash([7, 8]);
      ctx.lineWidth = 2;
      ctx.strokeRect(door.x + 3, door.y + 3, door.w - 6, door.h - 6);
      ctx.setLineDash([]);
    } else {
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#ff365e";
      ctx.fillStyle = "rgba(255,54,94,.12)";
      ctx.fillRect(door.x, door.y, door.w, door.h);
      ctx.strokeStyle = "rgba(255,78,111,.9)";
      ctx.lineWidth = 3;
      for (let y = door.y + 6; y < door.y + door.h; y += 15) {
        ctx.beginPath(); ctx.moveTo(door.x + 4, y); ctx.lineTo(door.x + door.w - 4, y); ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    ctx.restore();
    const doorNumber = Math.max(1, level.plates.findIndex((plate) => plate.id === door.plateId) + 1);
    const doorLabel = t(settings.language, open ? "doorOpenLabel" : "doorLockedLabel", { value: doorNumber });
    const verticalDoor = door.h > door.w;
    queueCanvasLabel({
      text: doorLabel,
      objectRect: door,
      preferredSides: verticalDoor ? ["right", "left", "top", "bottom"] : ["top", "bottom", "right", "left"],
      color: open ? "#d9fff2" : "#ffd5df",
      border: open ? "#7bffd4" : "#ff4e6f",
      minWidth: worldUnitsForCssPixels(70),
    });
  });
}

function drawItems(now) {
  const pulse = reducedMotionQuery.matches ? 0 : Math.floor(now / 180) % 2;
  for (const item of level.items || []) {
    if (collectedItemIds.has(item.id)) continue;
    const type = itemType(item);
    if (!type) continue;
    const bob = pulse ? -2 : 0;
    ctx.save();
    ctx.translate(Math.round(item.x), Math.round(item.y + bob));
    ctx.fillStyle = "rgba(23,35,58,.22)";
    ctx.fillRect(-14, 18, 28, 5);
    if (item.type === "time") {
      ctx.fillStyle = ACTOR_COLORS.outline;
      ctx.fillRect(-14, -14, 28, 28);
      ctx.fillRect(-18, -5, 36, 10);
      ctx.fillRect(-5, -18, 10, 36);
      ctx.fillStyle = type.main;
      ctx.fillRect(-10, -10, 20, 20);
      ctx.fillStyle = type.light;
      ctx.fillRect(-2, -8, 4, 9);
      ctx.fillRect(-2, -1, 9, 4);
    } else if (item.type === "shield") {
      ctx.fillStyle = ACTOR_COLORS.outline;
      ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(17, -12); ctx.lineTo(14, 8); ctx.lineTo(0, 20); ctx.lineTo(-14, 8); ctx.lineTo(-17, -12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = type.main;
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(11, -8); ctx.lineTo(9, 5); ctx.lineTo(0, 13); ctx.lineTo(-9, 5); ctx.lineTo(-11, -8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = type.light;
      ctx.fillRect(-2, -8, 4, 15);
      ctx.fillRect(-7, -2, 14, 4);
    } else {
      ctx.fillStyle = ACTOR_COLORS.outline;
      ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(15, -3); ctx.lineTo(0, 19); ctx.lineTo(-15, -3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = type.main;
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(10, -2); ctx.lineTo(0, 13); ctx.lineTo(-10, -2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = type.light;
      ctx.fillRect(-4, -9, 5, 8);
    }
    ctx.restore();
    queueCanvasLabel({
      text: t(settings.language, type.nameKey),
      objectRect: { x: item.x - 20, y: item.y + bob - 21, w: 40, h: 45 },
      preferredSides: ["bottom", "top", "right", "left"],
      color: type.light,
      border: type.main,
      minWidth: worldUnitsForCssPixels(64),
    });
  }
}

function drawKey(now) {
  if (keyCollected) return;
  const phase = Math.floor(now / 120) % 8;
  const bob = [0, -1, -2, -3, -2, -1, 0, 1][phase];
  const shimmer = [0, 2, 3, 2, 0, -2, -3, -2][phase];
  const keyType = level.keyType || KEY_TYPES.clockwork;
  const palette = keyType.palette;
  ctx.save();
  ctx.translate(Math.round(level.key.x), Math.round(level.key.y + bob));
  ctx.fillStyle = "rgba(23,35,58,.24)";
  ctx.fillRect(-16, 13, 34, 4);

  // A chunky toy key reads clearly at mobile size without dominating the map.
  ctx.fillStyle = ACTOR_COLORS.outline;
  ctx.beginPath();
  ctx.moveTo(-17, -7); ctx.lineTo(-11, -13); ctx.lineTo(-3, -13);
  ctx.lineTo(4, -7); ctx.lineTo(4, -5); ctx.lineTo(19, -5);
  ctx.lineTo(19, 5); ctx.lineTo(14, 5); ctx.lineTo(14, 10);
  ctx.lineTo(8, 10); ctx.lineTo(8, 5); ctx.lineTo(4, 5);
  ctx.lineTo(-3, 12); ctx.lineTo(-11, 12); ctx.lineTo(-17, 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.main;
  ctx.beginPath();
  ctx.moveTo(-13, -5); ctx.lineTo(-9, -9); ctx.lineTo(-4, -9);
  ctx.lineTo(1, -5); ctx.lineTo(1, -1); ctx.lineTo(15, -1);
  ctx.lineTo(15, 2); ctx.lineTo(10, 2); ctx.lineTo(10, 6);
  ctx.lineTo(8, 6); ctx.lineTo(8, 2); ctx.lineTo(1, 2);
  ctx.lineTo(-4, 8); ctx.lineTo(-9, 8); ctx.lineTo(-13, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.light;
  ctx.fillRect(-9, -6, 5, 3);
  ctx.fillRect(2, 0, 10, 2);
  ctx.fillStyle = palette.dark;
  ctx.fillRect(-9, -2, 5, 5);

  // Small sparkles keep the key visible over a red radar cone.
  ctx.fillStyle = phase % 2 ? "#ffffff" : "#fff2a8";
  ctx.fillRect(-22 + shimmer, -1, 5, 2);
  ctx.fillRect(-20 + shimmer, -3, 2, 6);
  ctx.fillRect(20 - shimmer, 1, 4, 2);
  ctx.fillRect(21 - shimmer, -1, 2, 6);
  ctx.restore();

  queueCanvasLabel({
    text: t(settings.language, keyType.nameKey),
    objectRect: { x: level.key.x - 24, y: level.key.y + bob - 17, w: 48, h: 35 },
    preferredSides: ["bottom", "left", "right", "top"],
    color: palette.light,
    border: palette.main,
    minWidth: worldUnitsForCssPixels(62),
  });
}

function drawExit(now) {
  const active = player?.hasKey;
  const phase = Math.floor(now / 140) % 4;
  ctx.save();
  ctx.translate(Math.round(level.exit.x), Math.round(level.exit.y));
  ctx.fillStyle = "rgba(23,35,58,.25)";
  ctx.fillRect(-16, 21, 32, 4);

  ctx.fillStyle = ACTOR_COLORS.outline;
  ctx.fillRect(-16, -20, 32, 43);
  ctx.fillStyle = active ? "#147a61" : "#6f4435";
  ctx.fillRect(-13, -17, 26, 36);
  ctx.fillStyle = active ? ACTOR_COLORS.exit : "#9b5b3d";
  ctx.fillRect(-10, -14, 20, 30);

  if (active) {
    // The open portal is a dark doorway with animated green forward arrows.
    ctx.fillStyle = "#102f35";
    ctx.fillRect(-8, -12, 16, 26);
    ctx.fillStyle = phase % 2 ? "#b8ffe1" : "#8af1c6";
    for (let y = -9 + phase; y < 10; y += 10) {
      ctx.fillRect(-5, y, 3, 2);
      ctx.fillRect(-2, y + 2, 4, 3);
      ctx.fillRect(2, y, 3, 2);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-20, -1, 4, 2);
    ctx.fillRect(16, -1, 4, 2);
  } else {
    // A rusty padlock communicates the blocked state without relying on text.
    ctx.strokeStyle = ACTOR_COLORS.outline;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -5, 7, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = "#c27a43";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -5, 7, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = ACTOR_COLORS.outline;
    ctx.fillRect(-11, -4, 22, 19);
    ctx.fillStyle = "#b8643b";
    ctx.fillRect(-8, -1, 16, 13);
    ctx.fillStyle = "#f0a34e";
    ctx.fillRect(-6, 2, 5, 3);
    ctx.fillStyle = ACTOR_COLORS.outline;
    ctx.fillRect(-2, 5, 4, 7);
    ctx.fillStyle = "rgba(76,38,31,.75)";
    ctx.fillRect(5, 7, 2, 2);
    ctx.fillRect(-8, 9, 3, 2);
  }
  ctx.restore();

  queueCanvasLabel({
    text: active ? t(settings.language, "escapeNow") : t(settings.language, "lockedExit"),
    objectRect: { x: level.exit.x - 20, y: level.exit.y - 23, w: 40, h: 50 },
    preferredSides: ["bottom", "left", "top", "right"],
    color: active ? "#d8fff0" : "#ffe2bd",
    border: active ? ACTOR_COLORS.exit : "#c27a43",
    minWidth: worldUnitsForCssPixels(72),
  });
}

function drawVisionCones() {
  for (const guard of guards) {
    const alerted = guard.seesCurrent || guard.targetPoint;
    const polygon = guard.visionPolygon || buildVisionPolygon(guard);
    if (polygon.length < 3) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let index = 1; index < polygon.length; index += 1) ctx.lineTo(polygon[index].x, polygon[index].y);
    ctx.closePath();
    const gradient = ctx.createRadialGradient(guard.x, guard.y, 8, guard.x, guard.y, guard.range);
    gradient.addColorStop(0, alerted ? "rgba(210,38,58,.32)" : "rgba(210,38,58,.2)");
    gradient.addColorStop(0.7, alerted ? "rgba(210,38,58,.18)" : "rgba(210,38,58,.1)");
    gradient.addColorStop(1, "rgba(210,38,58,.025)");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = alerted ? "rgba(183,24,48,.9)" : "rgba(183,24,48,.62)";
    ctx.lineWidth = guard.boss ? 3 : 2;
    ctx.stroke();

    if (alerted) {
      ctx.clip();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = ACTOR_COLORS.danger;
      const top = Math.floor((guard.y - guard.range) / 24) * 24;
      for (let y = top; y <= guard.y + guard.range; y += 24) {
        ctx.fillRect(guard.x - guard.range, y, guard.range * 2, 3);
      }
    }
    ctx.restore();
  }
}

function drawWeaponTelegraphs() {
  for (const guard of guards) {
    const kind = projectileKindForGuard(guard);
    if (!kind || guard.aimStartedAt == null || !guard.aimTargetPoint) continue;
    const profile = PROJECTILE_PROFILES[kind];
    const progress = clamp((loopElapsed - guard.aimStartedAt) / profile.telegraphMs, 0, 1);
    const color = kind === "arrow" ? "#ff9f43" : "#35cff2";
    const target = guard.aimTargetPoint;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 + progress * 2;
    ctx.globalAlpha = 0.5 + progress * 0.4;
    ctx.setLineDash(kind === "arrow" ? [10, 7] : [5, 6]);
    ctx.beginPath();
    ctx.moveTo(guard.x, guard.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const radius = kind === "arrow" ? 11 + progress * 4 : 15 + progress * 5;
    ctx.beginPath();
    ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(target.x - 2, target.y - radius - 5, 4, 6);
    ctx.restore();
  }
}

function drawProjectiles() {
  for (const projectile of projectiles) {
    const { x, y, z = 0 } = projectile.position;
    ctx.save();
    ctx.globalAlpha = clamp(0.25 + (1 - z / Math.max(1, projectile.launch.apexHeight)) * 0.35, 0.2, 0.6);
    ctx.fillStyle = ACTOR_COLORS.outline;
    if (projectile.kind === "arrow") ctx.fillRect(x - 8, y - 2, 16, 4);
    else {
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.translate(Math.round(x), Math.round(y - z));
    if (projectile.kind === "arrow") {
      ctx.rotate(projectile.angle);
      ctx.strokeStyle = ACTOR_COLORS.outline;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = "#ff7a33";
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(7, -5); ctx.lineTo(7, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff1ce";
      ctx.fillRect(-15, -5, 4, 10);
    } else {
      const radius = 11 + Math.sin(projectile.ageMs / 55) * 1.5;
      ctx.fillStyle = ACTOR_COLORS.outline;
      ctx.beginPath(); ctx.arc(0, 0, radius + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#62e7ff";
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#15506d";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-radius, 0); ctx.lineTo(radius, 0); ctx.moveTo(0, -radius); ctx.lineTo(0, radius); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHeldKey(actor, spriteSize = 48) {
  if (actor !== player || !player.hasKey) return;
  ctx.save();
  ctx.translate(Math.round(actor.x), Math.round(actor.y - spriteSize * 0.58));
  ctx.fillStyle = ACTOR_COLORS.outline;
  ctx.fillRect(-8, -6, 9, 12);
  ctx.fillRect(0, -2, 10, 5);
  ctx.fillRect(6, 2, 4, 5);
  ctx.fillStyle = level.keyType?.palette?.main || ACTOR_COLORS.target;
  ctx.fillRect(-5, -3, 4, 6);
  ctx.fillRect(0, 0, 7, 2);
  ctx.fillStyle = level.keyType?.palette?.light || "#fff4a8";
  ctx.fillRect(-4, -2, 2, 2);
  ctx.restore();
}

function drawDuckAgentSprite(actor, isEcho, index) {
  const sprite = duckSpriteFor(actor.angle, loopElapsed, state === "playing");
  if (!imageReady(sprite)) return false;
  const echoPalette = ECHO_COLORS[index % ECHO_COLORS.length];
  const size = renderView.zoomed ? 68 : 58;
  const x = Math.round(actor.x);
  const y = Math.round(actor.y);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = isEcho ? 0.28 : 0.24;
  ctx.fillStyle = isEcho ? echoPalette.body : ACTOR_COLORS.outline;
  ctx.fillRect(x - size * 0.34, y + size * 0.31, size * 0.68, Math.max(3, size * 0.1));
  if (isEcho) {
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = echoPalette.body;
    ctx.fillRect(x - size * 0.48, y - size * 0.48, size * 0.96, size * 0.96);
  }
  ctx.globalAlpha = isEcho ? 0.72 : 1;
  ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  if (isEcho) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = echoPalette.trim;
    ctx.lineWidth = Math.max(2, size * 0.05);
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x - size * 0.46, y - size * 0.46, size * 0.92, size * 0.92);
    ctx.setLineDash([]);
    const badgeSize = Math.max(16, Math.min(28, worldUnitsForCssPixels(14)));
    const badgeY = y - size * 0.57;
    ctx.fillStyle = ACTOR_COLORS.outline;
    ctx.fillRect(x - badgeSize / 2, badgeY - badgeSize / 2, badgeSize, badgeSize);
    ctx.fillStyle = echoPalette.trim;
    ctx.font = `900 ${badgeSize * 0.62}px "Galmuri11", "Malgun Gothic", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), x, badgeY + 1);
  }
  ctx.restore();
  if (!isEcho) drawHeldKey(actor, size);
  return true;
}

function drawAgent(actor, isEcho = false, index = 0) {
  if (drawDuckAgentSprite(actor, isEcho, index)) return;
  const unit = renderView.zoomed ? 3 : 2;
  const echoPalette = ECHO_COLORS[index % ECHO_COLORS.length];
  const bodyColor = isEcho ? echoPalette.body : resolvedPlayerColor();
  const outlineColor = ACTOR_COLORS.outline;
  const facingX = Math.cos(actor.angle);
  const facingY = Math.sin(actor.angle);
  const directionX = Math.abs(facingX) > 0.32 ? Math.sign(facingX) : 0;
  const directionY = Math.abs(facingY) > 0.32 ? Math.sign(facingY) : 0;
  ctx.save();
  ctx.translate(Math.round(actor.x), Math.round(actor.y));

  ctx.globalAlpha = isEcho ? 0.5 : 0.25;
  ctx.fillStyle = ACTOR_COLORS.outline;
  ctx.fillRect(-6 * unit, 6 * unit, 12 * unit, 3 * unit);

  ctx.globalAlpha = isEcho ? 0.92 : 1;
  ctx.fillStyle = isEcho ? echoPalette.trim : ACTOR_COLORS.scarf;
  for (const step of [7, 10]) {
    ctx.fillRect(Math.round(-facingX * step * unit) - unit, Math.round(-facingY * step * unit) - unit, unit * 2, unit * 2);
  }

  ctx.fillStyle = outlineColor;
  ctx.fillRect(-3 * unit, 5 * unit, 3 * unit, 4 * unit);
  ctx.fillRect(unit, 5 * unit, 3 * unit, 4 * unit);
  ctx.fillRect(-6 * unit, -5 * unit, 12 * unit, 10 * unit);
  ctx.fillRect(-5 * unit, -7 * unit, 10 * unit, 14 * unit);

  ctx.globalAlpha = isEcho ? 0.88 : 1;
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-5 * unit, -4 * unit, 10 * unit, 8 * unit);
  ctx.fillRect(-4 * unit, -6 * unit, 8 * unit, 12 * unit);
  ctx.fillStyle = isEcho ? echoPalette.trim : ACTOR_COLORS.face;
  ctx.fillRect(-4 * unit, -3 * unit, 8 * unit, 4 * unit);
  if (!isEcho) {
    ctx.fillStyle = ACTOR_COLORS.scarf;
    ctx.fillRect(-4 * unit, 2 * unit, 8 * unit, unit);
    ctx.fillStyle = ACTOR_COLORS.target;
    ctx.fillRect(-unit, unit, 2 * unit, 2 * unit);
  }

  const eyeShiftX = directionX * unit;
  const eyeShiftY = directionY * Math.max(1, unit - 1);
  ctx.fillStyle = outlineColor;
  ctx.fillRect(-3 * unit + eyeShiftX, -2 * unit + eyeShiftY, unit, unit);
  ctx.fillRect(unit + eyeShiftX, -2 * unit + eyeShiftY, unit, unit);
  ctx.fillRect(-unit, -6 * unit, 2 * unit, unit);
  ctx.fillRect(0, -8 * unit, unit, 2 * unit);

  if (isEcho) {
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = ACTOR_COLORS.echoDark;
    ctx.fillRect(-5 * unit, -unit, 10 * unit, unit);
    ctx.fillRect(-4 * unit, 3 * unit, 8 * unit, unit);
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = echoPalette.trim;
    ctx.lineWidth = unit;
    ctx.setLineDash([unit * 2, unit * 2]);
    ctx.strokeRect(-7 * unit, -8 * unit, 14 * unit, 16 * unit);
    ctx.setLineDash([]);

    ctx.fillStyle = ACTOR_COLORS.outline;
    ctx.fillRect(-5 * unit, -14 * unit, 10 * unit, 6 * unit);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${unit * 4}px "Cascadia Mono", Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), 0, -11 * unit);
  }
  ctx.restore();

  if (!isEcho) drawHeldKey(actor, unit * 22);
}

function drawEchoTrail(echo, index) {
  const color = ECHO_COLORS[index % ECHO_COLORS.length].body;
  ctx.save();
  const drawTrailLine = () => {
    ctx.beginPath();
    const start = Math.max(0, loopElapsed - 1600);
    for (let t = start; t <= loopElapsed; t += 100) {
      const pose = poseAt(echo.recording, t);
      if (t === start) ctx.moveTo(pose.x, pose.y);
      else ctx.lineTo(pose.x, pose.y);
    }
    ctx.stroke();
  };
  ctx.strokeStyle = ACTOR_COLORS.outline;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 6;
  ctx.setLineDash([6, 7]);
  drawTrailLine();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = 3;
  drawTrailLine();
  ctx.restore();
}

function drawGuardStatusLabel(guard, unit, alerted, objectRect) {
  const labelFontSize = Math.max(guard.boss ? 14 : 12, Math.min(18, worldUnitsForCssPixels(12)));
  if (guard.boss) {
    queueCanvasLabel({
      text: `${t(settings.language, "boss")} Z`,
      objectRect,
      preferredSides: ["top", "right", "left", "bottom"],
      color: "#fff1b6",
      border: ACTOR_COLORS.bossGold,
      fontSize: labelFontSize,
      minWidth: worldUnitsForCssPixels(72),
      maxWidth: worldUnitsForCssPixels(108),
      horizontalPadding: worldUnitsForCssPixels(8),
    });
  } else if (alerted) {
    queueCanvasLabel({
      text: "!",
      objectRect,
      preferredSides: ["top", "right", "left", "bottom"],
      color: "#ffffff",
      background: ACTOR_COLORS.danger,
      border: "#ffffff",
      fontSize: labelFontSize,
      minWidth: worldUnitsForCssPixels(27),
      maxWidth: worldUnitsForCssPixels(34),
      horizontalPadding: worldUnitsForCssPixels(5),
    });
  } else {
    const marker = { sleepy: "●", listener: "♪", watcher: "➶", scanner: "☀", chaser: "⊕", elite: "★" }[guard.type] || guard.symbol;
    queueCanvasLabel({
      text: marker,
      objectRect,
      preferredSides: ["top", "right", "left", "bottom"],
      color: "#fff0d0",
      background: ACTOR_COLORS.guardDark,
      border: guard.color,
      fontSize: labelFontSize,
      minWidth: worldUnitsForCssPixels(27),
      maxWidth: worldUnitsForCssPixels(34),
      horizontalPadding: worldUnitsForCssPixels(5),
    });
  }
  if (loopElapsed < guard.confusedUntil) {
    queueCanvasLabel({
      text: "?",
      objectRect,
      preferredSides: ["top", "left", "right", "bottom"],
      color: "#d8fbff",
      background: ACTOR_COLORS.echoDark,
      border: "#62e7ff",
      fontSize: labelFontSize,
      minWidth: worldUnitsForCssPixels(27),
      maxWidth: worldUnitsForCssPixels(34),
      horizontalPadding: worldUnitsForCssPixels(5),
    });
  }
}

function drawGuard(guard, now) {
  const alerted = guard.seesCurrent || guard.targetPoint;
  const unit = guard.boss ? 3 : renderView.zoomed ? 3 : 2;
  const bodyColor = guard.boss ? ACTOR_COLORS.boss : ACTOR_COLORS.guard;
  const trimColor = alerted ? ACTOR_COLORS.danger : guard.color;
  const facingX = Math.cos(guard.angle);
  const facingY = Math.sin(guard.angle);
  const sprite = guardSpriteFor(guard.type, guard.angle);
  if (imageReady(sprite)) {
    const size = guard.boss ? (renderView.zoomed ? 90 : 82) : (renderView.zoomed ? 76 : 66);
    const x = Math.round(guard.x);
    const y = Math.round(guard.y);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = ACTOR_COLORS.outline;
    ctx.fillRect(x - size * 0.34, y + size * 0.31, size * 0.68, Math.max(3, size * 0.1));
    if (guard.boss) {
      const haloPhase = reducedMotionQuery.matches ? -1 : Math.floor(now / 160) % 4;
      [[0, -0.55], [0.55, 0], [0, 0.55], [-0.55, 0]].forEach(([dx, dy], index) => {
        ctx.fillStyle = index === haloPhase ? "#fff3a8" : ACTOR_COLORS.bossGold;
        const dot = Math.max(5, size * 0.09);
        ctx.fillRect(x + dx * size - dot / 2, y + dy * size - dot / 2, dot, dot);
      });
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    if (alerted) {
      ctx.strokeStyle = ACTOR_COLORS.danger;
      ctx.lineWidth = Math.max(3, size * 0.05);
      ctx.strokeRect(x - size * 0.43, y - size * 0.45, size * 0.86, size * 0.88);
    }
    ctx.restore();
    drawGuardStatusLabel(guard, unit, alerted, { x: x - size / 2, y: y - size / 2, w: size, h: size });
    return;
  }
  ctx.save();
  ctx.translate(Math.round(guard.x), Math.round(guard.y));

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = ACTOR_COLORS.outline;
  ctx.fillRect(-7 * unit, 6 * unit, 14 * unit, 3 * unit);
  ctx.globalAlpha = 1;

  if (guard.boss) {
    const haloPhase = reducedMotionQuery.matches ? -1 : Math.floor(now / 160) % 4;
    const haloPoints = [[0, -11], [10, 0], [0, 11], [-10, 0]];
    haloPoints.forEach(([x, y], index) => {
      ctx.fillStyle = index === haloPhase ? "#fff3a8" : ACTOR_COLORS.bossGold;
      ctx.fillRect(x * unit - unit, y * unit - unit, unit * 2, unit * 2);
    });
    ctx.fillStyle = ACTOR_COLORS.bossGold;
    ctx.fillRect(-9 * unit, -unit, 18 * unit, 2 * unit);
    ctx.fillRect(-unit, -9 * unit, 2 * unit, 18 * unit);
  }

  ctx.fillStyle = trimColor;
  if (guard.type === "listener") {
    ctx.fillRect(-9 * unit, -4 * unit, 3 * unit, 8 * unit);
    ctx.fillRect(6 * unit, -4 * unit, 3 * unit, 8 * unit);
    ctx.fillRect(-10 * unit, -2 * unit, 2 * unit, 4 * unit);
    ctx.fillRect(8 * unit, -2 * unit, 2 * unit, 4 * unit);
  } else if (guard.type === "watcher") {
    ctx.fillRect(-2 * unit, -10 * unit, 4 * unit, 4 * unit);
    ctx.fillRect(-unit, -13 * unit, 2 * unit, 4 * unit);
  } else if (guard.type === "scanner") {
    ctx.fillRect(-2 * unit, -11 * unit, 4 * unit, 5 * unit);
    ctx.fillRect(-8 * unit, -12 * unit, 16 * unit, 2 * unit);
    ctx.fillRect(-9 * unit, -13 * unit, 3 * unit, 4 * unit);
    ctx.fillRect(6 * unit, -13 * unit, 3 * unit, 4 * unit);
  } else if (guard.type === "chaser") {
    for (const step of [8, 11]) {
      ctx.fillRect(Math.round(-facingX * step * unit) - unit, Math.round(-facingY * step * unit) - unit, unit * 2, unit * 2);
    }
    ctx.fillRect(-9 * unit, -5 * unit, 3 * unit, 5 * unit);
    ctx.fillRect(6 * unit, -5 * unit, 3 * unit, 5 * unit);
  } else if (guard.type === "elite") {
    ctx.fillRect(-9 * unit, -5 * unit, 4 * unit, 8 * unit);
    ctx.fillRect(5 * unit, -5 * unit, 4 * unit, 8 * unit);
  } else {
    ctx.fillRect(-5 * unit, -10 * unit, 5 * unit, 2 * unit);
    ctx.fillRect(-6 * unit, -9 * unit, 2 * unit, 5 * unit);
  }

  ctx.fillStyle = ACTOR_COLORS.outline;
  ctx.fillRect(-3 * unit, 5 * unit, 3 * unit, 4 * unit);
  ctx.fillRect(unit, 5 * unit, 3 * unit, 4 * unit);
  ctx.fillRect(-7 * unit, -5 * unit, 14 * unit, 10 * unit);
  ctx.fillRect(-6 * unit, -7 * unit, 12 * unit, 14 * unit);

  ctx.fillStyle = bodyColor;
  ctx.fillRect(-6 * unit, -4 * unit, 12 * unit, 8 * unit);
  ctx.fillRect(-5 * unit, -6 * unit, 10 * unit, 12 * unit);
  ctx.fillStyle = guard.boss ? ACTOR_COLORS.bossGold : "#ffe0b5";
  ctx.fillRect(-4 * unit, -3 * unit, 8 * unit, 4 * unit);

  const lensX = Math.round(facingX * unit * 2);
  const lensY = Math.round(facingY * unit);
  ctx.fillStyle = alerted ? "#fff6f0" : ACTOR_COLORS.outline;
  if (guard.type === "watcher" || guard.type === "scanner" || guard.boss) {
    ctx.fillRect(-unit + lensX, -2 * unit + lensY, 2 * unit, 2 * unit);
  } else {
    ctx.fillRect(-3 * unit + lensX, -2 * unit + lensY, unit, unit);
    ctx.fillRect(unit + lensX, -2 * unit + lensY, unit, unit);
  }

  ctx.strokeStyle = alerted ? ACTOR_COLORS.danger : trimColor;
  ctx.lineWidth = unit;
  ctx.strokeRect(-7 * unit, -7 * unit, 14 * unit, 14 * unit);
  ctx.restore();

  drawGuardStatusLabel(guard, unit, alerted, {
    x: guard.x - unit * (guard.boss ? 12 : 10),
    y: guard.y - unit * (guard.boss ? 14 : 12),
    w: unit * (guard.boss ? 24 : 20),
    h: unit * (guard.boss ? 26 : 23),
  });
}

function drawNoise() {
  for (const pulse of noisePulses) {
    const radius = (1 - pulse.life) * 150 + 20;
    ctx.save();
    ctx.strokeStyle = pulse.fromEcho ? `rgba(98,231,255,${pulse.life * .5})` : `rgba(255,209,102,${pulse.life * .6})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(pulse.x, pulse.y, radius * .65, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function drawWorldLabels() {
  ctx.fillStyle = `${level.theme.accent}aa`;
  ctx.font = `900 ${renderView.zoomed ? 18 : 11}px "Cascadia Mono", Consolas, monospace`;
  ctx.textAlign = "left";
  ctx.fillText(localizedStage(level).title, 72, 76);
  ctx.textAlign = "right";
  ctx.fillText(level.guards.some((guard) => guard.boss) ? t(settings.language, "bossFloor") : `${t(settings.language, "loop")} ${String(loopNumber).padStart(2, "0")}`, W - 72, 76);
}

function drawMoveTarget(now) {
  if (!moveTarget) return;
  const pulse = reducedMotionQuery.matches ? 0 : Math.floor(now / 180) % 2;
  const size = 14 + pulse * 4;
  ctx.save();
  ctx.translate(Math.round(moveTarget.x), Math.round(moveTarget.y));
  ctx.strokeStyle = level.theme.accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(-size, -size, size * 2, size * 2);
  ctx.beginPath();
  ctx.moveTo(-size - 8, 0); ctx.lineTo(-4, 0);
  ctx.moveTo(size + 8, 0); ctx.lineTo(4, 0);
  ctx.moveTo(0, -size - 8); ctx.lineTo(0, -4);
  ctx.moveTo(0, size + 8); ctx.lineTo(0, 4);
  ctx.stroke();
  ctx.restore();
}

function syncCanvasSize() {
  if (!canvasSizeDirty) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvasSizeDirty = false;
}

function worldUnitsForCssPixels(value) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  return (value * pixelRatio) / Math.max(renderView.scale, 0.001);
}

function updateRenderView() {
  syncCanvasSize();
  const portrait = window.matchMedia("(orientation: portrait) and (max-width: 760px)").matches;
  const scale = portrait ? Math.max(canvas.width / W, canvas.height / H) : Math.min(canvas.width / W, canvas.height / H);
  const visibleWidth = canvas.width / Math.max(scale, 0.001);
  const targetX = portrait && player ? player.x : W / 2;
  cameraX = portrait ? lerp(cameraX, targetX, 0.2) : W / 2;
  cameraX = visibleWidth >= W ? W / 2 : clamp(cameraX, visibleWidth / 2, W - visibleWidth / 2);
  renderView = {
    scale,
    offsetX: canvas.width / 2 - cameraX * scale,
    offsetY: canvas.height / 2 - (H / 2) * scale,
    zoomed: portrait,
  };
}

function screenToWorld(clientX, clientY) {
  updateRenderView();
  const rect = canvas.getBoundingClientRect();
  const screenX = ((clientX - rect.left) / rect.width) * canvas.width;
  const screenY = ((clientY - rect.top) / rect.height) * canvas.height;
  return {
    x: clamp((screenX - renderView.offsetX) / renderView.scale, 66 + PLAYER_RADIUS, W - 66 - PLAYER_RADIUS),
    y: clamp((screenY - renderView.offsetY) / renderView.scale, 56 + PLAYER_RADIUS, H - 56 - PLAYER_RADIUS),
  };
}

function drawArcadeOverlay() {
  if (state !== "countdown" && goFlashRemaining <= 0) return;
  const hasBoss = level.guards.some((guard) => guard.boss);
  const label = state === "countdown" ? (hasBoss && countdownRemaining > 500 ? t(settings.language, "boss") : t(settings.language, "ready")) : t(settings.language, "go");
  const size = Math.max(34, Math.round(Math.min(canvas.width, canvas.height) * 0.13));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(0,0,0,.46)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `900 ${size}px "Cascadia Mono", Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = level.theme.accent;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = Math.max(3, Math.round(size * 0.08));
  ctx.shadowOffsetY = Math.max(3, Math.round(size * 0.08));
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

function render(now) {
  const visualNow = reducedMotionQuery.matches ? 0 : now;
  const shakeX = shake ? (Math.random() - 0.5) * shake : 0;
  const shakeY = shake ? (Math.random() - 0.5) * shake : 0;
  updateRenderView();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#020407";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(renderView.scale, 0, 0, renderView.scale, renderView.offsetX, renderView.offsetY);
  ctx.translate(shakeX, shakeY);
  canvasLabels = [];
  canvasLabelRects = [];
  drawGrid();
  drawThemeDecor(visualNow);
  drawVisionCones();
  drawWeaponTelegraphs();
  drawWorldLabels();
  drawExit(visualNow);
  drawPlatesAndDoors(visualNow);
  drawWalls();
  drawItems(visualNow);
  drawKey(visualNow);
  drawMoveTarget(visualNow);
  echoes.forEach(drawEchoTrail);
  drawNoise();
  if (player) drawAgent(player, false, 0);
  echoes.forEach((echo, index) => drawAgent(echo, true, index));
  guards.forEach((guard) => drawGuard(guard, visualNow));
  drawProjectiles();
  drawParticles();
  if (!reducedMotionQuery.matches && rewindAmount > 0) {
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(75,215,255,${rewindAmount * .16})`;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(160,245,255,${rewindAmount * .34})`;
    ctx.lineWidth = 2;
    const scanY = H * (1 - rewindAmount);
    ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(W, scanY); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const y = Math.random() * H;
      ctx.fillStyle = `rgba(100,230,255,${Math.random() * rewindAmount * .12})`;
      ctx.fillRect(0, y, W, 1 + Math.random() * 4);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash * .13})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (state === "caught") {
    ctx.fillStyle = "rgba(255,30,65,.13)";
    ctx.fillRect(0, 0, W, H);
  }
  drawCanvasLabels();
  ctx.restore();
  drawArcadeOverlay();
}

function frame(now) {
  const dt = Math.min(0.034, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  update(dt, now);
  render(now);
  requestAnimationFrame(frame);
}

function resetStickInput(pointerId = null) {
  const activePointerId = stickInput.pointerId;
  if (pointerId != null && activePointerId !== pointerId) return;
  stickInput.x = 0;
  stickInput.y = 0;
  stickInput.magnitude = 0;
  stickInput.pointerId = null;
  ui.virtualStick?.classList.remove("is-active");
  if (ui.virtualStickKnob) ui.virtualStickKnob.style.transform = "translate3d(0, 0, 0)";
  ui.virtualStick?.setAttribute("aria-valuetext", t(settings.language, "centerStopped"));
  if (activePointerId != null && ui.virtualStick?.hasPointerCapture?.(activePointerId)) {
    try { ui.virtualStick.releasePointerCapture(activePointerId); } catch {}
  }
}

function updateStickInput(event) {
  if (stickInput.pointerId !== event.pointerId || !ui.virtualStick) return;
  const rect = ui.virtualStick.getBoundingClientRect();
  const knobRadius = (ui.virtualStickKnob?.getBoundingClientRect().width || 48) / 2;
  const projected = projectAnalogStick(event.clientX, event.clientY, rect, { deadzone: 0.14, knobRadius, padding: 6 });
  stickInput.x = projected.x;
  stickInput.y = projected.y;
  stickInput.magnitude = projected.magnitude;
  moveTarget = null;
  moveTargetStuckFor = 0;
  if (ui.virtualStickKnob) {
    ui.virtualStickKnob.style.transform = `translate3d(${projected.knobX}px, ${projected.knobY}px, 0)`;
  }
  ui.virtualStick.setAttribute("aria-valuetext", describeAnalogStick(projected.x, projected.y, projected.magnitude, settings.language));
}

function startStickInput(event) {
  if (state !== "playing" || stickInput.pointerId != null) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  initAudio();
  stickInput.pointerId = event.pointerId;
  ui.virtualStick.classList.add("is-active");
  try { ui.virtualStick.setPointerCapture(event.pointerId); } catch {
    resetStickInput(event.pointerId);
    return;
  }
  updateStickInput(event);
}

function stopStickInput(event) {
  if (stickInput.pointerId !== event.pointerId) return;
  resetStickInput(event.pointerId);
}

function toggleMute() {
  muted = !muted;
  settings.muted = muted;
  saveSettings();
  updateHud();
  showToast(`${t(settings.language, "sound")}: ${t(settings.language, muted ? "off" : "on")}`, 900);
}

function runGameAction(action) {
  initAudio();
  if (action === "noise") triggerNoise();
  else if (action === "save") saveAndRewind();
  else if (action === "restart") restartCurrentLoop();
  else if (action === "undo") undoLastEcho();
  else if (action === "reset") restartWholeLevel();
  else if (action === "menu") showMenu();
  else if (action === "mute") toggleMute();
}

window.addEventListener("keydown", (event) => {
  const interactive = event.target instanceof Element && event.target.closest("button, a, input, select, textarea, [contenteditable='true']");
  if (event.code === "Escape" && ["playing", "countdown", "complete", "caught", "awaiting-save"].includes(state)) {
    event.preventDefault();
    showMenu();
    return;
  }
  if (state === "awaiting-save") {
    if (interactive && ["Space", "Enter"].includes(event.code)) return;
    if (event.repeat && ["KeyX", "KeyR", "Backspace", "KeyM"].includes(event.code)) return;
    if (event.code === "KeyX") saveAndRewind();
    if (event.code === "KeyR") restartCurrentLoop();
    if (event.code === "Backspace") {
      event.preventDefault();
      restartWholeLevel();
    }
    if (event.code === "KeyM") toggleMute();
    return;
  }
  if (state !== "playing") return;
  if (interactive && ["Space", "Enter"].includes(event.code)) return;

  const movementKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  if (movementKeys.includes(event.code)) {
    if (interactive) return;
    keys.add(event.code);
    if (event.code.startsWith("Arrow")) event.preventDefault();
  }
  if (event.repeat && ["KeyZ", "KeyX", "KeyR", "KeyU", "Backspace", "KeyM"].includes(event.code)) return;
  if (event.code === "KeyZ") triggerNoise();
  if (event.code === "KeyX") saveAndRewind();
  if (event.code === "KeyR") restartCurrentLoop();
  if (event.code === "KeyU") undoLastEcho();
  if (event.code === "Backspace") {
    event.preventDefault();
    restartWholeLevel();
  }
  if (event.code === "KeyM") toggleMute();
});

window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  keys.clear();
  resetStickInput();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    resetStickInput();
  }
});

ui.virtualStick?.addEventListener("pointerdown", startStickInput);
ui.virtualStick?.addEventListener("pointermove", updateStickInput);
ui.virtualStick?.addEventListener("pointerup", stopStickInput);
ui.virtualStick?.addEventListener("pointercancel", stopStickInput);
ui.virtualStick?.addEventListener("lostpointercapture", stopStickInput);

canvas.addEventListener("pointerdown", (event) => {
  if (state !== "playing") return;
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  moveTarget = screenToWorld(event.clientX, event.clientY);
  moveTargetStuckFor = 0;
});

ui.touchActions.forEach((button) => {
  button.addEventListener("click", () => runGameAction(button.dataset.gameAction));
});

ui.overlay.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || !ui.overlay.classList.contains("visible")) return;
  const focusable = [...ui.overlay.querySelectorAll("button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!focusable.includes(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

if ("ResizeObserver" in window) {
  new ResizeObserver(() => { canvasSizeDirty = true; }).observe(canvas);
}
window.addEventListener("resize", () => { canvasSizeDirty = true; });
window.addEventListener("orientationchange", () => { canvasSizeDirty = true; });

// Read-only state snapshot used by local smoke/play tests.
window.__LOOP_HEIST_DEBUG__ = {
  snapshot: () => ({
    state,
    levelIndex,
    loopNumber,
    loopElapsed,
    loopLimit,
    scoreRun: { radarHits: runRadarHits, retries: runRetries },
    timeBonusCollected,
    key: { collected: keyCollected, value: keyValueCollected, nameKey: level.keyType?.nameKey },
    items: { collected: [...collectedItemIds], bonus: itemBonusScore, shieldCharges: radarShieldCharges },
    player: player ? { x: player.x, y: player.y, hasKey: player.hasKey, exposure: player.exposure } : null,
    echoes: echoes.map((echo) => {
      const savedEnd = echo.recording.frames[echo.recording.frames.length - 1];
      return { x: echo.x, y: echo.y, savedEnd: savedEnd ? { ...savedEnd } : null };
    }),
    plates: Object.fromEntries(plateStates),
    doors: [...doorStates],
    doorTutorialShown,
    guards: guards.map((guard) => ({ x: guard.x, y: guard.y, type: guard.type, mode: guard.mode, seesCurrent: guard.seesCurrent })),
    input: { stick: { x: stickInput.x, y: stickInput.y, magnitude: stickInput.magnitude, active: stickInput.pointerId != null } },
    moveTarget: moveTarget ? { ...moveTarget } : null,
  }),
};

showMenu(Number.isInteger(localQaStage) && localQaStage >= 1 && localQaStage <= levels.length ? localQaStage - 1 : undefined);
updateHud();
requestAnimationFrame(frame);
