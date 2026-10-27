"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type MapVariant, type MissionSide, type Point, MISSION_SIDE_LABEL, MISSION_SIDES, STARTING_POINT_CENTER, OBJECTIVE_META, clamp, slotPoint, formationPoint } from "./map-geometry";
import { useMissionSheets } from "./use-mission-sheets";
import { type ObjectiveOwner, type MissionCard, type FairyDragonPosition, type Player, type TacticalObject, type Scene, type Operation, STORAGE_KEY, SECONDARY_LABEL, freshOperation, clone, playerSlot, readOperation, newPlayer } from "./operation";
import { mirrorMission, sheetMissionForPlayer, shownName, staffLabel, missionEmphasis, missionsByNickname, missionView, editablePlayer, slotName } from "./missions";
import { MOBILE_PICK_KEY, MissionText, MissionLines, COMMON_HASH, StaffDialog, MobileBriefing } from "./briefing";
import { PlayerEditor } from "./player-editor";
import { ROLE_LABEL, type PrimaryRole } from "./roster";
import { useOperationHistory } from "./operation-history";

type Tool = "select" | "attackArrow" | "defense" | "rally" | "memo" | "delete";
type SceneDraft = { id: string; name: string; time: string; fairyDragon: string; lifeStone: string; fairyDragonPosition: FairyDragonPosition };
// 도구 버튼은 누르면 그 도구를 켠다(다시 눌러도 꺼지지 않음). 라인을 이어 그으려고 다시 눌러도 유지되고, 끄려면 '선택'을 누른다.
const TOOL_META: Array<{ id: Tool; label: string; glyph: string; hint: string }> = [
  { id: "select", label: "선택", glyph: "↖", hint: "말·메모·카드 드래그로 이동 · 거점 클릭으로 점령 변경" },
  { id: "attackArrow", label: "공격 라인", glyph: "➤", hint: "드래그로 공격 라인 · Shift+드래그로 방어 라인" },
  { id: "defense", label: "방어 라인", glyph: "╱", hint: "드래그로 방어 라인 · Shift+드래그로 공격 라인" },
  { id: "rally", label: "집결", glyph: "⚔", hint: "클릭해 집결 지점 표시" },
  { id: "memo", label: "메모", glyph: "▤", hint: "드래그로 영역을 잡고 메모를 입력" },
  { id: "delete", label: "지우개", glyph: "", hint: "지울 오브젝트를 클릭" },
];
const MEMO_MIN_SIZE = { width: .11, height: .075 };
// 카드는 내용 길이에 따라 높이가 달라져, 맵 밖으로 나가지 않게 넉넉한 공칭 크기로만 잡아 둔다.
const MISSION_CARD_SIZE = { width: .45, height: .36 };
const SCENE_TIMES = ["60:00", "55:00", "52:00", "46:00", "42:00"];
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function smoothPath(points: Point[]) {
  if (points.length < 2) return "";
  const scaled = points.map((point) => ({ x: point.x * 1000, y: point.y * 1000 }));
  let path = `M ${scaled[0].x} ${scaled[0].y}`;
  for (let index = 1; index < scaled.length - 1; index += 1) {
    const current = scaled[index];
    const next = scaled[index + 1];
    path += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  const last = scaled[scaled.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}
function fitAxis(value: number, size: number) { return Math.min(Math.max(.01, value), .99 - size); }
function memoRect(start: Point, end: Point) {
  const width = Math.min(Math.max(Math.abs(end.x - start.x), MEMO_MIN_SIZE.width), .98);
  const height = Math.min(Math.max(Math.abs(end.y - start.y), MEMO_MIN_SIZE.height), .98);
  return { left: fitAxis(Math.min(start.x, end.x), width), top: fitAxis(Math.min(start.y, end.y), height), width, height };
}
function memoSpan(object: TacticalObject) { return { width: Math.abs((object.x2 ?? object.x) - object.x), height: Math.abs((object.y2 ?? object.y) - object.y) }; }
function playerNameClass(player: Player) {
  if (player.secondaryRoles.includes("rally")) return "name-rally";
  if (player.secondaryRoles.includes("garrison")) return "name-garrison";
  return `name-${player.primaryRole}`;
}

function UnitRoleIcon({ unitRole, isRally = false }: { unitRole: PrimaryRole; isRally?: boolean }) {
  return (
    <svg className={`unit-role-icon ${isRally ? "rally-unit-icon" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      {isRally ? <><path d="M3 2h4l6.1 6.1-3 3L4 5H2V3l1-1Zm7.8 11.4 2.8 2.8-2.1 2.1-1.4-1.4-3.2 3.2-2.1-2.1 3.2-3.2-1.4-1.4 2.1-2.1 2.1 2.1Z" /><path d="M21 2h-4l-6.1 6.1 3 3L20 5h2V3l-1-1Zm-7.8 11.4-2.8 2.8 2.1 2.1 1.4-1.4 3.2 3.2 2.1-2.1-3.2-3.2 1.4-1.4-2.1-2.1-2.1 2.1Z" /></> : <>
        {unitRole === "infantry" && <path d="M12 2 20 5v6c0 5.2-3.4 9.1-8 11-4.6-1.9-8-5.8-8-11V5l8-3Z" />}
        {unitRole === "cavalry" && <><path d="M6 19h13v3H5v-2l1-1Zm3-1c0-2.2.9-4 2.6-5.3L10 10l2-6 2.4 2.5L19 8l-2.2 3.6c.8 1.4 1.2 3 1.2 4.9V18H9Z" /><circle cx="14.8" cy="9.5" r="1" className="unit-icon-cutout" /></>}
        {unitRole === "ranged" && <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" className="unit-icon-cutout" /></>}
      </>}
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg className="eraser-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path className="eraser-body" d="m5.2 20.1 12-12a3.1 3.1 0 0 1 4.4 0l5.2 5.2a3.1 3.1 0 0 1 0 4.4L16.5 28H11l-5.8-5.8a1.5 1.5 0 0 1 0-2.1Z" />
      <path className="eraser-tip" d="m5.2 20.1 5.7-5.7 8.7 8.7-4.9 4.9H11l-5.8-5.8a1.5 1.5 0 0 1 0-2.1Z" />
      <path className="eraser-line" d="m10.9 14.4 8.7 8.7" />
    </svg>
  );
}

export default function WarTable() {
  const { operation, setOperation, commit, checkpoint, restore, canUndo, canRedo, undo: undoOperation, redo: redoOperation } = useOperationHistory(freshOperation);
  const [playerDraft, setPlayerDraft] = useState<Player | null>(null);
  const [staffOpen, setStaffOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const { sheet, staff, quarter, quarterMissions, quarterStaff } = useMissionSheets();
  const [storageError, setStorageError] = useState("");
  const [ready, setReady] = useState(false);
  const [editingId, setEditingId] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  // 라인 도구에서 Shift+드래그는 반대 라인을 그린다. 도구를 바꾸지 않고 공격·방어를 번갈아 긋기 위함.
  const [drawType, setDrawType] = useState<"attackArrow" | "defense">("attackArrow");
  const [memoDraft, setMemoDraft] = useState<{ id: string; text: string } | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | PrimaryRole>("all");
  const [mapVariant, setMapVariant] = useState<MapVariant>("tactical");
  const [mapFocus, setMapFocus] = useState(false);
  const [sceneDraft, setSceneDraft] = useState<SceneDraft | null>(null);
  const mapRef = useRef<HTMLElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<null | { startClient: Point; sceneId: string; initial: Record<string, Point>; moved: boolean }>(null);
  const drawPointsRef = useRef<Point[]>([]);
  const memoInputRef = useRef<HTMLTextAreaElement>(null);
  const memoDragRef = useRef<null | { id: string; sceneId: string; text: string; startClient: Point; origin: Point; size: { width: number; height: number }; moved: boolean }>(null);
  const cardDragRef = useRef<null | { playerId: number; startClient: Point; origin: Point; moved: boolean }>(null);

  const scene = operation.scenes.find((item) => item.id === operation.activeSceneId) ?? operation.scenes[0];
  const editingMemoId = memoDraft?.id ?? null;
  const missionSide: MissionSide = operation.side ?? "ian";
  const editing = operation.players.find((player) => player.id === editingId) ?? operation.players[0];
  const missionCards = operation.cards ?? [];
  const missions = missionsByNickname(operation.players, sheet.data);
  const openMissionBriefs = missionCards.map((card) => {
    const player = operation.players.find((item) => item.id === card.playerId);
    if (!player) return null;
    const { brief, orders, roles, plan } = missionView(player, missions, missionSide, mapVariant, sheet.data);
    const origin = scene.positions[String(player.id)] ?? STARTING_POINT_CENTER[mapVariant][missionSide];
    const routes = plan.routes.map((route) => ({ ...route, key: `${card.playerId}-${route.target}`, nickname: shownName(player, sheet.data), from: origin }));
    const mission = sheetMissionForPlayer(player, sheet.data);
    const staffPlan = mission && staff.data?.plans.get(mission.slot);
    return { card, player, orders, roles, routes, gaps: plan.gaps, brief, staffPlan };
  }).filter((brief) => brief !== null);
  const missionRoutes = openMissionBriefs.filter((brief) => brief.card.route).flatMap((brief) => brief.routes);
  const counts = useMemo(() => {
    const starters = operation.players.filter((player) => player.lineup === "starter");
    const byRole = (role: PrimaryRole) => starters.filter((player) => player.primaryRole === role).length;
    return { infantry: byRole("infantry"), cavalry: byRole("cavalry"), ranged: byRole("ranged"), rally: starters.filter((player) => player.secondaryRoles.includes("rally")).length, starters: starters.length };
  }, [operation.players]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Operation;
          const restored = readOperation(saved);
          // 이관 단계마다 그 전 원본을 한 번만 백업한다.
          const revision = saved.rosterRevision ?? 0;
          for (const [below, name] of [[6, "card-sync-2026-10-06"], [5, "sheet-roster-2026-10-06"], [2, "photo-roster-2026-10-01"]] as const) {
            const backupKey = `${STORAGE_KEY}-before-${name}`;
            if (revision < below && localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, raw);
          }
          if (revision < 2) localStorage.removeItem(MOBILE_PICK_KEY);
          restore(restored);
        }
      } catch { setStorageError("저장 데이터를 읽지 못했습니다. 원본은 보존했습니다. JSON 백업을 확인해 주세요."); }
      if (location.hash === COMMON_HASH) setCardsOpen(true);
      setReady(true);
    });
  }, [restore]);

  useEffect(() => {
    if (!ready || storageError) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(operation)); }
    catch { queueMicrotask(() => setStorageError("자동 저장에 실패했습니다. JSON ↓로 변경 내용을 백업해 주세요.")); }
  }, [operation, ready, storageError]);

  const clearEditing = () => {
    dragRef.current = null; cardDragRef.current = null; memoDragRef.current = null;
    drawPointsRef.current = []; setDrawPoints([]);
    setSelectedIds([]); setMemoDraft(null); setSceneDraft(null); setPlayerDraft(null);
  };
  const undo = () => { clearEditing(); undoOperation(); };
  const redo = () => { clearEditing(); redoOperation(); };
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
      const rect = mapRef.current?.getBoundingClientRect(); if (!rect) return;
      // 카드·메모는 살짝 누른 클릭이 이동으로 잡히지 않게 문턱을 넘어야 움직인다.
      const dragTo = (drag: { startClient: Point; origin: Point; moved: boolean }, size: { width: number; height: number }) => {
        const moveX = (event.clientX - drag.startClient.x) / rect.width; const moveY = (event.clientY - drag.startClient.y) / rect.height;
        if (!drag.moved && Math.hypot(moveX, moveY) < .004) return null;
        if (!drag.moved) checkpoint();
        drag.moved = true;
        return { x: fitAxis(drag.origin.x + moveX, size.width), y: fitAxis(drag.origin.y + moveY, size.height) };
      };
      const card = cardDragRef.current;
      if (card) {
        const to = dragTo(card, MISSION_CARD_SIZE); if (!to) return;
        setOperation((current) => ({ ...current, cards: (current.cards ?? []).map((item) => item.playerId === card.playerId ? { ...item, ...to } : item) }));
        return;
      }
      const memo = memoDragRef.current;
      if (memo) {
        const to = dragTo(memo, memo.size); if (!to) return;
        const { x, y } = to;
        setOperation((current) => ({ ...current, scenes: current.scenes.map((item) => item.id !== memo.sceneId ? item : {
          ...item, objects: item.objects.map((object) => object.id !== memo.id ? object : { ...object, x, y, x2: x + memo.size.width, y2: y + memo.size.height }),
        }) }));
        return;
      }
      const active = dragRef.current; if (!active) return;
      const dx = (event.clientX - active.startClient.x) / rect.width; const dy = (event.clientY - active.startClient.y) / rect.height;
      if (!active.moved && Math.hypot(dx, dy) < .004) return;
      if (!active.moved) checkpoint();
      active.moved = true;
      setOperation((current) => ({ ...current, scenes: current.scenes.map((item) => item.id !== active.sceneId ? item : {
        ...item, positions: { ...item.positions, ...Object.fromEntries(Object.entries(active.initial).map(([id, pos]) => [id, { x: clamp(pos.x + dx), y: clamp(pos.y + dy) }])) },
      }) }));
    };
    const up = (event: PointerEvent) => {
      dragRef.current = null;
      cardDragRef.current = null;
      const memo = memoDragRef.current; memoDragRef.current = null;
      if (event.type === "pointerup" && memo && !memo.moved) setMemoDraft({ id: memo.id, text: memo.text });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [checkpoint, setOperation]);

  useEffect(() => {
    const node = memoInputRef.current; if (!editingMemoId || !node) return;
    node.focus(); node.setSelectionRange(node.value.length, node.value.length);
  }, [editingMemoId]);

  const handleTokenPointerDown = (event: React.PointerEvent, playerId: number) => {
    // 라인 도구는 부대 말 위에서도 선을 시작한다. 이벤트를 지도로 넘긴다.
    if (tool === "attackArrow" || tool === "defense") return;
    event.stopPropagation();
    if (tool === "delete") { updateScene(scene.id, (target) => { delete target.positions[String(playerId)]; }); setSelectedIds((ids) => ids.filter((id) => id !== playerId)); return; }
    if (tool !== "select") return;
    if (event.ctrlKey || event.metaKey) { setSelectedIds((ids) => ids.includes(playerId) ? ids.filter((id) => id !== playerId) : [...ids, playerId]); return; }
    const moving = selectedIds.includes(playerId) ? selectedIds : [playerId];
    setSelectedIds(moving); setEditingId(playerId);
    dragRef.current = { startClient: { x: event.clientX, y: event.clientY }, sceneId: scene.id, moved: false, initial: Object.fromEntries(moving.filter((id) => scene.positions[String(id)]).map((id) => [String(id), { ...scene.positions[String(id)] }])) };
  };
  const handleRosterDrag = (event: React.DragEvent, playerId: number) => { event.dataTransfer.setData("text/player-id", String(playerId)); event.dataTransfer.effectAllowed = "move"; };
  const handleMapDrop = (event: React.DragEvent) => {
    event.preventDefault(); const playerId = Number(event.dataTransfer.getData("text/player-id")); if (!playerId) return;
    const point = pointFromClient(event.clientX, event.clientY);
    updateScene(scene.id, (target) => { target.positions[String(playerId)] = point; }); setSelectedIds([playerId]); setEditingId(playerId); setTool("select");
  };
  const handleMapPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const origin = event.target as Element;
    if (origin.closest(".map-toolbar")) return;
    // 공격 라인은 부대·거점에서 출발하는 경우가 많아, 라인 도구일 때는 말·거점 위에서도 긋기를 시작한다.
    if (tool !== "attackArrow" && tool !== "defense" && origin.closest(".player-token,.capture-objective")) return;
    if ((tool === "delete" || tool === "select") && origin.closest(".tactical-object")) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (tool === "select") {
      const unplaced = selectedIds.length === 1 && !scene.positions[String(selectedIds[0])];
      if (unplaced) updateScene(scene.id, (target) => { target.positions[String(selectedIds[0])] = point; });
      else setSelectedIds([]);
      return;
    }
    if (["attackArrow", "defense", "memo"].includes(tool)) {
      if (tool !== "memo") setDrawType(event.shiftKey === (tool === "defense") ? "attackArrow" : "defense");
      drawPointsRef.current = [point];
      setDrawPoints([point]);
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events do not own capture. */ }
      return;
    }
    if (tool === "rally") {
      const object: TacticalObject = { id: uid(tool), type: "rally", ...point };
      updateScene(scene.id, (target) => { target.objects.push(object); });
      setTool("select");
    }
  };
  const setMissionSide = (side: MissionSide) => commit((draft) => { draft.side = side; return draft; });
  const openMissionCard = (playerId: number) => commit((draft) => {
    const cards = draft.cards ?? [];
    if (cards.some((card) => card.playerId === playerId)) { draft.cards = cards; return draft; }
    // 새로 여는 카드는 이미 열린 장수만큼 어긋나게 놓아 서로 가리지 않게 한다.
    const step = cards.length % 8;
    draft.cards = [...cards, { playerId, x: fitAxis(.16 + step * .034, MISSION_CARD_SIZE.width), y: fitAxis(.11 + step * .058, MISSION_CARD_SIZE.height) }];
    return draft;
  });
  const closeMissionCard = (playerId: number) => commit((draft) => { draft.cards = (draft.cards ?? []).filter((card) => card.playerId !== playerId); return draft; });
  const closeAllMissionCards = () => commit((draft) => { draft.cards = []; return draft; });
  const deployOne = (playerId: number, side: MissionSide) => commit((draft) => {
    const player = draft.players.find((item) => item.id === playerId);
    const slot = player && playerSlot(player);
    const spot = slot ? slotPoint(slot, side, mapVariant) : null;
    const target = draft.scenes.find((item) => item.id === scene.id);
    if (!spot || !target) return draft;
    draft.side = side;
    target.positions[String(playerId)] = spot;
    return draft;
  });
  const toggleMissionRoute = (playerId: number) => commit((draft) => {
    draft.cards = (draft.cards ?? []).map((card) => card.playerId === playerId ? { ...card, route: !card.route } : card);
    return draft;
  });
  const handleCardPointerDown = (event: React.PointerEvent, card: MissionCard) => {
    if (tool === "delete") { event.stopPropagation(); closeMissionCard(card.playerId); return; }
    if (tool !== "select") return;
    event.stopPropagation();
    cardDragRef.current = { playerId: card.playerId, startClient: { x: event.clientX, y: event.clientY }, origin: { x: card.x, y: card.y }, moved: false };
  };
  const patchPlayer = (id: number, patch: Partial<Player>) => commit((draft) => {
    draft.players = draft.players.map((player) => player.id === id ? { ...player, ...patch } : player); return draft;
  });
  const handleMapPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!drawPointsRef.current.length || !["attackArrow", "defense", "memo"].includes(tool)) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (tool === "memo") { drawPointsRef.current = [drawPointsRef.current[0], point]; setDrawPoints(drawPointsRef.current); return; }
    const previous = drawPointsRef.current[drawPointsRef.current.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < .003) return;
    drawPointsRef.current = [...drawPointsRef.current, point];
    setDrawPoints(drawPointsRef.current);
  };
  const handleMapPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!drawPointsRef.current.length || !["attackArrow", "defense", "memo"].includes(tool)) return;
    const end = pointFromClient(event.clientX, event.clientY);
    const points = [...drawPointsRef.current];
    if (tool === "memo") {
      const area = memoRect(points[0], end);
      const note: TacticalObject = { id: uid("memo"), type: "memo", x: area.left, y: area.top, x2: area.left + area.width, y2: area.top + area.height, text: "" };
      updateScene(scene.id, (target) => { target.objects.push(note); });
      setMemoDraft({ id: note.id, text: "" });
      setTool("select");
    } else {
      const previous = points[points.length - 1];
      if (Math.hypot(end.x - previous.x, end.y - previous.y) >= .003) points.push(end);
      const start = points[0];
      const pathLength = points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
      if (points.length > 1 && pathLength > .01) {
        const object: TacticalObject = { id: uid(drawType), type: drawType, ...start, x2: end.x, y2: end.y, points };
        updateScene(scene.id, (target) => { target.objects.push(object); });
      }
    }
    drawPointsRef.current = [];
    setDrawPoints([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelMapDrawing = () => { drawPointsRef.current = []; setDrawPoints([]); };
  const deleteObject = (objectId: string) => { if (tool !== "delete") return; updateScene(scene.id, (target) => { target.objects = target.objects.filter((object) => object.id !== objectId); }); };
  const finishMemoEdit = (save: boolean) => {
    const draft = memoDraft; if (!draft) return;
    setMemoDraft(null);
    updateScene(scene.id, (target) => {
      const note = target.objects.find((object) => object.id === draft.id); if (!note) return;
      if (save) note.text = draft.text.trim();
      // 편집을 마친 빈 메모는 제거한다.
      if (!note.text?.trim()) target.objects = target.objects.filter((object) => object.id !== draft.id);
    });
  };
  const handleMemoPointerDown = (event: React.PointerEvent, note: TacticalObject) => {
    event.stopPropagation();
    if (tool === "delete") { deleteObject(note.id); return; }
    if (tool !== "select" || memoDraft?.id === note.id) return;
    memoDragRef.current = { id: note.id, sceneId: scene.id, text: note.text ?? "", startClient: { x: event.clientX, y: event.clientY }, origin: { x: note.x, y: note.y }, size: memoSpan(note), moved: false };
  };
  const cycleObjective = (objectiveId: string) => updateScene(scene.id, (target) => {
    const current = target.objectiveOwners?.[objectiveId] ?? "neutral";
    const next: ObjectiveOwner = current === "neutral" ? "lucia" : current === "lucia" ? "ian" : "neutral";
    target.objectiveOwners = { ...target.objectiveOwners, [objectiveId]: next };
  });

  const cloneScene = () => {
    const id = uid("scene");
    commit((draft) => {
      const source = draft.scenes.find((item) => item.id === draft.activeSceneId) ?? draft.scenes[0];
      const index = draft.scenes.length; const time = SCENE_TIMES[index] ?? `T+${String(index).padStart(2, "0")}`;
      const next: Scene = { ...clone(source), id, name: index < SCENE_TIMES.length ? ["START", "루브라이트", "포탈", "페어리 드래곤", "생명석"][index] : `SCENE ${String(index + 1).padStart(2, "0")}`, time, events: { ...clone(source.events), fairyDragonPosition: source.events.fairyDragonPosition === "northwest" ? "southeast" : "northwest" } };
      draft.scenes.push(next); draft.activeSceneId = id; return draft;
    });
  };
  const switchScene = (sceneId: string) => { setOperation((current) => ({ ...current, activeSceneId: sceneId })); setSelectedIds([]); setMemoDraft(null); };
  const removeScene = (sceneId: string) => {
    if (operation.scenes.length === 1 || !window.confirm("이 장면을 타임라인에서 삭제할까요?")) return;
    commit((draft) => {
      const index = draft.scenes.findIndex((item) => item.id === sceneId);
      if (index < 0) return draft;
      draft.scenes.splice(index, 1);
      if (draft.activeSceneId === sceneId) draft.activeSceneId = draft.scenes[Math.max(0, index - 1)].id;
      return draft;
    });
    if (sceneDraft?.id === sceneId) setSceneDraft(null);
    setSelectedIds([]);
  };
  const openSceneEditor = (target: Scene) => {
    switchScene(target.id);
    setSceneDraft({ id: target.id, name: target.name, time: target.time, fairyDragon: target.events.fairyDragon, lifeStone: target.events.lifeStone, fairyDragonPosition: target.events.fairyDragonPosition });
  };
  const saveSceneEditor = () => {
    if (!sceneDraft) return;
    updateScene(sceneDraft.id, (target) => {
      target.time = sceneDraft.time.trim() || "00:00";
      target.name = sceneDraft.name.trim() || "SCENE";
      target.events = { fairyDragon: sceneDraft.fairyDragon.trim(), lifeStone: sceneDraft.lifeStone.trim(), fairyDragonPosition: sceneDraft.fairyDragonPosition };
    });
    setSceneDraft(null);
  };
  const patchSceneDraft = (patch: Partial<SceneDraft>) => setSceneDraft((current) => current ? { ...current, ...patch } : current);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(operation, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "heinapel-operation.json"; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const importJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const parsed = readOperation(JSON.parse(await file.text())); clearEditing(); setStorageError(""); commit(() => parsed); }
    catch { window.alert("Heinapel War Table v0.1 JSON 파일이 아닙니다."); }
    event.target.value = "";
  };
  const resetOperation = () => { if (!window.confirm("현재 작전 데이터를 초기화할까요?")) return; const fresh = freshOperation(); clearEditing(); setStorageError(""); commit(() => fresh); };
  const toggleCommandRole = (role: "rally" | "garrison") => {
    if (!editing) return;
    const secondaryRoles = editing.secondaryRoles.includes(role)
      ? editing.secondaryRoles.filter((item) => item !== role)
      : [...editing.secondaryRoles.filter((item) => item !== "rally" && item !== "garrison"), role];
    patchPlayer(editing.id, { secondaryRoles });
  };
  const deployStarters = (side: MissionSide) => {
    const starters = operation.players.filter((player) => player.lineup === "starter");
    // 번호가 없는 사람은 진형 아래에 한 줄로 세워 배치에서 빠지지 않게 한다.
    const unnumbered = starters.filter((player) => !playerSlot(player));
    commit((draft) => {
      const target = draft.scenes.find((item) => item.id === scene.id);
      if (!target) return draft;
      draft.side = side;
      starters.forEach((player) => {
        const slot = playerSlot(player);
        const spot = slot ? slotPoint(slot, side, mapVariant) : null;
        if (spot) { target.positions[String(player.id)] = spot; return; }
        const index = unnumbered.indexOf(player);
        target.positions[String(player.id)] = formationPoint({ x: (index - (unnumbered.length - 1) / 2) * .026, y: .135 }, side, mapVariant);
      });
      return draft;
    });
    setSelectedIds([]);
    setRoleFilter("all");
    setTool("select");
  };

  // 명단은 전투 위치 번호순, 번호 없는 선수는 뒤에 둔다.
  const visiblePlayers = operation.players.filter((player) => roleFilter === "all" || player.primaryRole === roleFilter)
    .sort((a, b) => (playerSlot(a) ?? 99) - (playerSlot(b) ?? 99));
  const placedCount = Object.keys(scene.positions).length;
  const objects = scene.objects;
  const stepObjects = objects.filter((object) => object.type === "step");
  const objectiveCounts = OBJECTIVE_META.reduce((counts, objective) => {
    counts[scene.objectiveOwners?.[objective.id] ?? "neutral"] += 1;
    return counts;
  }, { neutral: 0, lucia: 0, ian: 0 } as Record<ObjectiveOwner, number>);

  return (
    <>
    <main className={`war-shell${mapFocus ? " map-focus" : ""}${cardsOpen ? " cards-open" : ""}`} inert={!ready}>
      <header className="topbar">
        <div className="brand-block"><span className="brand-mark">H</span><div><h1>HEINAPEL <span>WAR TABLE</span></h1><input aria-label="작전명" value={operation.name} onChange={(event) => { const name = event.target.value; commit((draft) => { draft.name = name; return draft; }); }} /></div></div>
        <div className="battle-clock"><span>{scene.name}</span><strong>{scene.time} · {placedCount}/{operation.players.length} DEPLOYED</strong></div>
        <div className="header-actions">
          <button type="button" onClick={undo} disabled={!canUndo} title="실행 취소">↶</button><button type="button" onClick={redo} disabled={!canRedo} title="다시 실행">↷</button>
          <button type="button" onClick={exportJson}>JSON ↓</button><button type="button" onClick={() => importRef.current?.click()}>JSON ↑</button><input ref={importRef} className="visually-hidden" type="file" accept="application/json" onChange={importJson} />
          <span className="status-chip"><i /> {storageError ? "저장 실패" : ready ? "SAVED" : "불러오는 중"} {ready ? new Date(operation.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
        </div>
      </header>

      {storageError && <p role="alert">{storageError}</p>}
      <section className="workspace-grid">
        <aside className="roster-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">BLUE FORCE</span><h2>PLAYER ROSTER</h2></div><span className="count-badge">{visiblePlayers.length} / {operation.players.length}</span></div>
          <div className="roster-controls">
            <button type="button" disabled={operation.players.length >= 30} onClick={() => setPlayerDraft(newPlayer(operation.players))}>선수 추가</button>
            <button type="button" disabled={!editing} onClick={() => editing && setPlayerDraft(editablePlayer(editing))}>명단·임무 편집</button>
            <select aria-label="역할 필터" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | PrimaryRole)}><option value="all">전체 역할</option>{Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <div className="roster-list" aria-label={`플레이어 명단 ${visiblePlayers.length}명 표시 · 총 ${operation.players.length}명`}>
            {visiblePlayers.map((player) => (
              <button draggable type="button" key={player.id} className={`player-row ${editingId === player.id ? "is-active" : ""} ${scene.positions[String(player.id)] ? "is-placed" : ""}`} onDragStart={(event) => handleRosterDrag(event, player.id)} onClick={() => { setEditingId(player.id); openMissionCard(player.id); if (!scene.positions[String(player.id)]) setSelectedIds([player.id]); }}>
                <span className="player-num">{playerSlot(player) ?? "—"}</span><span className="player-copy"><strong className={playerNameClass(player)}>{shownName(player, sheet.data)}</strong><span className={`lineup-badge ${player.lineup}`}>주전</span></span><span className="edit-glyph">{scene.positions[String(player.id)] ? "●" : "⋮⋮"}</span>
              </button>
            ))}
          </div>
        </aside>

        <section ref={mapRef} className={`map-panel map-${mapVariant} tool-${tool}`} aria-label="헤이나펄 전장 작전판" onDragOver={(event) => event.preventDefault()} onDrop={handleMapDrop} onPointerDown={handleMapPointerDown} onPointerMove={handleMapPointerMove} onPointerUp={handleMapPointerUp} onPointerCancel={cancelMapDrawing}>
          <div className="map-image-layer" /><div className="map-grid-lines" />
          <div className="map-toolbar" onPointerDown={(event) => event.stopPropagation()}>
            <div className="map-toolbar-left">
              <div className="map-switcher" aria-label="지도 선택"><button type="button" className={mapVariant === "tactical" ? "active" : ""} onClick={() => setMapVariant("tactical")}>전술 맵</button><button type="button" className={mapVariant === "field" ? "active" : ""} onClick={() => setMapVariant("field")}>실전 맵</button></div>
              <div className={`mission-side-switch side-${missionSide}`} role="group" aria-label="임무 기준 진영">{MISSION_SIDES.map((side) => <button type="button" key={side} className={missionSide === side ? "active" : ""} aria-pressed={missionSide === side} onClick={() => setMissionSide(side)}>{MISSION_SIDE_LABEL[side]}</button>)}</div>
              <button type="button" className="staff-open" onClick={() => setStaffOpen(true)}>스테프 카드</button>
              <button type="button" className="cards-open-button" onClick={() => setCardsOpen(true)}>임무 카드</button>
              {missionCards.length > 0 && <button type="button" className="mission-clear" onClick={closeAllMissionCards}>카드 {missionCards.length}장 닫기</button>}
            </div>
            <div className="map-toolbar-stats"><span>배치 <b>{placedCount}/{operation.players.length}</b></span><span>중립 <b>{objectiveCounts.neutral}</b></span><span className="stat-lucia">루시아 <b>{objectiveCounts.lucia}</b></span><span className="stat-ian">이안 <b>{objectiveCounts.ian}</b></span></div>
            <button type="button" className="panel-toggle" onClick={() => setMapFocus((current) => !current)}>{mapFocus ? "편집 패널 열기" : "지도 크게 보기"}</button>
          </div>
          <div className="map-time-chip" aria-label={`현재 장면 시간 ${scene.time}`}><span>CURRENT TIME</span><strong>{scene.time}</strong><small>{scene.name}</small></div>
          <div className="home-zone home-lucia" role="img" aria-label="루시아팀 스타팅 포인트" /><div className="home-zone home-ian" role="img" aria-label="이안팀 스타팅 포인트" />
          {scene.events.fairyDragon && <div className={`fairy-dragon-anchor event-anchor position-${scene.events.fairyDragonPosition}`} aria-label={`페어리 드래곤 젠 위치: ${scene.events.fairyDragon}`}><span>✦</span><strong>{scene.events.fairyDragon}</strong><small>{scene.events.fairyDragonPosition === "northwest" ? "11시 전망대 사이" : "5시 전망대 사이"}</small></div>}
          {scene.events.lifeStone && <div className="lifestone-anchor" aria-label={`생명의 반석, ${scene.events.lifeStone}`}><span>◆</span><strong>생명의 반석</strong><small>{scene.events.lifeStone}</small></div>}
          {OBJECTIVE_META.map((objective) => { const owner = scene.objectiveOwners?.[objective.id] ?? "neutral"; const point = objective[mapVariant]; return <button type="button" key={objective.id} className={`capture-objective owner-${owner}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => cycleObjective(objective.id)} aria-label={`${objective.location} ${objective.label}: ${owner === "neutral" ? "중립" : owner === "lucia" ? "루시아팀" : "이안팀"}`} title={`${objective.location} ${objective.label} · 클릭하여 점령 상태 변경`}><span>{objective.label}</span></button>; })}
          <svg className="tactical-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="전술 오브젝트 레이어">
            <defs><marker id="move-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#55cfff" /></marker><marker id="attack-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#ff5353" /></marker><marker id="route-head-ian" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#f0c463" /></marker><marker id="route-head-lucia" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#5cb8ff" /></marker></defs>
            {missionRoutes.map((route) => <line key={route.key} className={`mission-route side-${missionSide}`} x1={route.from.x * 1000} y1={route.from.y * 1000} x2={route.to.x * 1000} y2={route.to.y * 1000} markerEnd={`url(#route-head-${missionSide})`} />)}
            {objects.filter((object) => ["moveArrow", "attackArrow", "defense"].includes(object.type)).map((object) => {
              const kind = object.type === "defense" ? "defense-line" : `arrow-${object.type}`;
              const markerEnd = object.type === "defense" ? undefined : `url(#${object.type === "moveArrow" ? "move-head" : "attack-head"})`;
              return object.points?.length
                ? <path key={object.id} className={`tactical-object freehand-path ${kind}`} onClick={() => deleteObject(object.id)} d={smoothPath(object.points)} markerEnd={markerEnd} />
                : <line key={object.id} className={`tactical-object ${kind}`} onClick={() => deleteObject(object.id)} x1={object.x * 1000} y1={object.y * 1000} x2={(object.x2 ?? object.x) * 1000} y2={(object.y2 ?? object.y) * 1000} markerEnd={markerEnd} />;
            })}
            {drawPoints.length > 1 && tool !== "memo" && <path className={`draw-preview freehand-path ${drawType === "defense" ? "defense-line" : "arrow-attackArrow"}`} d={smoothPath(drawPoints)} markerEnd={drawType === "attackArrow" ? "url(#attack-head)" : undefined} />}
          </svg>
          {missionRoutes.map((route) => { const at = .82; const x = route.from.x + (route.to.x - route.from.x) * at; const y = route.from.y + (route.to.y - route.from.y) * at; return <span key={`${route.key}-tag`} className={`mission-route-tag side-${missionSide}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} title={`${route.nickname} · ${route.units.join(", ")}부대`}>{route.units.join("·")}</span>; })}
          {tool === "memo" && drawPoints.length > 1 && (() => { const area = memoRect(drawPoints[0], drawPoints[1]); return <div className="memo-preview" style={{ left: `${area.left * 100}%`, top: `${area.top * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%` }} />; })()}
          {openMissionBriefs.map(({ card, player, orders, roles, gaps, brief, staffPlan }) => <div key={card.playerId} className={`tactical-object mission-card side-${missionSide} role-${player.primaryRole}`} style={{ left: `min(${card.x * 100}%, calc(99% - min(340px, 45%)))`, top: `${card.y * 100}%`, maxHeight: `${(1 - card.y) * 100}%` }} onPointerDown={(event) => { if (tool === "delete") { event.stopPropagation(); closeMissionCard(card.playerId); } }}>
            <div className="mission-card-head" onPointerDown={(event) => handleCardPointerDown(event, card)}>
              <UnitRoleIcon unitRole={player.primaryRole} isRally={player.secondaryRoles.includes("rally")} />
              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setPlayerDraft(editablePlayer(player))}>편집</button><strong className="mission-card-name">{!!playerSlot(player) && <b className="mission-card-slot">{playerSlot(player)}</b>}{shownName(player, sheet.data)}</strong>
              <div className="mission-card-actions">
                {orders && <button type="button" className={`mission-card-route ${card.route ? "active" : ""}`} aria-pressed={!!card.route} onClick={() => toggleMissionRoute(card.playerId)} title={`${shownName(player, sheet.data)} 부대 목적지를 지도에 표시`}>경로</button>}
                <button type="button" className="mission-card-close" onClick={() => closeMissionCard(card.playerId)} aria-label={`${shownName(player, sheet.data)} 임무 카드 닫기`}>×</button>
              </div>
            </div>
            {orders ? <div className="mission-card-body" onClick={() => { if (tool === "select") toggleMissionRoute(card.playerId); }} role="presentation">
              {roles.length > 0 && <div className="mission-roles">{roles.map((role) => <span key={role.key} className="mission-role"><b>{role.label}</b>{role.place}</span>)}</div>}
              {brief?.team && <p>{brief.team}</p>}{brief?.badge && <p>{brief.badge}</p>}
              {brief?.common?.map(([head, body], index) => <p key={index}><b>{head}</b> {body}</p>)}
              {brief && brief.steps.length > 0 && <ol className="mission-steps">{brief.steps.map(([when, what]) => <li key={when + what}><i>{when}</i><div><MissionLines text={what} /></div></li>)}</ol>}
              {/* eslint-disable-next-line @next/next/no-img-element -- 정적 PNG 한 장, 최적화 불필요 */}
              {brief?.image && <figure className="mission-figure"><img src={brief.image.src} alt={brief.image.caption} /><figcaption>{brief.image.caption}</figcaption></figure>}
              {orders.some(Boolean) && <ol className="mission-units">{orders.map((text, index) => <li key={index} className={`mission-unit ${missionEmphasis(text)}`}><i>{index + 1}</i><span><MissionText text={text} /></span></li>)}</ol>}
              {staffPlan?.group && <section className="mission-staff"><h4>스테프 사용</h4><p className="staff-schedule">{staffLabel(staffPlan, staffPlan.slot)}</p>
                <MissionLines text={mirrorMission([staffPlan.target, staffPlan.method].filter(Boolean).join(" / ") || "목적지 미정", missionSide)} />
                {staffPlan.composition && <><h4>부대구성</h4><MissionLines text={mirrorMission(staffPlan.composition, missionSide)} /></>}
              </section>}
              {card.route && gaps.length > 0 && <p className="mission-route-gap">{gaps.join("·")}부대는 임무표에 목적지가 없어 지도에 표시할 수 없습니다</p>}
              {brief?.foot && <p>{brief.foot}</p>}
              {!!playerSlot(player) && <div className="mission-deploy"><span>{playerSlot(player)}번 자리로</span>{MISSION_SIDES.map((side) => <button type="button" key={side} className={`deploy-${side}`} onClick={() => deployOne(card.playerId, side)}>{MISSION_SIDE_LABEL[side]} 배치</button>)}</div>}
            </div> : <p className="mission-empty">임무표에 배정된 부대가 없습니다<small>임무 미배정</small></p>}
          </div>)}
          {objects.filter((object) => object.type === "memo").map((note) => { const span = memoSpan(note); const isEditing = memoDraft?.id === note.id; return <div key={note.id} className={`tactical-object map-memo${isEditing ? " is-editing" : ""}`} style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%`, width: `${span.width * 100}%`, height: `${span.height * 100}%` }}>{isEditing ? <textarea ref={memoInputRef} aria-label="메모 내용" placeholder="메모를 입력하세요" value={memoDraft.text} onChange={(event) => setMemoDraft({ id: note.id, text: event.target.value })} onBlur={() => finishMemoEdit(true)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); finishMemoEdit(false); } }} /> : <button type="button" className="memo-face" onPointerDown={(event) => handleMemoPointerDown(event, note)} onClick={(event) => { if (event.detail !== 0) return; if (tool === "delete") deleteObject(note.id); else if (tool === "select") setMemoDraft({ id: note.id, text: note.text ?? "" }); }} title={tool === "delete" ? "클릭해 메모 삭제" : "클릭해 메모 수정 · 드래그로 이동"}><span className={note.text ? "" : "is-placeholder"}>{note.text || "메모 입력"}</span></button>}</div>; })}
          {objects.filter((object) => object.type === "attackArrow").map((object, index) => { const origin = object.points?.[0] ?? { x: object.x, y: object.y }; return <span key={`${object.id}-order`} className="attack-line-order" style={{ left: `${origin.x * 100}%`, top: `${origin.y * 100}%` }} aria-hidden="true">{index + 1}</span>; })}
          {objects.filter((object) => ["rally", "step", "text"].includes(object.type)).map((object) => <button type="button" key={object.id} className={`tactical-object map-marker marker-${object.type}`} style={{ left: `${object.x * 100}%`, top: `${object.y * 100}%` }} onClick={() => deleteObject(object.id)}><span>{object.type === "rally" ? "⚔" : object.type === "step" ? `S${stepObjects.findIndex((item) => item.id === object.id) + 1}` : object.text}</span></button>)}
          {operation.players.filter((player) => scene.positions[String(player.id)] && (roleFilter === "all" || player.primaryRole === roleFilter)).map((player) => { const pos = scene.positions[String(player.id)]; const isRally = player.secondaryRoles.includes("rally"); const tooltip = `${shownName(player, sheet.data)} · ${ROLE_LABEL[player.primaryRole]}${player.secondaryRoles.length ? ` · ${player.secondaryRoles.map((role) => SECONDARY_LABEL[role]).join("/")}` : ""}`; return <button type="button" key={player.id} className={`player-token role-${player.primaryRole} ${isRally ? "is-rally" : ""} ${selectedIds.includes(player.id) ? "selected" : ""}`} style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }} onPointerDown={(event) => handleTokenPointerDown(event, player.id)} aria-label={tooltip} data-tooltip={tooltip}><UnitRoleIcon unitRole={player.primaryRole} isRally={isRally} /><span className="token-num">{playerSlot(player) ?? "·"}</span></button>; })}
          <div className="map-note"><span>{mapVariant === "tactical" ? "TACTICAL OVERVIEW" : "FIELD REFERENCE"}</span><strong>{mapVariant === "tactical" ? "헤이나펄 전술 맵" : "헤이나펄 실전 지형"}</strong><small>{TOOL_META.find((item) => item.id === tool)?.hint}</small></div><div className="map-coordinates"><span>GRID A-01</span><span>생명의 반석 기준 작전도</span><span>GRID H-09</span></div>
        </section>

        <aside className="inspector-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">TACTICAL CONTROL</span><h2>핵심 작전 도구</h2></div></div>
          <div className="tool-grid">{TOOL_META.map((item) => <button type="button" key={item.id} className={`${tool === item.id ? "active" : ""} tool-${item.id}`} onClick={() => setTool(item.id)} title={item.hint}>{item.id === "delete" ? <EraserIcon /> : <span>{item.glyph}</span>}{item.label}</button>)}</div>
          <div className="assignment-panel">
            {editing && <><div className="assignment-player"><span>SELECTED PLAYER</span><strong className={playerNameClass(editing)}>{shownName(editing, sheet.data)}</strong><small>명단에서 아이디를 선택한 뒤 역할을 지정하세요.</small></div>
            <div className="assignment-heading">병종</div>
            <div className="assignment-grid three-column">
              {(Object.keys(ROLE_LABEL) as PrimaryRole[]).map((role) => <button type="button" key={role} className={`assignment-button role-${role} ${editing.primaryRole === role ? "active" : ""}`} onClick={() => patchPlayer(editing.id, { primaryRole: role })}><UnitRoleIcon unitRole={role} />{ROLE_LABEL[role]}</button>)}
            </div>
            <div className="assignment-heading">지휘 역할</div>
            <div className="assignment-grid two-column">
              <button type="button" className={`assignment-button command-rally ${editing.secondaryRoles.includes("rally") ? "active" : ""}`} onClick={() => toggleCommandRole("rally")}><UnitRoleIcon unitRole="infantry" isRally />집결장</button>
              <button type="button" className={`assignment-button command-garrison ${editing.secondaryRoles.includes("garrison") ? "active" : ""}`} onClick={() => toggleCommandRole("garrison")}><UnitRoleIcon unitRole="infantry" />주둔장</button>
            </div>
            </>}
            <div className="role-count-board">
              <div className="assignment-heading">병종 현황 · 주전 기준</div>
              <div className="role-count-grid">
                {(Object.keys(ROLE_LABEL) as PrimaryRole[]).map((role) => <div key={role} className={`role-count-tile role-${role}`}><UnitRoleIcon unitRole={role} /><strong>{counts[role]}</strong><small>{ROLE_LABEL[role]}</small></div>)}
                <div className="role-count-tile role-count-total"><span className="total-glyph">Σ</span><strong>{counts.starters}</strong><small>주전 합계 · 총 {operation.players.length}명</small></div>
              </div>
              <p className="role-count-note"><UnitRoleIcon unitRole="infantry" isRally />집결장 <b>{counts.rally}</b>명 · 겸직이라 위 병종 수에 이미 포함됩니다</p>
            </div>
            <div className="deployment-board">
              <div className="assignment-heading">주전 일괄 배치</div>
              <div className="deployment-grid">
                <button type="button" className="deployment-button deployment-lucia" onClick={() => deployStarters("lucia")}><span>●</span><strong>루시아 배치</strong></button>
                <button type="button" className="deployment-button deployment-ian" onClick={() => deployStarters("ian")}><span>●</span><strong>이안 배치</strong></button>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <footer className="timeline-shell">
        <div className="timeline-title"><span>OPERATION TIMELINE</span><strong>{operation.scenes.length} SCENES · AUTO SAVE</strong></div>
        <div className="scene-strip">
          {operation.scenes.map((item, index) => <div key={item.id} className={`scene-card ${item.id === scene.id ? "active" : ""}`}><button type="button" className="scene-select" onClick={() => switchScene(item.id)}><i>{String(index + 1).padStart(2, "0")}</i><span><b>{item.time}</b><small>{item.name}</small></span></button><button type="button" className="scene-remove-button" onClick={() => removeScene(item.id)} disabled={operation.scenes.length === 1} aria-label={`${String(index + 1).padStart(2, "0")} 장면 삭제`} title={operation.scenes.length === 1 ? "마지막 장면은 삭제할 수 없습니다" : "장면 삭제"}>×</button><button type="button" className="scene-edit-button" onClick={() => openSceneEditor(item)} aria-label={`${String(index + 1).padStart(2, "0")} 장면 시간 및 이벤트 편집`} title="시간·이벤트 편집">◷</button></div>)}
          <button type="button" className="clone-scene" onClick={cloneScene}><i>＋</i><span><b>SCENE 복제</b><small>현재 배치에서 생성</small></span></button>
        </div>
        <div className="footer-actions"><button type="button" onClick={resetOperation}>초기화</button><span>PHASE 6 · READY</span></div>
        {sceneDraft && <form className="scene-event-editor" onSubmit={(event) => { event.preventDefault(); saveSceneEditor(); }}>
          <div className="scene-editor-heading"><div><span>SCENE SETTINGS</span><strong>시간 · 젠 이벤트 편집</strong></div><button type="button" onClick={() => setSceneDraft(null)} aria-label="장면 편집 닫기">×</button></div>
          <div className="scene-editor-grid">
            <label><span>장면 시간</span><input aria-label="장면 시간" value={sceneDraft.time} onChange={(event) => patchSceneDraft({ time: event.target.value })} maxLength={12} placeholder="예: 55:00" /></label>
            <label><span>장면 이름</span><input aria-label="장면 이름" value={sceneDraft.name} onChange={(event) => patchSceneDraft({ name: event.target.value })} maxLength={24} placeholder="예: 루브라이트" /></label>
            <label className="event-field event-copy-field"><span>페어리 드래곤 이벤트</span><input aria-label="페어리 드래곤 이벤트" value={sceneDraft.fairyDragon} onChange={(event) => patchSceneDraft({ fairyDragon: event.target.value })} maxLength={40} placeholder="예: 페어리 드래곤 젠" /></label>
            <label className="fairy-position-field"><span>페어리 드래곤 젠 위치</span><select aria-label="페어리 드래곤 젠 위치" value={sceneDraft.fairyDragonPosition} onChange={(event) => patchSceneDraft({ fairyDragonPosition: event.target.value as FairyDragonPosition })}><option value="northwest">11시 전망대 사이</option><option value="southeast">5시 전망대 사이</option></select></label>
            <label className="event-field"><span>생명석 이벤트</span><input aria-label="생명석 이벤트" value={sceneDraft.lifeStone} onChange={(event) => patchSceneDraft({ lifeStone: event.target.value })} maxLength={40} placeholder="예: 생명석 젠" /></label>
          </div>
          <div className="scene-editor-actions"><button type="button" onClick={() => setSceneDraft(null)}>취소</button><button type="submit">장면 저장</button></div>
        </form>}
      </footer>
    </main>
    <MobileBriefing players={operation.players} quarter={quarter} missionSheet={quarterMissions} staffSheet={quarterStaff} onExit={cardsOpen ? () => setCardsOpen(false) : undefined} />
    {staffOpen && <StaffDialog staff={staff} side={missionSide} nameOf={(slot) => slotName(sheet.data?.missions, operation.players, slot)} onClose={() => setStaffOpen(false)} />}
    {playerDraft && <PlayerEditor initial={playerDraft} players={operation.players} onClose={() => setPlayerDraft(null)} onSave={(player) => {
      commit((draft) => { const index = draft.players.findIndex((item) => item.id === player.id); if (index < 0) draft.players.push(player); else draft.players[index] = player; return draft; });
      setEditingId(player.id); setRoleFilter("all"); setPlayerDraft(null);
    }} onDelete={() => {
      commit((draft) => { draft.players = draft.players.filter((player) => player.id !== playerDraft.id); draft.cards = draft.cards?.filter((card) => card.playerId !== playerDraft.id); draft.scenes.forEach((item) => { delete item.positions[String(playerDraft.id)]; }); return draft; });
      setSelectedIds((ids) => ids.filter((id) => id !== playerDraft.id)); setPlayerDraft(null);
    }} /> }
    </>
  );
}
