const TECHNICAL_NAME_PATTERN = /^v2d\[([^\]]+)\]\s*(.*)$/;

export function buildSeeThroughTechnicalName(token: string, name: string): string {
  return `v2d[${token}] ${name}`;
}

export function stripSeeThroughTechnicalName(name: string): string {
  const match = name.match(TECHNICAL_NAME_PATTERN);
  if (!match) return name;
  const stripped = match[2]?.trim();
  return stripped && stripped.length > 0 ? stripped : name;
}

export function hasSeeThroughTechnicalNamePrefix(name: string): boolean {
  return TECHNICAL_NAME_PATTERN.test(name);
}

export function parseSeeThroughLeafToken(name: string): string | null {
  const match = name.match(TECHNICAL_NAME_PATTERN);
  return match?.[1] ?? null;
}
