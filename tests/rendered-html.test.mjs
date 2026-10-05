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
  const helpers = source.slice(0, source.indexOf("function UnitRoleIcon")).replace(/^import .*;$/gm, "").replace(/^export type /gm, "type ");
  const js = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(`${js}\n({ freshOperation, normalizeRoster, normalizeOperation, playerBrief, playerSlot, readMissionSheet, mirrorMission, lineExit, entranceBlock, missionTargets, buildMissionPlan, objectivePoint, OBJECTIVE_META, missionLines, missionParts, teamCommon, groupUnits, readStaffSheet, staffPoint, staffRoute, slotPoint, readOperation, missionView, missionsByNickname })`, { ...roster });
}

async function historyHelpers() {
  const source = await readFile(new URL("../app/operation-history.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source.replace(/^import .*;$/gm, "").replace(/\bexport /g, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(`${js}\n({ initialHistory, operationHistory })`, { structuredClone });
}

test("실행 취소 전이는 재실행해도 기록을 중복하지 않고 변경 없는 작업은 다시 실행을 보존한다", async () => {
  const { freshOperation } = await rosterHelpers();
  const { initialHistory, operationHistory } = await historyHelpers();
  const initial = initialHistory(freshOperation());
  const before = JSON.stringify(initial);
  const edit = { type: "commit", at: "2026-10-04T01:00:00Z", updater: (op) => { op.name = "수정"; return op; } };
  const edited = operationHistory(initial, edit);
  assert.equal(JSON.stringify(initial), before);
  assert.equal(JSON.stringify(operationHistory(initial, edit)), JSON.stringify(edited));
  assert.equal(edited.past.length, 1);
  const undone = operationHistory(edited, { type: "undo", at: "2026-10-04T01:01:00Z" });
  assert.equal(undone.present.name, initial.present.name);
  assert.equal(undone.past.length, 0);
  const same = operationHistory(undone, { type: "commit", at: edit.at, updater: (op) => op });
  assert.equal(same, undone);
  assert.equal(same.future.length, 1);
  const redone = operationHistory(same, { type: "redo", at: edit.at });
  assert.equal(redone.present.name, "수정");
  assert.equal(redone.past.length, 1);
  assert.equal(redone.future.length, 0);
  const branched = operationHistory(undone, { ...edit, updater: (op) => { op.name = "다른 변경"; return op; } });
  assert.equal(branched.future.length, 0);
  assert.equal(operationHistory(branched, { type: "redo", at: edit.at }), branched);
});

test("연속 드래그는 한 단계로 취소·복원하고 기록은 최근 60단계로 제한한다", async () => {
  const { freshOperation } = await rosterHelpers();
  const { initialHistory, operationHistory } = await historyHelpers();
  const initial = initialHistory(freshOperation());
  const at = "2026-10-04T01:00:00Z";
  let state = operationHistory(initial, { type: "checkpoint" });
  for (const x of [.3, .4, .5]) state = operationHistory(state, { type: "update", at, updater: (op) => {
    op.scenes[0].positions[1] = { x, y: .5 }; return op;
  } });
  assert.equal(state.past.length, 1);
  const undone = operationHistory(state, { type: "undo", at });
  assert.equal(Object.keys(undone.present.scenes[0].positions).length, 0);
  assert.equal(operationHistory(undone, { type: "redo", at }).present.scenes[0].positions[1].x, .5);
  for (let index = 0; index < 70; index++) state = operationHistory(state, { type: "commit", at, updater: (op) => { op.name = String(index); return op; } });
  assert.equal(state.past.length, 60);
  for (let index = 0; index < 60; index++) state = operationHistory(state, { type: "undo", at });
  assert.equal(state.present.name, "9");
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 60);
  const restored = operationHistory(state, { type: "restore", operation: initial.present });
  assert.equal(restored.past.length, 0);
  assert.equal(restored.future.length, 0);
});

test("저장본의 잘못된 장면·좌표·이벤트·오브젝트·카드는 화면에 적용하기 전에 거부한다", async () => {
  const { freshOperation, readOperation } = await rosterHelpers();
  const mutations = [
    (op) => { op.scenes[0].objects = null; },
    (op) => { op.scenes = {}; },
    (op) => { op.players = [null]; },
    (op) => { op.updatedAt = "bad"; },
    (op) => { op.rosterRevision = 99; },
    (op) => { op.name = {}; },
    (op) => { op.scenes[0].positions = []; },
    (op) => { op.scenes[0].positions = { 1: { x: 1.1, y: .5 } }; },
    (op) => { op.scenes[0].positions = { 1: { x: NaN, y: .5 } }; },
    (op) => { op.scenes[0].events.fairyDragonPosition = "bad"; },
    (op) => { op.scenes[0].objectiveOwners = { "spirit-east": "bad" }; },
    (op) => { op.scenes[0].objectiveOwners = { unknown: "ian" }; },
    (op) => { op.scenes[0].objects = [{ id: "a", type: "unknown", x: .2, y: .3 }]; },
    (op) => { op.scenes[0].objects = [{ id: "a", type: "memo", x: .2, y: .3, text: {} }]; },
    (op) => { op.scenes[0].objects = [{ id: "a", type: "rally", x: .2, y: .3 }, { id: "a", type: "rally", x: .4, y: .5 }]; },
    (op) => { op.cards = [{ playerId: 1, x: .1, y: .2, route: "bad" }]; },
    (op) => { op.cards = [{ playerId: 1, x: .1, y: .2 }, { playerId: 1, x: .3, y: .4 }]; },
    (op) => { op.scenes[0].positions = { 1: { x: "bad", y: .5 } }; },
    (op) => { op.scenes[0].events.lifeStone = {}; },
    (op) => { op.side = "unknown"; },
    (op) => { op.scenes.push({ ...op.scenes[0] }); },
    (op) => { op.activeSceneId = "missing"; },
    (op) => { op.scenes[0].objects = [{ id: "a", type: "attackArrow", x: .2, y: .3, points: "bad" }]; },
    (op) => { op.cards = [{ playerId: 1, x: null, y: .2 }]; },
  ];
  for (const mutate of mutations) {
    const saved = JSON.parse(JSON.stringify(freshOperation()));
    mutate(saved);
    assert.throws(() => readOperation(saved));
  }
});

test("저장본 검사는 기존 장면 기본값과 전술 오브젝트·카드의 JSON 왕복을 보존한다", async () => {
  const { freshOperation, readOperation } = await rosterHelpers();
  const saved = JSON.parse(JSON.stringify(freshOperation()));
  saved.scenes[0].positions = { 1: { x: 0, y: 1 } };
  saved.scenes[0].objects = ["moveArrow", "attackArrow", "defense", "rally", "step", "text", "memo"].map((type) => ({
    id: type, type, x: .2, y: .3, x2: .4, y2: .5, text: "메모", points: [{ x: .2, y: .3 }, { x: .4, y: .5 }],
  }));
  saved.scenes[0].objectiveOwners = { "spirit-east": "ian" };
  saved.cards = [{ playerId: 1, x: .2, y: .3, route: true }];
  const before = JSON.stringify(saved);
  const restored = readOperation(saved);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(JSON.stringify(restored.scenes), JSON.stringify(saved.scenes));
  assert.equal(JSON.stringify(restored.cards), JSON.stringify(saved.cards));
  assert.equal(JSON.stringify(readOperation(JSON.parse(JSON.stringify(restored)))), JSON.stringify(restored));
  delete saved.scenes[0].events;
  delete saved.scenes[0].positions;
  const legacy = readOperation(saved);
  assert.equal(legacy.scenes[0].events.fairyDragonPosition, "northwest");
  assert.equal(Object.keys(legacy.scenes[0].positions).length, 0);
});

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

test("2026-10-06 시트 30명의 번호와 이름이 정확히 일치하고 앱에는 기본 임무가 없다", async () => {
  const { freshOperation, playerSlot, playerBrief } = await rosterHelpers();
  const expected = ["무잔 Muzan", "벌꿀오소리형", "바르니 barunii", "마지태", "마리오", "알나인티 님", "TESLA", "파리스", "마구니", "Glen fiddich", "예리", "Mim Mi", "곡곡이", "GINSENG MAN (천상님이)", "Kingsway", "욘두 Yondu", "진수", "조롱말", "5000", "압수", "Bünker", "불개", "떡틸로", "JunkHun", "Maha", "Elega", "마스터", "보수", "햄수", "늑대장군"];
  const players = freshOperation().players;
  assert.deepEqual(Array.from(players, (player) => player.nickname), expected);
  assert.deepEqual(Array.from(players, playerSlot), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.ok(players.every((player) => player.lineup === "starter"));
  assert.ok(players.every((player) => playerBrief(player) === undefined));
});

test("2026-10-06 멤버 교체는 한 번만 이관하고 기존 선수의 편집·빈 명단·원본을 보존한다", async () => {
  const { freshOperation, readOperation, playerSlot, slotPoint } = await rosterHelpers();
  for (const revision of [2, 3, 4]) for (const side of ["ian", "lucia"]) for (const variant of ["tactical", "field"]) {
    const saved = JSON.parse(JSON.stringify(freshOperation()));
    saved.rosterRevision = revision;
    const oldSlot = revision === 2 ? 20 : 6;
    saved.players[5] = { ...saved.players[5], id: 42, nickname: "TOMAS SHELBY", slot: oldSlot, primaryRole: "cavalry", secondaryRoles: ["rally"],
      brief: { nickname: "TOMAS SHELBY", file: "", team: "이전 임무", foot: "", steps: [], units: ["이전 지시", "", "", "", ""] } };
    saved.players[13] = { ...saved.players[13], id: 43, nickname: "GINSENG MAN", primaryRole: "ranged", secondaryRoles: ["garrison"], slot: 9,
      brief: { nickname: "GINSENG MAN", file: "", team: "유지 임무", foot: "", steps: [], units: ["유지 지시", "", "", "", ""] } };
    saved.cards = [{ playerId: 42, x: .2, y: .3 }, { playerId: 43, x: .4, y: .5 }];
    const moved = { x: .3, y: .4 };
    saved.scenes[0].positions = { 42: slotPoint(oldSlot, side, variant), 43: moved };
    saved.scenes.push({ ...saved.scenes[0], id: "custom-scene", positions: { 42: moved, 43: moved } });
    const before = JSON.stringify(saved);
    const restored = readOperation(saved);
    assert.equal(JSON.stringify(saved), before);
    assert.equal(restored.rosterRevision, 6);
    assert.equal(restored.players.length, 30);
    const newcomer = restored.players.find((player) => player.nickname === "알나인티 님");
    assert.equal(newcomer.id, 44);
    assert.equal(playerSlot(newcomer), 6);
    assert.equal(newcomer.primaryRole, "infantry");
    assert.equal(newcomer.secondaryRoles.length, 0);
    assert.equal(newcomer.brief, undefined);
    assert.ok(!restored.players.some((player) => player.id === 42));
    assert.deepEqual(Array.from(restored.cards, (card) => card.playerId), [43]);
    assert.equal(JSON.stringify(restored.scenes[0].positions[44]), JSON.stringify(slotPoint(6, side, variant)));
    assert.equal(restored.scenes[1].positions[44], undefined, "직접 옮긴 교체 선수의 말은 승계하지 않는다");
    assert.ok(restored.scenes.every((scene) => !Object.hasOwn(scene.positions, 42)));
    const kept = restored.players.find((player) => player.id === 43);
    assert.equal(kept.nickname, "GINSENG MAN (천상님이)");
    assert.equal(kept.primaryRole, "ranged");
    assert.equal(kept.secondaryRoles[0], "garrison");
    assert.equal(playerSlot(kept), 9);
    assert.equal(kept.brief.nickname, kept.nickname);
    assert.equal(kept.brief.units[0], "유지 지시");
    assert.ok(restored.scenes.every((scene) => JSON.stringify(scene.positions[43]) === JSON.stringify(moved)));
    assert.equal(JSON.stringify(readOperation(JSON.parse(JSON.stringify(restored)))), JSON.stringify(restored));
    // 이관 후 직접 입력한 옛 이름·삭제·번호도 재이관하지 않는다.
    restored.players = [{ ...newcomer, nickname: "TOMAS SHELBY", slot: 8 }];
    assert.equal(JSON.stringify(readOperation(JSON.parse(JSON.stringify(restored))).players), JSON.stringify(restored.players));
    saved.players = []; saved.cards = []; saved.scenes.forEach((scene) => { scene.positions = {}; });
    assert.equal(readOperation(saved).players.length, 0);
  }
});

test("2026-10-06 이미 편집한 새 선수는 중복 추가하거나 덮어쓰지 않는다", async () => {
  const { freshOperation, readOperation } = await rosterHelpers();
  const saved = JSON.parse(JSON.stringify(freshOperation()));
  saved.rosterRevision = 4;
  saved.players = [saved.players[5], { ...saved.players[5], id: 42, nickname: "TOMAS SHELBY" }];
  saved.players[0].primaryRole = "ranged";
  saved.players[0].slot = 8;
  const restored = readOperation(saved);
  assert.equal(restored.players.length, 1);
  assert.equal(JSON.stringify(restored.players[0]), JSON.stringify(saved.players[0]));
  saved.players = [freshOperation().players[13]];
  assert.equal(readOperation(saved).players.length, 1, "이전에 삭제한 6번은 되살리지 않는다");
});

test("2026-10-04 시트 자리 변경: 저장본의 이전 기본 번호만 한 번 새 번호로 옮기고 직접 바꾼 번호는 보존한다", async () => {
  const { freshOperation, normalizeOperation, playerSlot } = await rosterHelpers();
  const operation = freshOperation();
  const old = { "마스터": 5, "TESLA": 6, "Mim Mi": 7, "압수": 12, "마리오": 19, "TOMAS SHELBY": 20, "Elega": 27 };
  operation.rosterRevision = 2;
  operation.players = operation.players.map((player, index) => index === 5 ? { ...player, nickname: "TOMAS SHELBY" } : player);
  operation.players = operation.players.map((player) => old[player.nickname] ? { ...player, slot: old[player.nickname] } : player.nickname === "곡곡이" ? { ...player, slot: 13 } : player);
  operation.players.find((player) => player.nickname === "Elega").slot = 3; // 직접 바꾼 번호
  const migrated = normalizeOperation(JSON.parse(JSON.stringify(operation)));
  assert.equal(migrated.rosterRevision, 6);
  const slotOf = (name) => playerSlot(migrated.players.find((player) => player.nickname === name));
  assert.deepEqual(["마리오", "알나인티 님", "TESLA", "Mim Mi", "압수", "마스터"].map(slotOf), [5, 6, 7, 12, 20, 27]);
  assert.equal(slotOf("Elega"), 3, "직접 바꾼 번호는 그대로");
  assert.equal(slotOf("곡곡이"), 13);
  // 이관한 뒤에는 같은 번호를 다시 넣어도 바꾸지 않는다.
  const again = JSON.parse(JSON.stringify(migrated));
  again.players.find((player) => player.nickname === "마스터").slot = 5;
  assert.equal(playerSlot(normalizeOperation(again).players.find((player) => player.nickname === "마스터")), 5);
});

test("2026-10-04 자리 변경 전 배치: 옛 기본 자리에 남은 말만 새 번호 자리로 한 번 옮긴다", async () => {
  const { freshOperation, normalizeOperation, playerSlot, slotPoint } = await rosterHelpers();
  const old = { "마스터": 5, "TESLA": 6, "Mim Mi": 7, "압수": 12, "마리오": 19, "TOMAS SHELBY": 20, "Elega": 27 };
  for (const [revision, side, variant] of [[2, "ian", "tactical"], [3, "lucia", "field"]]) {
    const operation = freshOperation();
    operation.rosterRevision = revision;
    operation.players = operation.players.map((player, index) => index === 5 ? { ...player, nickname: "TOMAS SHELBY" } : player);
    const seat = (player) => old[player.nickname] ?? playerSlot(player);
    operation.players = operation.players.map((player) => revision === 2 && old[player.nickname] ? { ...player, slot: old[player.nickname] } : player);
    operation.players.find((player) => player.nickname === "Elega").slot = 3; // 직접 바꾼 번호
    const byName = (ops, name) => ops.players.find((player) => player.nickname === name);
    const moved = { x: .5, y: .5 };
    const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
    operation.scenes[0].positions = Object.fromEntries(operation.players.map((player) => [String(player.id), slotPoint(seat(player), side, variant)]));
    operation.scenes[0].positions[String(byName(operation, "압수").id)] = moved; // 직접 옮긴 말
    const migrated = normalizeOperation(JSON.parse(JSON.stringify(operation)));
    const at = (name) => migrated.scenes[0].positions[String(byName(migrated, name).id)];
    for (const name of ["마리오", "알나인티 님", "TESLA", "Mim Mi", "마스터"]) same(at(name), slotPoint(playerSlot(byName(migrated, name)), side, variant), `${revision} ${name}`);
    same(at("압수"), moved, "직접 옮긴 말은 그대로");
    same(at("Elega"), slotPoint(27, side, variant), "직접 바꾼 번호의 말은 그대로");
    same(at("무잔 Muzan"), slotPoint(1, side, variant));
    // 이관한 저장본은 다시 옮기지 않는다.
    const again = JSON.parse(JSON.stringify(migrated));
    again.scenes[0].positions[String(byName(again, "마리오").id)] = slotPoint(19, side, variant);
    same(normalizeOperation(again).scenes[0].positions[String(byName(again, "마리오").id)], slotPoint(19, side, variant));
  }
});

test("구버전 명단은 ID와 편집을 보존하며 30명으로 이관하고 삭제 선수의 모든 장면 배치와 카드를 정리한다", async () => {
  const { freshOperation, normalizeOperation, playerSlot } = await rosterHelpers();
  for (const revision of [undefined, 1]) {
    const saved = freshOperation();
    saved.rosterRevision = revision;
    const customBrief = { nickname: "[WB] ᴵᴿᴼᴺ TESLA", file: "수정", team: "수정 임무", steps: [], foot: "마법공주간달프님 호위", units: ["수정 지시", "오일자님 집결", "", "", ""] };
    const byName = (name) => saved.players.find((player) => player.nickname === name);
    saved.players = [
      { ...byName("TESLA"), id: 41, nickname: "[WB] ᴵᴿᴼᴺ TESLA", lineup: "reserve", slot: 22, brief: customBrief },
      { ...byName("GINSENG MAN (천상님이)"), nickname: "GINSENG MAN", id: 39, slot: 13 },
      { ...saved.players[0], id: 90, nickname: "마법공주간달프", slot: 2 },
      { ...saved.players[0], id: 91, nickname: "예비 선수", lineup: "reserve", slot: null },
    ];
    saved.cards = [{ playerId: 41, x: .1, y: .1 }, { playerId: 90, x: .2, y: .2 }, { playerId: 92, x: .2, y: .2 }];
    saved.scenes = [0, 1].map((i) => ({ ...saved.scenes[0], id: `scene-${i}`, positions: { 41: { x: .3, y: .4 }, 90: { x: .2, y: .2 }, 91: { x: .1, y: .1 }, 92: { x: .5, y: .5 } } }));
    const before = JSON.stringify(saved);
    const restored = normalizeOperation(saved);
    assert.equal(JSON.stringify(saved), before);
    assert.equal(restored.rosterRevision, 6);
    assert.equal(restored.players.length, 30);
    assert.equal(new Set(restored.players.map((player) => player.id)).size, 30);
    const tesla = restored.players.find((player) => player.nickname === "TESLA");
    assert.equal(tesla.id, 41); assert.equal(playerSlot(tesla), 7);
    assert.equal(tesla.brief.nickname, "TESLA"); assert.equal(tesla.brief.units[0], "수정 지시");
    assert.equal(tesla.brief.foot, "담당 미정 호위"); assert.equal(tesla.brief.units[1], "담당 미정 집결");
    assert.equal(restored.players.find((player) => player.nickname === "GINSENG MAN (천상님이)").id, 39);
    assert.equal(playerSlot(restored.players.find((player) => player.nickname === "GINSENG MAN (천상님이)")), 14);
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

test("스테프 탭은 머리글로 열을 찾고 공통 규칙·군·순번·사용 위치를 읽으며 잘못된 행을 무시한다", async () => {
  const { readStaffSheet } = await rosterHelpers();
  const csv = [
    '"닉네임","번호","군","순번","사용 위치","목적지","사용 방법",""',
    '"공통 규칙","0","","","","","지팡이 아티는 보병 / 콜은 보이스",""',
    '"무잔","1","시작","","","1시 천무","",""',
    '"곡곡이","13","지정","2","TOP","3시 치료","5000님 부대 탑승",""',
    '"5000","26","지정 ","1번","","","",""',
    '"늑대","30","중간","","바텀","","",""',
    '"미배정","4","","","","","",""',
    '"중복","13","시작","","","","",""',
    '"범위 밖","31","시작","","","","",""',
    '"","","","","","","",""',
  ].join("\r\n");
  const { plans, common } = readStaffSheet(csv);
  assert.equal(common, "지팡이 아티는 보병 / 콜은 보이스");
  assert.deepEqual([...plans.keys()], [1, 13, 26, 30, 4]);
  assert.deepEqual(JSON.parse(JSON.stringify(plans.get(1))), { slot: 1, group: "start", order: null, top: null, target: "1시 천무", method: "" });
  assert.deepEqual(JSON.parse(JSON.stringify(plans.get(13))), { slot: 13, group: "point", order: 2, top: true, target: "3시 치료", method: "5000님 부대 탑승" });
  assert.equal(plans.get(26).order, 1); assert.equal(plans.get(26).top, null);
  assert.equal(plans.get(30).group, "point"); assert.equal(plans.get(30).top, false);
  assert.equal(plans.get(4).group, null);
  // 없는 탭이면 gviz가 첫 탭(스타팅 명단)을 돌려준다. 그 머리글은 스테프 표로 읽지 않는다.
  assert.throws(() => readStaffSheet('"스타팅 포인트 번호","닉네임","소속팀","메인임무"\n"1","무잔","기마팀",""'));
});

test("현재 스테프 부대구성 머리글과 스타팅/지정 STAFF 표기를 읽고 기존 사용 방법도 함께 보존한다", async () => {
  const { readStaffSheet } = await rosterHelpers();
  const csv = [
    '"번호","닉네임","군","순번","사용 위치","목적지","부대구성","사용 방법"',
    '"0","공통 규칙","","","","","","보이스 콜"',
    '"2","벌꿀오소리형","스타팅 STAFF 사용","","","1시 천무의 전당","주둔장 1 / 아처 3 / 기병집결 1","첫 콜에 출발"',
    '"6","알나인티 님","지정 순번 STAFF 사용","4","탑","","",""',
    '"29","햄수","지정 순번 STAFF 사용","1","바텀","","보병 2부대 (불개님과 같이)",""',
  ].join("\n");
  const current = readStaffSheet(csv);
  assert.equal(current.common, "보이스 콜");
  assert.equal(current.plans.get(2).group, "start");
  assert.equal(current.plans.get(2).composition, "주둔장 1 / 아처 3 / 기병집결 1");
  assert.equal(current.plans.get(2).method, "첫 콜에 출발");
  assert.equal(current.plans.get(6).group, "point");
  assert.equal(current.plans.get(6).order, 4);
  assert.equal(current.plans.get(6).top, true);
  assert.equal(current.plans.get(29).top, false);
  const withoutMethod = csv.split("\n").map((line) => line.slice(0, line.lastIndexOf(','))).join("\n");
  assert.equal(readStaffSheet(withoutMethod).plans.get(2).composition, current.plans.get(2).composition);
  assert.equal(readStaffSheet(withoutMethod).plans.get(2).method, "");
  assert.throws(() => readStaffSheet('"번호","군","순번","사용 위치","목적지"\n"1","시작","","",""'));
});

test("PC 지도 카드도 최신 시트의 메인·서브·부대와 루시아 환산을 읽고 저장된 수동 편집·삭제는 덮어쓰지 않는다", async () => {
  const { freshOperation, readMissionSheet, playerBrief, missionView, missionsByNickname } = await rosterHelpers();
  const sheet = readMissionSheet([
    '"스타팅 포인트 번호","닉네임","소속팀","메인임무","서브임무","1번부대","2번부대","3번부대","4번부대","5번부대"',
    '"19","5000","주유팀 (탑)","1시 천무 지원","3시 치료 지원","1시 천무 주유","3시 치료 주유","","",""',
    '"26","Elega","전망대","전망대 주둔장","집결 탑승","","","","",""',
  ].join("\n"));
  const player = { ...freshOperation().players.find((item) => item.nickname === "5000"), slot: 26 };
  const before = JSON.stringify(player);
  const brief = playerBrief(player, sheet);
  assert.equal(brief.nickname, "5000", "시트 임무는 수동 번호가 아닌 선수 이름으로 찾는다");
  assert.equal(brief.team, "주유팀 (탑)");
  assert.equal(brief.steps[0][1], "1시 천무 지원");
  assert.equal(brief.steps[1][1], "3시 치료 지원");
  const leaders = missionsByNickname([player], sheet);
  assert.equal(leaders.get("5000")[0], "1시 천무 주유");
  const view = missionView(player, leaders, "lucia", "tactical", sheet);
  assert.equal(view.orders[0], "7시 축복 주유");
  assert.equal(view.orders[1], "9시 치료 주유");
  assert.equal(view.brief.steps[0][1], "7시 축복 지원");
  assert.equal(view.plan.routes.length, 2);
  assert.equal(JSON.stringify(player), before, "시트 읽기는 저장된 임무를 덮어쓰지 않는다");
  const edited = { ...player, brief: { ...brief, team: "직접 수정", units: ["직접 지시", "", "", "", ""] } };
  assert.equal(playerBrief(edited, sheet).team, "주유팀 (탑)", "시트 선수는 기존 수동 임무보다 최신 시트를 우선한다");
  assert.equal(edited.brief.team, "직접 수정", "저장된 수동 임무 원본은 유지한다");
  assert.equal(playerBrief({ ...player, brief: null }, sheet).team, "주유팀 (탑)");
  assert.equal(playerBrief({ ...edited, nickname: "새로 만든 선수" }, sheet).team, "직접 수정", "시트 밖 선수는 편집 임무를 쓴다");
  assert.equal(playerBrief({ ...player, brief: null }), undefined);
  assert.equal(playerBrief({ ...player, nickname: "새로 만든 선수" }, sheet), undefined);
  sheet.missions.get(19).main = "새 시트 임무";
  assert.equal(playerBrief(player, sheet).steps[0][1], "새 시트 임무");
});

test("19번 5000·26번 Elega 변경은 기존 ID·카드·수동 배치를 보존하며 기본 자리만 한 번 옮긴다", async () => {
  const { freshOperation, readOperation, playerSlot, slotPoint } = await rosterHelpers();
  for (const revision of [2, 3, 4, 5]) for (const side of ["ian", "lucia"]) for (const variant of ["tactical", "field"]) {
    const saved = JSON.parse(JSON.stringify(freshOperation())); saved.rosterRevision = revision;
    const old = { "5000": 26, "Elega": revision === 2 ? 27 : 19 };
    saved.players = saved.players.map((player) => old[player.nickname] ? { ...player, slot: old[player.nickname] } : player);
    const byName = (name) => saved.players.find((player) => player.nickname === name);
    const five = byName("5000"), elega = byName("Elega");
    saved.cards = [{ playerId: five.id, x: .1, y: .2 }, { playerId: elega.id, x: .2, y: .3 }];
    saved.scenes[0].positions = { [five.id]: slotPoint(26, side, variant), [elega.id]: slotPoint(old.Elega, side, variant) };
    const moved = { x: .4, y: .5 };
    saved.scenes.push({ ...saved.scenes[0], id: "moved", positions: { [five.id]: moved, [elega.id]: moved } });
    const restored = readOperation(saved);
    assert.equal(playerSlot(restored.players.find((player) => player.id === five.id)), 19);
    assert.equal(playerSlot(restored.players.find((player) => player.id === elega.id)), 26);
    assert.equal(JSON.stringify(restored.cards), JSON.stringify(saved.cards));
    assert.equal(JSON.stringify(restored.scenes[0].positions[five.id]), JSON.stringify(slotPoint(19, side, variant)));
    assert.equal(JSON.stringify(restored.scenes[0].positions[elega.id]), JSON.stringify(slotPoint(26, side, variant)));
    assert.equal(JSON.stringify(restored.scenes[1].positions), JSON.stringify(saved.scenes[1].positions));
    assert.equal(JSON.stringify(readOperation(JSON.parse(JSON.stringify(restored)))), JSON.stringify(restored));
    five.slot = 8;
    assert.equal(playerSlot(readOperation(saved).players.find((player) => player.id === five.id)), 8);
    assert.equal(JSON.stringify(readOperation(saved).scenes[0].positions[five.id]), JSON.stringify(saved.scenes[0].positions[five.id]));
  }
});

test("STAFF 포인트 두 곳은 성 자리와 겹치지 않고 진영과 함께 돌며, 스테프 화살표는 군에 맞는 곳에서 목적지로 간다", async () => {
  const { staffPoint, staffRoute, slotPoint, objectivePoint } = await rosterHelpers();
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (const side of ["ian", "lucia"]) for (const [top, pair] of [[true, [6, 19]], [false, [24, 25]]]) {
    const point = staffPoint(top, side, "tactical");
    const gap = (slot) => near(point, slotPoint(slot, side, "tactical"));
    const nearest = Math.min(...Array.from({ length: 30 }, (_, index) => gap(index + 1)));
    assert.ok(nearest > .032, "성 한 칸 간격 이상 떨어져 겹치지 않는다");
    assert.ok(Math.abs(gap(pair[0]) - gap(pair[1])) < .004, `${pair.join("·")}번과 간격이 고르다`);
  }
  const center = (side) => { const a = staffPoint(true, side, "tactical"), b = staffPoint(false, side, "tactical"); return [a, b]; };
  const [ianTop, ianBottom] = center("ian"), [luciaTop, luciaBottom] = center("lucia");
  assert.ok(ianTop.y < ianBottom.y && ianTop.x > ianBottom.x, "이안 TOP은 오른쪽 위, BOTTOM은 왼쪽 아래");
  assert.ok(luciaTop.y > luciaBottom.y && luciaTop.x < luciaBottom.x, "루시아는 180도 돈다");
  const missions = new Map();
  const start = staffRoute({ slot: 1, group: "start", order: null, top: null, target: "1시 천무", method: "" }, 1, "ian", "tactical", missions);
  assert.equal(JSON.stringify(start.from), JSON.stringify(slotPoint(1, "ian", "tactical")));
  assert.equal(JSON.stringify(start.targets[0].point), JSON.stringify(objectivePoint("hall-northeast", "tactical")));
  const point = staffRoute({ slot: 30, group: "point", order: 1, top: null, target: "3시 치료", method: "" }, 30, "lucia", "tactical", missions);
  assert.equal(point.top, false, "빈 사용 위치는 내 라인(30번 = Bottom)");
  assert.equal(JSON.stringify(point.from), JSON.stringify(staffPoint(false, "lucia", "tactical")));
  assert.equal(JSON.stringify(point.targets[0].point), JSON.stringify(objectivePoint("spirit-west", "tactical")), "루시아는 3시를 9시로 환산");
  assert.equal(staffRoute({ slot: 4, group: null, order: null, top: null, target: "1시 천무", method: "" }, 4, "ian", "tactical", missions), null);
  assert.equal(staffRoute(undefined, 4, "ian", "tactical", missions), null);
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

test("입구막팀의 메인 임무만 담당 라인의 적 입구 차단 표시를 만든다", async () => {
  const { entranceBlock, lineExit } = await rosterHelpers();
  const mission = { team: "입구막팀", main: "주력보병 4부대로 적 탑라인 입구 막기", sub: "", units: ["", "", "", "", ""] };
  for (const side of ["ian", "lucia"]) {
    for (const [main, top, enemySlot] of [[mission.main, true, 25], ["적 바텀 라인 입구막기", false, 1], ["적 TOP 입구 막기", true, 25], ["적 Bottom 입구 막기", false, 1]]) {
      const block = entranceBlock({ ...mission, main }, side, "tactical");
      assert.equal(block.top, top);
      assert.equal(JSON.stringify(block.point), JSON.stringify(lineExit(enemySlot, side === "ian" ? "lucia" : "ian", "tactical").start));
    }
  }
  assert.equal(entranceBlock(undefined, "ian", "tactical"), null);
  assert.equal(entranceBlock({ ...mission, team: "필드컨트롤팀" }, "ian", "tactical"), null);
  assert.equal(entranceBlock({ ...mission, main: "입구막는 적 보병 밀기" }, "ian", "tactical"), null);
  assert.equal(entranceBlock({ ...mission, main: "거점 주유", sub: mission.main }, "ian", "tactical"), null);
  assert.equal(entranceBlock({ ...mission, main: "적 입구 막기" }, "ian", "tactical"), null);
  assert.ok(entranceBlock({ ...mission, team: "입구 막 팀", main: "적 탑 입구  막기" }, "ian", "tactical"));
});

test("임무 화살표는 시계와 거점 이름을 함께 확인하고 획득 조건 뒤의 실제 목표로 향한다", async () => {
  const { missionTargets, mirrorMission, objectivePoint } = await rosterHelpers();
  const cases = [["12시 적 용기", "spirit-north"], ["6시 용기의 영목", "spirit-south"], ["3시 치료", "spirit-east"], ["9시 치료", "spirit-west"], ["1시 천무", "hall-northeast"], ["7시 축복", "hall-southwest"], ["12시 목명", "hall-north"], ["6시 군왕", "hall-south"], ["주력 아처 (3시 치료 획득시 12시 적 용기 아처집결)", "spirit-north"], ["7시 축복의 전당 획득시 9시 치료의 영목 집결장", "spirit-west"]];
  for (const [text, id] of cases) {
    for (const variant of ["tactical", "field"]) {
      const targets = missionTargets(text, "ian", variant, new Map());
      assert.equal(targets.length, 1, text);
      assert.equal(targets[0].key, id, text);
      assert.equal(JSON.stringify(targets[0].point), JSON.stringify(objectivePoint(id, variant)));
    }
  }
  assert.equal(missionTargets(mirrorMission(cases[8][0], "lucia"), "lucia", "tactical", new Map())[0].key, "spirit-south");
  for (const text of ["12시 치료", "6시 치료", "3시 용기", "12시 천무", "11시 천무", "용기 주둔", "치료 집결"]) {
    assert.equal(missionTargets(text, "ian", "tactical", new Map()).length, 0, `충돌·방향 미정은 추정하지 않음: ${text}`);
  }
  assert.equal(JSON.stringify(missionTargets("3시 치료 + 12시 용기", "ian", "tactical", new Map()).map((target) => target.key)), JSON.stringify(["spirit-east", "spirit-north"]));
});

test("전망대 1·2와 명시된 적 TOP·Bottom 입구는 자기 진영과 담당 방향에 맞춘다", async () => {
  const { missionTargets, lineExit } = await rosterHelpers();
  for (const side of ["ian", "lucia"]) {
    for (const [text, suffix] of [["전망대 주둔 1 (좌측꺼)", "west"], ["전망대 주둔 2 (우측꺼)", "east"], ["이안측 전망대 2개중에 왼쪽꺼 쿠뇌 주둔", "west"], ["이안측 전망대 2개중에 오른쪽꺼 엘조 주둔", "east"]]) {
      const targets = missionTargets(text, side, "tactical", new Map());
      assert.equal(targets.length, 1);
      assert.equal(targets[0].key, `lookout-${side}-${suffix}`);
    }
    assert.equal(missionTargets("전망대 주둔", side, "tactical", new Map()).length, 2);
    for (const [text, enemySlot] of [["탑 라인 적 입구 막기", 25], ["바텀 적 입구막기", 1]]) {
      const target = missionTargets(text, side, "tactical", new Map())[0];
      assert.equal(JSON.stringify(target.point), JSON.stringify(lineExit(enemySlot, side === "ian" ? "lucia" : "ian", "tactical").start));
    }
  }
  assert.equal(missionTargets("방패아티 보병 (입구막는 보병 밀고 필드 쟁 지원)", "ian", "tactical", new Map()).length, 0);
});

test("집결 탑승은 해당 집결장의 실제 목표로 향하고 필드 부대에는 임의의 화살표가 없다", async () => {
  const { missionTargets, buildMissionPlan } = await rosterHelpers();
  const leaders = new Map([["TESLA", ["3시 치료 집결", "주력 아처 (3시 치료 획득시 12시 적 용기 아처집결)", "", "", ""]], ["벌꿀오소리형", ["1시 천무의 전당 집결", "", "", "", ""]]]);
  for (const name of ["테슬라님", "TESLA님"]) {
    assert.equal(missionTargets(`${name} 궁병 집결탑승`, "ian", "tactical", leaders)[0].key, "spirit-east");
    assert.equal(missionTargets(`${name} 궁병 집결탑승`, "lucia", "tactical", leaders)[0].key, "spirit-west");
  }
  assert.equal(missionTargets("오소리님 기마 집결 탑승", "ian", "tactical", leaders)[0].key, "hall-northeast");
  const plan = buildMissionPlan(["3시 치료 주둔", "필드 싸움", "주력 아처", "", ""], "ian", "tactical", leaders);
  assert.equal(plan.routes.length, 1);
  assert.equal(JSON.stringify(plan.routes[0].units), "[1]");
  assert.equal(JSON.stringify(plan.gaps), "[2,3,4,5]");
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
  // 저장본 복원이 끝나기 전에 편집해 변경 내용이 복원본에 덮이는 것을 막는다.
  assert.match(html, /<main class="war-shell" inert="">/i);
  assert.match(html, /불러오는 중/);
  const roster = html.slice(html.indexOf('class="mobile-roster"'));
  assert.equal((roster.match(/<li><button type="button"><b>/g) ?? []).length, 30);
  assert.match(roster, /<b>1<\/b><span>무잔 Muzan<\/span>/);
  assert.match(roster, /<b>30<\/b><span>늑대장군<\/span>/);
  assert.doesNotMatch(html, /mobile-management/);
  assert.doesNotMatch(html, /mobile-exit|is-pc/, "첫 화면(폰)에는 PC 카드 화면 표시가 없다");
  assert.match(html, /class="active tool-select"[^>]*><span>↖<\/span>선택<\/button>/);
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
  // 라인 도구는 부대 말·거점 위에서도 긋기를 시작한다(말 이벤트를 지도로 넘김).
  assert.match(warTable, /if \(tool === "attackArrow" \|\| tool === "defense"\) return;\n {4}event\.stopPropagation\(\);/);
  assert.match(warTable, /if \(tool !== "attackArrow" && tool !== "defense" && origin\.closest\("\.player-token,\.capture-objective"\)\) return;/);
  // 라인 도구에서 Shift+드래그는 반대 라인을 그리고, 저장 타입도 그 판정을 따른다.
  assert.match(warTable, /setDrawType\(event\.shiftKey === \(tool === "defense"\) \? "attackArrow" : "defense"\)/);
  assert.match(warTable, /type: drawType, \.\.\.start/);
  // 도구 버튼은 다시 눌러도 꺼지지 않아 라인을 이어 그을 수 있고, 끄는 곳은 '선택' 버튼이다.
  assert.match(warTable, /onClick=\{\(\) => setTool\(item\.id\)\}/);
  assert.match(warTable, /\{ id: "select", label: "선택"/);
  // PC 지도 도구줄의 스테프 카드 버튼은 폰과 같은 S 카드 부품을 창으로 띄운다.
  assert.match(warTable, /className="staff-open" onClick=\{\(\) => setStaffOpen\(true\)\}/);
  assert.match(warTable, /\{staffOpen && <StaffDialog /);
  assert.equal(warTable.match(/<StaffBoard /g)?.length, 2, "폰 S 카드와 PC 창이 같은 부품");
  // PC 지도 도구줄의 임무 카드 버튼은 폰 카드 화면을 그대로 띄우고, 작전판 버튼으로 돌아온다.
  assert.match(warTable, /className="cards-open-button" onClick=\{\(\) => setCardsOpen\(true\)\}/);
  assert.match(warTable, /<MobileBriefing [^>]*onExit=\{cardsOpen \? \(\) => setCardsOpen\(false\) : undefined\}/);
  assert.equal(warTable.match(/<MobileBriefing /g)?.length, 1, "폰 화면과 PC 카드 화면이 같은 부품");
  assert.equal(warTable.match(/useMissionSheets\(\)/g)?.length, 2, "시트 읽기는 한 곳(정의 1·호출 1)");
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
