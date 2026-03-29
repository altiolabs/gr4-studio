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

function normalizeItems(response: BlockListResponseDto): BlockSummaryDto[] {
  if (Array.isArray(response)) {
    return response;
  }

  return response.blocks;
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

  const parsed = blockListResponseDtoSchema.safeParse(payload);
  if (!parsed.success) {
    const schemaIssue = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
    throw new ApiClientError('Block response schema mismatch', 'PARSE', undefined, schemaIssue);
  }

  return normalizeItems(parsed.data).map(mapBlock);
}
