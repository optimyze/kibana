/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { AggregationsHistogramAggregate, AggregationsHistogramBucket } from '@elastic/elasticsearch/lib/api/types';

import { StackFrameMetadata } from "./profiling"

type TopNBucket = {
    Value: string;
    Count: number;
}

type TopNBucketsByDate = {
    TopN: Record<number, TopNBucket[]>;
}

type TopNContainers = TopNBucketsByDate;
type TopNDeployments = TopNBucketsByDate;
type TopNHosts = TopNBucketsByDate;
type TopNThreads = TopNBucketsByDate;

type TopNTraces = TopNBucketsByDate & {
    Metadata: Record<string, StackFrameMetadata[]>;
}

type TopN = TopNContainers | TopNDeployments | TopNHosts | TopNThreads | TopNTraces;

export function createTopNBucketsByDate(histogram: AggregationsHistogramAggregate): TopNBucketsByDate {
    const topNBucketsByDate: Record<number, TopNBucket[]> = {};

    histogram.buckets.values
    histogram.buckets.forEach(
        (bucket: AggregationsHistogramBucket) => {
            const key = bucket.key / 1000;
            topNBucketsByDate[key] = [];
            bucket.group_by.buckets.forEach((item: any) => {
                topNBucketsByDate[key].push({
                    Value: item.key,
                    Count: item.count.value,
                });
            });
        }
    );

    return { TopN: topNBucketsByDate };
}
