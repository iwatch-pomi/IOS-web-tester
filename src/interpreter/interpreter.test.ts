import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenizer';
import { parse } from './parser';
import { prepare, render } from './index';
import type { ViewNode } from './viewNode';

function flatten(nodes: ViewNode[]): ViewNode[] {
  const out: ViewNode[] = [];
  const walk = (ns: ViewNode[]) => {
    for (const n of ns) {
      out.push(n);
      if ('children' in n && Array.isArray((n as { children: ViewNode[] }).children)) {
        walk((n as { children: ViewNode[] }).children);
      }
      if (n.type === 'button') walk(n.label);
    }
  };
  walk(nodes);
  return out;
}

function texts(nodes: ViewNode[]): string[] {
  return flatten(nodes)
    .filter((n): n is Extract<ViewNode, { type: 'text' }> => n.type === 'text')
    .map((n) => n.text);
}

describe('tokenizer', () => {
  it('handles string interpolation into parts', () => {
    const { tokens } = tokenize('Text("count: \\(count)")');
    const str = tokens.find((t) => t.type === 'string');
    expect(str?.stringParts).toEqual(['count: ', 'count', '']);
  });

  it('distinguishes $ binding sigil', () => {
    const { tokens } = tokenize('TextField("p", text: $name)');
    expect(tokens.some((t) => t.type === 'dollar')).toBe(true);
  });
});

describe('parser', () => {
  it('parses a view struct with @State and a modifier chain', () => {
    const { program } = parse(`
      struct ContentView: View {
        @State private var count = 0
        var body: some View {
          Text("Hi").font(.title).padding()
        }
      }
    `);
    expect(program.views).toHaveLength(1);
    const v = program.views[0];
    expect(v.name).toBe('ContentView');
    expect(v.stateVars[0]).toMatchObject({ kind: 'state', name: 'count' });
    expect(v.body[0]).toMatchObject({ kind: 'viewCall', name: 'Text' });
    if (v.body[0].kind === 'viewCall') {
      expect(v.body[0].modifiers.map((m) => m.name)).toEqual(['font', 'padding']);
    }
  });

  it('recovers from a bad line without crashing', () => {
    const { program, diagnostics } = parse(`
      struct ContentView: View {
        var body: some View {
          @@@ broken @@@
          Text("ok")
        }
      }
    `);
    expect(program.views).toHaveLength(1);
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});

describe('evaluator – hello', () => {
  it('renders text and image', () => {
    const src = `struct ContentView: View { var body: some View {
      VStack { Image(systemName: "swift"); Text("Hello, iPhone!") }
    } }`;
    const prep = prepare(src);
    const out = render(prep);
    expect(texts(out.root)).toContain('Hello, iPhone!');
    expect(flatten(out.root).some((n) => n.type === 'image')).toBe(true);
  });
});

describe('evaluator – counter interactivity', () => {
  const src = `struct ContentView: View {
    @State private var count = 0
    var body: some View {
      VStack {
        Text("カウント: \\(count)")
        Button("inc") { count += 1 }
      }
    }
  }`;

  it('interpolates @State into Text', () => {
    const prep = prepare(src);
    const out = render(prep);
    expect(texts(out.root)).toContain('カウント: 0');
  });

  it('button action mutates state and re-render reflects it', () => {
    const prep = prepare(src);
    let out = render(prep);
    const button = flatten(out.root).find((n) => n.type === 'button') as Extract<ViewNode, { type: 'button' }>;
    expect(button.actionId).toBeTruthy();
    out.actions.get(button.actionId!)!(); // tap
    out = render(prep);
    expect(texts(out.root)).toContain('カウント: 1');
  });
});

describe('evaluator – toggle & textfield binding', () => {
  const src = `struct ContentView: View {
    @State private var name = ""
    @State private var isOn = false
    var body: some View {
      VStack {
        TextField("お名前", text: $name)
        Toggle("通知", isOn: $isOn)
        if name.isEmpty { Text("未入力") } else { Text("hi \\(name)") }
        if isOn { Text("ON") }
      }
    }
  }`;

  it('reflects textfield binding updates', () => {
    const prep = prepare(src);
    let out = render(prep);
    expect(texts(out.root)).toContain('未入力');
    prep.store.set('name', 'Taro');
    out = render(prep);
    expect(texts(out.root)).toContain('hi Taro');
  });

  it('reflects toggle binding updates', () => {
    const prep = prepare(src);
    let out = render(prep);
    expect(texts(out.root)).not.toContain('ON');
    prep.store.set('isOn', true);
    out = render(prep);
    expect(texts(out.root)).toContain('ON');
  });
});

describe('evaluator – ForEach over Identifiable model', () => {
  it('expands list rows', () => {
    const src = `
      struct Fruit: Identifiable { let id: Int; let name: String }
      struct ContentView: View {
        @State private var fruits = [Fruit(id: 1, name: "りんご"), Fruit(id: 2, name: "ばなな")]
        var body: some View {
          List { ForEach(fruits) { fruit in Text(fruit.name) } }
        }
      }`;
    const prep = prepare(src);
    const out = render(prep);
    expect(texts(out.root)).toContain('りんご');
    expect(texts(out.root)).toContain('ばなな');
  });
});

describe('evaluator – navigation + sheet + custom view', () => {
  it('builds nav stack with title and a sheet binding', () => {
    const src = `
      struct ContentView: View {
        @State private var show = false
        var body: some View {
          NavigationStack {
            Button("open") { show = true }
              .navigationTitle("ホーム")
              .sheet(isPresented: $show) { DetailView() }
          }
        }
      }
      struct DetailView: View {
        var body: some View { Text("詳細") }
      }`;
    const prep = prepare(src);
    const out = render(prep);
    const nav = flatten(out.root).find((n) => n.type === 'navStack') as Extract<ViewNode, { type: 'navStack' }>;
    expect(nav).toBeTruthy();
    expect(nav.title).toBe('ホーム');
  });
});

describe('graceful unsupported handling', () => {
  it('emits a warning for unknown view but does not throw', () => {
    const src = `struct ContentView: View { var body: some View {
      VStack { Canvas { ctx in } ; Text("ok") }
    } }`;
    const prep = prepare(src);
    const out = render(prep);
    expect(texts(out.root)).toContain('ok');
    expect(out.diagnostics.some((d) => d.severity === 'warning')).toBe(true);
  });
});
