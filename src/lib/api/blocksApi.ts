import {
  blockListResponseDtoSchema,
  type BlockListResponseDto,
  type BlockParameterDto,
  type BlockPortDto,
  type BlockSummaryDto,
} from '../dto/blocks';
import { ApiClientError, jsonRequest } from './client';

export type BlockCatalogItem = {
  blockTypeId: string;
  displayName: string;
  category?: string;
  description?: string;
  inputs: BlockPortDto[];
  outputs: BlockPortDto[];
  parameters: BlockParameterDto[];
};

type ParsedBlocksPayload =
  | {
      success: true;
      data: BlockListResponseDto;
    }
  | {
      success: false;
      details: string;
    };

function normalizeItems(response: BlockListResponseDto): BlockSummaryDto[] {
  if (Array.isArray(response)) {
    return response;
  }

  return response.blocks;
}

function describePayloadShape(payload: unknown): string {
  if (Array.isArray(payload)) {
    return `payload=array(len=${payload.length})`;
  }

  if (payload === null) {
    return 'payload=null';
  }

  if (payload === undefined) {
    return 'payload=undefined';
  }

  if (typeof payload === 'object') {
    const keys = Object.keys(payload as Record<string, unknown>).slice(0, 10);
    return `payload=object(keys=${keys.join(',') || '(none)'})`;
  }

  if (typeof payload === 'string') {
    return `payload=string(len=${payload.length})`;
  }

  return `payload=${typeof payload}`;
}

function parseBlocksPayload(payload: unknown): ParsedBlocksPayload {
  const parsed = blockListResponseDtoSchema.safeParse(payload);
  if (parsed.success) {
    return {
      success: true,
      data: parsed.data,
    };
  }

  const schemaIssue = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
  return {
    success: false,
    details: `${schemaIssue} (${describePayloadShape(payload)})`,
  };
}

function mapBlock(dto: BlockSummaryDto): BlockCatalogItem {
  if (!dto.id) {
    throw new ApiClientError('Block item missing id', 'PARSE', undefined, JSON.stringify(dto));
  }

  return {
    blockTypeId: dto.id,
    displayName: dto.name || dto.id,
    category: dto.category,
    description: dto.summary,
    inputs: dto.inputs ?? [],
    outputs: dto.outputs ?? [],
    parameters: dto.parameters ?? [],
  };
}

export async function getBlocks(): Promise<BlockCatalogItem[]> {
  const payload = await jsonRequest<unknown>({
    path: '/blocks',
    method: 'GET',
  });

  const parsed = parseBlocksPayload(payload);
  if (!parsed.success) {
    throw new ApiClientError('Block response schema mismatch', 'PARSE', undefined, parsed.details);
  }

  return normalizeItems(parsed.data).map(mapBlock);
}
