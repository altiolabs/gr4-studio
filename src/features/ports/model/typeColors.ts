export type PortTypeColor = {
  background: string;
  border: string;
  text: string;
};

export const DEFAULT_PORT_TYPE_COLORS: Record<string, PortTypeColor> = {
  float32: { background: '#f08c00', border: '#c06f00', text: '#111827' },
  float64: { background: '#00b8d9', border: '#0092ad', text: '#05222c' },
  complexfloat32: { background: '#00a6ff', border: '#007fc2', text: '#04263a' },
  complexfloat64: { background: '#6d4c41', border: '#51372f', text: '#f8fafc' },
  int8: { background: '#c200ff', border: '#8f00bb', text: '#f8fafc' },
  int16: { background: '#f5c400', border: '#bc9400', text: '#111827' },
  int32: { background: '#00897b', border: '#006d62', text: '#e6fffb' },
  int64: { background: '#c0a000', border: '#8f7700', text: '#111827' },
  uint8: { background: '#c200ff', border: '#8f00bb', text: '#f8fafc' },
  uint16: { background: '#f5c400', border: '#bc9400', text: '#111827' },
  uint32: { background: '#00897b', border: '#006d62', text: '#e6fffb' },
  uint64: { background: '#c0a000', border: '#8f7700', text: '#111827' },
  bool: { background: '#9ca3af', border: '#6b7280', text: '#111827' },
  bit: { background: '#cc8be9', border: '#9b60b7', text: '#111827' },
  string: { background: '#9ca3af', border: '#6b7280', text: '#111827' },
  message: { background: '#9ca3af', border: '#6b7280', text: '#111827' },
  wildcard: { background: '#f3f4f6', border: '#9ca3af', text: '#111827' },
};

export function normalizeTypeName(typeName?: string): string {
  if (!typeName) {
    return '';
  }

  return typeName
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function hashToColor(text: string): PortTypeColor {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return {
    background: `hsl(${hue} 70% 42%)`,
    border: `hsl(${hue} 75% 30%)`,
    text: '#f8fafc',
  };
}

export function getPortTypeColor(typeName?: string): PortTypeColor {
  const normalized = normalizeTypeName(typeName);

  if (!normalized) {
    return {
      background: '#0f172a',
      border: '#64748b',
      text: '#cbd5e1',
    };
  }

  return DEFAULT_PORT_TYPE_COLORS[normalized] ?? hashToColor(normalized);
}
