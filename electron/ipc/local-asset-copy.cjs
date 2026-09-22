const { dialog } = require("electron");

function register({ handle, coordinator, Fault, getMainWindow }) {
  let renderer = null;
  function owner(event) {
    if (renderer?.contents === event.sender) return renderer;
    if (renderer) coordinator.rendererLost(renderer);
    const current = { contents: event.sender };
    renderer = current;
    const lost = () => {
      event.sender.removeListener("destroyed", lost);
      event.sender.removeListener("render-process-gone", lost);
      event.sender.removeListener("did-start-navigation", navigated);
      coordinator.rendererLost(current);
      if (renderer === current) renderer = null;
    };
    const navigated = (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) lost();
    };
    event.sender.once("destroyed", lost);
    event.sender.once("render-process-gone", lost);
    event.sender.on("did-start-navigation", navigated);
    return current;
  }
  handle("local-asset-copy", async (event, args) => {
    // The common wrapper already checked the top-level frame and closed payload.
    if (event.sender !== getMainWindow()?.webContents)
      throw new Error("Untrusted local Asset copy sender.");
    const current = owner(event);
    try {
      let value;
      switch (args.operation) {
        case "preview":
          value = await coordinator.preview(current, args.cellId, async () => {
            const result = await dialog.showOpenDialog(getMainWindow(), {
              properties: ["openFile"],
              filters: [{ name: "Vivi2D Project", extensions: ["vivi"] }],
            });
            return result.canceled || result.filePaths.length !== 1
              ? null
              : result.filePaths[0];
          });
          break;
        case "cancelPreview":
          coordinator.cancelPreview(current);
          value = null;
          break;
        case "prepare":
          value = await coordinator.prepare(
            current,
            args.sourceCellId,
            args.receiverCellId,
            async () => {
              const result = await dialog.showOpenDialog(getMainWindow(), {
                properties: ["openFile"],
                filters: [{ name: "Vivi2D Project", extensions: ["vivi"] }],
              });
              return result.canceled || result.filePaths.length !== 1
                ? null
                : result.filePaths[0];
            },
          );
          break;
        case "commit":
          value = await coordinator.commit(current, args.copyId, async () => {
            const result = await dialog.showSaveDialog(getMainWindow(), {
              defaultPath: "project-copy.vivi",
              filters: [{ name: "Vivi2D Project", extensions: ["vivi"] }],
              properties: ["showOverwriteConfirmation"],
            });
            return result.canceled || !result.filePath ? null : result.filePath;
          });
          break;
        case "cancel":
          coordinator.cancel(current, args.copyId);
          value = null;
          break;
        default:
          throw new Error("Invalid local Asset copy command.");
      }
      return { ok: true, value };
    } catch (error) {
      const known = error instanceof Fault;
      return {
        ok: false,
        code:
          known && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
            ? error.code
            : "LOCAL_ASSET_INTERNAL",
        // Unknown result delivery is not evidence that a mutating call did nothing.
        outcomeMayHaveCommitted: known
          ? error.outcomeMayHaveCommitted
          : args.operation === "commit",
      };
    }
  });
  return { close: () => coordinator.close() };
}
module.exports = { register };
