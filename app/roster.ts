// 로스터·전투 위치 번호의 단일 출처. 작전판(war-table.tsx)이 읽는다.
// 임무 문안은 앱에 두지 않는다. 폰 화면은 구글 시트에서 읽고, 작전판 카드는 편집기로 입력한다.

export type PrimaryRole = "infantry" | "cavalry" | "ranged";
export const ROLE_LABEL: Record<PrimaryRole, string> = { infantry: "보병", cavalry: "기병", ranged: "원거리" };
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

// 2026-10-01 전달 사진의 번호순 주전 30명. 길드·장식 문자는 생략한다. 26·27번은 같은 날 사용자 요청으로 맞바꿈.
// 2026-10-04 시트 「스타팅 명단」 자리 변경을 따른다(5 마리오·6 TOMAS SHELBY·7 TESLA·12 Mim Mi·19 Elega·20 압수·27 마스터).
// 미확인 신규 선수는 임무를 승계하지 않으며, 병종은 편집 가능한 기본 보병이다.
export const PLAYER_SOURCE: Array<[string, PrimaryRole]> = [
  ["무잔 Muzan", "cavalry"],
  ["벌꿀오소리형", "infantry"],
  ["바르니 barunii", "ranged"],
  ["마지태", "infantry"],
  ["마리오", "infantry"],
  ["TOMAS SHELBY", "cavalry"],
  ["TESLA", "infantry"],
  ["파리스", "infantry"],
  ["마구니", "ranged"],
  ["Glen fiddich", "infantry"],
  ["예리", "infantry"],
  ["Mim Mi", "infantry"],
  ["곡곡이", "infantry"],
  ["GINSENG MAN", "infantry"],
  ["Kingsway", "infantry"],
  ["욘두 Yondu", "infantry"],
  ["진수", "infantry"],
  ["조롱말", "cavalry"],
  ["Elega", "infantry"],
  ["압수", "infantry"],
  ["Bünker", "ranged"],
  ["불개", "infantry"],
  ["떡틸로", "infantry"],
  ["JunkHun", "infantry"],
  ["Maha", "cavalry"],
  ["5000", "ranged"],
  ["마스터", "cavalry"],
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
  ["제이", "벌꿀오소리형"], // 2026-10-02 사용자 정정
  ["게이", "벌꿀오소리형"],
  ["오소리", "벌꿀오소리형"],
  ["보 수", "보수"],
  ["햄찌", "햄수"],
]);
