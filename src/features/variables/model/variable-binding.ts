import type { ExpressionBinding } from './types';

const NUMERIC_LITERAL_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)$/;

function parseQuotedString(text: string): string | undefined {
  if (text.length < 2) {
    return undefined;
  }

  const first = text[0];
  const last = text[text.length - 1];
  if ((first !== '"' && first !== "'") || last !== first) {
    return undefined;
  }

  return text.slice(1, -1);
}

export function bindingTextToExpressionBinding(text: string): ExpressionBinding {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { kind: 'literal', value: '' };
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'true') {
    return { kind: 'literal', value: true };
  }
  if (lower === 'false') {
    return { kind: 'literal', value: false };
  }
  if (lower === 'null') {
    return { kind: 'literal', value: null };
  }
  if (NUMERIC_LITERAL_PATTERN.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return { kind: 'literal', value: parsed };
    }
  }

  const quoted = parseQuotedString(trimmed);
  if (quoted !== undefined) {
    return { kind: 'literal', value: quoted };
  }

  return { kind: 'expression', expr: text };
}

export function expressionBindingToText(binding: ExpressionBinding): string {
  if (binding.kind === 'expression') {
    return binding.expr;
  }

  if (typeof binding.value === 'string') {
    return JSON.stringify(binding.value);
  }

  if (binding.value === null) {
    return 'null';
  }

  return String(binding.value);
}

export function createNextVariableName(existingNames: Iterable<string>): string {
  const usedNames = new Set(existingNames);
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `var${index}`;
    if (!usedNames.has(candidate)) {
      return candidate;
    }
  }

  return `var-${Math.random().toString(36).slice(2, 8)}`;
}

export function createUniqueVariableName(existingNames: Iterable<string>, desiredName: string): string {
  const usedNames = new Set(existingNames);
  const baseName = desiredName.trim();
  if (!baseName) {
    return createNextVariableName(usedNames);
  }

  if (!usedNames.has(baseName)) {
    return baseName;
  }

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${baseName}-${index}`;
    if (!usedNames.has(candidate)) {
      return candidate;
    }
  }

  return `${baseName}-${Math.random().toString(36).slice(2, 8)}`;
}
