import { describe, expect, it, vi } from 'vitest';
import { buildGr4cDownloadFileName, canDownloadCurrentGraph, downloadCurrentGraphAsGr4c } from './gr4c-download';

describe('gr4c-download helpers', () => {
  it('builds a sanitized .gr4c filename with fallback', () => {
    expect(buildGr4cDownloadFileName('Signal Flow.gr4s')).toBe('Signal Flow.gr4c');
    expect(buildGr4cDownloadFileName('bad/name:graph.gr4s')).toBe('bad_name_graph.gr4c');
    expect(buildGr4cDownloadFileName('')).toBe('graph.gr4c');
    expect(buildGr4cDownloadFileName(undefined)).toBe('graph.gr4c');
  });

  it('treats the current graph as exportable only when a tab is active', () => {
    expect(canDownloadCurrentGraph(null)).toBe(false);
    expect(canDownloadCurrentGraph(undefined)).toBe(false);
    expect(canDownloadCurrentGraph({ title: 'Graph.gr4s' })).toBe(true);
  });

  it('exports the current graph and reports serialization failures', () => {
    const download = vi.fn();
    const win = {} as Window;

    const success = downloadCurrentGraphAsGr4c({
      activeGraphName: 'Demo.gr4s',
      buildSubmission: () => ({ graphName: 'Demo', content: 'grc text', contentHash: 'hash' }),
      download,
      win,
    });

    expect(success).toEqual({ kind: 'success', fileName: 'Demo.gr4c' });
    expect(download).toHaveBeenCalledWith(win, 'Demo.gr4c', 'grc text');

    const fallback = downloadCurrentGraphAsGr4c({
      activeGraphName: undefined,
      buildSubmission: () => ({ graphName: 'Fallback', content: 'fallback grc', contentHash: 'hash-2' }),
      download,
      win,
    });

    expect(fallback).toEqual({ kind: 'success', fileName: 'graph.gr4c' });
    expect(download).toHaveBeenCalledWith(win, 'graph.gr4c', 'fallback grc');

    const failure = downloadCurrentGraphAsGr4c({
      activeGraphName: 'Demo.gr4s',
      buildSubmission: () => {
        throw new Error('boom');
      },
      download,
      win,
    });

    expect(failure).toEqual({
      kind: 'error',
      message: "Couldn't export .gr4c from the current graph.",
    });
  });
});
