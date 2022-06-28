/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { orderBy } from 'lodash';

import {
  AggregationsHistogramAggregate,
  AggregationsHistogramBucket,
} from '@elastic/elasticsearch/lib/api/types';

import { StackFrameMetadata } from './profiling';

export interface TopNSample {
  Timestamp: number;
  Count: number;
  Category: string;
}

export interface TopNSamples {
  TopN: TopNSample[];
}

interface TopNTraces extends TopNSamples {
  Metadata: Record<string, StackFrameMetadata[]>;
}

export function createTopNSamples(histogram: AggregationsHistogramAggregate): TopNSample[] {
  const buckets = new Map();
  const uniqueCategories = new Set<string>();

  const histogramBuckets = (histogram?.buckets as AggregationsHistogramBucket[]) ?? [];
  for (let i = 0; i < histogramBuckets.length; i++) {
    const counts = new Map();
    histogramBuckets[i].group_by.buckets.forEach((item: any) => {
      uniqueCategories.add(item.key);
      counts.set(item.key, item.count.value);
    });
    buckets.set(histogramBuckets[i].key, counts);
  }

  // Normalize samples so there are an equal number of data points per each timestamp
  const samples: TopNSample[] = [];
  for (const timestamp of buckets.keys()) {
    for (const category of uniqueCategories.values()) {
      const sample: TopNSample = { Timestamp: timestamp, Count: 0, Category: category };
      if (buckets.get(timestamp).has(category)) {
        sample.Count = buckets.get(timestamp).get(category);
      }
      samples.push(sample);
    }
  }

  return orderBy(samples, ['Timestamp', 'Count', 'Category'], ['asc', 'desc', 'asc']);
}

export function groupSamplesByCategory(samples: TopNSample[]) {
  const series = new Map();
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!series.has(v.Category)) {
      series.set(v.Category, []);
    }
    const value = series.get(v.Category);
    value.push([v.Timestamp, v.Count]);
  }
  return series;
}
