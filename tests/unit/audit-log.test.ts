import { test } from "node:test";
import assert from "node:assert/strict";

import { createAuditLogService } from "../../src/backend/storage/audit-log.js";
import { createInMemoryStorage } from "../../src/backend/storage/memory-storage.js";

test("audit log rotates when entry threshold is exceeded", async () => {
  const storage = createInMemoryStorage();
  const audit = createAuditLogService({
    storage,
    policy: {
      maxEntriesPerSegment: 2,
      maxBytesPerSegment: 2048,
      maxSegmentsPerChat: 5,
      maxDetailedRejectedPatches: 200,
      maxDetailedDecisionTraces: 200,
    },
  });

  await audit.appendPatchRecord("chat-1", {
    kind: "accepted",
    patchId: "1",
    revision: 1,
  });
  await audit.appendPatchRecord("chat-1", {
    kind: "accepted",
    patchId: "2",
    revision: 2,
  });
  await audit.appendPatchRecord("chat-1", {
    kind: "accepted",
    patchId: "3",
    revision: 3,
  });

  const segments = await audit.listPatchSegments("chat-1");
  assert.equal(segments.length, 2);
});
