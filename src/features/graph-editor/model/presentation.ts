import type { BlockDetails, BlockParameterMeta } from '../../../lib/api/block-details';
import { isAdvancedParameterName, isAdvancedUiHint } from '../../../lib/utils/parameter-groups';
import type { EditorNodeParameterDrafts } from './types';

const MAX_PARAMETER_LINES = 6;
const MAX_LINE_VALUE_LENGTH = 36;

type BlockCardSummary = {
  shortDisplayName: string;
  parameterLines: string[];
  parameterOverflowCount: number;
};

function stripTemplateArgs(name: string): string {
  const templateStart = name.indexOf('<');
  return templateStart >= 0 ? name.slice(0, templateStart) : name;
}

function getTemplateArgs(name: string): string | undefined {
  const start = name.indexOf('<');
  const end = name.lastIndexOf('>');
  if (start < 0 || end <= start) {
    return undefined;
  }

  const args = name.slice(start + 1, end).trim();
  return args || undefined;
}

function stripNamespace(name: string): string {
  const segments = name.split('::');
  return segments[segments.length - 1] || name;
}

function canonicalNameFromType(blockTypeId: string): string {
  return stripNamespace(blockTypeId).trim() || blockTypeId;
}

export function toCanonicalBlockDisplayName(displayName: string, blockTypeId: string): string {
  const trimmed = displayName.trim();
  const fromType = canonicalNameFromType(blockTypeId);

  if (!trimmed) {
    return fromType;
  }

  if (trimmed.toLowerCase() === fromType.toLowerCase()) {
    return fromType;
  }

  return trimmed;
}

export function toShortBlockName(displayName: string, blockTypeId: string): string {
  const canonicalDisplay = toCanonicalBlockDisplayName(displayName, blockTypeId);
  const fromDisplay = stripNamespace(stripTemplateArgs(canonicalDisplay).trim());
  const fromType = stripNamespace(stripTemplateArgs(blockTypeId).trim());

  if (fromDisplay && fromType && fromDisplay.toLowerCase() === fromType.toLowerCase()) {
    return fromType;
  }

  if (fromDisplay) {
    return fromDisplay;
  }

  return fromType || blockTypeId;
}

export function toDisambiguatedShortBlockName(displayName: string, blockTypeId: string): string {
  const base = toShortBlockName(displayName, blockTypeId);
  const templateArgs = getTemplateArgs(displayName) ?? getTemplateArgs(blockTypeId);
  if (!templateArgs) {
    return base;
  }

  return `${base}<${templateArgs}>`;
}

function truncateValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_LINE_VALUE_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_LINE_VALUE_LENGTH - 1)}…`;
}

function getCurrentValue(
  parameterValues: EditorNodeParameterDrafts,
  parameterName: string,
): string | undefined {
  const value = parameterValues[parameterName]?.value;
  return typeof value === 'string' ? value : undefined;
}

function buildParameterLines(
  parameters: EditorNodeParameterDrafts,
  details?: BlockDetails,
): { lines: string[]; overflowCount: number } {
  if (!details) {
    const fallback = Object.entries(parameters)
      .filter(([name]) => !isAdvancedParameterName(name))
      .map(([name, entry]) => `${name}=${truncateValue(entry.value)}`);
    const visible = fallback.slice(0, MAX_PARAMETER_LINES);
    return {
      lines: visible,
      overflowCount: Math.max(0, fallback.length - visible.length),
    };
  }

  const ordered = details.parameters
    .filter(
      (parameter: BlockParameterMeta) =>
        !isAdvancedParameterName(parameter.name) &&
        !isAdvancedUiHint(parameter.uiHint) &&
        !parameter.readOnly &&
        parameter.mutable,
    )
    .map((parameter: BlockParameterMeta) => {
      const currentValue = getCurrentValue(parameters, parameter.name) ?? parameter.defaultValue ?? '';
      return `${parameter.name}=${truncateValue(currentValue)}`;
    });

  const visible = ordered.slice(0, MAX_PARAMETER_LINES);
  return {
    lines: visible,
    overflowCount: Math.max(0, ordered.length - visible.length),
  };
}

export function buildBlockCardSummary(
  node: { displayName: string; blockTypeId: string; parameters: EditorNodeParameterDrafts },
  details?: BlockDetails,
): BlockCardSummary {
  const parameterSummary = buildParameterLines(node.parameters, details);

  return {
    shortDisplayName: toShortBlockName(node.displayName, node.blockTypeId),
    parameterLines: parameterSummary.lines,
    parameterOverflowCount: parameterSummary.overflowCount,
  };
}
