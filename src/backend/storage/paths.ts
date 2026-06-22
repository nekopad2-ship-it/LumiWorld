export function worldGraphPath(chatId: string): string {
  return `graphs/${chatId}/world-graph.json`;
}

export function sceneImpactPath(chatId: string): string {
  return `graphs/${chatId}/scene-impact.json`;
}

export function patchSegmentPath(chatId: string, segment: number): string {
  return `graphs/${chatId}/patches/segment-${String(segment).padStart(4, "0")}.jsonl`;
}

export function rejectedPatchSegmentPath(chatId: string, segment: number): string {
  return `graphs/${chatId}/rejected-patches/segment-${String(segment).padStart(4, "0")}.jsonl`;
}

export function decisionTraceSegmentPath(chatId: string, segment: number): string {
  return `graphs/${chatId}/decision-traces/segment-${String(segment).padStart(4, "0")}.jsonl`;
}

export function revisionSummaryPath(chatId: string, segment: number): string {
  return `graphs/${chatId}/revision-summaries/segment-${String(segment).padStart(4, "0")}.json`;
}

export function generationCorrelationPath(chatId: string, generationId: string): string {
  return `lifecycle/generations/${chatId}/${generationId}.json`;
}

export function migrationsPath(): string {
  return "migrations/applied.json";
}

export function defaultSettingsPath(): string {
  return "settings/defaults.json";
}
