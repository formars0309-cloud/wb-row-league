// 임무 문장 → 화면 계산: 진영 환산, 강조·줄 나눔, 부대 화살표 목적지, STAFF 경로.
import { type MapVariant, type MissionSide, type Point, OBJECTIVE_META, TOP_LINE_SLOTS, lineExit, enemyGate, objectivePoint, slotPoint, staffPoint } from "./map-geometry";
import { type SheetMission, type MissionSheet, type StaffPlan } from "./sheets";
import { type Player, SLOT_BY_NICKNAME, clone, playerSlot } from "./operation";
import { ROSTER_ALIASES, type Brief, type MissionOrders } from "./roster";

type MissionTone = "rally" | "garrison" | "roam" | "join" | "block" | "field" | "hold";
// 맵을 180도 돌린 관계라 시계 위치와 진영 거점 이름이 짝을 이뤄 바뀐다.
// 시트 문구의 "이안기준"도 함께 바꿔, 루시아 카드가 스스로 맞는 문장이 되게 한다.
const MISSION_MIRROR_PAIRS: Array<[string, string]> = [["12시", "6시"], ["1시", "7시"], ["3시", "9시"], ["군왕", "목명"], ["축복", "천무"], ["이안기준", "루시아기준"], ["이안 기준", "루시아 기준"]];
const MISSION_MIRROR = new Map<string, string>(MISSION_MIRROR_PAIRS.flatMap(([left, right]) => [[left, right], [right, left]] as Array<[string, string]>));
// 앞에 숫자가 붙은 시계("11시"의 "1시")는 건드리지 않는다.
const MISSION_MIRROR_PATTERN = new RegExp(`(?<!\\d)(?:${[...MISSION_MIRROR.keys()].sort((a, b) => b.length - a.length).join("|")})`, "g");
export function mirrorMission(text: string, side: MissionSide) {
  return side === "ian" ? text : text.replace(MISSION_MIRROR_PATTERN, (token) => MISSION_MIRROR.get(token) ?? token);
}
// 시트에 있는 선수는 폰과 같은 최신 임무를 보여 준다. 저장된 수동 임무는 덮어쓰지 않는다.
function playerBrief(player: Player, sheet?: MissionSheet | null): Brief | undefined {
  const mission = sheetMissionForPlayer(player, sheet);
  return mission ? { nickname: mission.nickname, file: "", team: mission.team, foot: "", units: mission.units,
    steps: [["메인 임무", mission.main], ["서브 임무", mission.sub]].filter(([, text]) => text) as Array<[string, string]> } : player.brief ?? undefined;
}
// 이름이 같은 시트 행을 먼저 찾는다. 시트 「명단」에서 이름만 바뀐 경우를 위해, 기본 명단 선수가 기본 자리에
// 그대로 있으면 그 번호의 시트 행을 쓴다. 직접 옮긴 번호나 앱에서 새로 만든 선수에는 적용하지 않는다.
export function sheetMissionForPlayer(player: Player, sheet?: MissionSheet | null) {
  const nickname = ROSTER_ALIASES.get(player.nickname) ?? player.nickname;
  const byName = [...(sheet?.missions.values() ?? [])].find((item) => (ROSTER_ALIASES.get(item.nickname) ?? item.nickname) === nickname);
  const home = SLOT_BY_NICKNAME.get(nickname);
  return byName ?? (home !== undefined && playerSlot(player) === home ? sheet?.missions.get(home) : undefined);
}
// 화면에 보이는 이름은 시트를 따른다. 저장된 이름은 편집·이관용으로 그대로 둔다.
export function shownName(player: Player, sheet?: MissionSheet | null) {
  return sheetMissionForPlayer(player, sheet)?.nickname ?? player.nickname;
}
export function entranceBlock(mission: SheetMission | undefined, side: MissionSide, variant: MapVariant) {
  if (mission?.team.replace(/\s/g, "") !== "입구막팀" || !/입구\s*막(?:기|음)/.test(mission.main)) return null;
  const top = /탑|top/i.test(mission.main);
  if (!top && !/바텀|bottom/i.test(mission.main)) return null;
  return { top, point: enemyGate(top, side, variant) };
}
// 8강 시트는 루시아 기준이라 탑·바텀도 이안과 반대로 부른다('탑승'은 제외). 두 번 바꾸면 원래 문장이다.
export function swapLineNames(text: string) {
  return text.replace(/바텀|탑(?!승)/g, (word) => word === "탑" ? "바텀" : "탑");
}
// 화살표 계산은 이안 기준 문장을 받으므로 루시아 8강 문장을 되돌려 넘긴다.
export function quarterToIan(text: string) {
  return swapLineNames(mirrorMission(text, "lucia"));
}
// 이안 기준 TOP 쪽이 루시아 8강의 바텀이다.
export function LUCIA_LINE_NAME(top: boolean) {
  return top ? "바텀" : "탑";
}
export function staffLabel(plan: StaffPlan, slot: number) {
  return plan.group === "start" ? "시작 스테프 · 게임 시작 직후" : `지정 스테프 · ${plan.top ?? TOP_LINE_SLOTS.has(slot) ? "TOP" : "BOTTOM"} 포인트${plan.order ? ` ${plan.order}번째` : ""}`;
}
// 시트 문장을 지시 하나씩 끊는다. "/"·"+"·문장 끝 마침표에서 끊되, 괄호 안과 "1."처럼 숫자 뒤 마침표는 그대로 둔다.
export function missionLines(text: string): string[] {
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
export function missionParts(text: string): Array<{ text: string; kind?: "place" | "time" }> {
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
// 같은 지시가 이어지면 "2~5"처럼 한 줄로 묶는다.
export function groupUnits(units: string[]) {
  const groups: Array<{ from: number; to: number; text: string }> = [];
  units.forEach((text, index) => {
    if (!text) return;
    const last = groups.at(-1);
    if (last && last.text === text && last.to === index) last.to = index + 1;
    else groups.push({ from: index + 1, to: index + 1, text });
  });
  return groups;
}
const RALLY_LEADER_ALIAS: Array<[string, string]> = [["진수님", "진수"], ["MAHA님", "Maha"], ["테슬라님", "TESLA"], ["TESLA님", "TESLA"], ["예리님", "예리"], ["벌꿀오소리형", "벌꿀오소리형"], ["게이님", "벌꿀오소리형"], ["오소리님", "벌꿀오소리형"]];
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
  // "… / 아군 전망대 집결 당할경우 …"처럼 경우를 단 뒷문장은 예비 지시라 화살표는 앞 문장을 따른다.
  const order = text.replace(/^.*(?:획득\s*시|획득하면)/, "").replace(/\s*\/[^/]*경우.*$/, "");
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
    return [{ key: top ? "enemy-top-gate" : "enemy-bottom-gate", point: enemyGate(top, side, variant) }];
  } else if (/(?:탑|바텀)\s*라인/.test(order)) {
    // "탑 라인 거점 주유"는 우리 진형의 그 라인 출구로 나간다.
    const top = /탑\s*라인/.test(order);
    return [{ key: top ? "own-top-line" : "own-bottom-line", point: lineExit(top ? 1 : 25, side, variant).point }];
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
export function missionEmphasis(text: string) {
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
type MissionRoute = { target: string; to: Point; units: number[] };
export function buildMissionPlan(orders: string[] | null, side: MissionSide, variant: MapVariant, missions: Map<string, MissionOrders>) {
  const byTarget = new Map<string, { point: Point; units: number[] }>();
  const gaps: number[] = [];
  (orders ?? []).forEach((text, index) => {
    const targets = missionTargets(text, side, variant, missions);
    if (targets.length) { targets.forEach(({ key, point }) => byTarget.set(key, { point, units: [...(byTarget.get(key)?.units ?? []), index + 1] })); return; }
    gaps.push(index + 1);
  });
  const routes: MissionRoute[] = [...byTarget].map(([target, { point, units }]) => ({ target, to: point, units }));
  return { routes, gaps: gaps.sort((a, b) => a - b) };
}
// 집결 탑승 경로도 카드와 같은 시트·편집 임무의 집결장 목적지를 따라간다.
export function missionsByNickname(players: Player[], sheet?: MissionSheet | null) {
  return new Map(players.flatMap((player): Array<[string, MissionOrders]> => { const brief = playerBrief(player, sheet); return brief ? [[shownName(player, sheet), brief.units]] : []; }));
}
export function missionView(player: Player, missions: Map<string, MissionOrders>, side: MissionSide, variant: MapVariant, sheet?: MissionSheet | null) {
  const original = playerBrief(player, sheet);
  const brief = original ? { ...original, steps: original.steps.map(([head, body]): [string, string] => [head, mirrorMission(body, side)]),
    common: original.common?.map(([head, body]): [string, string] => [head, mirrorMission(body, side)]) } : undefined;
  const orders = brief?.units.map((text) => mirrorMission(text, side)) ?? null;
  return { brief, orders, roles: orders ? missionCommandRoles(orders) : [], plan: buildMissionPlan(orders, side, variant, missions) };
}
// 편집기는 기본 번호·임무까지 펼친 사본을 고친다.
export function editablePlayer(player: Player): Player {
  return clone({ ...player, slot: playerSlot(player) ?? null, brief: playerBrief(player) ?? null });
}
// 시작군은 내 자리에서, 지정군은 사용할 STAFF 포인트(빈칸이면 내 라인)에서 목적지로 순간이동한다.
export function staffRoute(plan: StaffPlan | undefined, slot: number, side: MissionSide, variant: MapVariant, missions: Map<string, MissionOrders>) {
  if (!plan?.group) return null;
  const top = plan.top ?? TOP_LINE_SLOTS.has(slot);
  const from = plan.group === "start" ? slotPoint(slot, side, variant) : staffPoint(top, side, variant);
  if (!from) return null;
  return { from, top, targets: plan.target ? missionTargets(mirrorMission(plan.target, side), side, variant, missions) : [] };
}
// 시트를 읽기 전에는 앱 명단의 이름을 보여 준다.
export function slotName(missions: Map<number, SheetMission> | undefined, players: Player[], slot: number) {
  return missions?.get(slot)?.nickname ?? players.find((player) => playerSlot(player) === slot)?.nickname ?? "—";
}
