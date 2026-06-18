import { namedColor } from './colors';

export interface FontPreset {
  size: number;
  weight: number;
}

// SwiftUI Font.TextStyle -> px size + weight (approximate iOS defaults).
export const FONT_PRESETS: Record<string, FontPreset> = {
  largeTitle: { size: 34, weight: 400 },
  title: { size: 28, weight: 400 },
  title2: { size: 22, weight: 400 },
  title3: { size: 20, weight: 400 },
  headline: { size: 17, weight: 600 },
  body: { size: 17, weight: 400 },
  callout: { size: 16, weight: 400 },
  subheadline: { size: 15, weight: 400 },
  footnote: { size: 13, weight: 400 },
  caption: { size: 12, weight: 400 },
  caption2: { size: 11, weight: 400 },
};

export const FONT_WEIGHTS: Record<string, number> = {
  ultraLight: 100,
  thin: 200,
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
  black: 900,
};

/** Convert a SwiftUI color value (named string, rgb()/hex string) to a CSS color. */
export function colorToCss(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.startsWith('#') || value.startsWith('rgb') || value.startsWith('var(')) return value;
  return namedColor(value);
}

export const ALIGNMENT_TO_FLEX: Record<string, string> = {
  leading: 'flex-start',
  trailing: 'flex-end',
  center: 'center',
  top: 'flex-start',
  bottom: 'flex-end',
};

export const TEXT_ALIGN: Record<string, string> = {
  leading: 'left',
  center: 'center',
  trailing: 'right',
};

/** Known modifier names (for "is this a real modifier or a typo" diagnostics). */
export const KNOWN_MODIFIERS = new Set([
  'padding',
  'foregroundColor',
  'foregroundStyle',
  'tint',
  'accentColor',
  'background',
  'font',
  'fontWeight',
  'bold',
  'italic',
  'cornerRadius',
  'clipShape',
  'frame',
  'opacity',
  'shadow',
  'border',
  'multilineTextAlignment',
  'lineLimit',
  'navigationTitle',
  'navigationBarTitleDisplayMode',
  'sheet',
  'onTapGesture',
  'onAppear',
  'onDisappear',
  'onChange',
  'buttonStyle',
  'textFieldStyle',
  'listStyle',
  'kerning',
  'tracking',
  'blur',
  'rotationEffect',
  'scaleEffect',
  'disabled',
]);
