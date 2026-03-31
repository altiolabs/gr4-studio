import { describe, expect, it } from 'vitest';
import type { BlockParameterMeta } from '../../lib/api/block-details';
import {
  addControlWidgetToPanels,
  addEmptyControlPanelToPanels,
  buildControlWidgetSpec,
  getCompatibleControlWidgetInputKinds,
  inferControlWidgetInputKind,
  moveControlWidgetInPanel,
  moveControlWidgetToPanel,
  removeControlWidgetFromPanel,
  renameControlPanelTitle,
  updateControlWidgetInputKind,
  updateControlWidgetLabel,
} from './control-panel-authoring';
import type { StudioPanelSpec } from '../graph-document/model/studio-workspace';

function makeParameter(overrides: Partial<BlockParameterMeta> = {}): BlockParameterMeta {
  return {
    name: 'gain',
    label: 'gain',
    mutable: true,
    readOnly: false,
    valueKind: 'scalar',
    valueType: 'float',
    ...overrides,
  };
}

describe('control panel authoring', () => {
  it('infers control widget kinds from parameter metadata', () => {
    expect(inferControlWidgetInputKind(makeParameter({ valueType: 'bool' }))).toBe('boolean');
    expect(inferControlWidgetInputKind(makeParameter({ valueType: 'float', uiHint: 'slider' }))).toBe('slider');
    expect(
      inferControlWidgetInputKind(
        makeParameter({
          valueKind: 'enum',
          enumOptions: ['a', 'b'],
        }),
      ),
    ).toBe('enum');
    expect(inferControlWidgetInputKind(makeParameter({ valueType: 'float' }))).toBe('number');
    expect(inferControlWidgetInputKind(makeParameter({ valueType: 'string' }))).toBe('text');
  });

  it('creates an empty control panel', () => {
    const created = addEmptyControlPanelToPanels([], 'Live Controls');

    expect(created.panelId).toBe('control-panel');
    expect(created.panels).toEqual([
      {
        id: 'control-panel',
        kind: 'control',
        title: 'Live Controls',
        visible: true,
        previewOnCanvas: false,
        widgets: [],
      },
    ]);
  });

  it('builds a control widget bound directly to node and parameter', () => {
    expect(buildControlWidgetSpec({ nodeId: 'node-a', parameter: makeParameter() })).toEqual({
      id: 'control-widget:node-a:gain',
      kind: 'parameter',
      binding: {
        nodeId: 'node-a',
        parameterName: 'gain',
      },
      label: 'gain',
      inputKind: 'number',
    });
  });

  it('appends a widget to an existing control panel or creates one', () => {
    const widget = buildControlWidgetSpec({ nodeId: 'node-a', parameter: makeParameter() });
    const panels: StudioPanelSpec[] = [
      {
        id: 'panel-a',
        nodeId: 'node-a',
        kind: 'series',
        visible: true,
        previewOnCanvas: false,
      },
      {
        id: 'control-panel-1',
        kind: 'control',
        title: 'Controls',
        visible: true,
        widgets: [],
      },
    ];

    const nextPanels = addControlWidgetToPanels(panels, {
      widget,
      targetPanelId: 'control-panel-1',
    });

    expect(nextPanels).toHaveLength(2);
    expect(nextPanels[1]).toMatchObject({
      id: 'control-panel-1',
      kind: 'control',
      widgets: [widget],
    });

    const createdPanels = addControlWidgetToPanels([panels[0]], {
      widget,
    });

    expect(createdPanels).toHaveLength(2);
    expect(createdPanels[1]).toMatchObject({
      kind: 'control',
      title: 'Controls',
      widgets: [widget],
    });
  });

  it('supports editing and cleanup of control panels and widgets', () => {
    const widgetA = buildControlWidgetSpec({ nodeId: 'node-a', parameter: makeParameter({ name: 'gain' }) });
    const widgetB = buildControlWidgetSpec({ nodeId: 'node-b', parameter: makeParameter({ name: 'mix' }) });
    const panels: StudioPanelSpec[] = [
      {
        id: 'control-panel-1',
        kind: 'control',
        title: 'Controls',
        visible: true,
        widgets: [widgetA, widgetB],
      },
    ];

    const renamedPanels = renameControlPanelTitle(panels, 'control-panel-1', 'Live Controls');
    expect(renamedPanels[0]).toMatchObject({ title: 'Live Controls' });

    const relabeledPanels = updateControlWidgetLabel(panels, 'control-panel-1', widgetA.id, 'Gain Amount');
    expect(relabeledPanels[0]).toMatchObject({
      widgets: [{ ...widgetA, label: 'Gain Amount' }, widgetB],
    });

    const retypedPanels = updateControlWidgetInputKind(panels, 'control-panel-1', widgetA.id, 'text');
    expect(retypedPanels[0]).toMatchObject({
      widgets: [{ ...widgetA, inputKind: 'text' }, widgetB],
    });

    const reorderedPanels = moveControlWidgetInPanel(panels, 'control-panel-1', widgetB.id, 'up');
    expect(reorderedPanels[0]?.kind).toBe('control');
    expect((reorderedPanels[0] as Extract<StudioPanelSpec, { kind: 'control' }>).widgets[0]).toEqual(widgetB);

    const removedPanels = removeControlWidgetFromPanel(panels, 'control-panel-1', widgetA.id);
    expect((removedPanels[0] as Extract<StudioPanelSpec, { kind: 'control' }>).widgets).toEqual([widgetB]);

    const movedPanels = moveControlWidgetToPanel(
      [
        {
          id: 'control-panel-1',
          kind: 'control',
          title: 'Controls',
          visible: true,
          widgets: [widgetA],
        },
        {
          id: 'control-panel-2',
          kind: 'control',
          title: 'Secondary',
          visible: true,
          widgets: [widgetB],
        },
      ],
      {
        sourcePanelId: 'control-panel-1',
        targetPanelId: 'control-panel-2',
        widgetId: widgetA.id,
      },
    );
    expect((movedPanels[0] as Extract<StudioPanelSpec, { kind: 'control' }>).widgets).toEqual([]);
    expect((movedPanels[1] as Extract<StudioPanelSpec, { kind: 'control' }>).widgets).toEqual([widgetB, widgetA]);

    expect(getCompatibleControlWidgetInputKinds(makeParameter({ valueType: 'bool' }))).toEqual(['text', 'boolean']);
    expect(getCompatibleControlWidgetInputKinds(makeParameter({ valueType: 'float' }))).toEqual(['text', 'number', 'slider']);
  });
});
