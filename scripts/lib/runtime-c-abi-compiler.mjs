export function selectCCompiler({
  platform,
  requested,
  commandExists,
  findVcvars64 = () => null,
}) {
  const requestedCompiler = requested?.trim();
  if (requestedCompiler && commandExists(requestedCompiler)) {
    return { command: requestedCompiler, kind: compilerKind(requestedCompiler) };
  }

  if (platform === "win32") {
    if (commandExists("cl")) {
      return { command: "cl", kind: "msvc" };
    }
    const vcvars = findVcvars64();
    return vcvars ? { command: "cl", kind: "msvc", vcvars } : null;
  }

  for (const command of ["cc", "gcc", "clang"]) {
    if (commandExists(command)) {
      return { command, kind: "unix" };
    }
  }
  return null;
}

export function compilerKind(command) {
  const baseName = String(command).replaceAll("\\", "/").split("/").at(-1).toLowerCase();
  return baseName === "cl" || baseName === "cl.exe" || baseName.startsWith("clang-cl")
    ? "msvc"
    : "unix";
}

export function msvcCompileAndLinkArgs({
  includeDir,
  sourcePath,
  executablePath,
  objectPath,
  importLibraryPath,
}) {
  return [
    "/nologo",
    "/std:c11",
    "/W4",
    "/WX",
    "/utf-8",
    `/I${includeDir}`,
    sourcePath,
    `/Fe:${executablePath}`,
    `/Fo:${objectPath}`,
    "/link",
    importLibraryPath,
  ];
}
