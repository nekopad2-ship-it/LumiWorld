import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const EXCLUDED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "release",
  ".agents",
  "tests",
  "scripts",
]);

export function shouldExcludePath(pathName) {
  return EXCLUDED_NAMES.has(pathName);
}

export function createPackageManifest({ sourceDir, outputDir, extensionId }) {
  return {
    sourceDir: resolve(sourceDir),
    outputDir: resolve(outputDir),
    extensionId,
  };
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function copyRecursive(sourcePath, targetPath) {
  const stats = statSync(sourcePath);
  if (stats.isDirectory()) {
    ensureDir(targetPath);
    for (const entry of readdirSync(sourcePath)) {
      if (shouldExcludePath(entry)) {
        continue;
      }
      copyRecursive(join(sourcePath, entry), join(targetPath, entry));
    }
    return;
  }

  ensureDir(dirname(targetPath));
  cpSync(sourcePath, targetPath, { force: true });
}

export function packageExtension(manifest) {
  const extensionDir = join(manifest.outputDir, manifest.extensionId);
  const repoDir = join(extensionDir, "repo");
  if (existsSync(extensionDir)) {
    rmSync(extensionDir, { recursive: true, force: true });
  }

  ensureDir(repoDir);

  for (const entry of readdirSync(manifest.sourceDir)) {
    if (shouldExcludePath(entry)) {
      continue;
    }
    copyRecursive(
      join(manifest.sourceDir, entry),
      join(repoDir, basename(entry)),
    );
  }

  return {
    extensionDir,
    repoDir,
  };
}
