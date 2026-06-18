export type StateValue = unknown;

export interface Binding {
  get: () => StateValue;
  set: (v: StateValue) => void;
}

/**
 * Runtime store for @State values. Independent of React; the preview hook
 * subscribes and re-runs the evaluator whenever a value changes.
 */
export class StateStore {
  private values = new Map<string, StateValue>();
  private listeners = new Set<() => void>();

  init(name: string, value: StateValue): void {
    if (!this.values.has(name)) this.values.set(name, value);
  }
  /** Force-set the initial value (used when re-seeding on code change). */
  seed(name: string, value: StateValue): void {
    this.values.set(name, value);
  }
  has(name: string): boolean {
    return this.values.has(name);
  }
  get(name: string): StateValue {
    return this.values.get(name);
  }
  set(name: string, value: StateValue): void {
    this.values.set(name, value);
    this.emit();
  }
  binding(name: string): Binding {
    return {
      get: () => this.values.get(name),
      set: (v) => this.set(name, v),
    };
  }
  keys(): string[] {
    return [...this.values.keys()];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}
