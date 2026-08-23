import { access, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = resolve(import.meta.dirname, "..");
const CAPTURES = resolve(import.meta.dirname, ".work", "captures");
const BASE_URL = process.env.GAME_URL || "http://127.0.0.1:4173/";
const FPS = 6;
const ONLY = new Set((process.env.CAPTURE_ONLY || "").split(",").map((item) => item.trim()).filter(Boolean));
const wants = (name) => ONLY.size === 0 || ONLY.has(name);

async function firstExisting(paths) {
  for (const path of paths) {
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {}
  }
  throw new Error("Chrome 또는 Edge 실행 파일을 찾지 못했습니다.");
}

const executablePath = await firstExisting([
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
]);

const browser = await chromium.launch({ headless: true, executablePath });

async function newPage(viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.error("browser:", message.text());
  });
  return { context, page };
}

async function openStage(page, stage) {
  await page.goto(`${BASE_URL}?qaStage=${stage}&demo=011`, { waitUntil: "networkidle" });
  await page.locator("#quickStart").waitFor({ state: "visible" });
}

async function startStage(page) {
  await page.locator("#quickStart").click();
  await page.locator("#overlay").waitFor({ state: "hidden" });
  await page.waitForFunction(() => window.__LOOP_HEIST_DEBUG__?.snapshot().state === "playing");
  await page.locator("#game").focus();
  await page.waitForTimeout(120);
}

async function record(page, name, durationMs, actions = []) {
  const directory = resolve(CAPTURES, name);
  if (!directory.startsWith(`${CAPTURES}\\`) && directory !== CAPTURES) {
    throw new Error(`캡처 경로가 작업 폴더 밖입니다: ${directory}`);
  }
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const queue = [...actions].sort((a, b) => a.at - b.at);
  let nextAction = 0;
  const started = Date.now();
  let frame = 0;
  while (Date.now() - started < durationMs) {
    const elapsed = Date.now() - started;
    while (nextAction < queue.length && queue[nextAction].at <= elapsed) {
      await queue[nextAction].run(page);
      nextAction += 1;
    }
    await page.screenshot({
      path: resolve(directory, `frame-${String(frame).padStart(4, "0")}.png`),
      animations: "disabled",
    });
    frame += 1;
    const target = started + frame * (1000 / FPS);
    if (target > Date.now()) await page.waitForTimeout(target - Date.now());
  }
  await page.keyboard.up("ArrowUp").catch(() => {});
  await page.keyboard.up("ArrowDown").catch(() => {});
  await page.keyboard.up("ArrowLeft").catch(() => {});
  await page.keyboard.up("ArrowRight").catch(() => {});
  console.log(`${name}: ${frame} frames`);
}

const down = (at, key) => ({ at, run: (page) => page.keyboard.down(key) });
const up = (at, key) => ({ at, run: (page) => page.keyboard.up(key) });
const press = (at, key) => ({ at, run: (page) => page.keyboard.press(key) });

await mkdir(CAPTURES, { recursive: true });

if (wants("stage1")) {
  const { context, page } = await newPage();
  await openStage(page, 1);
  await page.screenshot({ path: resolve(CAPTURES, "capture-00-menu.png") });
  await startStage(page);
  await record(page, "clip-stage1", 7200, [
    down(450, "ArrowRight"), up(1900, "ArrowRight"),
    down(1950, "ArrowUp"), up(3400, "ArrowUp"),
    press(3650, "KeyZ"), down(4050, "ArrowRight"), up(5400, "ArrowRight"),
    press(5650, "KeyX"), down(5900, "ArrowUp"), up(7000, "ArrowUp"),
  ]);
  await context.close();
}

if (wants("controls")) {
  const { context, page } = await newPage();
  await openStage(page, 1);
  await page.locator("#settingsAction").click();
  await page.locator("#gameGuideTitle").waitFor({ state: "visible" });
  await record(page, "clip-controls", 6200, [
    { at: 2600, run: (target) => target.locator("#languageSetting").selectOption("en") },
    { at: 3900, run: (target) => target.locator("#languageSetting").selectOption("ja") },
    { at: 5100, run: (target) => target.locator("#languageSetting").selectOption("ko") },
  ]);
  await context.close();
}

if (wants("stage2")) {
  const { context, page } = await newPage();
  await openStage(page, 2);
  await startStage(page);
  await record(page, "clip-stage2", 10200, [
    down(300, "ArrowUp"), up(1950, "ArrowUp"),
    down(2050, "ArrowRight"), up(2620, "ArrowRight"),
    press(2850, "KeyX"),
    down(3100, "ArrowRight"), up(6100, "ArrowRight"),
    down(6200, "ArrowUp"), up(7100, "ArrowUp"),
    down(7200, "ArrowRight"), up(8000, "ArrowRight"),
  ]);
  await page.screenshot({ path: resolve(CAPTURES, "capture-stage2-door.png") });
  await context.close();
}

if (wants("radar")) {
  const { context, page } = await newPage();
  await openStage(page, 3);
  await startStage(page);
  await record(page, "clip-radar", 7600, [
    down(350, "ArrowRight"), up(2300, "ArrowRight"),
    press(2450, "KeyZ"), down(2700, "ArrowUp"), up(4600, "ArrowUp"),
    down(4800, "ArrowRight"), up(7000, "ArrowRight"),
  ]);
  await context.close();
}

if (wants("weapons")) {
  const { context, page } = await newPage();
  await openStage(page, 5);
  await startStage(page);
  await record(page, "clip-weapons", 8500, [
    down(300, "ArrowUp"), up(2100, "ArrowUp"),
    down(2150, "ArrowRight"), up(4200, "ArrowRight"),
    press(4350, "KeyZ"), down(4700, "ArrowDown"), up(5900, "ArrowDown"),
    down(6000, "ArrowRight"), up(8200, "ArrowRight"),
  ]);
  await context.close();
}

if (wants("teamwork")) {
  const { context, page } = await newPage();
  await openStage(page, 4);
  await startStage(page);
  await record(page, "clip-two-clones", 12200, [
    down(300, "ArrowUp"), up(2080, "ArrowUp"),
    down(2150, "ArrowRight"), up(2720, "ArrowRight"), press(2920, "KeyX"),
    down(3200, "ArrowRight"), up(4150, "ArrowRight"),
    down(4200, "ArrowUp"), up(5090, "ArrowUp"),
    down(5300, "ArrowRight"), up(5900, "ArrowRight"),
    down(5950, "ArrowUp"), up(6840, "ArrowUp"),
    down(6900, "ArrowRight"), up(7520, "ArrowRight"), press(7720, "KeyX"),
    down(8050, "ArrowRight"), up(10550, "ArrowRight"),
  ]);
  await page.screenshot({ path: resolve(CAPTURES, "capture-stage6-open.png") });
  await context.close();
}

if (wants("meta")) {
  const { context, page } = await newPage();
  await openStage(page, 4);
  await page.locator("#recordsAction").click();
  await page.locator("#resetRecords").waitFor({ state: "visible" });
  await record(page, "clip-records", 4600);
  await page.locator("#closeRecords").click();
  await page.locator("#profileAction").click();
  await page.locator("#profileName").waitFor({ state: "visible" });
  await record(page, "clip-profile", 4600, [
    { at: 1800, run: (target) => target.locator('[data-profile-color="#ffd166"]').click() },
    { at: 3000, run: (target) => target.locator('[data-profile-face-index="2"]').click().catch(() => target.locator('[data-profile-face]').nth(2).click()) },
  ]);
  await context.close();
}

if (wants("mobile")) {
  const { context, page } = await newPage({ width: 390, height: 844 });
  await openStage(page, 2);
  await startStage(page);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(850);
  await page.keyboard.up("ArrowRight");
  await page.screenshot({ path: resolve(CAPTURES, "capture-mobile-game.png") });
  await page.locator('[data-game-action="menu"]').click();
  await page.locator("#settingsAction").click();
  await page.locator("#gameGuideTitle").waitFor({ state: "visible" });
  await page.screenshot({ path: resolve(CAPTURES, "capture-mobile-settings.png"), fullPage: false });
  await page.screenshot({ path: resolve(CAPTURES, "capture-mobile-guide.png"), fullPage: false });
  await context.close();
}

if (wants("stage9")) {
  const { context, page } = await newPage();
  await openStage(page, 9);
  await record(page, "clip-stage9-menu", 4200);
  await startStage(page);
  await record(page, "clip-stage9", 9200, [
    down(250, "ArrowRight"), up(900, "ArrowRight"), press(1080, "KeyX"),
    down(1350, "ArrowUp"), up(1850, "ArrowUp"), press(2050, "KeyX"),
    down(2300, "ArrowRight"), down(2300, "ArrowUp"), up(2800, "ArrowRight"), up(2800, "ArrowUp"), press(3000, "KeyX"),
    press(3500, "KeyZ"), down(3900, "ArrowRight"), up(5400, "ArrowRight"),
    down(5550, "ArrowUp"), up(7000, "ArrowUp"),
  ]);
  await context.close();
}

await browser.close();
console.log(`최신 게임 캡처 완료: ${CAPTURES}`);
