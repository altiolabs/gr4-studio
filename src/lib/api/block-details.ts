import { ApiClientError, jsonRequest } from './client';
import {
  blockDetailsDtoSchema,
  blockDetailsResponseSchema,
  type BlockDetailsDto,
  type ParameterMetaDto,
  type PortMetaDto,
} from '../dto/block-details';
import { isReadOnlyRuntimeMutability } from '../utils/parameter-groups';

export type BlockParameterMeta = {
  name: string;
  label: string;
  description?: string;
  defaultValue?: string;
  mutable: boolean;
  readOnly: boolean;
  valueType?: string;
  valueKind: 'scalar' | 'enum';
  enumOptions?: string[];
  enumLabels?: Record<string, string>;
  enumSource?: string;
  uiHint?: string;
  allowCustomValue?: boolean;
};

export type BlockPortMeta = {
  name: string;
  direction: 'input' | 'output' | 'unknown';
  cardinalityKind: 'fixed' | 'dynamic';
  minPortCount?: number;
  maxPortCount?: number;
  domain?: string;
  valueType?: string;
  isOptional?: boolean;
  optional?: boolean;
  description?: string;
};

export type BlockDetails = {
  blockTypeId: string;
  displayName: string;
  description?: string;
  parameters: BlockParameterMeta[];
  inputPorts: BlockPortMeta[];
  outputPorts: BlockPortMeta[];
};

function toText(value: string | number | boolean | null | undefined): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function normalizeParameter(param: ParameterMetaDto): BlockParameterMeta {
  const readOnly = isReadOnlyRuntimeMutability(param.runtime_mutability);

  return {
    name: param.name,
    label: param.name,
    description: param.summary,
    defaultValue: toText(param.default),
    mutable: !readOnly,
    readOnly,
    valueType: param.type,
    valueKind: param.value_kind === 'enum' ? 'enum' : 'scalar',
    enumOptions: param.enum_options,
    enumLabels: param.enum_labels,
    enumSource: param.enum_source,
    uiHint: param.ui_hint,
    allowCustomValue: param.allow_custom_value,
  };
}

function normalizePort(port: PortMetaDto, direction: 'input' | 'output'): BlockPortMeta {
  const normalizedDirection =
    port.direction === 'input' || port.direction === 'output' ? port.direction : direction;
  const normalizedCardinality = port.cardinality_kind === 'dynamic' ? 'dynamic' : 'fixed';

  return {
    name: port.name,
    direction: normalizedDirection,
    cardinalityKind: normalizedCardinality,
    minPortCount: port.min_port_count,
    maxPortCount: port.max_port_count,
    valueType: port.type,
    isOptional: port.is_optional,
    optional: port.is_optional,
    description: port.description,
  };
}

function mapBlockDetailsDto(dto: BlockDetailsDto): BlockDetails {
  return {
    blockTypeId: dto.id,
    displayName: dto.name || dto.id,
    description: dto.summary ?? dto.description,
    parameters: (dto.parameters ?? []).map((param) => normalizeParameter(param)),
    inputPorts: (dto.inputs ?? []).map((port) => normalizePort(port, 'input')),
    outputPorts: (dto.outputs ?? []).map((port) => normalizePort(port, 'output')),
  };
}

export async function getBlockDetails(blockTypeId: string): Promise<BlockDetails> {
  const payload = await jsonRequest<unknown>({
    path: `/blocks/${encodeURIComponent(blockTypeId)}`,
    method: 'GET',
  });

  const parsed = blockDetailsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    const schemaIssue = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');

    throw new ApiClientError('Block detail response schema mismatch', 'PARSE', undefined, schemaIssue);
  }

  let body: BlockDetailsDto;
  if ('block' in parsed.data) {
    const nestedBlock = blockDetailsDtoSchema.safeParse(parsed.data.block);
    if (!nestedBlock.success) {
      const nestedIssue = nestedBlock.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ');

      throw new ApiClientError('Block detail nested payload schema mismatch', 'PARSE', undefined, nestedIssue);
    }

    body = nestedBlock.data;
  } else {
    body = parsed.data;
  }

  return mapBlockDetailsDto(body);
}
