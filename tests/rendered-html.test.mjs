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
  const helpers = source.slice(0, source.indexOf("function smoothPath")).replace(/^import .*;$/gm, "");
  const js = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(`${js}\n({ freshOperation, normalizeRoster, normalizeOperation, playerBrief, playerSlot })`, { ...roster });
}

test("새 정본의 편집 명단은 이름·보직·임무 삭제와 빈 명단을 JSON 왕복 후에도 보존한다", async () => {
  const { freshOperation, normalizeRoster, playerBrief, playerSlot } = await rosterHelpers();
  const operation = freshOperation();
  const original = operation.players[0];
  operation.players = [{ ...original, nickname: "수정 선수", lineup: "starter", secondaryRoles: ["blocker"], slot: 9, brief: null }];
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
  assert.equal(migrated.length, 30);
  operation.rosterRevision = 2;
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
    [{ ...player, lineup: "reserve" }],
    [{ ...player, secondaryRoles: ["unknown"] }],
    [{ ...player, brief: { units: [] } }],
  ]) assert.throws(() => normalizeRoster({ ...operation, players }));
});

test("사진 정본 30명의 번호와 이름이 정확히 일치하고 미확인 신규 선수는 임무를 승계하지 않는다", async () => {
  const { freshOperation, playerSlot, playerBrief } = await rosterHelpers();
  const expected = ["무잔 Muzan", "제이", "바르니 barunii", "마지태", "마스터", "TESLA", "Mim Mi", "파리스", "마구니", "Glen fiddich", "예리", "압수", "곡곡이", "GINSENG MAN", "Kingsway", "욘두 Yondu", "진수", "조롱말", "마리오", "TOMAS SHELBY", "Bünker", "불개", "떡틸로", "JunkHun", "Maha", "Elega", "5000", "보수", "햄수", "늑대장군"];
  const players = freshOperation().players;
  assert.deepEqual(Array.from(players, (player) => player.nickname), expected);
  assert.deepEqual(Array.from(players, playerSlot), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.ok(players.every((player) => player.lineup === "starter"));
  for (const name of ["제이", "마지태", "Mim Mi", "마리오", "GINSENG MAN", "떡틸로"]) assert.equal(playerBrief(players.find((player) => player.nickname === name)), undefined);
});

test("구버전 명단은 ID와 편집을 보존하며 30명으로 이관하고 삭제 선수의 모든 장면 배치와 카드를 정리한다", async () => {
  const { freshOperation, normalizeOperation, playerSlot } = await rosterHelpers();
  for (const revision of [undefined, 1]) {
    const saved = freshOperation();
    saved.rosterRevision = revision;
    const customBrief = { nickname: "[WB] ᴵᴿᴼᴺ TESLA", file: "수정", team: "수정 임무", steps: [], foot: "마법공주간달프님 호위", units: ["수정 지시", "오일자님 집결", "", "", ""] };
    saved.players = [
      { ...saved.players[5], id: 41, nickname: "[WB] ᴵᴿᴼᴺ TESLA", lineup: "reserve", slot: 22, brief: customBrief },
      { ...saved.players[19], id: 39, slot: 13 },
      { ...saved.players[0], id: 90, nickname: "마법공주간달프", slot: 2 },
      { ...saved.players[0], id: 91, nickname: "예비 선수", lineup: "reserve", slot: null },
    ];
    saved.cards = [{ playerId: 41, x: .1, y: .1 }, { playerId: 90, x: .2, y: .2 }, { playerId: 92, x: .2, y: .2 }];
    saved.scenes = [0, 1].map((i) => ({ ...saved.scenes[0], id: `scene-${i}`, positions: { 41: { x: .3, y: .4 }, 90: { x: .2, y: .2 }, 91: { x: .1, y: .1 }, 92: { x: .5, y: .5 } } }));
    const before = JSON.stringify(saved);
    const restored = normalizeOperation(saved);
    assert.equal(JSON.stringify(saved), before);
    assert.equal(restored.rosterRevision, 2);
    assert.equal(restored.players.length, 30);
    assert.equal(new Set(restored.players.map((player) => player.id)).size, 30);
    const tesla = restored.players.find((player) => player.nickname === "TESLA");
    assert.equal(tesla.id, 41); assert.equal(playerSlot(tesla), 6);
    assert.equal(tesla.brief.nickname, "TESLA"); assert.equal(tesla.brief.units[0], "수정 지시");
    assert.equal(tesla.brief.foot, "담당 미정 호위"); assert.equal(tesla.brief.units[1], "담당 미정 집결");
    assert.equal(restored.players.find((player) => player.nickname === "TOMAS SHELBY").id, 39);
    assert.equal(playerSlot(restored.players.find((player) => player.nickname === "TOMAS SHELBY")), 20);
    assert.ok(restored.players.filter((player) => ![41, 39].includes(player.id)).every((player) => player.id > 91));
    assert.deepEqual(Array.from(restored.cards, (card) => card.playerId), [41]);
    for (const scene of restored.scenes) assert.deepEqual(Object.keys(scene.positions), ["41"]);
    assert.deepEqual(JSON.parse(JSON.stringify(normalizeOperation(JSON.parse(JSON.stringify(restored))))), JSON.parse(JSON.stringify(restored)));
  }
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
  assert.equal((html.match(/class="player-row\b/g) ?? []).length, 30);
  assert.equal((html.match(/class="lineup-badge starter"/g) ?? []).length, 30);
  assert.equal((html.match(/class="lineup-badge reserve"/g) ?? []).length, 0);
  assert.equal((html.match(/class="role-count-tile\b/g) ?? []).length, 4);
  assert.doesNotMatch(html, /class="role-summary"/);
  assert.equal((html.match(/class="capture-objective owner-neutral"/g) ?? []).length, 12);
  assert.equal((html.match(/>전망대<\/span>/g) ?? []).length, 4);
  assert.match(html, /공격 라인/);
  assert.match(html, /방어 라인/);
  assert.match(html, />집결<\/button>/);
  assert.match(html, />지우개<\/button>/);
  assert.doesNotMatch(html, /예비/);
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
  assert.equal((roster.match(/^ {2}\{ nickname: /gm) ?? []).length, 24);
  assert.match(warTable, /const RALLY_PLAYERS = new Set\(\["진수", "TESLA", "Maha"\]\)/);
  assert.match(warTable, /type LineupStatus = "starter"/);
  assert.doesNotMatch(roster, /마법공주간달프|오늘은일찍자야지|핫떠그|산삼맨|서틸로|SIGH/);
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
