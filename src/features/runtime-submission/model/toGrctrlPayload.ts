import type { GraphDocument, GraphDocumentEdge, GraphDocumentNode, GraphParameterValue } from '../../graph-document/model/types';
import type { BlockDetails } from '../../../lib/api/block-details';
import type { GrcExport } from './types';
import { resolveGraphVariables } from '../../variables/model/resolveGraphVariables';
import type { JsonPrimitive } from '../../variables/model/types';
import { createEdgeId } from '../../graph-editor/model/nodeFactory';

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

function renderParameterValue(name: string, rawValue: JsonPrimitive | undefined): string {
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

function buildRuntimeGraph(document: GraphDocument): {
  nodes: GraphDocumentNode[];
  edges: GraphDocumentEdge[];
} {
  const disabledNodeIds = new Set(
    document.graph.nodes.filter((node) => (node.executionMode ?? 'active') === 'disabled').map((node) => node.id),
  );
  const bypassedNodeIds = new Set(
    document.graph.nodes
      .filter((node) => (node.executionMode ?? 'active') === 'bypassed' && !disabledNodeIds.has(node.id))
      .map((node) => node.id),
  );

  const nodes = document.graph.nodes.filter(
    (node) => !disabledNodeIds.has(node.id) && (node.executionMode ?? 'active') !== 'bypassed',
  );
  let edges = document.graph.edges.filter(
    (edge) => !disabledNodeIds.has(edge.source.nodeId) && !disabledNodeIds.has(edge.target.nodeId),
  );

  const existingEdgeIds = new Set(edges.map((edge) => edge.id));
  while (bypassedNodeIds.size > 0) {
    let progressed = false;
    for (const nodeId of Array.from(bypassedNodeIds)) {
      const incoming = edges.filter((edge) => edge.target.nodeId === nodeId);
      const outgoing = edges.filter((edge) => edge.source.nodeId === nodeId);
      if (incoming.length === 0 && outgoing.length === 0) {
        bypassedNodeIds.delete(nodeId);
        progressed = true;
        continue;
      }

      edges = edges.filter((edge) => edge.source.nodeId !== nodeId && edge.target.nodeId !== nodeId);
      incoming.forEach((inputEdge) => {
        outgoing.forEach((outputEdge) => {
          const nextEdgeId = createEdgeId(
            inputEdge.source.nodeId,
            outputEdge.target.nodeId,
            inputEdge.source.portId,
            outputEdge.target.portId,
          );
          if (existingEdgeIds.has(nextEdgeId)) {
            return;
          }

          existingEdgeIds.add(nextEdgeId);
          edges.push({
            id: nextEdgeId,
            source: {
              nodeId: inputEdge.source.nodeId,
              portId: inputEdge.source.portId,
            },
            target: {
              nodeId: outputEdge.target.nodeId,
              portId: outputEdge.target.portId,
            },
          });
        });
      });

      bypassedNodeIds.delete(nodeId);
      progressed = true;
    }

    if (!progressed) {
      break;
    }
  }

  return { nodes, edges };
}

function shouldOmitParameter(name: string, rawValue: JsonPrimitive | undefined): boolean {
  if (name === 'ui_constraints') {
    return false;
  }

  if (rawValue === null || rawValue === undefined) {
    return true;
  }

  if (typeof rawValue === 'string') {
    return rawValue.trim().length === 0;
  }

  return false;
}

function indent(lines: string[], spaces = 2): string[] {
  const prefix = ' '.repeat(spaces);
  return lines.map((line) => `${prefix}${line}`);
}

function serializeGraphDocumentToInlineGrc(
  document: GraphDocument,
  options?: ToGrctrlContentSubmissionOptions,
): string {
  const runtimeGraph = buildRuntimeGraph(document);
  const nodes = [...runtimeGraph.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const edges = [...runtimeGraph.edges].sort((left, right) => left.id.localeCompare(right.id));
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

      const parameterEntries = new Map<string, GraphParameterValue>();
      Object.entries(node.parameters)
        .sort(([left], [right]) => left.localeCompare(right))
        .forEach(([name, parameter]) => {
          parameterEntries.set(name, parameter);
        });

      const blockDetails = blockDetailsByType?.get(node.blockType);
      if (blockDetails) {
        blockDetails.parameters.forEach((parameter) => {
          if (parameter.name === 'name' || parameterEntries.has(parameter.name)) {
            return;
          }
          if (parameter.defaultValue === undefined) {
            return;
          }
          parameterEntries.set(parameter.name, {
            kind: 'literal',
            value: parameter.defaultValue,
          });
        });
      }

      const sortedParameterEntries = [...parameterEntries.entries()].sort(([left], [right]) => left.localeCompare(right));
      if (sortedParameterEntries.length > 0) {
        sortedParameterEntries.forEach(([name, parameter]) => {
          if (name === 'name') {
            return;
          }

          const resolvedParameter = resolved.parametersByNodeId[node.id]?.[name];
          const fallbackValue = parameter.kind === 'literal' ? parameter.value : undefined;
          const parameterValue = resolvedParameter?.state === 'resolved' ? resolvedParameter.value : fallbackValue;
          if (shouldOmitParameter(name, parameterValue)) {
            return;
          }
          lines.push(...indent([`    ${name}: ${renderParameterValue(name, parameterValue)}`]));
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
      lines.push(
        ...indent([
          `- [${sanitizeScalar(edge.source.nodeId)}, ${sanitizeScalar(sourcePort)}, ${sanitizeScalar(edge.target.nodeId)}, ${sanitizeScalar(targetPort)}]`,
        ]),
      );
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
