// 작전 데이터(명단·장면·카드)의 형태, 기본값, 저장본 검사와 옛 명단 이관.
import { type MissionSide, type Point, MISSION_SIDES, MAP_VARIANTS, OBJECTIVE_META, samePoint, slotPoint } from "./map-geometry";
import { PLAYER_SOURCE, ROLE_LABEL, SLOT_SOURCE, ROSTER_ALIASES, type Brief, type MissionOrders, type PrimaryRole } from "./roster";

export type SecondaryRole = "garrison" | "rally" | "blocker";
type LineupStatus = "starter";
// 이동 화살표·스텝·텍스트는 지금 도구에 없지만 이전 저장본에 남아 있을 수 있어 그린다.
type ObjectType = "moveArrow" | "attackArrow" | "defense" | "rally" | "step" | "text" | "memo";
export type ObjectiveOwner = "neutral" | "lucia" | "ian";
export type MissionCard = { playerId: number; x: number; y: number; route?: boolean };
export type FairyDragonPosition = "northwest" | "southeast";
export type Player = { id: number; nickname: string; primaryRole: PrimaryRole; secondaryRoles: SecondaryRole[]; lineup: LineupStatus; slot?: number | null; brief?: Brief | null };
export type TacticalObject = { id: string; type: ObjectType; x: number; y: number; x2?: number; y2?: number; points?: Point[]; text?: string };
type SceneEvents = { fairyDragon: string; lifeStone: string; fairyDragonPosition: FairyDragonPosition };
export type Scene = { id: string; name: string; time: string; positions: Record<string, Point>; objects: TacticalObject[]; events: SceneEvents; objectiveOwners?: Record<string, ObjectiveOwner> };
export type Operation = { version: 1; rosterRevision?: 1 | 2 | 3 | 4 | 5 | 6; name: string; players: Player[]; scenes: Scene[]; activeSceneId: string; updatedAt: string; side?: MissionSide; cards?: MissionCard[] };

export const STORAGE_KEY = "heinapel-war-table-v0.3";
export const SECONDARY_LABEL: Record<SecondaryRole, string> = { garrison: "주둔장", rally: "집결장", blocker: "블로커" };
// 사진 정본에 남은 선수의 확인된 지휘 보직. 미확인 신규 선수에게 이전 보직을 넘기지 않는다.
const RALLY_PLAYERS = new Set(["진수", "TESLA", "Maha"]);
const GARRISON_PLAYERS = new Set(["Glen fiddich", "욘두 Yondu", "예리", "JunkHun", "압수", "Elega", "5000"]);
const BLOCKER_PLAYERS = new Set(["Kingsway"]);
export const SLOT_BY_NICKNAME = new Map(SLOT_SOURCE);
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
const DEFAULT_SCENE_EVENTS: SceneEvents = { fairyDragon: "", lifeStone: "", fairyDragonPosition: "northwest" };
export function freshOperation(): Operation {
  const sceneId = "scene-1";
  return { version: 1, rosterRevision: 6, name: "WB 헤이나펄 리그 2기", side: "ian", players: INITIAL_PLAYERS, scenes: [{ id: sceneId, name: "START", time: "60:00", positions: {}, objects: [], events: { ...DEFAULT_SCENE_EVENTS } }], activeSceneId: sceneId, updatedAt: new Date().toISOString() };
}
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
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
export function playerSlot(player: Player): number | undefined {
  return player.slot === undefined ? SLOT_BY_NICKNAME.get(player.nickname) : player.slot ?? undefined;
}
// 2026-10-04 시트 자리 변경 전 번호. 저장본에 이 기본 번호가 그대로 남은 선수만 한 번 새 기본 번호를 따르게 한다.
const SEATS_BEFORE_2026_10_04 = new Map([["마스터", 5], ["TESLA", 6], ["Mim Mi", 7], ["압수", 12], ["마리오", 19], ["TOMAS SHELBY", 20], ["Elega", 27]]);
const SEATS_BEFORE_CARD_SYNC = new Map([["Elega", 19], ["5000", 26]]);
export function normalizeRoster(saved: Operation): Player[] {
  const players = saved.players;
  const revision = saved.rosterRevision ?? 0;
  const photoRoster = revision >= 2;
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
      return nickname && (SLOT_BY_NICKNAME.get(nickname) === 2 || (revision < 5 && player.nickname === "GINSENG MAN")) ? { ...player, nickname, brief: player.brief ? { ...player.brief, nickname } : player.brief } : player;
    }).map((player) => player.slot != null && ((revision === 2 && SEATS_BEFORE_2026_10_04.get(player.nickname) === player.slot) ||
      (revision < 6 && SEATS_BEFORE_CARD_SYNC.get(player.nickname) === player.slot)) ? { ...player, slot: undefined } : player);
    if (new Set(renamed.map((player) => player.nickname.trim().toLowerCase())).size !== renamed.length) throw new Error("잘못된 명단");
    // 실제 멤버 교체다. 옛 선수의 ID·임무·보직은 넘기지 않고, 이미 지운 선수는 되살리지 않는다.
    if (revision < 5 && renamed.some((player) => player.nickname === "TOMAS SHELBY")) {
      if (renamed.some((player) => player.nickname === "알나인티 님")) return renamed.filter((player) => player.nickname !== "TOMAS SHELBY");
      const newcomer = { ...INITIAL_PLAYERS.find((player) => player.nickname === "알나인티 님")!, id: Math.max(...players.map((player) => player.id)) + 1 };
      if (!Number.isSafeInteger(newcomer.id)) throw new Error("선수 ID를 이관할 수 없습니다.");
      return renamed.map((player) => player.nickname === "TOMAS SHELBY" ? newcomer : player);
    }
    return renamed;
  }
  const merged = mergePlayers(players);
  if (merged.some((player) => !Number.isSafeInteger(player.id))) throw new Error("선수 ID를 이관할 수 없습니다.");
  return merged;
}
function normalizeOperation(saved: Operation): Operation {
  const players = normalizeRoster(saved);
  const revision = saved.rosterRevision ?? 0;
  const previousIds = new Set(saved.players.map((player) => player.id));
  const ids = new Set(players.filter((player) => revision >= 2 || previousIds.has(player.id)).map((player) => String(player.id)));
  const reseat = revision >= 2 && revision < 4;
  const byId = new Map(players.map((player) => [String(player.id), player]));
  const replaced = revision >= 2 && revision < 5 ? saved.players.find((player) => player.nickname === "TOMAS SHELBY") : undefined;
  const newcomer = replaced && players.find((player) => player.nickname === "알나인티 님" && !previousIds.has(player.id));
  return { ...saved, players, rosterRevision: 6, cards: saved.cards?.filter((card) => ids.has(String(card.playerId))),
    scenes: saved.scenes.map((item, index) => {
      const positions = Object.fromEntries(Object.entries(item.positions ?? {}).filter(([id]) => ids.has(id))
        .map(([id, point]) => [id, revision >= 2 && revision < 6 && byId.has(id) ? moveFromOldSeat(byId.get(id)!, point, revision) : point]));
      // 교체된 선수의 말이 기본 스타팅 자리에 있을 때만 새 선수도 6번에 배치한다. 직접 옮긴 말은 승계하지 않는다.
      const point = replaced && item.positions?.[String(replaced.id)];
      if (newcomer && point && replaced && (replaced.slot === undefined || replaced.slot === (revision === 2 ? 20 : 6))) {
        for (const side of MISSION_SIDES) for (const variant of MAP_VARIANTS) for (const slot of reseat ? [6, 20] : [6]) {
          const old = slotPoint(slot, side, variant)!;
          if (samePoint(old, point)) positions[String(newcomer.id)] = slotPoint(6, side, variant)!;
        }
      }
      return { ...normalizeScene(item, index), positions };
    }),
  };
}
// 2026-10-04 자리 변경 전에 배치한 말은 번호만 바뀌고 옛 자리 좌표에 남는다.
// 새 기본 번호를 따르는 선수의 말이 옛 기본 자리에 그대로 있을 때만 새 자리로 한 번 옮긴다. 직접 옮긴 말은 둔다.
function moveFromOldSeat(player: Player, point: Point, revision: number): Point {
  const previous = [revision < 4 ? SEATS_BEFORE_2026_10_04.get(player.nickname) : undefined, SEATS_BEFORE_CARD_SYNC.get(player.nickname)].filter((slot) => slot !== undefined);
  const slot = playerSlot(player);
  if (!slot || slot !== SLOT_BY_NICKNAME.get(player.nickname)) return point;
  for (const before of previous) for (const side of MISSION_SIDES) for (const variant of MAP_VARIANTS) {
    const old = slotPoint(before, side, variant);
    if (old && samePoint(old, point)) return slotPoint(slot, side, variant) ?? point;
  }
  return point;
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function validPoint(value: unknown): boolean {
  return isRecord(value) && validCoordinate(value.x) && validCoordinate(value.y);
}
// localStorage와 JSON 가져오기는 화면에 적용하기 전에 같은 구조 검사를 거친다.
export function readOperation(saved: unknown): Operation {
  const invalid = () => { throw new Error("지원하지 않는 저장 데이터"); };
  if (!isRecord(saved) || saved.version !== 1 || !Array.isArray(saved.players) || !saved.players.every(isRecord) ||
    !Array.isArray(saved.scenes) || !saved.scenes.length || typeof saved.name !== "string" ||
    typeof saved.updatedAt !== "string" || !Number.isFinite(Date.parse(saved.updatedAt)) ||
    (saved.rosterRevision !== undefined && ![1, 2, 3, 4, 5, 6].includes(saved.rosterRevision as number)) ||
    (saved.side !== undefined && !MISSION_SIDES.includes(saved.side as MissionSide))) return invalid();
  const sceneIds = new Set<string>();
  for (const scene of saved.scenes) {
    if (!isRecord(scene) || typeof scene.id !== "string" || !scene.id || sceneIds.has(scene.id) ||
      typeof scene.name !== "string" || typeof scene.time !== "string" || !Array.isArray(scene.objects) ||
      (scene.positions !== undefined && (!isRecord(scene.positions) || !Object.values(scene.positions).every(validPoint)))) return invalid();
    sceneIds.add(scene.id);
    if (scene.events !== undefined && (!isRecord(scene.events) ||
      [scene.events.fairyDragon, scene.events.lifeStone].some((value) => value !== undefined && typeof value !== "string") ||
      (scene.events.fairyDragonPosition !== undefined && !["northwest", "southeast"].includes(scene.events.fairyDragonPosition as string)))) return invalid();
    if (scene.objectiveOwners !== undefined && (!isRecord(scene.objectiveOwners) ||
      Object.entries(scene.objectiveOwners).some(([id, owner]) => !OBJECTIVE_META.some((objective) => objective.id === id) || !["neutral", "ian", "lucia"].includes(owner as string)))) return invalid();
    const objectIds = new Set<string>();
    for (const object of scene.objects) {
      if (!isRecord(object) || typeof object.id !== "string" || !object.id || objectIds.has(object.id) ||
        !["moveArrow", "attackArrow", "defense", "rally", "step", "text", "memo"].includes(object.type as string) || !validPoint(object) ||
        [object.x2, object.y2].some((value) => value !== undefined && !validCoordinate(value)) ||
        (object.text !== undefined && typeof object.text !== "string") ||
        (object.points !== undefined && (!Array.isArray(object.points) || !object.points.every(validPoint)))) return invalid();
      objectIds.add(object.id);
    }
  }
  if (typeof saved.activeSceneId !== "string" || !sceneIds.has(saved.activeSceneId)) return invalid();
  if (saved.cards !== undefined) {
    if (!Array.isArray(saved.cards)) return invalid();
    const cardIds = new Set<number>();
    for (const card of saved.cards) {
      if (!isRecord(card) || !Number.isSafeInteger(card.playerId) || (card.playerId as number) < 1 || cardIds.has(card.playerId as number) || !validPoint(card) ||
        (card.route !== undefined && typeof card.route !== "boolean")) return invalid();
      cardIds.add(card.playerId as number);
    }
  }
  return normalizeOperation(saved as Operation);
}
export function newPlayer(players: Player[]): Player {
  return { id: Math.max(0, ...players.map((player) => player.id)) + 1, nickname: "", primaryRole: "infantry", secondaryRoles: [], lineup: "starter", slot: null, brief: null };
}
