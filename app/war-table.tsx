"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PrimaryRole = "infantry" | "cavalry" | "ranged";
type SecondaryRole = "garrison" | "rally" | "blocker";
type LineupStatus = "starter" | "reserve";
type Tool = "select" | "moveArrow" | "attackArrow" | "defense" | "rally" | "step" | "text" | "memo" | "delete";
type ObjectiveOwner = "neutral" | "lucia" | "ian";
type MapVariant = "tactical" | "field";
type MissionSide = "ian" | "lucia";
type MissionOrders = [string, string, string, string, string];
type MissionCard = { playerId: number; x: number; y: number; route?: boolean };
type MissionTone = "rally" | "garrison" | "roam" | "join" | "block" | "field" | "hold";
type FairyDragonPosition = "northwest" | "southeast";
type Point = { x: number; y: number };
type Player = { id: number; nickname: string; primaryRole: PrimaryRole; secondaryRoles: SecondaryRole[]; lineup: LineupStatus };
type TacticalObject = { id: string; type: Exclude<Tool, "select" | "delete">; x: number; y: number; x2?: number; y2?: number; points?: Point[]; text?: string };
type SceneEvents = { fairyDragon: string; lifeStone: string; fairyDragonPosition: FairyDragonPosition };
type Scene = { id: string; name: string; time: string; positions: Record<string, Point>; objects: TacticalObject[]; events: SceneEvents; objectiveOwners?: Record<string, ObjectiveOwner> };
type SceneDraft = { id: string; name: string; time: string; fairyDragon: string; lifeStone: string; fairyDragonPosition: FairyDragonPosition };
type Operation = { version: 1; name: string; players: Player[]; scenes: Scene[]; activeSceneId: string; updatedAt: string; side?: MissionSide; cards?: MissionCard[] };

const STORAGE_KEY = "heinapel-war-table-v0.3";
const ROLE_LABEL: Record<PrimaryRole, string> = { infantry: "보병", cavalry: "기병", ranged: "원거리" };
const SECONDARY_LABEL: Record<SecondaryRole, string> = { garrison: "주둔장", rally: "집결장", blocker: "블로커" };
const TOOL_META: Array<{ id: Tool; label: string; glyph: string; hint: string }> = [
  { id: "attackArrow", label: "공격 라인", glyph: "➤", hint: "드래그로 공격 라인 표시" },
  { id: "defense", label: "방어 라인", glyph: "╱", hint: "드래그로 방어 라인 표시" },
  { id: "rally", label: "집결", glyph: "⚔", hint: "클릭해 집결 지점 표시" },
  { id: "memo", label: "메모", glyph: "▤", hint: "드래그로 영역을 잡고 메모를 입력" },
  { id: "delete", label: "지우개", glyph: "", hint: "지울 오브젝트를 클릭" },
];
const RALLY_PLAYERS = new Set(["[WB] 진 수", "벌꿀오소리"]);
const GARRISON_PLAYERS = new Set(["glen fiddich", "욘 두 Yondu", "[WB] ᴵᴿᴼᴺ TESLA", "예리", "핫떠그", "Junkhun", "압 수"]);
const RESERVE_PLAYERS = new Set(["코다마", "[WB] 스누피Tank", "[WB] 이천상", "몽클", "산삼맨", "ᴵᴿᴼᴺ 핫 짱 구", "THOR", "알나인티"]);
const PLAYER_SOURCE: Array<[string, PrimaryRole]> = [
  ["[WB] ᵂᴮ Elega", "infantry"], ["5000", "ranged"], ["glen fiddich", "infantry"], ["압 수", "infantry"],
  ["Junkhun", "infantry"], ["욘 두 Yondu", "infantry"], ["[WB] 구너(마구니)", "ranged"], ["최산수", "ranged"],
  ["마 젤 란(달의금)", "infantry"], ["바르니", "ranged"], ["무 잔 Muzan", "cavalry"], ["파리스", "infantry"],
  ["벙커", "ranged"], ["산삼맨", "infantry"], ["불개", "ranged"], ["[WB] ᴵᴿᴼᴺ 곡곡이", "ranged"],
  ["냥 신 (마스터)", "cavalry"], ["[WB] ᴵᴿᴼᴺ Maha", "cavalry"], ["[WB] 진 수", "infantry"], ["[WB] ᴵᴿᴼᴺ 조롱말 (HALO)", "cavalry"],
  ["늑대장군", "infantry"], ["핫떠그", "infantry"], ["[WB] ᴵᴿᴼᴺ TESLA", "ranged"], ["오늘은일찍자야지", "cavalry"],
  ["대장군 뽀로링", "infantry"], ["서틸로", "infantry"], ["예리", "infantry"], ["Kingsway", "ranged"],
  ["햄찌", "ranged"], ["몽클", "infantry"], ["SIGH", "ranged"], ["[WB] 스누피Tank", "infantry"],
  ["[WB] 이천상", "ranged"], ["코다마", "infantry"], ["벌꿀오소리", "infantry"],
  ["ᴵᴿᴼᴺ 핫 짱 구", "infantry"], ["THOR", "infantry"], ["알나인티", "infantry"],
];
function defaultCommandRoles(nickname: string): SecondaryRole[] {
  if (RALLY_PLAYERS.has(nickname)) return ["rally"];
  if (GARRISON_PLAYERS.has(nickname)) return ["garrison"];
  return [];
}
const INITIAL_PLAYERS: Player[] = PLAYER_SOURCE.map(([nickname, primaryRole], index) => ({
  id: index + 1,
  nickname,
  primaryRole,
  secondaryRoles: defaultCommandRoles(nickname),
  lineup: RESERVE_PLAYERS.has(nickname) ? "reserve" : "starter",
}));
const MEMO_MIN_SIZE = { width: .11, height: .075 };
// 임무표 출처: 각 유저별 임무표 구글 시트 (2026-08-31 스냅샷).
// 시트는 이안 진영(우하단) 기준이며, 루시아 진영은 MISSION_MIRROR_PAIRS로 환산한다.
const MISSION_SOURCE: Array<[string, MissionOrders]> = [
  ["[WB] ᵂᴮ Elega", ["전망대", "전망대", "전망대", "전망대", "필드전투보병 or 긴급 주유"]],
  ["대장군 뽀로링", ["전망대", "전망대", "전망대", "전망대", "필드전투보병 or 긴급 주유"]],
  ["냥 신 (마스터)", ["기병대", "기병대", "기병대", "기병대", "기병대"]],
  ["[WB] ᴵᴿᴼᴺ Maha", ["기병대", "기병대", "기병대", "기병대", "기병대"]],
  ["무 잔 Muzan", ["기병대", "기병대", "기병대", "기병대", "기병대"]],
  ["오늘은일찍자야지", ["기병대", "기병대", "기병대", "기병대", "기병대"]],
  ["[WB] ᴵᴿᴼᴺ 조롱말 (HALO)", ["기병대", "기병대", "기병대", "기병대", "기병대"]],
  ["[WB] 진 수", ["9시 치료 영목 집결", "7시 축복의전당 주둔장", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["욘 두 Yondu", ["7시 축복의전당 서브 주둔장", "7시 축복의전당 서브 주둔장", "6시 용기 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["glen fiddich", ["6시용기영목주둔장", "6시용기영목주둔장", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["Junkhun", ["6시용기영목 서브주둔장", "7시 축복의전당 서브주둔장", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["예리", ["6시 군왕주둔장", "6시 군왕주둔장", "6시 용기 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["늑대장군", ["6시 군왕 주유", "7시 축복 주유", "진수님 집결 탑승", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["바르니", ["6시 군왕 주유", "6시 용기 주유", "7시 축복 주유", "진수님 집결 탑승", "필드전투보병 or 긴급 주유"]],
  ["벙커", ["6시 군왕 주유", "6시 용기 주유", "7시 축복 주유", "진수님 집결 탑승", "필드전투보병 or 긴급 주유"]],
  ["햄찌", ["6시 군왕 주유", "6시 용기 주유", "7시 축복 주유", "진수님 집결 탑승", "필드전투보병 or 긴급 주유"]],
  ["서틸로", ["6시 군왕 주유", "7시 축복 주유", "적 6시 입구 막기", "적 6시 입구 막기", "적 6시 입구 막기"]],
  ["Kingsway", ["6시 군왕 주유", "7시 축복 주유", "적 6시 입구 막기", "적 6시 입구 막기", "적 6시 입구 막기"]],
  ["불개", ["6시 군왕 주유", "6시 용기 주유", "7시 축복 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["압 수", ["6시 군왕 서브 주둔장", "7시 축복의전당 서브주둔장", "6시 군왕 주유", "6시 용기 주유", "7시 축복 주유"]],
  ["[WB] ᴵᴿᴼᴺ TESLA", ["3시 치료의 영목 주둔장", "3시 치료의 영목 주둔장", "1시 천무 획득시 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["핫떠그", ["3시 치료의 영목 서브주둔장", "3시 치료의 영목 서브주둔장", "1시 천무 획득시 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["[WB] ᴵᴿᴼᴺ 곡곡이", ["3시 치료 주유", "1시 천무 획득시 주유", "오소리님 집결 탑승", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["[WB] 구너(마구니)", ["3시 치료 주유", "1시 천무 획득시 주유", "오소리님 집결 탑승", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["최산수", ["3시 치료 주유", "1시 천무 획득시 주유", "오소리님 집결 탑승", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["SIGH", ["3시 치료 주유", "1시 천무 획득시 주유", "오소리님 집결 탑승", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["5000", ["3시 치료 주유", "1시 천무 획득시 주유", "오소리님 집결 탑승", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["파리스", ["3시 치료 주유", "1시 천무 획득시 주유", "오소리님 집결 탑승", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["마 젤 란(달의금)", ["3시 치료 주유", "1시 천무 획득시 주유", "오소리님 집결 탑승", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
  ["벌꿀오소리", ["1시 천무 전당 집결장", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유", "필드전투보병 or 긴급 주유"]],
];
const MISSION_BY_NICKNAME = new Map(MISSION_SOURCE);
// 맵을 180도 돌린 관계라 시계 위치와 진영 거점 이름이 짝을 이뤄 바뀐다.
const MISSION_MIRROR_PAIRS: Array<[string, string]> = [["12시", "6시"], ["1시", "7시"], ["3시", "9시"], ["군왕", "목명"], ["축복", "천무"]];
const MISSION_MIRROR = new Map<string, string>(MISSION_MIRROR_PAIRS.flatMap(([left, right]) => [[left, right], [right, left]] as Array<[string, string]>));
const MISSION_MIRROR_PATTERN = new RegExp([...MISSION_MIRROR.keys()].sort((a, b) => b.length - a.length).join("|"), "g");
const MISSION_SIDE_LABEL: Record<MissionSide, string> = { ian: "이안", lucia: "루시아" };
// 카드는 내용 길이에 따라 높이가 달라져, 맵 밖으로 나가지 않게 넉넉한 공칭 크기로만 잡아 둔다.
const MISSION_CARD_SIZE = { width: .27, height: .36 };
const STAFF_ORDER: Record<PrimaryRole, string> = {
  infantry: "첫 스타팅 때 각자 맡은 라인에서 STAFF 사용",
  ranged: "상대 진영에 페어리 드래곤이 처음 소환되기 전, 약속된 장소에서 STAFF 사용",
  cavalry: "스테프 자율 사용",
};
const DEFAULT_SCENE_EVENTS: SceneEvents = { fairyDragon: "", lifeStone: "", fairyDragonPosition: "northwest" };
const SCENE_TIMES = ["60:00", "55:00", "52:00", "46:00", "42:00"];
const STARTING_POINT_CENTER: Record<MapVariant, Record<"lucia" | "ian", Point>> = {
  tactical: { lucia: { x: .392, y: .268 }, ian: { x: .612, y: .558 } },
  field: { lucia: { x: .342, y: .42 }, ian: { x: .594, y: .65 } },
};
const OBJECTIVE_META = [
  { id: "spirit-west", label: "영목", location: "서쪽", tactical: { x: 27.9, y: 39.3 }, field: { x: 20.8, y: 54.2 } },
  { id: "spirit-north", label: "영목", location: "북쪽", tactical: { x: 57.5, y: 10.3 }, field: { x: 61.9, y: 16.3 } },
  { id: "spirit-east", label: "영목", location: "동쪽", tactical: { x: 77.3, y: 38.1 }, field: { x: 79.8, y: 40 } },
  { id: "spirit-south", label: "영목", location: "남쪽", tactical: { x: 43.3, y: 71.3 }, field: { x: 38.4, y: 81.6 } },
  { id: "hall-northeast", label: "전당", location: "1시", tactical: { x: 71.1, y: 11.3 }, field: { x: 78.9, y: 21 } },
  { id: "hall-southwest", label: "전당", location: "7시", tactical: { x: 24.8, y: 61.6 }, field: { x: 21.1, y: 75 } },
  { id: "hall-north", label: "전당", location: "생명의 반석 12시", tactical: { x: 53.5, y: 18.9 }, field: { x: 55.4, y: 27.3 } },
  { id: "hall-south", label: "전당", location: "생명의 반석 6시", tactical: { x: 47.7, y: 50.6 }, field: { x: 45.2, y: 68.5 } },
  { id: "lookout-lucia-west", label: "전망대", location: "루시아 스타팅 후방 서쪽", tactical: { x: 28.1, y: 15 }, field: { x: 21.8, y: 23.4 } },
  { id: "lookout-lucia-east", label: "전망대", location: "루시아 스타팅 후방 동쪽", tactical: { x: 36.4, y: 13.3 }, field: { x: 33.7, y: 22.2 } },
  { id: "lookout-ian-west", label: "전망대", location: "이안 스타팅 후방 서쪽", tactical: { x: 70.6, y: 60.2 }, field: { x: 69.6, y: 75.8 } },
  { id: "lookout-ian-east", label: "전망대", location: "이안 스타팅 후방 동쪽", tactical: { x: 80.2, y: 57.2 }, field: { x: 79.8, y: 73.4 } },
] as const;

function freshOperation(): Operation {
  const sceneId = "scene-1";
  return { version: 1, name: "WB 헤이나펄 리그 2기", side: "ian", players: INITIAL_PLAYERS, scenes: [{ id: sceneId, name: "START", time: "60:00", positions: {}, objects: [], events: { ...DEFAULT_SCENE_EVENTS } }], activeSceneId: sceneId, updatedAt: new Date().toISOString() };
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function clamp(value: number) { return Math.max(0.025, Math.min(0.975, value)); }
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function mergePlayers(saved: Player[]): Player[] {
  const merged = saved.map((player) => ({
    ...player,
    lineup: player.lineup ?? (RESERVE_PLAYERS.has(player.nickname) ? "reserve" : "starter"),
    secondaryRoles: player.secondaryRoles?.length ? player.secondaryRoles : defaultCommandRoles(player.nickname),
  }));
  const known = new Set(merged.map((player) => player.nickname));
  INITIAL_PLAYERS.forEach((player) => { if (!known.has(player.nickname)) merged.push({ ...player }); });
  return merged;
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
const RALLY_LEADER_ALIAS: Array<[string, string]> = [["진수님", "[WB] 진 수"], ["오소리님", "벌꿀오소리"]];
function objectivePoint(id: string, variant: MapVariant): Point | null {
  const found = OBJECTIVE_META.find((item) => item.id === id);
  if (!found) return null;
  const point = found[variant];
  return { x: point.x / 100, y: point.y / 100 };
}
function missionTargetIds(text: string, side: MissionSide, followed = false): string[] {
  // 집결 탑승은 그 집결장이 서는 자리로 따라간다.
  if (!followed && text.includes("집결 탑승")) {
    const alias = RALLY_LEADER_ALIAS.find(([label]) => text.includes(label));
    const leader = alias && MISSION_BY_NICKNAME.get(alias[1]);
    if (!leader) return [];
    const rally = leader.map((order) => mirrorMission(order, side)).find((order) => order.includes("집결"));
    return rally ? missionTargetIds(rally, side, true) : [];
  }
  if (text.includes("전망대")) return ["lookout-lucia-west", "lookout-lucia-east", "lookout-ian-west", "lookout-ian-east"];
  if (text.includes("9시")) return ["spirit-west"];
  if (text.includes("3시")) return ["spirit-east"];
  if (text.includes("12시")) return [text.includes("목명") ? "hall-north" : "spirit-north"];
  if (text.includes("6시")) return [text.includes("군왕") ? "hall-south" : "spirit-south"];
  if (text.includes("1시")) return ["hall-northeast"];
  if (text.includes("7시")) return ["hall-southwest"];
  return [];
}
function mirrorMission(text: string, side: MissionSide) {
  return side === "ian" ? text : text.replace(MISSION_MIRROR_PATTERN, (token) => MISSION_MIRROR.get(token) ?? token);
}
// 카드는 진영색 한 가지로 칠하므로, 색상 대신 강조 단계로 위계를 준다.
function missionEmphasis(text: string) {
  const tone = missionTone(text);
  if (tone === "rally" || tone === "garrison") return "is-key";
  return tone === "field" ? "is-muted" : "";
}
function missionTone(text: string): MissionTone {
  if (text.includes("집결 탑승")) return "join";
  if (text.includes("집결")) return "rally";
  if (text.includes("주둔장")) return "garrison";
  if (text.includes("막기")) return "block";
  if (text.startsWith("필드전투")) return "field";
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

export default function WarTable() {
  const [operation, setOperation] = useState<Operation>(freshOperation);
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
  const openMissionBriefs = missionCards.map((card) => {
    const player = operation.players.find((item) => item.id === card.playerId);
    if (!player) return null;
    const orders = MISSION_BY_NICKNAME.get(player.nickname)?.map((text) => mirrorMission(text, missionSide)) ?? null;
    const roles = orders ? missionCommandRoles(orders) : [];
    const origin = scene.positions[String(player.id)] ?? STARTING_POINT_CENTER[mapVariant][missionSide];
    const byTarget = new Map<string, number[]>();
    const roaming: number[] = [];
    const gaps: number[] = [];
    (orders ?? []).forEach((text, index) => {
      const ids = missionTargetIds(text, missionSide);
      if (ids.length) { ids.forEach((id) => byTarget.set(id, [...(byTarget.get(id) ?? []), index + 1])); return; }
      if (missionTone(text) === "field") roaming.push(index + 1); else gaps.push(index + 1);
    });
    const routes = [...byTarget].map(([id, units]) => {
      const to = objectivePoint(id, mapVariant);
      return to ? { key: `${card.playerId}-${id}`, nickname: player.nickname, from: origin, to, units, roaming: false } : null;
    }).filter((route) => route !== null);
    // 필드전투·긴급 주유는 고정 거점이 없어, 그 사람 다른 부대들이 선 자리의 한가운데로 보낸다.
    if (roaming.length && routes.length) {
      const to = { x: routes.reduce((sum, route) => sum + route.to.x, 0) / routes.length, y: routes.reduce((sum, route) => sum + route.to.y, 0) / routes.length };
      routes.push({ key: `${card.playerId}-roaming`, nickname: player.nickname, from: origin, to, units: roaming, roaming: true });
    } else if (roaming.length) gaps.push(...roaming);
    return { card, player, orders, roles, routes, gaps: gaps.sort((a, b) => a - b) };
  }).filter((brief) => brief !== null);
  const missionRoutes = openMissionBriefs.filter((brief) => brief.card.route).flatMap((brief) => brief.routes);
  const counts = useMemo(() => {
    const starters = operation.players.filter((player) => player.lineup === "starter");
    return {
      infantry: starters.filter((player) => player.primaryRole === "infantry").length,
      cavalry: starters.filter((player) => player.primaryRole === "cavalry").length,
      ranged: starters.filter((player) => player.primaryRole === "ranged").length,
      rally: starters.filter((player) => player.secondaryRoles.includes("rally")).length,
      starters: starters.length,
    };
  }, [operation.players]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Operation;
          if (saved.version === 1 && saved.players?.length && saved.scenes?.length) {
            saved.players = mergePlayers(saved.players);
            saved.scenes = saved.scenes.map(normalizeScene);
            setOperation(saved);
          }
        }
      } catch { localStorage.removeItem(STORAGE_KEY); }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(operation));
  }, [operation, ready]);

  const commit = (updater: (current: Operation) => Operation) => {
    setCanUndo(true);
    setCanRedo(false);
    setOperation((current) => {
      pastRef.current = [...pastRef.current.slice(-59), clone(current)];
      futureRef.current = [];
      const next = updater(clone(current));
      next.updatedAt = new Date().toISOString();
      return next;
    });
  };
  const checkpoint = () => { pastRef.current = [...pastRef.current.slice(-59), clone(operation)]; futureRef.current = []; setCanUndo(true); setCanRedo(false); };
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
      const card = cardDragRef.current;
      if (card) {
        const moveX = (event.clientX - card.startClient.x) / rect.width; const moveY = (event.clientY - card.startClient.y) / rect.height;
        if (!card.moved && Math.hypot(moveX, moveY) < .004) return;
        card.moved = true;
        const x = fitAxis(card.origin.x + moveX, MISSION_CARD_SIZE.width); const y = fitAxis(card.origin.y + moveY, MISSION_CARD_SIZE.height);
        setOperation((current) => ({ ...current, cards: (current.cards ?? []).map((item) => item.playerId === card.playerId ? { ...item, x, y } : item) }));
        return;
      }
      const memo = memoDragRef.current;
      if (memo) {
        const moveX = (event.clientX - memo.startClient.x) / rect.width; const moveY = (event.clientY - memo.startClient.y) / rect.height;
        if (!memo.moved && Math.hypot(moveX, moveY) < .004) return;
        memo.moved = true;
        const x = fitAxis(memo.origin.x + moveX, memo.size.width); const y = fitAxis(memo.origin.y + moveY, memo.size.height);
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
    if (tool === "memo") {
      const area = memoRect(drawPointsRef.current[0], end);
      const note: TacticalObject = { id: uid("memo"), type: "memo", x: area.left, y: area.top, x2: area.left + area.width, y2: area.top + area.height, text: "" };
      updateScene(scene.id, (target) => { target.objects.push(note); });
      setMemoDraft({ id: note.id, text: "" });
      setTool("select");
      drawPointsRef.current = [];
      setDrawPoints([]);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    const points = [...drawPointsRef.current];
    const previous = points[points.length - 1];
    if (Math.hypot(end.x - previous.x, end.y - previous.y) >= .003) points.push(end);
    const start = points[0];
    const pathLength = points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
    if (points.length > 1 && pathLength > .01) {
      const object: TacticalObject = { id: uid(tool), type: tool as "attackArrow" | "defense", ...start, x2: end.x, y2: end.y, points };
      updateScene(scene.id, (target) => { target.objects.push(object); });
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
    const next = { ...clone(source), id, name: index < SCENE_TIMES.length ? ["START", "루브라이트", "포탈", "페어리 드래곤", "생명석"][index] : `SCENE ${String(index + 1).padStart(2, "0")}`, time, events: { ...clone(source.events), fairyDragonPosition: source.events.fairyDragonPosition === "northwest" ? "southeast" : "northwest" } };
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
    try { const parsed = JSON.parse(await file.text()) as Operation; if (parsed.version !== 1 || !parsed.players?.length || !parsed.scenes?.length) throw new Error(); parsed.players = mergePlayers(parsed.players); parsed.scenes = parsed.scenes.map(normalizeScene); checkpoint(); setOperation(parsed); setSelectedIds([]); setMemoDraft(null); }
    catch { window.alert("Heinapel War Table v0.1 JSON 파일이 아닙니다."); }
    event.target.value = "";
  };
  const resetOperation = () => { if (!window.confirm("현재 작전 데이터를 초기화할까요?")) return; checkpoint(); setOperation(freshOperation()); setSelectedIds([]); setSceneDraft(null); setMemoDraft(null); };
  const toggleCommandRole = (role: "rally" | "garrison") => {
    const secondaryRoles = editing.secondaryRoles.includes(role)
      ? editing.secondaryRoles.filter((item) => item !== role)
      : [...editing.secondaryRoles.filter((item) => item !== "rally" && item !== "garrison"), role];
    patchPlayer(editing.id, { secondaryRoles });
  };
  const deployStarters = (side: "lucia" | "ian") => {
    const starters = operation.players.filter((player) => player.lineup === "starter");
    const center = STARTING_POINT_CENTER[mapVariant][side];
    const columns = 7;
    const rows = Math.ceil(starters.length / columns);
    commit((draft) => {
      const target = draft.scenes.find((item) => item.id === scene.id);
      if (!target) return draft;
      draft.side = side;
      starters.forEach((player, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const rowCount = Math.min(columns, starters.length - row * columns);
        target.positions[String(player.id)] = {
          x: clamp(center.x + (column - (rowCount - 1) / 2) * .025),
          y: clamp(center.y + (row - (rows - 1) / 2) * .04),
        };
      });
      return draft;
    });
    setSelectedIds([]);
    setRoleFilter("all");
    setTool("select");
  };

  const visiblePlayers = operation.players.filter((player) => roleFilter === "all" || player.primaryRole === roleFilter);
  const placedCount = Object.keys(scene.positions).length;
  const visibleObjects = scene.objects;
  const stepObjects = visibleObjects.filter((object) => object.type === "step");
  const objectiveCounts = OBJECTIVE_META.reduce((counts, objective) => {
    counts[scene.objectiveOwners?.[objective.id] ?? "neutral"] += 1;
    return counts;
  }, { neutral: 0, lucia: 0, ian: 0 } as Record<ObjectiveOwner, number>);

  return (
    <main className={`war-shell${mapFocus ? " map-focus" : ""}`}>
      <header className="topbar">
        <div className="brand-block"><span className="brand-mark">H</span><div><h1>HEINAPEL <span>WAR TABLE</span></h1><input aria-label="작전명" value={operation.name} onChange={(event) => commit((draft) => { draft.name = event.target.value; return draft; })} /></div></div>
        <div className="battle-clock"><span>{scene.name}</span><strong>{scene.time} · {placedCount}/{operation.players.length} DEPLOYED</strong></div>
        <div className="header-actions">
          <button type="button" onClick={undo} disabled={!canUndo} title="실행 취소">↶</button><button type="button" onClick={redo} disabled={!canRedo} title="다시 실행">↷</button>
          <button type="button" onClick={exportJson}>JSON ↓</button><button type="button" onClick={() => importRef.current?.click()}>JSON ↑</button><input ref={importRef} className="visually-hidden" type="file" accept="application/json" onChange={importJson} />
          <span className="status-chip"><i /> SAVED {ready ? new Date(operation.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="roster-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">BLUE FORCE</span><h2>PLAYER ROSTER</h2></div><span className="count-badge">{visiblePlayers.length} / {operation.players.length}</span></div>
          <div className="roster-controls">
            <select aria-label="역할 필터" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | PrimaryRole)}><option value="all">전체 역할</option><option value="infantry">보병</option><option value="cavalry">기병</option><option value="ranged">원거리</option></select>
          </div>
          <div className="roster-list" aria-label={`플레이어 명단 ${visiblePlayers.length}명 표시 · 총 ${operation.players.length}명`}>
            {visiblePlayers.map((player) => (
              <button draggable type="button" key={player.id} className={`player-row ${editingId === player.id ? "is-active" : ""} ${scene.positions[String(player.id)] ? "is-placed" : ""}`} onDragStart={(event) => handleRosterDrag(event, player.id)} onClick={() => { setEditingId(player.id); openMissionCard(player.id); if (!scene.positions[String(player.id)]) setSelectedIds([player.id]); }}>
                <span className="player-num">{String(player.id).padStart(2, "0")}</span><span className="player-copy"><strong className={playerNameClass(player)}>{player.nickname}</strong><span className={`lineup-badge ${player.lineup}`}>{player.lineup === "reserve" ? "예비" : "주전"}</span></span><span className="edit-glyph">{scene.positions[String(player.id)] ? "●" : "⋮⋮"}</span>
              </button>
            ))}
          </div>
        </aside>

        <section ref={mapRef} className={`map-panel map-${mapVariant} tool-${tool}`} aria-label="헤이나펄 전장 작전판" onDragOver={(event) => event.preventDefault()} onDrop={handleMapDrop} onPointerDown={handleMapPointerDown} onPointerMove={handleMapPointerMove} onPointerUp={handleMapPointerUp} onPointerCancel={cancelMapDrawing}>
          <div className="map-image-layer" /><div className="map-grid-lines" />
          <div className="map-toolbar" onPointerDown={(event) => event.stopPropagation()}>
            <div className="map-toolbar-left">
              <div className="map-switcher" aria-label="지도 선택"><button type="button" className={mapVariant === "tactical" ? "active" : ""} onClick={() => setMapVariant("tactical")}>전술 맵</button><button type="button" className={mapVariant === "field" ? "active" : ""} onClick={() => setMapVariant("field")}>실전 맵</button></div>
              <div className={`mission-side-switch side-${missionSide}`} role="group" aria-label="임무 기준 진영">{(Object.keys(MISSION_SIDE_LABEL) as MissionSide[]).map((side) => <button type="button" key={side} className={missionSide === side ? "active" : ""} aria-pressed={missionSide === side} onClick={() => setMissionSide(side)}>{MISSION_SIDE_LABEL[side]}</button>)}</div>
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
            <defs><marker id="move-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#55cfff" /></marker><marker id="attack-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#ff5353" /></marker><marker id="route-head-ian" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#f0c463" /></marker><marker id="route-head-lucia" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#5cb8ff" /></marker></defs>
            {missionRoutes.map((route) => <line key={route.key} className={`mission-route side-${missionSide}${route.roaming ? " is-roaming" : ""}`} x1={route.from.x * 1000} y1={route.from.y * 1000} x2={route.to.x * 1000} y2={route.to.y * 1000} markerEnd={`url(#route-head-${missionSide})`} />)}
            {visibleObjects.filter((object) => ["moveArrow", "attackArrow", "defense"].includes(object.type)).map((object) => object.points?.length ? <path key={object.id} className={`tactical-object freehand-path ${object.type === "defense" ? "defense-line" : `arrow-${object.type}`}`} onClick={() => deleteObject(object.id)} d={smoothPath(object.points)} markerEnd={object.type === "defense" ? undefined : `url(#${object.type === "moveArrow" ? "move-head" : "attack-head"})`} /> : <line key={object.id} className={`tactical-object ${object.type === "defense" ? "defense-line" : `arrow-${object.type}`}`} onClick={() => deleteObject(object.id)} x1={object.x * 1000} y1={object.y * 1000} x2={(object.x2 ?? object.x) * 1000} y2={(object.y2 ?? object.y) * 1000} markerEnd={object.type === "defense" ? undefined : `url(#${object.type === "moveArrow" ? "move-head" : "attack-head"})`} />)}
            {drawPoints.length > 1 && <path className={`draw-preview freehand-path ${tool === "defense" ? "defense-line" : "arrow-attackArrow"}`} d={smoothPath(drawPoints)} markerEnd={tool === "attackArrow" ? "url(#attack-head)" : undefined} />}
          </svg>
          {missionRoutes.map((route) => { const at = .82; const x = route.from.x + (route.to.x - route.from.x) * at; const y = route.from.y + (route.to.y - route.from.y) * at; return <span key={`${route.key}-tag`} className={`mission-route-tag side-${missionSide}${route.roaming ? " is-roaming" : ""}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} title={`${route.nickname} · ${route.units.join(", ")}부대${route.roaming ? " · 아군 목적지 주변 유동" : ""}`}>{route.units.join("·")}</span>; })}
          {tool === "memo" && drawPoints.length > 1 && (() => { const area = memoRect(drawPoints[0], drawPoints[1]); return <div className="memo-preview" style={{ left: `${area.left * 100}%`, top: `${area.top * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%` }} />; })()}
          {openMissionBriefs.map(({ card, player, orders, roles, gaps }) => <div key={card.playerId} className={`tactical-object mission-card side-${missionSide} role-${player.primaryRole}`} style={{ left: `${card.x * 100}%`, top: `${card.y * 100}%` }} onPointerDown={(event) => { if (tool === "delete") { event.stopPropagation(); closeMissionCard(card.playerId); } }}>
            <div className="mission-card-head" onPointerDown={(event) => handleCardPointerDown(event, card)}>
              <UnitRoleIcon unitRole={player.primaryRole} isRally={player.secondaryRoles.includes("rally")} />
              <strong className="mission-card-name">{player.nickname}</strong>
              <div className="mission-card-actions">
                {orders && <button type="button" className={`mission-card-route ${card.route ? "active" : ""}`} aria-pressed={!!card.route} onClick={() => toggleMissionRoute(card.playerId)} title={`${player.nickname} 부대 목적지를 지도에 표시`}>경로</button>}
                <button type="button" className="mission-card-close" onClick={() => closeMissionCard(card.playerId)} aria-label={`${player.nickname} 임무 카드 닫기`}>×</button>
              </div>
            </div>
            {orders ? <div className="mission-card-body" onClick={() => { if (tool === "select") toggleMissionRoute(card.playerId); }} role="presentation">
              <p className="mission-staff"><b>STAFF</b>{STAFF_ORDER[player.primaryRole]}</p>
              {roles.length > 0 && <div className="mission-roles">{roles.map((role) => <span key={role.key} className="mission-role"><b>{role.label}</b>{role.place}</span>)}</div>}
              <ol className="mission-units">{orders.map((text, index) => <li key={index} className={`mission-unit ${missionEmphasis(text)}`}><i>{index + 1}</i><span>{text}</span></li>)}</ol>
              {card.route && gaps.length > 0 && <p className="mission-route-gap">{gaps.join("·")}부대는 임무표에 목적지가 없어 지도에 표시할 수 없습니다</p>}
            </div> : <p className="mission-empty">임무표에 배정된 부대가 없습니다<small>{player.lineup === "reserve" ? "예비 편성" : "시트 미배정"}</small></p>}
          </div>)}
          {visibleObjects.filter((object) => object.type === "memo").map((note) => { const span = memoSpan(note); const isEditing = memoDraft?.id === note.id; return <div key={note.id} className={`tactical-object map-memo${isEditing ? " is-editing" : ""}`} style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%`, width: `${span.width * 100}%`, height: `${span.height * 100}%` }}>{isEditing ? <textarea ref={memoInputRef} aria-label="메모 내용" placeholder="메모를 입력하세요" value={memoDraft.text} onChange={(event) => setMemoDraft({ id: note.id, text: event.target.value })} onBlur={() => finishMemoEdit(true)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); finishMemoEdit(false); } }} /> : <button type="button" className="memo-face" onPointerDown={(event) => handleMemoPointerDown(event, note)} onClick={(event) => { if (event.detail !== 0) return; if (tool === "delete") deleteObject(note.id); else if (tool === "select") setMemoDraft({ id: note.id, text: note.text ?? "" }); }} title={tool === "delete" ? "클릭해 메모 삭제" : "클릭해 메모 수정 · 드래그로 이동"}><span className={note.text ? "" : "is-placeholder"}>{note.text || "메모 입력"}</span></button>}</div>; })}
          {visibleObjects.filter((object) => object.type === "attackArrow").map((object, index) => { const origin = object.points?.[0] ?? { x: object.x, y: object.y }; return <span key={`${object.id}-order`} className="attack-line-order" style={{ left: `${origin.x * 100}%`, top: `${origin.y * 100}%` }} aria-hidden="true">{index + 1}</span>; })}
          {visibleObjects.filter((object) => ["rally", "step", "text"].includes(object.type)).map((object) => <button type="button" key={object.id} className={`tactical-object map-marker marker-${object.type}`} style={{ left: `${object.x * 100}%`, top: `${object.y * 100}%` }} onClick={() => deleteObject(object.id)}><span>{object.type === "rally" ? "⚔" : object.type === "step" ? `S${stepObjects.findIndex((item) => item.id === object.id) + 1}` : object.text}</span></button>)}
          {operation.players.filter((player) => scene.positions[String(player.id)] && (roleFilter === "all" || player.primaryRole === roleFilter)).map((player) => { const pos = scene.positions[String(player.id)]; const isRally = player.secondaryRoles.includes("rally"); const tooltip = `${player.nickname} · ${ROLE_LABEL[player.primaryRole]}${player.secondaryRoles.length ? ` · ${player.secondaryRoles.map((role) => SECONDARY_LABEL[role]).join("/")}` : ""}`; return <button type="button" key={player.id} className={`player-token role-${player.primaryRole} ${isRally ? "is-rally" : ""} ${selectedIds.includes(player.id) ? "selected" : ""}`} style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }} onPointerDown={(event) => handleTokenPointerDown(event, player.id)} aria-label={tooltip} data-tooltip={tooltip}><UnitRoleIcon unitRole={player.primaryRole} isRally={isRally} />{!isRally && <span className="token-num">{String(player.id).padStart(2, "0")}</span>}</button>; })}
          <div className="map-note"><span>{mapVariant === "tactical" ? "TACTICAL OVERVIEW" : "FIELD REFERENCE"}</span><strong>{mapVariant === "tactical" ? "헤이나펄 전술 맵" : "헤이나펄 실전 지형"}</strong><small>{TOOL_META.find((item) => item.id === tool)?.hint}</small></div><div className="map-coordinates"><span>GRID A-01</span><span>생명의 반석 기준 작전도</span><span>GRID H-09</span></div>
        </section>

        <aside className="inspector-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">TACTICAL CONTROL</span><h2>핵심 작전 도구</h2></div></div>
          <div className="tool-grid">{TOOL_META.map((item) => <button type="button" key={item.id} className={`${tool === item.id ? "active" : ""} tool-${item.id}`} onClick={() => setTool((current) => current === item.id ? "select" : item.id)} title={item.hint}>{item.id === "delete" ? <EraserIcon /> : <span>{item.glyph}</span>}{item.label}</button>)}</div>
          <div className="assignment-panel">
            <div className="assignment-player"><span>SELECTED PLAYER</span><strong className={playerNameClass(editing)}>{editing.nickname}</strong><small>명단에서 아이디를 선택한 뒤 역할을 지정하세요.</small></div>
            <div className="assignment-heading">편성</div>
            <div className="assignment-grid two-column">
              <button type="button" className={`assignment-button status-starter ${editing.lineup === "starter" ? "active" : ""}`} onClick={() => patchPlayer(editing.id, { lineup: "starter" })}><span>★</span>주전</button>
              <button type="button" className={`assignment-button status-reserve ${editing.lineup === "reserve" ? "active" : ""}`} onClick={() => patchPlayer(editing.id, { lineup: "reserve" })}><span>◇</span>예비</button>
            </div>
            <div className="assignment-heading">병종</div>
            <div className="assignment-grid three-column">
              {(Object.keys(ROLE_LABEL) as PrimaryRole[]).map((role) => <button type="button" key={role} className={`assignment-button role-${role} ${editing.primaryRole === role ? "active" : ""}`} onClick={() => patchPlayer(editing.id, { primaryRole: role })}><UnitRoleIcon unitRole={role} />{ROLE_LABEL[role]}</button>)}
            </div>
            <div className="assignment-heading">지휘 역할</div>
            <div className="assignment-grid two-column">
              <button type="button" className={`assignment-button command-rally ${editing.secondaryRoles.includes("rally") ? "active" : ""}`} onClick={() => toggleCommandRole("rally")}><UnitRoleIcon unitRole="infantry" isRally />집결장</button>
              <button type="button" className={`assignment-button command-garrison ${editing.secondaryRoles.includes("garrison") ? "active" : ""}`} onClick={() => toggleCommandRole("garrison")}><UnitRoleIcon unitRole="infantry" />주둔장</button>
            </div>
            <div className="role-count-board">
              <div className="assignment-heading">병종 현황 · 주전 기준</div>
              <div className="role-count-grid">
                <div className="role-count-tile role-infantry"><UnitRoleIcon unitRole="infantry" /><strong>{counts.infantry}</strong><small>보병</small></div>
                <div className="role-count-tile role-cavalry"><UnitRoleIcon unitRole="cavalry" /><strong>{counts.cavalry}</strong><small>기병</small></div>
                <div className="role-count-tile role-ranged"><UnitRoleIcon unitRole="ranged" /><strong>{counts.ranged}</strong><small>원거리</small></div>
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
      <div className="desktop-only">이 작전판은 1180px 이상의 PC 화면에 최적화되어 있습니다.</div>
    </main>
  );
}
