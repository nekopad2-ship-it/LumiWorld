# ADR-001: Bounded Audit Storage

## Status

Accepted

## Context

Lumiverse documents scoped storage operations and file metadata, but it does not document quota guarantees or automatic compaction for extension storage. LWE Phase 1 still needs durable accepted/rejected patch records, decision traces, and later lifecycle provenance without allowing audit files to grow unbounded.

## Decision

Phase 1 uses bounded JSONL audit storage with these defaults:

- rotate after `1,000` entries or `2 MiB`, whichever comes first
- retain `5` segments per chat
- retain the latest `200` detailed rejected patches
- retain the latest `200` detailed decision traces
- compact older records into revision summaries
- never compact current canonical state, active plans, user locks, or required provenance

Rotation and compaction foundations are implemented in backend storage services. Full storage-management UI is deferred.

## Consequences

- Audit growth is predictable in operator-scoped and user-scoped installs.
- Canonical world state stays separate from bounded audit logs.
- Later phases can extend compaction summaries without changing the retention contract.
