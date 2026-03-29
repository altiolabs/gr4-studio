import { z } from 'zod';

export const blockPortSchema = z
  .object({
    name: z.string(),
    type: z.string().optional(),
  })
  .passthrough();

export const blockParameterSchema = z
  .object({
    name: z.string(),
    type: z.string().optional(),
    required: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    summary: z.string().optional(),
  })
  .passthrough();

export const blockSummaryDtoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string().optional(),
    summary: z.string().optional(),
    inputs: z.array(blockPortSchema).optional(),
    outputs: z.array(blockPortSchema).optional(),
    parameters: z.array(blockParameterSchema).optional(),
  })
  .passthrough();

export const blockListResponseDtoSchema = z.union([
  z.array(blockSummaryDtoSchema),
  z.object({ blocks: z.array(blockSummaryDtoSchema) }).passthrough(),
]);

export type BlockPortDto = z.infer<typeof blockPortSchema>;
export type BlockParameterDto = z.infer<typeof blockParameterSchema>;
export type BlockSummaryDto = z.infer<typeof blockSummaryDtoSchema>;
export type BlockListResponseDto = z.infer<typeof blockListResponseDtoSchema>;
