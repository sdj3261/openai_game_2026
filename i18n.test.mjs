import assert from "node:assert/strict";
import test from "node:test";

import { LANGUAGES, resolveLanguage, t } from "./i18n.js";

const CORE_KEYS = [
  "gameTitle", "gameTagline", "ruleRun", "ruleCopy", "ruleEscape", "play", "move", "noise",
  "clone", "profile", "records", "ranking", "settings", "language", "visualSound",
  "visualSoundHelp", "mute", "back", "save", "currentGoal", "nextStage", "difficulty", "best",
  "noRecord", "clear", "caught", "doorOpen", "guardHeard", "bossAlert", "gemGet", "exit",
  "stage", "now", "next",
];

test("LANGUAGES exposes immutable Korean, English, and Japanese options", () => {
  assert.ok(Object.isFrozen(LANGUAGES));
  assert.deepEqual(LANGUAGES.map(({ code }) => code), ["ko", "en", "ja"]);
  assert.ok(LANGUAGES.every(Object.isFrozen));
});

test("resolveLanguage accepts regional tags, underscores, case, and preference arrays", () => {
  assert.equal(resolveLanguage("ko-KR"), "ko");
  assert.equal(resolveLanguage(" EN_us "), "en");
  assert.equal(resolveLanguage("ja-JP"), "ja");
  assert.equal(resolveLanguage(["fr-FR", "ja-JP"]), "ja");
  assert.equal(resolveLanguage("fr-FR"), "ko");
  assert.equal(resolveLanguage(null), "ko");
});

test("all core keys have short translations in every supported language", () => {
  for (const { code } of LANGUAGES) {
    for (const key of CORE_KEYS) {
      const translated = t(code, key);
      assert.notEqual(translated, key, `${code} is missing ${key}`);
      assert.ok(translated.trim().length > 0, `${code}.${key} must not be empty`);
    }
  }
  assert.equal(t("ko", "visualSoundHelp"), "효과음을 화면에 표시");
  assert.equal(t("en", "guardHeard"), "Guard heard it!");
  assert.equal(t("ja", "bossAlert"), "ボス警戒！");
});

test("stages 01 through 08 provide title, cue, and rule in all languages", () => {
  for (const { code } of LANGUAGES) {
    for (let index = 1; index <= 8; index += 1) {
      const stage = String(index).padStart(2, "0");
      for (const field of ["title", "cue", "rule"]) {
        const key = `stage.${stage}.${field}`;
        assert.notEqual(t(code, key), key, `${code} is missing ${key}`);
      }
    }
  }
  assert.equal(t("ko", "stage.01.title"), "태엽 박물관");
  assert.equal(t("en", "stage.08.title"), "Midnight Clocktower");
  assert.equal(t("ja", "stage.07.title"), "王室金庫");
});

test("t falls back to Korean for unsupported languages and to the key when missing", () => {
  assert.equal(t("de-DE", "play"), "시작!");
  assert.equal(t("ja", "missing.path"), "missing.path");
  assert.equal(t("en", ""), "");
});

test("t replaces named params safely and preserves placeholders without a value", () => {
  assert.equal(t("ko", "recordSummary", { time: "6.2", echoes: 2 }), "6.2초 · 에코 ×2");
  assert.equal(t("en", "recordSummary", { time: "$&", echoes: 1 }), "$&s · ECHO ×1");
  assert.equal(t("ja", "recordSummary", { time: 7 }), "7秒 · エコー×{echoes}");
  assert.equal(t("ko", "recordSummary", null), "{time}초 · 에코 ×{echoes}");
});
