"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PrimaryRole = "infantry" | "cavalry" | "ranged";
type SecondaryRole = "garrison" | "rally" | "blocker";
type Tool = "select" | "moveArrow" | "attackArrow" | "defense" | "rally" | "step" | "text" | "delete";
type ObjectiveOwner = "neutral" | "lucia" | "ian";
type MapVariant = "tactical" | "field";
type Point = { x: number; y: number };
type Player = { id: number; nickname: string; primaryRole: PrimaryRole; secondaryRoles: SecondaryRole[] };
type TacticalObject = { id: string; type: Exclude<Tool, "select" | "delete">; x: number; y: number; x2?: number; y2?: number; text?: string };
type Scene = { id: string; name: string; time: string; positions: Record<string, Point>; objects: TacticalObject[]; objectiveOwners?: Record<string, ObjectiveOwner> };
type Operation = { version: 1; name: string; players: Player[]; scenes: Scene[]; activeSceneId: string; updatedAt: string };

const STORAGE_KEY = "heinapel-war-table-v0.1";
const ROLE_LABEL: Record<PrimaryRole, string> = { infantry: "보병", cavalry: "기병", ranged: "원거리" };
const SECONDARY_LABEL: Record<SecondaryRole, string> = { garrison: "주둔장", rally: "집결장", blocker: "블로커" };
const TOOL_META: Array<{ id: Tool; label: string; glyph: string; hint: string }> = [
  { id: "select", label: "선택", glyph: "⌁", hint: "말 선택·이동" },
  { id: "moveArrow", label: "이동", glyph: "↗", hint: "드래그로 이동선" },
  { id: "attackArrow", label: "공격", glyph: "➤", hint: "드래그로 공격선" },
  { id: "defense", label: "방어구역", glyph: "▧", hint: "드래그로 범위" },
  { id: "rally", label: "집결", glyph: "◉", hint: "클릭해 집결점" },
  { id: "step", label: "스테프", glyph: "✦", hint: "클릭해 스테프" },
  { id: "text", label: "텍스트", glyph: "T", hint: "클릭해 메모" },
  { id: "delete", label: "삭제", glyph: "×", hint: "오브젝트 클릭" },
];
const PLAYER_SOURCE: Array<[string, PrimaryRole]> = [
  ["[WB] ᵂᴮ Elega", "infantry"], ["glen fiddich", "infantry"], ["늑대장군", "infantry"], ["바르니", "ranged"],
  ["대장군 뽀로링", "infantry"], ["예리", "infantry"], ["냥 신 (마스터)", "cavalry"], ["[WB] ᴵᴿᴼᴺ 곡곡이", "ranged"],
  ["벙커", "ranged"], ["햄찌", "ranged"], ["[WB] 구너(마구니)", "ranged"], ["[WB] ᴵᴿᴼᴺ Maha", "cavalry"],
  ["무 잔 Muzan", "cavalry"], ["서틸로", "infantry"], ["최산수", "ranged"], ["오늘은일찍자야지", "cavalry"],
  ["[WB] 진 수", "infantry"], ["SIGH", "ranged"], ["[WB] 이천상", "ranged"], ["[WB] 스누피Tank", "infantry"],
  ["[WB] ᴵᴿᴼᴺ TESLA", "ranged"], ["THOR", "ranged"], ["욘 두 Yondu", "infantry"], ["5000", "ranged"],
  ["코다마", "infantry"], ["핫떠그", "cavalry"], ["Kingsway", "ranged"], ["불개", "ranged"],
  ["벌꿀오소리", "infantry"], ["Junkhun", "infantry"],
];
const INITIAL_PLAYERS: Player[] = PLAYER_SOURCE.map(([nickname, primaryRole], index) => ({ id: index + 1, nickname, primaryRole, secondaryRoles: [] }));
const SCENE_TIMES = ["60:00", "55:00", "52:00", "46:00", "42:00"];
const OBJECTIVE_META = [
  { id: "northwest", label: "북서 거점", tactical: { x: 28, y: 39 }, field: { x: 33, y: 54 } },
  { id: "north", label: "북부 거점", tactical: { x: 57, y: 9 }, field: { x: 57, y: 16 } },
  { id: "north-center", label: "북중앙 거점", tactical: { x: 53, y: 21 }, field: { x: 53, y: 27 } },
  { id: "east", label: "동부 거점", tactical: { x: 77, y: 38 }, field: { x: 68, y: 40 } },
  { id: "west", label: "서부 거점", tactical: { x: 25, y: 63 }, field: { x: 34, y: 75 } },
  { id: "west-south", label: "서남 외곽 거점", tactical: { x: 43, y: 70 }, field: { x: 43, y: 82 } },
  { id: "southwest", label: "남서 거점", tactical: { x: 22, y: 65 }, field: { x: 47, y: 69 } },
  { id: "southeast", label: "남동 거점", tactical: { x: 80, y: 59 }, field: { x: 68, y: 74 } },
  { id: "south", label: "남부 거점", tactical: { x: 71, y: 62 }, field: { x: 61, y: 76 } },
] as const;

function freshOperation(): Operation {
  const sceneId = "scene-1";
  return { version: 1, name: "WB 헤이나펄 리그 2기", players: INITIAL_PLAYERS, scenes: [{ id: sceneId, name: "START", time: "60:00", positions: {}, objects: [] }], activeSceneId: sceneId, updatedAt: new Date().toISOString() };
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function clamp(value: number) { return Math.max(0.025, Math.min(0.975, value)); }
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function RolePill({ role }: { role: PrimaryRole }) { return <span className={`role-pill role-${role}`}>{ROLE_LABEL[role]}</span>; }

export default function WarTable() {
  const [operation, setOperation] = useState<Operation>(freshOperation);
  const [ready, setReady] = useState(false);
  const [editingId, setEditingId] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [textDraft, setTextDraft] = useState("작전 메모");
  const [roleFilter, setRoleFilter] = useState<"all" | PrimaryRole>("all");
  const [layers, setLayers] = useState({ players: true, arrows: true, zones: true, markers: true, text: true });
  const [mapVariant, setMapVariant] = useState<MapVariant>("tactical");
  const [mapFocus, setMapFocus] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const mapRef = useRef<HTMLElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const pastRef = useRef<Operation[]>([]);
  const futureRef = useRef<Operation[]>([]);
  const dragRef = useRef<null | { startClient: Point; sceneId: string; initial: Record<string, Point> }>(null);

  const scene = operation.scenes.find((item) => item.id === operation.activeSceneId) ?? operation.scenes[0];
  const editing = operation.players.find((player) => player.id === editingId) ?? operation.players[0];
  const counts = useMemo(() => ({
    infantry: operation.players.filter((p) => p.primaryRole === "infantry").length,
    cavalry: operation.players.filter((p) => p.primaryRole === "cavalry").length,
    ranged: operation.players.filter((p) => p.primaryRole === "ranged").length,
  }), [operation.players]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Operation;
          if (saved.version === 1 && saved.players?.length === 30 && saved.scenes?.length) setOperation(saved);
        }
      } catch { localStorage.removeItem(STORAGE_KEY); }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(operation));
  }, [operation, ready]);

  const commit = (updater: (current: Operation) => Operation) => {
    setCanUndo(true);
    setCanRedo(false);
    setOperation((current) => {
      pastRef.current = [...pastRef.current.slice(-59), clone(current)];
      futureRef.current = [];
      const next = updater(clone(current));
      next.updatedAt = new Date().toISOString();
      return next;
    });
  };
  const checkpoint = () => { pastRef.current = [...pastRef.current.slice(-59), clone(operation)]; futureRef.current = []; setCanUndo(true); setCanRedo(false); };
  const undo = () => {
    const previous = pastRef.current.pop(); if (!previous) return;
    futureRef.current.push(clone(operation)); setOperation(previous); setSelectedIds([]); setCanUndo(pastRef.current.length > 0); setCanRedo(true);
  };
  const redo = () => {
    const next = futureRef.current.pop(); if (!next) return;
    pastRef.current.push(clone(operation)); setOperation(next); setSelectedIds([]); setCanUndo(true); setCanRedo(futureRef.current.length > 0);
  };
  const patchPlayer = (id: number, patch: Partial<Player>) => commit((draft) => {
    draft.players = draft.players.map((player) => player.id === id ? { ...player, ...patch } : player); return draft;
  });
  const updateScene = (sceneId: string, updater: (target: Scene) => void) => commit((draft) => {
    const target = draft.scenes.find((item) => item.id === sceneId); if (target) updater(target); return draft;
  });
  const pointFromClient = (clientX: number, clientY: number): Point => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return { x: .5, y: .5 };
    return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) };
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = dragRef.current; const rect = mapRef.current?.getBoundingClientRect(); if (!active || !rect) return;
      const dx = (event.clientX - active.startClient.x) / rect.width; const dy = (event.clientY - active.startClient.y) / rect.height;
      setOperation((current) => ({ ...current, scenes: current.scenes.map((item) => item.id !== active.sceneId ? item : {
        ...item, positions: { ...item.positions, ...Object.fromEntries(Object.entries(active.initial).map(([id, pos]) => [id, { x: clamp(pos.x + dx), y: clamp(pos.y + dy) }])) },
      }) }));
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  const handleTokenPointerDown = (event: React.PointerEvent, playerId: number) => {
    event.stopPropagation();
    if (tool === "delete") { updateScene(scene.id, (target) => { delete target.positions[String(playerId)]; }); setSelectedIds((ids) => ids.filter((id) => id !== playerId)); return; }
    if (tool !== "select") return;
    if (event.ctrlKey || event.metaKey) { setSelectedIds((ids) => ids.includes(playerId) ? ids.filter((id) => id !== playerId) : [...ids, playerId]); return; }
    const moving = selectedIds.includes(playerId) ? selectedIds : [playerId];
    setSelectedIds(moving); setEditingId(playerId); checkpoint();
    dragRef.current = { startClient: { x: event.clientX, y: event.clientY }, sceneId: scene.id, initial: Object.fromEntries(moving.filter((id) => scene.positions[String(id)]).map((id) => [String(id), { ...scene.positions[String(id)] }])) };
  };
  const handleRosterDrag = (event: React.DragEvent, playerId: number) => { event.dataTransfer.setData("text/player-id", String(playerId)); event.dataTransfer.effectAllowed = "move"; };
  const handleMapDrop = (event: React.DragEvent) => {
    event.preventDefault(); const playerId = Number(event.dataTransfer.getData("text/player-id")); if (!playerId) return;
    const point = pointFromClient(event.clientX, event.clientY);
    updateScene(scene.id, (target) => { target.positions[String(playerId)] = point; }); setSelectedIds([playerId]); setEditingId(playerId); setTool("select");
  };
  const handleMapPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest(".player-token,.tactical-object,.capture-objective,.map-toolbar")) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (tool === "select") {
      const unplaced = selectedIds.length === 1 && !scene.positions[String(selectedIds[0])];
      if (unplaced) updateScene(scene.id, (target) => { target.positions[String(selectedIds[0])] = point; });
      else setSelectedIds([]);
      return;
    }
    if (["moveArrow", "attackArrow", "defense"].includes(tool)) { setDrawStart(point); return; }
    if (["rally", "step", "text"].includes(tool)) {
      const object: TacticalObject = { id: uid(tool), type: tool as "rally" | "step" | "text", ...point, text: tool === "text" ? textDraft.trim() || "작전 메모" : undefined };
      updateScene(scene.id, (target) => { target.objects.push(object); });
    }
  };
  const handleMapPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!drawStart || !["moveArrow", "attackArrow", "defense"].includes(tool)) return;
    const end = pointFromClient(event.clientX, event.clientY);
    if (Math.hypot(end.x - drawStart.x, end.y - drawStart.y) > .015) {
      const object: TacticalObject = { id: uid(tool), type: tool as "moveArrow" | "attackArrow" | "defense", ...drawStart, x2: end.x, y2: end.y };
      updateScene(scene.id, (target) => { target.objects.push(object); });
    }
    setDrawStart(null);
  };
  const deleteObject = (objectId: string) => { if (tool !== "delete") return; updateScene(scene.id, (target) => { target.objects = target.objects.filter((object) => object.id !== objectId); }); };
  const cycleObjective = (objectiveId: string) => updateScene(scene.id, (target) => {
    const current = target.objectiveOwners?.[objectiveId] ?? "neutral";
    const next: ObjectiveOwner = current === "neutral" ? "lucia" : current === "lucia" ? "ian" : "neutral";
    target.objectiveOwners = { ...target.objectiveOwners, [objectiveId]: next };
  });

  const cloneScene = () => commit((draft) => {
    const source = draft.scenes.find((item) => item.id === draft.activeSceneId) ?? draft.scenes[0];
    const id = uid("scene"); const index = draft.scenes.length; const time = SCENE_TIMES[index] ?? `T+${String(index).padStart(2, "0")}`;
    const next = { ...clone(source), id, name: index < SCENE_TIMES.length ? ["START", "루브라이트", "포탈", "페어리 드래곤", "생명석"][index] : `SCENE ${String(index + 1).padStart(2, "0")}`, time };
    draft.scenes.push(next); draft.activeSceneId = id; return draft;
  });
  const switchScene = (sceneId: string) => { setOperation((current) => ({ ...current, activeSceneId: sceneId })); setSelectedIds([]); };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(operation, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "heinapel-operation.json"; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const importJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const parsed = JSON.parse(await file.text()) as Operation; if (parsed.version !== 1 || parsed.players?.length !== 30 || !parsed.scenes?.length) throw new Error(); checkpoint(); setOperation(parsed); setSelectedIds([]); }
    catch { window.alert("Heinapel War Table v0.1 JSON 파일이 아닙니다."); }
    event.target.value = "";
  };
  const resetOperation = () => { if (!window.confirm("현재 작전 데이터를 초기화할까요?")) return; checkpoint(); setOperation(freshOperation()); setSelectedIds([]); };

  const toggleSecondary = (role: SecondaryRole) => patchPlayer(editing.id, { secondaryRoles: editing.secondaryRoles.includes(role) ? editing.secondaryRoles.filter((item) => item !== role) : [...editing.secondaryRoles, role] });
  const placedCount = Object.keys(scene.positions).length;
  const visibleObjects = scene.objects.filter((object) => object.type === "moveArrow" || object.type === "attackArrow" ? layers.arrows : object.type === "defense" ? layers.zones : object.type === "text" ? layers.text : layers.markers);
  const stepObjects = visibleObjects.filter((object) => object.type === "step");
  const objectiveCounts = OBJECTIVE_META.reduce((counts, objective) => {
    counts[scene.objectiveOwners?.[objective.id] ?? "neutral"] += 1;
    return counts;
  }, { neutral: 0, lucia: 0, ian: 0 } as Record<ObjectiveOwner, number>);

  return (
    <main className={`war-shell ${mapFocus ? "map-focus" : ""}`}>
      <header className="topbar">
        <div className="brand-block"><span className="brand-mark">H</span><div><h1>HEINAPEL <span>WAR TABLE</span></h1><input aria-label="작전명" value={operation.name} onChange={(event) => commit((draft) => { draft.name = event.target.value; return draft; })} /></div></div>
        <div className="battle-clock"><span>{scene.name}</span><strong>{scene.time} · {placedCount}/30 DEPLOYED</strong></div>
        <div className="header-actions">
          <button type="button" onClick={undo} disabled={!canUndo} title="실행 취소">↶</button><button type="button" onClick={redo} disabled={!canRedo} title="다시 실행">↷</button>
          <button type="button" onClick={exportJson}>JSON ↓</button><button type="button" onClick={() => importRef.current?.click()}>JSON ↑</button><input ref={importRef} className="visually-hidden" type="file" accept="application/json" onChange={importJson} />
          <span className="status-chip"><i /> SAVED {ready ? new Date(operation.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="roster-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">BLUE FORCE</span><h2>PLAYER ROSTER</h2></div><span className="count-badge">30 / 30</span></div>
          <div className="roster-controls">
            <div className="role-summary"><span className="dot infantry" /> {counts.infantry}<span className="dot cavalry" /> {counts.cavalry}<span className="dot ranged" /> {counts.ranged}</div>
            <select aria-label="역할 필터" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | PrimaryRole)}><option value="all">전체 역할</option><option value="infantry">보병</option><option value="cavalry">기병</option><option value="ranged">원거리</option></select>
          </div>
          <div className="roster-list" aria-label="30명 플레이어 명단">
            {operation.players.filter((player) => roleFilter === "all" || player.primaryRole === roleFilter).map((player) => (
              <button draggable type="button" key={player.id} className={`player-row ${editingId === player.id ? "is-active" : ""} ${scene.positions[String(player.id)] ? "is-placed" : ""}`} onDragStart={(event) => handleRosterDrag(event, player.id)} onClick={() => { setEditingId(player.id); if (!scene.positions[String(player.id)]) setSelectedIds([player.id]); }}>
                <span className="player-num">{String(player.id).padStart(2, "0")}</span><span className="player-copy"><strong>{player.nickname}</strong><RolePill role={player.primaryRole} /></span><span className="edit-glyph">{scene.positions[String(player.id)] ? "●" : "⋮⋮"}</span>
              </button>
            ))}
          </div>
        </aside>

        <section ref={mapRef} className={`map-panel map-${mapVariant} tool-${tool}`} aria-label="헤이나펄 전장 작전판" onDragOver={(event) => event.preventDefault()} onDrop={handleMapDrop} onPointerDown={handleMapPointerDown} onPointerUp={handleMapPointerUp}>
          <div className="map-image-layer" /><div className="map-grid-lines" />
          <div className="map-toolbar" onPointerDown={(event) => event.stopPropagation()}>
            <div className="map-switcher" aria-label="지도 선택"><button type="button" className={mapVariant === "tactical" ? "active" : ""} onClick={() => setMapVariant("tactical")}>전술 맵</button><button type="button" className={mapVariant === "field" ? "active" : ""} onClick={() => setMapVariant("field")}>실전 맵</button></div>
            <div className="map-toolbar-stats"><span>배치 <b>{placedCount}/30</b></span><span>중립 <b>{objectiveCounts.neutral}</b></span><span className="stat-lucia">루시아 <b>{objectiveCounts.lucia}</b></span><span className="stat-ian">이안 <b>{objectiveCounts.ian}</b></span></div>
            <button type="button" className="panel-toggle" onClick={() => setMapFocus((current) => !current)}>{mapFocus ? "편집 패널 열기" : "지도 크게 보기"}</button>
          </div>
          <div className="home-zone home-lucia"><span>루시아팀 본진 · 30 CASTLES</span></div><div className="home-zone home-ian"><span>이안팀 본진 · 30 CASTLES</span></div>
          <div className="lifestone-anchor" aria-label="생명의 반석, 생명석 스폰 지점"><span>◆</span><strong>생명의 반석</strong><small>생명석 스폰</small></div>
          {OBJECTIVE_META.map((objective, index) => { const owner = scene.objectiveOwners?.[objective.id] ?? "neutral"; const point = objective[mapVariant]; return <button type="button" key={objective.id} className={`capture-objective owner-${owner}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => cycleObjective(objective.id)} aria-label={`${objective.label}: ${owner === "neutral" ? "중립" : owner === "lucia" ? "루시아팀" : "이안팀"}`} title={`${objective.label} · 클릭하여 점령 상태 변경`}><b>{String(index + 1).padStart(2, "0")}</b><span>{objective.label}</span></button>; })}
          <svg className="tactical-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="전술 오브젝트 레이어">
            <defs><marker id="move-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#55cfff" /></marker><marker id="attack-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#ff5353" /></marker></defs>
            {visibleObjects.filter((object) => ["moveArrow", "attackArrow", "defense"].includes(object.type)).map((object) => object.type === "defense" ? <rect key={object.id} className="tactical-object defense-zone" onClick={() => deleteObject(object.id)} x={Math.min(object.x, object.x2 ?? object.x) * 1000} y={Math.min(object.y, object.y2 ?? object.y) * 1000} width={Math.abs((object.x2 ?? object.x) - object.x) * 1000} height={Math.abs((object.y2 ?? object.y) - object.y) * 1000} /> : <line key={object.id} className={`tactical-object arrow-${object.type}`} onClick={() => deleteObject(object.id)} x1={object.x * 1000} y1={object.y * 1000} x2={(object.x2 ?? object.x) * 1000} y2={(object.y2 ?? object.y) * 1000} markerEnd={`url(#${object.type === "moveArrow" ? "move-head" : "attack-head"})`} />)}
          </svg>
          {visibleObjects.filter((object) => ["rally", "step", "text"].includes(object.type)).map((object) => <button type="button" key={object.id} className={`tactical-object map-marker marker-${object.type}`} style={{ left: `${object.x * 100}%`, top: `${object.y * 100}%` }} onClick={() => deleteObject(object.id)}><span>{object.type === "rally" ? "R" : object.type === "step" ? `S${stepObjects.findIndex((item) => item.id === object.id) + 1}` : object.text}</span></button>)}
          {layers.players && operation.players.filter((player) => scene.positions[String(player.id)] && (roleFilter === "all" || player.primaryRole === roleFilter)).map((player) => { const pos = scene.positions[String(player.id)]; return <button type="button" key={player.id} className={`player-token role-${player.primaryRole} ${selectedIds.includes(player.id) ? "selected" : ""}`} style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }} onPointerDown={(event) => handleTokenPointerDown(event, player.id)} aria-label={`${player.nickname} ${ROLE_LABEL[player.primaryRole]} 말`}><span className="token-num">{String(player.id).padStart(2, "0")}</span><span className="token-copy"><strong>{player.nickname}</strong><small>{ROLE_LABEL[player.primaryRole]}{player.secondaryRoles.length ? ` · ${player.secondaryRoles.map((role) => SECONDARY_LABEL[role]).join("/")}` : ""}</small></span></button>; })}
          <div className="map-note"><span>{mapVariant === "tactical" ? "TACTICAL OVERVIEW" : "FIELD REFERENCE"}</span><strong>{mapVariant === "tactical" ? "헤이나펄 전술 맵" : "헤이나펄 실전 지형"}</strong><small>{TOOL_META.find((item) => item.id === tool)?.hint}</small></div><div className="map-coordinates"><span>GRID A-01</span><span>생명의 반석 기준 작전도</span><span>GRID H-09</span></div>
        </section>

        <aside className="inspector-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">TACTICAL CONTROL</span><h2>WAR TOOLS</h2></div><span className="count-badge">{scene.objects.length} OBJ</span></div>
          <div className="tool-grid">{TOOL_META.map((item) => <button type="button" key={item.id} className={tool === item.id ? "active" : ""} onClick={() => setTool(item.id)} title={item.hint}><span>{item.glyph}</span>{item.label}</button>)}</div>
          {tool === "text" && <><label className="field-label" htmlFor="text-draft">텍스트 내용</label><input id="text-draft" className="text-input" value={textDraft} onChange={(event) => setTextDraft(event.target.value)} maxLength={40} /></>}
          <div className="section-rule" /><div className="sub-heading"><span>PLAYER EDIT</span><b>#{String(editing.id).padStart(2, "0")}</b></div>
          <label className="field-label" htmlFor="nickname">닉네임</label><input id="nickname" className="text-input" value={editing.nickname} maxLength={28} onChange={(event) => patchPlayer(editing.id, { nickname: event.target.value })} />
          <div className="role-options compact">{(Object.keys(ROLE_LABEL) as PrimaryRole[]).map((role) => <button type="button" key={role} className={`role-option role-${role} ${editing.primaryRole === role ? "selected" : ""}`} onClick={() => patchPlayer(editing.id, { primaryRole: role })}><span>{role === "infantry" ? "▣" : role === "cavalry" ? "◆" : "◎"}</span>{ROLE_LABEL[role]}</button>)}</div>
          <div className="secondary-options">{(Object.keys(SECONDARY_LABEL) as SecondaryRole[]).map((role) => <label key={role} className={editing.secondaryRoles.includes(role) ? "checked" : ""}><input type="checkbox" checked={editing.secondaryRoles.includes(role)} onChange={() => toggleSecondary(role)} /><span>{SECONDARY_LABEL[role]}</span></label>)}</div>
          <div className="section-rule" /><div className="sub-heading"><span>LAYER FILTER</span><b>{visibleObjects.length}</b></div>
          <div className="objective-legend"><span className="owner-neutral">중립 {objectiveCounts.neutral}</span><span className="owner-lucia">루시아 {objectiveCounts.lucia}</span><span className="owner-ian">이안 {objectiveCounts.ian}</span><small>지도 거점을 클릭해 점령 상태를 변경하세요.</small></div>
          <div className="layer-list">{(Object.keys(layers) as Array<keyof typeof layers>).map((layer) => <label key={layer}><input type="checkbox" checked={layers[layer]} onChange={() => setLayers((current) => ({ ...current, [layer]: !current[layer] }))} /><span>{({ players: "플레이어", arrows: "화살표", zones: "방어구역", markers: "집결·스테프", text: "텍스트" })[layer]}</span></label>)}</div>
        </aside>
      </section>

      <footer className="timeline-shell">
        <div className="timeline-title"><span>OPERATION TIMELINE</span><strong>{operation.scenes.length} SCENES · AUTO SAVE</strong></div>
        <div className="scene-strip">{operation.scenes.map((item, index) => <button type="button" key={item.id} className={item.id === scene.id ? "active" : ""} onClick={() => switchScene(item.id)}><i>{String(index + 1).padStart(2, "0")}</i><span><b>{item.time}</b><small>{item.name}</small></span></button>)}<button type="button" className="clone-scene" onClick={cloneScene}><i>＋</i><span><b>SCENE 복제</b><small>현재 배치에서 생성</small></span></button></div>
        <div className="footer-actions"><button type="button" onClick={resetOperation}>초기화</button><span>PHASE 6 · READY</span></div>
      </footer>
      <div className="desktop-only">이 작전판은 1180px 이상의 PC 화면에 최적화되어 있습니다.</div>
    </main>
  );
}
