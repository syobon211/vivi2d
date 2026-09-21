// Editor-only electron-builder hook. Throws before installer generation.
module.exports = async (context) => {
  if (context.electronPlatformName !== "win32") {
    throw Error("Local Asset package acceptance requires Windows");
  }
  const { verifyLocalAssetPackage } = await import("./lib/local-asset-package.mjs");
  verifyLocalAssetPackage({
    root: context.packager.projectDir,
    appOutDir: context.appOutDir,
  });
};
