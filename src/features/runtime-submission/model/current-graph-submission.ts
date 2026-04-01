import { graphDocumentFromEditor } from '../../graph-document/model/fromEditor';
import type { EditorSnapshot } from '../../graph-tabs/store/graphTabsStore';
import type { BlockDetails } from '../../../lib/api/block-details';
import { toGrctrlContentSubmission } from './toGrctrlPayload';
import type { GrcExport } from './types';

export type BuildCurrentGraphSubmissionOptions = {
  blockDetailsByType?: Map<string, BlockDetails>;
};

export function buildCurrentGraphSubmissionFromEditorSnapshot(
  snapshot: EditorSnapshot,
  options?: BuildCurrentGraphSubmissionOptions,
): GrcExport {
  const document = graphDocumentFromEditor(snapshot);
  return toGrctrlContentSubmission(
    document,
    options?.blockDetailsByType ? { blockDetailsByType: options.blockDetailsByType } : undefined,
  );
}
