import { z } from 'zod';

export const schedulerDtoSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

export const schedulerListResponseSchema = z.union([
  z.array(schedulerDtoSchema),
  z.object({ schedulers: z.array(schedulerDtoSchema) }).passthrough(),
]);

export const schedulerResponseSchema = z.union([
  schedulerDtoSchema,
  z.object({ scheduler: schedulerDtoSchema }).passthrough(),
]);

export type SchedulerDto = z.infer<typeof schedulerDtoSchema>;
export type SchedulerListResponseDto = z.infer<typeof schedulerListResponseSchema>;
