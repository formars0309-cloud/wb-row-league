// 북쪽 기병대 3인의 임무카드를 PNG로 뽑는다. 작전판 카드와 같은 색·서체.
//   node cards/build-cavalry.mjs   → cards/기병대-<이름>.png
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const COMMON = [
  ["기마대 공통 임무", "항상 기마 5부대를 운용한다. 병력 순환이 가장 빨라야 하는 포지션이다. 갖다 박고 죽으면 집에 와서 풀병력으로 다시 갖다 박는다. 순간 화력은 기병 3명의 풀병력 15부대에서 나온다."],
  ["공통 특별 임무", "적 펫 리젠 3분 전에는 풀병력 5부대를 적 전망대 쪽으로 보낼 수 있도록 환경을 만든다. 가장 가까이 있는 적 거점 아무 곳에나 병력을 다 갖다 박고 죽어서 복귀한다."],
];
const ESCORT = (units) => [
  ["그 밖의 모든 타임", `테슬라님 집결 호위. 테슬라님 집결이 닿은 거점을 기마 ${units}부대로 스웜.`],
  ["3시 치료 획득 후", "테슬라님 담당 거점(이안 기준 3시 치료)을 아군이 얻었으면 오소리님 집결 호위로 전환. 오소리님 집결이 닿은 거점을 풀병력 기마 5부대로 스웜할 준비."],
  ["집결이 터지면", "거점에 5부대 다 갈아 넣고 유령으로 복귀. 테슬라님 집결과 다시 같이 출발할 준비. 오소리님 집결이 목표일 때도 마찬가지."],
];
const FOOT = "무잔님·오일자님·TOMAS SHELBY님은 이안 기준 북쪽 기병대입니다. 추가 오더가 필요하면 무잔님이 마이크로 통솔해 주세요.";

const CARDS = [
  { file: "무잔", slot: 1, name: "무 잔 Muzan", note: "북쪽 기병대 · 마이크로 통솔", steps: [
    ["초반", "거점 달리기에 집중."],
    ["펫 리젠 3분 전", "펫 잡을 준비."],
    ...ESCORT(5),
  ] },
  { file: "오늘은일찍자야지", slot: 13, name: "오늘은일찍자야지", note: "북쪽 기병대 · 은신 집결", steps: [
    ["시작과 동시에", "적 전망대(이안 기준 위쪽 전망대)에 은신 기병 집결. 전망대를 얻기 전까지는 계속 걸어 주세요. 필드는 4부대만 운용."],
    ["첫 스타트", "이안 기준 북쪽 라인에서 기병으로 필드쟁 지원."],
    ["펫 리젠 3분 전", "펫 잡을 준비."],
    ...ESCORT(4),
  ] },
  { file: "TOMAS-SHELBY", slot: 7, name: "TOMAS SHELBY", note: "북쪽 기병대 · 집결 탑승", steps: [
    ["상시", "오일자님 집결에 탑승. 집결이 터지면 같이 유령 부활해서 다시 집결에 탑승. 반복."],
    ["나머지 4부대", "필드 운용. 첫 스타트는 이안 기준 북쪽 라인에서 기병으로 필드쟁 지원."],
    ["펫 리젠 3분 전", "펫 잡을 준비."],
    ...ESCORT(4),
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
.role { padding: 6px 12px; border: 1px solid var(--side-line); border-radius: 3px; color: var(--side); font-size: 13px; font-weight: 800; background: rgba(0,0,0,.35); }
.staff { margin: 0; padding: 12px 20px; border-bottom: 1px solid rgba(194,181,153,.2); font-size: 14px; color: #c9c4b8; }
.staff b, h2 { color: var(--side); font-size: 12px; letter-spacing: .12em; }
.staff b { margin-right: 10px; }
.common { padding: 14px 20px 6px; border-bottom: 1px solid rgba(194,181,153,.2); }
h2 { margin: 0 0 6px; text-transform: uppercase; }
.common p { margin: 0 0 12px; font-size: 14.5px; line-height: 1.55; color: #d9d4c8; word-break: keep-all; }
ol { list-style: none; margin: 0; padding: 14px 20px 6px; }
li { display: grid; grid-template-columns: 118px 1fr; gap: 12px; margin: 0 0 11px; font-size: 15px; line-height: 1.5; word-break: keep-all; }
li i { font-style: normal; font-weight: 800; color: var(--side); font-size: 13px; padding-top: 2px; }
li.hot i { color: #ff8b6b; }
footer { margin: 4px 20px 0; padding: 12px 0 16px; border-top: 1px dashed var(--side-line); font-size: 13px; line-height: 1.5; color: #a09e97; word-break: keep-all; }
`;

const html = (card) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
<div class="card">
  <div class="head"><b class="slot">${card.slot}</b><div class="name">${card.name}<small>${card.note}</small></div><span class="role">기병 · 이안</span></div>
  <p class="staff"><b>STAFF</b>스테프 자율 사용</p>
  <section class="common">${COMMON.map(([h, p]) => `<h2>${h}</h2><p>${p}</p>`).join("")}</section>
  <ol>${card.steps.map(([when, what]) => `<li class="${when.includes("펫") ? "hot" : ""}"><i>${when}</i><span>${what}</span></li>`).join("")}</ol>
  <footer>${FOOT}</footer>
</div>`;

const work = mkdtempSync(join(tmpdir(), "cards-"));
for (const card of CARDS) {
  const page = join(work, `${card.file}.html`);
  const shot = join(work, `${card.file}.png`);
  writeFileSync(page, html(card));
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", `--user-data-dir=${join(work, "profile")}`,
    "--window-size=700,2400", `--screenshot=${shot}`, `file:///${page.replace(/\\/g, "/")}`], { stdio: "ignore" });
  const out = join(OUT_DIR, `기병대-${card.file}.png`);
  // 창 높이는 넉넉히 잡고 배경만 잘라 낸 뒤 여백을 다시 두른다.
  await sharp(shot).trim({ background: "#060708" }).extend({ top: 40, bottom: 40, left: 40, right: 40, background: "#060708" }).png().toFile(out);
  console.log(out);
}
