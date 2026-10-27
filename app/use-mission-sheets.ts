// 시트 다섯 탭을 주기적으로 다시 읽는 훅. 탭마다 실패와 마지막 데이터를 따로 둔다.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { MISSION_SHEET_CSV, type MissionSheet, readMissionSheet, STAFF_SHEET_CSV, type StaffSheet, readStaffSheet, QUARTER_COMMON_CSV, QUARTER_MISSION_CSV, QUARTER_STAFF_CSV, type QuarterCommon, readQuarterCommon } from "./sheets";

export type SheetState<T> = { data: T | null; failed: boolean };
// 마지막으로 받은 탭 원문을 기기에 둔다. 다음에 열 때 응답을 기다리지 않고 먼저 보이고, 새 응답이 오면 바꾼다.
const SHEET_CACHE_PREFIX = "heinapel-sheet-cache:";
// 폰 화면과 PC 스테프 창이 같은 시트 읽기를 쓴다. 시트를 고치면 새로고침, 앱으로 돌아올 때, 또는 30초 안에 반영된다.
export function useMissionSheets() {
  const [sheet, setSheet] = useState<SheetState<MissionSheet>>({ data: null, failed: false });
  const [staff, setStaff] = useState<SheetState<StaffSheet>>({ data: null, failed: false });
  const [quarter, setQuarter] = useState<SheetState<QuarterCommon>>({ data: null, failed: false });
  const [quarterMissions, setQuarterMissions] = useState<SheetState<MissionSheet>>({ data: null, failed: false });
  const [quarterStaff, setQuarterStaff] = useState<SheetState<StaffSheet>>({ data: null, failed: false });
  useEffect(() => {
    let alive = true;
    let latestRequest = 0;
    // 실패해도 마지막으로 읽은 내용은 그대로 두고 경고만 띄운다.
    const load = <T,>(url: string, read: (text: string) => T, set: Dispatch<SetStateAction<SheetState<T>>>, request: number) => fetch(url, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.text(); })
      .then((text) => {
        const data = read(text);
        if (!alive || request !== latestRequest) return;
        set({ data, failed: false });
        try { localStorage.setItem(SHEET_CACHE_PREFIX + url, text); } catch { /* 사본 저장 실패는 조회를 막지 않는다. */ }
      })
      .catch(() => { if (alive && request === latestRequest) set((current) => ({ ...current, failed: true })); });
    // 사본은 아직 받은 내용이 없을 때만 쓴다. 저장소를 못 쓰거나 형식이 맞지 않는 사본은 무시한다.
    const restore = <T,>(url: string, read: (text: string) => T, set: Dispatch<SetStateAction<SheetState<T>>>) => {
      try {
        const text = localStorage.getItem(SHEET_CACHE_PREFIX + url);
        if (text) { const data = read(text); set((current) => current.data ? current : { data, failed: false }); }
      } catch { /* 사본 없이 응답을 기다린다. */ }
    };
    // 탭마다 따로 읽어, 한 탭이 실패해도 다른 카드는 그대로 보인다.
    const loadAll = () => {
      // 복귀·주기 갱신이 겹쳐도 이전 응답이 최신 내용이나 실패 상태를 덮지 않게 한다.
      const request = ++latestRequest;
      load(MISSION_SHEET_CSV, readMissionSheet, setSheet, request); load(STAFF_SHEET_CSV, readStaffSheet, setStaff, request);
      load(QUARTER_COMMON_CSV, readQuarterCommon, setQuarter, request);
      load(QUARTER_MISSION_CSV, readMissionSheet, setQuarterMissions, request); load(QUARTER_STAFF_CSV, readStaffSheet, setQuarterStaff, request);
    };
    const onVisible = () => { if (document.visibilityState === "visible") loadAll(); };
    restore(MISSION_SHEET_CSV, readMissionSheet, setSheet); restore(STAFF_SHEET_CSV, readStaffSheet, setStaff);
    restore(QUARTER_COMMON_CSV, readQuarterCommon, setQuarter);
    restore(QUARTER_MISSION_CSV, readMissionSheet, setQuarterMissions); restore(QUARTER_STAFF_CSV, readStaffSheet, setQuarterStaff);
    loadAll();
    const timer = setInterval(loadAll, 30000);
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return { sheet, staff, quarter, quarterMissions, quarterStaff };
}
