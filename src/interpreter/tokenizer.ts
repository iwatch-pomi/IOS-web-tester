import { KEYWORDS, type Token, type TokenType } from './token';
import type { Diagnostic } from './diagnostics';
import { makeDiagnostic } from './diagnostics';

const TWO_CHAR_OPS = new Set(['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '??']);
const SINGLE_OPS = new Set(['=', '<', '>', '!', '+', '-', '*', '/', '%', '?']);
const PUNCT = new Set(['(', ')', '{', '}', '[', ']', ',', ':', '.']);

export interface TokenizeResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

/** Convert Swift source text into a flat token stream. Never throws. */
export function tokenize(src: string): TokenizeResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  const push = (type: TokenType, value: string, start: number, startLine: number, startCol: number, extra?: Partial<Token>) => {
    tokens.push({ type, value, start, end: i, line: startLine, col: startCol, ...extra });
  };

  while (i < src.length) {
    const ch = src[i];
    const startLine = line;
    const startCol = col;
    const start = i;

    // Newline (significant: separates sibling views / statements)
    if (ch === '\n') {
      advance();
      // collapse consecutive newlines into a single token
      if (tokens.length && tokens[tokens.length - 1].type !== 'newline') {
        push('newline', '\n', start, startLine, startCol);
      }
      continue;
    }

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      advance();
      continue;
    }

    // Semicolon acts as a statement separator (like a newline)
    if (ch === ';') {
      advance();
      if (tokens.length && tokens[tokens.length - 1].type !== 'newline') {
        push('newline', '\n', start, startLine, startCol);
      }
      continue;
    }

    // Line comment
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') advance();
      continue;
    }

    // Block comment
    if (ch === '/' && src[i + 1] === '*') {
      advance(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) advance();
      advance(2);
      continue;
    }

    // String literal (with \( ) interpolation captured into stringParts)
    if (ch === '"') {
      const parts: string[] = [];
      let buf = '';
      advance(); // opening quote
      let closed = false;
      while (i < src.length) {
        const c = src[i];
        if (c === '\\' && src[i + 1] === '(') {
          parts.push(buf);
          buf = '';
          advance(2); // consume \(
          let depth = 1;
          let exprSrc = '';
          while (i < src.length && depth > 0) {
            const e = src[i];
            if (e === '(') depth++;
            else if (e === ')') {
              depth--;
              if (depth === 0) break;
            }
            exprSrc += e;
            advance();
          }
          advance(); // consume )
          parts.push(exprSrc);
          continue;
        }
        if (c === '\\') {
          const next = src[i + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\', '0': '\0' };
          buf += map[next] ?? next;
          advance(2);
          continue;
        }
        if (c === '"') {
          closed = true;
          advance();
          break;
        }
        if (c === '\n') break; // unterminated
        buf += c;
        advance();
      }
      parts.push(buf);
      if (!closed) {
        diagnostics.push(makeDiagnostic('error', '文字列が閉じられていません', startLine, startCol));
      }
      // value = concatenation of literal parts (interpolation handled by parser via stringParts)
      push('string', parts.filter((_, idx) => idx % 2 === 0).join(''), start, startLine, startCol, {
        stringParts: parts,
      });
      continue;
    }

    // Attribute @State / @Binding / @StateObject ...
    if (ch === '@') {
      advance();
      let name = '@';
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) {
        name += src[i];
        advance();
      }
      push('attribute', name, start, startLine, startCol);
      continue;
    }

    // Dollar sigil for binding projection: $count
    if (ch === '$') {
      advance();
      push('dollar', '$', start, startLine, startCol);
      continue;
    }

    // Number
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < src.length && /[0-9_.]/.test(src[i])) {
        num += src[i];
        advance();
      }
      push('number', num.replace(/_/g, ''), start, startLine, startCol);
      continue;
    }

    // Identifier / keyword
    if (/[A-Za-z_]/.test(ch)) {
      let id = '';
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) {
        id += src[i];
        advance();
      }
      if (id === 'true' || id === 'false') {
        push('bool', id, start, startLine, startCol);
      } else if (KEYWORDS.has(id)) {
        push('keyword', id, start, startLine, startCol);
      } else {
        push('identifier', id, start, startLine, startCol);
      }
      continue;
    }

    // Two-char operators
    const two = src.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      advance(2);
      push('op', two, start, startLine, startCol);
      continue;
    }

    // Single-char punctuation / operators
    if (PUNCT.has(ch)) {
      advance();
      push('punct', ch, start, startLine, startCol);
      continue;
    }
    if (SINGLE_OPS.has(ch)) {
      advance();
      push('op', ch, start, startLine, startCol);
      continue;
    }

    // Unknown char — skip with a diagnostic
    diagnostics.push(makeDiagnostic('warning', `認識できない文字 '${ch}' をスキップしました`, startLine, startCol));
    advance();
  }

  // strip trailing newline token
  while (tokens.length && tokens[tokens.length - 1].type === 'newline') tokens.pop();
  tokens.push({ type: 'eof', value: '', start: i, end: i, line, col });
  return { tokens, diagnostics };
}
