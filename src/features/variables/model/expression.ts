export type ExpressionToken =
  | { kind: 'number'; value: number }
  | { kind: 'identifier'; name: string }
  | { kind: 'plus' | 'minus' | 'star' | 'slash' | 'lparen' | 'rparen' };

export type ExpressionAst =
  | {
      kind: 'number';
      value: number;
    }
  | {
      kind: 'identifier';
      name: string;
    }
  | {
      kind: 'unary';
      operator: '+' | '-';
      argument: ExpressionAst;
    }
  | {
      kind: 'binary';
      operator: '+' | '-' | '*' | '/';
      left: ExpressionAst;
      right: ExpressionAst;
    };

export type ExpressionParseResult =
  | {
      ok: true;
      ast: ExpressionAst;
      dependencies: string[];
    }
  | {
      ok: false;
      reason: string;
    };

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function isNumberStart(char: string): boolean {
  return /[0-9.]/.test(char);
}

function tokenize(input: string): ExpressionToken[] | { error: string } {
  const tokens: ExpressionToken[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '+') {
      tokens.push({ kind: 'plus' });
      index += 1;
      continue;
    }
    if (char === '-') {
      tokens.push({ kind: 'minus' });
      index += 1;
      continue;
    }
    if (char === '*') {
      tokens.push({ kind: 'star' });
      index += 1;
      continue;
    }
    if (char === '/') {
      tokens.push({ kind: 'slash' });
      index += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen' });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen' });
      index += 1;
      continue;
    }

    if (isIdentifierStart(char)) {
      let end = index + 1;
      while (end < input.length && isIdentifierPart(input[end])) {
        end += 1;
      }
      tokens.push({ kind: 'identifier', name: input.slice(index, end) });
      index = end;
      continue;
    }

    if (isNumberStart(char)) {
      let end = index + 1;
      let sawDot = char === '.';
      while (end < input.length) {
        const next = input[end];
        if (next === '.') {
          if (sawDot) {
            break;
          }
          sawDot = true;
          end += 1;
          continue;
        }
        if (!/[0-9]/.test(next)) {
          break;
        }
        end += 1;
      }

      const raw = input.slice(index, end);
      if (raw === '.' || raw === '+.' || raw === '-.') {
        return { error: `Invalid number literal near "${raw}".` };
      }

      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return { error: `Invalid number literal "${raw}".` };
      }
      tokens.push({ kind: 'number', value });
      index = end;
      continue;
    }

    return { error: `Unexpected character "${char}" in expression.` };
  }

  return tokens;
}

class Parser {
  private readonly tokens: ExpressionToken[];
  private index = 0;

  constructor(tokens: ExpressionToken[]) {
    this.tokens = tokens;
  }

  private peek(): ExpressionToken | undefined {
    return this.tokens[this.index];
  }

  private consume(): ExpressionToken | undefined {
    const token = this.tokens[this.index];
    if (token) {
      this.index += 1;
    }
    return token;
  }

  public isDone(): boolean {
    return this.index >= this.tokens.length;
  }

  private parsePrimary(): ExpressionParseResult {
    const token = this.consume();
    if (!token) {
      return { ok: false, reason: 'Unexpected end of expression.' };
    }

    if (token.kind === 'number') {
      return { ok: true, ast: { kind: 'number', value: token.value }, dependencies: [] };
    }

    if (token.kind === 'identifier') {
      return { ok: true, ast: { kind: 'identifier', name: token.name }, dependencies: [token.name] };
    }

    if (token.kind === 'lparen') {
      const expr = this.parseExpression();
      if (!expr.ok) {
        return expr;
      }
      const closing = this.consume();
      if (!closing || closing.kind !== 'rparen') {
        return { ok: false, reason: 'Missing closing parenthesis.' };
      }
      return expr;
    }

    return { ok: false, reason: 'Expected a number, identifier, or parenthesized expression.' };
  }

  private parseUnary(): ExpressionParseResult {
    const token = this.peek();
    if (token?.kind === 'plus' || token?.kind === 'minus') {
      this.consume();
      const argument = this.parseUnary();
      if (!argument.ok) {
        return argument;
      }
      return {
        ok: true,
        ast: {
          kind: 'unary',
          operator: token.kind === 'plus' ? '+' : '-',
          argument: argument.ast,
        },
        dependencies: argument.dependencies,
      };
    }

    return this.parsePrimary();
  }

  private parseFactor(): ExpressionParseResult {
    const left = this.parseUnary();
    if (!left.ok) {
      return left;
    }

    let ast = left.ast;
    const dependencies = new Set(left.dependencies);
    while (true) {
      const token = this.peek();
      if (token?.kind !== 'star' && token?.kind !== 'slash') {
        break;
      }
      this.consume();
      const right = this.parseUnary();
      if (!right.ok) {
        return right;
      }
      right.dependencies.forEach((dependency) => dependencies.add(dependency));
      ast = {
        kind: 'binary',
        operator: token.kind === 'star' ? '*' : '/',
        left: ast,
        right: right.ast,
      };
    }

    return { ok: true, ast, dependencies: [...dependencies] };
  }

  public parseExpression(): ExpressionParseResult {
    const left = this.parseFactor();
    if (!left.ok) {
      return left;
    }

    let ast = left.ast;
    const dependencies = new Set(left.dependencies);
    while (true) {
      const token = this.peek();
      if (token?.kind !== 'plus' && token?.kind !== 'minus') {
        break;
      }
      this.consume();
      const right = this.parseFactor();
      if (!right.ok) {
        return right;
      }
      right.dependencies.forEach((dependency) => dependencies.add(dependency));
      ast = {
        kind: 'binary',
        operator: token.kind === 'plus' ? '+' : '-',
        left: ast,
        right: right.ast,
      };
    }

    return { ok: true, ast, dependencies: [...dependencies] };
  }
}

export function parseExpression(input: string): ExpressionParseResult {
  const tokenized = tokenize(input);
  if ('error' in tokenized) {
    return { ok: false, reason: tokenized.error };
  }

  if (tokenized.length === 0) {
    return { ok: false, reason: 'Expression is empty.' };
  }

  const parser = new Parser(tokenized);
  const result = parser.parseExpression();
  if (!result.ok) {
    return result;
  }

  if (!parser.isDone()) {
    return { ok: false, reason: 'Unexpected trailing tokens in expression.' };
  }

  return result;
}

export function evaluateExpression(
  ast: ExpressionAst,
  lookup: (name: string) => number | undefined,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (ast.kind === 'number') {
    return { ok: true, value: ast.value };
  }

  if (ast.kind === 'identifier') {
    const value = lookup(ast.name);
    if (value === undefined) {
      return { ok: false, reason: `Unknown variable "${ast.name}".` };
    }
    return { ok: true, value };
  }

  if (ast.kind === 'unary') {
    const argument = evaluateExpression(ast.argument, lookup);
    if (!argument.ok) {
      return argument;
    }
    return {
      ok: true,
      value: ast.operator === '+' ? argument.value : -argument.value,
    };
  }

  const left = evaluateExpression(ast.left, lookup);
  if (!left.ok) {
    return left;
  }
  const right = evaluateExpression(ast.right, lookup);
  if (!right.ok) {
    return right;
  }

  if (ast.operator === '+') {
    return { ok: true, value: left.value + right.value };
  }
  if (ast.operator === '-') {
    return { ok: true, value: left.value - right.value };
  }
  if (ast.operator === '*') {
    return { ok: true, value: left.value * right.value };
  }
  if (right.value === 0) {
    return { ok: false, reason: 'Division by zero.' };
  }
  return { ok: true, value: left.value / right.value };
}
