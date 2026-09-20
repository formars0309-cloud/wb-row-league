import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function rosterHelpers() {
  const rosterSource = await readFile(new URL("../app/roster.ts", import.meta.url), "utf8");
  const rosterJs = ts.transpileModule(rosterSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const roster = await import(`data:text/javascript;base64,${Buffer.from(rosterJs).toString("base64")}`);
  const source = await readFile(new URL("../app/war-table.tsx", import.meta.url), "utf8");
  const helpers = source.slice(0, source.indexOf("function normalizeScene")).replace(/^import .*;$/gm, "");
  const js = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(`${js}\n({ freshOperation, normalizeRoster, playerBrief, playerSlot })`, { ...roster });
}

test("편집 명단은 이름·편성·보직·임무 삭제와 빈 명단을 JSON 왕복 후에도 보존한다", async () => {
  const { freshOperation, normalizeRoster, playerBrief, playerSlot } = await rosterHelpers();
  const operation = freshOperation();
  const original = operation.players[0];
  operation.players = [{ ...original, nickname: "수정 선수", lineup: "reserve", secondaryRoles: ["blocker"], slot: 9, brief: null }];
  const saved = JSON.parse(JSON.stringify(operation));
  const restored = normalizeRoster(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), saved.players);
  assert.equal(playerBrief(restored[0]), undefined);
  assert.equal(playerSlot(restored[0]), 9);
  assert.equal(normalizeRoster({ ...saved, players: [] }).length, 0);
});

test("기존 저장본은 한 번만 현재 명단으로 이관하고 편집본에서는 삭제 선수를 되살리지 않는다", async () => {
  const { freshOperation, normalizeRoster } = await rosterHelpers();
  const operation = freshOperation();
  delete operation.rosterRevision;
  operation.players = operation.players.slice(0, 1);
  const migrated = normalizeRoster(operation);
  assert.equal(migrated.length, 40);
  operation.rosterRevision = 1;
  assert.equal(normalizeRoster(operation).length, 1);
});

test("가져온 명단의 중복 ID·닉네임과 잘못된 임무·번호를 거부한다", async () => {
  const { freshOperation, normalizeRoster } = await rosterHelpers();
  const operation = freshOperation();
  const player = operation.players[0];
  for (const players of [
    [player, player],
    [player, { ...player, id: 999 }],
    [{ ...player, nickname: " " }],
    [{ ...player, slot: 31 }],
    [{ ...player, secondaryRoles: ["unknown"] }],
    [{ ...player, brief: { units: [] } }],
  ]) assert.throws(() => normalizeRoster({ ...operation, players }));
});

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Heinapel War Table", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ko">/i);
  assert.match(html, /<title>Heinapel War Table v0\.1<\/title>/i);
  assert.match(html, /<main class="war-shell">/i);
  assert.match(html, /PLAYER ROSTER/);
  assert.match(html, /핵심 작전 도구/);
  assert.match(html, /OPERATION TIMELINE/);
  assert.match(html, /CURRENT TIME/);
  assert.match(html, /장면 시간 및 이벤트 편집/);
  assert.match(html, /01 장면 삭제/);
  assert.match(html, /루시아 배치/);
  assert.match(html, /이안 배치/);
  assert.doesNotMatch(html, /class="fairy-dragon-anchor/);
  assert.doesNotMatch(html, /class="lifestone-anchor/);
  assert.match(html, /전술 맵/);
  assert.match(html, /실전 맵/);
  assert.match(html, /생명의 반석/);
  assert.equal((html.match(/class="player-row\b/g) ?? []).length, 40);
  assert.equal((html.match(/class="lineup-badge starter"/g) ?? []).length, 30);
  assert.equal((html.match(/class="lineup-badge reserve"/g) ?? []).length, 10);
  assert.equal((html.match(/class="role-count-tile\b/g) ?? []).length, 4);
  assert.doesNotMatch(html, /class="role-summary"/);
  assert.equal((html.match(/class="capture-objective owner-neutral"/g) ?? []).length, 12);
  assert.equal((html.match(/>전망대<\/span>/g) ?? []).length, 4);
  assert.match(html, /공격 라인/);
  assert.match(html, /방어 라인/);
  assert.match(html, />집결<\/button>/);
  assert.match(html, />지우개<\/button>/);
  assert.match(html, />주전<\/button>/);
  assert.match(html, />예비<\/button>/);
  assert.match(html, />집결장<\/button>/);
  assert.match(html, />주둔장<\/button>/);
  assert.doesNotMatch(html, /PLAYER EDIT|LAYER FILTER/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps the interactive operation features and map assets wired", async () => {
  const [warTable, roster, theme, page, layout, tacticalMap, fieldMap, socialImage] =
    await Promise.all([
      readFile(new URL("../app/war-table.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/roster.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/mdt-theme.css", import.meta.url), "utf8"),
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      stat(new URL("../public/maps/heinapel-tactical-clean.png", import.meta.url)),
      stat(new URL("../public/maps/heinapel-field.png", import.meta.url)),
      stat(new URL("../public/og.png", import.meta.url)),
    ]);

  assert.match(warTable, /const STORAGE_KEY = "heinapel-war-table-v0\.3"/);
  assert.match(warTable, /const OBJECTIVE_META = \[/);
  assert.match(roster, /\["핫떠그", "infantry"\]/);
  assert.equal((roster.match(/^ {2}\{ nickname: /gm) ?? []).length, 30);
  assert.match(warTable, /const RALLY_PLAYERS = new Set\(\["\[WB\] 진 수", "마법공주간달프", "\[WB\] ᴵᴿᴼᴺ TESLA", "오늘은일찍자야지", "\[WB\] ᴵᴿᴼᴺ Maha"\]\)/);
  assert.match(roster, /\["마법공주간달프", 2\], \["바르니", 3\]/);
  assert.match(roster, /\["산삼맨", 19\]/);
  assert.match(roster, /\["\[WB\] ᴵᴿᴼᴺ Maha", 25\]/);
  assert.match(warTable, /lineup: SLOT_BY_NICKNAME\.has\(nickname\) \? "starter" : "reserve"/);
  assert.match(warTable, /const RENAMED = new Map\(\[\["벌꿀오소리", "마법공주간달프"\]\]\)/);
  assert.match(warTable, /type LineupStatus = "starter" \| "reserve"/);
  assert.match(warTable, /type SceneEvents =/);
  assert.match(warTable, /const DEFAULT_SCENE_EVENTS/);
  assert.match(warTable, /type FairyDragonPosition = "northwest" \| "southeast"/);
  assert.match(warTable, /const saveSceneEditor =/);
  assert.match(warTable, /const removeScene =/);
  assert.match(warTable, /const deployStarters =/);
  assert.match(warTable, /const patchPlayer =/);
  assert.match(warTable, /filter\(\(player\) => player\.lineup === "starter"\)/);
  assert.match(warTable, /function UnitRoleIcon/);
  assert.match(warTable, /function EraserIcon/);
  assert.match(warTable, /function smoothPath\(points: Point\[\]\)/);
  assert.match(warTable, /onPointerMove=\{handleMapPointerMove\}/);
  assert.match(warTable, /points: Point\[\]/);
  assert.match(warTable, /current === "neutral" \? "lucia"/);
  assert.match(warTable, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(warTable, /anchor\.download = "heinapel-operation\.json"/);
  assert.match(warTable, /type MapVariant = "tactical" \| "field"/);
  assert.match(theme, /url\('\/maps\/heinapel-tactical-clean\.png'\)/);
  assert.match(theme, /url\('\/maps\/heinapel-field\.png'\)/);
  assert.match(theme, /background-size: 170% 100%/);
  assert.match(theme, /\.player-token\.is-rally/);
  assert.match(theme, /\.player-copy strong\.name-rally/);
  assert.match(theme, /\.draw-preview/);
  assert.match(theme, /\.map-time-chip/);
  assert.match(theme, /\.fairy-dragon-anchor/);
  assert.match(theme, /\.fairy-dragon-anchor\.position-southeast/);
  assert.match(theme, /\.scene-event-editor/);
  assert.match(theme, /\.scene-remove-button/);
  assert.match(theme, /\.deployment-button/);
  assert.match(theme, /content: attr\(data-tooltip\)/);
  assert.match(page, /return <WarTable \/>/);
  assert.match(layout, /title: "Heinapel War Table v0\.1"/);
  assert.ok(tacticalMap.size > 0);
  assert.ok(fieldMap.size > 0);
  assert.ok(socialImage.size > 0);
});
