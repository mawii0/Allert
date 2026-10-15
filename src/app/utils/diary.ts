import type { HealthLogEntry } from "./auth";
import { privateApi } from "./private-api";

export interface DiaryEntry extends HealthLogEntry { revision: number; updatedAt?: string; }
export interface DiaryFields {
  vasScore: number; tnssScore: number; notes: string;
  symptomSeverities?: Record<string, number>; observedAt?: string;
}
export const summaryScore = (vas: number, tnss: number) => Math.min(Math.round(vas * 3 + tnss * 1.5), 50);
export const loadDiary = (signal?: AbortSignal) => privateApi<{ logs: DiaryEntry[]; history_limit?: number; truncated?: boolean }>("/health-logs", { signal });
export const createDiaryEntry = (fields: DiaryFields, requestId: string) => privateApi<{ entry: DiaryEntry }>("/health-logs", {
  method: "POST", body: { ...fields, riskLevel: summaryScore(fields.vasScore, fields.tnssScore), requestId },
});
export const updateDiaryEntry = (entry: DiaryEntry, fields: DiaryFields) => privateApi<{ entry: DiaryEntry }>(`/health-logs/${encodeURIComponent(entry.id)}`, {
  method: "PUT", body: { ...fields, riskLevel: summaryScore(fields.vasScore, fields.tnssScore), revision: entry.revision || 1 },
});
export const deleteDiaryEntry = (entry: DiaryEntry) => privateApi<{ deleted: boolean }>(`/health-logs/${encodeURIComponent(entry.id)}`, {
  method: "DELETE", body: { revision: entry.revision || 1 },
});
