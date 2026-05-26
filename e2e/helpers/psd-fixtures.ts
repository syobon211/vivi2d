import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SIMPLE_PSD = path.resolve(ROOT, "fixtures/test.psd");
const CHARACTER_PSD = path.resolve(ROOT, "fixtures/character-test.psd");
const PRACTICAL_PSD = path.resolve(ROOT, "fixtures/practical.psd");

export function resolveSimplePsdPath(): string {
  return SIMPLE_PSD;
}

export function resolveCharacterPsdPath(): string {
  return CHARACTER_PSD;
}

export function resolveOptionalPracticalPsdPath(): string | null {
  return existsSync(PRACTICAL_PSD) ? PRACTICAL_PSD : null;
}
