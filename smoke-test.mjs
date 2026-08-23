import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

const expectedVersion = "0.8.0";
const port = 43000 + Math.floor(Math.random() * 1000);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let serverOutput = "";
let serverErrors = "";

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
      response = await fetch(`http://127.0.0.1:${port}/`);
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
    'id="virtualStick"',
    'data-game-action="noise"',
    'data-game-action="save"',
    'aria-keyshortcuts="Z"',
    'aria-keyshortcuts="X"',
  ];
  const missingHtml = requiredHtml.filter((value) => !html.includes(value));
  if (missingHtml.length) throw new Error(`Served HTML is missing: ${missingHtml.join(", ")}`);

  const sourceAssetPaths = [
    `/design-system.css?v=${expectedVersion}`,
    `/styles.css?v=${expectedVersion}`,
    `/game.js?v=${expectedVersion}`,
    `/input-utils.js?v=${expectedVersion}`,
    `/profile-utils.js?v=${expectedVersion}`,
    `/i18n.js?v=${expectedVersion}`,
  ];
  const assetPaths = [
    ...sourceAssetPaths,
    "/assets/fonts/Galmuri11-Bold.woff2",
    "/assets/fonts/OFL-Galmuri.txt",
    "/assets/sprites/hero-idle-v2/animation.gif",
    "/assets/sprites/hero-idle-v2/pipeline-meta.json",
    "/assets/sprites/boss-idle/animation.gif",
    "/assets/sprites/boss-idle/pipeline-meta.json",
  ];
  const assetResponses = await Promise.all(assetPaths.map((path) => fetch(`http://127.0.0.1:${port}${path}`)));
  const failedAssets = assetResponses.filter((asset) => !asset.ok);
  if (failedAssets.length) throw new Error(`${failedAssets.length} required game asset(s) failed to load`);

  const [tokens, appCss, game, inputUtils, profileUtils, i18n] = await Promise.all(assetResponses.slice(0, sourceAssetPaths.length).map((asset) => asset.text()));
  const fontBytes = new Uint8Array(await assetResponses[sourceAssetPaths.length].arrayBuffer());
  const fontLicense = await assetResponses[sourceAssetPaths.length + 1].text();
  const heroGif = new Uint8Array(await assetResponses[sourceAssetPaths.length + 2].arrayBuffer());
  const heroMeta = await assetResponses[sourceAssetPaths.length + 3].json();
  const bossGif = new Uint8Array(await assetResponses[sourceAssetPaths.length + 4].arrayBuffer());
  const bossMeta = await assetResponses[sourceAssetPaths.length + 5].json();
  assert(tokens.includes("--theme-accent"), "Design-system theme token is missing");
  assert(tokens.includes("--font-game-ko") && tokens.includes("Galmuri11-Bold.woff2"), "Bundled Korean game font token is missing");
  assert(appCss.includes(".virtual-stick") && appCss.includes(".mobile-action"), "Mobile control styles are missing");
  assert(fontBytes.length > 100000 && String.fromCharCode(...fontBytes.slice(0, 4)) === "wOF2", "Bundled Galmuri11 font is missing or invalid");
  assert(fontLicense.includes("SIL Open Font License, Version 1.1") && fontLicense.includes("Lee Minseo"), "Bundled font license is missing or invalid");
  assert(String.fromCharCode(...heroGif.slice(0, 4)) === "GIF8" && heroMeta.qc_summary.frame_count === 4, "Hero sprite bundle is missing or invalid");
  assert(heroMeta.qc_summary.edge_touch_count === 0 && heroMeta.qc_summary.paste_clamped_count === 0 && heroMeta.qc_summary.body_scale_cv <= 0.08 && heroMeta.qc_summary.anchor_y_std <= 0.05, "Hero sprite strict QC failed");
  assert(String.fromCharCode(...bossGif.slice(0, 4)) === "GIF8" && bossMeta.qc_summary.frame_count === 9, "Boss sprite bundle is missing or invalid");
  assert(bossMeta.qc_summary.edge_touch_count === 0 && bossMeta.qc_summary.paste_clamped_count === 0 && bossMeta.qc_summary.body_scale_cv < 0.01, "Boss sprite QC failed");
  assert(game.includes(`./input-utils.js?v=${expectedVersion}`), "Game does not import the versioned input utilities");
  assert(game.includes(`./profile-utils.js?v=${expectedVersion}`), "Game does not import the versioned profile utilities");
  assert(game.includes(`./i18n.js?v=${expectedVersion}`), "Game does not import the versioned translation catalog");
  assert(game.includes('code: "08"') && game.includes('class="world-map toy-rail"') && game.includes('t(settings.language, "gameTitle")'), "8초 도둑단 eight-stage menu data is missing");
  assert(inputUtils.includes("export function projectAnalogStick"), "Analog-stick utility export is missing");
  assert(profileUtils.includes("export const PROFILE_COLORS") && profileUtils.includes("export function getWorldLeaderboard"), "Profile and leaderboard utility exports are missing");
  assert(i18n.includes("export const LANGUAGES") && i18n.includes("export function t") && i18n.includes('gameTitle: "8초 도둑단"') && i18n.includes('"08"'), "Translation catalog or eight-stage copy is missing");
  assert(serverOutput.includes(`http://127.0.0.1:${port}`), "CLI --host did not override LOOP_HEIST_HOST");

  const [demoPageResponse, demoVideoResponse, demoPosterResponse, demoVttResponse, demoSrtResponse] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/demo/`),
    fetch(`http://127.0.0.1:${port}/demo/8-second-crew-demo.mp4`),
    fetch(`http://127.0.0.1:${port}/demo/poster.png`),
    fetch(`http://127.0.0.1:${port}/demo/8-second-crew-demo.vtt`),
    fetch(`http://127.0.0.1:${port}/demo/8-second-crew-demo.srt`),
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
  assert(demoPage.includes("8-second-crew-demo.mp4") && demoPage.includes("8-second-crew-demo.vtt") && demoPage.includes("poster.png"), "Demo viewer media links are missing");
  assert(videoBytes.length > 1_000_000 && String.fromCharCode(...videoBytes.slice(4, 8)) === "ftyp", "Demo MP4 is missing or invalid");
  assert(posterBytes.length > 100_000 && posterBytes[0] === 0x89 && String.fromCharCode(...posterBytes.slice(1, 4)) === "PNG", "Demo poster is missing or invalid");
  assert(demoVtt.startsWith("WEBVTT") && (demoVtt.match(/-->/g) || []).length === 36, "Demo VTT captions are missing or incomplete");
  assert((demoSrt.match(/-->/g) || []).length === 36, "Demo SRT captions are missing or incomplete");

  console.log(`Smoke test passed: 8초 도둑단 v${expectedVersion}, HTTP ${response.status}, game + mobile + demo media assets`);
} finally {
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, "exit"), wait(1000)]);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
