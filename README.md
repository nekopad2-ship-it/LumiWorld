# Living World Engine

Phase 1 foundation for a standalone Lumiverse Spindle extension.

## Commands

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:integration`
- `npm run package:extension`

## Packaging

`npm run package:extension` creates a clean installable copy under `release/extensions/lwe_living_world` and excludes `.git`, `node_modules`, `dist`, and `release`.

The packaged repo is written to `release/extensions/lwe_living_world/repo` to match Lumiverse's managed extension layout.
