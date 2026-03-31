// StudioPanelSpec describes one panel definition (what exists).
// It is panel identity + source + display intent, independent of arrangement.
export type StudioPanelKind = 'series' | 'series2d' | 'image' | 'audio' | 'control';

export type StudioPlotPaletteRef = {
  kind: 'builtin' | 'studio';
  id: string;
};

export type StudioPlotCustomPalette = {
  kind: 'custom';
  colors: string[];
};

export type StudioPlotPalette = StudioPlotPaletteRef | StudioPlotCustomPalette;

export type StudioPlotStyleConfig = {
  assignmentMode?: 'byIndex';
  palette?: StudioPlotPalette;
};

export type StudioPlotPaletteSpec = {
  id: string;
  colors: string[];
};

export type StudioControlWidgetBinding = {
  nodeId: string;
  parameterName: string;
};

export type StudioControlWidgetInputKind = 'text' | 'number' | 'slider' | 'boolean' | 'enum';

export type StudioControlWidgetSpec = {
  id: string;
  kind: 'parameter';
  binding: StudioControlWidgetBinding;
  label?: string;
  inputKind: StudioControlWidgetInputKind;
  enumOptions?: string[];
  enumLabels?: Record<string, string>;
  mode?: 'staged' | 'immediate';
};

export type StudioControlPanelSpec = {
  id: string;
  kind: 'control';
  title?: string;
  visible: boolean;
  previewOnCanvas?: false;
  nodeId?: string;
  plotStyle?: StudioPlotStyleConfig;
  widgets: StudioControlWidgetSpec[];
};

export type StudioDataPanelSpec = {
  id: string;
  nodeId: string;
  kind: Exclude<StudioPanelKind, 'control'>;
  title?: string;
  visible: boolean;
  previewOnCanvas: boolean;
  plotStyle?: StudioPlotStyleConfig;
};

export type StudioPanelSpec = StudioDataPanelSpec | StudioControlPanelSpec;

export type StudioLayoutNode =
  | {
      kind: 'pane';
      panelId: string;
    }
  | {
      kind: 'split';
      direction: 'row' | 'column';
      children: StudioLayoutNode[];
      sizes?: number[];
    };

// StudioLayoutSpec describes arrangement only (how panels are placed together)
// using a split tree.
export type StudioLayoutSpec = {
  version: 2;
  root: StudioLayoutNode;
  activePanelId?: string;
};

export type StudioWorkspaceMetadata = {
  panels: StudioPanelSpec[];
  layout?: StudioLayoutSpec;
  plotPalettes?: StudioPlotPaletteSpec[];
};

// ApplicationSpec describes runtime application presentation intent.
// It is separate from panel definitions and layout arrangement.
export type ApplicationMode = 'in_app' | 'new_tab' | 'popout' | 'external';
export type ApplicationRenderer = 'react' | 'webgl' | 'imgui' | 'custom';

export type ApplicationSpec = {
  mode: ApplicationMode;
  renderer: ApplicationRenderer;
  title?: string;
};
