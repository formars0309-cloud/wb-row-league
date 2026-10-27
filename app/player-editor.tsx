// 작전판의 명단·임무 편집 창. 저장 전에 저장본과 같은 검사를 거친다.
import { useEffect, useRef, useState } from "react";
import { type SecondaryRole, type Player, SECONDARY_LABEL, clone, freshOperation, playerSlot, normalizeRoster } from "./operation";
import { ROLE_LABEL, type Brief, type MissionOrders, type PrimaryRole } from "./roster";

export function PlayerEditor({ initial, players, onSave, onDelete, onClose }: { initial: Player; players: Player[]; onSave: (player: Player) => void; onDelete: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => clone(initial));
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const patch = (value: Partial<Player>) => setDraft((current) => ({ ...current, ...value }));
  const patchBrief = (value: Partial<Brief>) => setDraft((current) => ({ ...current, brief: current.brief ? { ...current.brief, ...value } : null }));
  const isExisting = players.some((player) => player.id === draft.id);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isExisting && players.length >= 30) { setError("주전은 최대 30명입니다."); return; }
    const nickname = draft.nickname.trim();
    if (!nickname) { setError("닉네임을 입력해 주세요."); return; }
    if (players.some((player) => player.id !== draft.id && player.nickname.toLowerCase() === nickname.toLowerCase())) { setError("이미 등록된 닉네임입니다."); return; }
    if (draft.slot && players.some((player) => player.id !== draft.id && playerSlot(player) === draft.slot)) { setError("이미 사용 중인 전투 위치 번호입니다."); return; }
    const next = { ...draft, nickname, brief: draft.brief ? { ...draft.brief, nickname } : null };
    try { normalizeRoster({ ...freshOperation(), players: [next] }); }
    catch { setError("명단과 임무 입력 내용을 확인해 주세요."); return; }
    onSave(next);
  };
  return <dialog ref={dialogRef} className="player-editor" onCancel={onClose} aria-labelledby="player-editor-title">
    <form onSubmit={save}>
      <header><h2 id="player-editor-title">명단 · 임무 편집</h2><button type="button" onClick={onClose} aria-label="편집 닫기">×</button></header>
      <p>변경 내용은 이 브라우저에 저장됩니다. 다른 기기에는 JSON으로 전달하세요.</p>
      <div className="player-fields">
        <label>닉네임<input required maxLength={80} value={draft.nickname} onChange={(event) => patch({ nickname: event.target.value })} /></label>
        <label>병종<select value={draft.primaryRole} onChange={(event) => patch({ primaryRole: event.target.value as PrimaryRole })}>{Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>전투 위치 번호<input type="number" min={1} max={30} value={draft.slot ?? ""} placeholder="미지정" onChange={(event) => patch({ slot: event.target.value ? Number(event.target.value) : null })} /></label>
      </div>
      <fieldset><legend>지휘 역할</legend>{Object.entries(SECONDARY_LABEL).map(([value, label]) => <label className="role-check" key={value}><input type="checkbox" checked={draft.secondaryRoles.includes(value as SecondaryRole)} onChange={(event) => patch({ secondaryRoles: event.target.checked ? [...draft.secondaryRoles, value as SecondaryRole] : draft.secondaryRoles.filter((role) => role !== value) })} />{label}</label>)}</fieldset>
      <section className="brief-editor"><h3>임무 카드</h3><p>문안은 이안 진영 기준으로 입력하세요. 부대 지시에서 지도 경로를 계산합니다.</p>
        {!draft.brief ? <button type="button" onClick={() => patch({ brief: { nickname: draft.nickname, file: "", team: "", foot: "", steps: [], units: ["", "", "", "", ""] } })}>임무 추가</button> : <>
          <label>카드 부제<input value={draft.brief.team} onChange={(event) => patchBrief({ team: event.target.value })} /></label>
          <label>배지<input value={draft.brief.badge ?? ""} onChange={(event) => patchBrief({ badge: event.target.value })} /></label>
          {(["common", "steps"] as const).map((field) => { const label = field === "common" ? "공통" : "조건"; return <fieldset key={field}><legend>{field === "common" ? "공통 지시" : "시간·조건별 지시"}</legend>
            {(draft.brief?.[field] ?? []).map(([head, body], index) => <div className="brief-pair" key={index}>
              <input aria-label={`${label} ${index + 1} 제목`} value={head} placeholder="제목·시간·조건" onChange={(event) => patchBrief({ [field]: draft.brief?.[field]?.map((pair, at) => at === index ? [event.target.value, pair[1]] : pair) })} />
              <textarea aria-label={`${label} ${index + 1} 내용`} value={body} onChange={(event) => patchBrief({ [field]: draft.brief?.[field]?.map((pair, at) => at === index ? [pair[0], event.target.value] : pair) })} />
              <button type="button" aria-label={`${label} ${index + 1} 삭제`} onClick={() => patchBrief({ [field]: draft.brief?.[field]?.filter((_, at) => at !== index) })}>삭제</button>
            </div>)}
            <button type="button" onClick={() => patchBrief({ [field]: [...(draft.brief?.[field] ?? []), ["", ""]] })}>{label} 지시 추가</button>
          </fieldset>; })}
          {draft.brief.units.map((text, index) => <label key={index}>부대 {index + 1}<textarea value={text} onChange={(event) => patchBrief({ units: draft.brief?.units.map((value, at) => at === index ? event.target.value : value) as MissionOrders })} /></label>)}
          <label>하단 안내<input value={draft.brief.foot} onChange={(event) => patchBrief({ foot: event.target.value })} /></label>
          {draft.brief.image && <button type="button" onClick={() => patchBrief({ image: undefined })}>첨부 이미지 삭제</button>}
          <button type="button" className="danger" onClick={() => patch({ brief: null })}>임무 삭제</button><small>저장을 누르면 임무 내용이 삭제됩니다. 선수는 명단에 남습니다.</small>
        </>}
      </section>
      {error && <p role="alert">{error}</p>}
      <footer>{isExisting && <button type="button" className="danger" onClick={() => { if (window.confirm(`${initial.nickname} 선수를 명단과 모든 장면에서 삭제할까요? 실행 취소로 복구할 수 있습니다.`)) onDelete(); }}>선수 삭제</button>}<button type="button" onClick={onClose}>취소</button><button type="submit">저장</button></footer>
    </form>
  </dialog>;
}
