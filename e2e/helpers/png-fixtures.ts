import fs from "node:fs";
import path from "node:path";

export const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY/jPwPAfAAUAAf+mXJtdAAAAAElFTkSuQmCC";
export const TWO_BY_TWO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAARSURBVBhXY/jPwPAfhBlgDABHygf5POQJCgAAAABJRU5ErkJggg==";
export const TRIMMED_FOUR_BY_FOUR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAVSURBVBhXY2DABv4zMPwHYdwCyAAAD0MH+Tm7ojYAAAAASUVORK5CYII=";

export function writeBase64Png(filePath: string, base64: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
}

export function createPngFixtureSet(rootDir: string) {
  const themeLightPath = path.join(rootDir, "theme-light.png");
  const initialLaunchPath = path.join(rootDir, "initial-launch.png");
  writeBase64Png(themeLightPath, TWO_BY_TWO_PNG_BASE64);
  writeBase64Png(initialLaunchPath, ONE_BY_ONE_PNG_BASE64);
  return {
    themeLightPath,
    initialLaunchPath,
  };
}
