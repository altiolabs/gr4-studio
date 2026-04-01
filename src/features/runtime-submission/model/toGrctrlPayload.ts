import type { GraphDocument } from '../../graph-document/model/types';
import type { BlockDetails, BlockParameterMeta } from '../../../lib/api/block-details';
import type { GrcExport } from './types';
import { resolveGraphVariables } from '../../variables/model/resolveGraphVariables';
import type { JsonPrimitive } from '../../variables/model/types';

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sanitizeScalar(value: JsonPrimitive): string {
  if (value === null || value === undefined) {
    return '""';
  }

  const raw = typeof value === 'string' ? value : String(value);
  const trimmed = raw.trim();
  if (!trimmed) {
    return '""';
  }

  const unsafeYaml = /[:#\n\r]/.test(trimmed);
  if (unsafeYaml) {
    return JSON.stringify(trimmed);
  }

  return trimmed;
}

function renderParameterValue(name: string, rawValue: JsonPrimitive): string {
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
  if (name === 'ui_constraints') {
    if (!trimmed) {
      return '{}';
    }

    const wrappedInQuotes =
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"));

    if (wrappedInQuotes) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner.startsWith('{') || inner.startsWith('[')) {
        return inner;
      }
    }
  }

  return sanitizeScalar(trimmed);
}

type ToGrctrlContentSubmissionOptions = {
  blockDetailsByType?: ReadonlyMap<string, BlockDetails>;
};

function getBlockParameterMeta(
  blockDetailsByType: ReadonlyMap<string, BlockDetails> | undefined,
  blockType: string,
  parameterName: string,
): BlockParameterMeta | undefined {
  const blockDetails = blockDetailsByType?.get(blockType);
  return blockDetails?.parameters.find((parameter) => parameter.name === parameterName);
}

function shouldOmitParameter(
  blockDetailsByType: ReadonlyMap<string, BlockDetails> | undefined,
  blockType: string,
  name: string,
  rawValue: string,
): boolean {
  if (name === 'ui_constraints') {
    return false;
  }

  const trimmed = rawValue.trim();
  if (trimmed) {
    return false;
  }

  const parameterMeta = getBlockParameterMeta(blockDetailsByType, blockType, name);
  return Boolean(parameterMeta?.isCollectionLike);
}

function indent(lines: string[], spaces = 2): string[] {
  const prefix = ' '.repeat(spaces);
  return lines.map((line) => `${prefix}${line}`);
}

function serializeGraphDocumentToInlineGrc(
  document: GraphDocument,
  options?: ToGrctrlContentSubmissionOptions,
): string {
  const nodes = [...document.graph.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const edges = [...document.graph.edges].sort((left, right) => left.id.localeCompare(right.id));
  const blockDetailsByType = options?.blockDetailsByType;
  const resolved = resolveGraphVariables(document);

  const lines: string[] = [];
  lines.push(`# gr4-studio inline grc`);
  lines.push(`metadata:`);
  lines.push(...indent([`name: ${sanitizeScalar(document.metadata.name)}`]));
  lines.push(...indent([`description: ${sanitizeScalar(document.metadata.description ?? '')}`]));
  lines.push(`blocks:`);

  if (nodes.length === 0) {
    lines.push(...indent(['[]']));
  } else {
    nodes.forEach((node) => {
      lines.push(...indent([`- id: ${sanitizeScalar(node.blockType)}`]));
      lines.push(...indent([`  parameters:`]));
      lines.push(...indent([`    name: ${sanitizeScalar(node.id)}`]));

      const parameterEntries = Object.entries(node.parameters).sort(([left], [right]) => left.localeCompare(right));
      if (parameterEntries.length > 0) {
        parameterEntries.forEach(([name, parameter]) => {
          if (name === 'name') {
            return;
          }
          const resolvedParameter = resolved.parametersByNodeId[node.id]?.[name];
          const fallbackValue = parameter.kind === 'literal' ? parameter.value : '';
          const parameterValue =
            resolvedParameter?.state === 'resolved' ? resolvedParameter.value : fallbackValue;
          if (shouldOmitParameter(blockDetailsByType, node.blockType, name, String(parameterValue ?? ''))) {
            return;
          }
          lines.push(...indent([`    ${name}: ${renderParameterValue(name, parameterValue ?? '')}`]));
        });
      }
    });
  }

  lines.push(`connections:`);
  if (edges.length === 0) {
    lines.push(...indent(['[]']));
  } else {
    edges.forEach((edge) => {
      const sourcePort = edge.source.portId ?? 'out';
      const targetPort = edge.target.portId ?? 'in';
      lines.push(...indent([`- [${sanitizeScalar(edge.source.nodeId)}, ${sanitizeScalar(sourcePort)}, ${sanitizeScalar(edge.target.nodeId)}, ${sanitizeScalar(targetPort)}]`]));
    });
  }

  return `${lines.join('\n')}\n`;
}

export function toGrctrlContentSubmission(
  document: GraphDocument,
  options?: ToGrctrlContentSubmissionOptions,
): GrcExport {
  const content = serializeGraphDocumentToInlineGrc(document, options);

  return {
    graphName: document.metadata.name,
    content,
    contentHash: stableHash(content),
  };
}

export { stableHash };
