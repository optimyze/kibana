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

export interface CountPerTime {
  Timestamp: number;
  Count: number;
}

export interface TopNSample extends CountPerTime {
  Category: string;
}

export interface TopNSamples {
  TopN: TopNSample[];
}

interface TopNTraces extends TopNSamples {
  Metadata: Record<string, StackFrameMetadata[]>;
}

export function createTopNSamples(histogram: AggregationsHistogramAggregate): TopNSample[] {
  const bucketsByTimestamp = new Map();
  const uniqueCategories = new Set<string>();

  // Convert the histogram into nested maps and record the unique categories
  const histogramBuckets = (histogram?.buckets as AggregationsHistogramBucket[]) ?? [];
  for (let i = 0; i < histogramBuckets.length; i++) {
    const frameCountsByCategory = new Map();
    const items = histogramBuckets[i].group_by.buckets;
    for (let j = 0; j < items.length; j++) {
      uniqueCategories.add(items[j].key);
      frameCountsByCategory.set(items[j].key, items[j].count.value);
    }
    bucketsByTimestamp.set(histogramBuckets[i].key, frameCountsByCategory);
  }

  // Normalize samples so there are an equal number of data points per each timestamp
  const samples: TopNSample[] = [];
  for (const timestamp of bucketsByTimestamp.keys()) {
    for (const category of uniqueCategories.values()) {
      const frameCountsByCategory = bucketsByTimestamp.get(timestamp);
      const sample: TopNSample = {
        Timestamp: timestamp,
        Count: frameCountsByCategory.get(category) ?? 0,
        Category: category,
      };
      samples.push(sample);
    }
  }

  return orderBy(samples, ['Timestamp', 'Count', 'Category'], ['asc', 'desc', 'asc']);
}

export interface TopNSubchart {
  Category: string;
  Percentage: number;
  Series: CountPerTime[];
}

export function groupSamplesByCategory(samples: TopNSample[]): TopNSubchart[] {
  let total = 0;
  const totalPerCategory = new Map<string, number>();
  const seriesByCategory = new Map<string, CountPerTime[]>();

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (!seriesByCategory.has(sample.Category)) {
      seriesByCategory.set(sample.Category, []);
      totalPerCategory.set(sample.Category, 0);
    }
    total += sample.Count;
    totalPerCategory.set(sample.Category, totalPerCategory.get(sample.Category)! + sample.Count);
    const series = seriesByCategory.get(sample.Category)!;
    series.push({ Timestamp: sample.Timestamp, Count: sample.Count });
  }

  const subcharts: TopNSubchart[] = [];
  for (const [category, series] of seriesByCategory) {
    subcharts.push({
      Category: category,
      Percentage: (totalPerCategory.get(category)! / total) * 100,
      Series: series,
    });
  }

  return orderBy(subcharts, ['Percentage', 'Category'], ['desc', 'asc']);
}
