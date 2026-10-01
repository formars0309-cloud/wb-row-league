// 임무카드 PNG 생성기. 데이터는 app/roster.ts 하나에서 읽는다(작전판·폰 화면과 같은 출처).
//   node cards/build.mjs            → cards/<팀>-<이름>.png 전부
//   node cards/build.mjs 기병대      → 파일 이름에 그 문자열이 들어간 카드만
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { MISSION_BRIEFS, PLAYER_SOURCE, ROLE_LABEL, SLOT_SOURCE, STAFF_ORDER, hasStaffOrder } from "../app/roster.ts";

// 다른 위치의 크롬은 CHROME_PATH로 지정한다.
const CHROME = process.env.CHROME_PATH ?? {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  win32: "C:/Program Files/Google/Chrome/Application/chrome.exe",
}[process.platform] ?? "google-chrome";
const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const ROLE = new Map(PLAYER_SOURCE);
const SLOT = new Map(SLOT_SOURCE);

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
.units-title { margin: 6px 20px 0; padding-top: 12px; border-top: 1px solid rgba(194,181,153,.2); color: var(--side); font-size: 12px; letter-spacing: .12em; }
.units { padding-top: 10px; }
.units li { grid-template-columns: 30px 1fr; align-items: center; margin-bottom: 8px; }
.units i { display: grid; place-items: center; width: 28px; height: 26px; border-radius: 4px; background: rgba(255,255,255,.08); font-size: 14px; padding: 0; }
.figure { margin: 4px 20px 10px; }
.figure img { display: block; width: 100%; border: 1px solid var(--side-line); border-radius: 4px; }
.figure figcaption { margin-top: 6px; color: #a09e97; font-size: 12.5px; line-height: 1.45; word-break: keep-all; }
footer { margin: 4px 20px 0; padding: 12px 0 16px; border-top: 1px dashed var(--side-line); font-size: 13px; line-height: 1.5; color: #a09e97; word-break: keep-all; }
`;

const html = (brief) => {
  const role = ROLE.get(brief.nickname) ?? "infantry";
  return `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
<div class="card">
  <div class="head"><b class="slot">${SLOT.get(brief.nickname) ?? "—"}</b><div class="name">${brief.nickname}<small>${brief.team}</small></div><span class="role">${brief.badge ?? ROLE_LABEL[role]} · 이안</span></div>
  ${hasStaffOrder(brief) ? "" : `<p class="staff"><b>STAFF</b>${STAFF_ORDER[role]}</p>`}
  ${brief.common ? `<section class="common">${brief.common.map(([h, p]) => `<h2>${h}</h2><p>${p}</p>`).join("")}</section>` : ""}
  ${brief.steps.length ? `<ol>${brief.steps.map(([when, what]) => `<li class="${/펫|생명석/.test(when) ? "hot" : ""}"><i>${when}</i><span>${what}</span></li>`).join("")}</ol>` : ""}
  ${brief.image ? `<figure class="figure"><img src="${pathToFileURL(join(OUT_DIR, "..", "public", brief.image.src)).href}" alt=""><figcaption>${brief.image.caption}</figcaption></figure>` : ""}
  ${brief.byUnit ? `<p class="units-title">부대 배치</p><ol class="units">${brief.units.map((unit, index) => `<li><i>${index + 1}</i><span>${unit}</span></li>`).join("")}</ol>` : ""}
  <footer>${brief.foot}</footer>
</div>`;
};

const only = process.argv[2] ?? "";
const work = mkdtempSync(join(tmpdir(), "cards-"));
for (const brief of MISSION_BRIEFS.filter((item) => item.file.includes(only))) {
  const page = join(work, `${brief.file}.html`);
  const shot = join(work, `${brief.file}.png`);
  writeFileSync(page, html(brief));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", `--user-data-dir=${join(work, "profile")}`,
    "--window-size=700,2600", `--screenshot=${shot}`, pathToFileURL(page).href], { stdio: "ignore" });
  // 맥 크롬은 스크린샷을 쓰고도 종료하지 않아, 파일이 생기면 직접 끈다.
  while (!existsSync(shot)) {
    if (chrome.exitCode !== null) throw new Error(`크롬이 스크린샷 없이 종료됐습니다: ${CHROME}`);
    await sleep(200);
  }
  await sleep(500);
  chrome.kill();
  const out = join(OUT_DIR, `${brief.file}.png`);
  // 창 높이는 넉넉히 잡고 배경만 잘라 낸 뒤 여백을 다시 두른다.
  await sharp(shot).trim({ background: "#060708" }).extend({ top: 40, bottom: 40, left: 40, right: 40, background: "#060708" }).png().toFile(out);
  console.log(out);
}
