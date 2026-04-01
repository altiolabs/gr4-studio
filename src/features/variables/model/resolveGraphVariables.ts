import type { GraphDocument, GraphParameterValue } from '../../graph-document/model/types';
import type { ExpressionAst } from './expression';
import { evaluateExpression, parseExpression } from './expression';
import type { ExpressionBinding, JsonPrimitive } from './types';

export type GraphVariableResolutionStatus =
  | 'resolved'
  | 'literal'
  | 'parse_error'
  | 'unknown_variable'
  | 'cycle'
  | 'non_numeric';

export type GraphExpressionDiagnostic = {
  kind: 'duplicate_variable' | 'parse_error' | 'unknown_variable' | 'cycle' | 'non_numeric' | 'missing_node';
  message: string;
  path?: string[];
};

export type ResolvedExpressionBinding = {
  binding: ExpressionBinding;
  dependencies: string[];
  state: GraphVariableResolutionStatus;
  value?: JsonPrimitive;
  reason?: string;
};

export type ResolvedGraphVariables = {
  variablesByName: Record<string, ResolvedExpressionBinding>;
  parametersByNodeId: Record<string, Record<string, ResolvedExpressionBinding>>;
  diagnostics: GraphExpressionDiagnostic[];
};

function isNumericLiteral(value: JsonPrimitive): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function coerceNumber(value: JsonPrimitive): number | undefined {
  if (isNumericLiteral(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '' && /^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }

  return undefined;
}

function toLiteralResolution(binding: Extract<ExpressionBinding, { kind: 'literal' }>): ResolvedExpressionBinding {
  return {
    binding,
    dependencies: [],
    state: 'literal',
    value: binding.value,
  };
}

function toExpressionParseFailure(binding: ExpressionBinding, reason: string): ResolvedExpressionBinding {
  return {
    binding,
    dependencies: [],
    state: 'parse_error',
    reason,
  };
}

function collectAstDependencies(ast: ExpressionAst): string[] {
  if (ast.kind === 'identifier') {
    return [ast.name];
  }
  if (ast.kind === 'number') {
    return [];
  }
  if (ast.kind === 'unary') {
    return collectAstDependencies(ast.argument);
  }
  return [...collectAstDependencies(ast.left), ...collectAstDependencies(ast.right)];
}

function evaluateAstWithEnv(
  ast: ExpressionAst,
  lookup: (name: string) => number | { error: string } | undefined,
): number | { error: string } {
  try {
    const result = evaluateExpression(ast, (name) => {
      const value = lookup(name);
      if (value && typeof value === 'object') {
        throw new Error(value.error);
      }
      return value;
    });
    if (!result.ok) {
      return { error: result.reason };
    }
    return result.value;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function isGraphParameterBinding(value: GraphParameterValue): value is ExpressionBinding {
  return Boolean(value) && typeof value === 'object' && ('kind' in value);
}

function coerceDependencyValue(
  dependencyResolution: ResolvedExpressionBinding | undefined,
  dependencyName: string,
): number | { error: string } | undefined {
  if (!dependencyResolution) {
    return { error: `Unknown variable "${dependencyName}".` };
  }

  if (dependencyResolution.state === 'cycle') {
    return { error: dependencyResolution.reason ?? `Variable "${dependencyName}" is part of a cycle.` };
  }

  if (dependencyResolution.state === 'unknown_variable') {
    return { error: dependencyResolution.reason ?? `Unknown variable "${dependencyName}".` };
  }

  if (dependencyResolution.state === 'non_numeric') {
    return { error: dependencyResolution.reason ?? `Variable "${dependencyName}" is not numeric.` };
  }

  const value = coerceNumber(dependencyResolution.value ?? null);
  if (value === undefined) {
    return { error: `Variable "${dependencyName}" is not numeric.` };
  }
  return value;
}

export function resolveGraphVariables(document: GraphDocument): ResolvedGraphVariables {
  const diagnostics: GraphExpressionDiagnostic[] = [];
  const variablesByName: Record<string, ResolvedExpressionBinding> = {};
  const variables = document.metadata.studio?.variables ?? [];
  const variableByName = new Map<string, { id: string; binding: ExpressionBinding }>();

  for (const variable of variables) {
    if (variableByName.has(variable.name)) {
      diagnostics.push({
        kind: 'duplicate_variable',
        message: `Variable "${variable.name}" is defined more than once.`,
        path: ['metadata', 'studio', 'variables'],
      });
      continue;
    }
    variableByName.set(variable.name, { id: variable.id, binding: variable.binding });
  }

  const resolving = new Set<string>();
  const resolveVariable = (name: string): ResolvedExpressionBinding | undefined => {
    const cached = variablesByName[name];
    if (cached) {
      return cached;
    }

    const variable = variableByName.get(name);
    if (!variable) {
      const missing: ResolvedExpressionBinding = {
        binding: { kind: 'literal', value: null },
        dependencies: [],
        state: 'unknown_variable',
        reason: `Unknown variable "${name}".`,
      };
      variablesByName[name] = missing;
      return missing;
    }

    if (resolving.has(name)) {
      const cycle: ResolvedExpressionBinding = {
        binding: variable.binding,
        dependencies: [],
        state: 'cycle',
        reason: `Variable "${name}" is part of a cycle.`,
      };
      variablesByName[name] = cycle;
      diagnostics.push({
        kind: 'cycle',
        message: cycle.reason ?? `Variable "${name}" is part of a cycle.`,
        path: ['metadata', 'studio', 'variables', name],
      });
      return cycle;
    }

    resolving.add(name);

    let nextResolution: ResolvedExpressionBinding;
    if (variable.binding.kind === 'literal') {
      nextResolution = toLiteralResolution(variable.binding);
    } else {
      const parsed = parseExpression(variable.binding.expr);
      if (!parsed.ok) {
        nextResolution = toExpressionParseFailure(variable.binding, parsed.reason);
        diagnostics.push({
          kind: 'parse_error',
          message: parsed.reason,
          path: ['metadata', 'studio', 'variables', name],
        });
      } else {
        const dependencies = collectAstDependencies(parsed.ast);
        const lookup = (dependencyName: string) => {
          const dependencyResolution = resolveVariable(dependencyName);
          return coerceDependencyValue(dependencyResolution, dependencyName);
        };
        const evaluated = evaluateAstWithEnv(parsed.ast, lookup);
        if (typeof evaluated === 'object' && 'error' in evaluated) {
          const state: GraphVariableResolutionStatus = evaluated.error.includes('cycle')
            ? 'cycle'
            : evaluated.error.includes('Unknown variable')
              ? 'unknown_variable'
              : 'non_numeric';
          nextResolution = {
            binding: variable.binding,
            dependencies,
            state,
            reason: evaluated.error,
          };
          diagnostics.push({
            kind: state === 'unknown_variable' ? 'unknown_variable' : 'non_numeric',
            message: evaluated.error,
            path: ['metadata', 'studio', 'variables', name],
          });
        } else {
          nextResolution = {
            binding: variable.binding,
            dependencies,
            state: 'resolved',
            value: evaluated,
          };
        }
      }
    }

    resolving.delete(name);
    variablesByName[name] = nextResolution;
    return nextResolution;
  };

  for (const variable of variables) {
    resolveVariable(variable.name);
  }

  const parametersByNodeId: Record<string, Record<string, ResolvedExpressionBinding>> = {};
  for (const node of document.graph.nodes) {
    const nextParameters: Record<string, ResolvedExpressionBinding> = {};
    for (const [parameterName, parameterValue] of Object.entries(node.parameters)) {
      if (!isGraphParameterBinding(parameterValue)) {
        continue;
      }

      if (parameterValue.kind === 'literal') {
        nextParameters[parameterName] = toLiteralResolution(parameterValue);
        continue;
      }

      const parsed = parseExpression(parameterValue.expr);
      if (!parsed.ok) {
        nextParameters[parameterName] = toExpressionParseFailure(parameterValue, parsed.reason);
        diagnostics.push({
          kind: 'parse_error',
          message: parsed.reason,
          path: ['graph', 'nodes', node.id, 'parameters', parameterName],
        });
        continue;
      }

      const dependencies = collectAstDependencies(parsed.ast);
      const evaluated = evaluateAstWithEnv(parsed.ast, (name) => {
        const variableResolution = variablesByName[name] ?? resolveVariable(name);
        return coerceDependencyValue(variableResolution, name);
      });

      if (typeof evaluated === 'object' && 'error' in evaluated) {
        const state: GraphVariableResolutionStatus = evaluated.error.includes('cycle')
          ? 'cycle'
          : evaluated.error.includes('Unknown variable')
            ? 'unknown_variable'
            : 'non_numeric';
        nextParameters[parameterName] = {
          binding: parameterValue,
          dependencies,
          state,
          reason: evaluated.error,
        };
        diagnostics.push({
          kind: state === 'unknown_variable' ? 'unknown_variable' : 'non_numeric',
          message: evaluated.error,
          path: ['graph', 'nodes', node.id, 'parameters', parameterName],
        });
        continue;
      }

      nextParameters[parameterName] = {
        binding: parameterValue,
        dependencies,
        state: 'resolved',
        value: evaluated,
      };
    }

    if (Object.keys(nextParameters).length > 0) {
      parametersByNodeId[node.id] = nextParameters;
    }
  }

  return {
    variablesByName,
    parametersByNodeId,
    diagnostics,
  };
}
