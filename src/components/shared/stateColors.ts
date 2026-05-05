const acceptingStates = ['accept', 'accepted', 'done'];
const rejectingStates = ['reject', 'rejected', 'error'];

export function normalizeColor(color?: string): string | undefined {
  if (!color) return undefined;
  // Convert 8-digit hex (#RRGGBBAA) to rgba() because Cytoscape can be picky.
  const m = /^#([0-9a-fA-F]{8})$/.exec(color);
  if (m) {
    const hex = m[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
}

export function resolveStateColor(
  stateName: string | undefined,
  mapping: Map<string, string>
): string | undefined {
  const key = (stateName ?? '').trim();
  if (!key) return undefined;
  const direct = mapping.get(key) ?? mapping.get(String(key));
  if (direct) return normalizeColor(direct);
  const lower = key.toLowerCase();
  if (acceptingStates.includes(lower)) return 'accept';
  if (rejectingStates.includes(lower)) return 'reject';
  return undefined;
}
