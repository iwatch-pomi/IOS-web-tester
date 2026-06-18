export function CodePanel({ code, onChange }: { code: string; onChange: (v: string) => void }) {
  return (
    <div className="code-panel">
      <textarea
        className="code-textarea"
        spellCheck={false}
        value={code}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ここに SwiftUI のコードを貼り付けるか、ファイルをアップロードしてください"
      />
    </div>
  );
}
