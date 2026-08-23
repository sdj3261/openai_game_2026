import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

const expectedVersion = "0.6.3";
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

  const assetPaths = [
    `/design-system.css?v=${expectedVersion}`,
    `/styles.css?v=${expectedVersion}`,
    `/game.js?v=${expectedVersion}`,
    `/input-utils.js?v=${expectedVersion}`,
    `/profile-utils.js?v=${expectedVersion}`,
    `/i18n.js?v=${expectedVersion}`,
  ];
  const assetResponses = await Promise.all(assetPaths.map((path) => fetch(`http://127.0.0.1:${port}${path}`)));
  const failedAssets = assetResponses.filter((asset) => !asset.ok);
  if (failedAssets.length) throw new Error(`${failedAssets.length} required game asset(s) failed to load`);

  const [tokens, appCss, game, inputUtils, profileUtils, i18n] = await Promise.all(assetResponses.map((asset) => asset.text()));
  assert(tokens.includes("--theme-accent"), "Design-system theme token is missing");
  assert(appCss.includes(".virtual-stick") && appCss.includes(".mobile-action"), "Mobile control styles are missing");
  assert(game.includes(`./input-utils.js?v=${expectedVersion}`), "Game does not import the versioned input utilities");
  assert(game.includes(`./profile-utils.js?v=${expectedVersion}`), "Game does not import the versioned profile utilities");
  assert(game.includes(`./i18n.js?v=${expectedVersion}`), "Game does not import the versioned translation catalog");
  assert(game.includes("SOLO CO-OP") && game.includes("levels.length} STAGES") && game.includes('code: "08"'), "8초 도둑단 eight-stage brand data is missing");
  assert(inputUtils.includes("export function projectAnalogStick"), "Analog-stick utility export is missing");
  assert(profileUtils.includes("export const PROFILE_COLORS") && profileUtils.includes("export function getWorldLeaderboard"), "Profile and leaderboard utility exports are missing");
  assert(i18n.includes("export const LANGUAGES") && i18n.includes("export function t") && i18n.includes('"08"'), "Translation catalog or eight-stage copy is missing");
  assert(serverOutput.includes(`http://127.0.0.1:${port}`), "CLI --host did not override LOOP_HEIST_HOST");

  console.log(`Smoke test passed: 8초 도둑단 v${expectedVersion}, HTTP ${response.status}, profile + i18n + mobile assets`);
} finally {
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, "exit"), wait(1000)]);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
