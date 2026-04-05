import type { PlotImageFrame } from '../model/types';

export type HttpWaterfallSnapshot = {
  sampleType?: string;
  layout: 'waterfall_matrix';
  rows: number;
  columns: number;
  values: Float32Array;
  frequencyBins: number[];
  minValue: number;
  maxValue: number;
  signalName?: string;
  signalUnit?: string;
  axisName?: string;
  axisUnit?: string;
  fftSize?: number;
  numAverages?: number;
  timeSpan: number;
  sampleRateHz: number;
  historyRows?: number;
  window?: string;
  outputInDb?: boolean;
  autoscale?: boolean;
  zMin?: number;
  zMax?: number;
  colorMap?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePositiveInteger(value: unknown, fieldName: string): number {
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`Waterfall snapshot payload ${fieldName} must be a non-negative integer.`);
  }
  return value;
}

function parseRequiredPositiveNumber(value: unknown, fieldName: string): number {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`Waterfall snapshot payload ${fieldName} must be a positive number.`);
  }
  return value;
}

function parseOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Waterfall snapshot payload ${fieldName} must be a positive integer when present.`);
  }
  return value;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error('Waterfall snapshot payload output_in_db must be a boolean when present.');
  }
  return value;
}

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Waterfall snapshot payload ${fieldName} must be a string when present.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalFiniteNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isFiniteNumber(value)) {
    throw new Error(`Waterfall snapshot payload ${fieldName} must be a finite number when present.`);
  }
  return value;
}

function parseOptionalNumberArray(value: unknown, fieldName: string, expectedLength?: number): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`Waterfall snapshot payload ${fieldName} must be an array when present.`);
  }
  const next: number[] = [];
  value.forEach((item, index) => {
    if (!isFiniteNumber(item)) {
      throw new Error(`Waterfall snapshot payload ${fieldName}[${index}] must be a finite number.`);
    }
    next.push(item);
  });
  if (expectedLength !== undefined && next.length !== expectedLength) {
    throw new Error(`Waterfall snapshot payload ${fieldName} must contain ${expectedLength} values.`);
  }
  return next;
}

function resolveExplicitRange(params: {
  primaryMin?: number;
  primaryMax?: number;
  secondaryMin?: number;
  secondaryMax?: number;
  autoscale?: boolean;
  dataMin: number;
  dataMax: number;
}): { minValue: number; maxValue: number } {
  const hasPrimaryRange = params.primaryMin !== undefined || params.primaryMax !== undefined;
  if (hasPrimaryRange) {
    if (params.primaryMin === undefined || params.primaryMax === undefined) {
      throw new Error('Waterfall snapshot payload min_value and max_value must be provided together.');
    }
    if (params.primaryMax < params.primaryMin) {
      throw new Error('Waterfall snapshot payload min_value must be less than max_value.');
    }
    return { minValue: params.primaryMin, maxValue: params.primaryMax };
  }

  const hasSecondaryRange = params.secondaryMin !== undefined || params.secondaryMax !== undefined;
  if (hasSecondaryRange) {
    if (params.secondaryMin === undefined || params.secondaryMax === undefined) {
      throw new Error('Waterfall snapshot payload z_min and z_max must be provided together.');
    }
    if (params.secondaryMax < params.secondaryMin) {
      throw new Error('Waterfall snapshot payload z_min must be less than z_max.');
    }
    if (params.autoscale === false) {
      return { minValue: params.secondaryMin, maxValue: params.secondaryMax };
    }
  }

  if (Number.isFinite(params.dataMin) && Number.isFinite(params.dataMax)) {
    return { minValue: params.dataMin, maxValue: params.dataMax };
  }

  return { minValue: 0, maxValue: 1 };
}

export function parseHttpWaterfallSnapshot(payload: unknown): HttpWaterfallSnapshot {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Waterfall snapshot payload must be an object.');
  }

  const record = payload as Record<string, unknown>;
  if (record.payload_format !== 'waterfall-spectrum-json-v1') {
    throw new Error('Waterfall payload format must be waterfall-spectrum-json-v1.');
  }
  if (record.layout !== 'waterfall_matrix') {
    throw new Error('Waterfall snapshot payload layout must be waterfall_matrix.');
  }

  const rows = parsePositiveInteger(record.rows, 'rows');
  const columns = parsePositiveInteger(record.columns, 'columns');
  const autoscale = parseOptionalBoolean(record.autoscale);
  const zMin = parseOptionalFiniteNumber(record.z_min, 'z_min');
  const zMax = parseOptionalFiniteNumber(record.z_max, 'z_max');
  const explicitMinValue = parseOptionalFiniteNumber(record.min_value, 'min_value');
  const explicitMaxValue = parseOptionalFiniteNumber(record.max_value, 'max_value');
  const sampleRateHz = parseRequiredPositiveNumber(record.sample_rate, 'sample_rate');
  const timeSpan = parseRequiredPositiveNumber(record.time_span, 'time_span');
  const rawData = record.data;
  if (!Array.isArray(rawData)) {
    throw new Error('Waterfall snapshot payload data must be an array.');
  }
  if (rawData.length !== rows) {
    throw new Error('Waterfall snapshot payload rows must match data length.');
  }

  const values = new Float32Array(rows * columns);
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  let offset = 0;

  rawData.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new Error(`Waterfall snapshot payload row ${rowIndex} must be an array.`);
    }
    if (row.length !== columns) {
      throw new Error(`Waterfall snapshot payload row ${rowIndex} must contain ${columns} values.`);
    }
    row.forEach((value, columnIndex) => {
      if (!isFiniteNumber(value)) {
        throw new Error(`Waterfall snapshot payload row ${rowIndex} column ${columnIndex} must be a finite number.`);
      }
      values[offset] = value;
      offset += 1;
      minValue = Math.min(minValue, value);
      maxValue = Math.max(maxValue, value);
    });
  });

  if (rows === 0 || columns === 0 || values.length === 0) {
    minValue = 0;
    maxValue = 1;
  } else if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    minValue = 0;
    maxValue = 1;
  }

  const resolvedRange = resolveExplicitRange({
    primaryMin: explicitMinValue,
    primaryMax: explicitMaxValue,
    secondaryMin: zMin,
    secondaryMax: zMax,
    autoscale,
    dataMin: minValue,
    dataMax: maxValue,
  });

  return {
    sampleType: parseOptionalString(record.sample_type, 'sample_type'),
    layout: 'waterfall_matrix',
    rows,
    columns,
    values,
    frequencyBins:
      parseOptionalNumberArray(record.frequencies, 'frequencies', columns) ??
      Array.from({ length: columns }, (_, index) => index),
    minValue: resolvedRange.minValue,
    maxValue: resolvedRange.maxValue,
    signalName: parseOptionalString(record.signal_name, 'signal_name'),
    signalUnit: parseOptionalString(record.signal_unit, 'signal_unit'),
    axisName: parseOptionalString(record.axis_name, 'axis_name'),
    axisUnit: parseOptionalString(record.axis_unit, 'axis_unit'),
    fftSize: parseOptionalPositiveInteger(record.fft_size, 'fft_size'),
    numAverages: parseOptionalPositiveInteger(record.num_averages, 'num_averages'),
    timeSpan,
    sampleRateHz,
    historyRows: parseOptionalPositiveInteger(record.history_rows, 'history_rows'),
    window: parseOptionalString(record.window, 'window'),
    outputInDb: parseOptionalBoolean(record.output_in_db),
    autoscale,
    zMin,
    zMax,
    colorMap: parseOptionalString(record.color_map, 'color_map'),
  };
}

export function mapWaterfallSnapshotToImage(snapshot: HttpWaterfallSnapshot): PlotImageFrame {
  return {
    width: snapshot.columns,
    height: snapshot.rows,
    values: snapshot.values,
    xAxis: snapshot.frequencyBins,
    minValue: snapshot.minValue,
    maxValue: snapshot.maxValue,
    timeSpan: snapshot.timeSpan,
    sampleType: snapshot.sampleType,
    signalName: snapshot.signalName,
    signalUnit: snapshot.signalUnit,
    axisName: snapshot.axisName ?? 'Frequency',
    axisUnit: snapshot.axisUnit ?? 'Hz',
    colorMap: snapshot.colorMap ?? 'turbo',
  };
}
