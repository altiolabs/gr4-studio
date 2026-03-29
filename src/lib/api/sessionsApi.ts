import { z } from 'zod';
import {
  sessionDeleteResponseSchema,
  sessionDtoSchema,
  sessionListResponseSchema,
  sessionResponseSchema,
  type SessionDto,
} from '../dto/sessions';
import { ApiClientError, jsonRequest } from './client';

export type SessionStateValue = 'stopped' | 'running' | 'error';

export type SessionRecord = {
  id: string;
  name: string;
  state: SessionStateValue;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

export type CreateSessionInput = {
  name: string;
  grc: string;
};

function parseOrThrow<T>(schema: z.ZodSchema<T>, payload: unknown, context: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    throw new ApiClientError(`Sessions API schema mismatch (${context})`, 'PARSE', undefined, details);
  }
  return parsed.data;
}

function mapSession(dto: SessionDto): SessionRecord {
  const normalizedState: SessionStateValue =
    dto.state === 'running' || dto.state === 'stopped' || dto.state === 'error'
      ? dto.state
      : dto.last_error
        ? 'error'
        : 'stopped';

  return {
    id: dto.id,
    name: dto.name,
    state: normalizedState,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    lastError: dto.last_error ?? null,
  };
}

function unwrapSessionResponse(payload: unknown, context: string): SessionRecord {
  const parsed = parseOrThrow(sessionResponseSchema, payload, context);

  const nested = (parsed as { session?: unknown }).session;
  if (nested !== undefined) {
    return mapSession(parseOrThrow(sessionDtoSchema, nested, `${context}.session`));
  }

  return mapSession(parseOrThrow(sessionDtoSchema, parsed, context));
}

export async function createSession(input: CreateSessionInput): Promise<SessionRecord> {
  const payload = await jsonRequest<unknown>({
    path: '/sessions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return unwrapSessionResponse(payload, 'create-session');
}

export async function listSessions(): Promise<SessionRecord[]> {
  const payload = await jsonRequest<unknown>({
    path: '/sessions',
    method: 'GET',
  });
  const parsed = parseOrThrow(sessionListResponseSchema, payload, 'list-sessions');
  const sessions = Array.isArray(parsed) ? parsed : parsed.sessions;
  return sessions.map(mapSession);
}

export async function getSession(sessionId: string): Promise<SessionRecord> {
  const payload = await jsonRequest<unknown>({
    path: `/sessions/${encodeURIComponent(sessionId)}`,
    method: 'GET',
  });

  return unwrapSessionResponse(payload, 'get-session');
}

export async function startSession(sessionId: string): Promise<SessionRecord> {
  const payload = await jsonRequest<unknown>({
    path: `/sessions/${encodeURIComponent(sessionId)}/start`,
    method: 'POST',
  });

  return unwrapSessionResponse(payload, 'start-session');
}

export async function stopSession(sessionId: string): Promise<SessionRecord> {
  const payload = await jsonRequest<unknown>({
    path: `/sessions/${encodeURIComponent(sessionId)}/stop`,
    method: 'POST',
  });

  return unwrapSessionResponse(payload, 'stop-session');
}

export async function restartSession(sessionId: string): Promise<SessionRecord> {
  const payload = await jsonRequest<unknown>({
    path: `/sessions/${encodeURIComponent(sessionId)}/restart`,
    method: 'POST',
  });

  return unwrapSessionResponse(payload, 'restart-session');
}

export async function deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
  const payload = await jsonRequest<unknown>({
    path: `/sessions/${encodeURIComponent(sessionId)}`,
    method: 'DELETE',
  });

  const parsed = parseOrThrow(sessionDeleteResponseSchema, payload, 'delete-session');
  return {
    deleted: Boolean(parsed?.deleted ?? parsed?.success ?? true),
  };
}
