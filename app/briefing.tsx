// 4강 루시아 브리핑(폰 화면·PC 카드 화면)과 S 스테프 카드.
import { useEffect, useRef, useState } from "react";
import { type MissionSide, MISSION_SIDE_LABEL, OBJECTIVE_META, clamp, TOP_LINE_SLOTS, lineExit, slotPoint } from "./map-geometry";
import { type MissionSheet, type StaffPlan, type StaffSheet, type QuarterCommon, QUARTER_COLORS, colorParts } from "./sheets";
import { type SheetState } from "./use-mission-sheets";
import { type Player } from "./operation";
import { mirrorMission, entranceBlock, swapLineNames, quarterToIan, LUCIA_LINE_NAME, missionLines, missionParts, groupUnits, buildMissionPlan, staffRoute, slotName, quarterStaffOrders, rallyLeaderSlot, staffKind } from "./missions";
import { type MissionOrders } from "./roster";

// 폰 화면: 첫 화면은 주전 30명 번호순 3열, 이름을 누르면 시트 임무를 04 작전보드형 카드로 보여 준다.
// 시트를 고치면 다음 새로고침, 앱으로 돌아올 때, 또는 30초 안에 반영된다.
export const MOBILE_PICK_KEY = "heinapel-mobile-slot";
export function MissionText({ text }: { text: string }) {
  return <>{missionParts(text).map((part, index) => part.kind ? <mark key={index} className={`hl-${part.kind}`}>{part.text}</mark> : part.text)}</>;
}
export function MissionLines({ text }: { text: string }) {
  const lines = missionLines(text);
  return lines.length > 1
    ? <ul className="board-lines">{lines.map((line, index) => <li key={index}><MissionText text={line} /></li>)}</ul>
    : <p className="board-line"><MissionText text={lines[0] ?? text} /></p>;
}
// 시트의 [초록:문구] 표기를 색 글자로 보인다.
function ColorText({ text }: { text: string }) {
  return <>{colorParts(text).map((part, index) => part.color ? <strong key={index} style={{ color: part.color }}>{part.text}</strong> : part.text)}</>;
}
const MOBILE_SLOTS = Array.from({ length: 30 }, (_, index) => index + 1);
// 공유 링크(주소#common)는 폰·PC 모두 카드 화면의 4강 공통 카드를 바로 연다.
export const COMMON_HASH = "#common";
// 공유 링크(주소#staff)는 4강 스테프 순번 화면을 바로 연다.
export const STAFF_HASH = "#staff";
// S 스테프 카드: 공통 규칙, 시작군 명단, 지정군 포인트별 순번표, 미배정. 폰 화면과 PC 창이 같이 쓴다.
function StaffBoard({ staff, side, nameOf }: { staff: SheetState<StaffSheet>; side: MissionSide; nameOf: (slot: number) => string }) {
  const plans = staff.data?.plans;
  const list = [...(plans?.values() ?? [])];
  const pointGroup = (top: boolean) => list.filter((plan) => plan.group === "point" && (plan.top ?? TOP_LINE_SLOTS.has(plan.slot)) === top)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.slot - b.slot);
  // 시작 스테프는 거점마다 탈 사람을 모아 "거점 - 닉네임들"로 보인다.
  const starts = new Map<string, StaffPlan[]>();
  list.filter((plan) => plan.group === "start").forEach((plan) => starts.set(plan.target, [...(starts.get(plan.target) ?? []), plan]));
  const groups = [{ title: "지정 스테프 · TOP 포인트 순번", items: pointGroup(true) }, { title: "지정 스테프 · BOTTOM 포인트 순번", items: pointGroup(false) }];
  const unassigned = MOBILE_SLOTS.filter((slot) => !plans?.get(slot)?.group);
  return (
    <article className="board">
      <header className="board-head"><b>S</b><strong>스테프 카드</strong><span>{MISSION_SIDE_LABEL[side]}</span></header>
      <p className="board-team">지팡이 아티 순간이동</p>
      {!staff.data ? <p className="board-empty">{staff.failed ? "스테프 표를 불러오지 못했습니다" : "스테프 표를 불러오는 중…"}</p> : <>
        {staff.data.common && <section className="board-box"><h3>공통 규칙</h3><MissionLines text={mirrorMission(staff.data.common, side)} /></section>}
        <section className="board-box"><h3>시작 스테프 · 게임 시작 직후</h3>
          {starts.size ? <ul className="staff-targets">{[...starts].map(([target, items]) => <li key={target}><b>{target ? <MissionText text={mirrorMission(target, side)} /> : "목적지 미정"}</b><span className="staff-members">{items.map((plan) => <span key={plan.slot}><i>{plan.slot}</i>{nameOf(plan.slot)}</span>)}</span></li>)}</ul>
            : <p className="board-empty">배정 없음</p>}
        </section>
        {groups.map((group) => {
          // 그룹 전원의 목적지가 같으면 줄마다 반복하지 않고 제목 아래 한 번만 쓴다.
          const shared = group.items.length > 1 && group.items.every((plan) => plan.target === group.items[0].target) ? group.items[0].target : "";
          return <section key={group.title} className="board-box"><h3>{group.title}</h3>
            {shared && <p className="board-line"><MissionText text={mirrorMission(shared, side)} /></p>}
            {group.items.length ? <ol className="board-units staff-orders">{group.items.map((plan) => <li key={plan.slot}><i>{plan.order ?? "–"}</i><span>{nameOf(plan.slot)}{!shared && plan.target && <> → <MissionText text={mirrorMission(plan.target, side)} /></>}</span><small>번호 {plan.slot}</small></li>)}</ol>
              : <p className="board-empty">배정 없음</p>}
          </section>;
        })}
        {list.some((plan) => plan.composition) && <section className="board-box staff-composition"><h3>스테프 부대구성</h3>
          <ol className="board-units">{list.filter((plan) => plan.composition).map((plan) => <li key={plan.slot}><i>{plan.slot}</i><div><b>{nameOf(plan.slot)}</b><MissionLines text={mirrorMission(plan.composition!, side)} /></div></li>)}</ol>
        </section>}
        {unassigned.length > 0 && <section className="board-box"><h3>미배정 {unassigned.length}명</h3><p>{unassigned.map((slot) => `${slot} ${nameOf(slot)}`).join(" · ")}</p></section>}
      </>}
      <p className="board-foot">{MISSION_SIDE_LABEL[side]} 진영 기준 · 지팡이 콜은 디스코드 보이스 오더</p>
    </article>
  );
}
export function StaffDialog({ staff, side, nameOf, onClose }: { staff: SheetState<StaffSheet>; side: MissionSide; nameOf: (slot: number) => string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  return <dialog ref={dialogRef} className={`staff-dialog side-${side}`} onCancel={onClose} aria-label="스테프 카드">
    <div className="staff-dialog-tools"><button type="button" className="staff-dialog-close" onClick={onClose} aria-label="스테프 카드 닫기">×</button></div>
    <StaffBoard staff={staff} side={side} nameOf={nameOf} />
  </dialog>;
}
// 4강 공통 카드: 시트에 적은 번호·내용만 그대로 보인다. 줄 나눔·강조를 더하지 않고 칸 안의 줄바꿈만 살린다.
function QuarterCommonBoard({ quarter }: { quarter: SheetState<QuarterCommon> }) {
  if (!quarter.data) return <p className="quarter-empty">{quarter.failed ? "공통 임무를 불러오지 못했습니다" : "불러오는 중…"}</p>;
  if (!quarter.data.length) return <p className="quarter-empty">임무 준비 중</p>;
  return <ol className="quarter-items">{quarter.data.map((item, index) => <li key={index}><b>{item.no}</b><p><ColorText text={item.body} /></p></li>)}</ol>;
}
// 4강 스테프 순번 화면: 「4강 스테프」 탭의 지정 순번을 탑·바텀 포인트 탭으로 나눠 보이고, 내 차례를 맨 위에 고정한다.
// 시작 스테프는 목적지별 카드. 문장은 시트 그대로.
function QuarterStaffBoard({ staff, mine, nameOf, colorOf }: { staff: SheetState<StaffSheet>; mine: number | null; nameOf: (slot: number) => string; colorOf: (slot: number) => string | undefined }) {
  const plan = mine === null ? undefined : staff.data?.plans.get(mine);
  const mineTop = plan?.group === "point" ? (plan.top ?? !TOP_LINE_SLOTS.has(plan.slot)) : null;
  const [top, setTop] = useState<boolean | null>(null);
  if (!staff.data) return <p className="quarter-empty">{staff.failed ? "스테프 표를 불러오지 못했습니다" : "불러오는 중…"}</p>;
  const orders = quarterStaffOrders(staff.data.plans);
  // 처음에는 내가 타는 포인트, 모르면 탑.
  const showTop = top ?? mineTop ?? true;
  const items = showTop ? orders.top : orders.bottom;
  const ahead = plan?.group === "point" && plan.order ? (showTop === mineTop ? items : []).filter((item) => (item.order ?? 99) < plan.order!).length : null;
  return <article className="quarter-card quarter-staff-board">
    {plan?.group && <p className="quarter-mine"><span>내 차례</span><b>{plan.group === "start" ? `시작 스테프${plan.target ? ` → ${plan.target}` : ""}` : `${LUCIA_LINE_NAME(!mineTop!)} 포인트${plan.order ? ` ${plan.order}번째` : ""}`}</b>{ahead !== null && mineTop === showTop && <small>앞에 {ahead}명</small>}</p>}
    <nav className="quarter-segments" aria-label="포인트">
      <button type="button" aria-pressed={showTop} onClick={() => setTop(true)}>탑 포인트<small>{orders.top.length}명</small></button>
      <button type="button" aria-pressed={!showTop} onClick={() => setTop(false)}>바텀 포인트<small>{orders.bottom.length}명</small></button>
    </nav>
    {items.length ? <ol className="quarter-orders">{items.map((item) => <li key={item.slot} className={item.slot === mine ? "is-mine" : undefined}><i>{item.order ?? "–"}</i><span style={{ color: colorOf(item.slot) }}>{nameOf(item.slot)}<small>{item.slot}{item.slot === mine && " · 나"}</small></span>{item.kind && <em title={item.kind}>{staffKind(item.kind)}</em>}</li>)}</ol> : <p className="quarter-empty">배정 없음</p>}
    {staff.data.common && <p className="quarter-legend">{staff.data.common}</p>}
    {orders.starts.length > 0 && <section className="quarter-section"><h2>시작 스테프 <small>게임 시작 직후 · 거점별</small></h2>
      <ul className="quarter-starts">{orders.starts.map(([target, plans]) => <li key={target}><b>{target || "목적지 미정"}</b><span>{plans.map((item) => <span key={item.slot}><i>{item.slot}</i>{nameOf(item.slot)}</span>)}</span></li>)}</ul>
    </section>}
  </article>;
}
type BriefingView = "home" | "common" | "staff";
// 폰 화면과 PC 카드 화면(onExit)은 4강 루시아 브리핑이다. 명단(내 카드 띠·공통 임무 미리보기·1~30번)·공통 임무·스테프 순번 세
// 화면을 위 탭으로 오가고, 이름을 누르면 개인 카드.
export function MobileBriefing({ players, quarter, missionSheet, staffSheet, onExit }: { players: Player[]; quarter: SheetState<QuarterCommon>; missionSheet: SheetState<MissionSheet>; staffSheet: SheetState<StaffSheet>; onExit?: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  // 마지막으로 고른 내 번호. 첫 화면 '내 카드' 띠와 순번 화면의 '내 차례'에 쓴다.
  const [mine, setMine] = useState<number | null>(null);
  const [view, setView] = useState<BriefingView>("home");
  // 저장된 선택을 읽기 전(서버 첫 화면 포함)에는 첫 화면과 카드 중 어디로 갈지 모른다.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      let saved: number | null = null;
      try {
        const slot = Number(localStorage.getItem(MOBILE_PICK_KEY));
        if (MOBILE_SLOTS.includes(slot)) saved = slot;
      } catch { /* 사생활 모드에서는 그냥 고르게 둔다. */ }
      setMine(saved);
      // 공유 링크(주소#common)는 공통 임무 화면, 주소#staff는 스테프 순번 화면, 그 외는 저장된 내 카드로 바로 간다.
      if (location.hash === STAFF_HASH) setView("staff");
      else if (location.hash === COMMON_HASH) setView("common");
      else setPicked(saved);
      setRestored(true);
    });
  }, []);
  const pick = (slot: number) => {
    setPicked(slot); setMine(slot);
    try { localStorage.setItem(MOBILE_PICK_KEY, String(slot)); } catch { /* 저장 실패는 조회를 막지 않는다. */ }
  };
  const go = (next: BriefingView) => { setPicked(null); setView(next); };
  const missions = missionSheet.data?.missions;
  const nameOf = (slot: number) => slotName(missions, players, slot);
  // 「4강 개인 임무」 색 칸(초록·빨강·파랑·주황·노랑)으로 닉네임에 색을 입힌다.
  const colorOf = (slot: number) => QUARTER_COLORS[missions?.get(slot)?.color ?? ""];
  const shell = `mobile-shell is-quarter${onExit ? " is-pc" : ""}`;
  const side: MissionSide = "lucia";
  // STAFF 한 줄 요약: 시작 스테프 또는 지정 순번·포인트. 카드 칩·내 카드 띠가 같이 쓴다.
  const staffLine = (slot: number) => {
    const plan = staffSheet.data?.plans.get(slot);
    if (!plan?.group) return "";
    if (plan.group === "start") return `시작 STAFF${plan.target ? ` → ${plan.target}` : ""}`;
    return `STAFF ${LUCIA_LINE_NAME(!(plan.top ?? !TOP_LINE_SLOTS.has(slot)))}${plan.order ? ` ${plan.order}번째` : ""}`;
  };
  const tabs: Array<[BriefingView, string]> = [["home", "명단"], ["common", "공통 임무"], ["staff", "스테프 순번"]];
  const topBar = <header className="mobile-top quarter-bar">
    <h1 className="quarter-title">4강 · 루시아</h1>
    <nav className="quarter-tabs" aria-label="화면">{tabs.map(([key, label]) => <button key={key} type="button" aria-current={view === key ? "page" : undefined} onClick={() => go(key)}>{label}</button>)}</nav>
    {onExit && <button type="button" className="mobile-exit" onClick={onExit}>작전판</button>}
  </header>;

  // 4강 세 탭이 오거나(사본 포함) 실패할 때까지는 제목과 "불러오는 중…"만 보인다. 앱 기본 명단·빈 공통 임무가
  // 먼저 보였다가 시트 내용으로 바뀌며 밀리거나, 첫 화면이 보였다가 저장된 카드로 넘어가는 것을 막는다.
  const settled = [quarter, missionSheet, staffSheet].every((tab) => tab.data !== null || tab.failed);
  if (!restored || !settled) return <div className={shell}>{topBar}<p className="quarter-empty">불러오는 중…</p></div>;

  if (picked === null && view === "staff") return (
    <div className={shell}>
      {topBar}
      {staffSheet.failed && staffSheet.data && <p className="mobile-sync" role="alert">최신 스테프 표를 불러오지 못했습니다. 마지막으로 받은 내용입니다.</p>}
      <QuarterStaffBoard staff={staffSheet} mine={mine} nameOf={nameOf} colorOf={colorOf} />
    </div>
  );

  if (picked === null && view === "common") return (
    <div className={shell}>
      {topBar}
      {quarter.failed && quarter.data && <p className="mobile-sync" role="alert">최신 공통 임무를 불러오지 못했습니다. 마지막으로 받은 내용입니다.</p>}
      <QuarterCommonBoard quarter={quarter} />
    </div>
  );

  if (picked === null) {
    const preview = quarter.data?.slice(0, 3) ?? [];
    const rest = (quarter.data?.length ?? 0) - preview.length;
    const mineMission = mine === null ? undefined : missions?.get(mine);
    return (
      <div className={shell}>
        {topBar}
        {mine !== null && <button type="button" className="quarter-mine-card" onClick={() => pick(mine)}><span>내 카드</span><b><i>{mine}</i>{nameOf(mine)}</b><small>{[mineMission?.team, staffLine(mine)].filter(Boolean).join(" · ")} ›</small></button>}
        <section className="quarter-preview">
          <h2>공통 임무 <small>{quarter.data ? `${quarter.data.length}개` : ""}</small></h2>
          {!quarter.data ? <p className="quarter-empty">{quarter.failed ? "공통 임무를 불러오지 못했습니다" : "불러오는 중…"}</p> : !quarter.data.length ? <p className="quarter-empty">임무 준비 중</p> :
            <ol className="quarter-items">{preview.map((item, index) => <li key={index}><b>{item.no}</b><p><ColorText text={item.body} /></p></li>)}</ol>}
          {rest > 0 && <button type="button" className="quarter-more" onClick={() => go("common")}>나머지 {rest}개 더 보기 ›</button>}
        </section>
        <h2 className="quarter-roster-title">명단 30명 <small>이름을 누르면 개인 임무와 STAFF 사용법</small></h2>
        <p className="quarter-legend quarter-legend-roster"><span><i style={{ background: QUARTER_COLORS.초록 }} />기병</span><span><i style={{ background: QUARTER_COLORS.빨강 }} />집결장</span><span><i style={{ background: QUARTER_COLORS.파랑 }} />주둔장·서브 주둔장</span></p>
        <ol className="mobile-roster">{MOBILE_SLOTS.map((slot) => <li key={slot}><button type="button" className={slot === mine ? "is-mine" : undefined} onClick={() => pick(slot)}><b>{slot}</b><span style={{ color: colorOf(slot) }}>{nameOf(slot)}</span></button></li>)}</ol>
      </div>
    );
  }

  // 시트 문장은 그대로 보이고, 화살표 계산에는 이안 기준으로 되돌린 문장을 넘긴다.
  const mission = missions?.get(picked);
  const units = mission?.units.some(Boolean) ? mission.units : null;
  const ready = !!mission && !!(mission.main || mission.sub || units);
  const leaders = new Map([...(missions?.values() ?? [])].map((item): [string, MissionOrders] => [item.nickname, item.units.map(quarterToIan) as MissionOrders]));
  const block = mission ? entranceBlock({ ...mission, main: quarterToIan(mission.main) }, side, "tactical") : null;
  const routes = block ? [] : buildMissionPlan(units && units.map(swapLineNames), side, "tactical", leaders).routes;
  const home = slotPoint(picked, side, "tactical");
  const line = home ? lineExit(picked, side, "tactical") : null;
  const plan = staffSheet.data?.plans.get(picked);
  const staffPath = staffRoute(plan && { ...plan, top: plan.top === null ? null : !plan.top, target: quarterToIan(plan.target) }, picked, side, "tactical", leaders);
  const staffWhen = plan?.group === "start" ? "게임 시작 직후 (시작 스테프)" : staffPath ? `지정 순번 · ${LUCIA_LINE_NAME(staffPath.top)} 포인트${plan?.order ? ` ${plan.order}번째` : ""}` : "";
  const staffCommon = staffSheet.data?.common;
  // 한눈에: 부대마다 첫 지시 한 줄. 집결 탑승은 그 집결장 카드로 가는 버튼.
  const glance = units ? units.map((text, index) => ({ unit: index + 1, text, first: missionLines(text)[0] ?? text, leader: missions ? rallyLeaderSlot(text, missions) : null })).filter((item) => item.text) : [];

  return (
    <div className={shell}>
      <header className="mobile-top">
        <button type="button" className="mobile-back" onClick={() => go("home")} aria-label="공통 임무와 명단으로 돌아가기">‹</button>
        <h1 className="quarter-card-name"><b>{picked}</b><span style={{ color: colorOf(picked) }}>{nameOf(picked)}</span></h1>
        <button type="button" className="quarter-card-staff" onClick={() => go("staff")}>순번표</button>
      </header>
      {missionSheet.failed && missionSheet.data && <p className="mobile-sync" role="alert">최신 임무를 불러오지 못했습니다. 마지막으로 받은 내용입니다.</p>}
      <article className="quarter-card">
        <p className="quarter-chips">
          {mission?.team && <span>{mission.team}</span>}
          {line && <span>{block ? `적 ${LUCIA_LINE_NAME(block.top)} 입구 차단` : `${LUCIA_LINE_NAME(line.top)} 라인`}</span>}
          {plan?.group && <span className="is-staff">{staffLine(picked)}</span>}
        </p>
        {mission?.lead && <p className="quarter-lead"><ColorText text={mission.lead} /></p>}
        {glance.length > 0 && <section className="quarter-glance"><h2>한눈에 · 부대 {glance.length}개</h2>
          <ol>{glance.map((item) => <li key={item.unit}><i>{item.unit}</i>{item.leader !== null ? <button type="button" onClick={() => pick(item.leader!)}>{item.first} <b>카드 ›</b></button> : <span>{item.first}</span>}</li>)}</ol>
        </section>}
      {home && line && <section className="quarter-section"><h2>배치 지도 · {block ? `적 ${LUCIA_LINE_NAME(block.top)} 입구 차단` : `${LUCIA_LINE_NAME(line.top)} 라인`}</h2>
        <div className="mobile-map">
          <div className="mobile-map-art" />
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label={block ? "내 자리와 적 입구 차단 위치" : "내 자리, 라인 출구와 부대 목적지"}>
            <defs>
              <marker id="mobile-head" markerWidth="9" markerHeight="9" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" /></marker>
              <marker id="block-head" viewBox="0 0 9 6" markerWidth="3" markerHeight="2.4" refX="9" refY="3" orient="auto"><path className="block-head" d="M0,0 L0,6 L9,3 z" /></marker>
              <marker id="staff-head" viewBox="0 0 9 6" markerWidth="3" markerHeight="2.4" refX="9" refY="3" orient="auto"><path className="staff-head" d="M0,0 L0,6 L9,3 z" /></marker>
              {(["top", "bottom"] as const).map((key) => <marker key={key} id={`line-head-${key}`} viewBox="0 0 9 6" markerWidth="3" markerHeight="2.4" refX="9" refY="3" orient="auto"><path className={`line-head is-${key}`} d="M0,0 L0,6 L9,3 z" /></marker>)}
            </defs>
            {routes.map((route) => <line key={route.target} x1={home.x * 1000} y1={home.y * 1000} x2={route.to.x * 1000} y2={route.to.y * 1000} markerEnd="url(#mobile-head)" />)}
            {block ? <line className="block-route" x1={home.x * 1000} y1={home.y * 1000} x2={block.point.x * 1000} y2={block.point.y * 1000} markerEnd="url(#block-head)" /> :
              <line className={`line-route ${line.top ? "is-top" : "is-bottom"}`} x1={line.start.x * 1000} y1={line.start.y * 1000} x2={line.point.x * 1000} y2={line.point.y * 1000} markerEnd={`url(#line-head-${line.top ? "top" : "bottom"})`} />}
            {staffPath?.targets.map((target) => <line key={target.key} className="staff-route" x1={staffPath.from.x * 1000} y1={staffPath.from.y * 1000} x2={target.point.x * 1000} y2={target.point.y * 1000} markerEnd="url(#staff-head)" />)}
          </svg>
          {OBJECTIVE_META.filter((objective) => !objective.id.startsWith("lookout-") || objective.id.startsWith(`lookout-${side}-`)).map((objective) => {
            // 우리 진영 전망대 두 곳만 서쪽 1·동쪽 2로 부른다.
            const lookout = objective.id.startsWith("lookout-") ? (objective.id.endsWith("west") ? "west" : "east") : null;
            return <span key={objective.id} className={`mobile-objective${lookout ? ` is-lookout-${lookout}` : ""}`} style={{ left: `${objective.tactical.x}%`, top: `${objective.tactical.y}%` }}>{lookout ? `전망대 ${lookout === "west" ? 1 : 2}` : objective.label}</span>;
          })}
          {block ? <span className="mobile-block" style={{ left: `${block.point.x * 100}%`, top: `${block.point.y * 100}%` }}>⊣<b>적 {LUCIA_LINE_NAME(block.top)} 입구 차단</b></span> :
            <span className={`mobile-line ${line.top ? "is-top" : "is-bottom"}`} style={{ left: `${clamp(line.start.x + (line.point.x - line.start.x) * 1.4) * 100}%`, top: `${clamp(line.start.y + (line.point.y - line.start.y) * 1.4) * 100}%` }}>{LUCIA_LINE_NAME(line.top)}</span>}
          {routes.map((route) => { const at = .8; return <span key={route.target} className="mobile-tag" style={{ left: `${(home.x + (route.to.x - home.x) * at) * 100}%`, top: `${(home.y + (route.to.y - home.y) * at) * 100}%` }}>{route.units.join("·")}</span>; })}
          {/* 지도가 작아 내가 쓸 STAFF 포인트만 점과 이름표로 보인다. 이름표는 진형 바깥쪽에 붙인다. */}
          {staffPath && plan?.group === "point" && <span className={`mobile-staff is-${staffPath.top ? "left" : "right"}`} style={{ left: `${staffPath.from.x * 100}%`, top: `${staffPath.from.y * 100}%` }}><b>STAFF</b></span>}
          <span className="mobile-home" style={{ left: `${home.x * 100}%`, top: `${home.y * 100}%` }}>{picked}</span>
        </div>
      </section>}
        {!missions ? <p className="quarter-empty">{missionSheet.failed ? "임무를 불러오지 못했습니다" : "불러오는 중…"}</p> : !ready ? <p className="quarter-empty">임무 준비 중</p> : <>
          {mission.main && <section className="quarter-section"><h2>메인 임무</h2><p>{mission.main}</p></section>}
          {mission.sub && <section className="quarter-section"><h2>서브 임무</h2><p>{mission.sub}</p></section>}
          {units && <section className="quarter-section"><h2>부대 배치 <small>원문</small></h2><ol className="quarter-units">{groupUnits(units).map((group) => <li key={group.from}><b>{group.from === group.to ? group.from : `${group.from}~${group.to}`}</b><p>{group.text}</p></li>)}</ol></section>}
        </>}
        {plan?.group && <section className="quarter-section quarter-staff-box"><h2>STAFF 사용</h2>
          <dl className="quarter-staff">
            <dt>언제</dt><dd className="is-when">{staffWhen}</dd>
            {plan.kind && <><dt>종류</dt><dd>{plan.kind}</dd></>}
            {plan.target && <><dt>어디로</dt><dd>{plan.target}</dd></>}
            {plan.composition && <><dt>부대구성</dt><dd>{plan.composition}</dd></>}
            {plan.method && <><dt>사용 방법</dt><dd>{plan.method}</dd></>}
            {staffCommon && <><dt>규칙</dt><dd className="is-rule">{staffCommon}</dd></>}
          </dl>
        </section>}
        <p className="quarter-foot">시트 원문 그대로 · 30초마다 갱신</p>
      </article>
    </div>
  );
}
