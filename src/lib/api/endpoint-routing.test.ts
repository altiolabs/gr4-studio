import { describe, expect, it } from 'vitest';
import { classifyRuntimeEndpointRouting } from './endpoint-routing';

describe('classifyRuntimeEndpointRouting', () => {
  it('treats relative current-session routes as app-owned api traffic', () => {
    expect(classifyRuntimeEndpointRouting('/sessions/sess_1/streams/stream_1/http')).toBe('app-api');
    expect(classifyRuntimeEndpointRouting('/api/sessions/sess_1/streams/stream_1/ws')).toBe('app-api');
  });

  it('treats authored absolute endpoints as legacy direct traffic', () => {
    expect(classifyRuntimeEndpointRouting('http://127.0.0.1:8080/snapshot')).toBe('legacy-direct');
    expect(classifyRuntimeEndpointRouting('ws://127.0.0.1:18080/live')).toBe('legacy-direct');
    expect(classifyRuntimeEndpointRouting('backend.example.test/live')).toBe('legacy-direct');
  });
});
