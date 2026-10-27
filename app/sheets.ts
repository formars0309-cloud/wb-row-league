// 구글 시트 탭 읽기. 화면은 이 파서가 돌려준 값만 쓴다. 열은 머리글 이름으로 찾는다.
import { type MissionOrders } from "./roster";

function sheetCsvUrl(tab: string) {
  return `https://docs.google.com/spreadsheets/d/1NUorQ8zecl1mDRstKk-F1T7hRF2YYBgS_ZG21gIvcgc/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
}
// 폰 화면 임무는 구글 시트 「스타팅 명단」 탭에서 읽는다. 앱에 사본을 두지 않는다.
export const MISSION_SHEET_CSV = sheetCsvUrl("스타팅 명단");
export type SheetMission = { slot: number; nickname: string; team: string; main: string; sub: string; units: MissionOrders; color?: string; lead?: string };
export type MissionSheet = { missions: Map<number, SheetMission>; common: string[] };
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
// 머리글 이름(공백 무시)으로 열 번호를 찾는다. 없으면 -1.
function headerColumns(head: string[]) {
  return (name: string) => head.findIndex((cell) => cell.replace(/\s/g, "") === name);
}
// 열은 머리글 이름으로 찾는다. 시트에서 열을 옮기거나 다른 열을 지워도 이름만 같으면 된다.
// 번호 칸이 0·"공통 임무"인 행은 전원 공통 임무다. gviz는 숫자 열의 글자를 빈칸으로 바꾸므로
// 번호 칸이 빈 내용 행도 공통 임무로 읽는다. 그 행은 번호 칸을 뺀 나머지 칸을 차례로 쓴다.
export function readMissionSheet(text: string): MissionSheet {
  const [head = [], ...rows] = parseCsv(text);
  const column = headerColumns(head);
  const at = { slot: column("스타팅포인트번호"), nickname: column("닉네임"), team: column("소속팀"), main: column("메인임무"), sub: column("서브임무"), units: [1, 2, 3, 4, 5].map((unit) => column(`${unit}번부대`)), color: column("색"), lead: column("맨위안내") };
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
    missions.set(slot, { slot, nickname: cell(at.nickname), team: cell(at.team), main: cell(at.main), sub: cell(at.sub), units: at.units.map(cell) as MissionOrders, ...(at.color >= 0 && cell(at.color) ? { color: cell(at.color) } : {}), ...(at.lead >= 0 && cell(at.lead) ? { lead: cell(at.lead) } : {}) });
  }
  return { missions, common: common ?? [] };
}
// 스테프(지팡이 아티 순간이동)는 같은 시트의 「스테프」 탭에서 읽는다. 0번 행의 사용 방법은 전원 공통 규칙이다.
// 군: 시작/스타팅 = 게임 시작 직후(부대 수는 부대구성을 따른다), 지정 = STAFF 포인트에서 순차 사용.
export const STAFF_SHEET_CSV = sheetCsvUrl("스테프");
export type StaffPlan = { slot: number; group: "start" | "point" | null; order: number | null; top: boolean | null; target: string; method: string; composition?: string; kind?: string };
export type StaffSheet = { plans: Map<number, StaffPlan>; common: string };
export function readStaffSheet(text: string): StaffSheet {
  const [head = [], ...rows] = parseCsv(text);
  const column = headerColumns(head);
  const at = { slot: column("번호"), group: column("군"), order: column("순번"), place: column("사용위치"), target: column("목적지"), method: column("사용방법"), composition: column("부대구성"), kind: column("종류") };
  // 없는 탭을 요청하면 gviz가 첫 탭을 돌려주므로 머리글로 걸러낸다.
  if ([at.slot, at.group, at.order, at.place, at.target].some((index) => index < 0) || (at.method < 0 && at.composition < 0)) throw new Error("스테프 시트 머리글을 찾지 못했습니다");
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
      group: /시작|스타팅/.test(group) ? "start" : /지정|중간/.test(group) ? "point" : null,
      order: Number.parseInt(cell(at.order), 10) || null,
      top: /탑|top/i.test(place) ? true : /바텀|bottom/i.test(place) ? false : null,
      target: cell(at.target),
      method: cell(at.method),
      ...(at.composition >= 0 ? { composition: cell(at.composition) } : {}),
      ...(at.kind >= 0 && cell(at.kind) ? { kind: cell(at.kind) } : {}),
    });
  }
  return { plans, common };
}
// 8강 공통 임무는 「8강 공통 임무」 탭(번호·내용)에서 읽는다. 루시아 기준으로 쓰므로 환산하지 않는다.
export const QUARTER_COMMON_CSV = sheetCsvUrl("8강 공통 임무");
// 8강 개인 임무·스테프 탭은 16강 탭과 열이 같아 같은 파서를 쓴다.
export const QUARTER_MISSION_CSV = sheetCsvUrl("8강 개인 임무");
export const QUARTER_STAFF_CSV = sheetCsvUrl("8강 스테프");
export type QuarterCommon = Array<{ no: string; body: string }>;
export function readQuarterCommon(text: string): QuarterCommon {
  const [head = [], ...rows] = parseCsv(text);
  const column = headerColumns(head);
  const at = { no: column("번호"), body: column("내용") };
  // 없는 탭을 요청하면 gviz가 첫 탭을 돌려주므로 머리글로 걸러낸다.
  if (at.no < 0 || at.body < 0) throw new Error("8강 공통 임무 머리글을 찾지 못했습니다");
  // 내용이 빈 줄은 아직 쓰지 않은 번호라 화면에 내지 않는다. 번호가 비면 화면 순서로 매긴다.
  const items = rows.map((row) => ({ no: (row[at.no] ?? "").trim(), body: (row[at.body] ?? "").trim() })).filter((item) => item.body);
  return items.map((item, index) => ({ no: item.no || String(index + 1), body: item.body }));
}
// 공통 임무 시트에 [초록:문구]처럼 적으면 그 문구만 색으로 강조한다. 모르는 색 이름은 글자 그대로 둔다.
export const QUARTER_COLORS: Record<string, string> = { 초록: "#7fd49b", 빨강: "#ff8a80", 파랑: "#7fb8ff", 주황: "#f5a65b", 노랑: "#f2d06b" };
const QUARTER_COLOR_PATTERN = new RegExp(`\\[(${Object.keys(QUARTER_COLORS).join("|")}):([^\\]]+)\\]`);
export function colorParts(text: string) {
  const pieces = text.split(new RegExp(QUARTER_COLOR_PATTERN, "g"));
  const parts: Array<{ text: string; color?: string }> = [];
  for (let index = 0; index < pieces.length; index += 3) {
    if (pieces[index]) parts.push({ text: pieces[index] });
    if (index + 2 < pieces.length) parts.push({ text: pieces[index + 2], color: QUARTER_COLORS[pieces[index + 1]] });
  }
  return parts;
}
