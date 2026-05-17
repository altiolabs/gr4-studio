import { z } from 'zod';
import {
  schedulerDtoSchema,
  schedulerListResponseSchema,
  schedulerResponseSchema,
  type SchedulerDto,
  type SchedulerListResponseDto,
} from '../dto/schedulers';
import { ApiClientError, jsonRequest } from './client';

export type SchedulerCatalogItem = {
  id: string;
};

function parseOrThrow<T>(schema: z.ZodSchema<T>, payload: unknown, context: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    throw new ApiClientError(`Schedulers API schema mismatch (${context})`, 'PARSE', undefined, details);
  }
  return parsed.data;
}

function normalizeItems(response: SchedulerListResponseDto): SchedulerDto[] {
  return Array.isArray(response) ? response : response.schedulers;
}

function mapScheduler(dto: SchedulerDto): SchedulerCatalogItem {
  return { id: dto.id };
}

export async function getSchedulers(): Promise<SchedulerCatalogItem[]> {
  const payload = await jsonRequest<unknown>({
    path: '/schedulers',
    method: 'GET',
  });

  return normalizeItems(parseOrThrow(schedulerListResponseSchema, payload, 'list-schedulers')).map(mapScheduler);
}

export async function getScheduler(schedulerId: string): Promise<SchedulerCatalogItem> {
  const payload = await jsonRequest<unknown>({
    path: `/schedulers/${encodeURIComponent(schedulerId)}`,
    method: 'GET',
  });
  const parsed = parseOrThrow(schedulerResponseSchema, payload, 'get-scheduler');
  const scheduler = 'scheduler' in parsed ? parseOrThrow(schedulerDtoSchema, parsed.scheduler, 'get-scheduler.scheduler') : parsed;
  return mapScheduler(scheduler);
}
