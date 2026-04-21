import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import type { RenderedPort } from '../ports/model/types';
import { getPortTypeColor } from '../ports/model/typeColors';
import type { FlowNodeData } from './model/types';
import { HttpTimeSeriesPopout } from './runtime/http-time-series-popout';
import { isQuarterTurnNodeRotation } from './model/node-rotation';

type GraphFlowNode = Node<FlowNodeData>;

const PORT_BADGE_HEIGHT_PX = 18;
const PORT_BADGE_GAP_PX = Math.floor(PORT_BADGE_HEIGHT_PX * 0.5);
const PORT_BADGE_STEP_PX = PORT_BADGE_HEIGHT_PX + PORT_BADGE_GAP_PX;
const NODE_MIN_BODY_HEIGHT_PX = 120;
const NODE_VERTICAL_PADDING_PX = 20;
const NODE_MIN_BODY_WIDTH_PX = 224;

function handleTopPosition(index: number, total: number): string {
  if (total <= 1) {
    return '50%';
  }

  const offsetPx = (index - (total - 1) / 2) * PORT_BADGE_STEP_PX;
  return `calc(50% + ${offsetPx}px)`;
}

function requiredNodeHeightForPorts(portCount: number): number {
  if (portCount <= 0) {
    return NODE_MIN_BODY_HEIGHT_PX;
  }

  const stackedPortsHeight = PORT_BADGE_HEIGHT_PX + (portCount - 1) * PORT_BADGE_STEP_PX;
  return Math.max(
    NODE_MIN_BODY_HEIGHT_PX,
    stackedPortsHeight + NODE_VERTICAL_PADDING_PX * 2,
  );
}

type PortBadgeProps = {
  port: RenderedPort;
  index: number;
  total: number;
  side: 'left' | 'right';
  rotation: 0 | 90 | 180 | 270;
};

function getHandlePositionForRotation(side: 'left' | 'right', rotation: 0 | 90 | 180 | 270): Position {
  if (rotation === 90) {
    return side === 'left' ? Position.Top : Position.Bottom;
  }

  if (rotation === 180) {
    return side === 'left' ? Position.Right : Position.Left;
  }

  if (rotation === 270) {
    return side === 'left' ? Position.Bottom : Position.Top;
  }

  return side === 'left' ? Position.Left : Position.Right;
}

function ConnectablePortBadge({ port, index, total, side, rotation }: PortBadgeProps) {
  const typeColor = getPortTypeColor(port.typeName);
  const baseStyle: CSSProperties = {
    width: 'auto',
    minWidth: 56,
    maxWidth: 140,
    height: PORT_BADGE_HEIGHT_PX,
    borderRadius: 3,
    border: `1px solid ${typeColor.border}`,
    background: typeColor.background,
    color: typeColor.text,
    fontSize: 10,
    fontWeight: 500,
    lineHeight: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 6px',
    whiteSpace: 'nowrap',
    pointerEvents: 'all',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const sideStyle: CSSProperties = (() => {
    if (rotation === 90) {
      return side === 'left'
        ? {
            left: 8,
            transform: 'translate(-100%, -50%)',
          }
        : {
            right: 2,
            transform: 'translate(100%, -50%)',
          };
    }

    if (rotation === 180) {
      return side === 'left'
        ? {
            left: 8,
            transform: 'translate(-100%, -50%)',
          }
        : {
            right: 2,
            transform: 'translate(100%, -50%)',
          };
    }

    if (rotation === 270) {
      return side === 'left'
        ? {
            left: 8,
            transform: 'translate(-100%, -50%)',
          }
        : {
            right: 2,
            transform: 'translate(100%, -50%)',
          };
    }

    return side === 'left'
      ? {
          left: 8,
          transform: 'translate(-100%, -50%)',
        }
      : {
          right: 2,
          transform: 'translate(100%, -50%)',
        };
  })();

  return (
    <Handle
      id={port.handleId ?? port.portId}
      key={`${side}:${port.key}`}
      type={side === 'left' ? 'target' : 'source'}
      position={getHandlePositionForRotation(side, rotation)}
      title={port.displayLabel}
      style={{ ...baseStyle, ...sideStyle, top: handleTopPosition(index, total), zIndex: 0 }}
    >
      <span
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {port.displayLabel}
      </span>
    </Handle>
  );
}

function CollapsedPortBadge({ port, index, total, side, rotation }: PortBadgeProps) {
  const typeColor = getPortTypeColor(port.typeName);
  const style: CSSProperties = (() => {
    if (rotation === 90) {
      return side === 'left'
        ? {
            left: 8,
            transform: 'translate(-100%, -50%)',
          }
        : {
            right: 2,
            transform: 'translate(100%, -50%)',
          };
    }

    if (rotation === 180) {
      return side === 'left'
        ? {
            left: 8,
            transform: 'translate(-100%, -50%)',
          }
        : {
            right: 2,
            transform: 'translate(100%, -50%)',
          };
    }

    if (rotation === 270) {
      return side === 'left'
        ? {
            left: 8,
            transform: 'translate(-100%, -50%)',
          }
        : {
            right: 2,
            transform: 'translate(100%, -50%)',
          };
    }

    return side === 'left'
      ? {
          left: 8,
          transform: 'translate(-100%, -50%)',
        }
      : {
          right: 2,
          transform: 'translate(100%, -50%)',
        };
  })();

  return (
    <div
      className="absolute z-0 min-w-14 max-w-[140px] h-[18px] rounded text-[10px] font-medium leading-4 flex items-center justify-center px-1 whitespace-nowrap overflow-hidden text-ellipsis"
      style={{
        ...style,
        top: handleTopPosition(index, total),
        border: `1px solid ${typeColor.border}`,
        background: typeColor.background,
        color: typeColor.text,
      }}
      title={port.displayLabel}
    >
      {port.displayLabel}
    </div>
  );
}

export function GraphNode({ data, selected }: NodeProps<GraphFlowNode>) {
  const inputPorts = data.renderedInputPorts;
  const outputPorts = data.renderedOutputPorts;
  const updateNodeInternals = useUpdateNodeInternals();
  const executionMode = data.executionMode ?? 'active';
  const rotation = data.rotation;
  const isUpsideDown = rotation === 180;
  const isQuarterTurn = isQuarterTurnNodeRotation(rotation);
  const nodeWidthPx = isQuarterTurn
    ? requiredNodeHeightForPorts(Math.max(inputPorts.length, outputPorts.length))
    : NODE_MIN_BODY_WIDTH_PX;
  const nodeStyle: CSSProperties = {
    width: `${nodeWidthPx}px`,
    minWidth: `${nodeWidthPx}px`,
    maxWidth: `${nodeWidthPx}px`,
    minHeight: `${isQuarterTurn ? NODE_MIN_BODY_WIDTH_PX : requiredNodeHeightForPorts(Math.max(inputPorts.length, outputPorts.length))}px`,
    transform: `rotate(${rotation}deg)`,
    transformOrigin: 'center center',
  };
  const handleSignature = [
    `rotation:${rotation}`,
    ...inputPorts.map((port) => `${port.key}:${port.handleId ?? port.portId ?? ''}`),
    ...outputPorts.map((port) => `${port.key}:${port.handleId ?? port.portId ?? ''}`),
  ].join('|');
  const requiredHeightPx = requiredNodeHeightForPorts(Math.max(inputPorts.length, outputPorts.length));

  useEffect(() => {
    updateNodeInternals(data.instanceId);
  }, [data.instanceId, handleSignature, updateNodeInternals]);

  return (
    <div
      className="relative isolate group"
      style={nodeStyle}
    >
      {inputPorts.map((port, index) =>
        port.connectable && port.portId ? (
          <ConnectablePortBadge
            key={`in:${port.key}`}
            port={port}
            index={index}
            total={inputPorts.length}
            side="left"
            rotation={rotation}
          />
        ) : (
          <CollapsedPortBadge
            key={`collapsed-in:${port.key}`}
            port={port}
            index={index}
            total={inputPorts.length}
            side="left"
            rotation={rotation}
          />
        ),
      )}

      {outputPorts.map((port, index) =>
        port.connectable && port.portId ? (
          <ConnectablePortBadge
            key={`out:${port.key}`}
            port={port}
            index={index}
            total={outputPorts.length}
            side="right"
            rotation={rotation}
          />
        ) : (
          <CollapsedPortBadge
            key={`collapsed-out:${port.key}`}
            port={port}
            index={index}
            total={outputPorts.length}
            side="right"
            rotation={rotation}
          />
        ),
      )}

      <div
        className={`relative z-10 h-full rounded-md border px-3 py-2 shadow-sm transition ${
          executionMode === 'disabled'
            ? selected
              ? 'border-slate-500 bg-slate-800/55 opacity-70 ring-1 ring-slate-400/55'
              : 'border-slate-700 bg-slate-900/70 opacity-70'
            : executionMode === 'bypassed'
              ? selected
                ? 'border-amber-300 bg-slate-800 ring-1 ring-amber-200/70 shadow-[0_0_0_1px_rgba(245,158,11,0.55),0_0_18px_rgba(245,158,11,0.35)]'
                : 'border-amber-700 bg-slate-900 shadow-[0_0_0_1px_rgba(180,83,9,0.35)]'
              : data.missingFromCatalog
                ? selected
                  ? 'border-rose-300 bg-slate-800 ring-1 ring-rose-300/70 shadow-[0_0_0_1px_rgba(244,63,94,0.65),0_0_18px_rgba(244,63,94,0.45)]'
                  : 'border-rose-600 bg-slate-900 shadow-[0_0_0_1px_rgba(225,29,72,0.35)]'
                : selected
                  ? 'border-emerald-300 bg-slate-800 ring-1 ring-emerald-200/70 shadow-[0_0_0_1px_rgba(16,185,129,0.55),0_0_18px_rgba(16,185,129,0.45)]'
                  : 'border-slate-700 bg-slate-900'
        }`}
        style={{ minHeight: `${requiredHeightPx}px` }}
        title={`${data.displayName}\n${data.blockTypeId}${executionMode === 'active' ? '' : `\nMode: ${executionMode}`}`}
      >
        <div style={isUpsideDown ? { transform: 'rotate(180deg)', transformOrigin: 'center center' } : undefined}>
          {data.supportsRuntimeVisualization && (
            <button
              type="button"
              onClick={() => data.onOpenRuntimeVisualization?.(data.instanceId)}
              className={`absolute right-2 top-2 rounded border border-slate-600 bg-slate-950/90 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800 transition-opacity ${
                selected || data.isRuntimeVisualizationOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              title="View runtime plot"
            >
              Plot
            </button>
          )}

          <div className="text-sm font-medium text-slate-100">{data.shortDisplayName}</div>
          {executionMode !== 'active' && (
            <div
              className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                executionMode === 'disabled'
                  ? 'border-slate-600 bg-slate-800 text-slate-300'
                  : 'border-amber-600 bg-amber-950/45 text-amber-200'
              }`}
            >
              {executionMode === 'disabled' ? 'Disabled' : 'Bypassed'}
            </div>
          )}
          {data.parameterLines.length > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-1 min-w-0">
              {data.parameterLines.map((line) => (
                <div
                  key={line}
                  className="min-w-0 rounded border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap"
                  title={line}
                >
                  {line}
                </div>
              ))}
              {data.parameterOverflowCount > 0 && (
                <div
                  className="min-w-0 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap"
                  title={`${data.parameterOverflowCount} additional parameter value(s)`}
                >
                  +{data.parameterOverflowCount} more
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 text-[10px] text-slate-500">No non-advanced parameters</div>
          )}
        </div>

      </div>

      {data.supportsRuntimeVisualization && data.isRuntimeVisualizationOpen && (
        <HttpTimeSeriesPopout
          instanceId={data.instanceId}
          blockTypeId={data.blockTypeId}
          displayName={data.displayName}
          parameterValues={data.parameterValues}
          onClose={() => data.onCloseRuntimeVisualization?.()}
        />
      )}
    </div>
  );
}
