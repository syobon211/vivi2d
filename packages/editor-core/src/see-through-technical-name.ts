const TECHNICAL_NAME_PREFIX = "v2d[";

function parseSeeThroughTechnicalName(
  name: string,
): { token: string; displayName: string } | null {
  if (!name.startsWith(TECHNICAL_NAME_PREFIX)) return null;
  const tokenStart = TECHNICAL_NAME_PREFIX.length;
  const tokenEnd = name.indexOf("]", tokenStart);
  if (tokenEnd <= tokenStart) return null;
  return {
    token: name.slice(tokenStart, tokenEnd),
    displayName: name.slice(tokenEnd + 1).trimStart(),
  };
}

export function buildSeeThroughTechnicalName(token: string, name: string): string {
  return `v2d[${token}] ${name}`;
}

export function stripSeeThroughTechnicalName(name: string): string {
  const parsed = parseSeeThroughTechnicalName(name);
  if (!parsed) return name;
  const stripped = parsed.displayName.trim();
  return stripped && stripped.length > 0 ? stripped : name;
}

export function hasSeeThroughTechnicalNamePrefix(name: string): boolean {
  return parseSeeThroughTechnicalName(name) !== null;
}

export function parseSeeThroughLeafToken(name: string): string | null {
  return parseSeeThroughTechnicalName(name)?.token ?? null;
}
