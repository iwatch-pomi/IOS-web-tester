/** Resolved style produced from SwiftUI modifiers (a plain CSS-ish object + flags). */
export interface ResolvedStyle {
  css: Record<string, string | number>;
  /** navigationTitle text bubbled up to a NavigationStack ancestor. */
  navigationTitle?: string;
  /** sheet presentation: binding path + content views. */
  sheet?: { bindingPath: string; content: ViewNode[] };
  /** tap action id registered for .onTapGesture */
  tapActionId?: string;
}

export type ViewNode =
  | { type: 'text'; text: string; style: ResolvedStyle }
  | { type: 'image'; symbol: string; style: ResolvedStyle }
  | { type: 'spacer'; style: ResolvedStyle }
  | { type: 'divider'; style: ResolvedStyle }
  | {
      type: 'stack';
      axis: 'v' | 'h' | 'z';
      spacing: number | null;
      alignment: string | null;
      scroll: boolean;
      children: ViewNode[];
      style: ResolvedStyle;
    }
  | { type: 'button'; label: ViewNode[]; actionId: string | null; style: ResolvedStyle }
  | { type: 'toggle'; label: ViewNode[]; bindingPath: string | null; value: boolean; style: ResolvedStyle }
  | {
      type: 'textfield';
      placeholder: string;
      bindingPath: string | null;
      value: string;
      secure: boolean;
      style: ResolvedStyle;
    }
  | { type: 'list'; children: ViewNode[]; style: ResolvedStyle }
  | {
      type: 'navStack';
      title: string | null;
      children: ViewNode[];
      style: ResolvedStyle;
    }
  | { type: 'navLink'; label: ViewNode[]; destination: ViewNode[]; style: ResolvedStyle }
  | { type: 'unsupported'; label: string; style: ResolvedStyle };

export function emptyStyle(): ResolvedStyle {
  return { css: {} };
}
