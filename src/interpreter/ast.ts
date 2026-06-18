// ---- Expressions ----

export type Expr =
  | { kind: 'numberLit'; value: number }
  | { kind: 'stringLit'; value: string }
  | { kind: 'stringInterp'; parts: Array<{ text: string } | { expr: Expr }> }
  | { kind: 'boolLit'; value: boolean }
  | { kind: 'nilLit' }
  | { kind: 'identifier'; name: string }
  | { kind: 'bindingRef'; name: string } // $count
  | { kind: 'member'; object: Expr | null; property: string } // a.b  or  .red (object null)
  | { kind: 'index'; object: Expr; index: Expr }
  | { kind: 'call'; callee: Expr; args: Arg[] }
  | { kind: 'unary'; op: string; operand: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'array'; elements: Expr[] }
  | { kind: 'closure'; params: string[]; body: ViewExpr[] }; // trailing closure used as value

export interface Arg {
  label: string | null;
  value: Expr;
}

// ---- Statements (inside button/action closures) ----

export type Statement =
  | { kind: 'assign'; target: Expr; op: string; value: Expr } // x = e, x += e
  | { kind: 'exprStmt'; expr: Expr } // x.toggle(), foo()
  | { kind: 'withAnimation'; body: Statement[] }
  | { kind: 'if'; condition: Expr; then: Statement[]; else: Statement[] };

// ---- View expressions (the render tree before evaluation) ----

export interface Modifier {
  name: string;
  args: Arg[];
  /** trailing closure content (e.g. .sheet { ... }) parsed as views */
  trailingViews?: ViewExpr[];
  /** trailing closure parsed as statements (e.g. .onTapGesture { ... }) */
  trailingStatements?: Statement[];
  line: number;
}

export type ViewExpr =
  | {
      kind: 'viewCall';
      name: string;
      args: Arg[];
      /** label/content closure that contains child views */
      childViews?: ViewExpr[];
      /** action closure (Button) parsed as statements */
      actionStatements?: Statement[];
      modifiers: Modifier[];
      line: number;
    }
  | {
      kind: 'forEach';
      data: Expr;
      itemName: string;
      idKeyPath: string | null;
      body: ViewExpr[];
      modifiers: Modifier[];
      line: number;
    }
  | {
      kind: 'if';
      condition: Expr;
      then: ViewExpr[];
      else: ViewExpr[];
      line: number;
    }
  | {
      kind: 'unsupported';
      label: string;
      line: number;
    };

// ---- Declarations ----

export interface StateVar {
  kind: 'state' | 'binding' | 'plain';
  name: string;
  declaredType: string | null;
  initializer: Expr | null;
}

export interface ViewStruct {
  kind: 'viewStruct';
  name: string;
  isView: boolean;
  stateVars: StateVar[];
  body: ViewExpr[];
}

export interface ModelStruct {
  kind: 'modelStruct';
  name: string;
  fields: StateVar[];
  isIdentifiable: boolean;
}

export interface Program {
  kind: 'program';
  views: ViewStruct[];
  models: ModelStruct[];
  /** name of the struct to render first (first View struct, or one named *App/ContentView) */
  entry: string | null;
}
