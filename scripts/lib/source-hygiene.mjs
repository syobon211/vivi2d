export const MOJIBAKE_MARKERS = new Set([
  "\ufffd",
  "\u7e3a",
  "\u7e5d",
  "\u7e67",
  "\u8373",
  "\u8b41",
  "\u8b5b",
  "\u8b28",
  "\u873f",
  "\u879f",
  "\u9015",
  "\u90a8",
  "\u9ae2",
]);

const MOJIBAKE_TEXT_PATTERNS = [
  /\u00c3[\u0080-\u00bf]/,
  /\u00e2(?:\u20ac|\u2122|\u0153|\u00a6|\u00a8)/,
  /\u00ef\u00bc[\u0080-\u00bf]?/,
];

export function containsNonAscii(text) {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 127) return true;
  }
  return false;
}

export function containsMojibakeMarker(text) {
  for (const char of text) {
    if (MOJIBAKE_MARKERS.has(char)) return true;
  }
  return MOJIBAKE_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

export function looksLikeComment(trimmed) {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("{/*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("* ") ||
    trimmed.startsWith("*\t") ||
    trimmed.startsWith("*/") ||
    trimmed === "*" ||
    trimmed.endsWith("*/}") ||
    trimmed.endsWith("*/")
  );
}
