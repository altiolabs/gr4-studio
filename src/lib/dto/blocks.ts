import { z } from 'zod';

const jsonLikeValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonLikeValueSchema), z.record(z.string(), jsonLikeValueSchema)]),
);

const optionalStringSchema = z.preprocess((value) => (typeof value === 'string' ? value : undefined), z.string().optional());

export const blockPortSchema = z
  .object({
    name: z.string(),
    type: optionalStringSchema,
  })
  .passthrough();

export const blockParameterSchema = z
  .object({
    name: z.string(),
    type: optionalStringSchema,
    required: z.boolean().optional(),
    default: jsonLikeValueSchema.optional(),
    summary: optionalStringSchema,
  })
  .passthrough();

export const blockSummaryDtoSchema = z
  .object({
    id: z.string(),
    name: optionalStringSchema,
    category: optionalStringSchema,
    summary: optionalStringSchema,
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
