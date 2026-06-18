import { useRef, useState } from 'react';

export interface UploadedFile {
  name: string;
  code: string;
}

export function FileUpload({ onFiles }: { onFiles: (files: UploadedFile[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const swift = [...fileList].filter((f) => f.name.endsWith('.swift'));
    const files = await Promise.all(
      swift.map(async (f) => ({ name: f.name, code: await f.text() })),
    );
    if (files.length) onFiles(files);
  };

  return (
    <div
      className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void readFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".swift"
        multiple
        hidden
        onChange={(e) => void readFiles(e.target.files)}
      />
      <div className="dropzone-inner">
        <div className="dropzone-icon">⬆</div>
        <div>
          <strong>.swift ファイルをドロップ</strong>
          <br />
          またはクリックして選択
        </div>
      </div>
    </div>
  );
}
