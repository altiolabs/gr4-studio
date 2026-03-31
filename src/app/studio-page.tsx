import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { StatusBadge } from '../components/status-badge';
import { StatusPill } from '../components/status-pill';
import { ApplicationView } from '../features/application/application-view';
import {
  createDocumentPersistenceService,
  createUntitledDocumentIdentity,
  type PersistenceResult,
  type SourceKind,
} from '../features/document-file/document-persistence-service';
import { serializeEditorSnapshot, STUDIO_UNTITLED_NAME } from '../features/document-file/document-serialization';
import { useDocumentStore } from '../features/document-file/document-store';
import { registerBeforeUnloadUnsavedChangesGuard } from '../features/document-file/unsaved-changes-guard';
import { handleDocumentShortcutKeydown } from '../features/document-file/document-shortcuts';
import {
  buildCapabilityIndicatorText,
  buildDocumentCapabilityDiagnostics,
  buildOpenSuccessMessage,
  buildOpenTooltip,
  buildSaveAsTooltip,
  buildSaveSuccessMessage,
  buildSaveTooltip,
} from '../features/document-file/document-workflow-messaging';
import { dismissUnsupportedBrowserNotice, shouldShowUnsupportedBrowserNotice } from '../features/document-file/unsupported-browser-notice';
import { buildDefaultStudioPlotPalettes } from '../features/application/plotting/model/plot-style';
import { BlockCatalogPanel } from '../features/block-catalog/block-catalog-panel';
import { useBlockCatalogQuery } from '../features/block-catalog/hooks/use-block-catalog-query';
import { BlockPropertiesModal } from '../features/block-properties/block-properties-modal';
import { resolveControlPanelWidgetBindings } from '../features/control-panels/control-panel-binding-resolution';
import { graphDocumentFromEditor } from '../features/graph-document/model/fromEditor';
import {
  applySplitDropToLayout,
  applySplitSizesToLayout,
  type SplitDropPosition,
  type SplitNodePath,
} from '../features/graph-document/model/studio-layout';
import { GraphEditorPanel } from '../features/graph-editor/graph-editor-panel';
import { GraphTabsBar } from '../features/graph-tabs/components/graph-tabs-bar';
import { useGraphTabsStore, type EditorSnapshot } from '../features/graph-tabs/store/graphTabsStore';
import { buildStudioBindingView } from '../features/graph-editor/runtime/known-block-bindings';
import { useEditorStore } from '../features/graph-editor/store/editorStore';
import { InspectorPanel } from '../features/inspector/inspector-panel';
import { GlobalSessionsDrawer } from '../features/runtime-session/components/global-sessions-drawer';
import { useRuntimeSessionStore } from '../features/runtime-session/store/runtimeSessionStore';
import { toGrctrlContentSubmission } from '../features/runtime-submission/model/toGrctrlPayload';
import { WorkspaceView, type WorkspacePanelViewModel } from '../features/workspace/workspace-view';
import { deriveDefaultStudioPanelsFromNodes } from '../features/workspace/model/panel-derivation';
import { buildEffectiveStudioLayout } from '../features/workspace/model/layout';
import { mergeSavedAndDerivedStudioPanels } from '../features/workspace/model/panel-merge';
import { buildDisambiguatedPanelTitles } from '../features/workspace/model/panel-titles';
import {
  addEmptyControlPanelToPanels,
  renameControlPanelTitle,
  moveControlWidgetInPanel,
  removeControlWidgetFromPanel,
  moveControlWidgetToPanel,
  updateControlWidgetInputKind,
  updateControlWidgetLabel,
} from '../features/control-panels/control-panel-authoring';
import { PlotStyleModal } from '../features/workspace/plot-style-modal';
import type { StudioPlotStyleConfig } from '../features/graph-document/model/studio-workspace';
import { getBlockDetails, type BlockDetails } from '../lib/api/block-details';
import { config } from '../lib/config';

type ConnectionStatus = 'idle' | 'loading' | 'connected' | 'error';
type CenterViewMode = 'graph' | 'workspace' | 'application';
type PendingDestructiveAction = { type: 'close-tab'; tabId: string } | null;

function runButtonTitle(runIntent: 'none' | 'create-session' | 'replace-session-from-edits' | 'start-linked-session'): string {
  if (runIntent === 'create-session') {
    return 'Run: create and start a new session from the current graph';
  }
  if (runIntent === 'replace-session-from-edits') {
    return 'Run: replace the linked session with a new one from the current graph';
  }
  if (runIntent === 'start-linked-session') {
    return 'Run: start the linked session';
  }
  return 'Run / Play';
}

function getConnectionStatus(query: ReturnType<typeof useBlockCatalogQuery>): ConnectionStatus {
  if (query.isError) {
    return 'error';
  }
  if (query.isPending || query.fetchStatus === 'fetching') {
    return 'loading';
  }
  if (query.isSuccess) {
    return 'connected';
  }
  return 'idle';
}

function buildEffectiveParameterValues(
  nodeParameters: Record<string, { value: string }>,
  details?: BlockDetails,
): Record<string, string> {
  if (!details) {
    return Object.entries(nodeParameters).reduce<Record<string, string>>((acc, [name, draft]) => {
      acc[name] = draft.value;
      return acc;
    }, {});
  }

  const fromDefaults = details.parameters.reduce<Record<string, string>>((acc, parameter) => {
    acc[parameter.name] = parameter.defaultValue ?? '';
    return acc;
  }, {});

  Object.entries(nodeParameters).forEach(([name, draft]) => {
    fromDefaults[name] = draft.value;
  });

  return fromDefaults;
}

function buildNewUntitledSnapshot(): EditorSnapshot {
  return {
    metadata: {
      name: STUDIO_UNTITLED_NAME,
      description: undefined,
      studioPanels: [],
      studioLayout: undefined,
      studioPlotPalettes: undefined,
      application: undefined,
    },
    nodes: [],
    edges: [],
  };
}

function isPristineUntitledTab(tab: ReturnType<typeof useGraphTabsStore.getState>['tabs'][number]): boolean {
  return tab.document.isUntitled && !tab.document.isDirty && tab.snapshot.nodes.length === 0 && tab.snapshot.edges.length === 0;
}

export function StudioPage() {
  const persistenceService = useMemo(() => createDocumentPersistenceService(), []);
  const blockCatalogQuery = useBlockCatalogQuery();
  const connectionStatus = getConnectionStatus(blockCatalogQuery);

  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [centerViewByTabId, setCenterViewByTabId] = useState<Record<string, CenterViewMode>>({});
  const [isSessionsDrawerOpen, setIsSessionsDrawerOpen] = useState(false);
  const [plotStyleEditorPanelId, setPlotStyleEditorPanelId] = useState<string | null>(null);
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<PendingDestructiveAction>(null);
  const [showUnsupportedNotice, setShowUnsupportedNotice] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return shouldShowUnsupportedBrowserNotice(useDocumentStore.getState().capabilities, window.localStorage);
  });
  const editorBoundTabIdRef = useRef<string | null>(null);
  const pendingEditorLoadRef = useRef<{ tabId: string; contentHash: string } | null>(null);

  const documentName = useEditorStore((state) => state.documentName);
  const documentDescription = useEditorStore((state) => state.documentDescription);
  const studioPanels = useEditorStore((state) => state.studioPanels);
  const studioLayout = useEditorStore((state) => state.studioLayout);
  const studioPlotPalettes = useEditorStore((state) => state.studioPlotPalettes);
  const application = useEditorStore((state) => state.application);
  const nodes = useEditorStore((state) => state.nodes);
  const edges = useEditorStore((state) => state.edges);
  const replaceGraph = useEditorStore((state) => state.replaceGraph);
  const setStudioLayout = useEditorStore((state) => state.setStudioLayout);
  const setStudioPanels = useEditorStore((state) => state.setStudioPanels);
  const setStudioPlotPalettes = useEditorStore((state) => state.setStudioPlotPalettes);

  const tabs = useGraphTabsStore((state) => state.tabs);
  const activeTabId = useGraphTabsStore((state) => state.activeTabId);
  const initializedTabs = useGraphTabsStore((state) => state.initialized);
  const initializeFromSnapshot = useGraphTabsStore((state) => state.initializeFromSnapshot);
  const createTab = useGraphTabsStore((state) => state.createTab);
  const updateActiveSnapshot = useGraphTabsStore((state) => state.updateActiveSnapshot);
  const updateTabSnapshot = useGraphTabsStore((state) => state.updateTabSnapshot);
  const setTabDocument = useGraphTabsStore((state) => state.setTabDocument);
  const patchTabDocument = useGraphTabsStore((state) => state.patchTabDocument);
  const renameTabDocument = useGraphTabsStore((state) => state.renameTabDocument);
  const setActiveTab = useGraphTabsStore((state) => state.setActiveTab);
  const closeTab = useGraphTabsStore((state) => state.closeTab);

  const ensureTabContext = useRuntimeSessionStore((state) => state.ensureTabContext);
  const removeTabContext = useRuntimeSessionStore((state) => state.removeTabContext);
  const setRuntimeActiveTab = useRuntimeSessionStore((state) => state.setActiveTab);
  const runTab = useRuntimeSessionStore((state) => state.runTab);
  const stopSessionForTab = useRuntimeSessionStore((state) => state.stopSessionForTab);
  const deleteSessionForTab = useRuntimeSessionStore((state) => state.deleteSessionForTab);
  const getTabRuntimeView = useRuntimeSessionStore((state) => state.getTabRuntimeView);
  const runtimeContextsByTabId = useRuntimeSessionStore((state) => state.contextsByTabId);

  const capabilities = useDocumentStore((state) => state.capabilities);
  const isOpening = useDocumentStore((state) => state.isOpening);
  const isSaving = useDocumentStore((state) => state.isSaving);
  const isSaveAsInProgress = useDocumentStore((state) => state.isSaveAsInProgress);
  const documentError = useDocumentStore((state) => state.lastError);
  const documentStatusMessage = useDocumentStore((state) => state.lastStatusMessage);
  const setSaving = useDocumentStore((state) => state.setSaving);
  const setSaveAsInProgress = useDocumentStore((state) => state.setSaveAsInProgress);
  const setOpening = useDocumentStore((state) => state.setOpening);
  const setLastError = useDocumentStore((state) => state.setLastError);
  const setLastStatusMessage = useDocumentStore((state) => state.setLastStatusMessage);

  const activeTab = useMemo(
    () => (activeTabId ? tabs.find((tab) => tab.id === activeTabId) ?? null : null),
    [activeTabId, tabs],
  );

  const currentSnapshot: EditorSnapshot = useMemo(
    () => ({
      metadata: {
        name: documentName,
        description: documentDescription,
        studioPanels,
        studioLayout,
        studioPlotPalettes,
        application,
      },
      nodes,
      edges,
    }),
    [application, documentDescription, documentName, edges, nodes, studioLayout, studioPanels, studioPlotPalettes],
  );
  const serializedSnapshot = useMemo(() => serializeEditorSnapshot(currentSnapshot), [currentSnapshot]);
  const activeTabSerializedSnapshot = useMemo(
    () => (activeTab ? serializeEditorSnapshot(activeTab.snapshot) : null),
    [activeTab],
  );
  const replaceEditorFromTabSnapshot = useCallback(
    (tabId: string, snapshot: EditorSnapshot) => {
      pendingEditorLoadRef.current = {
        tabId,
        contentHash: serializeEditorSnapshot(snapshot).contentHash,
      };
      editorBoundTabIdRef.current = tabId;
      replaceGraph(snapshot);
      setEditingBlockId(null);
    },
    [replaceGraph],
  );
  const sessionByTabId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(runtimeContextsByTabId)
          .filter(([, context]) => Boolean(context.sessionId))
          .map(([tabId, context]) => [
            tabId,
            {
              sessionId: context.sessionId as string,
              status: context.session?.state,
            },
          ]),
      ),
    [runtimeContextsByTabId],
  );

  const derivedWorkspacePanels = useMemo(
    () =>
      deriveDefaultStudioPanelsFromNodes(
        nodes.map((node) => ({
          instanceId: node.instanceId,
          blockTypeId: node.blockTypeId,
          displayName: node.displayName,
        })),
      ),
    [nodes],
  );
  const uniqueBlockTypes = useMemo(
    () => Array.from(new Set(nodes.map((node) => node.blockTypeId))),
    [nodes],
  );
  const blockDetailQueries = useQueries({
    queries: uniqueBlockTypes.map((blockTypeId) => ({
      queryKey: ['block-details', blockTypeId],
      queryFn: () => getBlockDetails(blockTypeId),
      staleTime: 60_000,
    })),
  });
  const blockDetailsByType = useMemo(() => {
    const map = new Map<string, BlockDetails>();
    uniqueBlockTypes.forEach((blockTypeId, index) => {
      const query = blockDetailQueries[index];
      if (query?.data) {
        map.set(blockTypeId, query.data);
      }
    });
    return map;
  }, [blockDetailQueries, uniqueBlockTypes]);
  const currentSubmissionContent = useMemo(
    () => toGrctrlContentSubmission(serializedSnapshot.document, { blockDetailsByType }).content,
    [blockDetailsByType, serializedSnapshot.document],
  );
  const mergedWorkspacePanels = useMemo(
    () =>
      mergeSavedAndDerivedStudioPanels({
        savedPanels: studioPanels,
        derivedPanels: derivedWorkspacePanels,
      }),
    [derivedWorkspacePanels, studioPanels],
  );
  const effectiveStudioPlotPalettes = useMemo(
    () => (studioPlotPalettes && studioPlotPalettes.length > 0 ? studioPlotPalettes : buildDefaultStudioPlotPalettes()),
    [studioPlotPalettes],
  );
  const activeCenterView: CenterViewMode = activeTabId ? centerViewByTabId[activeTabId] ?? 'graph' : 'graph';
  const runtimeView = activeTabId ? getTabRuntimeView(activeTabId, currentSubmissionContent) : null;
  const activeRuntimeContext = activeTabId ? runtimeContextsByTabId[activeTabId] : null;
  const controlWidgetRuntime =
    activeRuntimeContext && runtimeView
      ? {
          sessionId: activeRuntimeContext.sessionId,
          executionState: runtimeView.executionState,
          graphDriftState: runtimeView.graphDriftState,
        }
      : null;
  const workspacePanelEntries = useMemo<WorkspacePanelViewModel[]>(() => {
    const nodeById = new Map(nodes.map((node) => [node.instanceId, node]));
    const nodePanelTitlesById = buildDisambiguatedPanelTitles(
      nodes.map((node) => ({
        instanceId: node.instanceId,
        blockTypeId: node.blockTypeId,
        displayName: node.displayName,
      })),
    );

    return mergedWorkspacePanels.map((panel) => {
      if (!panel.nodeId) {
        if (panel.kind === 'control') {
          return {
            panel,
            controlWidgets: resolveControlPanelWidgetBindings({
              panel,
              nodeById,
              blockDetailsByType,
              runtime: controlWidgetRuntime,
            }),
          };
        }
        return { panel };
      }

      const sourceNode = nodeById.get(panel.nodeId);
      if (!sourceNode) {
        if (panel.kind === 'control') {
          return {
            panel,
            controlWidgets: resolveControlPanelWidgetBindings({
              panel,
              nodeById,
              blockDetailsByType,
              runtime: controlWidgetRuntime,
            }),
          };
        }
        return { panel };
      }

      const effectiveParameterValues = buildEffectiveParameterValues(
        sourceNode.parameters,
        blockDetailsByType.get(sourceNode.blockTypeId),
      );
      const bindingView = buildStudioBindingView(sourceNode.blockTypeId, effectiveParameterValues);

      const controlWidgets =
        panel.kind === 'control'
          ? resolveControlPanelWidgetBindings({
              panel,
              nodeById,
              blockDetailsByType,
              runtime: controlWidgetRuntime,
            })
          : undefined;

      return {
        panel,
        studioPlotPalettes: effectiveStudioPlotPalettes,
        nodePanelTitle: nodePanelTitlesById.get(sourceNode.instanceId),
        nodeDisplayName: sourceNode.displayName,
        nodeBlockTypeId: sourceNode.blockTypeId,
        nodeParameters: effectiveParameterValues,
        controlWidgets,
        bindingStatus: bindingView.status,
        bindingTransport: bindingView.transport,
        bindingEndpoint: bindingView.endpoint,
        bindingPollMs: bindingView.pollMs,
      };
    });
  }, [blockDetailsByType, controlWidgetRuntime, effectiveStudioPlotPalettes, mergedWorkspacePanels, nodes]);

  const workspaceLayout = useMemo(
    () => buildEffectiveStudioLayout(studioLayout, mergedWorkspacePanels),
    [mergedWorkspacePanels, studioLayout],
  );

  const activePlotStyleEditorEntry = useMemo(
    () =>
      plotStyleEditorPanelId
        ? workspacePanelEntries.find((entry) => entry.panel.id === plotStyleEditorPanelId) ?? null
        : null,
    [plotStyleEditorPanelId, workspacePanelEntries],
  );

  const saveEnabled = activeTab
    ? (activeTab.document.isDirty || activeTab.document.isUntitled || !activeTab.document.hasWritableBacking)
    : false;
  const busy = isOpening || isSaving || isSaveAsInProgress;
  const anyTabDirty = tabs.some((tab) => tab.document.isDirty);
  const fallbackDocument = useMemo(() => createUntitledDocumentIdentity(capabilities), [capabilities]);
  const activeDocument = activeTab?.document ?? fallbackDocument;

  const capabilityDiagnostics = useMemo(
    () => buildDocumentCapabilityDiagnostics(capabilities, activeDocument),
    [activeDocument, capabilities],
  );
  const capabilityIndicatorText = useMemo(
    () => buildCapabilityIndicatorText(capabilities, activeDocument),
    [activeDocument, capabilities],
  );
  const openTooltip = useMemo(() => buildOpenTooltip(capabilities), [capabilities]);
  const saveTooltip = useMemo(
    () => buildSaveTooltip(capabilities, activeDocument),
    [activeDocument, capabilities],
  );
  const saveAsTooltip = useMemo(() => buildSaveAsTooltip(capabilities), [capabilities]);

  useEffect(() => {
    if (!initializedTabs) {
      initializeFromSnapshot(currentSnapshot);
    }
  }, [currentSnapshot, initializeFromSnapshot, initializedTabs]);

  useEffect(() => {
    tabs.forEach((tab) => {
      ensureTabContext(tab.id);
    });
  }, [ensureTabContext, tabs]);

  useEffect(() => {
    if (activeTabId) {
      setRuntimeActiveTab(activeTabId);
    }
  }, [activeTabId, setRuntimeActiveTab]);

  useEffect(() => {
    if (!activeTabId || !activeTab) {
      return;
    }
    const pendingEditorLoad = pendingEditorLoadRef.current;
    if (pendingEditorLoad?.tabId === activeTabId) {
      if (serializedSnapshot.contentHash === pendingEditorLoad.contentHash) {
        pendingEditorLoadRef.current = null;
      }
      return;
    }
    if (editorBoundTabIdRef.current !== activeTabId) {
      return;
    }

    if (activeTabSerializedSnapshot?.contentHash === serializedSnapshot.contentHash) {
      return;
    }

    const persistedHash = activeTab.document.lastPersistedContentHash;
    const nextDirty = persistedHash ? serializedSnapshot.contentHash !== persistedHash : false;
    updateActiveSnapshot(currentSnapshot, { dirty: nextDirty });
  }, [
    activeTab,
    activeTabId,
    activeTabSerializedSnapshot?.contentHash,
    currentSnapshot,
    serializedSnapshot.contentHash,
    updateActiveSnapshot,
  ]);

  useEffect(() => {
    if (!activeTabId || !activeTab) {
      return;
    }
    if (editorBoundTabIdRef.current === activeTabId) {
      return;
    }

    replaceEditorFromTabSnapshot(activeTabId, activeTab.snapshot);
  }, [
    activeTab,
    activeTabId,
    replaceEditorFromTabSnapshot,
  ]);

  useEffect(() => {
    const titleName = activeTab?.document.displayName ?? STUDIO_UNTITLED_NAME;
    window.document.title = activeTab?.document.isDirty ? `• ${titleName} - gr4-studio` : `${titleName} - gr4-studio`;
  }, [activeTab]);

  useEffect(() => registerBeforeUnloadUnsavedChangesGuard(anyTabDirty), [anyTabDirty]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    console.info('[gr4-studio:file-workflow]', {
      fileSystemAccessSupported: capabilityDiagnostics.fileSystemAccessSupported,
      inPlaceSaveSupported: capabilityDiagnostics.inPlaceSaveSupported,
      savePickerSupported: capabilityDiagnostics.savePickerSupported,
      currentDocumentHasWritableBacking: capabilityDiagnostics.currentDocumentHasWritableBacking,
      activePath: capabilityDiagnostics.fileSystemAccessSupported ? 'file-system-access' : 'upload-download-fallback',
      tabs: tabs.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleDocumentShortcutKeydown(
        event,
        {
          onSave: () => {
            void handleSaveCurrentDocument();
          },
          onSaveAs: () => {
            void handleSaveAsCurrentDocument();
          },
          onOpen: () => {
            void handleOpenCommand();
          },
          onNew: () => {
            void handleNewCommand();
          },
        },
        {
          disabled: busy || Boolean(pendingDestructiveAction),
        },
      );
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  const setActiveCenterView = (view: CenterViewMode) => {
    if (!activeTabId) {
      return;
    }

    setCenterViewByTabId((current) => ({
      ...current,
      [activeTabId]: view,
    }));
  };

  const downgradeTabWritableBacking = (tabId: string, sourceKind: SourceKind = 'imported_file') => {
    patchTabDocument(tabId, (current) => ({
      ...current,
      sourceKind,
      fileHandle: null,
      hasWritableBacking: false,
    }));
  };

  const withUpdatedSnapshotName = (snapshot: EditorSnapshot, name: string): EditorSnapshot => ({
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      name,
    },
  });

  const saveTab = async (tabId: string, mode: 'save' | 'saveAs'): Promise<PersistenceResult> => {
    const tab = useGraphTabsStore.getState().tabs.find((entry) => entry.id === tabId);
    if (!tab) {
      return {
        kind: 'unsupported',
        message: 'No active tab to save.',
      };
    }

    if (mode === 'save') {
      setSaving(true);
    } else {
      setSaveAsInProgress(true);
    }
    setLastError(null);
    setLastStatusMessage(null);

    try {
      const result = mode === 'save'
        ? await persistenceService.saveCurrentDocument(tab.document, tab.snapshot, capabilities)
        : await persistenceService.saveCurrentDocumentAs(tab.document, tab.snapshot, capabilities);

      if (result.kind === 'success') {
        const nextSnapshot = withUpdatedSnapshotName(tab.snapshot, result.value.documentIdentity.displayName);
        setTabDocument(tabId, result.value.documentIdentity);
        updateTabSnapshot(tabId, nextSnapshot, { dirty: false });
        if (activeTabId === tabId) {
          replaceGraph(nextSnapshot);
        }
        setLastStatusMessage(buildSaveSuccessMessage(result.value.documentIdentity));
      } else if (result.kind !== 'canceled') {
        if (result.reason === 'permission_revoked') {
          downgradeTabWritableBacking(tabId, tab.document.sourceKind === 'file_handle' ? 'imported_file' : tab.document.sourceKind);
        }
        setLastError(result.message);
      }

      return result;
    } finally {
      if (mode === 'save') {
        setSaving(false);
      } else {
        setSaveAsInProgress(false);
      }
    }
  };

  const handleSaveCurrentDocument = async (): Promise<PersistenceResult> => {
    if (!activeTabId) {
      return {
        kind: 'unsupported',
        message: 'No active tab to save.',
      };
    }
    return saveTab(activeTabId, 'save');
  };

  const handleSaveAsCurrentDocument = async (): Promise<PersistenceResult> => {
    if (!activeTabId) {
      return {
        kind: 'unsupported',
        message: 'No active tab to save.',
      };
    }
    return saveTab(activeTabId, 'saveAs');
  };

  const handleRenameCurrentDocument = () => {
    if (!activeTabId || !activeTab) {
      return;
    }

    const nextName = window.prompt('Rename document', activeTab.document.displayName);
    if (nextName === null) {
      return;
    }
    const trimmed = nextName.trim();
    if (!trimmed) {
      return;
    }

    renameTabDocument(activeTabId, trimmed);
    const nextSnapshot = withUpdatedSnapshotName(currentSnapshot, trimmed);
    updateActiveSnapshot(nextSnapshot, { dirty: activeTab.document.isDirty });
    replaceEditorFromTabSnapshot(activeTabId, nextSnapshot);
  };

  const handleCreateTab = () => {
    const snapshot = buildNewUntitledSnapshot();
    const serialized = serializeEditorSnapshot(snapshot);
    const tab = createTab({
      snapshot,
      document: {
        ...createUntitledDocumentIdentity(capabilities),
        documentFormat: serialized.documentFormat,
        lastPersistedContentHash: serialized.contentHash,
      },
    });

    ensureTabContext(tab.id);
    setRuntimeActiveTab(tab.id);
    replaceEditorFromTabSnapshot(tab.id, tab.snapshot);
    setLastStatusMessage(`New tab: ${tab.document.displayName}`);
  };

  const handleNewCommand = () => {
    handleCreateTab();
  };

  const handleOpenCommand = async () => {
    setOpening(true);
    setLastError(null);
    setLastStatusMessage(null);

    try {
      const result = await persistenceService.openDocument(capabilities);
      if (result.kind !== 'success') {
        if (result.kind !== 'canceled') {
          setLastError(result.message);
        }
        return;
      }

      const previousActiveTabId = activeTabId;
      const shouldClosePreviousPristineUntitled =
        previousActiveTabId !== null && activeTab !== null && isPristineUntitledTab(activeTab);

      const newTab = createTab({
        snapshot: result.value.replacement,
        document: result.value.documentIdentity,
      });
      ensureTabContext(newTab.id);
      setRuntimeActiveTab(newTab.id);
      replaceEditorFromTabSnapshot(newTab.id, newTab.snapshot);

      if (shouldClosePreviousPristineUntitled && previousActiveTabId) {
        closeTab(previousActiveTabId);
        removeTabContext(previousActiveTabId);
      }
      setLastStatusMessage(buildOpenSuccessMessage(result.value.documentIdentity));
    } finally {
      setOpening(false);
    }
  };

  const performCloseTab = (tabId: string) => {
    const result = closeTab(tabId);
    removeTabContext(tabId);

    if (result.nextActiveTabId) {
      const nextTab = useGraphTabsStore.getState().tabs.find((tab) => tab.id === result.nextActiveTabId);
      if (nextTab) {
        setRuntimeActiveTab(nextTab.id);
        replaceEditorFromTabSnapshot(nextTab.id, nextTab.snapshot);
      }
    }

    if (!result.nextActiveTabId && editorBoundTabIdRef.current === tabId) {
      editorBoundTabIdRef.current = null;
      setEditingBlockId(null);
    }
  };

  const handleCloseTab = (tabId: string) => {
    const tab = tabs.find((entry) => entry.id === tabId);
    if (!tab) {
      return;
    }

    if (tab.document.isDirty) {
      setPendingDestructiveAction({ type: 'close-tab', tabId });
      return;
    }

    performCloseTab(tabId);
  };

  const onUnsavedDialogSave = async () => {
    if (!pendingDestructiveAction) {
      return;
    }

    const saveResult = await saveTab(pendingDestructiveAction.tabId, 'save');
    if (saveResult.kind !== 'success') {
      setPendingDestructiveAction(null);
      return;
    }

    const targetTabId = pendingDestructiveAction.tabId;
    setPendingDestructiveAction(null);
    performCloseTab(targetTabId);
  };

  const runActiveTab = () => {
    if (!activeTabId) {
      return;
    }

    const document = graphDocumentFromEditor(currentSnapshot);
    void runTab(activeTabId, document, { blockDetailsByType });
  };

  const applyLayoutEditorSplitDrop = (
    draggedPanelId: string,
    targetPanelId: string,
    position: SplitDropPosition,
  ) => {
    const nextLayout = applySplitDropToLayout(
      workspaceLayout,
      draggedPanelId,
      targetPanelId,
      position,
      mergedWorkspacePanels.map((panel) => panel.id),
    );
    setStudioLayout(nextLayout);
  };

  const applyLayoutEditorSplitSizes = (splitPath: SplitNodePath, sizes: number[]) => {
    const nextLayout = applySplitSizesToLayout(
      workspaceLayout,
      splitPath,
      sizes,
      mergedWorkspacePanels.map((panel) => panel.id),
    );
    setStudioLayout(nextLayout);
  };

  const createEmptyControlPanel = () => {
    const result = addEmptyControlPanelToPanels(mergedWorkspacePanels);
    setStudioPanels(result.panels);
    setStudioLayout({
      ...buildEffectiveStudioLayout(studioLayout, result.panels),
      activePanelId: result.panelId,
    });
  };

  const renameControlPanel = (panelId: string, title: string) => {
    setStudioPanels(renameControlPanelTitle(mergedWorkspacePanels, panelId, title));
  };

  const updateControlWidgetLabelInWorkspace = (panelId: string, widgetId: string, label: string) => {
    setStudioPanels(updateControlWidgetLabel(mergedWorkspacePanels, panelId, widgetId, label));
  };

  const updateControlWidgetInputKindInWorkspace = (
    panelId: string,
    widgetId: string,
    inputKind: 'text' | 'number' | 'slider' | 'boolean' | 'enum',
  ) => {
    setStudioPanels(updateControlWidgetInputKind(mergedWorkspacePanels, panelId, widgetId, inputKind));
  };

  const moveControlWidgetInWorkspace = (panelId: string, widgetId: string, direction: 'up' | 'down') => {
    setStudioPanels(moveControlWidgetInPanel(mergedWorkspacePanels, panelId, widgetId, direction));
  };

  const removeControlWidgetInWorkspace = (panelId: string, widgetId: string) => {
    setStudioPanels(removeControlWidgetFromPanel(mergedWorkspacePanels, panelId, widgetId));
  };

  const moveControlWidgetToPanelInWorkspace = (panelId: string, widgetId: string, targetPanelId: string) => {
    setStudioPanels(
      moveControlWidgetToPanel(mergedWorkspacePanels, {
        sourcePanelId: panelId,
        targetPanelId,
        widgetId,
      }),
    );
  };

  const updatePanelPlotStyle = (panelId: string, plotStyle: StudioPlotStyleConfig | undefined) => {
    const nextPanels = mergedWorkspacePanels.map((panel) => {
      if (panel.id !== panelId) {
        return panel;
      }
      return {
        ...panel,
        plotStyle,
      };
    });
    setStudioPanels(nextPanels);
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-900 text-slate-100 flex flex-col">
      <header className="h-14 shrink-0 border-b border-border bg-panelAlt px-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-wide">gr4-studio</h1>
          <p className="text-xs text-slate-400 truncate">
            {activeTab?.document.displayName ?? STUDIO_UNTITLED_NAME}
            {activeTab?.document.isDirty ? ' •' : ''} · Backend: {config.controlPlaneBaseUrl}
          </p>
          <p className="text-[11px] text-slate-500 truncate">{capabilityIndicatorText}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <details className="relative">
            <summary className="cursor-pointer list-none rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">
              File
            </summary>
            <div className="absolute right-0 z-40 mt-1 w-52 rounded border border-slate-700 bg-slate-900 p-1 shadow-lg">
              <button
                type="button"
                onClick={handleCreateTab}
                disabled={busy}
                className="w-full rounded px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                New
              </button>
              <button
                type="button"
                onClick={() => void handleOpenCommand()}
                disabled={busy}
                title={openTooltip}
                className="w-full rounded px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Open...
              </button>
              <button
                type="button"
                onClick={() => void handleSaveCurrentDocument()}
                disabled={busy || !saveEnabled}
                title={saveTooltip}
                className="w-full rounded px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAsCurrentDocument()}
                disabled={busy || !activeTabId}
                title={saveAsTooltip}
                className="w-full rounded px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Save As...
              </button>
              <button
                type="button"
                onClick={handleRenameCurrentDocument}
                disabled={busy || !activeTabId}
                className="w-full rounded px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Rename...
              </button>
              <p className="mt-1 border-t border-slate-700 px-2 pt-1 text-[10px] text-slate-400">
                {capabilityIndicatorText}
              </p>
            </div>
          </details>

          <button
            type="button"
            onClick={() => void handleOpenCommand()}
            disabled={busy}
            title={openTooltip}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Open...
          </button>
          <button
            type="button"
            onClick={() => void handleSaveCurrentDocument()}
            disabled={busy || !saveEnabled}
            title={saveTooltip}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAsCurrentDocument()}
            disabled={busy || !activeTabId}
            title={saveAsTooltip}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Save As...
          </button>
          <button
            type="button"
            onClick={() => setIsSessionsDrawerOpen(true)}
            className="rounded border border-indigo-700/70 bg-indigo-900/30 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-800/40"
          >
            Sessions
          </button>
          <span className="text-xs text-slate-400">Catalog API</span>
          <StatusBadge status={connectionStatus} />
        </div>
      </header>

      <GraphTabsBar
        tabs={tabs}
        activeTabId={activeTabId}
        sessionByTabId={sessionByTabId}
        onSelectTab={setActiveTab}
        onCreateTab={handleCreateTab}
        onCloseTab={handleCloseTab}
        onOpenSessions={() => setIsSessionsDrawerOpen(true)}
      />

      {documentError && (
        <div className="shrink-0 border-b border-rose-900 bg-rose-950/30 px-4 py-2 text-sm text-rose-200">
          {documentError}
        </div>
      )}
      {!documentError && documentStatusMessage && (
        <div className="shrink-0 border-b border-emerald-900 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200">
          {documentStatusMessage}
        </div>
      )}
      {showUnsupportedNotice && !capabilities.canUseFileSystemAccessApi && (
        <div className="shrink-0 border-b border-amber-900 bg-amber-950/30 px-4 py-2 text-xs text-amber-200 flex items-center justify-between gap-2">
          <span>
            This browser does not support direct file save/open. gr4-studio will use upload/download fallback. For desktop-style file save behavior, use a Chromium-based browser.
          </span>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                dismissUnsupportedBrowserNotice(window.localStorage);
              }
              setShowUnsupportedNotice(false);
            }}
            className="rounded border border-amber-700/70 bg-amber-900/35 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-800/45"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-hidden grid grid-cols-[18rem_1fr_20rem]">
        <aside className="min-h-0 overflow-hidden border-r border-border bg-panel">
          <BlockCatalogPanel />
        </aside>

        <section className="relative min-h-0 overflow-hidden bg-slate-950 flex flex-col">
          <div className="h-10 shrink-0 border-b border-border bg-slate-950/80 px-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveCenterView('graph')}
              className={`rounded border px-2 py-1 text-xs ${
                activeCenterView === 'graph'
                  ? 'border-emerald-600/70 bg-emerald-900/30 text-emerald-100'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Graph
            </button>
            <button
              type="button"
              onClick={() => setActiveCenterView('workspace')}
              className={`rounded border px-2 py-1 text-xs ${
                activeCenterView === 'workspace'
                  ? 'border-emerald-600/70 bg-emerald-900/30 text-emerald-100'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Layout Editor
            </button>
            <button
              type="button"
              onClick={() => setActiveCenterView('application')}
              className={`rounded border px-2 py-1 text-xs ${
                activeCenterView === 'application'
                  ? 'border-emerald-600/70 bg-emerald-900/30 text-emerald-100'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Application
            </button>
            <div className="ml-auto flex items-center gap-2">
              {runtimeView && activeTabId && (
                <div className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900/70 px-2 py-1">
                  <StatusPill status={runtimeView.executionState} />
                  <button
                    type="button"
                    onClick={runActiveTab}
                    disabled={Boolean(activeRuntimeContext?.busy) || runtimeView.executionState === 'running'}
                    title={runButtonTitle(runtimeView.runIntent)}
                    className="h-6 w-6 rounded border border-emerald-700/70 bg-emerald-900/35 text-emerald-200 hover:bg-emerald-800/45 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 16 16" className="mx-auto h-3.5 w-3.5 fill-current" aria-hidden="true">
                      <path d="M4 2.5v11l8-5.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => void stopSessionForTab(activeTabId)}
                    disabled={Boolean(activeRuntimeContext?.busy) || !activeRuntimeContext?.sessionId || runtimeView.executionState !== 'running'}
                    title="Stop"
                    className="h-6 w-6 rounded border border-amber-700/70 bg-amber-900/35 text-amber-200 hover:bg-amber-800/45 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 16 16" className="mx-auto h-3.5 w-3.5 fill-current" aria-hidden="true">
                      <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSessionForTab(activeTabId)}
                    disabled={Boolean(activeRuntimeContext?.busy) || !activeRuntimeContext?.sessionId}
                    title="Delete session"
                    className="h-6 w-6 rounded border border-rose-700/70 bg-rose-900/35 text-rose-200 hover:bg-rose-800/45 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 16 16" className="mx-auto h-3.5 w-3.5 fill-current" aria-hidden="true">
                      <path d="M6 2.5h4l.6 1.5H13v1H3v-1h2.4zM4.5 6h7l-.6 7.3a1 1 0 0 1-1 .9H6.1a1 1 0 0 1-1-.9z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {activeCenterView === 'graph' ? (
              <GraphEditorPanel
                key={`${activeTabId ?? 'no-active-tab'}:${activeTab?.document.internalDocumentId ?? 'no-document'}`}
                onOpenBlockProperties={setEditingBlockId}
                isBlockPropertiesOpen={Boolean(editingBlockId)}
              />
            ) : activeCenterView === 'workspace' ? (
              <WorkspaceView
                panelEntries={workspacePanelEntries}
                layout={workspaceLayout}
                onSplitDrop={applyLayoutEditorSplitDrop}
                onSplitSizesChange={applyLayoutEditorSplitSizes}
                onOpenPanelPlotStyleEditor={(entry) => setPlotStyleEditorPanelId(entry.panel.id)}
                onCreateControlPanel={createEmptyControlPanel}
                onRenameControlPanel={renameControlPanel}
                onUpdateControlWidgetLabel={updateControlWidgetLabelInWorkspace}
                onUpdateControlWidgetInputKind={updateControlWidgetInputKindInWorkspace}
                onMoveControlWidget={moveControlWidgetInWorkspace}
                onRemoveControlWidget={removeControlWidgetInWorkspace}
                onMoveControlWidgetToPanel={moveControlWidgetToPanelInWorkspace}
              />
            ) : (
              <ApplicationView
                panelEntries={workspacePanelEntries}
                layout={workspaceLayout}
                executionState={runtimeView?.executionState}
              />
            )}
            <PlotStyleModal
              open={Boolean(activePlotStyleEditorEntry)}
              panelEntry={activePlotStyleEditorEntry}
              studioPalettes={effectiveStudioPlotPalettes}
              onClose={() => setPlotStyleEditorPanelId(null)}
              onApply={({ panelId, plotStyle, studioPalettes: nextStudioPalettes }) => {
                updatePanelPlotStyle(panelId, plotStyle);
                setStudioPlotPalettes(nextStudioPalettes);
              }}
            />
          </div>
        </section>

        <aside className="min-h-0 overflow-hidden border-l border-border bg-panel">
          <InspectorPanel />
        </aside>
      </main>

      <GlobalSessionsDrawer
        open={isSessionsDrawerOpen}
        onClose={() => setIsSessionsDrawerOpen(false)}
        onJumpToTab={setActiveTab}
        activeTabId={activeTabId}
      />

      {editingBlockId && (
        <BlockPropertiesModal
          instanceId={editingBlockId}
          onClose={() => setEditingBlockId(null)}
        />
      )}

      {pendingDestructiveAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-950/60" />
          <div className="relative w-[30rem] max-w-[calc(100%-2rem)] rounded border border-slate-700 bg-slate-900 p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-100">
              Save changes to {tabs.find((tab) => tab.id === pendingDestructiveAction.tabId)?.document.displayName ?? STUDIO_UNTITLED_NAME}?
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Your changes will be lost if you don&apos;t save them.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void onUnsavedDialogSave()}
                disabled={busy}
                className="rounded border border-emerald-700/70 bg-emerald-900/35 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-800/45"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetTabId = pendingDestructiveAction.tabId;
                  setPendingDestructiveAction(null);
                  performCloseTab(targetTabId);
                }}
                disabled={busy}
                className="rounded border border-amber-700/70 bg-amber-900/30 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-800/40"
              >
                Don&apos;t Save
              </button>
              <button
                type="button"
                onClick={() => setPendingDestructiveAction(null)}
                disabled={busy}
                className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
