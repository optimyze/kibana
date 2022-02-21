/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import {
  AggregationsHistogramBucketKeys,
  AggregationsMultiBucketAggregateBase,
  AggregationsStringTermsBucket,
  AggregationsSumAggregate,
  AggregationsTermsAggregateBase,
} from '@elastic/elasticsearch/lib/api/types';
import { IKibanaSearchRequest, IKibanaSearchResponse } from '../../data/common';

export interface TopNAggregateResponse {
  topN: {
    histogram: TopNHistogramAggregation;
  };
}

export declare type TopNHistogramBucket = AggregationsHistogramBucketKeys & {
  group_by: AggregationsTermsAggregateBase<AggregationsStringTermsBucket>;
};

export declare type TopNHistogramAggregation =
  AggregationsMultiBucketAggregateBase<TopNHistogramBucket>;

export declare type TopNItemCountAggregation = AggregationsStringTermsBucket & {
  Count: AggregationsSumAggregate;
};

// Types for the custom search strategy implementing downsampling
export const DOWNSAMPLED_TOPN_STRATEGY = 'downsampledTopN';

export type DownsampledRequest = IKibanaSearchRequest<{
  projectID: number;
  timeFrom: number;
  timeTo: number;
  topNItems: number;
  searchField: string;
}>;

export type DownsampledTopNResponse = IKibanaSearchResponse<{
  aggregations: {
    histogram: TopNHistogramAggregation;
  };
}>;
