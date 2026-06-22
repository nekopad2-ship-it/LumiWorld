export type PackageManifest = {
  sourceDir: string;
  outputDir: string;
  extensionId: string;
};

export type PackageResult = {
  extensionDir: string;
  repoDir: string;
};

export function shouldExcludePath(pathName: string): boolean;

export function createPackageManifest(input: {
  sourceDir: string;
  outputDir: string;
  extensionId: string;
}): PackageManifest;

export function packageExtension(manifest: PackageManifest): PackageResult;
