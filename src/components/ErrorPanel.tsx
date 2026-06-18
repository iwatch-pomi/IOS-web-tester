import type { Diagnostic } from '../interpreter';

export function ErrorPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) {
    return <div className="error-panel error-panel-ok">✓ プレビュー可能な構文です</div>;
  }
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  return (
    <div className="error-panel">
      <div className="error-summary">
        診断: <span className="badge-error">{errors} エラー</span>{' '}
        <span className="badge-warn">{warnings} 警告</span>
      </div>
      <ul className="error-list">
        {diagnostics.map((d, i) => (
          <li key={i} className={`diag diag-${d.severity}`}>
            <span className="diag-loc">{d.line ? `L${d.line}` : '—'}</span>
            <span className="diag-msg">
              {d.message}
              {d.compilesOnDevice && <span className="diag-note">（実機ではコンパイル可）</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
