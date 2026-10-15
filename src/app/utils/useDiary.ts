import { useEffect, useRef, useState } from "react";
import { getCurrentUser } from "./auth";
import { loadDiary, createDiaryEntry, updateDiaryEntry, deleteDiaryEntry, type DiaryEntry, type DiaryFields } from "./diary";

export function useDiary() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  const mounted = useRef(false);
  const operationBusy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; revision.current++; };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const requestRevision = ++revision.current;
    const account = getCurrentUser().id;
    setLoading(true); setError(""); setEntries([]); setTruncated(false);
    void loadDiary(controller.signal).then(result => {
      if (!Array.isArray(result.logs)) throw new Error("Invalid diary response. Check the backend deployment.");
      if (active && revision.current === requestRevision && getCurrentUser().id === account) {
        setEntries(result.logs); setTruncated(Boolean(result.truncated));
      }
    }).catch(error => {
      if (active && revision.current === requestRevision) setError(error instanceof Error ? error.message : "Unable to load history.");
    }).finally(() => { if (active && revision.current === requestRevision) setLoading(false); });
    const reset = () => { revision.current++; controller.abort(); operationBusy.current = false; setEntries([]); setError(""); setTruncated(false); setBusy(false); setLoading(true); setAttempt(value => value + 1); };
    window.addEventListener("storage", reset);
    window.addEventListener("allert-session-changed", reset);
    return () => {
      active = false; controller.abort();
      window.removeEventListener("storage", reset);
      window.removeEventListener("allert-session-changed", reset);
    };
  }, [attempt]);

  async function mutate(operation: () => Promise<unknown>) {
    if (operationBusy.current) return false;
    operationBusy.current = true;
    const account = getCurrentUser().id;
    const mutationRevision = revision.current;
    setBusy(true); setError("");
    try {
      await operation();
      if (!mounted.current || getCurrentUser().id !== account || revision.current !== mutationRevision) return false;
      setAttempt(value => value + 1);
      return true;
    } catch (error) {
      if (mounted.current && getCurrentUser().id === account && revision.current === mutationRevision) setError(error instanceof Error ? error.message : "Unable to update entry.");
      return false;
    } finally {
      if (mounted.current && getCurrentUser().id === account && revision.current === mutationRevision) { operationBusy.current = false; setBusy(false); }
    }
  }
  return { entries, loading, error, busy, truncated, retry: () => setAttempt(value => value + 1),
    create: (fields: DiaryFields, id: string) => mutate(() => createDiaryEntry(fields, id)),
    update: (entry: DiaryEntry, fields: DiaryFields) => mutate(() => updateDiaryEntry(entry, fields)),
    remove: (entry: DiaryEntry) => mutate(() => deleteDiaryEntry(entry)),
  };
}
