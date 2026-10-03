import { useCallback, useReducer } from "react";
import type { Operation } from "./war-table";

type History = { present: Operation; past: Operation[]; future: Operation[] };
type Action =
  | { type: "commit" | "update"; updater: (current: Operation) => Operation; at: string }
  | { type: "restore"; operation: Operation }
  | { type: "checkpoint" }
  | { type: "undo"; at: string }
  | { type: "redo"; at: string };

export function initialHistory(present: Operation): History {
  return { present, past: [], future: [] };
}

// 기록도 상태로 관리한다. React가 같은 전이를 재실행해도 원본 기록을 변경하지 않는다.
export function operationHistory(state: History, action: Action): History {
  if (action.type === "restore") return initialHistory(action.operation);
  if (action.type === "checkpoint") return { ...state, past: [...state.past.slice(-59), state.present], future: [] };
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous ? { present: { ...previous, updatedAt: action.at }, past: state.past.slice(0, -1), future: [...state.future, state.present] } : state;
  }
  if (action.type === "redo") {
    const next = state.future.at(-1);
    return next ? { present: { ...next, updatedAt: action.at }, past: [...state.past.slice(-59), state.present], future: state.future.slice(0, -1) } : state;
  }
  const next = action.updater(structuredClone(state.present));
  if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
  return {
    present: { ...next, updatedAt: action.at },
    past: action.type === "commit" ? [...state.past.slice(-59), state.present] : state.past,
    future: action.type === "commit" ? [] : state.future,
  };
}

export function useOperationHistory(create: () => Operation) {
  const [state, dispatch] = useReducer(operationHistory, undefined, () => initialHistory(create()));
  const commit = useCallback((updater: (current: Operation) => Operation) => dispatch({ type: "commit", updater, at: new Date().toISOString() }), []);
  const setOperation = useCallback((updater: (current: Operation) => Operation) => dispatch({ type: "update", updater, at: new Date().toISOString() }), []);
  const checkpoint = useCallback(() => dispatch({ type: "checkpoint" }), []);
  const restore = useCallback((operation: Operation) => dispatch({ type: "restore", operation }), []);
  const undo = () => dispatch({ type: "undo", at: new Date().toISOString() });
  const redo = () => dispatch({ type: "redo", at: new Date().toISOString() });
  return { operation: state.present, canUndo: state.past.length > 0, canRedo: state.future.length > 0, commit, setOperation, checkpoint, restore, undo, redo };
}
