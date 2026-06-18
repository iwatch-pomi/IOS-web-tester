import { useState } from 'react';
import { usePreview } from '../render/usePreview';
import { RenderNodes } from '../render/ViewRenderer';
import { DEVICES, PhoneFrame, type DeviceId } from './PhoneFrame';
import { ErrorPanel } from './ErrorPanel';

export function PreviewPane({ source }: { source: string }) {
  const [device, setDevice] = useState<DeviceId>('15');
  const [dark, setDark] = useState(false);
  const { root, diagnostics, actions, store } = usePreview(source);

  return (
    <div className="preview-pane">
      <div className="preview-toolbar">
        <select value={device} onChange={(e) => setDevice(e.target.value as DeviceId)}>
          {Object.entries(DEVICES).map(([id, d]) => (
            <option key={id} value={id}>
              {d.label}
            </option>
          ))}
        </select>
        <button className="toolbar-btn" onClick={() => setDark((v) => !v)}>
          {dark ? '☀︎ ライト' : '☾ ダーク'}
        </button>
      </div>

      <div className="preview-stage">
        <PhoneFrame device={device} dark={dark}>
          {root.length === 0 ? (
            <div className="empty-preview">プレビューする内容がありません</div>
          ) : (
            <RenderNodes nodes={root} ctx={{ actions, store }} />
          )}
        </PhoneFrame>
      </div>

      <ErrorPanel diagnostics={diagnostics} />
    </div>
  );
}
