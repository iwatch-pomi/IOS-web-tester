import { useEffect, useMemo, useReducer } from 'react';
import { prepare, render, type RenderOutput } from '../interpreter';
import type { StateStore } from '../interpreter/stateStore';

/**
 * Parse + evaluate Swift source, subscribing to the interpreter's state store
 * so the preview re-evaluates after every interaction (button tap, toggle, etc.).
 */
export function usePreview(source: string): RenderOutput & { store: StateStore } {
  const prepared = useMemo(() => prepare(source), [source]);
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => prepared.store.subscribe(force), [prepared]);

  // Re-evaluated on every render; cheap because it only walks a small AST.
  const output = render(prepared);
  return { ...output, store: prepared.store };
}
