/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// eslint-disable-next-line max-classes-per-file
import { escape } from 'lodash';
import { i18n } from '@kbn/i18n';
import { IField, IVectorSource } from '../../../maps/public';
import { FIELD_ORIGIN } from '../../../maps/common';
import { TileMetaFeature } from '../../../maps/common/descriptor_types';
import { AnomalySource } from './anomaly_source';
import { ITooltipProperty } from '../../../maps/public';
import { Filter } from '../../../../../src/plugins/data/public';

export const ANOMALY_SOURCE_FIELDS: Record<string, Record<string, string>> = {
  record_score: {
    label: i18n.translate('xpack.ml.maps.anomalyLayerRecordScoreLabel', {
      defaultMessage: 'Record score',
    }),
    type: 'number',
  },
  timestamp: {
    label: i18n.translate('xpack.ml.maps.anomalyLayerTimeStampLabel', {
      defaultMessage: 'Time',
    }),
    type: 'string',
  },
  fieldName: {
    label: i18n.translate('xpack.ml.maps.anomalyLayerFieldNameLabel', {
      defaultMessage: 'Field name',
    }),
    type: 'string',
  },
  functionDescription: {
    label: i18n.translate('xpack.ml.maps.anomalyLayerFunctionDescriptionLabel', {
      defaultMessage: 'Function',
    }),
    type: 'string',
  },
  actualDisplay: {
    label: i18n.translate('xpack.ml.maps.anomalyLayerActualLabel', {
      defaultMessage: 'Actual',
    }),
    type: 'string',
  },
  typicalDisplay: {
    label: i18n.translate('xpack.ml.maps.anomalyLayerTypicalLabel', {
      defaultMessage: 'Typical',
    }),
    type: 'string',
  },
};

export class AnomalySourceTooltipProperty implements ITooltipProperty {
  constructor(private readonly _label: string, private readonly _value: string) {}

  async getESFilters(): Promise<Filter[]> {
    return [];
  }

  getHtmlDisplayValue(): string {
    return this._value.toString();
  }

  getPropertyKey(): string {
    return this._label;
  }

  getPropertyName(): string {
    return this._label;
  }

  getRawValue(): string | string[] | undefined {
    return this._value.toString();
  }

  isFilterable(): boolean {
    return false;
  }
}

// this needs to be generic so it works for all fields in anomaly record result
export class AnomalySourceField implements IField {
  private readonly _source: AnomalySource;
  private readonly _field: string;

  constructor({ source, field }: { source: AnomalySource; field: string }) {
    this._source = source;
    this._field = field;
  }

  async createTooltipProperty(value: string | string[] | undefined): Promise<ITooltipProperty> {
    return new AnomalySourceTooltipProperty(
      await this.getLabel(),
      escape(Array.isArray(value) ? value.join() : value ? value : '')
    );
  }

  async getDataType(): Promise<string> {
    return ANOMALY_SOURCE_FIELDS[this._field].type;
  }

  async getLabel(): Promise<string> {
    return ANOMALY_SOURCE_FIELDS[this._field].label;
  }

  getName(): string {
    return this._field;
  }

  getMbFieldName(): string {
    return this.getName();
  }

  getOrigin(): FIELD_ORIGIN {
    return FIELD_ORIGIN.SOURCE;
  }

  getRootName(): string {
    return this.getName();
  }

  getSource(): IVectorSource {
    return this._source;
  }

  isEqual(field: IField): boolean {
    return this.getName() === field.getName();
  }

  isValid(): boolean {
    return true;
  }

  supportsFieldMetaFromLocalData(): boolean {
    return true;
  }

  supportsFieldMetaFromEs(): boolean {
    return false;
  }

  canValueBeFormatted(): boolean {
    return false;
  }

  async getExtendedStatsFieldMetaRequest(): Promise<unknown> {
    return null;
  }

  async getPercentilesFieldMetaRequest(percentiles: number[]): Promise<unknown> {
    return null;
  }

  async getCategoricalFieldMetaRequest(size: number): Promise<unknown> {
    return null;
  }

  pluckRangeFromTileMetaFeature(metaFeature: TileMetaFeature): { min: number; max: number } | null {
    return null;
  }

  isCount(): boolean {
    return false;
  }
}
