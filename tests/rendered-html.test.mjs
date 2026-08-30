import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Heinapel War Table", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ko">/i);
  assert.match(html, /<title>Heinapel War Table v0\.1<\/title>/i);
  assert.match(html, /<main class="war-shell">/i);
  assert.match(html, /PLAYER ROSTER/);
  assert.match(html, /핵심 작전 도구/);
  assert.match(html, /OPERATION TIMELINE/);
  assert.match(html, /전술 맵/);
  assert.match(html, /실전 맵/);
  assert.match(html, /생명의 반석/);
  assert.equal((html.match(/class="player-row\b/g) ?? []).length, 35);
  assert.equal((html.match(/class="lineup-badge starter"/g) ?? []).length, 31);
  assert.equal((html.match(/class="lineup-badge reserve"/g) ?? []).length, 4);
  assert.equal((html.match(/class="role-count-tile\b/g) ?? []).length, 4);
  assert.doesNotMatch(html, /class="role-summary"/);
  assert.equal((html.match(/class="capture-objective owner-neutral"/g) ?? []).length, 12);
  assert.equal((html.match(/>전망대<\/span>/g) ?? []).length, 4);
  assert.match(html, /공격 라인/);
  assert.match(html, /방어 라인/);
  assert.match(html, />집결<\/button>/);
  assert.match(html, />지우개<\/button>/);
  assert.match(html, />주전<\/button>/);
  assert.match(html, />예비<\/button>/);
  assert.match(html, />집결장<\/button>/);
  assert.match(html, />주둔장<\/button>/);
  assert.doesNotMatch(html, /PLAYER EDIT|LAYER FILTER/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps the interactive operation features and map assets wired", async () => {
  const [warTable, theme, page, layout, tacticalMap, fieldMap, socialImage] =
    await Promise.all([
      readFile(new URL("../app/war-table.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/mdt-theme.css", import.meta.url), "utf8"),
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      stat(new URL("../public/maps/heinapel-tactical-clean.png", import.meta.url)),
      stat(new URL("../public/maps/heinapel-field.png", import.meta.url)),
      stat(new URL("../public/og.png", import.meta.url)),
    ]);

  assert.match(warTable, /const STORAGE_KEY = "heinapel-war-table-v0\.3"/);
  assert.match(warTable, /const OBJECTIVE_META = \[/);
  assert.match(warTable, /\["핫떠그", "infantry"\]/);
  assert.match(warTable, /const RALLY_PLAYERS = new Set\(\["\[WB\] 진 수", "벌꿀오소리"\]\)/);
  assert.match(warTable, /const RESERVE_PLAYERS = new Set\(\["코다마", "\[WB\] 스누피Tank", "\[WB\] 이천상", "몽클"\]\)/);
  assert.match(warTable, /type LineupStatus = "starter" \| "reserve"/);
  assert.match(warTable, /const patchPlayer =/);
  assert.match(warTable, /filter\(\(player\) => player\.lineup === "starter"\)/);
  assert.match(warTable, /function UnitRoleIcon/);
  assert.match(warTable, /function EraserIcon/);
  assert.match(warTable, /function smoothPath\(points: Point\[\]\)/);
  assert.match(warTable, /onPointerMove=\{handleMapPointerMove\}/);
  assert.match(warTable, /points: Point\[\]/);
  assert.match(warTable, /current === "neutral" \? "lucia"/);
  assert.match(warTable, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(warTable, /anchor\.download = "heinapel-operation\.json"/);
  assert.match(warTable, /type MapVariant = "tactical" \| "field"/);
  assert.match(theme, /url\('\/maps\/heinapel-tactical-clean\.png'\)/);
  assert.match(theme, /url\('\/maps\/heinapel-field\.png'\)/);
  assert.match(theme, /background-size: 170% 100%/);
  assert.match(theme, /\.player-token\.is-rally/);
  assert.match(theme, /\.player-copy strong\.name-rally/);
  assert.match(theme, /\.draw-preview/);
  assert.match(theme, /content: attr\(data-tooltip\)/);
  assert.match(page, /return <WarTable \/>/);
  assert.match(layout, /title: "Heinapel War Table v0\.1"/);
  assert.ok(tacticalMap.size > 0);
  assert.ok(fieldMap.size > 0);
  assert.ok(socialImage.size > 0);
});
