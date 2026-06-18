export type TokenType =
  | 'keyword'
  | 'attribute' // @State, @Binding, ...
  | 'identifier'
  | 'number'
  | 'string'
  | 'bool'
  | 'punct' // ( ) { } [ ] , : .
  | 'op' // = == != < > <= >= && || ! + - * / % ?? ?
  | 'dollar' // $ sigil for Binding projection
  | 'newline'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number; // 1-based
  col: number; // 1-based
  /**
   * For string tokens: the raw segments split on \( ... ) interpolation.
   * Even indices are literal text, odd indices are raw expression source.
   */
  stringParts?: string[];
}

export const KEYWORDS = new Set([
  'struct',
  'class',
  'enum',
  'var',
  'let',
  'some',
  'func',
  'if',
  'else',
  'return',
  'in',
  'true',
  'false',
  'private',
  'public',
  'internal',
  'static',
  'self',
  'nil',
]);
