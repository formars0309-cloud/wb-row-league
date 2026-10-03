"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PLAYER_SOURCE, ROLE_LABEL, SLOT_SOURCE, ROSTER_ALIASES, type Brief, type MissionOrders, type PrimaryRole } from "./roster";

type SecondaryRole = "garrison" | "rally" | "blocker";
type LineupStatus = "starter";
type Tool = "select" | "attackArrow" | "defense" | "rally" | "memo" | "delete";
// 이동 화살표·스텝·텍스트는 지금 도구에 없지만 이전 저장본에 남아 있을 수 있어 그린다.
type ObjectType = "moveArrow" | "attackArrow" | "defense" | "rally" | "step" | "text" | "memo";
type ObjectiveOwner = "neutral" | "lucia" | "ian";
type MapVariant = "tactical" | "field";
type MissionSide = "ian" | "lucia";
type MissionCard = { playerId: number; x: number; y: number; route?: boolean };
type MissionTone = "rally" | "garrison" | "roam" | "join" | "block" | "field" | "hold";
type FairyDragonPosition = "northwest" | "southeast";
type Point = { x: number; y: number };
type Player = { id: number; nickname: string; primaryRole: PrimaryRole; secondaryRoles: SecondaryRole[]; lineup: LineupStatus; slot?: number | null; brief?: Brief | null };
type TacticalObject = { id: string; type: ObjectType; x: number; y: number; x2?: number; y2?: number; points?: Point[]; text?: string };
type SceneEvents = { fairyDragon: string; lifeStone: string; fairyDragonPosition: FairyDragonPosition };
type Scene = { id: string; name: string; time: string; positions: Record<string, Point>; objects: TacticalObject[]; events: SceneEvents; objectiveOwners?: Record<string, ObjectiveOwner> };
type SceneDraft = { id: string; name: string; time: string; fairyDragon: string; lifeStone: string; fairyDragonPosition: FairyDragonPosition };
type Operation = { version: 1; rosterRevision?: 1 | 2 | 3; name: string; players: Player[]; scenes: Scene[]; activeSceneId: string; updatedAt: string; side?: MissionSide; cards?: MissionCard[] };

const STORAGE_KEY = "heinapel-war-table-v0.3";
const SECONDARY_LABEL: Record<SecondaryRole, string> = { garrison: "주둔장", rally: "집결장", blocker: "블로커" };
const TOOL_META: Array<{ id: Tool; label: string; glyph: string; hint: string }> = [
  { id: "attackArrow", label: "공격 라인", glyph: "➤", hint: "드래그로 공격 라인 표시" },
  { id: "defense", label: "방어 라인", glyph: "╱", hint: "드래그로 방어 라인 표시" },
  { id: "rally", label: "집결", glyph: "⚔", hint: "클릭해 집결 지점 표시" },
  { id: "memo", label: "메모", glyph: "▤", hint: "드래그로 영역을 잡고 메모를 입력" },
  { id: "delete", label: "지우개", glyph: "", hint: "지울 오브젝트를 클릭" },
];
// 사진 정본에 남은 선수의 확인된 지휘 보직. 미확인 신규 선수에게 이전 보직을 넘기지 않는다.
const RALLY_PLAYERS = new Set(["진수", "TESLA", "Maha"]);
const GARRISON_PLAYERS = new Set(["Glen fiddich", "욘두 Yondu", "예리", "JunkHun", "압수", "Elega", "5000"]);
const BLOCKER_PLAYERS = new Set(["Kingsway"]);
const SLOT_BY_NICKNAME = new Map(SLOT_SOURCE);
function defaultCommandRoles(nickname: string): SecondaryRole[] {
  if (RALLY_PLAYERS.has(nickname)) return ["rally"];
  if (GARRISON_PLAYERS.has(nickname)) return ["garrison"];
  if (BLOCKER_PLAYERS.has(nickname)) return ["blocker"];
  return [];
}
const INITIAL_PLAYERS: Player[] = PLAYER_SOURCE.map(([nickname, primaryRole], index) => ({
  id: index + 1,
  nickname,
  primaryRole,
  secondaryRoles: defaultCommandRoles(nickname),
  lineup: "starter",
}));
const MEMO_MIN_SIZE = { width: .11, height: .075 };
// 맵을 180도 돌린 관계라 시계 위치와 진영 거점 이름이 짝을 이뤄 바뀐다.
// 시트 문구의 "이안기준"도 함께 바꿔, 루시아 카드가 스스로 맞는 문장이 되게 한다.
const MISSION_MIRROR_PAIRS: Array<[string, string]> = [["12시", "6시"], ["1시", "7시"], ["3시", "9시"], ["군왕", "목명"], ["축복", "천무"], ["이안기준", "루시아기준"], ["이안 기준", "루시아 기준"]];
const MISSION_MIRROR = new Map<string, string>(MISSION_MIRROR_PAIRS.flatMap(([left, right]) => [[left, right], [right, left]] as Array<[string, string]>));
// 앞에 숫자가 붙은 시계("11시"의 "1시")는 건드리지 않는다.
const MISSION_MIRROR_PATTERN = new RegExp(`(?<!\\d)(?:${[...MISSION_MIRROR.keys()].sort((a, b) => b.length - a.length).join("|")})`, "g");
function mirrorMission(text: string, side: MissionSide) {
  return side === "ian" ? text : text.replace(MISSION_MIRROR_PATTERN, (token) => MISSION_MIRROR.get(token) ?? token);
}
const MISSION_SIDE_LABEL: Record<MissionSide, string> = { ian: "이안", lucia: "루시아" };
const MISSION_SIDES = Object.keys(MISSION_SIDE_LABEL) as MissionSide[];
// 카드는 내용 길이에 따라 높이가 달라져, 맵 밖으로 나가지 않게 넉넉한 공칭 크기로만 잡아 둔다.
const MISSION_CARD_SIZE = { width: .27, height: .36 };
// 진형은 마름모 격자다. 행마다 5·6·7·7·5칸이고, 한 행 안에서 한 칸씩 SLOT_STEP_ALONG,
// 다음 행으로 넘어갈 때 SLOT_STEP_ROW 만큼 이동한다. 값은 게임 화면 비율을 옮긴 것.
const SLOT_ROWS = [5, 6, 7, 7, 5];
const SLOT_STEP_ALONG = { x: -.0256, y: .0195 };
const SLOT_STEP_ROW = { x: .0245, y: .0282 };
const SLOT_POINTS = (() => {
  const list: Array<{ slot: number; x: number; y: number }> = [];
  let first = 1;
  SLOT_ROWS.forEach((count, row) => {
    for (let index = 0; index < count; index += 1) list.push({
      slot: first + index,
      x: index * SLOT_STEP_ALONG.x + row * SLOT_STEP_ROW.x,
      y: index * SLOT_STEP_ALONG.y + row * SLOT_STEP_ROW.y,
    });
    first += count;
  });
  const cx = list.reduce((sum, item) => sum + item.x, 0) / list.length;
  const cy = list.reduce((sum, item) => sum + item.y, 0) / list.length;
  return new Map(list.map((item) => [item.slot, { x: item.x - cx, y: item.y - cy }]));
})();
const DEFAULT_SCENE_EVENTS: SceneEvents = { fairyDragon: "", lifeStone: "", fairyDragonPosition: "northwest" };
const SCENE_TIMES = ["60:00", "55:00", "52:00", "46:00", "42:00"];
const STARTING_POINT_CENTER: Record<MapVariant, Record<"lucia" | "ian", Point>> = {
  tactical: { lucia: { x: .4044, y: .2294 }, ian: { x: .6265, y: .5193 } },
  field: { lucia: { x: .3793, y: .3673 }, ian: { x: .6313, y: .5973 } },
};
const OBJECTIVE_META = [
  { id: "spirit-west", label: "9시 치료", location: "서쪽", tactical: { x: 26.92, y: 37.76 }, field: { x: 21.03, y: 55.33 } },
  { id: "spirit-north", label: "12시 용기", location: "북쪽", tactical: { x: 58.56, y: 5.38 }, field: { x: 62.28, y: 15.58 } },
  { id: "spirit-east", label: "3시 치료", location: "동쪽", tactical: { x: 76.17, y: 37.1 }, field: { x: 80.03, y: 41.13 } },
  { id: "spirit-south", label: "6시 용기", location: "남쪽", tactical: { x: 44.53, y: 69.48 }, field: { x: 38.78, y: 80.88 } },
  { id: "hall-northeast", label: "천무", location: "1시", tactical: { x: 74.63, y: 11.9 }, field: { x: 79.43, y: 21.23 } },
  { id: "hall-southwest", label: "축복", location: "7시", tactical: { x: 28.46, y: 62.96 }, field: { x: 21.63, y: 75.22 } },
  { id: "hall-north", label: "목명", location: "생명의 반석 12시", tactical: { x: 54.52, y: 21.32 }, field: { x: 55.63, y: 27.63 } },
  { id: "hall-south", label: "군왕", location: "생명의 반석 6시", tactical: { x: 48.58, y: 53.54 }, field: { x: 45.43, y: 68.83 } },
  { id: "lookout-lucia-west", label: "전망대", location: "루시아 스타팅 후방 서쪽", tactical: { x: 25.44, y: 15.49 }, field: { x: 21.53, y: 23.23 } },
  { id: "lookout-lucia-east", label: "전망대", location: "루시아 스타팅 후방 동쪽", tactical: { x: 34.44, y: 13.42 }, field: { x: 32.58, y: 21.43 } },
  { id: "lookout-ian-west", label: "전망대", location: "이안 스타팅 후방 서쪽", tactical: { x: 68.66, y: 61.44 }, field: { x: 68.48, y: 75.03 } },
  { id: "lookout-ian-east", label: "전망대", location: "이안 스타팅 후방 동쪽", tactical: { x: 77.66, y: 59.37 }, field: { x: 79.53, y: 73.23 } },
] as const;

function freshOperation(): Operation {
  const sceneId = "scene-1";
  return { version: 1, rosterRevision: 3, name: "WB 헤이나펄 리그 2기", side: "ian", players: INITIAL_PLAYERS, scenes: [{ id: sceneId, name: "START", time: "60:00", positions: {}, objects: [], events: { ...DEFAULT_SCENE_EVENTS } }], activeSceneId: sceneId, updatedAt: new Date().toISOString() };
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function clamp(value: number) { return Math.max(0.025, Math.min(0.975, value)); }
// 이안 라인 안내 이미지(output/imagegen/ian-top-bottom-staff-v4.png): 3·4번과 28·29번 사이 사선으로 15명씩 나눈다.
// 출구는 TOP이 1번 성의 1시 방향, Bottom이 25번 성의 7시 방향. 루시아는 진형과 함께 180도 돈다.
const TOP_LINE_SLOTS = new Set([1, 2, 3, 6, 7, 8, 12, 13, 14, 19, 20, 21, 26, 27, 28]);
// 출구에서 시작한다. 지도 가로:세로(1.25:1)를 반영해 TOP은 11시 반, Bottom은 8시 방향.
const LINE_EXITS = { top: { slot: 1, x: .025, y: -.03, dx: -.032, dy: -.15 }, bottom: { slot: 25, x: -.025, y: .03, dx: -.10, dy: .0725 } };
function lineExit(slot: number, side: MissionSide, variant: MapVariant) {
  const top = TOP_LINE_SLOTS.has(slot);
  const exit = top ? LINE_EXITS.top : LINE_EXITS.bottom;
  const base = SLOT_POINTS.get(exit.slot) ?? { x: 0, y: 0 };
  const center = STARTING_POINT_CENTER[variant][side];
  const turn = side === "ian" ? 1 : -1;
  const start = { x: center.x + (base.x + exit.x) * turn, y: center.y + (base.y + exit.y) * turn };
  return { top, start, point: { x: clamp(start.x + exit.dx * turn), y: clamp(start.y + exit.dy * turn) } };
}
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
// 사진 정본으로 한 번 이관한다. 유지 선수의 ID를 보존하고 신규 ID는 옛 명단 전체와 겹치지 않게 만든다.
function mergePlayers(saved: Player[]): Player[] {
  const byName = new Map(saved.map((player) => [ROSTER_ALIASES.get(player.nickname) ?? player.nickname, player]));
  const removedNames = [...saved.filter((player) => !SLOT_BY_NICKNAME.has(ROSTER_ALIASES.get(player.nickname) ?? player.nickname)).map((player) => player.nickname), "마법공주간달프", "오늘은일찍자야지", "오일자", "핫떠그", "산삼맨", "서틸로", "SIGH"];
  const cleanText = (text: string) => removedNames.reduce((result, name) => result.replaceAll(`${name}님`, "담당 미정").replaceAll(name, "담당 미정"), text);
  let nextId = Math.max(0, ...saved.map((player) => player.id)) + 1;
  return INITIAL_PLAYERS.map((player): Player => {
    const previous = byName.get(player.nickname);
    const brief = previous?.brief;
    return {
      ...player,
      ...(previous ? { ...previous, nickname: player.nickname, brief: brief ? {
        ...brief, nickname: player.nickname, team: cleanText(brief.team), foot: cleanText(brief.foot),
        badge: brief.badge === undefined ? undefined : cleanText(brief.badge),
        units: brief.units.map(cleanText) as MissionOrders,
        steps: brief.steps.map(([head, body]) => [cleanText(head), cleanText(body)]),
        common: brief.common?.map(([head, body]) => [cleanText(head), cleanText(body)]),
        image: brief.image ? { ...brief.image, caption: cleanText(brief.image.caption) } : undefined,
      } : brief } : { id: nextId++ }),
      lineup: "starter",
      slot: SLOT_BY_NICKNAME.get(player.nickname),
    };
  });
}
// 앱에는 기본 임무가 없다. 작전판 카드는 편집기로 입력한 임무만 보여 준다.
function playerBrief(player: Player): Brief | undefined {
  return player.brief ?? undefined;
}
function playerSlot(player: Player): number | undefined {
  return player.slot === undefined ? SLOT_BY_NICKNAME.get(player.nickname) : player.slot ?? undefined;
}
// 2026-10-04 시트 자리 변경 전 번호. 저장본에 이 기본 번호가 그대로 남은 선수만 한 번 새 기본 번호를 따르게 한다.
const SEATS_BEFORE_2026_10_04 = new Map([["마스터", 5], ["TESLA", 6], ["Mim Mi", 7], ["압수", 12], ["마리오", 19], ["TOMAS SHELBY", 20], ["Elega", 27]]);
function normalizeRoster(saved: Operation): Player[] {
  const players = saved.players;
  const photoRoster = (saved.rosterRevision ?? 0) >= 2;
  if (photoRoster && players.length > 30) throw new Error("주전은 최대 30명입니다.");
  const ids = new Set<number>();
  const names = new Set<string>();
  for (const player of players) {
    if (!Number.isSafeInteger(player.id) || player.id < 1 || ids.has(player.id) ||
      typeof player.nickname !== "string" || !player.nickname.trim() || names.has(player.nickname.trim().toLowerCase()) ||
      !Object.hasOwn(ROLE_LABEL, player.primaryRole) || !(photoRoster ? ["starter"] : ["starter", "reserve"]).includes(player.lineup) ||
      !Array.isArray(player.secondaryRoles) || player.secondaryRoles.some((role) => !Object.hasOwn(SECONDARY_LABEL, role)) ||
      (player.slot != null && (!Number.isInteger(player.slot) || player.slot < 1 || player.slot > 30))) throw new Error("잘못된 명단");
    const brief = player.brief;
    if (brief != null && (!Array.isArray(brief.units) || brief.units.length !== 5 || brief.units.some((text) => typeof text !== "string") ||
      ![brief.nickname, brief.file, brief.team, brief.foot].every((text) => typeof text === "string") ||
      (brief.badge !== undefined && typeof brief.badge !== "string") ||
      !Array.isArray(brief.steps) || ![...brief.steps, ...(brief.common ?? [])].every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((text) => typeof text === "string")) ||
      (brief.image && (typeof brief.image.src !== "string" || typeof brief.image.caption !== "string")))) throw new Error("잘못된 임무");
    ids.add(player.id); names.add(player.nickname.trim().toLowerCase());
  }
  if (photoRoster) {
    const renamed = players.map((player) => {
      const nickname = ROSTER_ALIASES.get(player.nickname);
      return nickname && SLOT_BY_NICKNAME.get(nickname) === 2 ? { ...player, nickname, brief: player.brief ? { ...player.brief, nickname } : player.brief } : player;
    }).map((player) => saved.rosterRevision === 2 && player.slot != null && SEATS_BEFORE_2026_10_04.get(player.nickname) === player.slot ? { ...player, slot: undefined } : player);
    if (new Set(renamed.map((player) => player.nickname.trim().toLowerCase())).size !== renamed.length) throw new Error("잘못된 명단");
    return renamed;
  }
  const merged = mergePlayers(players);
  if (merged.some((player) => !Number.isSafeInteger(player.id))) throw new Error("선수 ID를 이관할 수 없습니다.");
  return merged;
}
function normalizeOperation(saved: Operation): Operation {
  const players = normalizeRoster(saved);
  const previousIds = new Set(saved.players.map((player) => player.id));
  const ids = new Set(players.filter((player) => (saved.rosterRevision ?? 0) >= 2 || previousIds.has(player.id)).map((player) => String(player.id)));
  return { ...saved, players, rosterRevision: 3, cards: saved.cards?.filter((card) => ids.has(String(card.playerId))),
    scenes: saved.scenes.map((item, index) => ({ ...normalizeScene(item, index), positions: Object.fromEntries(Object.entries(item.positions ?? {}).filter(([id]) => ids.has(id))) })),
  };
}
function normalizeScene(item: Scene, index: number): Scene {
  const savedEvents = (item.events ?? {}) as Partial<SceneEvents>;
  const legacyDefaultStart = index === 0 && item.name === "START" && savedEvents.fairyDragon === "페어리 드래곤 젠" && savedEvents.lifeStone === "생명석 젠";
  return {
    ...item,
    events: {
      fairyDragon: legacyDefaultStart ? "" : savedEvents.fairyDragon ?? "",
      lifeStone: legacyDefaultStart ? "" : savedEvents.lifeStone ?? "",
      fairyDragonPosition: savedEvents.fairyDragonPosition ?? (index % 2 === 0 ? "northwest" : "southeast"),
    },
  };
}
// 폰 화면 임무는 구글 시트 「스타팅 명단」 탭에서 읽는다. 앱에 사본을 두지 않는다.
const MISSION_SHEET_CSV = `https://docs.google.com/spreadsheets/d/1NUorQ8zecl1mDRstKk-F1T7hRF2YYBgS_ZG21gIvcgc/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent("스타팅 명단")}`;
type SheetMission = { slot: number; nickname: string; team: string; main: string; sub: string; units: MissionOrders };
type MissionSheet = { missions: Map<number, SheetMission>; common: string[] };
function entranceBlock(mission: SheetMission | undefined, side: MissionSide, variant: MapVariant) {
  if (mission?.team.replace(/\s/g, "") !== "입구막팀" || !/입구\s*막(?:기|음)/.test(mission.main)) return null;
  const top = /탑|top/i.test(mission.main);
  if (!top && !/바텀|bottom/i.test(mission.main)) return null;
  // 같은 전장 라인은 상대 진형의 반대쪽 출구와 연결된다(진형은 180도 회전).
  const enemy = lineExit(top ? 25 : 1, side === "ian" ? "lucia" : "ian", variant);
  return { top, point: enemy.start };
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// 열은 머리글 이름으로 찾는다. 시트에서 열을 옮기거나 다른 열을 지워도 이름만 같으면 된다.
// 번호 칸이 0·"공통 임무"인 행은 전원 공통 임무다. gviz는 숫자 열의 글자를 빈칸으로 바꾸므로
// 번호 칸이 빈 내용 행도 공통 임무로 읽는다. 그 행은 번호 칸을 뺀 나머지 칸을 차례로 쓴다.
function readMissionSheet(text: string): MissionSheet {
  const [head = [], ...rows] = parseCsv(text);
  const column = (name: string) => head.findIndex((cell) => cell.replace(/\s/g, "") === name);
  const at = { slot: column("스타팅포인트번호"), nickname: column("닉네임"), team: column("소속팀"), main: column("메인임무"), sub: column("서브임무"), units: [1, 2, 3, 4, 5].map((unit) => column(`${unit}번부대`)) };
  if ([at.slot, at.nickname, at.team, at.main, at.sub, ...at.units].some((index) => index < 0)) throw new Error("시트 머리글을 찾지 못했습니다");
  const missions = new Map<number, SheetMission>();
  let common: string[] | null = null;
  for (const row of rows) {
    const cell = (index: number) => (row[index] ?? "").trim();
    const label = cell(at.slot).replace(/\s/g, "");
    if (label === "0" || label === "공통임무" || label === "") {
      const items = row.map((_, index) => index === at.slot ? "" : cell(index)).filter(Boolean);
      if (items.length && !common) common = items;
      continue;
    }
    const slot = Number(label);
    if (!Number.isInteger(slot) || slot < 1 || slot > 30 || !cell(at.nickname) || missions.has(slot)) continue;
    missions.set(slot, { slot, nickname: cell(at.nickname), team: cell(at.team), main: cell(at.main), sub: cell(at.sub), units: at.units.map(cell) as MissionOrders });
  }
  return { missions, common: common ?? [] };
}
// 스테프(지팡이 아티 순간이동)는 같은 시트의 「스테프」 탭에서 읽는다. 0번 행의 사용 방법은 전원 공통 규칙이다.
// 군: 시작 = 게임 시작 직후 자기 5부대 탑승, 지정 = STAFF 포인트에서 다른 사람 부대를 태워 순차 사용.
const STAFF_SHEET_CSV = `https://docs.google.com/spreadsheets/d/1NUorQ8zecl1mDRstKk-F1T7hRF2YYBgS_ZG21gIvcgc/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent("스테프")}`;
type StaffPlan = { slot: number; group: "start" | "point" | null; order: number | null; top: boolean | null; target: string; method: string };
type StaffSheet = { plans: Map<number, StaffPlan>; common: string };
function readStaffSheet(text: string): StaffSheet {
  const [head = [], ...rows] = parseCsv(text);
  const column = (name: string) => head.findIndex((cell) => cell.replace(/\s/g, "") === name);
  const at = { slot: column("번호"), group: column("군"), order: column("순번"), place: column("사용위치"), target: column("목적지"), method: column("사용방법") };
  // 없는 탭을 요청하면 gviz가 첫 탭을 돌려주므로 머리글로 걸러낸다.
  if (Object.values(at).some((index) => index < 0)) throw new Error("스테프 시트 머리글을 찾지 못했습니다");
  const plans = new Map<number, StaffPlan>();
  let common = "";
  for (const row of rows) {
    const cell = (index: number) => (row[index] ?? "").trim();
    const label = cell(at.slot);
    if (label === "0") { common ||= cell(at.method); continue; }
    const slot = Number(label);
    if (!label || !Number.isInteger(slot) || slot < 1 || slot > 30 || plans.has(slot)) continue;
    const group = cell(at.group), place = cell(at.place);
    plans.set(slot, {
      slot,
      group: group.includes("시작") ? "start" : /지정|중간/.test(group) ? "point" : null,
      order: Number.parseInt(cell(at.order), 10) || null,
      top: /탑|top/i.test(place) ? true : /바텀|bottom/i.test(place) ? false : null,
      target: cell(at.target),
      method: cell(at.method),
    });
  }
  return { plans, common };
}
// 시트 문장을 지시 하나씩 끊는다. "/"·"+"·문장 끝 마침표에서 끊되, 괄호 안과 "1."처럼 숫자 뒤 마침표는 그대로 둔다.
function missionLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    const sentenceEnd = char === "." && !/\d/.test(text[index - 1] ?? "") && /^\s?$/.test(text[index + 1] ?? "");
    if (depth === 0 && (char === "/" || char === "+" || sentenceEnd)) { lines.push(current); current = ""; continue; }
    current += char;
  }
  lines.push(current);
  return lines.map((line) => line.trim()).filter(Boolean);
}
// 위치(시계·거점)와 타이밍 단어를 강조 조각으로 나눈다.
const MISSION_HIGHLIGHT = /((?:(?<!\d)(?:12|1|3|6|7|9)시\s?)?(?:천무|축복|치료|용기|군왕|목명)(?:의\s?(?:전당|영목)|\s?전당)?)|(펫(?:\s?(?:타이밍|리젠|싸움))?|생명석(?:\s?(?:젠|타이밍))?|집결이 터지면)/g;
function missionParts(text: string): Array<{ text: string; kind?: "place" | "time" }> {
  const parts: Array<{ text: string; kind?: "place" | "time" }> = [];
  let last = 0;
  for (const match of text.matchAll(MISSION_HIGHLIGHT)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: match[0], kind: match[1] ? "place" : "time" });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
// 공통 임무의 "팀 = …" 항목은 그 팀 카드에도 싣는다. 시트 표기 차이(기병대·기마팀)만 맞춘다.
const TEAM_ALIAS = new Map([["기병", "기마"]]);
function teamKey(name: string) {
  const key = name.replace(/\s/g, "").replace(/(팀|대)$/, "");
  return TEAM_ALIAS.get(key) ?? key;
}
function splitCommon(item: string) {
  const [, head, body] = item.match(/^([^=]{1,12}?)\s*=\s*([\s\S]+)$/) ?? [];
  return head ? { head: head.trim(), body } : { head: "", body: item };
}
function teamCommon(common: string[], team: string) {
  return common.map(splitCommon).filter((item) => !item.head || (!!team && teamKey(item.head) === teamKey(team)));
}
// 같은 지시가 이어지면 "2~5"처럼 한 줄로 묶는다.
function groupUnits(units: string[]) {
  const groups: Array<{ from: number; to: number; text: string }> = [];
  units.forEach((text, index) => {
    if (!text) return;
    const last = groups.at(-1);
    if (last && last.text === text && last.to === index) last.to = index + 1;
    else groups.push({ from: index + 1, to: index + 1, text });
  });
  return groups;
}
// localStorage와 JSON 가져오기가 같은 검사를 거친다.
function readOperation(saved: Operation): Operation {
  if (saved?.version !== 1 || !Array.isArray(saved.players) || !saved.scenes?.length) throw new Error("지원하지 않는 저장 데이터");
  return normalizeOperation(saved);
}
function smoothPath(points: Point[]) {
  if (points.length < 2) return "";
  const scaled = points.map((point) => ({ x: point.x * 1000, y: point.y * 1000 }));
  let path = `M ${scaled[0].x} ${scaled[0].y}`;
  for (let index = 1; index < scaled.length - 1; index += 1) {
    const current = scaled[index];
    const next = scaled[index + 1];
    path += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  const last = scaled[scaled.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}
function fitAxis(value: number, size: number) { return Math.min(Math.max(.01, value), .99 - size); }
function memoRect(start: Point, end: Point) {
  const width = Math.min(Math.max(Math.abs(end.x - start.x), MEMO_MIN_SIZE.width), .98);
  const height = Math.min(Math.max(Math.abs(end.y - start.y), MEMO_MIN_SIZE.height), .98);
  return { left: fitAxis(Math.min(start.x, end.x), width), top: fitAxis(Math.min(start.y, end.y), height), width, height };
}
function memoSpan(object: TacticalObject) { return { width: Math.abs((object.x2 ?? object.x) - object.x), height: Math.abs((object.y2 ?? object.y) - object.y) }; }
const RALLY_LEADER_ALIAS: Array<[string, string]> = [["진수님", "진수"], ["MAHA님", "Maha"], ["테슬라님", "TESLA"], ["TESLA님", "TESLA"], ["예리님", "예리"], ["벌꿀오소리형", "벌꿀오소리형"], ["게이님", "벌꿀오소리형"], ["오소리님", "벌꿀오소리형"]];
function objectivePoint(id: string, variant: MapVariant): Point | null {
  const found = OBJECTIVE_META.find((item) => item.id === id);
  if (!found) return null;
  const point = found[variant];
  return { x: point.x / 100, y: point.y / 100 };
}
function missionTargets(text: string, side: MissionSide, variant: MapVariant, missions: Map<string, MissionOrders>, followed = false): Array<{ key: string; point: Point }> {
  // 집결 탑승은 그 집결장이 서는 자리로 따라간다.
  if (!followed && /집결 ?탑승/.test(text)) {
    const alias = RALLY_LEADER_ALIAS.find(([label]) => text.includes(label));
    const leader = alias && missions.get(alias[1]);
    if (!leader) return [];
    const rally = leader.map((order) => mirrorMission(order, side)).find((order) => order.includes("집결"));
    return rally ? missionTargets(rally, side, variant, missions, true) : [];
  }
  // 획득 조건에 등장한 거점은 출발 조건이며, 화살표의 목적지는 조건 뒤의 지시다.
  const order = text.replace(/^.*(?:획득\s*시|획득하면)/, "");
  let ids: string[];
  if (order.includes("전망대")) {
    const left = /좌측|왼쪽|전망대(?:\s*주둔)?\s*1/.test(order);
    const right = /우측|오른쪽|전망대(?:\s*주둔)?\s*2(?!\s*개)/.test(order);
    ids = [left || !right ? `lookout-${side}-west` : "", right || !left ? `lookout-${side}-east` : ""].filter(Boolean);
  } else if (order.includes("입구")) {
    // 입구막는 적 보병을 미는 필드 부대는 고정 입구로 보내지 않는다.
    if (/입구\s*막는.*(?:밀|섬멸)/.test(order)) return [];
    const top = /탑|top/i.test(order), bottom = /바텀|bottom/i.test(order);
    if (!top && !bottom) return [];
    return [{ key: top ? "enemy-top-gate" : "enemy-bottom-gate", point: lineExit(top ? 25 : 1, side === "ian" ? "lucia" : "ian", variant).start }];
  } else {
    const names = [...order.matchAll(/(?:(?<!\d)(1[0-2]|[1-9])시\s*(?:적\s*)?)?(천무|축복|치료|용기|군왕|목명)/g)];
    if (names.length) {
      ids = names.flatMap(([, clock, name]) => {
        const matches = OBJECTIVE_META.filter((objective) => objective.label.includes(name) &&
          (!clock || new RegExp(`(?<!\\d)${clock}시`).test(`${objective.location} ${objective.label}`)));
        // 같은 이름의 영목 두 곳을 방향 없이 하나로 추정하거나 서로 다른 시계/이름을 무시하지 않는다.
        return matches.length === 1 ? [matches[0].id] : [];
      });
    } else {
      const clocks = [...order.matchAll(/(?<!\d)(12|1|3|6|7|9)시/g)];
      const clockIds: Record<string, string> = { "12": "spirit-north", "1": "hall-northeast", "3": "spirit-east", "6": "spirit-south", "7": "hall-southwest", "9": "spirit-west" };
      ids = clocks.map(([, clock]) => clockIds[clock]);
    }
  }
  return [...new Set(ids)].flatMap((id) => { const point = objectivePoint(id, variant); return point ? [{ key: id, point }] : []; });
}
// 카드는 진영색 한 가지로 칠하므로, 색상 대신 강조 단계로 위계를 준다.
function missionEmphasis(text: string) {
  const tone = missionTone(text);
  if (tone === "rally" || tone === "garrison") return "is-key";
  return tone === "field" ? "is-muted" : "";
}
function missionTone(text: string): MissionTone {
  if (/집결 ?탑승/.test(text)) return "join";
  // "적 집결 이동경로 막기"처럼 적의 집결을 막는 문장이 있어 막기를 집결보다 먼저 본다.
  if (text.includes("막기")) return "block";
  if (text.includes("집결")) return "rally";
  if (text.includes("주둔장")) return "garrison";
  if (text.includes("필드")) return "field";
  if (text.includes("주유")) return "roam";
  return "hold";
}
// 집결장·주둔장은 부대 목표 문장 안에 섞여 있어, 지휘 보직만 따로 뽑아 위에 세운다.
function missionCommandRoles(orders: string[]) {
  const seen = new Set<string>();
  const roles: Array<{ key: string; label: string; place: string; tone: MissionTone }> = [];
  orders.forEach((text) => {
    const tone = missionTone(text);
    if (tone !== "rally" && tone !== "garrison") return;
    if (seen.has(text)) return;
    seen.add(text);
    const label = tone === "rally" ? "집결장" : text.includes("서브") ? "서브 주둔장" : "주둔장";
    const place = text.replace(/서브 ?주둔장|주둔장|집결장|집결/g, "").replace(/ +/g, " ").trim();
    roles.push({ key: text, label, place: place || "위치 미상", tone });
  });
  return roles;
}
type MissionRoute = { target: string; to: Point; units: number[]; roaming: boolean };
function buildMissionPlan(orders: string[] | null, side: MissionSide, variant: MapVariant, missions: Map<string, MissionOrders>) {
  const byTarget = new Map<string, { point: Point; units: number[] }>();
  const gaps: number[] = [];
  (orders ?? []).forEach((text, index) => {
    const targets = missionTargets(text, side, variant, missions);
    if (targets.length) { targets.forEach(({ key, point }) => byTarget.set(key, { point, units: [...(byTarget.get(key)?.units ?? []), index + 1] })); return; }
    gaps.push(index + 1);
  });
  const routes: MissionRoute[] = [...byTarget].map(([target, { point, units }]) => ({ target, to: point, units, roaming: false }));
  return { routes, gaps: gaps.sort((a, b) => a - b) };
}
// 집결 탑승 경로는 편집된 명단의 집결장 임무를 따라간다.
function missionsByNickname(players: Player[]) {
  return new Map(players.flatMap((player): Array<[string, MissionOrders]> => { const brief = playerBrief(player); return brief ? [[player.nickname, brief.units]] : []; }));
}
function missionView(player: Player, missions: Map<string, MissionOrders>, side: MissionSide, variant: MapVariant) {
  const brief = playerBrief(player);
  const orders = brief?.units.map((text) => mirrorMission(text, side)) ?? null;
  return { brief, orders, roles: orders ? missionCommandRoles(orders) : [], plan: buildMissionPlan(orders, side, variant, missions) };
}
function newPlayer(players: Player[]): Player {
  return { id: Math.max(0, ...players.map((player) => player.id)) + 1, nickname: "", primaryRole: "infantry", secondaryRoles: [], lineup: "starter", slot: null, brief: null };
}
// 편집기는 기본 번호·임무까지 펼친 사본을 고친다.
function editablePlayer(player: Player): Player {
  return clone({ ...player, slot: playerSlot(player) ?? null, brief: playerBrief(player) ?? null });
}
function slotPoint(slot: number, side: MissionSide, variant: MapVariant): Point | null {
  const offset = SLOT_POINTS.get(slot);
  return offset ? formationPoint(offset, side, variant) : null;
}
function formationPoint(offset: Point, side: MissionSide, variant: MapVariant): Point {
  const center = STARTING_POINT_CENTER[variant][side];
  const turn = side === "ian" ? 1 : -1;
  return { x: clamp(center.x + offset.x * turn), y: clamp(center.y + offset.y * turn) };
}
// 이안 안내 이미지의 STAFF 포인트 2곳을 진형 격자 단위로 둔다. 행 안 칸 방향과 행 방향이 거의 직각이라
// TOP은 12번의 2시 방향으로 6번·19번과 같은 간격, BOTTOM은 24번·25번 사이 바로 아래로 두 성과 같은 간격이다.
const STAFF_OFFSETS = (() => {
  const shift = (slot: number, along: number, row: number) => {
    const base = SLOT_POINTS.get(slot)!;
    return { x: base.x + along * SLOT_STEP_ALONG.x + row * SLOT_STEP_ROW.x, y: base.y + along * SLOT_STEP_ALONG.y + row * SLOT_STEP_ROW.y };
  };
  return { top: shift(12, -1.2, 0), bottom: shift(24, .5, .9) };
})();
function staffPoint(top: boolean, side: MissionSide, variant: MapVariant): Point {
  return formationPoint(STAFF_OFFSETS[top ? "top" : "bottom"], side, variant);
}
// 시작군은 내 자리에서, 지정군은 사용할 STAFF 포인트(빈칸이면 내 라인)에서 목적지로 순간이동한다.
function staffRoute(plan: StaffPlan | undefined, slot: number, side: MissionSide, variant: MapVariant, missions: Map<string, MissionOrders>) {
  if (!plan?.group) return null;
  const top = plan.top ?? TOP_LINE_SLOTS.has(slot);
  const from = plan.group === "start" ? slotPoint(slot, side, variant) : staffPoint(top, side, variant);
  if (!from) return null;
  return { from, top, targets: plan.target ? missionTargets(mirrorMission(plan.target, side), side, variant, missions) : [] };
}
function playerNameClass(player: Player) {
  if (player.secondaryRoles.includes("rally")) return "name-rally";
  if (player.secondaryRoles.includes("garrison")) return "name-garrison";
  return `name-${player.primaryRole}`;
}

function UnitRoleIcon({ unitRole, isRally = false }: { unitRole: PrimaryRole; isRally?: boolean }) {
  return (
    <svg className={`unit-role-icon ${isRally ? "rally-unit-icon" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      {isRally ? <><path d="M3 2h4l6.1 6.1-3 3L4 5H2V3l1-1Zm7.8 11.4 2.8 2.8-2.1 2.1-1.4-1.4-3.2 3.2-2.1-2.1 3.2-3.2-1.4-1.4 2.1-2.1 2.1 2.1Z" /><path d="M21 2h-4l-6.1 6.1 3 3L20 5h2V3l-1-1Zm-7.8 11.4-2.8 2.8 2.1 2.1 1.4-1.4 3.2 3.2 2.1-2.1-3.2-3.2 1.4-1.4-2.1-2.1-2.1 2.1Z" /></> : <>
        {unitRole === "infantry" && <path d="M12 2 20 5v6c0 5.2-3.4 9.1-8 11-4.6-1.9-8-5.8-8-11V5l8-3Z" />}
        {unitRole === "cavalry" && <><path d="M6 19h13v3H5v-2l1-1Zm3-1c0-2.2.9-4 2.6-5.3L10 10l2-6 2.4 2.5L19 8l-2.2 3.6c.8 1.4 1.2 3 1.2 4.9V18H9Z" /><circle cx="14.8" cy="9.5" r="1" className="unit-icon-cutout" /></>}
        {unitRole === "ranged" && <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" className="unit-icon-cutout" /></>}
      </>}
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg className="eraser-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path className="eraser-body" d="m5.2 20.1 12-12a3.1 3.1 0 0 1 4.4 0l5.2 5.2a3.1 3.1 0 0 1 0 4.4L16.5 28H11l-5.8-5.8a1.5 1.5 0 0 1 0-2.1Z" />
      <path className="eraser-tip" d="m5.2 20.1 5.7-5.7 8.7 8.7-4.9 4.9H11l-5.8-5.8a1.5 1.5 0 0 1 0-2.1Z" />
      <path className="eraser-line" d="m10.9 14.4 8.7 8.7" />
    </svg>
  );
}

// 폰 화면: 첫 화면은 주전 30명 번호순 3열, 이름을 누르면 시트 임무를 04 작전보드형 카드로 보여 준다.
// 시트를 고치면 다음 새로고침, 앱으로 돌아올 때, 또는 30초 안에 반영된다.
const MOBILE_PICK_KEY = "heinapel-mobile-slot";
const MOBILE_SIDE_KEY = "heinapel-mobile-side";
function MissionText({ text }: { text: string }) {
  return <>{missionParts(text).map((part, index) => part.kind ? <mark key={index} className={`hl-${part.kind}`}>{part.text}</mark> : part.text)}</>;
}
function MissionLines({ text }: { text: string }) {
  const lines = missionLines(text);
  return lines.length > 1
    ? <ul className="board-lines">{lines.map((line, index) => <li key={index}><MissionText text={line} /></li>)}</ul>
    : <p className="board-line"><MissionText text={lines[0] ?? text} /></p>;
}
function CommonItems({ items }: { items: Array<{ head: string; body: string }> }) {
  return <div className="board-common">{items.map((item, index) => <div key={index}>{item.head && <b>{item.head}</b>}<MissionLines text={item.body} /></div>)}</div>;
}
const MOBILE_SLOTS = Array.from({ length: 30 }, (_, index) => index + 1);
const COMMON_SLOT = 0;
const STAFF_SLOT = -1;
type SheetState<T> = { data: T | null; failed: boolean };
// 폰 화면과 PC 스테프 창이 같은 시트 읽기를 쓴다. 시트를 고치면 새로고침, 앱으로 돌아올 때, 또는 30초 안에 반영된다.
function useMissionSheets() {
  const [sheet, setSheet] = useState<SheetState<MissionSheet>>({ data: null, failed: false });
  const [staff, setStaff] = useState<SheetState<StaffSheet>>({ data: null, failed: false });
  useEffect(() => {
    let alive = true;
    // 실패해도 마지막으로 읽은 임무는 그대로 두고 경고만 띄운다.
    const load = () => fetch(MISSION_SHEET_CSV, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.text(); })
      .then((text) => { const data = readMissionSheet(text); if (alive) setSheet({ data, failed: false }); })
      .catch(() => { if (alive) setSheet((current) => ({ ...current, failed: true })); });
    // 스테프 탭은 따로 읽어, 실패해도 임무 카드는 그대로 보인다.
    const loadStaff = () => fetch(STAFF_SHEET_CSV, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.text(); })
      .then((text) => { const data = readStaffSheet(text); if (alive) setStaff({ data, failed: false }); })
      .catch(() => { if (alive) setStaff((current) => ({ ...current, failed: true })); });
    const loadAll = () => { load(); loadStaff(); };
    const onVisible = () => { if (document.visibilityState === "visible") loadAll(); };
    loadAll();
    const timer = setInterval(loadAll, 30000);
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return { sheet, staff };
}
// 시트를 읽기 전에는 앱 명단의 이름을 보여 준다.
function slotName(missions: Map<number, SheetMission> | undefined, players: Player[], slot: number) {
  return missions?.get(slot)?.nickname ?? players.find((player) => playerSlot(player) === slot)?.nickname ?? "—";
}
// S 스테프 카드: 공통 규칙, 시작군 명단, 지정군 포인트별 순번표, 미배정. 폰 화면과 PC 창이 같이 쓴다.
function StaffBoard({ staff, side, nameOf }: { staff: SheetState<StaffSheet>; side: MissionSide; nameOf: (slot: number) => string }) {
  const plans = staff.data?.plans;
  const list = [...(plans?.values() ?? [])];
  const pointGroup = (top: boolean) => list.filter((plan) => plan.group === "point" && (plan.top ?? TOP_LINE_SLOTS.has(plan.slot)) === top)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.slot - b.slot);
  const groups: Array<{ title: string; items: StaffPlan[]; badge: (plan: StaffPlan) => string | number }> = [
    { title: "시작 스테프 · 게임 시작 직후 자기 5부대", items: list.filter((plan) => plan.group === "start"), badge: (plan) => plan.slot },
    { title: "지정 스테프 · TOP 포인트 순번", items: pointGroup(true), badge: (plan) => plan.order ?? "–" },
    { title: "지정 스테프 · BOTTOM 포인트 순번", items: pointGroup(false), badge: (plan) => plan.order ?? "–" },
  ];
  const unassigned = MOBILE_SLOTS.filter((slot) => !plans?.get(slot)?.group);
  return (
    <article className="board">
      <header className="board-head"><b>S</b><strong>스테프 카드</strong><span>{MISSION_SIDE_LABEL[side]}</span></header>
      <p className="board-team">지팡이 아티 순간이동</p>
      {!staff.data ? <p className="board-empty">{staff.failed ? "스테프 표를 불러오지 못했습니다" : "스테프 표를 불러오는 중…"}</p> : <>
        {staff.data.common && <section className="board-box"><h3>공통 규칙</h3><MissionLines text={mirrorMission(staff.data.common, side)} /></section>}
        {groups.map((group) => <section key={group.title} className="board-box"><h3>{group.title}</h3>
          {group.items.length ? <ol className="board-units">{group.items.map((plan) => <li key={plan.slot}><i>{group.badge(plan)}</i><span>{plan.group === "point" && `${plan.slot} `}{nameOf(plan.slot)}{plan.target && <> → <MissionText text={mirrorMission(plan.target, side)} /></>}</span></li>)}</ol>
            : <p className="board-empty">배정 없음</p>}
        </section>)}
        {unassigned.length > 0 && <section className="board-box"><h3>미배정 {unassigned.length}명</h3><p>{unassigned.map((slot) => `${slot} ${nameOf(slot)}`).join(" · ")}</p></section>}
      </>}
      <p className="board-foot">{MISSION_SIDE_LABEL[side]} 진영 기준 · 지팡이 콜은 디스코드 보이스 오더</p>
    </article>
  );
}
function StaffDialog({ staff, side, nameOf, onClose }: { staff: SheetState<StaffSheet>; side: MissionSide; nameOf: (slot: number) => string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  return <dialog ref={dialogRef} className={`staff-dialog side-${side}`} onCancel={onClose} aria-label="스테프 카드">
    <button type="button" className="staff-dialog-close" onClick={onClose} aria-label="스테프 카드 닫기">×</button>
    <StaffBoard staff={staff} side={side} nameOf={nameOf} />
  </dialog>;
}
function MobileBriefing({ players, sheet, staff }: { players: Player[]; sheet: SheetState<MissionSheet>; staff: SheetState<StaffSheet> }) {
  const [side, setSide] = useState<MissionSide>("ian");
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        // 저장값이 없으면 null이 0(공통 임무)으로 바뀌지 않게 문자열 그대로 비교한다.
        if (localStorage.getItem(MOBILE_SIDE_KEY) === "lucia") setSide("lucia");
        const saved = localStorage.getItem(MOBILE_PICK_KEY);
        const slot = Number(saved);
        if (saved && (slot === COMMON_SLOT || slot === STAFF_SLOT || MOBILE_SLOTS.includes(slot))) setPicked(slot);
      } catch { /* 사생활 모드에서는 그냥 고르게 둔다. */ }
    });
  }, []);
  const chooseSide = (next: MissionSide) => {
    setSide(next);
    try { localStorage.setItem(MOBILE_SIDE_KEY, next); } catch { /* 저장 실패는 조회를 막지 않는다. */ }
  };
  const pick = (slot: number | null) => {
    setPicked(slot);
    try { if (slot !== null) localStorage.setItem(MOBILE_PICK_KEY, String(slot)); else localStorage.removeItem(MOBILE_PICK_KEY); } catch { /* 저장 실패는 조회를 막지 않는다. */ }
  };
  const missions = sheet.data?.missions;
  const nameOf = (slot: number) => slotName(missions, players, slot);
  const warning = sheet.failed && <p className="mobile-sync" role="alert">{sheet.data ? "최신 임무를 불러오지 못했습니다. 마지막으로 받은 내용입니다." : "임무를 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요."}</p>;

  if (picked === null) return (
    <div className="mobile-shell">
      <header className="mobile-top"><span>HEINAPEL WAR TABLE</span><strong>스타팅 멤버</strong></header>
      {warning}
      <button type="button" className="mobile-common" onClick={() => pick(COMMON_SLOT)}><b>0</b><span>공통 임무</span><small>30명 전원</small></button>
      <button type="button" className="mobile-common" onClick={() => pick(STAFF_SLOT)}><b>S</b><span>스테프 카드</span><small>지팡이 순간이동</small></button>
      <ol className="mobile-roster">{MOBILE_SLOTS.map((slot) => <li key={slot}><button type="button" onClick={() => pick(slot)}><b>{slot}</b><span>{nameOf(slot)}</span></button></li>)}</ol>
    </div>
  );

  const top = <header className="mobile-top">
    <button type="button" className="mobile-back" onClick={() => pick(null)} aria-label="명단으로 돌아가기">‹</button>
    <strong>임무 카드</strong>
    <div className="mobile-side">{MISSION_SIDES.map((item) => <button type="button" key={item} className={side === item ? "active" : ""} aria-pressed={side === item} onClick={() => chooseSide(item)}>{MISSION_SIDE_LABEL[item]}</button>)}</div>
  </header>;
  const loading = <p className="board-empty">{sheet.failed ? "임무를 불러오지 못했습니다" : "임무를 불러오는 중…"}</p>;

  if (picked === COMMON_SLOT) return (
    <div className={`mobile-shell side-${side}`}>
      {top}
      {warning}
      <article className="board">
        <header className="board-head"><b>00</b><strong>공통 임무</strong><span>{MISSION_SIDE_LABEL[side]}</span></header>
        <p className="board-team">30명 전원</p>
        {!sheet.data ? loading : !sheet.data.common.length ? <p className="board-empty">임무 준비 중</p> : <section className="board-box"><h3>공통 임무</h3>
          {/* "기병대 = …"처럼 앞에 대상이 붙은 항목은 대상을 제목으로 세운다. */}
          <CommonItems items={sheet.data.common.map((item) => splitCommon(mirrorMission(item, side)))} />
        </section>}
        <p className="board-foot">{MISSION_SIDE_LABEL[side]} 진영 기준{side === "lucia" ? " · 시트의 이안 기준 위치를 루시아 기준으로 환산" : ""} · 30 vs 30 · 1인 5부대</p>
      </article>
    </div>
  );

  const plans = staff.data?.plans;
  const staffLabel = (plan: StaffPlan, slot: number) => plan.group === "start" ? "시작 스테프 · 자기 5부대" : `지정 스테프 · ${plan.top ?? TOP_LINE_SLOTS.has(slot) ? "TOP" : "BOTTOM"} 포인트${plan.order ? ` ${plan.order}번째` : ""}`;

  if (picked === STAFF_SLOT) return (
    <div className={`mobile-shell side-${side}`}>
      {top}
      {warning}
      <StaffBoard staff={staff} side={side} nameOf={nameOf} />
    </div>
  );

  const mission = missions?.get(picked);
  const orders = mission?.units.map((text) => mirrorMission(text, side));
  const units = orders?.some(Boolean) ? orders : null;
  const ready = !!mission && !!(mission.main || mission.sub || units);
  const leaders = new Map([...(missions?.values() ?? [])].map((item): [string, MissionOrders] => [item.nickname, item.units]));
  const block = entranceBlock(mission, side, "tactical");
  const routes = block ? [] : buildMissionPlan(units, side, "tactical", leaders).routes;
  const home = slotPoint(picked, side, "tactical");
  const line = home ? lineExit(picked, side, "tactical") : null;
  const common = teamCommon((sheet.data?.common ?? []).map((item) => mirrorMission(item, side)), mission?.team ?? "");
  const plan = plans?.get(picked);
  const staffPath = staffRoute(plan, picked, side, "tactical", leaders);

  return (
    <div className={`mobile-shell side-${side}`}>
      {top}
      {warning}
      <article className="board">
        <header className="board-head"><b>{String(picked).padStart(2, "0")}</b><strong>{nameOf(picked)}</strong><span>{MISSION_SIDE_LABEL[side]}</span></header>
        <p className="board-team">{mission?.team || "소속팀 미정"}</p>
        {!missions ? loading : !ready ? <p className="board-empty">임무 준비 중</p> : <>
          {mission.main && <section className="board-box"><h3>메인 임무</h3><MissionLines text={mirrorMission(mission.main, side)} /></section>}
          {mission.sub && <section className="board-box"><h3>서브 임무</h3><MissionLines text={mirrorMission(mission.sub, side)} /></section>}
          {units && <section className="board-box"><h3>부대 배치</h3><ol className="board-units">{groupUnits(units).map((group) => <li key={group.from} className={missionEmphasis(group.text)}><i>{group.from === group.to ? group.from : `${group.from}~${group.to}`}</i><span><MissionText text={group.text} /></span></li>)}</ol></section>}
        </>}
        {plan?.group && <section className="board-box board-staff"><h3>스테프 사용 · {staffLabel(plan, picked)}</h3>
          <MissionLines text={mirrorMission([plan.target && `목적지 ${plan.target}`, plan.method].filter(Boolean).join(" / ") || "목적지 미정", side)} />
        </section>}
        {/* 개인 임무가 먼저 보이게 공통 임무는 접어 둔다. */}
        {common.length > 0 && <details className="board-box board-fold"><summary>공통 임무 · {common.find((item) => item.head)?.head ?? "전원"}<span className="fold-open">펼쳐 보기 ▾</span><span className="fold-close">접기 ▴</span></summary><CommonItems items={common} /></details>}
        {/* 라인 화살표는 임무가 없어도 보여 준다. */}
        {home && line && <section className="board-box"><h3>배치 지도 · {block ? `적 ${block.top ? "TOP" : "BOTTOM"} 입구 차단` : line.top ? "TOP Line" : "Bottom Line"}</h3>
          <div className="mobile-map">
            <div className="mobile-map-art" />
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label={block ? "내 자리와 적 입구 차단 위치" : "내 자리, 라인 출구와 부대 목적지"}>
              <defs>
                <marker id="mobile-head" markerWidth="9" markerHeight="9" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" /></marker>
                <marker id="block-head" viewBox="0 0 9 6" markerWidth="3" markerHeight="2.4" refX="9" refY="3" orient="auto"><path className="block-head" d="M0,0 L0,6 L9,3 z" /></marker>
                <marker id="staff-head" viewBox="0 0 9 6" markerWidth="3" markerHeight="2.4" refX="9" refY="3" orient="auto"><path className="staff-head" d="M0,0 L0,6 L9,3 z" /></marker>
                {(["top", "bottom"] as const).map((key) => <marker key={key} id={`line-head-${key}`} viewBox="0 0 9 6" markerWidth="3" markerHeight="2.4" refX="9" refY="3" orient="auto"><path className={`line-head is-${key}`} d="M0,0 L0,6 L9,3 z" /></marker>)}
              </defs>
              {routes.map((route) => <line key={route.target} className={route.roaming ? "is-roaming" : ""} x1={home.x * 1000} y1={home.y * 1000} x2={route.to.x * 1000} y2={route.to.y * 1000} markerEnd="url(#mobile-head)" />)}
              {block ? <line className="block-route" x1={home.x * 1000} y1={home.y * 1000} x2={block.point.x * 1000} y2={block.point.y * 1000} markerEnd="url(#block-head)" /> :
                <line className={`line-route ${line.top ? "is-top" : "is-bottom"}`} x1={line.start.x * 1000} y1={line.start.y * 1000} x2={line.point.x * 1000} y2={line.point.y * 1000} markerEnd={`url(#line-head-${line.top ? "top" : "bottom"})`} />}
              {staffPath?.targets.map((target) => <line key={target.key} className="staff-route" x1={staffPath.from.x * 1000} y1={staffPath.from.y * 1000} x2={target.point.x * 1000} y2={target.point.y * 1000} markerEnd="url(#staff-head)" />)}
            </svg>
            {OBJECTIVE_META.filter((objective) => !objective.id.startsWith("lookout-") || objective.id.startsWith(`lookout-${side}-`)).map((objective) => <span key={objective.id} className={`mobile-objective${objective.id.startsWith("lookout-") ? ` is-lookout-${objective.id.endsWith("west") ? "west" : "east"}` : ""}`} style={{ left: `${objective.tactical.x}%`, top: `${objective.tactical.y}%` }}>{objective.id.startsWith("lookout-") ? `전망대 ${objective.id.endsWith("west") ? 1 : 2}` : objective.label}</span>)}
            {block ? <span className="mobile-block" style={{ left: `${block.point.x * 100}%`, top: `${block.point.y * 100}%` }}>⊣<b>적 {block.top ? "TOP" : "BOTTOM"} 입구 차단</b></span> :
              <span className={`mobile-line ${line.top ? "is-top" : "is-bottom"}`} style={{ left: `${clamp(line.start.x + (line.point.x - line.start.x) * 1.4) * 100}%`, top: `${clamp(line.start.y + (line.point.y - line.start.y) * 1.4) * 100}%` }}>{line.top ? "TOP" : "BOTTOM"}</span>}
            {routes.map((route) => { const at = .8; return <span key={route.target} className={`mobile-tag${route.roaming ? " is-roaming" : ""}`} style={{ left: `${(home.x + (route.to.x - home.x) * at) * 100}%`, top: `${(home.y + (route.to.y - home.y) * at) * 100}%` }}>{route.units.join("·")}</span>; })}
            {/* 지도가 작아 내가 쓸 STAFF 포인트만 점과 이름표로 보인다. 이름표는 진형 바깥쪽에 붙인다. */}
            {staffPath && plan?.group === "point" && <span className={`mobile-staff is-${staffPath.top === (side === "ian") ? "right" : "left"}`} style={{ left: `${staffPath.from.x * 100}%`, top: `${staffPath.from.y * 100}%` }}><b>STAFF</b></span>}
            <span className="mobile-home" style={{ left: `${home.x * 100}%`, top: `${home.y * 100}%` }}>{picked}</span>
          </div>
        </section>}
        <p className="board-foot">{MISSION_SIDE_LABEL[side]} 진영 기준{side === "lucia" ? " · 시트의 이안 기준 위치를 루시아 기준으로 환산" : ""} · 30 vs 30 · 1인 5부대</p>
      </article>
    </div>
  );
}

function PlayerEditor({ initial, players, onSave, onDelete, onClose }: { initial: Player; players: Player[]; onSave: (player: Player) => void; onDelete: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => clone(initial));
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const patch = (value: Partial<Player>) => setDraft((current) => ({ ...current, ...value }));
  const patchBrief = (value: Partial<Brief>) => setDraft((current) => ({ ...current, brief: current.brief ? { ...current.brief, ...value } : null }));
  const isExisting = players.some((player) => player.id === draft.id);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isExisting && players.length >= 30) { setError("주전은 최대 30명입니다."); return; }
    const nickname = draft.nickname.trim();
    if (!nickname) { setError("닉네임을 입력해 주세요."); return; }
    if (players.some((player) => player.id !== draft.id && player.nickname.toLowerCase() === nickname.toLowerCase())) { setError("이미 등록된 닉네임입니다."); return; }
    if (draft.slot && players.some((player) => player.id !== draft.id && playerSlot(player) === draft.slot)) { setError("이미 사용 중인 전투 위치 번호입니다."); return; }
    const next = { ...draft, nickname, brief: draft.brief ? { ...draft.brief, nickname } : null };
    try { normalizeRoster({ ...freshOperation(), players: [next] }); }
    catch { setError("명단과 임무 입력 내용을 확인해 주세요."); return; }
    onSave(next);
  };
  return <dialog ref={dialogRef} className="player-editor" onCancel={onClose} aria-labelledby="player-editor-title">
    <form onSubmit={save}>
      <header><h2 id="player-editor-title">명단 · 임무 편집</h2><button type="button" onClick={onClose} aria-label="편집 닫기">×</button></header>
      <p>변경 내용은 이 브라우저에 저장됩니다. 다른 기기에는 JSON으로 전달하세요.</p>
      <div className="player-fields">
        <label>닉네임<input required maxLength={80} value={draft.nickname} onChange={(event) => patch({ nickname: event.target.value })} /></label>
        <label>병종<select value={draft.primaryRole} onChange={(event) => patch({ primaryRole: event.target.value as PrimaryRole })}>{Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>전투 위치 번호<input type="number" min={1} max={30} value={draft.slot ?? ""} placeholder="미지정" onChange={(event) => patch({ slot: event.target.value ? Number(event.target.value) : null })} /></label>
      </div>
      <fieldset><legend>지휘 역할</legend>{Object.entries(SECONDARY_LABEL).map(([value, label]) => <label className="role-check" key={value}><input type="checkbox" checked={draft.secondaryRoles.includes(value as SecondaryRole)} onChange={(event) => patch({ secondaryRoles: event.target.checked ? [...draft.secondaryRoles, value as SecondaryRole] : draft.secondaryRoles.filter((role) => role !== value) })} />{label}</label>)}</fieldset>
      <section className="brief-editor"><h3>임무 카드</h3><p>문안은 이안 진영 기준으로 입력하세요. 부대 지시에서 지도 경로를 계산합니다.</p>
        {!draft.brief ? <button type="button" onClick={() => patch({ brief: { nickname: draft.nickname, file: "", team: "", foot: "", steps: [], units: ["", "", "", "", ""] } })}>임무 추가</button> : <>
          <label>카드 부제<input value={draft.brief.team} onChange={(event) => patchBrief({ team: event.target.value })} /></label>
          <label>배지<input value={draft.brief.badge ?? ""} onChange={(event) => patchBrief({ badge: event.target.value })} /></label>
          {(["common", "steps"] as const).map((field) => <fieldset key={field}><legend>{field === "common" ? "공통 지시" : "시간·조건별 지시"}</legend>
            {(draft.brief?.[field] ?? []).map(([head, body], index) => <div className="brief-pair" key={index}>
              <input aria-label={`${field === "common" ? "공통" : "조건"} ${index + 1} 제목`} value={head} placeholder="제목·시간·조건" onChange={(event) => patchBrief({ [field]: draft.brief?.[field]?.map((pair, at) => at === index ? [event.target.value, pair[1]] : pair) })} />
              <textarea aria-label={`${field === "common" ? "공통" : "조건"} ${index + 1} 내용`} value={body} onChange={(event) => patchBrief({ [field]: draft.brief?.[field]?.map((pair, at) => at === index ? [pair[0], event.target.value] : pair) })} />
              <button type="button" aria-label={`${field === "common" ? "공통" : "조건"} ${index + 1} 삭제`} onClick={() => patchBrief({ [field]: draft.brief?.[field]?.filter((_, at) => at !== index) })}>삭제</button>
            </div>)}
            <button type="button" onClick={() => patchBrief({ [field]: [...(draft.brief?.[field] ?? []), ["", ""]] })}>{field === "common" ? "공통 지시 추가" : "조건 지시 추가"}</button>
          </fieldset>)}
          {draft.brief.units.map((text, index) => <label key={index}>부대 {index + 1}<textarea value={text} onChange={(event) => patchBrief({ units: draft.brief?.units.map((value, at) => at === index ? event.target.value : value) as MissionOrders })} /></label>)}
          <label>하단 안내<input value={draft.brief.foot} onChange={(event) => patchBrief({ foot: event.target.value })} /></label>
          {draft.brief.image && <button type="button" onClick={() => patchBrief({ image: undefined })}>첨부 이미지 삭제</button>}
          <button type="button" className="danger" onClick={() => patch({ brief: null })}>임무 삭제</button><small>저장을 누르면 임무 내용이 삭제됩니다. 선수는 명단에 남습니다.</small>
        </>}
      </section>
      {error && <p role="alert">{error}</p>}
      <footer>{isExisting && <button type="button" className="danger" onClick={() => { if (window.confirm(`${initial.nickname} 선수를 명단과 모든 장면에서 삭제할까요? 실행 취소로 복구할 수 있습니다.`)) onDelete(); }}>선수 삭제</button>}<button type="button" onClick={onClose}>취소</button><button type="submit">저장</button></footer>
    </form>
  </dialog>;
}

export default function WarTable() {
  const [operation, setOperation] = useState<Operation>(freshOperation);
  const [playerDraft, setPlayerDraft] = useState<Player | null>(null);
  const [staffOpen, setStaffOpen] = useState(false);
  const { sheet, staff } = useMissionSheets();
  const [storageError, setStorageError] = useState("");
  const [ready, setReady] = useState(false);
  const [editingId, setEditingId] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [memoDraft, setMemoDraft] = useState<{ id: string; text: string } | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | PrimaryRole>("all");
  const [mapVariant, setMapVariant] = useState<MapVariant>("tactical");
  const [mapFocus, setMapFocus] = useState(false);
  const [sceneDraft, setSceneDraft] = useState<SceneDraft | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const mapRef = useRef<HTMLElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const pastRef = useRef<Operation[]>([]);
  const futureRef = useRef<Operation[]>([]);
  const dragRef = useRef<null | { startClient: Point; sceneId: string; initial: Record<string, Point> }>(null);
  const drawPointsRef = useRef<Point[]>([]);
  const memoInputRef = useRef<HTMLTextAreaElement>(null);
  const memoDragRef = useRef<null | { id: string; sceneId: string; text: string; startClient: Point; origin: Point; size: { width: number; height: number }; moved: boolean }>(null);
  const cardDragRef = useRef<null | { playerId: number; startClient: Point; origin: Point; moved: boolean }>(null);

  const scene = operation.scenes.find((item) => item.id === operation.activeSceneId) ?? operation.scenes[0];
  const editingMemoId = memoDraft?.id ?? null;
  const missionSide: MissionSide = operation.side ?? "ian";
  const editing = operation.players.find((player) => player.id === editingId) ?? operation.players[0];
  const missionCards = operation.cards ?? [];
  const missions = missionsByNickname(operation.players);
  const openMissionBriefs = missionCards.map((card) => {
    const player = operation.players.find((item) => item.id === card.playerId);
    if (!player) return null;
    const { brief, orders, roles, plan } = missionView(player, missions, missionSide, mapVariant);
    const origin = scene.positions[String(player.id)] ?? STARTING_POINT_CENTER[mapVariant][missionSide];
    const routes = plan.routes.map((route) => ({ ...route, key: `${card.playerId}-${route.target}`, nickname: player.nickname, from: origin }));
    return { card, player, orders, roles, routes, gaps: plan.gaps, brief };
  }).filter((brief) => brief !== null);
  const missionRoutes = openMissionBriefs.filter((brief) => brief.card.route).flatMap((brief) => brief.routes);
  const counts = useMemo(() => {
    const starters = operation.players.filter((player) => player.lineup === "starter");
    const byRole = (role: PrimaryRole) => starters.filter((player) => player.primaryRole === role).length;
    return { infantry: byRole("infantry"), cavalry: byRole("cavalry"), ranged: byRole("ranged"), rally: starters.filter((player) => player.secondaryRoles.includes("rally")).length, starters: starters.length };
  }, [operation.players]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Operation;
          const restored = readOperation(saved);
          if ((saved.rosterRevision ?? 0) < 2) {
            const backupKey = `${STORAGE_KEY}-before-photo-roster-2026-10-01`;
            if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, raw);
            localStorage.removeItem(MOBILE_PICK_KEY);
          }
          setOperation(restored);
        }
      } catch { setStorageError("저장 데이터를 읽지 못했습니다. 원본은 보존했습니다. JSON 백업을 확인해 주세요."); }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready || storageError) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(operation)); }
    catch { queueMicrotask(() => setStorageError("자동 저장에 실패했습니다. JSON ↓로 변경 내용을 백업해 주세요.")); }
  }, [operation, ready, storageError]);

  // 실행 취소는 최근 60단계까지 둔다.
  const remember = (current: Operation) => { pastRef.current = [...pastRef.current.slice(-59), clone(current)]; futureRef.current = []; };
  const commit = (updater: (current: Operation) => Operation) => {
    setCanUndo(true);
    setCanRedo(false);
    setOperation((current) => {
      remember(current);
      const next = updater(clone(current));
      next.updatedAt = new Date().toISOString();
      return next;
    });
  };
  const checkpoint = () => { remember(operation); setCanUndo(true); setCanRedo(false); };
  const undo = () => {
    const previous = pastRef.current.pop(); if (!previous) return;
    futureRef.current.push(clone(operation)); setOperation(previous); setSelectedIds([]); setCanUndo(pastRef.current.length > 0); setCanRedo(true);
  };
  const redo = () => {
    const next = futureRef.current.pop(); if (!next) return;
    pastRef.current.push(clone(operation)); setOperation(next); setSelectedIds([]); setCanUndo(true); setCanRedo(futureRef.current.length > 0);
  };
  const updateScene = (sceneId: string, updater: (target: Scene) => void) => commit((draft) => {
    const target = draft.scenes.find((item) => item.id === sceneId); if (target) updater(target); return draft;
  });
  const pointFromClient = (clientX: number, clientY: number): Point => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return { x: .5, y: .5 };
    return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) };
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const rect = mapRef.current?.getBoundingClientRect(); if (!rect) return;
      // 카드·메모는 살짝 누른 클릭이 이동으로 잡히지 않게 문턱을 넘어야 움직인다.
      const dragTo = (drag: { startClient: Point; origin: Point; moved: boolean }, size: { width: number; height: number }) => {
        const moveX = (event.clientX - drag.startClient.x) / rect.width; const moveY = (event.clientY - drag.startClient.y) / rect.height;
        if (!drag.moved && Math.hypot(moveX, moveY) < .004) return null;
        drag.moved = true;
        return { x: fitAxis(drag.origin.x + moveX, size.width), y: fitAxis(drag.origin.y + moveY, size.height) };
      };
      const card = cardDragRef.current;
      if (card) {
        const to = dragTo(card, MISSION_CARD_SIZE); if (!to) return;
        setOperation((current) => ({ ...current, cards: (current.cards ?? []).map((item) => item.playerId === card.playerId ? { ...item, ...to } : item) }));
        return;
      }
      const memo = memoDragRef.current;
      if (memo) {
        const to = dragTo(memo, memo.size); if (!to) return;
        const { x, y } = to;
        setOperation((current) => ({ ...current, scenes: current.scenes.map((item) => item.id !== memo.sceneId ? item : {
          ...item, objects: item.objects.map((object) => object.id !== memo.id ? object : { ...object, x, y, x2: x + memo.size.width, y2: y + memo.size.height }),
        }) }));
        return;
      }
      const active = dragRef.current; if (!active) return;
      const dx = (event.clientX - active.startClient.x) / rect.width; const dy = (event.clientY - active.startClient.y) / rect.height;
      setOperation((current) => ({ ...current, scenes: current.scenes.map((item) => item.id !== active.sceneId ? item : {
        ...item, positions: { ...item.positions, ...Object.fromEntries(Object.entries(active.initial).map(([id, pos]) => [id, { x: clamp(pos.x + dx), y: clamp(pos.y + dy) }])) },
      }) }));
    };
    const up = () => {
      dragRef.current = null;
      cardDragRef.current = null;
      const memo = memoDragRef.current; memoDragRef.current = null;
      if (memo && !memo.moved) setMemoDraft({ id: memo.id, text: memo.text });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  useEffect(() => {
    const node = memoInputRef.current; if (!editingMemoId || !node) return;
    node.focus(); node.setSelectionRange(node.value.length, node.value.length);
  }, [editingMemoId]);

  const handleTokenPointerDown = (event: React.PointerEvent, playerId: number) => {
    event.stopPropagation();
    if (tool === "delete") { updateScene(scene.id, (target) => { delete target.positions[String(playerId)]; }); setSelectedIds((ids) => ids.filter((id) => id !== playerId)); return; }
    if (tool !== "select") return;
    if (event.ctrlKey || event.metaKey) { setSelectedIds((ids) => ids.includes(playerId) ? ids.filter((id) => id !== playerId) : [...ids, playerId]); return; }
    const moving = selectedIds.includes(playerId) ? selectedIds : [playerId];
    setSelectedIds(moving); setEditingId(playerId); checkpoint();
    dragRef.current = { startClient: { x: event.clientX, y: event.clientY }, sceneId: scene.id, initial: Object.fromEntries(moving.filter((id) => scene.positions[String(id)]).map((id) => [String(id), { ...scene.positions[String(id)] }])) };
  };
  const handleRosterDrag = (event: React.DragEvent, playerId: number) => { event.dataTransfer.setData("text/player-id", String(playerId)); event.dataTransfer.effectAllowed = "move"; };
  const handleMapDrop = (event: React.DragEvent) => {
    event.preventDefault(); const playerId = Number(event.dataTransfer.getData("text/player-id")); if (!playerId) return;
    const point = pointFromClient(event.clientX, event.clientY);
    updateScene(scene.id, (target) => { target.positions[String(playerId)] = point; }); setSelectedIds([playerId]); setEditingId(playerId); setTool("select");
  };
  const handleMapPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const origin = event.target as Element;
    if (origin.closest(".player-token,.capture-objective,.map-toolbar")) return;
    if ((tool === "delete" || tool === "select") && origin.closest(".tactical-object")) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (tool === "select") {
      const unplaced = selectedIds.length === 1 && !scene.positions[String(selectedIds[0])];
      if (unplaced) updateScene(scene.id, (target) => { target.positions[String(selectedIds[0])] = point; });
      else setSelectedIds([]);
      return;
    }
    if (["attackArrow", "defense", "memo"].includes(tool)) {
      drawPointsRef.current = [point];
      setDrawPoints([point]);
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events do not own capture. */ }
      return;
    }
    if (tool === "rally") {
      const object: TacticalObject = { id: uid(tool), type: "rally", ...point };
      updateScene(scene.id, (target) => { target.objects.push(object); });
      setTool("select");
    }
  };
  const setMissionSide = (side: MissionSide) => commit((draft) => { draft.side = side; return draft; });
  const openMissionCard = (playerId: number) => commit((draft) => {
    const cards = draft.cards ?? [];
    if (cards.some((card) => card.playerId === playerId)) { draft.cards = cards; return draft; }
    // 새로 여는 카드는 이미 열린 장수만큼 어긋나게 놓아 서로 가리지 않게 한다.
    const step = cards.length % 8;
    draft.cards = [...cards, { playerId, x: fitAxis(.16 + step * .034, MISSION_CARD_SIZE.width), y: fitAxis(.11 + step * .058, MISSION_CARD_SIZE.height) }];
    return draft;
  });
  const closeMissionCard = (playerId: number) => commit((draft) => { draft.cards = (draft.cards ?? []).filter((card) => card.playerId !== playerId); return draft; });
  const closeAllMissionCards = () => commit((draft) => { draft.cards = []; return draft; });
  const deployOne = (playerId: number, side: MissionSide) => commit((draft) => {
    const player = draft.players.find((item) => item.id === playerId);
    const slot = player && playerSlot(player);
    const spot = slot ? slotPoint(slot, side, mapVariant) : null;
    const target = draft.scenes.find((item) => item.id === scene.id);
    if (!spot || !target) return draft;
    draft.side = side;
    target.positions[String(playerId)] = spot;
    return draft;
  });
  const toggleMissionRoute = (playerId: number) => commit((draft) => {
    draft.cards = (draft.cards ?? []).map((card) => card.playerId === playerId ? { ...card, route: !card.route } : card);
    return draft;
  });
  const handleCardPointerDown = (event: React.PointerEvent, card: MissionCard) => {
    if (tool === "delete") { event.stopPropagation(); closeMissionCard(card.playerId); return; }
    if (tool !== "select") return;
    event.stopPropagation();
    checkpoint();
    cardDragRef.current = { playerId: card.playerId, startClient: { x: event.clientX, y: event.clientY }, origin: { x: card.x, y: card.y }, moved: false };
  };
  const patchPlayer = (id: number, patch: Partial<Player>) => commit((draft) => {
    draft.players = draft.players.map((player) => player.id === id ? { ...player, ...patch } : player); return draft;
  });
  const handleMapPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!drawPointsRef.current.length || !["attackArrow", "defense", "memo"].includes(tool)) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (tool === "memo") { drawPointsRef.current = [drawPointsRef.current[0], point]; setDrawPoints(drawPointsRef.current); return; }
    const previous = drawPointsRef.current[drawPointsRef.current.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < .003) return;
    drawPointsRef.current = [...drawPointsRef.current, point];
    setDrawPoints(drawPointsRef.current);
  };
  const handleMapPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!drawPointsRef.current.length || !["attackArrow", "defense", "memo"].includes(tool)) return;
    const end = pointFromClient(event.clientX, event.clientY);
    const points = [...drawPointsRef.current];
    if (tool === "memo") {
      const area = memoRect(points[0], end);
      const note: TacticalObject = { id: uid("memo"), type: "memo", x: area.left, y: area.top, x2: area.left + area.width, y2: area.top + area.height, text: "" };
      updateScene(scene.id, (target) => { target.objects.push(note); });
      setMemoDraft({ id: note.id, text: "" });
      setTool("select");
    } else {
      const previous = points[points.length - 1];
      if (Math.hypot(end.x - previous.x, end.y - previous.y) >= .003) points.push(end);
      const start = points[0];
      const pathLength = points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
      if (points.length > 1 && pathLength > .01) {
        const object: TacticalObject = { id: uid(tool), type: tool as "attackArrow" | "defense", ...start, x2: end.x, y2: end.y, points };
        updateScene(scene.id, (target) => { target.objects.push(object); });
      }
    }
    drawPointsRef.current = [];
    setDrawPoints([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelMapDrawing = () => { drawPointsRef.current = []; setDrawPoints([]); };
  const deleteObject = (objectId: string) => { if (tool !== "delete") return; updateScene(scene.id, (target) => { target.objects = target.objects.filter((object) => object.id !== objectId); }); };
  const finishMemoEdit = (save: boolean) => {
    const draft = memoDraft; if (!draft) return;
    setMemoDraft(null);
    updateScene(scene.id, (target) => {
      const note = target.objects.find((object) => object.id === draft.id); if (!note) return;
      if (save) note.text = draft.text.trim();
      // A note with nothing on it is just clutter, so it never survives the edit.
      if (!note.text?.trim()) target.objects = target.objects.filter((object) => object.id !== draft.id);
    });
  };
  const handleMemoPointerDown = (event: React.PointerEvent, note: TacticalObject) => {
    event.stopPropagation();
    if (tool === "delete") { deleteObject(note.id); return; }
    if (tool !== "select" || memoDraft?.id === note.id) return;
    checkpoint();
    memoDragRef.current = { id: note.id, sceneId: scene.id, text: note.text ?? "", startClient: { x: event.clientX, y: event.clientY }, origin: { x: note.x, y: note.y }, size: memoSpan(note), moved: false };
  };
  const cycleObjective = (objectiveId: string) => updateScene(scene.id, (target) => {
    const current = target.objectiveOwners?.[objectiveId] ?? "neutral";
    const next: ObjectiveOwner = current === "neutral" ? "lucia" : current === "lucia" ? "ian" : "neutral";
    target.objectiveOwners = { ...target.objectiveOwners, [objectiveId]: next };
  });

  const cloneScene = () => commit((draft) => {
    const source = draft.scenes.find((item) => item.id === draft.activeSceneId) ?? draft.scenes[0];
    const id = uid("scene"); const index = draft.scenes.length; const time = SCENE_TIMES[index] ?? `T+${String(index).padStart(2, "0")}`;
    const next: Scene = { ...clone(source), id, name: index < SCENE_TIMES.length ? ["START", "루브라이트", "포탈", "페어리 드래곤", "생명석"][index] : `SCENE ${String(index + 1).padStart(2, "0")}`, time, events: { ...clone(source.events), fairyDragonPosition: source.events.fairyDragonPosition === "northwest" ? "southeast" : "northwest" } };
    draft.scenes.push(next); draft.activeSceneId = id; return draft;
  });
  const switchScene = (sceneId: string) => { setOperation((current) => ({ ...current, activeSceneId: sceneId })); setSelectedIds([]); setMemoDraft(null); };
  const removeScene = (sceneId: string) => {
    if (operation.scenes.length === 1 || !window.confirm("이 장면을 타임라인에서 삭제할까요?")) return;
    commit((draft) => {
      const index = draft.scenes.findIndex((item) => item.id === sceneId);
      if (index < 0) return draft;
      draft.scenes.splice(index, 1);
      if (draft.activeSceneId === sceneId) draft.activeSceneId = draft.scenes[Math.max(0, index - 1)].id;
      return draft;
    });
    if (sceneDraft?.id === sceneId) setSceneDraft(null);
    setSelectedIds([]);
  };
  const openSceneEditor = (target: Scene) => {
    switchScene(target.id);
    setSceneDraft({ id: target.id, name: target.name, time: target.time, fairyDragon: target.events.fairyDragon, lifeStone: target.events.lifeStone, fairyDragonPosition: target.events.fairyDragonPosition });
  };
  const saveSceneEditor = () => {
    if (!sceneDraft) return;
    updateScene(sceneDraft.id, (target) => {
      target.time = sceneDraft.time.trim() || "00:00";
      target.name = sceneDraft.name.trim() || "SCENE";
      target.events = { fairyDragon: sceneDraft.fairyDragon.trim(), lifeStone: sceneDraft.lifeStone.trim(), fairyDragonPosition: sceneDraft.fairyDragonPosition };
    });
    setSceneDraft(null);
  };
  const patchSceneDraft = (patch: Partial<SceneDraft>) => setSceneDraft((current) => current ? { ...current, ...patch } : current);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(operation, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "heinapel-operation.json"; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const importJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const parsed = readOperation(JSON.parse(await file.text())); checkpoint(); setStorageError(""); setOperation(parsed); setSelectedIds([]); setMemoDraft(null); }
    catch { window.alert("Heinapel War Table v0.1 JSON 파일이 아닙니다."); }
    event.target.value = "";
  };
  const resetOperation = () => { if (!window.confirm("현재 작전 데이터를 초기화할까요?")) return; checkpoint(); setStorageError(""); setOperation(freshOperation()); setSelectedIds([]); setSceneDraft(null); setMemoDraft(null); };
  const toggleCommandRole = (role: "rally" | "garrison") => {
    if (!editing) return;
    const secondaryRoles = editing.secondaryRoles.includes(role)
      ? editing.secondaryRoles.filter((item) => item !== role)
      : [...editing.secondaryRoles.filter((item) => item !== "rally" && item !== "garrison"), role];
    patchPlayer(editing.id, { secondaryRoles });
  };
  const deployStarters = (side: MissionSide) => {
    const starters = operation.players.filter((player) => player.lineup === "starter");
    const center = STARTING_POINT_CENTER[mapVariant][side];
    // 번호가 없는 사람은 진형 아래에 한 줄로 세워 배치에서 빠지지 않게 한다.
    const unnumbered = starters.filter((player) => !playerSlot(player));
    commit((draft) => {
      const target = draft.scenes.find((item) => item.id === scene.id);
      if (!target) return draft;
      draft.side = side;
      starters.forEach((player) => {
        const slot = playerSlot(player);
        const spot = slot ? slotPoint(slot, side, mapVariant) : null;
        if (spot) { target.positions[String(player.id)] = spot; return; }
        const index = unnumbered.indexOf(player);
        const turn = side === "ian" ? 1 : -1;
        target.positions[String(player.id)] = {
          x: clamp(center.x + (index - (unnumbered.length - 1) / 2) * .026 * turn),
          y: clamp(center.y + .135 * turn),
        };
      });
      return draft;
    });
    setSelectedIds([]);
    setRoleFilter("all");
    setTool("select");
  };

  // 명단은 전투 위치 번호순, 번호 없는 선수는 뒤에 둔다.
  const visiblePlayers = operation.players.filter((player) => roleFilter === "all" || player.primaryRole === roleFilter)
    .sort((a, b) => (playerSlot(a) ?? 99) - (playerSlot(b) ?? 99));
  const placedCount = Object.keys(scene.positions).length;
  const objects = scene.objects;
  const stepObjects = objects.filter((object) => object.type === "step");
  const objectiveCounts = OBJECTIVE_META.reduce((counts, objective) => {
    counts[scene.objectiveOwners?.[objective.id] ?? "neutral"] += 1;
    return counts;
  }, { neutral: 0, lucia: 0, ian: 0 } as Record<ObjectiveOwner, number>);

  return (
    <>
    <main className={`war-shell${mapFocus ? " map-focus" : ""}`}>
      <header className="topbar">
        <div className="brand-block"><span className="brand-mark">H</span><div><h1>HEINAPEL <span>WAR TABLE</span></h1><input aria-label="작전명" value={operation.name} onChange={(event) => commit((draft) => { draft.name = event.target.value; return draft; })} /></div></div>
        <div className="battle-clock"><span>{scene.name}</span><strong>{scene.time} · {placedCount}/{operation.players.length} DEPLOYED</strong></div>
        <div className="header-actions">
          <button type="button" onClick={undo} disabled={!canUndo} title="실행 취소">↶</button><button type="button" onClick={redo} disabled={!canRedo} title="다시 실행">↷</button>
          <button type="button" onClick={exportJson}>JSON ↓</button><button type="button" onClick={() => importRef.current?.click()}>JSON ↑</button><input ref={importRef} className="visually-hidden" type="file" accept="application/json" onChange={importJson} />
          <span className="status-chip"><i /> {storageError ? "저장 실패" : "SAVED"} {ready ? new Date(operation.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
        </div>
      </header>

      {storageError && <p role="alert">{storageError}</p>}
      <section className="workspace-grid">
        <aside className="roster-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">BLUE FORCE</span><h2>PLAYER ROSTER</h2></div><span className="count-badge">{visiblePlayers.length} / {operation.players.length}</span></div>
          <div className="roster-controls">
            <button type="button" disabled={operation.players.length >= 30} onClick={() => setPlayerDraft(newPlayer(operation.players))}>선수 추가</button>
            <button type="button" disabled={!editing} onClick={() => editing && setPlayerDraft(editablePlayer(editing))}>명단·임무 편집</button>
            <select aria-label="역할 필터" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | PrimaryRole)}><option value="all">전체 역할</option>{Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <div className="roster-list" aria-label={`플레이어 명단 ${visiblePlayers.length}명 표시 · 총 ${operation.players.length}명`}>
            {visiblePlayers.map((player) => (
              <button draggable type="button" key={player.id} className={`player-row ${editingId === player.id ? "is-active" : ""} ${scene.positions[String(player.id)] ? "is-placed" : ""}`} onDragStart={(event) => handleRosterDrag(event, player.id)} onClick={() => { setEditingId(player.id); openMissionCard(player.id); if (!scene.positions[String(player.id)]) setSelectedIds([player.id]); }}>
                <span className="player-num">{playerSlot(player) ?? "—"}</span><span className="player-copy"><strong className={playerNameClass(player)}>{player.nickname}</strong><span className={`lineup-badge ${player.lineup}`}>주전</span></span><span className="edit-glyph">{scene.positions[String(player.id)] ? "●" : "⋮⋮"}</span>
              </button>
            ))}
          </div>
        </aside>

        <section ref={mapRef} className={`map-panel map-${mapVariant} tool-${tool}`} aria-label="헤이나펄 전장 작전판" onDragOver={(event) => event.preventDefault()} onDrop={handleMapDrop} onPointerDown={handleMapPointerDown} onPointerMove={handleMapPointerMove} onPointerUp={handleMapPointerUp} onPointerCancel={cancelMapDrawing}>
          <div className="map-image-layer" /><div className="map-grid-lines" />
          <div className="map-toolbar" onPointerDown={(event) => event.stopPropagation()}>
            <div className="map-toolbar-left">
              <div className="map-switcher" aria-label="지도 선택"><button type="button" className={mapVariant === "tactical" ? "active" : ""} onClick={() => setMapVariant("tactical")}>전술 맵</button><button type="button" className={mapVariant === "field" ? "active" : ""} onClick={() => setMapVariant("field")}>실전 맵</button></div>
              <div className={`mission-side-switch side-${missionSide}`} role="group" aria-label="임무 기준 진영">{MISSION_SIDES.map((side) => <button type="button" key={side} className={missionSide === side ? "active" : ""} aria-pressed={missionSide === side} onClick={() => setMissionSide(side)}>{MISSION_SIDE_LABEL[side]}</button>)}</div>
              <button type="button" className="staff-open" onClick={() => setStaffOpen(true)}>스테프 카드</button>
              {missionCards.length > 0 && <button type="button" className="mission-clear" onClick={closeAllMissionCards}>카드 {missionCards.length}장 닫기</button>}
            </div>
            <div className="map-toolbar-stats"><span>배치 <b>{placedCount}/{operation.players.length}</b></span><span>중립 <b>{objectiveCounts.neutral}</b></span><span className="stat-lucia">루시아 <b>{objectiveCounts.lucia}</b></span><span className="stat-ian">이안 <b>{objectiveCounts.ian}</b></span></div>
            <button type="button" className="panel-toggle" onClick={() => setMapFocus((current) => !current)}>{mapFocus ? "편집 패널 열기" : "지도 크게 보기"}</button>
          </div>
          <div className="map-time-chip" aria-label={`현재 장면 시간 ${scene.time}`}><span>CURRENT TIME</span><strong>{scene.time}</strong><small>{scene.name}</small></div>
          <div className="home-zone home-lucia" role="img" aria-label="루시아팀 스타팅 포인트" /><div className="home-zone home-ian" role="img" aria-label="이안팀 스타팅 포인트" />
          {scene.events.fairyDragon && <div className={`fairy-dragon-anchor event-anchor position-${scene.events.fairyDragonPosition}`} aria-label={`페어리 드래곤 젠 위치: ${scene.events.fairyDragon}`}><span>✦</span><strong>{scene.events.fairyDragon}</strong><small>{scene.events.fairyDragonPosition === "northwest" ? "11시 전망대 사이" : "5시 전망대 사이"}</small></div>}
          {scene.events.lifeStone && <div className="lifestone-anchor" aria-label={`생명의 반석, ${scene.events.lifeStone}`}><span>◆</span><strong>생명의 반석</strong><small>{scene.events.lifeStone}</small></div>}
          {OBJECTIVE_META.map((objective) => { const owner = scene.objectiveOwners?.[objective.id] ?? "neutral"; const point = objective[mapVariant]; return <button type="button" key={objective.id} className={`capture-objective owner-${owner}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => cycleObjective(objective.id)} aria-label={`${objective.location} ${objective.label}: ${owner === "neutral" ? "중립" : owner === "lucia" ? "루시아팀" : "이안팀"}`} title={`${objective.location} ${objective.label} · 클릭하여 점령 상태 변경`}><span>{objective.label}</span></button>; })}
          <svg className="tactical-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="전술 오브젝트 레이어">
            <defs><marker id="move-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#55cfff" /></marker><marker id="attack-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#ff5353" /></marker><marker id="route-head-ian" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#f0c463" /></marker><marker id="route-head-lucia" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#5cb8ff" /></marker></defs>
            {missionRoutes.map((route) => <line key={route.key} className={`mission-route side-${missionSide}${route.roaming ? " is-roaming" : ""}`} x1={route.from.x * 1000} y1={route.from.y * 1000} x2={route.to.x * 1000} y2={route.to.y * 1000} markerEnd={`url(#route-head-${missionSide})`} />)}
            {objects.filter((object) => ["moveArrow", "attackArrow", "defense"].includes(object.type)).map((object) => object.points?.length ? <path key={object.id} className={`tactical-object freehand-path ${object.type === "defense" ? "defense-line" : `arrow-${object.type}`}`} onClick={() => deleteObject(object.id)} d={smoothPath(object.points)} markerEnd={object.type === "defense" ? undefined : `url(#${object.type === "moveArrow" ? "move-head" : "attack-head"})`} /> : <line key={object.id} className={`tactical-object ${object.type === "defense" ? "defense-line" : `arrow-${object.type}`}`} onClick={() => deleteObject(object.id)} x1={object.x * 1000} y1={object.y * 1000} x2={(object.x2 ?? object.x) * 1000} y2={(object.y2 ?? object.y) * 1000} markerEnd={object.type === "defense" ? undefined : `url(#${object.type === "moveArrow" ? "move-head" : "attack-head"})`} />)}
            {drawPoints.length > 1 && <path className={`draw-preview freehand-path ${tool === "defense" ? "defense-line" : "arrow-attackArrow"}`} d={smoothPath(drawPoints)} markerEnd={tool === "attackArrow" ? "url(#attack-head)" : undefined} />}
          </svg>
          {missionRoutes.map((route) => { const at = .82; const x = route.from.x + (route.to.x - route.from.x) * at; const y = route.from.y + (route.to.y - route.from.y) * at; return <span key={`${route.key}-tag`} className={`mission-route-tag side-${missionSide}${route.roaming ? " is-roaming" : ""}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} title={`${route.nickname} · ${route.units.join(", ")}부대${route.roaming ? " · 아군 목적지 주변 유동" : ""}`}>{route.units.join("·")}</span>; })}
          {tool === "memo" && drawPoints.length > 1 && (() => { const area = memoRect(drawPoints[0], drawPoints[1]); return <div className="memo-preview" style={{ left: `${area.left * 100}%`, top: `${area.top * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%` }} />; })()}
          {openMissionBriefs.map(({ card, player, orders, roles, gaps, brief }) => <div key={card.playerId} className={`tactical-object mission-card side-${missionSide} role-${player.primaryRole}`} style={{ left: `${card.x * 100}%`, top: `${card.y * 100}%` }} onPointerDown={(event) => { if (tool === "delete") { event.stopPropagation(); closeMissionCard(card.playerId); } }}>
            <div className="mission-card-head" onPointerDown={(event) => handleCardPointerDown(event, card)}>
              <UnitRoleIcon unitRole={player.primaryRole} isRally={player.secondaryRoles.includes("rally")} />
              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setPlayerDraft(editablePlayer(player))}>편집</button><strong className="mission-card-name">{!!playerSlot(player) && <b className="mission-card-slot">{playerSlot(player)}</b>}{player.nickname}</strong>
              <div className="mission-card-actions">
                {orders && <button type="button" className={`mission-card-route ${card.route ? "active" : ""}`} aria-pressed={!!card.route} onClick={() => toggleMissionRoute(card.playerId)} title={`${player.nickname} 부대 목적지를 지도에 표시`}>경로</button>}
                <button type="button" className="mission-card-close" onClick={() => closeMissionCard(card.playerId)} aria-label={`${player.nickname} 임무 카드 닫기`}>×</button>
              </div>
            </div>
            {orders ? <div className="mission-card-body" onClick={() => { if (tool === "select") toggleMissionRoute(card.playerId); }} role="presentation">
              {roles.length > 0 && <div className="mission-roles">{roles.map((role) => <span key={role.key} className="mission-role"><b>{role.label}</b>{role.place}</span>)}</div>}
              {brief?.team && <p>{brief.team}</p>}{brief?.badge && <p>{brief.badge}</p>}
              {brief?.common?.map(([head, body], index) => <p key={index}><b>{head}</b> {body}</p>)}
              {brief && brief.steps.length > 0 && <ol className="mission-steps">{brief.steps.map(([when, what]) => <li key={when + what}><i>{when}</i><span>{what}</span></li>)}</ol>}
              {/* eslint-disable-next-line @next/next/no-img-element -- 정적 PNG 한 장, 최적화 불필요 */}
              {brief?.image && <figure className="mission-figure"><img src={brief.image.src} alt={brief.image.caption} /><figcaption>{brief.image.caption}</figcaption></figure>}
              <ol className="mission-units">{orders.map((text, index) => <li key={index} className={`mission-unit ${missionEmphasis(text)}`}><i>{index + 1}</i><span>{text}</span></li>)}</ol>
              {card.route && gaps.length > 0 && <p className="mission-route-gap">{gaps.join("·")}부대는 임무표에 목적지가 없어 지도에 표시할 수 없습니다</p>}
              {brief?.foot && <p>{brief.foot}</p>}
              {!!playerSlot(player) && <div className="mission-deploy"><span>{playerSlot(player)}번 자리로</span>{MISSION_SIDES.map((side) => <button type="button" key={side} className={`deploy-${side}`} onClick={() => deployOne(card.playerId, side)}>{MISSION_SIDE_LABEL[side]} 배치</button>)}</div>}
            </div> : <p className="mission-empty">임무표에 배정된 부대가 없습니다<small>임무 미배정</small></p>}
          </div>)}
          {objects.filter((object) => object.type === "memo").map((note) => { const span = memoSpan(note); const isEditing = memoDraft?.id === note.id; return <div key={note.id} className={`tactical-object map-memo${isEditing ? " is-editing" : ""}`} style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%`, width: `${span.width * 100}%`, height: `${span.height * 100}%` }}>{isEditing ? <textarea ref={memoInputRef} aria-label="메모 내용" placeholder="메모를 입력하세요" value={memoDraft.text} onChange={(event) => setMemoDraft({ id: note.id, text: event.target.value })} onBlur={() => finishMemoEdit(true)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); finishMemoEdit(false); } }} /> : <button type="button" className="memo-face" onPointerDown={(event) => handleMemoPointerDown(event, note)} onClick={(event) => { if (event.detail !== 0) return; if (tool === "delete") deleteObject(note.id); else if (tool === "select") setMemoDraft({ id: note.id, text: note.text ?? "" }); }} title={tool === "delete" ? "클릭해 메모 삭제" : "클릭해 메모 수정 · 드래그로 이동"}><span className={note.text ? "" : "is-placeholder"}>{note.text || "메모 입력"}</span></button>}</div>; })}
          {objects.filter((object) => object.type === "attackArrow").map((object, index) => { const origin = object.points?.[0] ?? { x: object.x, y: object.y }; return <span key={`${object.id}-order`} className="attack-line-order" style={{ left: `${origin.x * 100}%`, top: `${origin.y * 100}%` }} aria-hidden="true">{index + 1}</span>; })}
          {objects.filter((object) => ["rally", "step", "text"].includes(object.type)).map((object) => <button type="button" key={object.id} className={`tactical-object map-marker marker-${object.type}`} style={{ left: `${object.x * 100}%`, top: `${object.y * 100}%` }} onClick={() => deleteObject(object.id)}><span>{object.type === "rally" ? "⚔" : object.type === "step" ? `S${stepObjects.findIndex((item) => item.id === object.id) + 1}` : object.text}</span></button>)}
          {operation.players.filter((player) => scene.positions[String(player.id)] && (roleFilter === "all" || player.primaryRole === roleFilter)).map((player) => { const pos = scene.positions[String(player.id)]; const isRally = player.secondaryRoles.includes("rally"); const tooltip = `${player.nickname} · ${ROLE_LABEL[player.primaryRole]}${player.secondaryRoles.length ? ` · ${player.secondaryRoles.map((role) => SECONDARY_LABEL[role]).join("/")}` : ""}`; return <button type="button" key={player.id} className={`player-token role-${player.primaryRole} ${isRally ? "is-rally" : ""} ${selectedIds.includes(player.id) ? "selected" : ""}`} style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }} onPointerDown={(event) => handleTokenPointerDown(event, player.id)} aria-label={tooltip} data-tooltip={tooltip}><UnitRoleIcon unitRole={player.primaryRole} isRally={isRally} /><span className="token-num">{playerSlot(player) ?? "·"}</span></button>; })}
          <div className="map-note"><span>{mapVariant === "tactical" ? "TACTICAL OVERVIEW" : "FIELD REFERENCE"}</span><strong>{mapVariant === "tactical" ? "헤이나펄 전술 맵" : "헤이나펄 실전 지형"}</strong><small>{TOOL_META.find((item) => item.id === tool)?.hint}</small></div><div className="map-coordinates"><span>GRID A-01</span><span>생명의 반석 기준 작전도</span><span>GRID H-09</span></div>
        </section>

        <aside className="inspector-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">TACTICAL CONTROL</span><h2>핵심 작전 도구</h2></div></div>
          <div className="tool-grid">{TOOL_META.map((item) => <button type="button" key={item.id} className={`${tool === item.id ? "active" : ""} tool-${item.id}`} onClick={() => setTool((current) => current === item.id ? "select" : item.id)} title={item.hint}>{item.id === "delete" ? <EraserIcon /> : <span>{item.glyph}</span>}{item.label}</button>)}</div>
          <div className="assignment-panel">
            {editing && <><div className="assignment-player"><span>SELECTED PLAYER</span><strong className={playerNameClass(editing)}>{editing.nickname}</strong><small>명단에서 아이디를 선택한 뒤 역할을 지정하세요.</small></div>
            <div className="assignment-heading">병종</div>
            <div className="assignment-grid three-column">
              {(Object.keys(ROLE_LABEL) as PrimaryRole[]).map((role) => <button type="button" key={role} className={`assignment-button role-${role} ${editing.primaryRole === role ? "active" : ""}`} onClick={() => patchPlayer(editing.id, { primaryRole: role })}><UnitRoleIcon unitRole={role} />{ROLE_LABEL[role]}</button>)}
            </div>
            <div className="assignment-heading">지휘 역할</div>
            <div className="assignment-grid two-column">
              <button type="button" className={`assignment-button command-rally ${editing.secondaryRoles.includes("rally") ? "active" : ""}`} onClick={() => toggleCommandRole("rally")}><UnitRoleIcon unitRole="infantry" isRally />집결장</button>
              <button type="button" className={`assignment-button command-garrison ${editing.secondaryRoles.includes("garrison") ? "active" : ""}`} onClick={() => toggleCommandRole("garrison")}><UnitRoleIcon unitRole="infantry" />주둔장</button>
            </div>
            </>}
            <div className="role-count-board">
              <div className="assignment-heading">병종 현황 · 주전 기준</div>
              <div className="role-count-grid">
                {(Object.keys(ROLE_LABEL) as PrimaryRole[]).map((role) => <div key={role} className={`role-count-tile role-${role}`}><UnitRoleIcon unitRole={role} /><strong>{counts[role]}</strong><small>{ROLE_LABEL[role]}</small></div>)}
                <div className="role-count-tile role-count-total"><span className="total-glyph">Σ</span><strong>{counts.starters}</strong><small>주전 합계 · 총 {operation.players.length}명</small></div>
              </div>
              <p className="role-count-note"><UnitRoleIcon unitRole="infantry" isRally />집결장 <b>{counts.rally}</b>명 · 겸직이라 위 병종 수에 이미 포함됩니다</p>
            </div>
            <div className="deployment-board">
              <div className="assignment-heading">주전 일괄 배치</div>
              <div className="deployment-grid">
                <button type="button" className="deployment-button deployment-lucia" onClick={() => deployStarters("lucia")}><span>●</span><strong>루시아 배치</strong></button>
                <button type="button" className="deployment-button deployment-ian" onClick={() => deployStarters("ian")}><span>●</span><strong>이안 배치</strong></button>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <footer className="timeline-shell">
        <div className="timeline-title"><span>OPERATION TIMELINE</span><strong>{operation.scenes.length} SCENES · AUTO SAVE</strong></div>
        <div className="scene-strip">
          {operation.scenes.map((item, index) => <div key={item.id} className={`scene-card ${item.id === scene.id ? "active" : ""}`}><button type="button" className="scene-select" onClick={() => switchScene(item.id)}><i>{String(index + 1).padStart(2, "0")}</i><span><b>{item.time}</b><small>{item.name}</small></span></button><button type="button" className="scene-remove-button" onClick={() => removeScene(item.id)} disabled={operation.scenes.length === 1} aria-label={`${String(index + 1).padStart(2, "0")} 장면 삭제`} title={operation.scenes.length === 1 ? "마지막 장면은 삭제할 수 없습니다" : "장면 삭제"}>×</button><button type="button" className="scene-edit-button" onClick={() => openSceneEditor(item)} aria-label={`${String(index + 1).padStart(2, "0")} 장면 시간 및 이벤트 편집`} title="시간·이벤트 편집">◷</button></div>)}
          <button type="button" className="clone-scene" onClick={cloneScene}><i>＋</i><span><b>SCENE 복제</b><small>현재 배치에서 생성</small></span></button>
        </div>
        <div className="footer-actions"><button type="button" onClick={resetOperation}>초기화</button><span>PHASE 6 · READY</span></div>
        {sceneDraft && <form className="scene-event-editor" onSubmit={(event) => { event.preventDefault(); saveSceneEditor(); }}>
          <div className="scene-editor-heading"><div><span>SCENE SETTINGS</span><strong>시간 · 젠 이벤트 편집</strong></div><button type="button" onClick={() => setSceneDraft(null)} aria-label="장면 편집 닫기">×</button></div>
          <div className="scene-editor-grid">
            <label><span>장면 시간</span><input aria-label="장면 시간" value={sceneDraft.time} onChange={(event) => patchSceneDraft({ time: event.target.value })} maxLength={12} placeholder="예: 55:00" /></label>
            <label><span>장면 이름</span><input aria-label="장면 이름" value={sceneDraft.name} onChange={(event) => patchSceneDraft({ name: event.target.value })} maxLength={24} placeholder="예: 루브라이트" /></label>
            <label className="event-field event-copy-field"><span>페어리 드래곤 이벤트</span><input aria-label="페어리 드래곤 이벤트" value={sceneDraft.fairyDragon} onChange={(event) => patchSceneDraft({ fairyDragon: event.target.value })} maxLength={40} placeholder="예: 페어리 드래곤 젠" /></label>
            <label className="fairy-position-field"><span>페어리 드래곤 젠 위치</span><select aria-label="페어리 드래곤 젠 위치" value={sceneDraft.fairyDragonPosition} onChange={(event) => patchSceneDraft({ fairyDragonPosition: event.target.value as FairyDragonPosition })}><option value="northwest">11시 전망대 사이</option><option value="southeast">5시 전망대 사이</option></select></label>
            <label className="event-field"><span>생명석 이벤트</span><input aria-label="생명석 이벤트" value={sceneDraft.lifeStone} onChange={(event) => patchSceneDraft({ lifeStone: event.target.value })} maxLength={40} placeholder="예: 생명석 젠" /></label>
          </div>
          <div className="scene-editor-actions"><button type="button" onClick={() => setSceneDraft(null)}>취소</button><button type="submit">장면 저장</button></div>
        </form>}
      </footer>
    </main>
    <MobileBriefing players={operation.players} sheet={sheet} staff={staff} />
    {staffOpen && <StaffDialog staff={staff} side={missionSide} nameOf={(slot) => slotName(sheet.data?.missions, operation.players, slot)} onClose={() => setStaffOpen(false)} />}
    {playerDraft && <PlayerEditor initial={playerDraft} players={operation.players} onClose={() => setPlayerDraft(null)} onSave={(player) => {
      commit((draft) => { const index = draft.players.findIndex((item) => item.id === player.id); if (index < 0) draft.players.push(player); else draft.players[index] = player; return draft; });
      setEditingId(player.id); setRoleFilter("all"); setPlayerDraft(null);
    }} onDelete={() => {
      commit((draft) => { draft.players = draft.players.filter((player) => player.id !== playerDraft.id); draft.cards = draft.cards?.filter((card) => card.playerId !== playerDraft.id); draft.scenes.forEach((item) => { delete item.positions[String(playerDraft.id)]; }); return draft; });
      setSelectedIds((ids) => ids.filter((id) => id !== playerDraft.id)); setPlayerDraft(null);
    }} /> }
    </>
  );
}
