export type PortDirection = 'input' | 'output';

export type SchemaPort = {
  name: string;
  direction: PortDirection;
  typeName?: string;
  isOptional?: boolean;
  description?: string;
  cardinalityKind: 'fixed' | 'dynamic';
  minPortCount?: number;
  maxPortCount?: number;
};

export type RenderedPortInference = 'authoritative' | 'inferred' | 'collapsed';

export type RenderedPort = {
  key: string;
  direction: PortDirection;
  displayLabel: string;
  portId?: string;
  sourceSchemaName: string;
  cardinalityKind: 'fixed' | 'dynamic';
  inference: RenderedPortInference;
  connectable: boolean;
  typeName?: string;
  isOptional?: boolean;
  description?: string;
};

export type ResolveRenderedPortsInput = {
  schemaPorts: SchemaPort[];
  parameterValues: Record<string, string>;
};

export type ResolveRenderedPortsResult = {
  inputs: RenderedPort[];
  outputs: RenderedPort[];
};
