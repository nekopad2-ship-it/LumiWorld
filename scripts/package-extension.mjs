import { resolve } from "node:path";

import { createPackageManifest, packageExtension } from "./package-extension-lib.mjs";

const sourceDir = process.cwd();
const outputDir = resolve(sourceDir, "release", "extensions");
const extensionId = "lwe_living_world";

const manifest = createPackageManifest({
  sourceDir,
  outputDir,
  extensionId,
});

const result = packageExtension(manifest);

process.stdout.write(`Packaged extension to ${result.extensionDir}\n`);
process.stdout.write(`Repo contents written to ${result.repoDir}\n`);
