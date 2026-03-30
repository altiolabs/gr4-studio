import type {
  RenderedPort,
  ResolveRenderedPortsInput,
  ResolveRenderedPortsResult,
  SchemaPort,
} from './types';

export const DEFAULT_DYNAMIC_PORT_UI_CAP = 16;

function normalizeParamMap(values: Record<string, string>): Record<string, string> {
  return Object.entries(values).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key.toLowerCase()] = value;
    return acc;
  }, {});
}

function toSingular(name: string): string {
  if (name.endsWith('ies') && name.length > 3) {
    return `${name.slice(0, -3)}y`;
  }

  if (name.endsWith('s') && name.length > 1) {
    return name.slice(0, -1);
  }

  return name;
}

function toPlural(name: string): string {
  if (name.endsWith('s')) {
    return name;
  }

  if (name.endsWith('y') && name.length > 1) {
    return `${name.slice(0, -1)}ies`;
  }

  return `${name}s`;
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }

  return result;
}

function candidateParameterNames(
  collectionName: string,
  direction: SchemaPort['direction'],
): string[] {
  const base = collectionName.toLowerCase();
  const singular = toSingular(base);
  const plural = toPlural(base);
  const directionAliases =
    direction === 'input'
      ? ['in', 'input', 'inputs']
      : ['out', 'output', 'outputs'];
  const aliasBases = uniqueStrings([base, singular, plural, ...directionAliases]);

  const patterns = aliasBases.flatMap((alias) => [
    `n_${alias}`,
    `num_${alias}`,
    alias,
    `${alias}_count`,
    `count_${alias}`,
  ]);

  return uniqueStrings(patterns);
}

function tryParseNonNegativeInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizePortCount(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.trunc(value);
}

function clampDynamicCount(count: number, schemaPort: SchemaPort): number {
  const min = Math.max(schemaPort.minPortCount ?? 0, 0);
  const maxFromSchema = schemaPort.maxPortCount;

  let upperBound = DEFAULT_DYNAMIC_PORT_UI_CAP;
  // Treat max <= 0 as unknown/unbounded for dynamic collections.
  if (typeof maxFromSchema === 'number' && maxFromSchema > 0) {
    upperBound = Math.min(maxFromSchema, DEFAULT_DYNAMIC_PORT_UI_CAP);
  }

  if (upperBound < min) {
    upperBound = min;
  }

  return Math.max(min, Math.min(count, upperBound));
}

function toReactFlowHandleId(portId: string): string {
  const safeToken = Array.from(portId)
    .map((char) => (/^[A-Za-z0-9_-]$/.test(char) ? char : `_${char.codePointAt(0)?.toString(16)}_`))
    .join('');

  return `handle_${safeToken}`;
}

function renderHandleName(schemaPort: SchemaPort, index: number): string {
  const template = schemaPort.handleNameTemplate;
  if (template) {
    return template.replace(/\$\{index\}/g, String(index));
  }

  return `${schemaPort.name}[${index}]`;
}

function renderHandlePortId(schemaPort: SchemaPort, index: number): string {
  const template = schemaPort.handleNameTemplate;
  if (template) {
    return template.replace(/\$\{index\}/g, String(index));
  }

  return `${schemaPort.name}#${index}`;
}

function exactDynamicCountFromSchema(schemaPort: SchemaPort): number | null {
  const min = schemaPort.minPortCount;
  const max = schemaPort.maxPortCount;

  // Only trust exact dynamic count if it is explicitly positive and bounded.
  if (typeof min === 'number' && typeof max === 'number' && min > 0 && max > 0 && min === max) {
    return clampDynamicCount(min, schemaPort);
  }

  return null;
}

function explicitDynamicCount(
  schemaPort: SchemaPort,
  parameterValues: Record<string, string>,
): number | null {
  const sizeParameter = schemaPort.sizeParameter?.trim();
  if (sizeParameter) {
    const normalized = normalizeParamMap(parameterValues);
    const rawValue = normalized[sizeParameter.toLowerCase()];
    if (rawValue !== undefined) {
      const parsed = tryParseNonNegativeInteger(rawValue);
      if (parsed !== null) {
        return clampDynamicCount(parsed, schemaPort);
      }
    }
  }

  const renderPortCount = normalizePortCount(schemaPort.renderPortCount);
  if (renderPortCount !== null) {
    return clampDynamicCount(renderPortCount, schemaPort);
  }

  return exactDynamicCountFromSchema(schemaPort);
}

function inferredDynamicCount(schemaPort: SchemaPort, parameterValues: Record<string, string>): number | null {
  const normalized = normalizeParamMap(parameterValues);
  const candidates = candidateParameterNames(schemaPort.name, schemaPort.direction);

  for (const candidate of candidates) {
    const rawValue = normalized[candidate];
    if (rawValue === undefined) {
      continue;
    }

    const parsed = tryParseNonNegativeInteger(rawValue);
    if (parsed === null) {
      continue;
    }

    return clampDynamicCount(parsed, schemaPort);
  }

  return null;
}

function fixedRenderedPort(schemaPort: SchemaPort): RenderedPort {
  const portId = schemaPort.name;
  return {
    key: `${schemaPort.direction}:${portId}`,
    direction: schemaPort.direction,
    displayLabel: schemaPort.name,
    portId,
    handleId: toReactFlowHandleId(portId),
    sourceSchemaName: schemaPort.name,
    cardinalityKind: 'fixed',
    inference: 'authoritative',
    connectable: true,
    typeName: schemaPort.typeName,
    isOptional: schemaPort.isOptional,
    description: schemaPort.description,
  };
}

function collapsedDynamicRenderedPort(schemaPort: SchemaPort): RenderedPort {
  return {
    key: `${schemaPort.direction}:${schemaPort.name}:collapsed`,
    direction: schemaPort.direction,
    displayLabel: `${schemaPort.name}[*]`,
    portId: undefined,
    sourceSchemaName: schemaPort.name,
    cardinalityKind: 'dynamic',
    inference: 'collapsed',
    connectable: false,
    typeName: schemaPort.typeName,
    isOptional: schemaPort.isOptional,
    description: schemaPort.description,
  };
}

function expandedDynamicRenderedPorts(
  schemaPort: SchemaPort,
  count: number,
  inference: 'authoritative' | 'inferred',
): RenderedPort[] {
  return Array.from({ length: count }).map((_, index) => ({
    key: `${schemaPort.direction}:${renderHandlePortId(schemaPort, index)}`,
    direction: schemaPort.direction,
    displayLabel: renderHandleName(schemaPort, index),
    portId: renderHandlePortId(schemaPort, index),
    handleId: toReactFlowHandleId(renderHandlePortId(schemaPort, index)),
    sourceSchemaName: schemaPort.name,
    cardinalityKind: 'dynamic',
    inference,
    connectable: true,
    typeName: schemaPort.typeName,
    isOptional: schemaPort.isOptional,
    description: schemaPort.description,
  }));
}

function resolveOne(schemaPort: SchemaPort, parameterValues: Record<string, string>): RenderedPort[] {
  if (schemaPort.cardinalityKind === 'fixed') {
    return [fixedRenderedPort(schemaPort)];
  }

  if (schemaPort.isExplicitDynamicCollection) {
    const explicitCount = explicitDynamicCount(schemaPort, parameterValues);
    if (explicitCount !== null) {
      return expandedDynamicRenderedPorts(schemaPort, explicitCount, 'authoritative');
    }

    return [collapsedDynamicRenderedPort(schemaPort)];
  }

  const exactFromSchema = exactDynamicCountFromSchema(schemaPort);
  if (exactFromSchema !== null) {
    return expandedDynamicRenderedPorts(schemaPort, exactFromSchema, 'authoritative');
  }

  const inferredCount = inferredDynamicCount(schemaPort, parameterValues);
  if (inferredCount !== null) {
    return expandedDynamicRenderedPorts(schemaPort, inferredCount, 'inferred');
  }

  return [collapsedDynamicRenderedPort(schemaPort)];
}

export function resolveRenderedPorts({
  schemaPorts,
  parameterValues,
}: ResolveRenderedPortsInput): ResolveRenderedPortsResult {
  const rendered = schemaPorts.flatMap((schemaPort) => resolveOne(schemaPort, parameterValues));

  return {
    inputs: rendered.filter((port) => port.direction === 'input'),
    outputs: rendered.filter((port) => port.direction === 'output'),
  };
}
