import { z } from 'zod';

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const blockPortDtoSchema = z
  .object({
    name: z.string(),
    type: z.string().optional(),
    description: z.string().optional(),
    direction: z.string().optional(),
    cardinality_kind: z.string().optional(),
    current_port_count: z.number().optional(),
    render_port_count: z.number().optional(),
    min_port_count: z.number().optional(),
    max_port_count: z.number().optional(),
    size_parameter: z.string().optional(),
    handle_name_template: z.string().optional(),
    is_optional: z.boolean().optional(),
  })
  .passthrough();

export const blockParameterDtoSchema = z
  .object({
    name: z.string(),
    type: z.string().optional(),
    required: z.boolean().optional(),
    default: scalarSchema.optional(),
    summary: z.string().optional(),
    runtime_mutability: z.string().optional(),
    value_kind: z.enum(['scalar', 'enum']).optional(),
    enum_options: z.array(z.string()).optional(),
    enum_choices: z.array(z.string()).optional(),
    enum_type: z.string().optional(),
    enum_labels: z.record(z.string(), z.string()).optional(),
    enum_source: z.string().optional(),
    ui_hint: z.string().optional(),
    allow_custom_value: z.boolean().optional(),
  })
  .passthrough();

export const blockDetailsDtoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    inputs: z.array(blockPortDtoSchema).optional(),
    outputs: z.array(blockPortDtoSchema).optional(),
    parameters: z.array(blockParameterDtoSchema).optional(),
  })
  .passthrough();

export const blockDetailsResponseSchema = z.union([
  blockDetailsDtoSchema,
  z.object({ block: blockDetailsDtoSchema }).passthrough(),
]);

export type BlockDetailsDto = z.infer<typeof blockDetailsDtoSchema>;
export type BlockDetailsResponseDto = z.infer<typeof blockDetailsResponseSchema>;
export type ParameterMetaDto = z.infer<typeof blockParameterDtoSchema>;
export type PortMetaDto = z.infer<typeof blockPortDtoSchema>;
