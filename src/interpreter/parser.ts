import { tokenize } from './tokenizer';
import type { Token } from './token';
import type { Diagnostic } from './diagnostics';
import { makeDiagnostic } from './diagnostics';
import type {
  Arg,
  Expr,
  Modifier,
  ModelStruct,
  Program,
  Statement,
  StateVar,
  ViewExpr,
  ViewStruct,
} from './ast';

// Modifiers whose trailing closure contains VIEWS (vs statements).
const VIEW_CLOSURE_MODIFIERS = new Set([
  'sheet',
  'fullScreenCover',
  'overlay',
  'background',
  'popover',
  'safeAreaInset',
]);

export interface ParseResult {
  program: Program;
  diagnostics: Diagnostic[];
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  diagnostics: Diagnostic[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }
  private next(): Token {
    return this.tokens[this.pos++];
  }
  private atEnd(): boolean {
    return this.peek().type === 'eof';
  }
  private check(type: Token['type'], value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }
  private match(type: Token['type'], value?: string): boolean {
    if (this.check(type, value)) {
      this.pos++;
      return true;
    }
    return false;
  }
  private skipNewlines(): void {
    while (this.check('newline')) this.pos++;
  }
  private err(msg: string, compilesOnDevice = false): void {
    const t = this.peek();
    this.diagnostics.push(makeDiagnostic('error', msg, t.line, t.col, compilesOnDevice));
  }

  /** Skip a balanced { ... } block; assumes current token is '{'. */
  private skipBlock(): void {
    if (!this.match('punct', '{')) return;
    let depth = 1;
    while (!this.atEnd() && depth > 0) {
      if (this.check('punct', '{')) depth++;
      else if (this.check('punct', '}')) depth--;
      this.pos++;
    }
  }

  // ---------------- Top level ----------------

  parseProgram(): Program {
    const views: ViewStruct[] = [];
    const models: ModelStruct[] = [];
    while (!this.atEnd()) {
      this.skipNewlines();
      if (this.atEnd()) break;

      // skip `import Foundation`, `@main`, attributes on types, etc.
      if (this.check('identifier', 'import')) {
        this.skipToNewline();
        continue;
      }
      if (this.check('attribute')) {
        // e.g. @main before App struct — ignore attribute, continue
        this.pos++;
        continue;
      }
      if (this.check('keyword', 'struct')) {
        const decl = this.parseStruct();
        if (decl) {
          if (decl.kind === 'viewStruct') views.push(decl);
          else models.push(decl);
        }
        continue;
      }
      if (this.check('keyword', 'class') || this.check('keyword', 'enum')) {
        // skip class/enum bodies (unsupported in MVP)
        this.pos++;
        while (!this.atEnd() && !this.check('punct', '{')) this.pos++;
        this.skipBlock();
        continue;
      }
      // unknown top-level token — skip a line to recover
      this.skipToNewline();
    }

    const entry = pickEntry(views);
    return { kind: 'program', views, models, entry };
  }

  private skipToNewline(): void {
    while (!this.atEnd() && !this.check('newline')) this.pos++;
    this.skipNewlines();
  }

  private parseStruct(): ViewStruct | ModelStruct | null {
    this.next(); // 'struct'
    const nameTok = this.peek();
    if (nameTok.type !== 'identifier') {
      this.err('struct 名が必要です');
      this.skipToNewline();
      return null;
    }
    const name = this.next().value;

    // conformance list
    const conformances: string[] = [];
    if (this.match('punct', ':')) {
      do {
        if (this.check('identifier')) conformances.push(this.next().value);
        else break;
      } while (this.match('punct', ','));
    }
    this.skipNewlines();
    if (!this.match('punct', '{')) {
      this.err(`struct ${name} の本体 '{' が必要です`);
      return null;
    }

    const isView = conformances.includes('View');
    const isIdentifiable = conformances.includes('Identifiable');
    const stateVars: StateVar[] = [];
    let body: ViewExpr[] | null = null;

    this.skipNewlines();
    while (!this.atEnd() && !this.check('punct', '}')) {
      // property: optional attribute, optional access modifiers, var/let
      let varKind: StateVar['kind'] = 'plain';
      if (this.check('attribute')) {
        const attr = this.next().value;
        if (attr === '@State') varKind = 'state';
        else if (attr === '@Binding') varKind = 'binding';
        else varKind = 'plain'; // @StateObject etc. -> treat as plain (best effort)
      }
      // skip access/declaration modifiers
      while (
        this.check('keyword', 'private') ||
        this.check('keyword', 'public') ||
        this.check('keyword', 'internal') ||
        this.check('keyword', 'static')
      ) {
        this.pos++;
      }

      if (this.check('keyword', 'var') || this.check('keyword', 'let')) {
        this.next();
        const propTok = this.peek();
        if (propTok.type !== 'identifier') {
          this.skipToNewline();
          continue;
        }
        const propName = this.next().value;

        // `var body: some View { ... }`
        if (propName === 'body') {
          // skip `: some View`
          if (this.match('punct', ':')) {
            while (!this.atEnd() && !this.check('punct', '{') && !this.check('newline')) this.pos++;
          }
          this.skipNewlines();
          if (this.check('punct', '{')) {
            body = this.parseViewBlock();
          }
          this.skipNewlines();
          continue;
        }

        // declared type
        let declaredType: string | null = null;
        if (this.match('punct', ':')) {
          declaredType = this.parseTypeName();
        }
        // initializer
        let initializer: Expr | null = null;
        if (this.match('op', '=')) {
          initializer = this.parseExpr();
        }
        // computed property `{ ... }` -> skip
        if (this.check('punct', '{')) this.skipBlock();

        stateVars.push({ kind: varKind, name: propName, declaredType, initializer });
        this.skipNewlines();
        continue;
      }

      if (this.check('keyword', 'func') || this.check('keyword', 'init')) {
        // skip function/initializer
        while (!this.atEnd() && !this.check('punct', '{') && !this.check('punct', '}')) this.pos++;
        if (this.check('punct', '{')) this.skipBlock();
        this.skipNewlines();
        continue;
      }

      if (this.check('keyword', 'struct') || this.check('keyword', 'enum') || this.check('keyword', 'class')) {
        // nested type — skip
        this.pos++;
        while (!this.atEnd() && !this.check('punct', '{')) this.pos++;
        this.skipBlock();
        this.skipNewlines();
        continue;
      }

      // unrecognized — recover
      this.skipToNewline();
    }
    this.match('punct', '}');

    if (isView) {
      return { kind: 'viewStruct', name, isView: true, stateVars, body: body ?? [] };
    }
    return { kind: 'modelStruct', name, fields: stateVars, isIdentifiable };
  }

  private parseTypeName(): string {
    // consume a (possibly generic/optional) type up to '=' or newline or '{'
    let depth = 0;
    let out = '';
    while (!this.atEnd()) {
      const t = this.peek();
      if (
        depth === 0 &&
        (t.type === 'newline' ||
          (t.type === 'op' && t.value === '=') ||
          (t.type === 'punct' && (t.value === '{' || t.value === '}' || t.value === ',' || t.value === ')')))
      ) {
        break;
      }
      if (t.type === 'op' && t.value === '<') depth++;
      if (t.type === 'op' && t.value === '>') depth--;
      if (t.type === 'punct' && t.value === '[') depth++;
      if (t.type === 'punct' && t.value === ']') depth--;
      out += t.value;
      this.pos++;
    }
    return out.trim();
  }

  // ---------------- View block ----------------

  parseViewBlock(): ViewExpr[] {
    const views: ViewExpr[] = [];
    if (!this.match('punct', '{')) return views;
    this.skipNewlines();
    // optional closure capture list, e.g. `proxy in` / `ctx in`
    if (this.check('identifier') && this.peek(1).type === 'keyword' && this.peek(1).value === 'in') {
      this.next();
      this.next();
      this.skipNewlines();
    }
    while (!this.atEnd() && !this.check('punct', '}')) {
      const v = this.parseViewStatement();
      if (v) views.push(v);
      this.skipNewlines();
    }
    this.match('punct', '}');
    return views;
  }

  private parseViewStatement(): ViewExpr | null {
    const line = this.peek().line;

    if (this.check('keyword', 'if')) {
      return this.parseIfView();
    }
    if (this.check('keyword', 'return')) {
      this.next();
      return this.parseViewStatement();
    }
    // local declarations inside a ViewBuilder (let x = ...) -> ignore
    if (this.check('keyword', 'let') || this.check('keyword', 'var')) {
      this.skipToNewline();
      return null;
    }
    if (this.check('identifier', 'ForEach')) {
      return this.parseForEach();
    }
    if (this.check('identifier')) {
      return this.parseViewPrimary();
    }

    // Anything else: record as unsupported and recover
    const tok = this.peek();
    this.diagnostics.push(
      makeDiagnostic('error', `予期しないトークン '${tok.value || tok.type}' をスキップしました`, tok.line, tok.col),
    );
    this.skipToNewline();
    return { kind: 'unsupported', label: tok.value || '???', line };
  }

  private parseIfView(): ViewExpr {
    const line = this.peek().line;
    this.next(); // 'if'
    const condition = this.parseExpr();
    this.skipNewlines();
    const thenBranch = this.parseViewBlock();
    let elseBranch: ViewExpr[] = [];
    this.skipNewlines();
    if (this.check('keyword', 'else')) {
      this.next();
      this.skipNewlines();
      if (this.check('keyword', 'if')) {
        elseBranch = [this.parseIfView()];
      } else {
        elseBranch = this.parseViewBlock();
      }
    }
    return { kind: 'if', condition, then: thenBranch, else: elseBranch, line };
  }

  private parseForEach(): ViewExpr {
    const line = this.peek().line;
    this.next(); // ForEach
    let data: Expr = { kind: 'array', elements: [] };
    let idKeyPath: string | null = null;
    if (this.match('punct', '(')) {
      data = this.parseExpr();
      while (this.match('punct', ',')) {
        // id: \.self  (the backslash is skipped by the lexer, leaving `.self`)
        if (this.check('identifier') && this.peek(1).type === 'punct' && this.peek(1).value === ':') {
          const label = this.next().value;
          this.next(); // ':'
          const v = this.parseExpr();
          if (label === 'id' && v.kind === 'member') idKeyPath = v.property;
        } else {
          this.parseExpr();
        }
      }
      this.match('punct', ')');
    }
    this.skipNewlines();
    // trailing closure: { item in ... }
    let itemName = 'item';
    let body: ViewExpr[] = [];
    if (this.check('punct', '{')) {
      this.next(); // {
      this.skipNewlines();
      // capture list `item in`
      if (this.check('identifier') && this.peek(1).type === 'keyword' && this.peek(1).value === 'in') {
        itemName = this.next().value;
        this.next(); // in
      }
      this.skipNewlines();
      while (!this.atEnd() && !this.check('punct', '}')) {
        const v = this.parseViewStatement();
        if (v) body.push(v);
        this.skipNewlines();
      }
      this.match('punct', '}');
    }
    const modifiers = this.parseModifierChain();
    return { kind: 'forEach', data, itemName, idKeyPath, body, modifiers, line };
  }

  private parseViewPrimary(): ViewExpr {
    const line = this.peek().line;
    const name = this.next().value;
    let args: Arg[] = [];
    let actionStatements: Statement[] | undefined;
    let childViews: ViewExpr[] | undefined;

    if (this.check('punct', '(')) {
      const parsed = this.parseArgList();
      args = parsed.args;
      if (parsed.actionStatements) actionStatements = parsed.actionStatements;
    }

    // trailing closure
    this.maybeSkipNewlineBeforeBrace();
    if (this.check('punct', '{')) {
      if (name === 'Button') {
        // Button("x") { action }  OR  Button { action }
        actionStatements = this.parseStatementBlock();
      } else {
        // container / content closure -> views
        childViews = this.parseViewBlock();
      }
    }

    const modifiers = this.parseModifierChain();
    return {
      kind: 'viewCall',
      name,
      args,
      childViews,
      actionStatements,
      modifiers,
      line,
    };
  }

  /** Allow a single newline between a call and its trailing `{` (Swift permits a space/newline). */
  private maybeSkipNewlineBeforeBrace(): void {
    if (this.check('newline') && this.peek(1).type === 'punct' && this.peek(1).value === '{') {
      this.pos++;
    }
  }

  private parseModifierChain(): Modifier[] {
    const mods: Modifier[] = [];
    for (;;) {
      const save = this.pos;
      this.skipNewlines();
      if (this.check('punct', '.') && this.peek(1).type === 'identifier') {
        this.next(); // '.'
        const line = this.peek().line;
        const mname = this.next().value;
        let margs: Arg[] = [];
        if (this.check('punct', '(')) {
          margs = this.parseArgList().args;
        }
        let trailingViews: ViewExpr[] | undefined;
        let trailingStatements: Statement[] | undefined;
        this.maybeSkipNewlineBeforeBrace();
        if (this.check('punct', '{')) {
          if (VIEW_CLOSURE_MODIFIERS.has(mname)) trailingViews = this.parseViewBlock();
          else trailingStatements = this.parseStatementBlock();
        }
        mods.push({ name: mname, args: margs, trailingViews, trailingStatements, line });
      } else {
        this.pos = save; // not a modifier — leave the newline for the block loop
        break;
      }
    }
    return mods;
  }

  // ---------------- Arguments ----------------

  private parseArgList(): { args: Arg[]; actionStatements?: Statement[] } {
    const args: Arg[] = [];
    let actionStatements: Statement[] | undefined;
    this.match('punct', '(');
    this.skipNewlines();
    while (!this.atEnd() && !this.check('punct', ')')) {
      let label: string | null = null;
      if (this.check('identifier') && this.peek(1).type === 'punct' && this.peek(1).value === ':') {
        label = this.next().value;
        this.next(); // ':'
      }
      this.skipNewlines();
      // closure-valued argument (e.g. action: { ... })
      if (this.check('punct', '{')) {
        const stmts = this.parseStatementBlock();
        if (label === 'action') actionStatements = stmts;
        // represent as an (ignored) nil arg so positions stay sane
        args.push({ label, value: { kind: 'nilLit' } });
      } else {
        const value = this.parseExpr();
        args.push({ label, value });
      }
      this.skipNewlines();
      if (!this.match('punct', ',')) break;
      this.skipNewlines();
    }
    this.match('punct', ')');
    return { args, actionStatements };
  }

  // ---------------- Statements (action closures) ----------------

  parseStatementBlock(): Statement[] {
    const stmts: Statement[] = [];
    if (!this.match('punct', '{')) return stmts;
    this.skipNewlines();
    // skip a capture list like `value in`
    if (this.check('identifier') && this.peek(1).type === 'keyword' && this.peek(1).value === 'in') {
      this.next();
      this.next();
      this.skipNewlines();
    }
    while (!this.atEnd() && !this.check('punct', '}')) {
      const s = this.parseStatement();
      if (s) stmts.push(s);
      this.skipNewlines();
    }
    this.match('punct', '}');
    return stmts;
  }

  private parseStatement(): Statement | null {
    if (this.check('keyword', 'return')) {
      this.skipToNewline();
      return null;
    }
    if (this.check('keyword', 'let') || this.check('keyword', 'var')) {
      // local let/var inside action -> unsupported, skip
      this.skipToNewline();
      return null;
    }
    if (this.check('keyword', 'if')) {
      this.next();
      const condition = this.parseExpr();
      this.skipNewlines();
      const then = this.parseStatementBlock();
      let elseBranch: Statement[] = [];
      this.skipNewlines();
      if (this.check('keyword', 'else')) {
        this.next();
        this.skipNewlines();
        if (this.check('keyword', 'if')) {
          const inner = this.parseStatement();
          if (inner) elseBranch = [inner];
        } else {
          elseBranch = this.parseStatementBlock();
        }
      }
      return { kind: 'if', condition, then, else: elseBranch };
    }
    if (this.check('identifier', 'withAnimation')) {
      this.next();
      if (this.check('punct', '(')) this.parseArgList(); // ignore animation arg
      this.skipNewlines();
      const body = this.parseStatementBlock();
      return { kind: 'withAnimation', body };
    }

    // expression-based: assignment or bare call
    const target = this.parseExpr();
    if (this.check('op') && ['=', '+=', '-=', '*=', '/='].includes(this.peek().value)) {
      const op = this.next().value;
      const value = this.parseExpr();
      return { kind: 'assign', target, op, value };
    }
    return { kind: 'exprStmt', expr: target };
  }

  // ---------------- Expressions ----------------

  parseExpr(): Expr {
    return this.parseOr();
  }
  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.check('op', '||')) {
      this.next();
      const right = this.parseAnd();
      left = { kind: 'binary', op: '||', left, right };
    }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseEquality();
    while (this.check('op', '&&')) {
      this.next();
      const right = this.parseEquality();
      left = { kind: 'binary', op: '&&', left, right };
    }
    return left;
  }
  private parseEquality(): Expr {
    let left = this.parseComparison();
    while (this.check('op', '==') || this.check('op', '!=')) {
      const op = this.next().value;
      const right = this.parseComparison();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  private parseComparison(): Expr {
    let left = this.parseRange();
    while (this.check('op', '<') || this.check('op', '>') || this.check('op', '<=') || this.check('op', '>=')) {
      const op = this.next().value;
      const right = this.parseRange();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  private parseRange(): Expr {
    const left = this.parseAdditive();
    // `..<` => punct '.', punct '.', op '<'  ;  `...` => '.', '.', '.'
    if (this.check('punct', '.') && this.peek(1).type === 'punct' && this.peek(1).value === '.') {
      this.next();
      this.next();
      let op = '...';
      if (this.match('op', '<')) op = '..<';
      else if (this.check('punct', '.')) this.next(); // third dot of '...'
      const right = this.parseAdditive();
      return { kind: 'binary', op, left, right };
    }
    return left;
  }
  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.check('op', '+') || this.check('op', '-')) {
      const op = this.next().value;
      const right = this.parseMultiplicative();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (this.check('op', '*') || this.check('op', '/') || this.check('op', '%')) {
      const op = this.next().value;
      const right = this.parseUnary();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  private parseUnary(): Expr {
    if (this.check('op', '!') || this.check('op', '-')) {
      const op = this.next().value;
      const operand = this.parseUnary();
      return { kind: 'unary', op, operand };
    }
    return this.parsePostfix();
  }
  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    for (;;) {
      // member access a.b  (but not '..' range, handled higher up)
      if (this.check('punct', '.') && this.peek(1).type === 'identifier') {
        this.next();
        const prop = this.next().value;
        expr = { kind: 'member', object: expr, property: prop };
        continue;
      }
      // member access with keyword (e.g. .self)
      if (this.check('punct', '.') && this.peek(1).type === 'keyword' && this.peek(1).value === 'self') {
        this.next();
        this.next();
        expr = { kind: 'member', object: expr, property: 'self' };
        continue;
      }
      if (this.check('punct', '(')) {
        const { args } = this.parseArgList();
        expr = { kind: 'call', callee: expr, args };
        continue;
      }
      if (this.check('punct', '[')) {
        this.next();
        const index = this.parseExpr();
        this.match('punct', ']');
        expr = { kind: 'index', object: expr, index };
        continue;
      }
      break;
    }
    return expr;
  }
  private parsePrimary(): Expr {
    const t = this.peek();

    if (t.type === 'number') {
      this.next();
      return { kind: 'numberLit', value: Number(t.value) };
    }
    if (t.type === 'string') {
      this.next();
      const parts = t.stringParts ?? [t.value];
      if (parts.length <= 1) {
        return { kind: 'stringLit', value: parts[0] ?? '' };
      }
      // interpolation: even idx text, odd idx expression source
      const out: Array<{ text: string } | { expr: Expr }> = [];
      parts.forEach((p, idx) => {
        if (idx % 2 === 0) out.push({ text: p });
        else out.push({ expr: parseExprFromSource(p) });
      });
      return { kind: 'stringInterp', parts: out };
    }
    if (t.type === 'bool') {
      this.next();
      return { kind: 'boolLit', value: t.value === 'true' };
    }
    if (t.type === 'keyword' && t.value === 'nil') {
      this.next();
      return { kind: 'nilLit' };
    }
    if (t.type === 'keyword' && t.value === 'self') {
      this.next();
      return { kind: 'identifier', name: 'self' };
    }
    if (t.type === 'dollar') {
      this.next();
      const id = this.check('identifier') ? this.next().value : '';
      return { kind: 'bindingRef', name: id };
    }
    if (t.type === 'identifier') {
      this.next();
      return { kind: 'identifier', name: t.value };
    }
    // leading-dot enum member: .red  .title  .center
    if (t.type === 'punct' && t.value === '.' && this.peek(1).type === 'identifier') {
      this.next();
      const prop = this.next().value;
      return { kind: 'member', object: null, property: prop };
    }
    if (t.type === 'punct' && t.value === '(') {
      this.next();
      const e = this.parseExpr();
      this.match('punct', ')');
      return e;
    }
    if (t.type === 'punct' && t.value === '[') {
      this.next();
      const elements: Expr[] = [];
      this.skipNewlines();
      while (!this.atEnd() && !this.check('punct', ']')) {
        elements.push(this.parseExpr());
        this.skipNewlines();
        if (!this.match('punct', ',')) break;
        this.skipNewlines();
      }
      this.match('punct', ']');
      return { kind: 'array', elements };
    }

    // could not parse — consume one token to avoid infinite loop
    this.next();
    return { kind: 'nilLit' };
  }
}

function pickEntry(views: ViewStruct[]): string | null {
  if (views.length === 0) return null;
  const content = views.find((v) => v.name === 'ContentView');
  if (content) return content.name;
  // prefer a non-App view
  const nonApp = views.find((v) => !v.name.endsWith('App'));
  return (nonApp ?? views[0]).name;
}

export function parse(src: string): ParseResult {
  const { tokens, diagnostics: lexDiags } = tokenize(src);
  const parser = new Parser(tokens);
  const program = parser.parseProgram();
  return { program, diagnostics: [...lexDiags, ...parser.diagnostics] };
}

/** Parse a standalone expression (used for string interpolation segments). */
export function parseExprFromSource(src: string): Expr {
  const { tokens } = tokenize(src);
  const parser = new Parser(tokens);
  return parser.parseExpr();
}
