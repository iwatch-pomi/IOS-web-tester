import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PreviewPane } from '../components/PreviewPane';
import { examples } from '../examples';

describe('preview render smoke', () => {
  it('bundles example files', () => {
    expect(examples.length).toBeGreaterThanOrEqual(5);
  });

  for (const ex of examples) {
    it(`renders example "${ex.id}" without throwing`, () => {
      const html = renderToString(<PreviewPane source={ex.code} />);
      expect(html).toContain('phone');
      expect(html).not.toContain('未対応: ContentView');
    });
  }
});
