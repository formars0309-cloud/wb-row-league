// 팀별 임무카드를 PNG로 뽑는다. 작전판 카드와 같은 색·서체. 문안은 지휘부가 준 오더(2026-09-08) 그대로.
//   node cards/build.mjs   → cards/<팀>-<이름>.png
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const ROLE_LABEL = { infantry: "보병", cavalry: "기병", ranged: "원거리" };
const STAFF = {
  infantry: "첫 스타팅 때 각자 맡은 라인에서 STAFF 사용",
  ranged: "상대 진영에 페어리 드래곤이 처음 소환되기 전, 약속된 장소에서 STAFF 사용",
  cavalry: "스테프 자율 사용",
};

const CAVALRY_COMMON = [
  ["기마대 공통 임무", "항상 기마 5부대를 운용한다. 병력 순환이 가장 빨라야 하는 포지션이다. 갖다 박고 죽으면 집에 와서 풀병력으로 다시 갖다 박는다. 순간 화력은 기병 3명의 풀병력 15부대에서 나온다."],
  ["공통 특별 임무", "적 펫 리젠 3분 전에는 풀병력 5부대를 적 전망대 쪽으로 보낼 수 있도록 환경을 만든다. 가장 가까이 있는 적 거점 아무 곳에나 병력을 다 갖다 박고 죽어서 복귀한다."],
  ["행동 원칙", "기병대는 항상 오브젝트 위주로 행동한다. 필드 적 보병에 꼴아박지 말고, 펫이 나오면 펫에 집중. 생명석 때는 조롱말님·냥신님 두 분만. 나머지는 모두 거점 집결과 함께 살고 함께 죽는다."],
];
// 집결 호위 공통 3단계. lead = 따라붙는 집결장, next = lead가 거점을 얻은 뒤 옮겨 붙을 집결장.
const escort = ({ lead, gained, next, units, nextUnits, burn }) => [
  ["그 밖의 모든 타임", `${lead}님 집결 호위. ${lead}님 집결이 닿은 거점을 기마 ${units}부대로 스웜.`],
  [`${gained[0]}`, `${gained[1]} ${next}님 집결 호위로 전환. ${next}님 집결이 닿은 거점을 풀병력 기마 ${nextUnits}부대로 스웜할 준비.`],
  ["집결이 터지면", `거점에 ${burn}부대 다 갈아 넣고 유령으로 복귀. ${lead}님 집결과 다시 같이 출발할 준비. ${next}님 집결이 목표일 때도 마찬가지.`],
];
const NORTH = { lead: "테슬라", gained: ["3시 치료 획득 후", "테슬라님 담당 거점(이안 기준 3시 치료)을 아군이 얻었으면"], next: "오소리" };
// 남쪽 기병대의 기준 거점은 수정본(2026-09-08)대로 이안 기준 7시 축복의 전당.
const SOUTH = { lead: "진수", gained: ["7시 축복 획득 후", "진수님 담당 거점(이안 기준 7시 축복의 전당)을 아군이 얻었으면"], next: "예리" };
const FOOT_NORTH = "무잔님·오일자님·TOMAS SHELBY님은 이안 기준 북쪽 기병대입니다. 추가 오더가 필요하면 무잔님이 마이크로 통솔해 주세요.";
const FOOT_SOUTH = "조롱말님·MAHA님·마스터님·늑대장군님은 이안 기준 남쪽 기병대입니다. 추가 오더가 필요하면 조롱말님이 마이크로 통솔해 주세요.";
const FOOT_LOOKOUT = "전망대 팀 · 엘레가님 · 5000님 · 보수님";
const FOOT_RALLY = "집결장 팀 · 테슬라님 · 마법공주간달프님 · 진수님 · 예리님";

const PET = ["펫 리젠 3분 전", "펫 잡을 준비."];
const RUN = ["초반", "거점 달리기에 집중."];

const CARDS = [
  // 북쪽 기병대
  { file: "기병대-무잔", slot: 1, name: "무 잔 Muzan", role: "cavalry", note: "북쪽 기병대 · 마이크로 통솔", common: CAVALRY_COMMON, foot: FOOT_NORTH, steps: [
    RUN, PET, ...escort({ ...NORTH, units: 5, nextUnits: 5, burn: 5 }),
  ] },
  { file: "기병대-오늘은일찍자야지", slot: 7, name: "오늘은일찍자야지", role: "cavalry", note: "북쪽 기병대 · 은신 집결", common: CAVALRY_COMMON, foot: FOOT_NORTH, steps: [
    ["시작과 동시에", "적 전망대(이안 기준 위쪽 전망대)에 은신 기병 집결. 전망대를 얻기 전까지는 계속 걸어 주세요. 필드는 4부대만 운용."],
    ["첫 스타트", "이안 기준 북쪽 라인에서 기병으로 필드쟁 지원."],
    PET, ...escort({ ...NORTH, units: 4, nextUnits: 5, burn: 5 }),
  ] },
  { file: "기병대-TOMAS-SHELBY", slot: 13, name: "TOMAS SHELBY", role: "cavalry", note: "북쪽 기병대 · 집결 탑승", common: CAVALRY_COMMON, foot: FOOT_NORTH, steps: [
    ["상시", "오일자님 집결에 탑승. 집결이 터지면 같이 유령 부활해서 다시 집결에 탑승. 반복."],
    ["나머지 4부대", "필드 운용. 첫 스타트는 이안 기준 북쪽 라인에서 기병으로 필드쟁 지원."],
    PET, ...escort({ ...NORTH, units: 4, nextUnits: 5, burn: 5 }),
  ] },
  // 남쪽 기병대
  { file: "기병대-조롱말", slot: 18, name: "[WB] ᴵᴿᴼᴺ 조롱말 (HALO)", role: "cavalry", note: "남쪽 기병대 · 마이크로 통솔", common: CAVALRY_COMMON, foot: FOOT_SOUTH, steps: [
    RUN, PET,
    ["생명석 젠 1분 전", "생명석 터치 준비. 생명석 쪽에 5부대 활용."],
    ...escort({ ...SOUTH, units: 5, nextUnits: 5, burn: 5 }),
  ] },
  { file: "기병대-MAHA", slot: 19, name: "[WB] ᴵᴿᴼᴺ Maha", role: "cavalry", note: "남쪽 기병대 · 은신 집결", common: CAVALRY_COMMON, foot: FOOT_SOUTH, steps: [
    ["시작과 동시에", "적 전망대(이안 기준 아래쪽 전망대)에 은신 기병 집결. 전망대를 얻기 전까지는 계속 걸어 주세요. 필드는 4부대만 운용."],
    RUN, PET, ...escort({ ...SOUTH, units: 4, nextUnits: 4, burn: 4 }),
  ] },
  { file: "기병대-마스터", slot: 5, name: "냥 신 (마스터)", role: "cavalry", note: "남쪽 기병대 · 집결 탑승", common: CAVALRY_COMMON, foot: FOOT_SOUTH, steps: [
    ["상시", "MAHA님 집결에 탑승."],
    PET,
    ["생명석 젠 1분 전", "생명석 터치 준비. 생명석 쪽에 4부대 활용. 1부대는 계속 마하님 집결 타기."],
    ...escort({ ...SOUTH, units: 4, nextUnits: 4, burn: 4 }),
  ] },
  { file: "기병대-늑대장군", slot: 30, name: "늑대장군", role: "cavalry", note: "남쪽 기병대 · 집결 탑승", common: CAVALRY_COMMON, foot: FOOT_SOUTH, steps: [
    ["상시", "MAHA님 집결에 탑승."],
    PET, ...escort({ ...SOUTH, units: 4, nextUnits: 4, burn: 4 }),
  ] },
  // 전망대 팀
  { file: "전망대-엘레가", slot: 26, name: "[WB] ᵂᴮ Elega", role: "infantry", note: "전망대 팀 · 위쪽 전망대 주둔장", foot: FOOT_LOOKOUT, steps: [
    ["주둔장 · 1부대", "이안 기준 위쪽 전망대 주둔장."],
    ["주둔 · 1부대", "이안 기준 아래쪽 전망대 주둔."],
    ["은신 · 1부대", "이안 기준 위쪽 언덕길을 은신 보병으로 막기."],
    ["지원 · 2부대", "위쪽 라인 주유 지원. 아군 펫 타이밍 때 교전 지원."],
  ] },
  { file: "전망대-5000", slot: 27, name: "5000", role: "ranged", note: "전망대 팀 · 아래쪽 전망대 주둔장", foot: FOOT_LOOKOUT, steps: [
    ["주둔장 · 1부대", "이안 기준 아래쪽 전망대 주둔장."],
    ["주둔 · 1부대", "이안 기준 위쪽 전망대 주둔."],
    ["은신 · 1부대", "이안 기준 위쪽 언덕길을 은신 보병으로 막기."],
    ["지원 · 2부대", "위쪽 라인 주유 지원. 아군 펫 타이밍 때 교전 지원."],
  ] },
  { file: "전망대-보수", slot: 28, name: "보 수", role: "infantry", note: "전망대 팀", foot: FOOT_LOOKOUT, steps: [
    ["주둔 · 2부대", "전망대 두 곳에 주둔."],
    ["집결 탑승 · 1부대", "오일자님 기병 집결에 탑승."],
    ["은신 · 1부대", "이안 기준 아래쪽 언덕길을 은신 보병으로 막기."],
    ["지원 · 1부대", "위쪽 라인 주유 지원. 아군 펫 타이밍 때 교전 지원."],
  ] },
  // 집결장 팀
  { file: "집결장-테슬라", slot: 6, name: "[WB] ᴵᴿᴼᴺ TESLA", role: "ranged", note: "집결장 · 3시 치료의 영목 주둔장", foot: FOOT_RALLY, steps: [
    ["초반 스타트", "주둔장 페어 및 4보병 무잔님 기마에 스테프. 그 뒤 이안 기준 3시 치료 주둔 및 12시 천무전당 주유 지원. 그리고 필드 전쟁."],
    ["상시 체크", "3시 치료의 영목 병력 배치 상태를 항상 확인해서 120만 아래로 떨어지면 주유 콜. 집결이 붙지 않았을 때도 계속 체크."],
    ["서브 주둔장", "핫떠그님."],
  ] },
  { file: "집결장-마법공주간달프", slot: 2, name: "마법공주간달프", role: "infantry", note: "집결장 · 1시 천무전당", foot: FOOT_RALLY, steps: [
    ["초반 스타트", "주둔장 페어 및 4보병 무잔님 기마에 스테프. 그 뒤 이안 기준 1시 천무전당 주둔 및 북쪽 필드쟁 지원."],
    ["천무전당이 적 소유일 때", "보병 집결 + 기마 4부대 운용. 기마 4부대는 테슬라님 집결이 있으면 테슬라님 집결 호위 및 테슬라님 집결이 공격하는 거점 스웜. 테슬라님 집결과 생사를 같이한다."],
    ["테슬라님 거점 획득 후", "오소리님 본인 집결부대와 항상 생사를 같이해 주세요. 오소리님 집결이 터지면 남은 기병도 그냥 거점에 다 꼴아박고 다시 리셋. 집결 걸고 기병 4부대 출전."],
  ] },
  { file: "집결장-진수", slot: 17, name: "[WB] 진 수", role: "infantry", note: "집결장 · 7시 축복전당", foot: FOOT_RALLY, steps: [
    ["초반 스타트", "주둔장 페어 및 4보병 조롱말님 기마에 스테프. 그 뒤 이안 기준 7시 축복전당 주둔 및 남쪽 필드쟁 지원."],
    ["축복전당이 적 소유일 때", "보병 집결 + 기마 4부대 운용. 기마 4부대는 본인 집결부대와 항상 생사를 같이해 주세요. 진수님 집결이 터지면 남은 기병도 그냥 거점에 다 꼴아박고 다시 리셋. 집결 걸고 기병 4부대 출전."],
    ["축복전당 획득 후", "이안 기준 9시 치료의 영목 집결. 마찬가지로 기마 3부대를 운용해서 집결부대와 생사를 같이해 주세요."],
  ] },
  { file: "집결장-예리", slot: 11, name: "예리", role: "infantry", note: "집결장 · 6시 군왕 주둔장", foot: FOOT_RALLY, steps: [
    ["초반", "9시 치료의 영목에 집결. 진수님이 9시 치료에 집결 가능해지면 그때부터는 진수님이 집결."],
    ["주둔", "6시 군왕 주둔장. 7시 축복전당 서브 주둔장."],
    ["주유", "6시 용기 주유 및 7시 축복 주유 지원."],
  ] },
];

const CSS = `
html, body { margin: 0; background: #060708; }
body { font-family: "Segoe UI", "Malgun Gothic", "Noto Sans KR", sans-serif; color: #e7e3da; padding: 24px; }
.card { --side: #f0c463; --side-ink: #f8ead0; --side-wash: rgba(240,196,99,.12); --side-line: rgba(240,196,99,.42);
  width: 620px; border: 1px solid var(--side-line); border-radius: 6px; overflow: hidden;
  background: linear-gradient(180deg, #1d2025, #14171a); box-shadow: 0 0 0 1px rgba(0,0,0,.6), inset 0 1px rgba(255,255,255,.05); }
.head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px; padding: 16px 20px;
  border-bottom: 1px solid var(--side-line); background: linear-gradient(180deg, var(--side-wash), transparent), linear-gradient(180deg, #262a30, #1b1e22); }
.slot { display: grid; place-items: center; min-width: 40px; height: 40px; padding: 0 8px; border-radius: 4px; background: var(--side); color: #10130f; font-size: 22px; font-weight: 900; }
.name { font-size: 24px; font-weight: 800; color: var(--side-ink); letter-spacing: .01em; }
.name small { display: block; margin-top: 3px; font-size: 12px; font-weight: 600; color: #a09e97; letter-spacing: .08em; }
.role { padding: 6px 12px; border: 1px solid var(--side-line); border-radius: 3px; color: var(--side); font-size: 13px; font-weight: 800; background: rgba(0,0,0,.35); white-space: nowrap; }
.staff { margin: 0; padding: 12px 20px; border-bottom: 1px solid rgba(194,181,153,.2); font-size: 14px; color: #c9c4b8; }
.staff b, h2 { color: var(--side); font-size: 12px; letter-spacing: .12em; }
.staff b { margin-right: 10px; }
.common { padding: 14px 20px 6px; border-bottom: 1px solid rgba(194,181,153,.2); }
h2 { margin: 0 0 6px; text-transform: uppercase; }
.common p { margin: 0 0 12px; font-size: 14.5px; line-height: 1.55; color: #d9d4c8; word-break: keep-all; }
ol { list-style: none; margin: 0; padding: 14px 20px 6px; }
li { display: grid; grid-template-columns: 128px 1fr; gap: 12px; margin: 0 0 11px; font-size: 15px; line-height: 1.5; word-break: keep-all; }
li i { font-style: normal; font-weight: 800; color: var(--side); font-size: 13px; padding-top: 2px; }
li.hot i { color: #ff8b6b; }
footer { margin: 4px 20px 0; padding: 12px 0 16px; border-top: 1px dashed var(--side-line); font-size: 13px; line-height: 1.5; color: #a09e97; word-break: keep-all; }
`;

// 오더에 스테프 지시가 직접 들어 있으면 공통 STAFF 줄은 뺀다. 둘이 어긋나 보이지 않게.
const html = (card) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
<div class="card">
  <div class="head"><b class="slot">${card.slot}</b><div class="name">${card.name}<small>${card.note}</small></div><span class="role">${ROLE_LABEL[card.role]} · 이안</span></div>
  ${card.steps.some(([, what]) => what.includes("스테프")) ? "" : `<p class="staff"><b>STAFF</b>${STAFF[card.role]}</p>`}
  ${card.common ? `<section class="common">${card.common.map(([h, p]) => `<h2>${h}</h2><p>${p}</p>`).join("")}</section>` : ""}
  <ol>${card.steps.map(([when, what]) => `<li class="${/펫|생명석/.test(when) ? "hot" : ""}"><i>${when}</i><span>${what}</span></li>`).join("")}</ol>
  <footer>${card.foot}</footer>
</div>`;

const work = mkdtempSync(join(tmpdir(), "cards-"));
for (const card of CARDS) {
  const page = join(work, `${card.file}.html`);
  const shot = join(work, `${card.file}.png`);
  writeFileSync(page, html(card));
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", `--user-data-dir=${join(work, "profile")}`,
    "--window-size=700,2400", `--screenshot=${shot}`, `file:///${page.replace(/\\/g, "/")}`], { stdio: "ignore" });
  const out = join(OUT_DIR, `${card.file}.png`);
  // 창 높이는 넉넉히 잡고 배경만 잘라 낸 뒤 여백을 다시 두른다.
  await sharp(shot).trim({ background: "#060708" }).extend({ top: 40, bottom: 40, left: 40, right: 40, background: "#060708" }).png().toFile(out);
  console.log(out);
}
