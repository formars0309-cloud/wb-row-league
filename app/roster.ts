// 로스터·전투 위치 번호·임무 브리프의 단일 출처.
// 작전판(war-table.tsx)·폰 화면·PNG 카드(cards/build.mjs)가 모두 이 파일을 읽는다.
// 브리프 문안은 지휘부 오더(2026-09-08) 원문을 사람별로 정리한 것.

export type PrimaryRole = "infantry" | "cavalry" | "ranged";
export type MissionOrders = [string, string, string, string, string];
export type Brief = {
  nickname: string;
  file: string; // PNG 파일 이름 (팀-이름)
  team: string; // 카드 부제
  common?: Array<[string, string]>; // 팀 공통 문단
  steps: Array<[string, string]>; // 타임라인·조건별 지시 (라벨, 본문)
  units: MissionOrders; // 부대1~5. 지도 경로와 집결장·주둔장 배지는 이 문장에서 읽는다.
  byUnit?: boolean; // 부대별 오더인 팀은 PNG 카드에도 부대 5줄을 싣는다
  badge?: string; // 카드 우상단 배지. 비우면 병종 이름
  image?: { src: string; caption: string }; // 카드에 싣는 그림. public/ 기준 경로
  foot: string;
};

// 2026-10-01 전달 사진의 번호순 주전 30명. 길드·장식 문자는 생략한다.
// 미확인 신규 선수는 임무를 승계하지 않으며, 병종은 편집 가능한 기본 보병이다.
export const PLAYER_SOURCE: Array<[string, PrimaryRole]> = [
  ["무잔 Muzan", "cavalry"],
  ["제이", "infantry"],
  ["바르니 barunii", "ranged"],
  ["마지태", "infantry"],
  ["마스터", "cavalry"],
  ["TESLA", "infantry"],
  ["Mim Mi", "infantry"],
  ["파리스", "infantry"],
  ["마구니", "ranged"],
  ["Glen fiddich", "infantry"],
  ["예리", "infantry"],
  ["압수", "infantry"],
  ["곡곡이", "infantry"],
  ["GINSENG MAN", "infantry"],
  ["Kingsway", "infantry"],
  ["욘두 Yondu", "infantry"],
  ["진수", "infantry"],
  ["조롱말", "cavalry"],
  ["마리오", "infantry"],
  ["TOMAS SHELBY", "cavalry"],
  ["Bünker", "ranged"],
  ["불개", "infantry"],
  ["떡틸로", "infantry"],
  ["JunkHun", "infantry"],
  ["Maha", "cavalry"],
  ["Elega", "infantry"],
  ["5000", "ranged"],
  ["보수", "infantry"],
  ["햄수", "ranged"],
  ["늑대장군", "cavalry"],
];

export const SLOT_SOURCE: Array<[string, number]> = PLAYER_SOURCE.map(([nickname], index) => [nickname, index + 1]);

// 기존에 이미 사용하던 표기 차이만 이관한다. 미확인 닉네임 변경은 포함하지 않는다.
export const ROSTER_ALIASES = new Map<string, string>([
  ["무 잔 Muzan", "무잔 Muzan"],
  ["바르니", "바르니 barunii"],
  ["냥 신 (마스터)", "마스터"],
  ["[WB] ᴵᴿᴼᴺ TESLA", "TESLA"],
  ["[WB] 구너(마구니)", "마구니"],
  ["glen fiddich", "Glen fiddich"],
  ["압 수", "압수"],
  ["[WB] ᴵᴿᴼᴺ 곡곡이", "곡곡이"],
  ["욘 두 Yondu", "욘두 Yondu"],
  ["[WB] 진 수", "진수"],
  ["[WB] ᴵᴿᴼᴺ 조롱말 (HALO)", "조롱말"],
  ["벙커", "Bünker"],
  ["Junkhun", "JunkHun"],
  ["[WB] ᴵᴿᴼᴺ Maha", "Maha"],
  ["[WB] ᵂᴮ Elega", "Elega"],
  ["보 수", "보수"],
  ["햄찌", "햄수"],
]);

const CAVALRY_COMMON: Array<[string, string]> = [
  ["기마대 공통 임무", "항상 기마 5부대를 운용한다. 병력 순환이 가장 빨라야 하는 포지션이다. 갖다 박고 죽으면 집에 와서 풀병력으로 다시 갖다 박는다. 순간 화력은 기병 3명의 풀병력 15부대에서 나온다."],
  ["공통 특별 임무", "적 펫 리젠 3분 전에는 풀병력 5부대를 적 전망대 쪽으로 보낼 수 있도록 환경을 만든다. 가장 가까이 있는 적 거점 아무 곳에나 병력을 다 갖다 박고 죽어서 복귀한다."],
  ["행동 원칙", "기병대는 항상 오브젝트 위주로 행동한다. 필드 적 보병에 꼴아박지 말고, 펫이 나오면 펫에 집중. 생명석 때는 조롱말님·냥신님 두 분만. 나머지는 모두 거점 집결과 함께 살고 함께 죽는다."],
];
const BLOCKER_COMMON: Array<[string, string]> = [
  ["블로커 공통 임무", "보병 5부대를 처음부터 끝까지 운용한다. 블로커 임무를 하되 주유가 필요한 곳이 생기면 주유를 0순위로."],
];

// 집결 호위 공통 3단계. lead = 따라붙는 집결장, next = lead가 거점을 얻은 뒤 옮겨 붙을 집결장.
const escort = (lead: string, gained: [string, string], next: string, units: number, nextUnits: number, burn: number): Array<[string, string]> => [
  ["그 밖의 모든 타임", `${lead}님 집결 호위. ${lead}님 집결이 닿은 거점을 기마 ${units}부대로 스웜.`],
  [gained[0], `${gained[1]} ${next}님 집결 호위로 전환. ${next}님 집결이 닿은 거점을 풀병력 기마 ${nextUnits}부대로 스웜할 준비.`],
  ["집결이 터지면", `거점에 ${burn}부대 다 갈아 넣고 유령으로 복귀. ${lead}님 집결과 다시 같이 출발할 준비. ${next}님 집결이 목표일 때도 마찬가지.`],
];
const NORTH_GAINED: [string, string] = ["3시 치료 획득 후", "테슬라님 담당 거점(이안 기준 3시 치료)을 아군이 얻었으면"];
const SOUTH_GAINED: [string, string] = ["7시 축복 획득 후", "진수님 담당 거점(이안 기준 7시 축복의 전당)을 아군이 얻었으면"];
const north = (units: number, nextUnits: number, burn: number) => escort("테슬라", NORTH_GAINED, "1시 천무 담당 집결장(미정)", units, nextUnits, burn);
const south = (units: number, nextUnits: number, burn: number) => escort("진수", SOUTH_GAINED, "예리", units, nextUnits, burn);

const PET: [string, string] = ["펫 리젠 3분 전", "펫 잡을 준비."];
const RUN: [string, string] = ["초반", "거점 달리기에 집중."];
const CAV: MissionOrders = ["기병대", "기병대", "기병대", "기병대", "기병대"];
const INFANTRY_STEPS: Array<[string, string]> = [
  ["0순위", "채집 및 보병 5부대로 거점 주유."],
  ["여유 1부대", "쿠마+뇌관 또는 조엘 페어를 적 입구로 보내 입구 막기."],
];
const RANGED_ALWAYS: Array<[string, string]> = [
  ["경기 내내", "블링크 이속 보병 2개 + 방패 아티팩트 보병 운용 계속 (폭풍의화살 + 하엘로)."],
  ["부대 슬롯 1~2개", "생성되는 보병 집결에 탑승."],
];
const RANGED_UNITS: MissionOrders = ["블링크 이속 보병 (경기 내내)", "블링크 이속 보병 (경기 내내)", "방패 아티팩트 보병 (폭풍의화살 + 하엘로)", "생성되는 보병 집결 탑승", "생성되는 보병 집결 탑승 · 생명석 때 날법사"];
const LIFESTONE: [string, string] = ["생명석 젠 1분 전", "날법사로 생명석 쟁 지원."];

// 지휘부가 게임 화면에 표시한 블록 포인트 (2026-09-08). 검은 원이 부대를 세울 자리.
const SOUTH_BLOCK_POINTS = { src: "/cards/south-block-points.png", caption: "이안 기준 아래쪽 블록 포인트. 검은 원 자리에 부대를 세운다." };

const FOOT_NORTH ="무잔님·TOMAS SHELBY님은 이안 기준 북쪽 기병대입니다. 추가 오더가 필요하면 무잔님이 마이크로 통솔해 주세요.";
const FOOT_SOUTH = "조롱말님·MAHA님·마스터님·늑대장군님은 이안 기준 남쪽 기병대입니다. 추가 오더가 필요하면 조롱말님이 마이크로 통솔해 주세요.";
const FOOT_LOOKOUT = "전망대 팀 · 엘레가님 · 5000님 · 보수님";
const FOOT_RALLY = "집결장 팀 · 테슬라님 · 진수님 · 예리님";
const FOOT_GARRISON = "주둔장·서브 주둔장 팀 · 압수님 · Junkhun님 · glen fiddich님 · 욘두님";
const FOOT_BLOCKER = "블로커 팀 · Kingsway님";
const FOOT_INFANTRY = "보병 팀 · 곡곡이님 · 파리스님 · 불개님";
const FOOT_RANGED = "원거리 팀 (이안 기준) · 바르니님 · 마구니님 · Bunker님 · 햄수님";

export const MISSION_BRIEFS: Brief[] = [
  // ── 북쪽 기병대 ──
  { nickname: "무잔 Muzan", file: "기병대-무잔", team: "북쪽 기병대 · 마이크로 통솔", common: CAVALRY_COMMON, foot: FOOT_NORTH, units: CAV,
    steps: [RUN, PET, ...north(5, 5, 5)] },
  { nickname: "TOMAS SHELBY", file: "기병대-TOMAS-SHELBY", team: "북쪽 기병대 · 집결장 확인 필요", common: CAVALRY_COMMON, foot: FOOT_NORTH,
    units: ["북쪽 기병 집결장(미정) 집결 탑승", "기병대 (필드 운용)", "기병대 (필드 운용)", "기병대 (필드 운용)", "기병대 (필드 운용)"],
    steps: [
      ["상시", "북쪽 기병 집결장(미정) 집결에 탑승. 집결이 터지면 같이 유령 부활해서 다시 집결에 탑승. 반복."],
      ["나머지 4부대", "필드 운용. 첫 스타트는 이안 기준 북쪽 라인에서 기병으로 필드쟁 지원."],
      PET, ...north(4, 5, 5),
    ] },
  // ── 남쪽 기병대 ──
  { nickname: "조롱말", file: "기병대-조롱말", team: "남쪽 기병대 · 마이크로 통솔", common: CAVALRY_COMMON, foot: FOOT_SOUTH, units: CAV,
    steps: [RUN, PET, ["생명석 젠 1분 전", "생명석 터치 준비. 생명석 쪽에 5부대 활용."], ...south(5, 5, 5)] },
  { nickname: "Maha", file: "기병대-MAHA", team: "남쪽 기병대 · 은신 집결", common: CAVALRY_COMMON, foot: FOOT_SOUTH,
    units: ["적 아래쪽 전망대 은신 기병 집결", "기병대 (필드 운용)", "기병대 (필드 운용)", "기병대 (필드 운용)", "기병대 (필드 운용)"],
    steps: [
      ["시작과 동시에", "적 전망대(이안 기준 아래쪽 전망대)에 은신 기병 집결. 전망대를 얻기 전까지는 계속 걸어 주세요. 필드는 4부대만 운용."],
      RUN, PET, ...south(4, 4, 4),
    ] },
  { nickname: "마스터", file: "기병대-마스터", team: "남쪽 기병대 · 집결 탑승", common: CAVALRY_COMMON, foot: FOOT_SOUTH,
    units: ["MAHA님 집결 탑승", "기병대", "기병대", "기병대", "기병대"],
    steps: [
      ["상시", "MAHA님 집결에 탑승."], PET,
      ["생명석 젠 1분 전", "생명석 터치 준비. 생명석 쪽에 4부대 활용. 1부대는 계속 마하님 집결 타기."],
      ...south(4, 4, 4),
    ] },
  { nickname: "늑대장군", file: "기병대-늑대장군", team: "남쪽 기병대 · 집결 탑승", common: CAVALRY_COMMON, foot: FOOT_SOUTH,
    units: ["MAHA님 집결 탑승", "기병대", "기병대", "기병대", "기병대"],
    steps: [["상시", "MAHA님 집결에 탑승."], PET, ...south(4, 4, 4)] },
  // ── 전망대 팀 ──
  { nickname: "Elega", file: "전망대-엘레가", team: "전망대 팀 · 위쪽 전망대 주둔장", foot: FOOT_LOOKOUT, byUnit: true, steps: [],
    units: ["이안 기준 위쪽 전망대 주둔장", "이안 기준 아래쪽 전망대 주둔", "이안 기준 위쪽 언덕길 은신 보병으로 막기", "위쪽 라인 주유 지원 · 아군 펫 타이밍 교전 지원", "위쪽 라인 주유 지원 · 아군 펫 타이밍 교전 지원"] },
  { nickname: "5000", file: "전망대-5000", team: "전망대 팀 · 아래쪽 전망대 주둔장", badge: "전망대", foot: FOOT_LOOKOUT, byUnit: true, steps: [],
    units: ["이안 기준 아래쪽 전망대 주둔장", "이안 기준 위쪽 전망대 주둔", "이안 기준 위쪽 언덕길 은신 보병으로 막기", "위쪽 라인 주유 지원 · 아군 펫 타이밍 교전 지원", "위쪽 라인 주유 지원 · 아군 펫 타이밍 교전 지원"] },
  { nickname: "보수", file: "전망대-보수", team: "전망대 팀", foot: FOOT_LOOKOUT, byUnit: true, steps: [],
    units: ["전망대 주둔", "전망대 주둔", "북쪽 기병 집결장(미정) 기병 집결 탑승", "이안 기준 아래쪽 언덕길 은신 보병으로 막기", "위쪽 라인 주유 지원 · 아군 펫 타이밍 교전 지원"] },
  // ── 집결장 팀 ──
  { nickname: "TESLA", file: "집결장-테슬라", team: "집결장 · 3시 치료의 영목 주둔장", foot: FOOT_RALLY,
    units: ["3시 치료의 영목 주둔장", "3시 치료의 영목 주둔장", "12시 천무전당 주유 지원", "필드 전쟁", "필드 전쟁"],
    steps: [
      ["초반 스타트", "주둔장 페어 및 4보병 무잔님 기마에 스테프. 그 뒤 이안 기준 3시 치료 주둔 및 12시 천무전당 주유 지원. 그리고 필드 전쟁."],
      ["상시 체크", "3시 치료의 영목 병력 배치 상태를 항상 확인해서 120만 아래로 떨어지면 주유 콜. 집결이 붙지 않았을 때도 계속 체크."],
      ["서브 주둔장", "담당 미정."],
    ] },
  { nickname: "진수", file: "집결장-진수", team: "집결장 · 7시 축복전당", foot: FOOT_RALLY,
    units: ["7시 축복전당 집결장 · 주둔 · 남쪽 필드쟁 지원", "기병 · 본인 호위 · 닿은 거점 스웜", "기병 · 본인 호위 · 닿은 거점 스웜", "기병 · 본인 호위 · 닿은 거점 스웜", "기병 · 본인 호위 · 닿은 거점 스웜"],
    steps: [
      ["초반 스타트", "주둔장 페어 및 4보병 조롱말님 기마에 스테프. 그 뒤 이안 기준 7시 축복전당 주둔 및 남쪽 필드쟁 지원."],
      ["축복전당이 적 소유일 때", "보병 집결 + 기마 4부대 운용. 기마 4부대는 본인 집결부대와 항상 생사를 같이해 주세요. 진수님 집결이 터지면 남은 기병도 그냥 거점에 다 꼴아박고 다시 리셋. 집결 걸고 기병 4부대 출전."],
      ["축복전당 획득 후", "이안 기준 9시 치료의 영목 집결. 마찬가지로 기마 3부대를 운용해서 집결부대와 생사를 같이해 주세요."],
    ] },
  { nickname: "예리", file: "집결장-예리", team: "집결장 · 6시 군왕 주둔장", foot: FOOT_RALLY,
    units: ["9시 치료의 영목 집결 (초반 · 진수님 가능 시 인계)", "6시 군왕 주둔장", "7시 축복전당 서브 주둔장", "6시 용기 주유", "7시 축복 주유"],
    steps: [
      ["초반", "9시 치료의 영목에 집결. 진수님이 9시 치료에 집결 가능해지면 그때부터는 진수님이 집결."],
      ["주둔", "6시 군왕 주둔장. 7시 축복전당 서브 주둔장."],
      ["주유", "6시 용기 주유 및 7시 축복 주유 지원."],
    ] },
  // ── 주둔장·서브 주둔장 팀 ──
  { nickname: "압수", file: "주둔장-압수", team: "서브 주둔장 · 6시 군왕 · 7시 축복", foot: FOOT_GARRISON, byUnit: true,
    steps: [["첫 스타트", "조롱말님 기마부대에 전투보병 5부대 스태프 타기."]],
    units: ["6시 군왕 서브 주둔장", "7시 축복의 전당 서브 주둔장", "6시 군왕 주유", "6시 용기 주유", "7시 축복 주유"] },
  { nickname: "JunkHun", file: "주둔장-Junkhun", team: "서브 주둔장 · 6시 용기 · 7시 축복", foot: FOOT_GARRISON, byUnit: true,
    steps: [["첫 스타트", "조롱말님 기마부대에 전투보병 5부대 스태프 타기."]],
    units: ["6시 용기 서브 주둔장", "7시 축복 서브 주둔장", "6시 군왕 주유", "6시 용기 주유", "7시 축복 주유"] },
  { nickname: "Glen fiddich", file: "주둔장-glen-fiddich", team: "주둔장 · 6시 용기의 영목", foot: FOOT_GARRISON, byUnit: true,
    steps: [["첫 스타트", "조롱말님 기마부대에 전투보병 5부대 스태프 타기."]],
    units: ["6시 용기의 영목 주둔장", "7시 축복 전당 서브 주둔장", "6시 군왕 주유", "6시 용기 주유", "7시 축복 주유"] },
  { nickname: "욘두 Yondu", file: "주둔장-욘두", team: "서브 주둔장 · 7시 축복 · 6시 용기 · 6시 군왕", foot: FOOT_GARRISON, byUnit: true,
    steps: [["첫 스타트", "조롱말님 기마부대에 전투보병 5부대 스태프 타기."]],
    units: ["7시 축복의 전당 서브 주둔장", "6시 용기 서브 주둔장", "6시 군왕 서브 주둔장", "6시 용기 주유", "7시 축복 주유"] },
  // ── 블로커 팀 ──
  { nickname: "Kingsway", file: "블로커-Kingsway", team: "블로커 · 남쪽 입구", common: BLOCKER_COMMON, foot: FOOT_BLOCKER, byUnit: true, image: SOUTH_BLOCK_POINTS,
    steps: [["초반 스타트", "전투보병 5부대 조롱말님 기마에 스태프. 그 뒤 이안 기준 남쪽 필드전쟁 지원."]],
    units: ["이안 기준 남쪽 루시아 입구 막기", "이안 기준 남쪽 루시아 입구 막기", "이안 기준 남쪽 루시아 입구 막기", "적 집결 이동경로 포인트 1 막기", "적 집결 이동경로 포인트 2 막기"] },
  // ── 보병 팀 ──
  { nickname: "곡곡이", file: "보병-곡곡이", team: "보병 · 북쪽 (1시 천무 · 3시 치료)", foot: FOOT_INFANTRY, byUnit: true,
    steps: [["초반 스타트", "무잔님 기마에 5보병 스테프 (블링크 보병 2 포함)."], ...INFANTRY_STEPS],
    units: ["블링크 보병 · 1시 천무전당 주유", "블링크 보병 · 3시 치료의 영목 주유", "전투보병 · 채집 or 필드쟁", "전투보병 · 채집 or 필드쟁", "전투보병 · 채집 or 필드쟁"] },
  { nickname: "파리스", file: "보병-파리스", team: "보병 · 남쪽 (7시 축복 · 6시 용기)", foot: FOOT_INFANTRY, byUnit: true,
    steps: [["초반 스타트", "조롱말님 기마에 5보병 스테프 (블링크 보병 2 포함)."], ...INFANTRY_STEPS],
    units: ["블링크 보병 · 7시 축복의 전당 주유", "블링크 보병 · 6시 용기의 영목 주유", "전투보병 · 채집 or 필드쟁", "전투보병 · 채집 or 필드쟁", "전투보병 · 채집 or 필드쟁"] },
  { nickname: "불개", file: "보병-불개", team: "보병 · 남쪽 (7시 축복 · 6시 용기)", foot: FOOT_INFANTRY, byUnit: true,
    steps: [["초반 스타트", "조롱말님 기마에 5보병 스테프 (블링크 보병 2 포함)."], ...INFANTRY_STEPS],
    units: ["블링크 보병 · 7시 축복의 전당 주유", "블링크 보병 · 6시 용기의 영목 주유", "전투보병 · 채집 or 필드쟁", "전투보병 · 채집 or 필드쟁", "전투보병 · 채집 or 필드쟁"] },
  // ── 원거리 팀 (이안 기준) ──
  { nickname: "바르니 barunii", file: "원거리-바르니", team: "원거리 · STAFF 1번 지점", foot: FOOT_RANGED, units: RANGED_UNITS,
    steps: [...RANGED_ALWAYS, LIFESTONE, ["원거리 병종", "생명석이 젠되는 경우를 제외하고는 절대 꺼내지 않음."], ["첫 46분", "1번 지점(바르니님 성 기준 10시 방향)에서 STAFF 사용 준비."]] },
  { nickname: "마구니", file: "원거리-마구니", team: "원거리 · STAFF 2번 지점", foot: FOOT_RANGED,
    units: ["블링크 이속 보병 (경기 내내)", "블링크 이속 보병 (경기 내내)", "방패 아티팩트 보병 (폭풍의화살 + 하엘로)", "생성되는 보병 집결 탑승", "아처 · 북쪽 입구 막는 적 보병 공격"],
    steps: [...RANGED_ALWAYS, ["나머지 부대", "아처로 북쪽 입구 막는 적 보병 공격."], ["첫 46분", "2번 STAFF 지점은 새 명단 기준으로 위치 재확인 필요."]] },
  { nickname: "Bünker", file: "원거리-Bunker", team: "원거리 · STAFF 3번 지점", foot: FOOT_RANGED, units: RANGED_UNITS,
    steps: [...RANGED_ALWAYS, LIFESTONE, ["첫 46분", "3번 지점(보수님 성 4시 방향)에서 스테프 사용 준비."]] },
  { nickname: "햄수", file: "원거리-햄수", team: "원거리 · STAFF 4번 지점", foot: FOOT_RANGED, units: RANGED_UNITS,
    steps: [...RANGED_ALWAYS, LIFESTONE, ["첫 46분", "4번 지점(늑대님 성 7시 방향)에서 스테프 사용 준비."]] },
];

// 오더에 스테프 지시가 직접 들어 있으면 병종 공통 STAFF 줄은 숨긴다. 둘이 어긋나 보이지 않게.
export function hasStaffOrder(brief: Brief | undefined) {
  return !!brief && [...brief.steps.map(([, what]) => what), ...brief.units].some((text) => /스테프|스태프|STAFF/.test(text));
}
