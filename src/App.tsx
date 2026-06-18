import { useState } from 'react';
import { FileUpload, type UploadedFile } from './components/FileUpload';
import { CodePanel } from './components/CodePanel';
import { PreviewPane } from './components/PreviewPane';
import { examples } from './examples';
import './app.css';

interface SourceFile {
  name: string;
  code: string;
}

export default function App() {
  const [files, setFiles] = useState<SourceFile[]>([{ name: examples[0]?.id + '.swift', code: examples[0]?.code ?? '' }]);
  const [active, setActive] = useState(0);

  const activeFile = files[active] ?? files[0];

  const updateActiveCode = (code: string) => {
    setFiles((fs) => fs.map((f, i) => (i === active ? { ...f, code } : f)));
  };

  const onFiles = (uploaded: UploadedFile[]) => {
    setFiles(uploaded.map((f) => ({ name: f.name, code: f.code })));
    setActive(0);
  };

  const loadExample = (id: string) => {
    const ex = examples.find((e) => e.id === id);
    if (!ex) return;
    setFiles([{ name: ex.id + '.swift', code: ex.code }]);
    setActive(0);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-logo">􀟜</span>
          <div>
            <h1>SwiftUI Web Previewer</h1>
            <p>Macなしで iPhone アプリの UI と動作を確認</p>
          </div>
        </div>
        <div className="header-actions">
          <select className="example-select" defaultValue="" onChange={(e) => e.target.value && loadExample(e.target.value)}>
            <option value="">サンプルを読み込む…</option>
            {examples.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="app-main">
        <section className="source-section">
          <FileUpload onFiles={onFiles} />
          {files.length > 1 && (
            <div className="file-tabs">
              {files.map((f, i) => (
                <button
                  key={i}
                  className={`file-tab ${i === active ? 'file-tab-active' : ''}`}
                  onClick={() => setActive(i)}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
          <CodePanel code={activeFile?.code ?? ''} onChange={updateActiveCode} />
          <p className="subset-note">
            対応: VStack / HStack / ZStack / Text / Image / Button / Toggle / TextField / List / ForEach /
            NavigationStack / sheet / @State など。未対応の構文は警告表示され、コードは実機 (Xcode) ではそのままコンパイルできます。
          </p>
        </section>

        <section className="preview-section">
          {files.length > 1 ? (
            <PreviewPane key={active} source={combineSources(files)} />
          ) : (
            <PreviewPane source={activeFile?.code ?? ''} />
          )}
        </section>
      </main>
    </div>
  );
}

/** When multiple files are uploaded, concatenate them so cross-file views resolve. */
function combineSources(files: SourceFile[]): string {
  return files.map((f) => f.code).join('\n\n');
}
