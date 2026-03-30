import { create } from 'zustand';
import type { GraphDocument } from '../../graph-document/model/types';
import { toGrctrlContentSubmission } from '../../runtime-submission/model/toGrctrlPayload';
import type { BlockDetails } from '../../../lib/api/block-details';
import { ApiClientError } from '../../../lib/api/client';
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  restartSession,
  startSession,
  stopSession,
  type SessionRecord,
} from '../../../lib/api/sessionsApi';

type RuntimeActionStatus = 'idle' | 'running' | 'success' | 'error';
export type ExecutionState = 'idle' | 'ready' | 'running' | 'stopped' | 'error';
export type OperationState = 'none' | 'running-graph' | 'stopping-session' | 'restarting-session' | 'refreshing';
export type GraphDriftState = 'in-sync' | 'out-of-sync';
export type GraphSubmissionState = 'none' | 'current' | 'stale';
export type RunIntent = 'none' | 'create-session' | 'replace-session-from-edits' | 'start-linked-session';

export type TabRuntimeView = {
  executionState: ExecutionState;
  operationState: OperationState;
  graphDriftState: GraphDriftState;
  graphSubmissionState: GraphSubmissionState;
  graphSubmissionUpdatedAt: string | null;
  runIntent: RunIntent;
};

export type RuntimeActivity = {
  timestamp: string;
  action: string;
  message: string;
  level: 'info' | 'error';
};

export type TabExecutionContext = {
  sessionId: string | null;
  session: SessionRecord | null;
  lastSubmittedHash: string | null;
  graphSubmissionUpdatedAt: string | null;
  lastAction: 'create' | 'start' | 'stop' | 'restart' | 'refresh' | 'delete' | null;
  lastActionStatus: RuntimeActionStatus;
  busy: boolean;
  lastError: string | null;
  lastUpdatedAt: string | null;
  sessionRefreshedAt: string | null;
  activity: RuntimeActivity[];
};

type RuntimeSessionState = {
  activeTabId: string | null;
  contextsByTabId: Record<string, TabExecutionContext>;
  sessions: SessionRecord[];
  getTabRuntimeView: (tabId: string, currentSubmissionContent?: string | null) => TabRuntimeView;
  ensureTabContext: (tabId: string) => void;
  removeTabContext: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  runTab: (
    tabId: string,
    document: GraphDocument,
    options?: { blockDetailsByType?: ReadonlyMap<string, BlockDetails> },
  ) => Promise<void>;
  stopSessionForTab: (tabId: string) => Promise<void>;
  restartSessionForTab: (tabId: string) => Promise<void>;
  deleteSessionForTab: (tabId: string) => Promise<void>;
  refreshTab: (tabId: string) => Promise<void>;
  refreshSessionStateForTab: (tabId: string) => Promise<void>;
  startSessionById: (sessionId: string) => Promise<void>;
  stopSessionById: (sessionId: string) => Promise<void>;
  restartSessionById: (sessionId: string) => Promise<void>;
  deleteSessionById: (sessionId: string) => Promise<void>;
  linkSessionToTab: (tabId: string, sessionId: string) => Promise<void>;
  unlinkSessionFromTab: (tabId: string) => void;
  findTabIdBySessionId: (sessionId: string) => string | null;
  refreshSessionList: () => Promise<void>;
};

function createDefaultContext(): TabExecutionContext {
  return {
    sessionId: null,
    session: null,
    lastSubmittedHash: null,
    graphSubmissionUpdatedAt: null,
    lastAction: null,
    lastActionStatus: 'idle',
    busy: false,
    lastError: null,
    lastUpdatedAt: null,
    sessionRefreshedAt: null,
    activity: [],
  };
}

function nowIsoString(): string {
  return new Date().toISOString();
}

function hashContent(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.details ? `${error.message}: ${error.details}` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown runtime error';
}

function isMissingSessionError(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'HTTP' && error.status === 404;
}

function isRunningState(state: string | undefined): boolean {
  return state === 'running';
}

function isStoppedState(state: string | undefined): boolean {
  return state === 'stopped';
}

function isErrorState(state: string | undefined): boolean {
  return state === 'error';
}

function deriveExecutionState(context: TabExecutionContext): ExecutionState {
  const state = context.session?.state;

  if (isRunningState(state)) {
    return 'running';
  }

  if (isErrorState(state) || context.lastActionStatus === 'error') {
    return 'error';
  }

  if (isStoppedState(state)) {
    return 'stopped';
  }

  if (context.sessionId) {
    return 'ready';
  }

  return 'idle';
}

function deriveOperationState(context: TabExecutionContext): OperationState {
  if (!context.busy || context.lastActionStatus !== 'running') {
    return 'none';
  }

  if (context.lastAction === 'stop') {
    return 'stopping-session';
  }
  if (context.lastAction === 'restart') {
    return 'restarting-session';
  }
  if (context.lastAction === 'refresh') {
    return 'refreshing';
  }
  return 'running-graph';
}

function deriveGraphDriftState(context: TabExecutionContext, currentSubmissionContent?: string | null): GraphDriftState {
  if (!context.sessionId || !context.lastSubmittedHash || !currentSubmissionContent) {
    return 'in-sync';
  }

  return context.lastSubmittedHash === hashContent(currentSubmissionContent) ? 'in-sync' : 'out-of-sync';
}

function deriveGraphSubmissionState(
  context: TabExecutionContext,
  currentSubmissionContent?: string | null,
): GraphSubmissionState {
  if (!context.sessionId || !context.lastSubmittedHash || !currentSubmissionContent) {
    return 'none';
  }

  return context.lastSubmittedHash === hashContent(currentSubmissionContent) ? 'current' : 'stale';
}

function deriveRunIntent(
  context: TabExecutionContext,
  currentSubmissionContent?: string | null,
  executionState?: ExecutionState,
): RunIntent {
  if (executionState === 'running') {
    return 'none';
  }

  if (!context.sessionId) {
    return 'create-session';
  }

  const drift = deriveGraphDriftState(context, currentSubmissionContent);
  if (drift === 'out-of-sync') {
    return 'replace-session-from-edits';
  }

  return 'start-linked-session';
}

function pushActivity(context: TabExecutionContext, item: Omit<RuntimeActivity, 'timestamp'>): TabExecutionContext {
  const nextEvent: RuntimeActivity = {
    ...item,
    timestamp: nowIsoString(),
  };

  return {
    ...context,
    activity: [nextEvent, ...context.activity].slice(0, 40),
  };
}

const POLL_INTERVALS_MS = [500, 500, 500, 1000, 1000, 1000, 1000, 1500];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const useRuntimeSessionStore = create<RuntimeSessionState>((set, get) => {
  const actionVersionByTabId: Record<string, number> = {};

  const patchContext = (tabId: string, updater: (current: TabExecutionContext) => TabExecutionContext) => {
    set((state) => {
      const current = state.contextsByTabId[tabId] ?? createDefaultContext();
      return {
        contextsByTabId: {
          ...state.contextsByTabId,
          [tabId]: updater(current),
        },
      };
    });
  };

  const nextActionVersion = (tabId: string): number => {
    const next = (actionVersionByTabId[tabId] ?? 0) + 1;
    actionVersionByTabId[tabId] = next;
    return next;
  };

  const isCurrentAction = (tabId: string, version: number): boolean => actionVersionByTabId[tabId] === version;

  const patchContextIfCurrent = (
    tabId: string,
    version: number,
    updater: (current: TabExecutionContext) => TabExecutionContext,
  ): boolean => {
    if (!isCurrentAction(tabId, version)) {
      return false;
    }

    patchContext(tabId, updater);
    return true;
  };

  const beginAction = (tabId: string, action: TabExecutionContext['lastAction']): number => {
    const version = nextActionVersion(tabId);
    patchContext(tabId, (current) => ({
      ...current,
      lastAction: action,
      lastActionStatus: 'running',
      busy: true,
      lastError: null,
      lastUpdatedAt: nowIsoString(),
    }));
    return version;
  };

  const completeAction = (
    tabId: string,
    version: number,
    status: RuntimeActionStatus,
    errorMessage?: string | null,
    successMessage?: string,
  ) => {
    patchContextIfCurrent(tabId, version, (current) => {
      const withResult: TabExecutionContext = {
        ...current,
        lastActionStatus: status,
        busy: false,
        lastError: status === 'error' ? errorMessage ?? 'Action failed.' : null,
        lastUpdatedAt: nowIsoString(),
      };

      if (status === 'error') {
        return pushActivity(withResult, {
          action: current.lastAction ?? 'action',
          message: errorMessage ?? 'Action failed.',
          level: 'error',
        });
      }

      if (successMessage) {
        return pushActivity(withResult, {
          action: current.lastAction ?? 'action',
          message: successMessage,
          level: 'info',
        });
      }

      return withResult;
    });
  };

  const clearSessionFromContext = (context: TabExecutionContext, reason?: string): TabExecutionContext => {
    const cleared: TabExecutionContext = {
      ...context,
      sessionId: null,
      session: null,
      lastSubmittedHash: null,
      graphSubmissionUpdatedAt: null,
      sessionRefreshedAt: null,
      busy: false,
      lastUpdatedAt: nowIsoString(),
      lastError: reason ?? context.lastError,
    };

    if (!reason) {
      return cleared;
    }

    return pushActivity(cleared, {
      action: 'refresh',
      message: reason,
      level: 'error',
    });
  };

  const refreshSessionStateWithVersion = async (
    tabId: string,
    sessionId: string,
    version: number,
  ): Promise<SessionRecord | null> => {
    try {
      const session = await getSession(sessionId);
      if (!patchContextIfCurrent(tabId, version, (current) => ({
        ...current,
        sessionId: session.id,
        session,
        sessionRefreshedAt: nowIsoString(),
        lastUpdatedAt: nowIsoString(),
      }))) {
        return null;
      }

      return session;
    } catch (error) {
      if (!isCurrentAction(tabId, version)) {
        return null;
      }

      if (isMissingSessionError(error)) {
        patchContext(tabId, (current) =>
          clearSessionFromContext(current, 'Linked session no longer exists on backend.'),
        );
        return null;
      }

      throw error;
    }
  };

  const pollSessionStateWithVersion = async (
    tabId: string,
    sessionId: string,
    version: number,
    target: 'running' | 'stopped',
  ): Promise<SessionRecord | null> => {
    for (let index = 0; index < POLL_INTERVALS_MS.length; index += 1) {
      if (!isCurrentAction(tabId, version)) {
        return null;
      }

      const session = await refreshSessionStateWithVersion(tabId, sessionId, version);
      if (!session) {
        return null;
      }

      if (session.state === 'error') {
        return session;
      }

      if (target === 'running' && session.state === 'running') {
        return session;
      }

      if (target === 'stopped' && session.state === 'stopped') {
        return session;
      }

      if (index < POLL_INTERVALS_MS.length - 1) {
        await wait(POLL_INTERVALS_MS[index]);
      }
    }

    return null;
  };

  return {
    activeTabId: null,
    contextsByTabId: {},
    sessions: [],

    getTabRuntimeView: (tabId, currentSubmissionContent) => {
      const context = get().contextsByTabId[tabId] ?? createDefaultContext();
      const executionState = deriveExecutionState(context);
      return {
        executionState,
        operationState: deriveOperationState(context),
        graphDriftState: deriveGraphDriftState(context, currentSubmissionContent),
        graphSubmissionState: deriveGraphSubmissionState(context, currentSubmissionContent),
        graphSubmissionUpdatedAt: context.graphSubmissionUpdatedAt,
        runIntent: deriveRunIntent(context, currentSubmissionContent, executionState),
      };
    },

    ensureTabContext: (tabId) => {
      set((state) => {
        if (state.contextsByTabId[tabId]) {
          return state;
        }

        return {
          contextsByTabId: {
            ...state.contextsByTabId,
            [tabId]: createDefaultContext(),
          },
        };
      });
    },

    removeTabContext: (tabId) => {
      delete actionVersionByTabId[tabId];
      set((state) => {
        const next = { ...state.contextsByTabId };
        delete next[tabId];
        return { contextsByTabId: next };
      });
    },

    setActiveTab: (tabId) => {
      set({ activeTabId: tabId });
    },

    runTab: async (tabId, document, options) => {
      const actionVersion = beginAction(tabId, 'start');

      try {
        const submission = toGrctrlContentSubmission(document, options);
        const context = get().contextsByTabId[tabId] ?? createDefaultContext();

        const hasSubmissionDrift = context.lastSubmittedHash !== submission.contentHash;
        const needsNewSession = !context.sessionId || hasSubmissionDrift;
        const isReplacementRun = Boolean(context.sessionId) && hasSubmissionDrift;

        let activeSession: SessionRecord | null = context.session;
        let activeSessionId = context.sessionId;
        const previousSessionId = isReplacementRun ? context.sessionId : null;

        if (needsNewSession) {
          const createdSession = await createSession({
            name: submission.graphName || 'demo',
            grc: submission.content,
          });
          activeSession = createdSession;
          activeSessionId = createdSession.id;

          if (!isReplacementRun) {
            if (!patchContextIfCurrent(tabId, actionVersion, (current) => {
              let next: TabExecutionContext = {
                ...current,
                sessionId: createdSession.id,
                session: createdSession,
                lastSubmittedHash: submission.contentHash,
                graphSubmissionUpdatedAt: nowIsoString(),
                sessionRefreshedAt: nowIsoString(),
                lastUpdatedAt: nowIsoString(),
                lastAction: 'create',
              };

              next = pushActivity(next, {
                action: 'create',
                message: `Created session ${createdSession.id}.`,
                level: 'info',
              });

              return next;
            })) {
              return;
            }
          }

          await get().refreshSessionList();
        }

        if (!activeSessionId) {
          completeAction(tabId, actionVersion, 'error', 'No session available for run.');
          return;
        }

        if (!activeSession) {
          activeSession = await refreshSessionStateWithVersion(tabId, activeSessionId, actionVersion);
          if (!activeSession) {
            completeAction(tabId, actionVersion, 'error', 'Failed to load linked session.');
            return;
          }
        }

        if (activeSession.state !== 'running') {
          const started = await startSession(activeSessionId);
          if (!patchContextIfCurrent(tabId, actionVersion, (current) => ({
            ...current,
            sessionId: started.id,
            session: started,
            sessionRefreshedAt: nowIsoString(),
            lastUpdatedAt: nowIsoString(),
            lastAction: 'start',
          }))) {
            return;
          }
        }

        const converged = await pollSessionStateWithVersion(tabId, activeSessionId, actionVersion, 'running');
        if (!converged) {
          completeAction(tabId, actionVersion, 'error', 'Session did not converge to running in time.');
          return;
        }

        if (converged.state === 'error') {
          completeAction(
            tabId,
            actionVersion,
            'error',
            converged.lastError ?? 'Session reached error state while starting.',
          );
          return;
        }

        if (isReplacementRun) {
          if (!patchContextIfCurrent(tabId, actionVersion, (current) => {
            let next: TabExecutionContext = {
              ...current,
              sessionId: converged.id,
              session: converged,
              lastSubmittedHash: submission.contentHash,
              graphSubmissionUpdatedAt: nowIsoString(),
              sessionRefreshedAt: nowIsoString(),
              lastUpdatedAt: nowIsoString(),
              lastAction: 'create',
              lastError: null,
            };

            next = pushActivity(next, {
              action: 'create',
              message: `Replaced linked session ${previousSessionId} with ${converged.id}.`,
              level: 'info',
            });

            return next;
          })) {
            return;
          }
        }

        if (previousSessionId && previousSessionId !== converged.id) {
          try {
            await deleteSession(previousSessionId);
          } catch {
            patchContextIfCurrent(tabId, actionVersion, (current) =>
              pushActivity(current, {
                action: 'delete',
                message: `Replacement session started, but previous session ${previousSessionId} could not be deleted automatically.`,
                level: 'error',
              }),
            );
          }
        }

        await get().refreshSessionList();
        completeAction(tabId, actionVersion, 'success', null, 'Session running.');
      } catch (error) {
        completeAction(tabId, actionVersion, 'error', toErrorMessage(error));
      }
    },

    stopSessionForTab: async (tabId) => {
      const actionVersion = beginAction(tabId, 'stop');
      const sessionId = get().contextsByTabId[tabId]?.sessionId;

      if (!sessionId) {
        completeAction(tabId, actionVersion, 'error', 'No session linked to this tab.');
        return;
      }

      try {
        const stopped = await stopSession(sessionId);
        if (!patchContextIfCurrent(tabId, actionVersion, (current) => ({
          ...current,
          session: stopped,
          sessionRefreshedAt: nowIsoString(),
          lastUpdatedAt: nowIsoString(),
        }))) {
          return;
        }

        const converged = await pollSessionStateWithVersion(tabId, sessionId, actionVersion, 'stopped');
        if (!converged) {
          completeAction(tabId, actionVersion, 'error', 'Session did not converge to stopped in time.');
          return;
        }

        if (converged.state === 'error') {
          completeAction(
            tabId,
            actionVersion,
            'error',
            converged.lastError ?? 'Session reached error state while stopping.',
          );
          return;
        }

        await get().refreshSessionList();
        completeAction(tabId, actionVersion, 'success', null, 'Session stopped.');
      } catch (error) {
        completeAction(tabId, actionVersion, 'error', toErrorMessage(error));
      }
    },

    restartSessionForTab: async (tabId) => {
      const actionVersion = beginAction(tabId, 'restart');
      const sessionId = get().contextsByTabId[tabId]?.sessionId;

      if (!sessionId) {
        completeAction(tabId, actionVersion, 'error', 'No session linked to this tab.');
        return;
      }

      try {
        const restarted = await restartSession(sessionId);
        if (!patchContextIfCurrent(tabId, actionVersion, (current) => ({
          ...current,
          session: restarted,
          sessionRefreshedAt: nowIsoString(),
          lastUpdatedAt: nowIsoString(),
        }))) {
          return;
        }

        const converged = await pollSessionStateWithVersion(tabId, sessionId, actionVersion, 'running');
        if (!converged) {
          completeAction(tabId, actionVersion, 'error', 'Session did not converge to running in time.');
          return;
        }

        if (converged.state === 'error') {
          completeAction(
            tabId,
            actionVersion,
            'error',
            converged.lastError ?? 'Session reached error state while restarting.',
          );
          return;
        }

        await get().refreshSessionList();
        completeAction(tabId, actionVersion, 'success', null, 'Session restarted.');
      } catch (error) {
        completeAction(tabId, actionVersion, 'error', toErrorMessage(error));
      }
    },

    deleteSessionForTab: async (tabId) => {
      const actionVersion = beginAction(tabId, 'delete');
      const sessionId = get().contextsByTabId[tabId]?.sessionId;

      if (!sessionId) {
        completeAction(tabId, actionVersion, 'error', 'No session linked to this tab.');
        return;
      }

      try {
        await deleteSession(sessionId);

        patchContextIfCurrent(tabId, actionVersion, (current) =>
          pushActivity(
            {
              ...current,
              sessionId: null,
              session: null,
              lastSubmittedHash: null,
              graphSubmissionUpdatedAt: null,
              sessionRefreshedAt: null,
              lastUpdatedAt: nowIsoString(),
              busy: false,
            },
            {
              action: 'delete',
              message: `Deleted session ${sessionId}.`,
              level: 'info',
            },
          ),
        );

        await get().refreshSessionList();
        completeAction(tabId, actionVersion, 'success');
      } catch (error) {
        if (isMissingSessionError(error)) {
          patchContextIfCurrent(tabId, actionVersion, (current) =>
            clearSessionFromContext(current, 'Session already missing on backend.'),
          );
          await get().refreshSessionList();
          completeAction(tabId, actionVersion, 'success');
          return;
        }

        completeAction(tabId, actionVersion, 'error', toErrorMessage(error));
      }
    },

    refreshTab: async (tabId) => {
      await get().refreshSessionStateForTab(tabId);
    },

    refreshSessionStateForTab: async (tabId) => {
      const actionVersion = beginAction(tabId, 'refresh');
      const sessionId = get().contextsByTabId[tabId]?.sessionId;

      if (!sessionId) {
        completeAction(tabId, actionVersion, 'success');
        return;
      }

      try {
        const refreshed = await refreshSessionStateWithVersion(tabId, sessionId, actionVersion);
        if (!refreshed) {
          completeAction(tabId, actionVersion, 'error', 'Unable to refresh linked session.');
          return;
        }

        await get().refreshSessionList();
        completeAction(tabId, actionVersion, 'success', null, 'Session refreshed.');
      } catch (error) {
        completeAction(tabId, actionVersion, 'error', toErrorMessage(error));
      }
    },

    startSessionById: async (sessionId) => {
      const tabId = get().findTabIdBySessionId(sessionId);
      if (tabId) {
        const actionVersion = beginAction(tabId, 'start');
        try {
          const started = await startSession(sessionId);
          if (!patchContextIfCurrent(tabId, actionVersion, (current) => ({
            ...current,
            sessionId: started.id,
            session: started,
            sessionRefreshedAt: nowIsoString(),
            lastUpdatedAt: nowIsoString(),
          }))) {
            return;
          }

          const converged = await pollSessionStateWithVersion(tabId, sessionId, actionVersion, 'running');
          if (!converged) {
            completeAction(tabId, actionVersion, 'error', 'Session did not converge to running in time.');
            return;
          }
          if (converged.state === 'error') {
            completeAction(tabId, actionVersion, 'error', converged.lastError ?? 'Session reached error state.');
            return;
          }

          await get().refreshSessionList();
          completeAction(tabId, actionVersion, 'success', null, 'Session started.');
        } catch (error) {
          completeAction(tabId, actionVersion, 'error', toErrorMessage(error));
        }
        return;
      }

      await startSession(sessionId);
      await get().refreshSessionList();
    },

    stopSessionById: async (sessionId) => {
      const tabId = get().findTabIdBySessionId(sessionId);
      if (tabId) {
        await get().stopSessionForTab(tabId);
        return;
      }

      await stopSession(sessionId);
      await get().refreshSessionList();
    },

    restartSessionById: async (sessionId) => {
      const tabId = get().findTabIdBySessionId(sessionId);
      if (tabId) {
        await get().restartSessionForTab(tabId);
        return;
      }

      await restartSession(sessionId);
      await get().refreshSessionList();
    },

    deleteSessionById: async (sessionId) => {
      const tabId = get().findTabIdBySessionId(sessionId);
      if (tabId) {
        await get().deleteSessionForTab(tabId);
        return;
      }

      await deleteSession(sessionId);
      await get().refreshSessionList();
    },

    linkSessionToTab: async (tabId, sessionId) => {
      set((state) => {
        const nextContexts = { ...state.contextsByTabId };

        for (const [candidateTabId, candidate] of Object.entries(nextContexts)) {
          if (candidateTabId !== tabId && candidate.sessionId === sessionId) {
            nextContexts[candidateTabId] = pushActivity(
              {
                ...candidate,
                sessionId: null,
                session: null,
                sessionRefreshedAt: null,
                lastError: 'Session moved to another tab.',
                lastUpdatedAt: nowIsoString(),
              },
              {
                action: 'refresh',
                message: 'Session moved to another tab.',
                level: 'info',
              },
            );
          }
        }

        const target = nextContexts[tabId] ?? createDefaultContext();
        nextContexts[tabId] = {
          ...target,
          sessionId,
          session: null,
          sessionRefreshedAt: null,
          lastSubmittedHash: null,
          graphSubmissionUpdatedAt: null,
          lastUpdatedAt: nowIsoString(),
        };

        return { contextsByTabId: nextContexts };
      });

      await get().refreshSessionStateForTab(tabId);
    },

    unlinkSessionFromTab: (tabId) => {
      patchContext(tabId, (current) =>
        pushActivity(
          {
            ...current,
            sessionId: null,
            session: null,
            lastSubmittedHash: null,
            graphSubmissionUpdatedAt: null,
            sessionRefreshedAt: null,
            lastUpdatedAt: nowIsoString(),
            lastError: null,
          },
          {
            action: 'refresh',
            message: 'Session unlinked from tab.',
            level: 'info',
          },
        ),
      );
    },

    findTabIdBySessionId: (sessionId) => {
      const entries = Object.entries(get().contextsByTabId);
      const found = entries.find(([, context]) => context.sessionId === sessionId);
      return found?.[0] ?? null;
    },

    refreshSessionList: async () => {
      try {
        const sessions = await listSessions();
        set({ sessions });
      } catch {
        // auxiliary list refresh
      }
    },
  };
});
