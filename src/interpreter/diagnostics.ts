export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;
  line: number; // 1-based; 0 when unknown
  col: number; // 1-based; 0 when unknown
  /** Optional hint that reassures the user their Swift still compiles on a real device. */
  compilesOnDevice?: boolean;
}

export function makeDiagnostic(
  severity: Severity,
  message: string,
  line = 0,
  col = 0,
  compilesOnDevice = false,
): Diagnostic {
  return { severity, message, line, col, compilesOnDevice };
}
