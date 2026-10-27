// 지도 좌표: 진형 30칸, 두 지도의 진영 중심, 거점 12곳, 라인 출구, STAFF 포인트. 좌표는 지도 크기 대비 0~1.
export type MapVariant = "tactical" | "field";
export type MissionSide = "ian" | "lucia";
export type Point = { x: number; y: number };
export const MISSION_SIDE_LABEL: Record<MissionSide, string> = { ian: "이안", lucia: "루시아" };
export const MISSION_SIDES = Object.keys(MISSION_SIDE_LABEL) as MissionSide[];
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
export const STARTING_POINT_CENTER: Record<MapVariant, Record<"lucia" | "ian", Point>> = {
  tactical: { lucia: { x: .4044, y: .2294 }, ian: { x: .6265, y: .5193 } },
  field: { lucia: { x: .3793, y: .3673 }, ian: { x: .6313, y: .5973 } },
};
export const MAP_VARIANTS = Object.keys(STARTING_POINT_CENTER) as MapVariant[];
export const OBJECTIVE_META = [
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

export function clamp(value: number) { return Math.max(0.025, Math.min(0.975, value)); }
export function samePoint(a: Point, b: Point) { return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9; }
// 이안 라인 안내 이미지(output/imagegen/ian-top-bottom-staff-v4.png): 3·4번과 28·29번 사이 사선으로 15명씩 나눈다.
// 출구는 TOP이 1번 성의 1시 방향, Bottom이 25번 성의 7시 방향. 루시아는 진형과 함께 180도 돈다.
export const TOP_LINE_SLOTS = new Set([1, 2, 3, 6, 7, 8, 12, 13, 14, 19, 20, 21, 26, 27, 28]);
// 출구에서 시작한다. 지도 가로:세로(1.25:1)를 반영해 TOP은 11시 반, Bottom은 8시 방향.
const LINE_EXITS = { top: { slot: 1, x: .025, y: -.03, dx: -.032, dy: -.15 }, bottom: { slot: 25, x: -.025, y: .03, dx: -.10, dy: .0725 } };
export function lineExit(slot: number, side: MissionSide, variant: MapVariant) {
  const top = TOP_LINE_SLOTS.has(slot);
  const exit = top ? LINE_EXITS.top : LINE_EXITS.bottom;
  const base = SLOT_POINTS.get(exit.slot) ?? { x: 0, y: 0 };
  const center = STARTING_POINT_CENTER[variant][side];
  const turn = side === "ian" ? 1 : -1;
  const start = { x: center.x + (base.x + exit.x) * turn, y: center.y + (base.y + exit.y) * turn };
  return { top, start, point: { x: clamp(start.x + exit.dx * turn), y: clamp(start.y + exit.dy * turn) } };
}
// 같은 전장 라인은 상대 진형의 반대쪽 출구와 연결된다(진형은 180도 회전).
export function enemyGate(top: boolean, side: MissionSide, variant: MapVariant) {
  return lineExit(top ? 25 : 1, side === "ian" ? "lucia" : "ian", variant).start;
}
export function objectivePoint(id: string, variant: MapVariant): Point | null {
  const found = OBJECTIVE_META.find((item) => item.id === id);
  if (!found) return null;
  const point = found[variant];
  return { x: point.x / 100, y: point.y / 100 };
}
export function slotPoint(slot: number, side: MissionSide, variant: MapVariant): Point | null {
  const offset = SLOT_POINTS.get(slot);
  return offset ? formationPoint(offset, side, variant) : null;
}
export function formationPoint(offset: Point, side: MissionSide, variant: MapVariant): Point {
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
export function staffPoint(top: boolean, side: MissionSide, variant: MapVariant): Point {
  return formationPoint(STAFF_OFFSETS[top ? "top" : "bottom"], side, variant);
}
