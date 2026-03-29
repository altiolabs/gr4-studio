import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useState } from 'react';
import type { StudioLayoutNode, StudioLayoutSpec, StudioPanelSpec, StudioPlotPaletteSpec } from '../graph-document/model/studio-workspace';
import { collectLayoutPaneIds } from '../graph-document/model/studio-layout';
import type { SplitDropPosition } from '../graph-document/model/studio-layout';
import type { ReactNode } from 'react';
import type { SplitNodePath } from '../graph-document/model/studio-layout';

export type WorkspacePanelViewModel = {
  panel: StudioPanelSpec;
  studioPlotPalettes?: readonly StudioPlotPaletteSpec[];
  nodePanelTitle?: string;
  nodeDisplayName?: string;
  nodeBlockTypeId?: string;
  nodeParameters?: Readonly<Record<string, string>>;
  bindingStatus?: 'unsupported' | 'unconfigured' | 'configured' | 'invalid';
  bindingTransport?: string;
  bindingEndpoint?: string;
  bindingPollMs?: number;
};

type WorkspaceViewProps = {
  panelEntries: readonly WorkspacePanelViewModel[];
  layout: StudioLayoutSpec;
  onSplitDrop?: (draggedPanelId: string, targetPanelId: string, position: SplitDropPosition) => void;
  onSplitSizesChange?: (splitPath: SplitNodePath, sizes: number[]) => void;
  onOpenPanelPlotStyleEditor?: (entry: WorkspacePanelViewModel) => void;
};

const edgeDropCollisionDetection: CollisionDetection = (args) => {
  const edgeTargets = args.droppableContainers.filter((container) =>
    String(container.id).startsWith('split-drop:'),
  );
  const pointerHits = pointerWithin({
    ...args,
    droppableContainers: edgeTargets,
  });
  if (pointerHits.length > 0) {
    return pointerHits;
  }
  return rectIntersection(args);
};

function LayoutEditorPane({
  entry,
  isActive,
  dragHandleProps,
  onOpenPanelPlotStyleEditor,
}: {
  entry: WorkspacePanelViewModel;
  isActive: boolean;
  dragHandleProps?: Record<string, unknown>;
  onOpenPanelPlotStyleEditor?: (entry: WorkspacePanelViewModel) => void;
}) {
  const { panel } = entry;
  const paneTitle = entry.nodePanelTitle ?? panel.title ?? entry.nodeDisplayName ?? panel.nodeId;
  const isPlotPanel = panel.kind === 'series' || panel.kind === 'series2d';

  return (
    <article
      className={`h-full rounded-lg border bg-slate-900/45 min-h-[10rem] flex flex-col ${
        isActive ? 'border-emerald-500/60 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]' : 'border-slate-700'
      }`}
    >
      <header
        className="h-9 shrink-0 px-3 border-b border-slate-700/80 bg-slate-950/35 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing hover:bg-slate-900/55 transition-colors"
        {...dragHandleProps}
      >
        <div className="min-w-0 flex items-center gap-2">
          <span className="inline-flex h-5 w-4 items-center justify-center rounded border border-slate-600/70 bg-slate-800/70 text-[9px] leading-none text-slate-300">
            ::
          </span>
          <h3 className="text-sm font-semibold text-slate-100 truncate" title={paneTitle}>
            {paneTitle}
          </h3>
        </div>
        <span className="shrink-0 rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200">
          {panel.kind}
        </span>
      </header>
      <div className="flex-1 p-3">
        <div className="h-full min-h-[6.5rem] rounded border border-dashed border-slate-700/90 bg-slate-950/40 px-2 py-2 flex flex-col justify-between gap-2">
          {isPlotPanel && onOpenPanelPlotStyleEditor ? (
            <div className="flex items-center justify-start">
              <button
                type="button"
                onClick={() => onOpenPanelPlotStyleEditor(entry)}
                className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
              >
                Plot Style…
              </button>
            </div>
          ) : null}
          <span className="text-xs text-slate-400">Pane preview</span>
          <span className="text-[10px] text-slate-500 truncate" title={panel.nodeId}>
            {panel.nodeId}
          </span>
        </div>
      </div>
    </article>
  );
}

function DropTarget({
  position,
  targetPanelId,
  activeDragPanelId,
}: {
  position: SplitDropPosition;
  targetPanelId: string;
  activeDragPanelId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `split-drop:${targetPanelId}:${position}`,
    data: {
      targetPanelId,
      position,
    },
  });
  const active = Boolean(activeDragPanelId && activeDragPanelId !== targetPanelId);
  const placement =
    position === 'left'
      ? 'left-0 top-1 bottom-1 w-8'
      : position === 'right'
        ? 'right-0 top-1 bottom-1 w-8'
        : position === 'top'
          ? 'top-0 left-1 right-1 h-8'
          : 'bottom-0 left-1 right-1 h-8';
  const directionLabel =
    position === 'left'
      ? 'left'
      : position === 'right'
        ? 'right'
        : position === 'top'
          ? 'top'
          : 'bottom';
  const activeClass = active
    ? `z-30 border text-emerald-100 opacity-100 ${
        isOver
          ? 'border-emerald-300/90 bg-emerald-500/45 shadow-[0_0_0_1px_rgba(52,211,153,0.55)]'
          : 'border-emerald-400/65 bg-emerald-500/22'
      }`
    : 'pointer-events-none opacity-0';

  return (
    <div
      ref={setNodeRef}
      aria-label={`Drop ${position} of ${targetPanelId}`}
      className={`absolute ${placement} rounded-md transition-all duration-100 ${activeClass}`}
    >
      {active && (
        <span
          className={`absolute rounded border border-emerald-300/70 bg-slate-900/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-100 ${
            position === 'left'
              ? 'left-1 top-1/2 -translate-y-1/2'
              : position === 'right'
                ? 'right-1 top-1/2 -translate-y-1/2'
                : position === 'top'
                  ? 'left-1/2 top-1 -translate-x-1/2'
                  : 'left-1/2 bottom-1 -translate-x-1/2'
          }`}
        >
          {directionLabel}
        </span>
      )}
    </div>
  );
}

function LayoutTreePaneNode({
  entry,
  activePanelId,
  activeDragPanelId,
  onOpenPanelPlotStyleEditor,
}: {
  entry: WorkspacePanelViewModel;
  activePanelId?: string;
  activeDragPanelId: string | null;
  onOpenPanelPlotStyleEditor?: (entry: WorkspacePanelViewModel) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: entry.panel.id,
    data: {
      panelId: entry.panel.id,
    },
  });

  return (
    <div ref={setNodeRef} className="relative h-full min-h-0 min-w-0">
      <LayoutEditorPane
        entry={entry}
        isActive={activePanelId === entry.panel.id}
        dragHandleProps={{ ...listeners, ...attributes }}
        onOpenPanelPlotStyleEditor={onOpenPanelPlotStyleEditor}
      />
      <DropTarget position="left" targetPanelId={entry.panel.id} activeDragPanelId={activeDragPanelId} />
      <DropTarget position="right" targetPanelId={entry.panel.id} activeDragPanelId={activeDragPanelId} />
      <DropTarget position="top" targetPanelId={entry.panel.id} activeDragPanelId={activeDragPanelId} />
      <DropTarget position="bottom" targetPanelId={entry.panel.id} activeDragPanelId={activeDragPanelId} />
    </div>
  );
}

function renderLayoutTreeNode({
  node,
  nodePath,
  visibleEntryByPanelId,
  activePanelId,
  activeDragPanelId,
  onSplitSizesChange,
  onOpenPanelPlotStyleEditor,
}: {
  node: StudioLayoutNode;
  nodePath: readonly number[];
  visibleEntryByPanelId: ReadonlyMap<string, WorkspacePanelViewModel>;
  activePanelId?: string;
  activeDragPanelId: string | null;
  onSplitSizesChange?: (splitPath: SplitNodePath, sizes: number[]) => void;
  onOpenPanelPlotStyleEditor?: (entry: WorkspacePanelViewModel) => void;
}): ReactNode {
  if (node.kind === 'pane') {
    const entry = visibleEntryByPanelId.get(node.panelId);
    if (!entry) {
      return null;
    }
    return (
      <LayoutTreePaneNode
        entry={entry}
        activePanelId={activePanelId}
        activeDragPanelId={activeDragPanelId}
        onOpenPanelPlotStyleEditor={onOpenPanelPlotStyleEditor}
      />
    );
  }

  const children: Array<{ key: string; node: ReactNode }> = node.children
    .map((child: StudioLayoutNode, index: number) => ({
      key: `${node.direction}:${index}`,
      node: renderLayoutTreeNode({
        node: child,
        nodePath: [...nodePath, index],
        visibleEntryByPanelId,
        activePanelId,
        activeDragPanelId,
        onSplitSizesChange,
        onOpenPanelPlotStyleEditor,
      }),
    }))
    .filter((item) => item.node !== null);

  if (children.length === 0) {
    return null;
  }

  if (children.length === 1) {
    return children[0].node;
  }

  const splitClass =
    node.direction === 'row'
      ? 'flex flex-row min-h-0 min-w-0 h-full w-full'
      : 'flex flex-col min-h-0 min-w-0 h-full w-full';

  const splitSizes =
    node.sizes &&
    node.sizes.length === children.length &&
    node.sizes.every((size) => typeof size === 'number' && Number.isFinite(size) && size > 0)
      ? node.sizes
      : Array.from({ length: children.length }, () => 1);
  const totalSplitSize = splitSizes.reduce((sum, size) => sum + size, 0) || children.length;
  const percentSizes = splitSizes.map((size) => (size / totalSplitSize) * 100);
  const groupDirection = node.direction === 'row' ? 'horizontal' : 'vertical';
  const splitKey = nodePath.length === 0 ? 'root' : nodePath.join('-');
  const childIds = children.map((_, index) => `split-${splitKey}-child-${index}`);
  const defaultLayout = Object.fromEntries(
    childIds.map((childId, index) => [childId, percentSizes[index]]),
  );
  const groupChildren: ReactNode[] = [];
  children.forEach((child, index) => {
    groupChildren.push(
      <Panel key={`panel-${child.key}`} id={childIds[index]} defaultSize={percentSizes[index]} minSize="5%" className="min-h-0 min-w-0">
        {child.node}
      </Panel>,
    );
    if (index < children.length - 1) {
      groupChildren.push(
        <Separator
          key={`separator-${child.key}`}
          className={
            node.direction === 'row'
              ? 'mx-1 w-3 shrink-0 self-stretch cursor-col-resize rounded-sm bg-slate-800/55 hover:bg-emerald-500/28 active:bg-emerald-500/38 transition-colors flex items-center justify-center'
              : 'my-1 h-3 shrink-0 self-stretch cursor-row-resize rounded-sm bg-slate-800/55 hover:bg-emerald-500/28 active:bg-emerald-500/38 transition-colors flex items-center justify-center'
          }
        >
          <span
            className={
              node.direction === 'row'
                ? 'h-10 w-[2px] rounded bg-slate-300/40'
                : 'h-[2px] w-10 rounded bg-slate-300/40'
            }
          />
        </Separator>,
      );
    }
  });

  return (
    <Group
      orientation={groupDirection}
      className={splitClass}
      defaultLayout={defaultLayout}
      onLayoutChanged={(layoutMap) => {
        if (!onSplitSizesChange) {
          return;
        }
        const layoutSizes = childIds.map((childId, index) => {
          const value = layoutMap[childId];
          if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return value;
          }
          return percentSizes[index];
        });
        onSplitSizesChange([...nodePath], layoutSizes);
      }}
    >
      {groupChildren}
    </Group>
  );
}

export function WorkspaceView({
  panelEntries,
  layout,
  onSplitDrop,
  onSplitSizesChange,
  onOpenPanelPlotStyleEditor,
}: WorkspaceViewProps) {
  const [activeDragPanelId, setActiveDragPanelId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
  );
  const visibleEntries = panelEntries.filter((entry) => entry.panel.visible);
  const visibleEntryByPanelId = new Map(visibleEntries.map((entry) => [entry.panel.id, entry]));
  const visiblePaneCount = collectLayoutPaneIds(layout.root).filter((panelId) =>
    visibleEntryByPanelId.has(panelId),
  ).length;
  const tree = renderLayoutTreeNode({
    node: layout.root,
    nodePath: [],
    visibleEntryByPanelId,
    activePanelId: layout.activePanelId,
    activeDragPanelId,
    onSplitSizesChange,
    onOpenPanelPlotStyleEditor,
  });

  const handleDragStart = (event: DragStartEvent) => {
    const panelId = event.active.data.current?.panelId;
    if (typeof panelId !== 'string' || panelId.length === 0) {
      setActiveDragPanelId(null);
      return;
    }
    setActiveDragPanelId(panelId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const draggedPanelId = event.active.data.current?.panelId;
    const targetPanelId = event.over?.data.current?.targetPanelId;
    const position = event.over?.data.current?.position as SplitDropPosition | undefined;
    setActiveDragPanelId(null);

    if (
      typeof draggedPanelId !== 'string' ||
      typeof targetPanelId !== 'string' ||
      typeof position !== 'string'
    ) {
      return;
    }
    if (draggedPanelId === targetPanelId) {
      return;
    }
    onSplitDrop?.(draggedPanelId, targetPanelId, position);
  };
  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveDragPanelId(null);
  };

  if (!tree || visiblePaneCount === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        <div className="max-w-lg rounded border border-border bg-panel p-6 text-center">
          <h2 className="text-base font-semibold text-slate-100">Layout Editor</h2>
          <p className="mt-2 text-sm text-slate-300">
            No Studio panels available for this graph yet.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Add supported Studio sink blocks to generate default layout panels.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-4 overflow-auto">
      <div className="rounded border border-border bg-panel p-3 h-full min-h-[24rem] flex flex-col">
        <h2 className="text-sm font-semibold text-slate-100">Layout Editor</h2>
        <p className="mt-1 text-xs text-slate-400">
          {visiblePaneCount} visible panel{visiblePaneCount === 1 ? '' : 's'}
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={edgeDropCollisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="mt-3 min-h-0 flex-1">{tree}</div>
          <DragOverlay>
            {activeDragPanelId ? (
              <div className="rounded border border-emerald-500/70 bg-slate-900/90 px-2 py-1 text-xs text-slate-100 shadow-lg">
                {activeDragPanelId}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
