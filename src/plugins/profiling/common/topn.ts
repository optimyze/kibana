/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import {
  AggregationsHistogramAggregate,
  AggregationsHistogramBucket,
} from '@elastic/elasticsearch/lib/api/types';

import { StackFrameMetadata } from './profiling';

export type TopNSample = {
  Timestamp: number;
  Count: number;
  Category: string;
};

export type TopNSamples = {
  TopN: TopNSample[];
};

type TopNContainers = TopNSamples;
type TopNDeployments = TopNSamples;
type TopNHosts = TopNSamples;
type TopNThreads = TopNSamples;

type TopNTraces = TopNSamples & {
  Metadata: Record<string, StackFrameMetadata[]>;
};

type TopN = TopNContainers | TopNDeployments | TopNHosts | TopNThreads | TopNTraces;

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

  // Sort by timestamp ascending, count descending, and category ascending
  samples.sort((a, b) => {
    if (a.Timestamp < b.Timestamp) return -1;
    if (a.Timestamp > b.Timestamp) return 1;
    if (a.Count > b.Count) return -1;
    if (a.Count < b.Count) return 1;
    return a.Category.localeCompare(b.Category);
  });

  return samples;
}
