import { access, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = resolve(import.meta.dirname, "..");
const CAPTURES = resolve(import.meta.dirname, ".work", "captures");
const BASE_URL = process.env.GAME_URL || "http://127.0.0.1:4173/";
const FPS = Number(process.env.CAPTURE_FPS || 6);
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

async function newPage(viewport = { width: 1280, height: 720 }, reducedMotion = "reduce") {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion,
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.error("browser:", message.text());
  });
  return { context, page };
}

async function openStage(page, stage) {
  await page.goto(`${BASE_URL}?qaStage=${stage}&demo=012`, { waitUntil: "networkidle" });
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
  const started = Date.now();
  const keyEvents = queue.filter((action) => action.keyEvent).map((action) => ({
    at: action.at,
    ...action.keyEvent,
  }));
  await page.evaluate((events) => {
    const dispatch = (type, code) => {
      document.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code,
        bubbles: true,
        cancelable: true,
      }));
    };
    for (const event of events) {
      window.setTimeout(() => {
        if (event.type === "press") {
          dispatch("keydown", event.code);
          window.setTimeout(() => dispatch("keyup", event.code), 32);
        } else {
          dispatch(event.type, event.code);
        }
      }, event.at);
    }
  }, keyEvents);
  let actionError = null;
  const actionTask = (async () => {
    for (const action of queue.filter((item) => !item.keyEvent)) {
      const waitMs = started + action.at - Date.now();
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      await action.run(page);
    }
  })().catch((error) => {
    actionError = error;
  });
  let frame = 0;
  while (Date.now() - started < durationMs) {
    if (actionError) throw actionError;
    await page.screenshot({
      path: resolve(directory, `frame-${String(frame).padStart(4, "0")}.png`),
      animations: "disabled",
    });
    frame += 1;
    const target = started + frame * (1000 / FPS);
    if (target > Date.now()) await page.waitForTimeout(target - Date.now());
  }
  await actionTask;
  if (actionError) throw actionError;
  await page.keyboard.up("ArrowUp").catch(() => {});
  await page.keyboard.up("ArrowDown").catch(() => {});
  await page.keyboard.up("ArrowLeft").catch(() => {});
  await page.keyboard.up("ArrowRight").catch(() => {});
  console.log(`${name}: ${frame} frames`);
}

async function hold(page, key, durationMs) {
  await page.keyboard.down(key);
  await page.waitForTimeout(durationMs);
  await page.keyboard.up(key);
}

async function stage9Snapshot(page, label, predicate) {
  const snapshot = await page.evaluate(() => window.__LOOP_HEIST_DEBUG__.snapshot());
  if (!predicate(snapshot)) {
    throw new Error(`Stage 9 ${label} 검증 실패: ${JSON.stringify(snapshot)}`);
  }
  console.log(`Stage 9 ${label}:`, JSON.stringify({
    state: snapshot.state,
    loopNumber: snapshot.loopNumber,
    loopElapsed: Math.round(snapshot.loopElapsed),
    loopLimit: snapshot.loopLimit,
    echoes: snapshot.echoes.length,
    plates: snapshot.plates,
    doors: snapshot.doors,
    key: snapshot.key.collected,
    retries: snapshot.scoreRun.retries,
  }));
  return snapshot;
}

async function prepareStage9Echoes(page) {
  // A: 첫 분신은 발판 A에 멈춘다.
  await hold(page, "ArrowUp", 1810);
  await hold(page, "ArrowRight", 385);
  await stage9Snapshot(page, "A 준비", (snapshot) => snapshot.plates.A && snapshot.doors[0]);
  await page.keyboard.press("KeyX");
  await page.waitForTimeout(30);

  // B: 경비를 부르고 첫 문을 지나 발판 B에 멈춘다.
  await hold(page, "ArrowUp", 140);
  await page.keyboard.press("KeyZ");
  await hold(page, "ArrowDown", 230);
  await hold(page, "ArrowRight", 690);
  await page.waitForTimeout(3950);
  await hold(page, "ArrowUp", 230);
  await hold(page, "ArrowRight", 330);
  await hold(page, "ArrowUp", 1700);
  await hold(page, "ArrowRight", 230);
  await stage9Snapshot(page, "A와 B 준비", (snapshot) => (
    snapshot.plates.A && snapshot.plates.B && snapshot.doors[0] && snapshot.doors[1]
    && snapshot.scoreRun.retries === 0
  ));
  await page.keyboard.press("KeyX");
  await page.waitForTimeout(30);

  // C: 시간 태엽을 챙겨 남은 두 문을 지나 발판 C에 멈춘다.
  await hold(page, "ArrowUp", 140);
  await page.keyboard.press("KeyZ");
  await hold(page, "ArrowDown", 270);
  await hold(page, "ArrowRight", 385);
  await page.waitForTimeout(4300);
  await hold(page, "ArrowUp", 270);
  await hold(page, "ArrowRight", 640);
  await hold(page, "ArrowUp", 1300);
  await hold(page, "ArrowRight", 1100);
  await hold(page, "ArrowUp", 340);
  await hold(page, "ArrowRight", 300);
  await stage9Snapshot(page, "A B C 준비", (snapshot) => (
    Object.values(snapshot.plates).every(Boolean) && snapshot.doors.every(Boolean)
    && snapshot.loopLimit === 13000 && snapshot.scoreRun.retries === 0
  ));
  await page.keyboard.press("KeyX");
  await page.waitForTimeout(30);
  await stage9Snapshot(page, "세 분신 저장", (snapshot) => (
    snapshot.loopNumber === 4 && snapshot.echoes.length === 3 && snapshot.scoreRun.retries === 0
  ));
}

async function recordStage9Final(page) {
  const name = "clip-stage9";
  const directory = resolve(CAPTURES, name);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  // 화면 캡처가 느려져도 입력은 실제 게임 시계를 따른다.
  // 이렇게 하면 세 분신과 현재 캐릭터가 같은 규칙으로 재생된다.
  await page.evaluate(() => {
    const canvas = document.querySelector("#game");
    const baseTime = window.__LOOP_HEIST_DEBUG__.snapshot().loopElapsed;
    const events = [
      [0, "down", "ArrowUp"], [140, "up", "ArrowUp"], [140, "press", "KeyZ"],
      [140, "down", "ArrowDown"], [410, "up", "ArrowDown"],
      [410, "down", "ArrowRight"], [795, "up", "ArrowRight"],
      [5095, "down", "ArrowUp"], [5365, "up", "ArrowUp"],
      [5365, "down", "ArrowRight"], [6005, "up", "ArrowRight"],
      [6005, "down", "ArrowUp"], [7305, "up", "ArrowUp"],
      [7305, "down", "ArrowRight"], [8405, "up", "ArrowRight"],
      [8405, "down", "ArrowDown"], [8665, "up", "ArrowDown"],
      [8665, "down", "ArrowRight"], [9765, "up", "ArrowRight"],
    ];
    let index = 0;
    const dispatchKey = (type, code) => {
      document.dispatchEvent(new KeyboardEvent(type, {
        code, key: code, bubbles: true, cancelable: true,
      }));
    };
    const clickWorld = (x, y) => {
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        clientX: rect.left + rect.width * x / 1200,
        clientY: rect.top + rect.height * y / 700,
      }));
    };
    let exitPhase = 0;
    let exitPhaseStarted = 0;
    const tick = () => {
      const snapshot = window.__LOOP_HEIST_DEBUG__.snapshot();
      const time = snapshot.loopElapsed - baseTime;
      while (index < events.length && time >= events[index][0]) {
        const [, type, value, y] = events[index];
        if (type === "click") clickWorld(value, y);
        else if (type === "press") {
          dispatchKey("keydown", value);
          window.setTimeout(() => dispatchKey("keyup", value), 32);
        } else {
          dispatchKey(type === "down" ? "keydown" : "keyup", value);
        }
        index += 1;
      }
      if (exitPhase === 0 && time >= 9950) {
        clickWorld(1002, 110);
        exitPhase = 1;
      } else if (exitPhase === 1 && snapshot.key.collected) {
        clickWorld(930, 270);
        exitPhase = 2;
        exitPhaseStarted = time;
      } else if (exitPhase === 2 && time >= exitPhaseStarted + 700) {
        clickWorld(930, 350);
        exitPhase = 3;
        exitPhaseStarted = time;
      } else if (exitPhase === 3 && time >= exitPhaseStarted + 330) {
        clickWorld(1080, 585);
        exitPhase = 4;
      }
      if (snapshot.state === "playing" && (index < events.length || exitPhase < 4)) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const started = Date.now();
  const maxDurationMs = 26000;
  let frame = 0;
  let completeAt = null;
  let doorsVerified = false;
  let keyVerified = false;
  while (Date.now() - started < maxDurationMs) {
    await page.screenshot({
      path: resolve(directory, `frame-${String(frame).padStart(4, "0")}.png`),
      animations: "disabled",
    });
    frame += 1;
    const snapshot = await page.evaluate(() => window.__LOOP_HEIST_DEBUG__.snapshot());
    if (!doorsVerified && snapshot.loopElapsed >= 9300) {
      if (
        snapshot.echoes.length !== 3
        || !Object.values(snapshot.plates).every(Boolean)
        || !snapshot.doors.every(Boolean)
        || snapshot.scoreRun.retries !== 0
      ) {
        throw new Error(`Stage 9 세 문 개방 검증 실패: ${JSON.stringify(snapshot)}`);
      }
      doorsVerified = true;
      console.log("Stage 9 세 문 개방:", JSON.stringify({
        t: Math.round(snapshot.loopElapsed), echoes: snapshot.echoes.length,
        plates: snapshot.plates, doors: snapshot.doors,
      }));
    }
    if (!keyVerified && snapshot.key.collected) {
      keyVerified = true;
      console.log("Stage 9 열쇠 획득:", Math.round(snapshot.loopElapsed));
    }
    if (snapshot.state === "complete") {
      if (completeAt === null) completeAt = Date.now();
      if (Date.now() - completeAt >= 1200) break;
    }
    const target = started + frame * (1000 / FPS);
    if (target > Date.now()) await page.waitForTimeout(target - Date.now());
  }
  const final = await stage9Snapshot(page, "최종 탈출", (snapshot) => (
    snapshot.state === "complete" && snapshot.echoes.length === 3
    && snapshot.key.collected && snapshot.scoreRun.retries === 0
  ));
  if (!doorsVerified || !keyVerified || !final.doors.every(Boolean)) {
    throw new Error(`Stage 9 최종 상태 검증 실패: ${JSON.stringify(final)}`);
  }
  console.log(`${name}: ${frame} frames`);
}

const down = (at, key) => ({ at, keyEvent: { type: "keydown", code: key } });
const up = (at, key) => ({ at, keyEvent: { type: "keyup", code: key } });
const press = (at, key) => ({ at, keyEvent: { type: "press", code: key } });

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
  const { context, page } = await newPage({ width: 1280, height: 720 }, "no-preference");
  await openStage(page, 9);
  await record(page, "clip-stage9-menu", 4200);
  await startStage(page);
  await prepareStage9Echoes(page);
  await recordStage9Final(page);
  await context.close();
}

await browser.close();
console.log(`최신 게임 캡처 완료: ${CAPTURES}`);
