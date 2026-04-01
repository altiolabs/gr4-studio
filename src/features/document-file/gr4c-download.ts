import type { GraphTab } from '../graph-tabs/store/graphTabsStore';
import type { GrcExport } from '../runtime-submission/model/types';

export type DownloadCurrentGraphResult =
  | { kind: 'success'; fileName: string }
  | { kind: 'error'; message: string };

type DownloadTextFile = (win: Window, fileName: string, content: string) => void;

function sanitizeFileNameBase(value: string): string {
  return value
    // Avoid path-like names and control chars that can break picker/download behavior.
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '');
}

export function buildGr4cDownloadFileName(graphName?: string | null): string {
  const trimmed = graphName?.trim();
  if (!trimmed) {
    return 'graph.gr4c';
  }

  const cleaned = sanitizeFileNameBase(trimmed);
  if (!cleaned) {
    return 'graph.gr4c';
  }

  const base = cleaned.replace(/\.[^.]+$/, '');
  return `${base || 'graph'}.gr4c`;
}

export function canDownloadCurrentGraph(activeTab: Pick<GraphTab, 'title'> | null | undefined): boolean {
  return Boolean(activeTab);
}

export function downloadTextFile(win: Window, fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/gr4c' });
  const url = URL.createObjectURL(blob);
  const anchor = win.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  win.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadCurrentGraphAsGr4c(params: {
  activeGraphName?: string | null;
  buildSubmission: () => GrcExport;
  win?: Window;
  download?: DownloadTextFile;
}): DownloadCurrentGraphResult {
  try {
    const submission = params.buildSubmission();
    const fileName = buildGr4cDownloadFileName(params.activeGraphName);
    const download = params.download ?? downloadTextFile;
    download(params.win ?? window, fileName, submission.content);
    return { kind: 'success', fileName };
  } catch {
    return { kind: 'error', message: "Couldn't export .gr4c from the current graph." };
  }
}
