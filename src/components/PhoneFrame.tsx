import type { ReactNode } from 'react';

export type DeviceId = 'se' | '15' | '15promax';

export const DEVICES: Record<DeviceId, { label: string; w: number; h: number; notch: 'island' | 'notch' | 'none' }> = {
  se: { label: 'iPhone SE', w: 320, h: 568, notch: 'none' },
  '15': { label: 'iPhone 15', w: 360, h: 740, notch: 'island' },
  '15promax': { label: 'iPhone 15 Pro Max', w: 400, h: 820, notch: 'island' },
};

export function PhoneFrame({
  device,
  dark,
  children,
}: {
  device: DeviceId;
  dark: boolean;
  children: ReactNode;
}) {
  const d = DEVICES[device];
  return (
    <div className={`phone ${dark ? 'phone-dark' : 'phone-light'}`} style={{ width: d.w, height: d.h }}>
      <div className="phone-screen">
        <div className="status-bar">
          <span className="status-time">9:41</span>
          {d.notch === 'island' && <span className="dynamic-island" />}
          {d.notch === 'notch' && <span className="notch" />}
          <span className="status-right">
            <span className="status-signal">●●●</span>
            <span className="status-wifi">⤳</span>
            <span className="status-battery">▮</span>
          </span>
        </div>
        <div className="app-area">{children}</div>
        {d.notch === 'none' && <div className="home-button" />}
        {d.notch !== 'none' && <div className="home-indicator" />}
      </div>
    </div>
  );
}
