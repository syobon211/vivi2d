import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(root, "packages", "web");
const distDir = path.join(packageDir, "dist");
const generatedTypesDir = path.join(distDir, ".types", "web", "src");
const outputFiles = [
  "index.d.ts",
  "auto-register.d.ts",
  "vivi-model-element.d.ts",
  "errors.d.ts",
  "model-loader.d.ts",
  "player.d.ts",
];
const forbiddenTypeImports = /from\s+["']@vivi2d\//;
const allowedRelativeTypeImports = new Set(
  outputFiles.map((fileName) => `./${fileName.replace(/\.d\.ts$/, "")}`),
);
const relativeTypeImports = /from\s+["'](\.\/[^"']+)["']/g;

for (const fileName of outputFiles) {
  const sourcePath = path.join(generatedTypesDir, fileName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `Missing generated web type file: ${path.relative(root, sourcePath)}`,
    );
  }

  const text = fs.readFileSync(sourcePath, "utf8");
  if (forbiddenTypeImports.test(text)) {
    throw new Error(
      `${path.relative(root, sourcePath)} leaks an internal @vivi2d workspace import.`,
    );
  }
  for (const match of text.matchAll(relativeTypeImports)) {
    const target = match[1];
    if (!allowedRelativeTypeImports.has(target)) {
      throw new Error(
        `${path.relative(root, sourcePath)} imports non-public web type module: ${target}`,
      );
    }
  }

  fs.writeFileSync(path.join(distDir, fileName), text);
}

fs.rmSync(path.join(distDir, ".types"), { recursive: true, force: true });

console.log(
  `[extract-web-types] wrote ${outputFiles.map((file) => `dist/${file}`).join(", ")}`,
);
