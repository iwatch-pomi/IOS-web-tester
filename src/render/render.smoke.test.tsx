import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PreviewPane } from '../components/PreviewPane';
import { examples } from '../examples';
import { userAppFiles } from '../userApp';

describe('preview render smoke', () => {
  it('bundles example files', () => {
    expect(examples.length).toBeGreaterThanOrEqual(5);
  });

  it('renders the user app/ starter without throwing', () => {
    expect(userAppFiles.length).toBeGreaterThanOrEqual(1);
    const combined = userAppFiles.map((f) => f.code).join('\n\n');
    const html = renderToString(<PreviewPane source={combined} />);
    expect(html).toContain('phone');
    expect(html).not.toContain('未対応: ContentView');
  });

  for (const ex of examples) {
    it(`renders example "${ex.id}" without throwing`, () => {
      const html = renderToString(<PreviewPane source={ex.code} />);
      expect(html).toContain('phone');
      expect(html).not.toContain('未対応: ContentView');
    });
  }
});
