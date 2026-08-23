import assert from "node:assert/strict";
import test from "node:test";

import { LANGUAGES, resolveLanguage, t } from "./i18n.js";

const CORE_KEYS = [
  "gameTitle", "gameTagline", "ruleRun", "ruleCopy", "ruleEscape", "play", "move", "noise",
  "clone", "profile", "records", "ranking", "settings", "language", "visualSound",
  "visualSoundHelp", "guide", "guideEight", "guideNoise", "guideClone", "guideDoor", "guideItems", "guideScore",
  "mute", "back", "save", "currentGoal", "nextStage", "difficulty", "best",
  "noRecord", "clear", "caught", "doorOpen", "guardHeard", "bossAlert", "gemGet", "exit",
  "stage", "now", "next", "score", "grade", "clearTime", "radarHits", "retries", "echoFull", "cloneUse", "noPenalty",
  "saveWithX", "echoSaved", "needKey", "timeBonus", "timeBonusSound",
  "doorTutorial", "echoPlate", "doorLockedLabel", "doorOpenLabel",
  "arrowShot", "netShot", "arrowHit", "netHit",
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
  assert.equal(t("en", "guardHeard"), "A guard heard the sound!");
  assert.equal(t("ja", "bossAlert"), "ボス警戒！");
  assert.match(t("ko", "doorTutorial"), /발판.*X.*다음 차례.*문/);
  assert.match(t("en", "doorTutorial"), /X.*switch.*door.*next round/i);
  assert.match(t("ja", "doorTutorial"), /スイッチ.*X.*次の回.*ドア/);
  assert.equal(t("ko", "doorLockedLabel", { value: 2 }), "문 2 닫힘");
  assert.equal(t("en", "doorOpenLabel", { value: 1 }), "Door 1 open");
  assert.equal(t("ja", "echoPlate", { value: 1 }), "スイッチ 1、ここでX");
  assert.equal(t("ko", "needKey"), "먼저 열쇠를 찾으세요!");
  assert.equal(t("ko", "guideScore", { value: 2 }), "이 스테이지에는 분신 2개가 필요해요. 최대 10개이며 더 쓰면 점수가 깎여요.");
  assert.equal(t("en", "gem"), "KEY");
  assert.equal(t("ja", "escapeNow"), "出口オープン");
});

test("stages 01 through 09 provide title, cue, and rule in all languages", () => {
  for (const { code } of LANGUAGES) {
    for (let index = 1; index <= 9; index += 1) {
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
  assert.equal(t("ko", "stage.09.title"), "불타는 지옥 성채");
  assert.equal(t("ko", "stage.02.cue"), "발판에서 X로 분신을 만든 뒤 열린 문 너머의 열쇠를 찾으세요");
  assert.equal(t("ko", "stage.09.cue"), "지옥 태엽 +5초를 챙기고 분신 3개로 문 3개를 열어 탈출하세요");
});

test("t falls back to Korean for unsupported languages and to the key when missing", () => {
  assert.equal(t("de-DE", "play"), "시작!");
  assert.equal(t("ja", "missing.path"), "missing.path");
  assert.equal(t("en", ""), "");
});

test("t replaces named params safely and preserves placeholders without a value", () => {
  assert.equal(t("ko", "recordSummary", { time: "6.2", echoes: 2 }), "6.2초, 분신 2");
  assert.equal(t("en", "recordSummary", { time: "$&", echoes: 1 }), "$&s, CLONE ×1");
  assert.equal(t("ja", "recordSummary", { time: 7 }), "7秒、分身×{echoes}");
  assert.equal(t("ko", "recordSummary", null), "{time}초, 분신 {echoes}");
});
