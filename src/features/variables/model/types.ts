export type JsonPrimitive = string | number | boolean | null;

export type ExpressionBinding =
  | {
      kind: 'literal';
      value: JsonPrimitive;
    }
  | {
      kind: 'expression';
      expr: string;
    };

