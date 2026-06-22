import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPackageManifest,
  packageExtension,
  shouldExcludePath,
} from "../../scripts/package-extension-lib.mjs";

test("packaging excludes git metadata and bulky dev folders", () => {
  assert.equal(shouldExcludePath(".git"), true);
  assert.equal(shouldExcludePath("node_modules"), true);
  assert.equal(shouldExcludePath("dist"), true);
  assert.equal(shouldExcludePath("release"), true);
  assert.equal(shouldExcludePath("src"), false);
  assert.equal(shouldExcludePath("spindle.json"), false);
});

test("packaging copies a clean installable tree without .git", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "lwe-package-test-"));
  const sourceDir = join(tempRoot, "source");
  const outputDir = join(tempRoot, "output");

  mkdirSync(join(sourceDir, ".git", "objects"), { recursive: true });
  mkdirSync(join(sourceDir, "node_modules", "leftpad"), { recursive: true });
  mkdirSync(join(sourceDir, "src", "backend", "storage"), { recursive: true });
  writeFileSync(join(sourceDir, "spindle.json"), '{"identifier":"lwe_living_world"}');
  writeFileSync(
    join(sourceDir, "src", "backend", "storage", "spindle-storage.ts"),
    "export const marker = true;\n",
  );
  writeFileSync(join(sourceDir, ".git", "objects", "pack.idx"), "locked");
  writeFileSync(join(sourceDir, "node_modules", "leftpad", "index.js"), "module.exports = 1;");

  const manifest = createPackageManifest({
    sourceDir,
    outputDir,
    extensionId: "lwe_living_world",
  });
  const result = packageExtension(manifest);

  assert.equal(result.extensionDir.endsWith("lwe_living_world"), true);
  assert.equal(result.repoDir.endsWith("lwe_living_world\\repo"), true);
  assert.equal(
    readFileSync(join(result.repoDir, "src", "backend", "storage", "spindle-storage.ts"), "utf8"),
    "export const marker = true;\n",
  );
  assert.throws(() => readFileSync(join(result.repoDir, ".git", "objects", "pack.idx"), "utf8"));
  assert.throws(() => readFileSync(join(result.repoDir, "node_modules", "leftpad", "index.js"), "utf8"));
});
