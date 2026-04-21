import { graphDocumentFromEditor } from '../../graph-document/model/fromEditor';
import type { GraphDocument } from '../../graph-document/model/types';
import type { EditorSnapshot } from '../../graph-tabs/store/graphTabsStore';
import type { BlockDetails } from '../../../lib/api/block-details';
import { toGrctrlContentSubmission } from './toGrctrlPayload';
import type { GrcExport } from './types';
export type BuildCurrentGraphSubmissionOptions = {
  blockDetailsByType?: ReadonlyMap<string, BlockDetails>;
};

export function buildCurrentSessionGraphSubmission(
  document: GraphDocument,
  options?: BuildCurrentGraphSubmissionOptions,
): GrcExport {
  return toGrctrlContentSubmission(
    document,
    options?.blockDetailsByType ? { blockDetailsByType: options.blockDetailsByType } : undefined,
  );
}

export function buildCurrentGraphSubmissionFromEditorSnapshot(
  snapshot: EditorSnapshot,
  options?: BuildCurrentGraphSubmissionOptions,
): GrcExport {
  const document = graphDocumentFromEditor(snapshot);
  return buildCurrentSessionGraphSubmission(document, options);
}
