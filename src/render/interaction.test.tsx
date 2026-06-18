// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PreviewPane } from '../components/PreviewPane';

const COUNTER = `struct ContentView: View {
  @State private var count = 0
  var body: some View {
    VStack {
      Text("カウント: \\(count)")
      Button("inc") { count += 1 }
    }
  }
}`;

const TOGGLE = `struct ContentView: View {
  @State private var isOn = false
  var body: some View {
    VStack {
      Toggle("通知", isOn: $isOn)
      if isOn { Text("ON") }
    }
  }
}`;

function mount(source: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<PreviewPane source={source} />);
  });
  return { container, root };
}

describe('live interaction (jsdom)', () => {
  it('tapping the button increments the rendered count', () => {
    const { container } = mount(COUNTER);
    expect(container.textContent).toContain('カウント: 0');
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('inc'))!;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('カウント: 1');
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('カウント: 2');
  });

  it('flipping the toggle reveals conditional content', () => {
    const { container } = mount(TOGGLE);
    expect(container.textContent).not.toContain('ON');
    const checkbox = container.querySelector('input[type=checkbox]') as HTMLInputElement;
    act(() => {
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('ON');
  });
});
