import {
  decisionTraceSegmentPath,
  patchSegmentPath,
  rejectedPatchSegmentPath,
  revisionSummaryPath
} from "./paths.js";
import type { JsonStorage } from "./types.js";

type AuditPolicy = {
  maxEntriesPerSegment: number;
  maxBytesPerSegment: number;
  maxSegmentsPerChat: number;
  maxDetailedRejectedPatches: number;
  maxDetailedDecisionTraces: number;
};

type AppendRecord = Record<string, unknown>;

export function createAuditLogService(input: { storage: JsonStorage; policy?: AuditPolicy }) {
  const policy: AuditPolicy = input.policy ?? {
    maxEntriesPerSegment: 1000,
    maxBytesPerSegment: 2 * 1024 * 1024,
    maxSegmentsPerChat: 5,
    maxDetailedRejectedPatches: 200,
    maxDetailedDecisionTraces: 200
  };

  async function appendLine(pathFactory: (segment: number) => string, chatId: string, entry: AppendRecord): Promise<void> {
    const segments = await listSegments(pathFactory);
    const lastSegment = segments.at(-1) ?? 0;
    const line = `${JSON.stringify({ ...entry, recordedAt: new Date().toISOString() })}\n`;
    const currentPath = pathFactory(lastSegment);
    const currentRaw = (await input.storage.exists(currentPath)) ? await input.storage.read(currentPath) : "";
    const currentEntries = currentRaw.length === 0 ? 0 : currentRaw.trimEnd().split("\n").length;
    const currentBytes = currentRaw.length;
    const needsRotate =
      currentEntries >= policy.maxEntriesPerSegment || currentBytes + line.length > policy.maxBytesPerSegment;

    const targetSegment = needsRotate ? lastSegment + 1 : lastSegment;
    const targetPath = pathFactory(targetSegment);
    const targetRaw = needsRotate ? "" : currentRaw;
    await input.storage.write(targetPath, `${targetRaw}${line}`);

    await trimSegments(pathFactory, chatId);
  }

  async function listSegments(pathFactory: (segment: number) => string): Promise<number[]> {
    const prefix = pathFactory(0).replace(/segment-0000\.jsonl$/, "");
    const files = await input.storage.list(prefix);
    const numbers = files
      .map((file) => Number(file.match(/segment-(\d+)\.jsonl$/)?.[1] ?? "0"))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    return numbers.length > 0 ? numbers : [0];
  }

  async function trimSegments(pathFactory: (segment: number) => string, chatId: string): Promise<void> {
    const segments = await listSegments(pathFactory);
    if (segments.length <= policy.maxSegmentsPerChat) {
      return;
    }

    const overflow = segments.slice(0, segments.length - policy.maxSegmentsPerChat);
    for (const segment of overflow) {
      const path = pathFactory(segment);
      if (await input.storage.exists(path)) {
        const raw = await input.storage.read(path);
        const entries = raw
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { patchId?: string; revision?: number });
        await input.storage.setJson(revisionSummaryPath(chatId, segment), {
          compactedAt: new Date().toISOString(),
          count: entries.length,
          revisions: entries.map((entry) => entry.revision).filter((value) => typeof value === "number"),
          patchIds: entries.map((entry) => entry.patchId).filter((value): value is string => typeof value === "string")
        });
        await input.storage.write(path, "");
      }
    }
  }

  return {
    policy,
    appendPatchRecord(chatId: string, entry: AppendRecord) {
      return appendLine((segment) => patchSegmentPath(chatId, segment), chatId, entry);
    },
    appendRejectedPatchRecord(chatId: string, entry: AppendRecord) {
      return appendLine((segment) => rejectedPatchSegmentPath(chatId, segment), chatId, entry);
    },
    appendDecisionTrace(chatId: string, entry: AppendRecord) {
      return appendLine((segment) => decisionTraceSegmentPath(chatId, segment), chatId, entry);
    },
    async listPatchSegments(chatId: string) {
      const prefix = patchSegmentPath(chatId, 0).replace(/segment-0000\.jsonl$/, "");
      return (await input.storage.list(prefix)).filter((file) => !file.endsWith(".json"));
    }
  };
}
