import { z } from 'zod';

export const sessionDtoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    state: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    last_error: z.string().nullable(),
  })
  .passthrough();

export const sessionResponseSchema = z.union([
  sessionDtoSchema,
  z.object({ session: sessionDtoSchema }).passthrough(),
]);

export const sessionListResponseSchema = z.union([
  z.array(sessionDtoSchema),
  z.object({ sessions: z.array(sessionDtoSchema) }).passthrough(),
]);

export const sessionDeleteResponseSchema = z
  .union([
    z.object({ deleted: z.boolean().optional(), success: z.boolean().optional() }).passthrough(),
    z.object({}).passthrough(),
  ])
  .optional();

export type SessionDto = z.infer<typeof sessionDtoSchema>;
