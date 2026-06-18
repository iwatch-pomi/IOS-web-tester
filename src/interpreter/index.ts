import { parse } from './parser';
import { Evaluator } from './evaluator';
import { StateStore } from './stateStore';
import type { Diagnostic } from './diagnostics';
import type { ViewNode } from './viewNode';
import type { Program } from './ast';

export type { Diagnostic } from './diagnostics';
export type { ViewNode, ResolvedStyle } from './viewNode';
export { StateStore } from './stateStore';

export interface Prepared {
  program: Program;
  store: StateStore;
  evaluator: Evaluator;
  parseDiagnostics: Diagnostic[];
}

/**
 * Parse Swift source and seed @State. Returns a reusable evaluator + store.
 * Call `render()` to produce the current ViewNode tree; it re-runs cheaply
 * after every state mutation.
 */
export function prepare(source: string): Prepared {
  const { program, diagnostics } = parse(source);
  const store = new StateStore();
  const evaluator = new Evaluator(program, store);
  evaluator.seedState();
  return { program, store, evaluator, parseDiagnostics: diagnostics };
}

export interface RenderOutput {
  root: ViewNode[];
  diagnostics: Diagnostic[];
  actions: Map<string, () => void>;
}

export function render(prepared: Prepared): RenderOutput {
  const { root, diagnostics, actions } = prepared.evaluator.evaluate();
  return { root, diagnostics: [...prepared.parseDiagnostics, ...diagnostics], actions };
}
