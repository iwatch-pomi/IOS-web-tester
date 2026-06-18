// Eagerly bundle the sample .swift files as raw strings.
const modules = import.meta.glob('../examples/*.swift', { query: '?raw', import: 'default', eager: true });

export interface Example {
  id: string;
  label: string;
  code: string;
}

const LABELS: Record<string, string> = {
  '01-hello': 'Hello（基本レイアウト）',
  '02-counter': 'カウンター（@State / Button）',
  '03-toggle-textfield': 'Toggle / TextField',
  '04-list-foreach': 'List / ForEach',
  '05-navigation-sheet': 'Navigation / Sheet',
};

export const examples: Example[] = Object.entries(modules)
  .map(([path, code]) => {
    const id = path.split('/').pop()!.replace('.swift', '');
    return { id, label: LABELS[id] ?? id, code: code as string };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
