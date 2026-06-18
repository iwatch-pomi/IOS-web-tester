import type {
  Arg,
  Expr,
  Modifier,
  Program,
  Statement,
  ViewExpr,
  ViewStruct,
} from './ast';
import type { Diagnostic } from './diagnostics';
import { makeDiagnostic } from './diagnostics';
import { StateStore, type Binding } from './stateStore';
import { emptyStyle, type ResolvedStyle, type ViewNode } from './viewNode';
import {
  ALIGNMENT_TO_FLEX,
  colorToCss,
  FONT_PRESETS,
  FONT_WEIGHTS,
  KNOWN_MODIFIERS,
  TEXT_ALIGN,
} from '../render/modifiers';
import { rgbColor } from '../render/colors';

interface Scope {
  vars: Map<string, { binding?: Binding; value?: unknown }>;
  parent: Scope | null;
}

const BUILTIN_VIEWS = new Set([
  'Text',
  'Image',
  'Spacer',
  'Divider',
  'VStack',
  'HStack',
  'ZStack',
  'ScrollView',
  'List',
  'Form',
  'Section',
  'Group',
  'NavigationStack',
  'NavigationView',
  'Button',
  'Toggle',
  'TextField',
  'SecureField',
  'NavigationLink',
  'Label',
  'Color',
  'Rectangle',
  'Circle',
  'RoundedRectangle',
]);

export interface EvalResult {
  root: ViewNode[];
  diagnostics: Diagnostic[];
  actions: Map<string, () => void>;
}

export class Evaluator {
  private views = new Map<string, ViewStruct>();
  private models = new Set<string>();
  private diagnostics: Diagnostic[] = [];
  private actions = new Map<string, () => void>();
  private actionSeq = 0;
  private inlineDepth = 0;

  constructor(
    private program: Program,
    private store: StateStore,
  ) {
    for (const v of program.views) this.views.set(v.name, v);
    for (const m of program.models) this.models.add(m.name);
  }

  /** Seed the store with the entry view's @State initial values (once). */
  seedState(): void {
    const entry = this.program.entry ? this.views.get(this.program.entry) : undefined;
    if (!entry) return;
    const scope = this.newScope(null);
    for (const sv of entry.stateVars) {
      if (sv.kind === 'state' || sv.kind === 'plain') {
        const v = sv.initializer ? this.evalExpr(sv.initializer, scope) : defaultForType(sv.declaredType);
        this.store.init(sv.name, v);
      }
    }
  }

  evaluate(): EvalResult {
    this.diagnostics = [];
    this.actions = new Map();
    this.actionSeq = 0;
    const entry = this.program.entry ? this.views.get(this.program.entry) : undefined;
    if (!entry) {
      this.diagnostics.push(
        makeDiagnostic('error', 'View に準拠した struct が見つかりませんでした（例: struct ContentView: View）'),
      );
      return { root: [], diagnostics: this.diagnostics, actions: this.actions };
    }
    const scope = this.newScope(null);
    const root = this.evalViews(entry.body, scope);
    return { root, diagnostics: this.diagnostics, actions: this.actions };
  }

  // ---------------- Scopes ----------------

  private newScope(parent: Scope | null): Scope {
    return { vars: new Map(), parent };
  }
  private lookup(name: string, scope: Scope): { binding?: Binding; value?: unknown } | null {
    let s: Scope | null = scope;
    while (s) {
      const v = s.vars.get(name);
      if (v) return v;
      s = s.parent;
    }
    if (this.store.has(name)) return { binding: this.store.binding(name) };
    return null;
  }

  // ---------------- Expressions ----------------

  evalExpr(expr: Expr, scope: Scope): unknown {
    switch (expr.kind) {
      case 'numberLit':
        return expr.value;
      case 'stringLit':
        return expr.value;
      case 'boolLit':
        return expr.value;
      case 'nilLit':
        return null;
      case 'stringInterp':
        return expr.parts
          .map((p) => ('text' in p ? p.text : stringify(this.evalExpr(p.expr, scope))))
          .join('');
      case 'identifier': {
        if (expr.name === 'self') return undefined;
        const found = this.lookup(expr.name, scope);
        if (found) return found.binding ? found.binding.get() : found.value;
        return undefined;
      }
      case 'bindingRef':
        return this.resolveBinding({ kind: 'identifier', name: expr.name }, scope);
      case 'member': {
        if (expr.object === null) return expr.property; // enum shorthand: .red -> "red"
        const obj = this.evalExpr(expr.object, scope);
        return memberAccess(obj, expr.property);
      }
      case 'index': {
        const obj = this.evalExpr(expr.object, scope);
        const idx = this.evalExpr(expr.index, scope);
        if (Array.isArray(obj) && typeof idx === 'number') return obj[idx];
        return undefined;
      }
      case 'array':
        return expr.elements.map((e) => this.evalExpr(e, scope));
      case 'unary': {
        const v = this.evalExpr(expr.operand, scope);
        if (expr.op === '!') return !truthy(v);
        if (expr.op === '-') return -(Number(v) || 0);
        return v;
      }
      case 'binary':
        return this.evalBinary(expr, scope);
      case 'call':
        return this.evalCall(expr, scope);
      case 'closure':
        return undefined;
    }
  }

  private evalBinary(expr: Extract<Expr, { kind: 'binary' }>, scope: Scope): unknown {
    const op = expr.op;
    if (op === '..<' || op === '...') {
      const lo = Number(this.evalExpr(expr.left, scope));
      const hi = Number(this.evalExpr(expr.right, scope));
      const out: number[] = [];
      const end = op === '...' ? hi : hi - 1;
      for (let i = lo; i <= end; i++) out.push(i);
      return out;
    }
    const l = this.evalExpr(expr.left, scope);
    if (op === '&&') return truthy(l) && truthy(this.evalExpr(expr.right, scope));
    if (op === '||') return truthy(l) || truthy(this.evalExpr(expr.right, scope));
    const r = this.evalExpr(expr.right, scope);
    switch (op) {
      case '+':
        if (typeof l === 'string' || typeof r === 'string') return stringify(l) + stringify(r);
        return Number(l) + Number(r);
      case '-':
        return Number(l) - Number(r);
      case '*':
        return Number(l) * Number(r);
      case '/':
        return Number(l) / Number(r);
      case '%':
        return Number(l) % Number(r);
      case '==':
        return l === r;
      case '!=':
        return l !== r;
      case '<':
        return (l as number) < (r as number);
      case '>':
        return (l as number) > (r as number);
      case '<=':
        return (l as number) <= (r as number);
      case '>=':
        return (l as number) >= (r as number);
    }
    return undefined;
  }

  private evalCall(expr: Extract<Expr, { kind: 'call' }>, scope: Scope): unknown {
    // Color(red:green:blue:)
    if (expr.callee.kind === 'identifier' && expr.callee.name === 'Color') {
      const get = (label: string) => {
        const a = expr.args.find((x) => x.label === label);
        return a ? Number(this.evalExpr(a.value, scope)) : 0;
      };
      if (expr.args.some((a) => a.label === 'red')) {
        return rgbColor(get('red'), get('green'), get('blue'), expr.args.some((a) => a.label === 'opacity') ? get('opacity') : 1);
      }
      // Color(.systemBlue) or Color("name")
      const first = expr.args[0];
      if (first) return this.evalExpr(first.value, scope);
    }
    // Model struct construction: Task(title: "x", done: false)
    if (expr.callee.kind === 'identifier' && this.models.has(expr.callee.name)) {
      const obj: Record<string, unknown> = { __type: expr.callee.name };
      expr.args.forEach((a, i) => {
        obj[a.label ?? `_${i}`] = this.evalExpr(a.value, scope);
      });
      return obj;
    }
    // String/array helper methods used as values
    if (expr.callee.kind === 'member') {
      const base = this.evalExpr(expr.callee.object!, scope);
      const m = expr.callee.property;
      const argv = expr.args.map((a) => this.evalExpr(a.value, scope));
      return callMethod(base, m, argv);
    }
    return undefined;
  }

  // ---------------- Lvalues / bindings ----------------

  private resolveBinding(expr: Expr, scope: Scope): Binding {
    if (expr.kind === 'identifier') {
      const found = this.lookup(expr.name, scope);
      if (found?.binding) return found.binding;
      // create-on-demand in the store
      return this.store.binding(expr.name);
    }
    if (expr.kind === 'member' && expr.object) {
      const baseBinding = this.resolveBinding(expr.object, scope);
      const prop = expr.property;
      return {
        get: () => {
          const o = baseBinding.get();
          return o && typeof o === 'object' ? (o as Record<string, unknown>)[prop] : undefined;
        },
        set: (v) => {
          const o = baseBinding.get();
          const copy = o && typeof o === 'object' ? { ...(o as Record<string, unknown>) } : {};
          copy[prop] = v;
          baseBinding.set(copy);
        },
      };
    }
    // fallback no-op binding
    return { get: () => undefined, set: () => {} };
  }

  // ---------------- Statements (actions) ----------------

  private registerAction(stmts: Statement[], scope: Scope): string {
    const id = `act_${this.actionSeq++}`;
    this.actions.set(id, () => this.runStatements(stmts, scope));
    return id;
  }

  private runStatements(stmts: Statement[], scope: Scope): void {
    for (const s of stmts) this.runStatement(s, scope);
  }

  private runStatement(s: Statement, scope: Scope): void {
    switch (s.kind) {
      case 'assign': {
        const b = this.resolveBinding(s.target, scope);
        const rhs = this.evalExpr(s.value, scope);
        if (s.op === '=') b.set(rhs);
        else {
          const cur = b.get();
          if (s.op === '+=') b.set(typeof cur === 'string' || typeof rhs === 'string' ? stringify(cur) + stringify(rhs) : Number(cur) + Number(rhs));
          else if (s.op === '-=') b.set(Number(cur) - Number(rhs));
          else if (s.op === '*=') b.set(Number(cur) * Number(rhs));
          else if (s.op === '/=') b.set(Number(cur) / Number(rhs));
        }
        return;
      }
      case 'exprStmt': {
        const e = s.expr;
        if (e.kind === 'call' && e.callee.kind === 'member' && e.callee.object) {
          const method = e.callee.property;
          const b = this.resolveBinding(e.callee.object, scope);
          const argv = e.args.map((a) => this.evalExpr(a.value, scope));
          if (method === 'toggle') {
            b.set(!truthy(b.get()));
            return;
          }
          if (method === 'append') {
            const arr = Array.isArray(b.get()) ? [...(b.get() as unknown[])] : [];
            arr.push(argv[0]);
            b.set(arr);
            return;
          }
          if (method === 'removeAll') {
            b.set([]);
            return;
          }
          if (method === 'remove') {
            const arr = Array.isArray(b.get()) ? [...(b.get() as unknown[])] : [];
            const atArg = e.args.find((a) => a.label === 'at');
            if (atArg) arr.splice(Number(this.evalExpr(atArg.value, scope)), 1);
            b.set(arr);
            return;
          }
        }
        // unrecognized expression statement: evaluate for side-effect-free effect
        this.evalExpr(e, scope);
        return;
      }
      case 'withAnimation':
        this.runStatements(s.body, scope);
        return;
      case 'if': {
        if (truthy(this.evalExpr(s.condition, scope))) this.runStatements(s.then, scope);
        else this.runStatements(s.else, scope);
        return;
      }
    }
  }

  // ---------------- Views ----------------

  evalViews(views: ViewExpr[], scope: Scope): ViewNode[] {
    const out: ViewNode[] = [];
    for (const v of views) {
      const nodes = this.evalView(v, scope);
      for (const n of nodes) out.push(n);
    }
    return out;
  }

  private evalView(v: ViewExpr, scope: Scope): ViewNode[] {
    if (v.kind === 'if') {
      const branch = truthy(this.evalExpr(v.condition, scope)) ? v.then : v.else;
      return this.evalViews(branch, scope);
    }
    if (v.kind === 'forEach') {
      const data = this.evalExpr(v.data, scope);
      const arr = Array.isArray(data) ? data : [];
      const out: ViewNode[] = [];
      for (const item of arr) {
        const child = this.newScope(scope);
        child.vars.set(v.itemName, { value: item });
        for (const n of this.evalViews(v.body, child)) out.push(n);
      }
      return out;
    }
    if (v.kind === 'unsupported') {
      return [{ type: 'unsupported', label: v.label, style: emptyStyle() }];
    }
    // viewCall
    return this.evalViewCall(v, scope);
  }

  private evalViewCall(v: Extract<ViewExpr, { kind: 'viewCall' }>, scope: Scope): ViewNode[] {
    const style = this.resolveStyle(v.modifiers, scope);
    const name = v.name;

    // Custom view: inline its body.
    if (!BUILTIN_VIEWS.has(name) && this.views.has(name)) {
      return this.inlineCustomView(name, v.args, style, scope);
    }

    const firstStringArg = (): string => {
      const a = v.args.find((x) => x.label === null) ?? v.args[0];
      return a ? stringify(this.evalExpr(a.value, scope)) : '';
    };

    switch (name) {
      case 'Text':
        return [{ type: 'text', text: firstStringArg(), style }];
      case 'Label': {
        // Label("title", systemImage: "x")
        const title = firstStringArg();
        const sys = v.args.find((a) => a.label === 'systemImage');
        const sym = sys ? stringify(this.evalExpr(sys.value, scope)) : '';
        return [
          {
            type: 'stack',
            axis: 'h',
            spacing: 6,
            alignment: 'center',
            scroll: false,
            children: [
              { type: 'image', symbol: sym, style: emptyStyle() },
              { type: 'text', text: title, style: emptyStyle() },
            ],
            style,
          },
        ];
      }
      case 'Image': {
        const sysArg = v.args.find((a) => a.label === 'systemName');
        const symbol = sysArg ? stringify(this.evalExpr(sysArg.value, scope)) : firstStringArg();
        return [{ type: 'image', symbol, style }];
      }
      case 'Spacer':
        return [{ type: 'spacer', style }];
      case 'Divider':
        return [{ type: 'divider', style }];
      case 'VStack':
      case 'HStack':
      case 'ZStack':
      case 'Group':
      case 'Section': {
        const axis = name === 'HStack' ? 'h' : name === 'ZStack' ? 'z' : 'v';
        const { spacing, alignment } = this.stackArgs(v.args, scope);
        const children = this.evalViews(v.childViews ?? [], scope);
        if (name === 'Group') return children; // Group is transparent
        return [{ type: 'stack', axis, spacing, alignment, scroll: false, children, style }];
      }
      case 'ScrollView': {
        const children = this.evalViews(v.childViews ?? [], scope);
        const horizontal = v.args.some((a) => exprMentions(a.value, 'horizontal'));
        return [
          {
            type: 'stack',
            axis: horizontal ? 'h' : 'v',
            spacing: null,
            alignment: null,
            scroll: true,
            children,
            style,
          },
        ];
      }
      case 'List':
      case 'Form': {
        const children = this.evalViews(v.childViews ?? [], scope);
        return [{ type: 'list', children, style }];
      }
      case 'NavigationStack':
      case 'NavigationView': {
        const children = this.evalViews(v.childViews ?? [], scope);
        const title = findNavTitle(children);
        return [{ type: 'navStack', title, children, style }];
      }
      case 'Button': {
        const actionId = v.actionStatements ? this.registerAction(v.actionStatements, scope) : null;
        let label: ViewNode[];
        if (v.childViews && v.childViews.length) label = this.evalViews(v.childViews, scope);
        else label = [{ type: 'text', text: firstStringArg(), style: emptyStyle() }];
        return [{ type: 'button', label, actionId, style }];
      }
      case 'Toggle': {
        const isOn = v.args.find((a) => a.label === 'isOn');
        const bindingPath = isOn ? bindingPathOf(isOn.value) : null;
        const value = bindingPath ? truthy(this.store.get(bindingPath)) : false;
        const label: ViewNode[] = [{ type: 'text', text: firstStringArg(), style: emptyStyle() }];
        return [{ type: 'toggle', label, bindingPath, value, style }];
      }
      case 'TextField':
      case 'SecureField': {
        const textArg = v.args.find((a) => a.label === 'text' || a.label === 'value');
        const bindingPath = textArg ? bindingPathOf(textArg.value) : null;
        const value = bindingPath ? stringify(this.store.get(bindingPath)) : '';
        const placeholder = firstStringArg();
        return [
          {
            type: 'textfield',
            placeholder,
            bindingPath,
            value,
            secure: name === 'SecureField',
            style,
          },
        ];
      }
      case 'NavigationLink': {
        const dest = this.evalViews(v.childViews ?? [], scope);
        const label: ViewNode[] = [{ type: 'text', text: firstStringArg(), style: emptyStyle() }];
        return [{ type: 'navLink', label, destination: dest, style }];
      }
      case 'Color': {
        // Color.red as a view -> a filled rectangle
        const c = colorToCss(stringify(this.evalExpr((v.args[0]?.value ?? { kind: 'member', object: null, property: 'gray' }) as Expr, scope))) ?? '#8e8e93';
        return [{ type: 'stack', axis: 'z', spacing: null, alignment: null, scroll: false, children: [], style: { css: { ...style.css, backgroundColor: c, minHeight: '40px', flex: '1' } } }];
      }
      case 'Rectangle':
      case 'Circle':
      case 'RoundedRectangle': {
        const radius = name === 'Circle' ? '50%' : name === 'RoundedRectangle' ? '12px' : '0';
        return [
          {
            type: 'stack',
            axis: 'z',
            spacing: null,
            alignment: null,
            scroll: false,
            children: [],
            style: { css: { background: '#c7c7cc', borderRadius: radius, minHeight: '40px', minWidth: '40px', ...style.css } },
          },
        ];
      }
      default:
        this.diagnostics.push(
          makeDiagnostic('warning', `未対応のビュー: ${name}（実機ではコンパイルできる場合があります）`, v.line, 0, true),
        );
        return [{ type: 'unsupported', label: name, style }];
    }
  }

  private inlineCustomView(name: string, args: Arg[], style: ResolvedStyle, callerScope: Scope): ViewNode[] {
    if (this.inlineDepth > 30) {
      return [{ type: 'unsupported', label: `${name} (再帰が深すぎます)`, style }];
    }
    this.inlineDepth++;
    const def = this.views.get(name)!;
    const child = this.newScope(null);
    // map arguments to props (by label, then positionally)
    const labeled = args.filter((a) => a.label !== null);
    const positional = args.filter((a) => a.label === null);
    let pi = 0;
    for (const prop of def.stateVars) {
      const arg = labeled.find((a) => a.label === prop.name) ?? positional[pi++];
      if (prop.kind === 'binding') {
        // expects a $binding
        if (arg) child.vars.set(prop.name, { binding: this.resolveBinding(unwrapBinding(arg.value), callerScope) });
      } else if (arg) {
        child.vars.set(prop.name, { value: this.evalExpr(arg.value, callerScope) });
      } else if (prop.kind === 'state') {
        // child @State seeded into the store under a namespaced key
        const key = `${name}.${prop.name}`;
        if (!this.store.has(key)) {
          this.store.init(key, prop.initializer ? this.evalExpr(prop.initializer, child) : defaultForType(prop.declaredType));
        }
        child.vars.set(prop.name, { binding: this.store.binding(key) });
      } else if (prop.initializer) {
        child.vars.set(prop.name, { value: this.evalExpr(prop.initializer, child) });
      }
    }
    const nodes = this.evalViews(def.body, child);
    this.inlineDepth--;
    // apply caller modifiers to a single-root body
    if (Object.keys(style.css).length && nodes.length === 1) {
      nodes[0] = { ...nodes[0], style: mergeStyle(nodes[0].style, style) };
    }
    return nodes;
  }

  private stackArgs(args: Arg[], scope: Scope): { spacing: number | null; alignment: string | null } {
    let spacing: number | null = null;
    let alignment: string | null = null;
    for (const a of args) {
      if (a.label === 'spacing') spacing = Number(this.evalExpr(a.value, scope));
      if (a.label === 'alignment') alignment = String(this.evalExpr(a.value, scope));
    }
    return { spacing, alignment };
  }

  // ---------------- Modifier resolution ----------------

  private resolveStyle(modifiers: Modifier[], scope: Scope): ResolvedStyle {
    const style: ResolvedStyle = { css: {} };
    for (const m of modifiers) {
      const argVal = (i = 0): unknown => (m.args[i] ? this.evalExpr(m.args[i].value, scope) : undefined);
      const labeled = (label: string): unknown => {
        const a = m.args.find((x) => x.label === label);
        return a ? this.evalExpr(a.value, scope) : undefined;
      };
      switch (m.name) {
        case 'padding': {
          const v = m.args.length === 0 ? 16 : undefined;
          if (v !== undefined) {
            style.css.padding = `${v}px`;
          } else if (m.args.length === 1 && m.args[0].label === null && typeof argVal(0) === 'number') {
            style.css.padding = `${argVal(0)}px`;
          } else {
            // .padding(.horizontal, 8) etc.
            const edge = stringify(argVal(0));
            const amount = typeof argVal(1) === 'number' ? `${argVal(1)}px` : '16px';
            if (edge === 'horizontal') {
              style.css.paddingLeft = amount;
              style.css.paddingRight = amount;
            } else if (edge === 'vertical') {
              style.css.paddingTop = amount;
              style.css.paddingBottom = amount;
            } else if (['top', 'bottom', 'leading', 'trailing'].includes(edge)) {
              const map: Record<string, string> = { top: 'paddingTop', bottom: 'paddingBottom', leading: 'paddingLeft', trailing: 'paddingRight' };
              style.css[map[edge]] = amount;
            } else {
              style.css.padding = '16px';
            }
          }
          break;
        }
        case 'foregroundColor':
        case 'foregroundStyle':
        case 'tint':
        case 'accentColor': {
          const c = colorToCss(argVal(0));
          if (c) style.css.color = c;
          break;
        }
        case 'background': {
          const c = colorToCss(argVal(0));
          if (c) style.css.backgroundColor = c;
          else if (m.trailingViews) {
            /* background view ignored visually for MVP */
          }
          break;
        }
        case 'font': {
          const preset = FONT_PRESETS[stringify(argVal(0))];
          if (preset) {
            style.css.fontSize = `${preset.size}px`;
            if (!style.css.fontWeight) style.css.fontWeight = preset.weight;
          } else if (m.args[0] && m.args[0].value.kind === 'call') {
            // .font(.system(size: 20, weight: .bold))
            const call = m.args[0].value;
            const sizeArg = call.args.find((a) => a.label === 'size');
            if (sizeArg) style.css.fontSize = `${Number(this.evalExpr(sizeArg.value, scope))}px`;
            const wArg = call.args.find((a) => a.label === 'weight');
            if (wArg) style.css.fontWeight = FONT_WEIGHTS[stringify(this.evalExpr(wArg.value, scope))] ?? 400;
          }
          break;
        }
        case 'fontWeight':
          style.css.fontWeight = FONT_WEIGHTS[stringify(argVal(0))] ?? 400;
          break;
        case 'bold':
          style.css.fontWeight = 700;
          break;
        case 'italic':
          style.css.fontStyle = 'italic';
          break;
        case 'cornerRadius':
          style.css.borderRadius = `${Number(argVal(0)) || 0}px`;
          style.css.overflow = 'hidden';
          break;
        case 'clipShape':
          style.css.borderRadius = stringify(argVal(0)).includes('Circle') ? '50%' : '12px';
          style.css.overflow = 'hidden';
          break;
        case 'opacity':
          style.css.opacity = Number(argVal(0));
          break;
        case 'frame': {
          const w = labeled('width');
          const h = labeled('height');
          const maxW = labeled('maxWidth');
          const maxH = labeled('maxHeight');
          if (typeof w === 'number') style.css.width = `${w}px`;
          if (typeof h === 'number') style.css.height = `${h}px`;
          if (maxW === 'infinity' || (typeof maxW === 'object' && maxW !== null)) style.css.width = '100%';
          if (maxH === 'infinity') style.css.flex = '1';
          const align = labeled('alignment');
          if (align) {
            style.css.display = 'flex';
            style.css.justifyContent = ALIGNMENT_TO_FLEX[stringify(align)] ?? 'center';
          }
          break;
        }
        case 'shadow':
          style.css.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
          break;
        case 'border': {
          const c = colorToCss(argVal(0)) ?? '#000';
          const w = typeof argVal(1) === 'number' ? Number(argVal(1)) : 1;
          style.css.border = `${w}px solid ${c}`;
          break;
        }
        case 'multilineTextAlignment':
          style.css.textAlign = TEXT_ALIGN[stringify(argVal(0))] ?? 'left';
          break;
        case 'lineLimit':
          // best-effort clamp
          style.css.overflow = 'hidden';
          break;
        case 'kerning':
        case 'tracking':
          style.css.letterSpacing = `${Number(argVal(0)) || 0}px`;
          break;
        case 'blur':
          style.css.filter = `blur(${Number(argVal(0)) || 0}px)`;
          break;
        case 'navigationTitle':
          style.navigationTitle = stringify(argVal(0));
          break;
        case 'sheet': {
          const isPresented = m.args.find((a) => a.label === 'isPresented');
          const path = isPresented ? bindingPathOf(isPresented.value) : null;
          if (path && m.trailingViews) {
            style.sheet = { bindingPath: path, content: this.evalViews(m.trailingViews, scope) };
          }
          break;
        }
        case 'onTapGesture':
          if (m.trailingStatements) style.tapActionId = this.registerAction(m.trailingStatements, scope);
          break;
        case 'onAppear':
        case 'onDisappear':
        case 'onChange':
        case 'navigationBarTitleDisplayMode':
        case 'buttonStyle':
        case 'textFieldStyle':
        case 'listStyle':
        case 'disabled':
          // recognized but visually no-op in MVP
          break;
        default:
          if (!KNOWN_MODIFIERS.has(m.name)) {
            this.diagnostics.push(
              makeDiagnostic('warning', `未対応の修飾子: .${m.name}（無視しました。実機ではコンパイルできる場合があります）`, m.line, 0, true),
            );
          }
      }
    }
    return style;
  }
}

// ---------------- helpers ----------------

function mergeStyle(base: ResolvedStyle, extra: ResolvedStyle): ResolvedStyle {
  return {
    css: { ...base.css, ...extra.css },
    navigationTitle: extra.navigationTitle ?? base.navigationTitle,
    sheet: extra.sheet ?? base.sheet,
    tapActionId: extra.tapActionId ?? base.tapActionId,
  };
}

function bindingPathOf(expr: Expr): string | null {
  if (expr.kind === 'bindingRef') return expr.name;
  return null;
}

function unwrapBinding(expr: Expr): Expr {
  if (expr.kind === 'bindingRef') return { kind: 'identifier', name: expr.name };
  return expr;
}

function findNavTitle(nodes: ViewNode[]): string | null {
  for (const n of nodes) {
    if (n.style.navigationTitle) return n.style.navigationTitle;
    if ('children' in n && Array.isArray(n.children)) {
      const t = findNavTitle(n.children);
      if (t) return t;
    }
  }
  return null;
}

function memberAccess(obj: unknown, prop: string): unknown {
  if (obj == null) return undefined;
  if (Array.isArray(obj)) {
    if (prop === 'count') return obj.length;
    if (prop === 'isEmpty') return obj.length === 0;
    if (prop === 'first') return obj[0];
    if (prop === 'last') return obj[obj.length - 1];
  }
  if (typeof obj === 'string') {
    if (prop === 'count') return obj.length;
    if (prop === 'isEmpty') return obj.length === 0;
    if (prop === 'uppercased') return obj; // method handled in callMethod
  }
  if (typeof obj === 'object') return (obj as Record<string, unknown>)[prop];
  return undefined;
}

function callMethod(base: unknown, method: string, args: unknown[]): unknown {
  if (typeof base === 'string') {
    if (method === 'uppercased') return base.toUpperCase();
    if (method === 'lowercased') return base.toLowerCase();
    if (method === 'capitalized') return base.charAt(0).toUpperCase() + base.slice(1);
    if (method === 'trimmingCharacters') return base.trim();
    if (method === 'contains') return base.includes(stringify(args[0]));
    if (method === 'hasPrefix') return base.startsWith(stringify(args[0]));
  }
  if (Array.isArray(base)) {
    if (method === 'contains') return base.includes(args[0]);
    if (method === 'filter') return base; // closures unsupported
    if (method === 'count') return base.length;
  }
  return undefined;
}

function exprMentions(expr: Expr, name: string): boolean {
  if (expr.kind === 'member') return expr.property === name;
  if (expr.kind === 'array') return expr.elements.some((e) => exprMentions(e, name));
  if (expr.kind === 'identifier') return expr.name === name;
  return false;
}

function defaultForType(type: string | null): unknown {
  if (!type) return undefined;
  const t = type.replace('?', '').trim();
  if (t === 'Int' || t === 'Double' || t === 'CGFloat') return 0;
  if (t === 'String') return '';
  if (t === 'Bool') return false;
  if (t.startsWith('[')) return [];
  return undefined;
}

function truthy(v: unknown): boolean {
  return !!v;
}

function stringify(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  return String(v);
}
