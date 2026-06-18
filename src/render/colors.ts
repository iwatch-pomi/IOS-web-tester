// SwiftUI named colors -> approximate iOS system color CSS values (light mode).
const NAMED: Record<string, string> = {
  red: '#ff3b30',
  orange: '#ff9500',
  yellow: '#ffcc00',
  green: '#34c759',
  mint: '#00c7be',
  teal: '#30b0c7',
  cyan: '#32ade6',
  blue: '#007aff',
  indigo: '#5856d6',
  purple: '#af52de',
  pink: '#ff2d55',
  brown: '#a2845e',
  gray: '#8e8e93',
  grey: '#8e8e93',
  black: '#000000',
  white: '#ffffff',
  clear: 'transparent',
  primary: 'var(--label)',
  secondary: 'var(--secondary-label)',
  accentColor: '#007aff',
  accent: '#007aff',
};

export function namedColor(name: string): string | null {
  return NAMED[name] ?? null;
}

/** Build a CSS color from a SwiftUI Color(red:green:blue:) component set (0..1). */
export function rgbColor(r: number, g: number, b: number, a = 1): string {
  const ch = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
  return a >= 1 ? `rgb(${ch(r)}, ${ch(g)}, ${ch(b)})` : `rgba(${ch(r)}, ${ch(g)}, ${ch(b)}, ${a})`;
}
