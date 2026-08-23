import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

const expectedVersion = "0.13.0";
const port = 43000 + Math.floor(Math.random() * 1000);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let serverOutput = "";
let serverErrors = "";

async function fetchLocal(path, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(`http://127.0.0.1:${port}${path}`);
    } catch (error) {
      lastError = error;
      await wait(30 * (attempt + 1));
    }
  }
  throw lastError;
}

async function fetchLocalAll(paths) {
  const responses = [];
  for (const path of paths) responses.push(await fetchLocal(path));
  return responses;
}

const child = spawn(process.execPath, ["server.mjs", "--host", "127.0.0.1"], {
  cwd: process.cwd(),
  env: { ...process.env, LOOP_HEIST_HOST: "0.0.0.0", LOOP_HEIST_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => { serverOutput += chunk; });
child.stderr.on("data", (chunk) => { serverErrors += chunk; });

try {
  const packageJson = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
  assert(packageJson.version === expectedVersion, `Expected package version ${expectedVersion}, received ${packageJson.version}`);

  let response;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      response = await fetchLocal("/", 1);
      break;
    } catch {
      await wait(50);
    }
  }

  if (!response?.ok) {
    throw new Error(`Local server did not start successfully. ${serverErrors.trim()}`);
  }

  const html = await response.text();
  const requiredHtml = [
    "8초 도둑단",
    `styles.css?v=${expectedVersion}`,
    `game.js?v=${expectedVersion}`,
    `design-system.css?v=${expectedVersion}`,
    `favicon.ico?v=${expectedVersion}`,
    `site.webmanifest?v=${expectedVersion}`,
    'id="virtualStick"',
    'data-game-action="noise"',
    'data-game-action="save"',
    'data-game-action="game-menu"',
    'aria-keyshortcuts="Z"',
    'aria-keyshortcuts="X"',
    "경비원 도발",
    "분신 만들기",
  ];
  const missingHtml = requiredHtml.filter((value) => !html.includes(value));
  if (missingHtml.length) throw new Error(`Served HTML is missing: ${missingHtml.join(", ")}`);
  assert(!html.includes('data-game-action="undo"') && !html.includes("분신 지우기"), "Removed clone-delete control is still exposed");

  const sourceAssetPaths = [
    `/design-system.css?v=${expectedVersion}`,
    `/styles.css?v=${expectedVersion}`,
    `/game.js?v=${expectedVersion}`,
    `/game-rules.js?v=${expectedVersion}`,
    `/label-layout.js?v=${expectedVersion}`,
    `/sprite-assets.js?v=${expectedVersion}`,
    `/projectile-utils.js?v=${expectedVersion}`,
    `/input-utils.js?v=${expectedVersion}`,
    `/profile-utils.js?v=${expectedVersion}`,
    `/i18n.js?v=${expectedVersion}`,
  ];
  const spriteBundleBases = [
    ...["down", "left", "right", "up"].map((direction) => `/assets/sprites/duck-player/${direction}`),
    ...["club", "listener", "archer", "searchlight", "netgun", "captain"].map((role) => `/assets/sprites/toy-guards/${role}`),
  ];
  const spriteBundlePaths = spriteBundleBases.flatMap((base) => [`${base}/animation.gif`, `${base}/pipeline-meta.json`]);
  const assetPaths = [
    ...sourceAssetPaths,
    "/assets/fonts/Galmuri11-Bold.woff2",
    "/assets/fonts/OFL-Galmuri.txt",
    ...spriteBundlePaths,
  ];
  const assetResponses = await fetchLocalAll(assetPaths);
  const failedAssets = assetResponses.filter((asset) => !asset.ok);
  if (failedAssets.length) throw new Error(`${failedAssets.length} required game asset(s) failed to load`);

  const [tokens, appCss, game, gameRules, labelLayout, spriteAssets, projectileUtils, inputUtils, profileUtils, i18n] = await Promise.all(assetResponses.slice(0, sourceAssetPaths.length).map((asset) => asset.text()));
  const fontBytes = new Uint8Array(await assetResponses[sourceAssetPaths.length].arrayBuffer());
  const fontLicense = await assetResponses[sourceAssetPaths.length + 1].text();
  const spriteResponses = assetResponses.slice(sourceAssetPaths.length + 2);
  assert(tokens.includes("--theme-accent"), "Design-system theme token is missing");
  assert(tokens.includes("--font-game-ko") && tokens.includes("Galmuri11-Bold.woff2"), "Bundled Korean game font token is missing");
  assert(appCss.includes(".virtual-stick") && appCss.includes(".mobile-action") && appCss.includes(".game-guide"), "Mobile control or settings-guide styles are missing");
  assert(appCss.includes(".game-menu-dialog") && appCss.includes('.overlay[data-view="caught"]') && appCss.includes(".caught-dialog"), "Game menu or red caught-dialog styles are missing");
  assert(fontBytes.length > 100000 && String.fromCharCode(...fontBytes.slice(0, 4)) === "wOF2", "Bundled Galmuri11 font is missing or invalid");
  assert(fontLicense.includes("SIL Open Font License, Version 1.1") && fontLicense.includes("Lee Minseo"), "Bundled font license is missing or invalid");
  for (let index = 0; index < spriteBundleBases.length; index += 1) {
    const gif = new Uint8Array(await spriteResponses[index * 2].arrayBuffer());
    const meta = await spriteResponses[index * 2 + 1].json();
    assert(String.fromCharCode(...gif.slice(0, 4)) === "GIF8" && meta.qc_summary.frame_count === 4, `${spriteBundleBases[index]} sprite bundle is missing or invalid`);
    assert(meta.qc_config.strict_qc === true && meta.qc_summary.edge_touch_count === 0 && meta.qc_summary.paste_clamped_count === 0 && meta.qc_summary.body_scale_cv <= 0.10 && meta.qc_summary.anchor_y_std <= 0.14, `${spriteBundleBases[index]} strict sprite QC failed`);
  }
  assert(game.includes(`./input-utils.js?v=${expectedVersion}`), "Game does not import the versioned input utilities");
  assert(game.includes(`./game-rules.js?v=${expectedVersion}`), "Game does not import the versioned key-and-clone rules");
  assert(game.includes(`./label-layout.js?v=${expectedVersion}`) && labelLayout.includes("export function placeCanvasLabel"), "Canvas label placement utility is missing");
  assert(game.includes(`./profile-utils.js?v=${expectedVersion}`), "Game does not import the versioned profile utilities");
  assert(game.includes(`./i18n.js?v=${expectedVersion}`), "Game does not import the versioned translation catalog");
  assert(game.includes(`./sprite-assets.js?v=${expectedVersion}`), "Game does not import the versioned sprite catalog");
  assert(game.includes(`./projectile-utils.js?v=${expectedVersion}`), "Game does not import the versioned projectile physics");
  assert(game.includes('code: "09"') && game.includes('parEchoes: 3') && game.includes('class="world-map toy-rail"') && game.includes('t(settings.language, "gameTitle")'), "8초 도둑단 nine-stage menu data is missing");
  assert(inputUtils.includes("export function projectAnalogStick"), "Analog-stick utility export is missing");
  assert(spriteAssets.includes(`ASSET_VERSION = "${expectedVersion}"`) && spriteAssets.includes("DUCK_SPRITES") && spriteAssets.includes("GUARD_ROLE_BY_TYPE") && spriteAssets.includes("toy-guards"), "Versioned duck and toy-guard sprite catalog is missing");
  assert(projectileUtils.includes("PROJECTILE_PROFILES") && projectileUtils.includes("firstSweptCollision") && projectileUtils.includes("projectileFlightPosition") && projectileUtils.includes("projectileElapsedMs"), "Projectile physics exports are missing");
  assert(gameRules.includes("MAX_CLONES = 10") && gameRules.includes("export function canEscape") && gameRules.includes("candidate.hasKey === true") && gameRules.includes("export function canCollectTeamKey"), "Team-key, key-only exit, or ten-clone rule is missing");
  assert(
    gameRules.includes("export function stageNineBlackoutOpacity")
      && gameRules.includes("export function stageNineEventShakeIntensity")
      && gameRules.includes("export function stageNineShakeOffset")
      && game.includes('triggerStageNineShake("door-open")')
      && game.includes('triggerStageNineShake("boss-alert")')
      && game.includes("drawStageNineBlackout();"),
    "Stage-nine deterministic blackout or event-shake integration is missing",
  );
  assert(game.includes("spawnedAtMs: clock") && game.includes("projectileElapsedMs(loopElapsed, projectile.spawnedAtMs)"), "Projectile absolute-clock integration is missing");
  assert(game.includes("const actors = [...echoes, player]"), "Clone-first projectile collision ordering is missing");
  assert(game.includes("collectTeamKey(echo);") && game.includes("collectTeamKey(player);") && game.includes("if (canEscape({ hasKey: keyCollected })) completeLevel();"), "The current duck and clones do not share one key pickup and exit rule");
  assert(!game.includes("requiredNoiseEchoes") && !game.includes("requiredEchoes"), "Exit still has a hidden clone or noise requirement");
  const gameMenuSource = game.match(/function showGameMenu\(\)[\s\S]*?function showCaughtOverlay/)?.[0] || "";
  const caughtSource = game.match(/function showCaughtOverlay\([\s\S]*?function showRecordsOverlay/)?.[0] || "";
  const restartSource = game.match(/function restartStage\(\)[\s\S]*?\n}/)?.[0] || "";
  const startLevelSource = game.match(/function startLevel\([\s\S]*?function resetLoop/)?.[0] || "";
  assert((gameMenuSource.match(/class="game-menu-option(?:\s[^"]*)?"/g) || []).length === 3, "In-game menu must expose exactly three secondary options");
  assert((caughtSource.match(/<button/g) || []).length === 1 && caughtSource.includes('id="caughtRestartAction"'), "Caught dialog must expose only one restart button");
  assert(restartSource.includes("startLevel(levelIndex, { retryPenalty, countPlay: false })") && !game.includes("undoLastEcho") && !game.includes("KeyU"), "Fresh restart or clone-delete removal is incomplete");
  assert(startLevelSource.includes("echoes = []") && startLevelSource.includes("collectedItemIds = new Set()") && startLevelSource.includes("keyCollected = false") && startLevelSource.includes("itemBonusScore = 0"), "Fresh restart does not clear clones, key, and items");
  assert(profileUtils.includes("export const PROFILE_COLORS") && profileUtils.includes("export function getWorldLeaderboard"), "Profile and leaderboard utility exports are missing");
  assert(i18n.includes("export const LANGUAGES") && i18n.includes("export function t") && i18n.includes('gameTitle: "8초 도둑단"') && i18n.includes('guide: "게임 방법"') && i18n.includes('needKey: "먼저 열쇠를 찾으세요!"') && i18n.includes('"09"'), "Translation catalog, guide, or nine-stage copy is missing");
  assert(serverOutput.includes(`http://127.0.0.1:${port}`), "CLI --host did not override LOOP_HEIST_HOST");

  const [faviconResponse, faviconPngResponse, appleIconResponse, thumbnailResponse, manifestResponse] = await fetchLocalAll([
    "/favicon.ico",
    "/assets/icons/favicon-32.png",
    "/assets/icons/apple-touch-icon.png",
    "/assets/marketing/8-second-crew-thumbnail-1920x1080.png",
    "/site.webmanifest",
  ]);
  assert([faviconResponse, faviconPngResponse, appleIconResponse, thumbnailResponse, manifestResponse].every((asset) => asset.ok), "Favicon, app-icon, or submission-thumbnail assets failed to load");
  const [faviconBuffer, faviconPngBuffer, appleIconBuffer, thumbnailBuffer, manifest] = await Promise.all([
    faviconResponse.arrayBuffer(),
    faviconPngResponse.arrayBuffer(),
    appleIconResponse.arrayBuffer(),
    thumbnailResponse.arrayBuffer(),
    manifestResponse.json(),
  ]);
  const faviconBytes = new Uint8Array(faviconBuffer);
  const faviconPngBytes = new Uint8Array(faviconPngBuffer);
  const appleIconBytes = new Uint8Array(appleIconBuffer);
  const thumbnailBytes = new Uint8Array(thumbnailBuffer);
  assert(faviconBytes.length > 1000 && faviconBytes[0] === 0 && faviconBytes[1] === 0 && faviconBytes[2] === 1 && faviconBytes[3] === 0, "favicon.ico is missing or invalid");
  assert(faviconResponse.headers.get("content-type")?.startsWith("image/x-icon"), "favicon.ico has the wrong content type");
  assert(faviconPngBytes[0] === 0x89 && String.fromCharCode(...faviconPngBytes.slice(1, 4)) === "PNG", "32px favicon PNG is missing or invalid");
  assert(appleIconBytes.length > 1000 && appleIconBytes[0] === 0x89 && String.fromCharCode(...appleIconBytes.slice(1, 4)) === "PNG", "Apple touch icon is missing or invalid");
  assert(thumbnailBytes.length > 100_000 && thumbnailBytes.length < 10_000_000 && thumbnailBytes[0] === 0x89 && String.fromCharCode(...thumbnailBytes.slice(1, 4)) === "PNG", "16:9 submission thumbnail is missing, invalid, or larger than 10 MB");
  assert(manifest.name === "8초 도둑단" && manifest.icons?.some((icon) => icon.sizes === "512x512"), "Web app manifest is missing required game identity data");
  assert(manifestResponse.headers.get("content-type")?.startsWith("application/manifest+json"), "Web app manifest has the wrong content type");

  const [demoPageResponse, demoVideoResponse, demoPosterResponse, demoVttResponse, demoSrtResponse] = await fetchLocalAll([
    "/demo/",
    "/demo/8-second-crew-demo.mp4",
    "/demo/poster.png",
    "/demo/8-second-crew-demo.vtt",
    "/demo/8-second-crew-demo.srt",
  ]);
  assert([demoPageResponse, demoVideoResponse, demoPosterResponse, demoVttResponse, demoSrtResponse].every((asset) => asset.ok), "Demo viewer assets failed to load");
  const [demoPage, demoVideo, demoPoster, demoVtt, demoSrt] = await Promise.all([
    demoPageResponse.text(),
    demoVideoResponse.arrayBuffer(),
    demoPosterResponse.arrayBuffer(),
    demoVttResponse.text(),
    demoSrtResponse.text(),
  ]);
  const videoBytes = new Uint8Array(demoVideo);
  const posterBytes = new Uint8Array(demoPoster);
  const posterView = new DataView(demoPoster);
  assert(demoPage.includes("8-second-crew-demo.mp4") && demoPage.includes("8-second-crew-demo.vtt") && demoPage.includes("poster.png"), "Demo viewer media links are missing");
  assert(videoBytes.length > 1_000_000 && String.fromCharCode(...videoBytes.slice(4, 8)) === "ftyp", "Demo MP4 is missing or invalid");
  assert(
    posterBytes.length > 50_000
      && posterBytes[0] === 0x89
      && String.fromCharCode(...posterBytes.slice(1, 4)) === "PNG"
      && posterView.getUint32(16) === 1280
      && posterView.getUint32(20) === 720,
    "Demo poster is missing, invalid, or not 1280x720",
  );
  assert(demoVtt.startsWith("WEBVTT") && (demoVtt.match(/-->/g) || []).length === 36, "Demo VTT captions are missing or incomplete");
  assert((demoSrt.match(/-->/g) || []).length === 36, "Demo SRT captions are missing or incomplete");

  console.log(`Smoke test passed: 8초 도둑단 v${expectedVersion}, HTTP ${response.status}, game + mobile + favicon + demo media assets`);
} finally {
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, "exit"), wait(1000)]);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
