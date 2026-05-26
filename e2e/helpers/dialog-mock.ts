import type { ElectronApplication } from "playwright";

export async function mockOpenPsd(
  app: ElectronApplication,
  psdPath: string,
): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [p],
    });
  }, psdPath);
}

export async function mockOpenPng(
  app: ElectronApplication,
  pngPath: string,
): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [p],
    });
  }, pngPath);
}

export async function mockOpenPngs(
  app: ElectronApplication,
  pngPaths: string[],
): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: paths,
    });
  }, pngPaths);
}

export async function mockOpenPngFolder(
  app: ElectronApplication,
  folderPath: string,
): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [p],
    });
  }, folderPath);
}

export async function mockCancelOpenDialog(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({
      canceled: true,
      filePaths: [],
    });
  });
}

export async function mockSaveDialog(
  app: ElectronApplication,
  savePath: string,
): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: p,
    });
  }, savePath);
}

export async function mockOpenVivi(
  app: ElectronApplication,
  viviPath: string,
): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [p],
    });
  }, viviPath);
}
