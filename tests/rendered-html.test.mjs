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
  return runInNewContext(`${js}\n({ freshOperation, normalizeRoster, normalizeOperation, playerBrief, playerSlot, readMissionSheet, mirrorMission, lineExit, missionLines, missionParts, teamCommon, groupUnits })`, { ...roster });
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

test("2번의 기존 닉네임은 저장된 ID·부대·장면·카드를 보존해 벌꿀오소리형으로 바꾼다", async () => {
  const { freshOperation, normalizeOperation, playerSlot } = await rosterHelpers();
  for (const nickname of ["게이", "제이", "오소리"]) {
    const saved = freshOperation();
    saved.players[1] = { ...saved.players[1], id: 42, nickname, slot: 2, primaryRole: "cavalry" };
    saved.scenes[0].positions = { 42: { x: .4, y: .5 } };
    saved.cards = [{ playerId: 42, x: .3, y: .2 }];
    const restored = normalizeOperation(saved);
    assert.equal(restored.players[1].nickname, "벌꿀오소리형");
    assert.equal(restored.players[1].id, 42);
    assert.equal(restored.players[1].primaryRole, "cavalry");
    assert.equal(playerSlot(restored.players[1]), 2);
    assert.equal(JSON.stringify(restored.scenes), JSON.stringify(saved.scenes));
    assert.equal(JSON.stringify(restored.cards), JSON.stringify(saved.cards));
  }
});

test("가져온 명단의 중복 ID·닉네임과 잘못된 임무·번호를 거부한다", async () => {
  const { freshOperation, normalizeRoster } = await rosterHelpers();
  const operation = freshOperation();
  const player = operation.players[0];
  for (const players of [
    [player, player],
    [player, { ...player, id: 999 }],
    [{ ...player, nickname: "게이" }, { ...player, id: 999, nickname: "벌꿀오소리형" }],
    [{ ...player, nickname: " " }],
    [{ ...player, slot: 31 }],
    [{ ...player, lineup: "reserve" }],
    [{ ...player, secondaryRoles: ["unknown"] }],
    [{ ...player, brief: { units: [] } }],
  ]) assert.throws(() => normalizeRoster({ ...operation, players }));
});

test("사진 정본 30명의 번호와 이름이 정확히 일치하고 앱에는 기본 임무가 없다", async () => {
  const { freshOperation, playerSlot, playerBrief } = await rosterHelpers();
  const expected = ["무잔 Muzan", "벌꿀오소리형", "바르니 barunii", "마지태", "마스터", "TESLA", "Mim Mi", "파리스", "마구니", "Glen fiddich", "예리", "압수", "곡곡이", "GINSENG MAN", "Kingsway", "욘두 Yondu", "진수", "조롱말", "마리오", "TOMAS SHELBY", "Bünker", "불개", "떡틸로", "JunkHun", "Maha", "5000", "Elega", "보수", "햄수", "늑대장군"];
  const players = freshOperation().players;
  assert.deepEqual(Array.from(players, (player) => player.nickname), expected);
  assert.deepEqual(Array.from(players, playerSlot), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.ok(players.every((player) => player.lineup === "starter"));
  assert.ok(players.every((player) => playerBrief(player) === undefined));
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

test("구글 시트 임무는 머리글 이름으로 열을 찾고 따옴표·줄바꿈·빈 칸·잘못된 행·공통 임무 행을 처리한다", async () => {
  const { readMissionSheet } = await rosterHelpers();
  const csv = [
    '"닉네임","스타팅 포인트 번호","소속팀","메인임무","서브임무","1번부대","2번부대","3번부대","4번부대","5번부대","","원본 사진"',
    '"게이","2","집결장팀","1시 집결, 나머지는 ""기병""\n둘째 줄","펫 지원","1시 천무의 전당 집결","주력 기마","","","",""메모"",""',
    '"무잔 Muzan","1","기마팀","","","","","","","","",""',
    '"중복","2","x","x","","","","","","","",""',
    '"범위 밖","31","x","x","","","","","","","",""',
    '"","5","x","x","","","","","","","",""',
    '"","","","","","","","","","","",""',
    '"0순위 주유","공통 임무","기병대 = 1보병 4기마","","","","","","","","",""',
    '"다른 공통","0","무시","","","","","","","","",""',
  ].join("\r\n");
  const { missions, common } = readMissionSheet(csv);
  assert.deepEqual(Array.from(common), ["0순위 주유", "기병대 = 1보병 4기마"]);
  const blank = readMissionSheet('"닉네임","스타팅 포인트 번호","소속팀","메인임무","서브임무","1번부대","2번부대","3번부대","4번부대","5번부대"\n"","","주유 0순위","","","","","","",""');
  assert.deepEqual(Array.from(blank.common), ["주유 0순위"]); assert.equal(blank.missions.size, 0);
  assert.deepEqual([...missions.keys()], [2, 1]);
  const gay = missions.get(2);
  assert.equal(gay.nickname, "게이"); assert.equal(gay.team, "집결장팀");
  assert.equal(gay.main, '1시 집결, 나머지는 "기병"\n둘째 줄'); assert.equal(gay.sub, "펫 지원");
  assert.deepEqual(Array.from(gay.units), ["1시 천무의 전당 집결", "주력 기마", "", "", ""]);
  assert.deepEqual(Array.from(missions.get(1).units), ["", "", "", "", ""]);
  assert.throws(() => readMissionSheet('"번호","닉네임"\n"1","무잔"'));
});

test("루시아 카드는 시트의 이안 기준 위치 문구를 좌우 환산한다", async () => {
  const { mirrorMission } = await rosterHelpers();
  const text = "이안기준 : 1시 천무의 전당 집결, 3시 치료·12시 용기 주유, 이안 기준 6시 군왕";
  assert.equal(mirrorMission(text, "ian"), text);
  assert.equal(mirrorMission(text, "lucia"), "루시아기준 : 7시 축복의 전당 집결, 9시 치료·6시 용기 주유, 루시아 기준 12시 목명");
  assert.equal(mirrorMission(mirrorMission(text, "lucia"), "lucia"), text);
  assert.equal(mirrorMission("11시 방향, 적 원거리 0순위", "lucia"), "11시 방향, 적 원거리 0순위");
});

test("안내 이미지대로 TOP·Bottom Line을 15명씩 나누고 출구를 진영에 맞춰 돌린다", async () => {
  const { lineExit } = await rosterHelpers();
  const slots = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.deepEqual(slots.filter((slot) => lineExit(slot, "ian", "tactical").top), [1, 2, 3, 6, 7, 8, 12, 13, 14, 19, 20, 21, 26, 27, 28]);
  const ianTop = lineExit(1, "ian", "tactical").point, ianBottom = lineExit(30, "ian", "tactical").point;
  assert.ok(ianTop.x > ianBottom.x && ianTop.y < ianBottom.y, "이안 TOP 출구는 Bottom 출구의 오른쪽 위");
  const luciaTop = lineExit(1, "lucia", "tactical").point, luciaBottom = lineExit(30, "lucia", "tactical").point;
  assert.ok(luciaTop.x < luciaBottom.x && luciaTop.y > luciaBottom.y, "루시아는 180도 돌아 왼쪽 아래");
  for (const variant of ["tactical", "field"]) {
    for (const [slot, other, clock] of [[1, 3, 11.5], [25, 30, 8]]) {
      const ian = lineExit(slot, "ian", variant), lucia = lineExit(slot, "lucia", variant);
      assert.equal(JSON.stringify(ian.start), JSON.stringify(lineExit(other, "ian", variant).start), "같은 라인은 선수 자리에 관계없이 같은 출구에서 시작");
      const dx = ian.point.x - ian.start.x, dy = ian.point.y - ian.start.y;
      const angle = (Math.atan2(dx * 1.25, -dy) * 180 / Math.PI + 360) % 360;
      assert.ok(Math.abs(angle - clock * 30) < 1, `${clock}시 방향`);
      assert.ok(Math.abs(lucia.point.x - lucia.start.x + dx) < 1e-9);
      assert.ok(Math.abs(lucia.point.y - lucia.start.y + dy) < 1e-9);
      if (variant === "tactical") assert.ok(slot === 1 ? ian.start.x > .642 && ian.start.y < .412 : ian.start.x < .563 && ian.start.y > .613, "출구는 해당 성의 바깥쪽");
    }
  }
});

test("모바일 카드 가독성: 문장 줄 나누기·위치/타이밍 강조·팀 공통 임무·같은 부대 묶기", async () => {
  const { missionLines, missionParts, teamCommon, groupUnits } = await rosterHelpers();
  assert.deepEqual(Array.from(missionLines("1. 3시 치료 주유 // 주력 2부대 + 방패보병(입구 / 밀기) 필드싸움 / 블링크 주유. 집결이 터지면 다시 집결.")),
    ["1. 3시 치료 주유", "주력 2부대", "방패보병(입구 / 밀기) 필드싸움", "블링크 주유", "집결이 터지면 다시 집결"]);
  assert.deepEqual(Array.from(missionLines("주력 부대 (기마or아처)")), ["주력 부대 (기마or아처)"]);
  const parts = Array.from(missionParts("이안기준 : 1시 천무의 전당 집결, 적 펫 타이밍에 11시 생명석 젠"), (part) => [part.text, part.kind ?? ""]);
  assert.deepEqual(parts.filter(([, kind]) => kind), [["1시 천무의 전당", "place"], ["펫 타이밍", "time"], ["생명석 젠", "time"]]);
  assert.equal(parts.map(([text]) => text).join(""), "이안기준 : 1시 천무의 전당 집결, 적 펫 타이밍에 11시 생명석 젠");
  const common = ["0순위 주유", "기병대 = 1보병 4기마", "입구막팀=지연", "필드 컨트롤팀 = 방패 보병"];
  assert.deepEqual(Array.from(teamCommon(common, "기마팀"), (item) => item.head || item.body), ["0순위 주유", "기병대"]);
  assert.deepEqual(Array.from(teamCommon(common, "필드컨트롤팀"), (item) => item.head || item.body), ["0순위 주유", "필드 컨트롤팀"]);
  assert.deepEqual(Array.from(teamCommon(common, "집결장팀"), (item) => item.head || item.body), ["0순위 주유"]);
  assert.deepEqual(JSON.parse(JSON.stringify(groupUnits(["방패", "주력 기병", "주력 기병", "주력 기병", "주력 기병"]))), [{ from: 1, to: 1, text: "방패" }, { from: 2, to: 5, text: "주력 기병" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(groupUnits(["a", "", "a", "b", "b"]))), [{ from: 1, to: 1, text: "a" }, { from: 3, to: 3, text: "a" }, { from: 4, to: 5, text: "b" }]);
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
  const roster = html.slice(html.indexOf('class="mobile-roster"'));
  assert.equal((roster.match(/<li><button type="button"><b>/g) ?? []).length, 30);
  assert.match(roster, /<b>1<\/b><span>무잔 Muzan<\/span>/);
  assert.match(roster, /<b>30<\/b><span>늑대장군<\/span>/);
  assert.doesNotMatch(html, /mobile-management/);
  assert.match(html, /class="mobile-common"><b>0<\/b><span>공통 임무<\/span>/);
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
  assert.doesNotMatch(roster, /MISSION_BRIEFS|STAFF_ORDER/);
  assert.match(warTable, /spreadsheets\/d\/1NUorQ8zecl1mDRstKk-F1T7hRF2YYBgS_ZG21gIvcgc\/gviz\/tq\?tqx=out:csv/);
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
