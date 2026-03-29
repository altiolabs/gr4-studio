import { graphDocumentFromEditor } from '../graph-document/model/fromEditor';
import { parseGraphDocument } from '../graph-document/model/schema';
import type { GraphDocument } from '../graph-document/model/types';
import type { EditorSnapshot } from '../graph-tabs/store/graphTabsStore';

export const STUDIO_DOCUMENT_EXTENSION = '.gr4s';
export const STUDIO_UNTITLED_NAME = `Untitled${STUDIO_DOCUMENT_EXTENSION}`;

export type SerializedStudioDocument = {
  document: GraphDocument;
  content: string;
  contentHash: string;
  documentFormat: string;
};

function hashContent(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function canonicalizeGraphDocument(document: GraphDocument): string {
  return JSON.stringify(document, null, 2);
}

export function serializeEditorSnapshot(snapshot: EditorSnapshot): SerializedStudioDocument {
  const document = graphDocumentFromEditor(snapshot);
  const content = canonicalizeGraphDocument(document);

  return {
    document,
    content,
    contentHash: hashContent(content),
    documentFormat: `${document.format}@${document.version}`,
  };
}

export function deserializeDocumentText(content: string): SerializedStudioDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('Failed to parse/open file: invalid JSON content.');
  }

  const document = parseGraphDocument(raw);
  const canonicalContent = canonicalizeGraphDocument(document);

  return {
    document,
    content: canonicalContent,
    contentHash: hashContent(canonicalContent),
    documentFormat: `${document.format}@${document.version}`,
  };
}

export function computeSerializedContentHash(content: string): string {
  return hashContent(content);
}
