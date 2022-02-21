/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { TopNAggregateResponse, TopNHistogramBucket, TopNItemCountAggregation } from './types';

export const PLUGIN_ID = 'profiling';
export const PLUGIN_NAME = 'profiling';

const BASE_ROUTE_PATH = '/api/prodfiler';

const BASE_LOCAL_ROUTE_PATH = `${BASE_ROUTE_PATH}/v1`;
const BASE_REMOTE_ROUTE_PATH = `${BASE_ROUTE_PATH}/v2`;

export function getLocalRoutePaths() {
  return {
    TopN: `${BASE_LOCAL_ROUTE_PATH}/topn`,
    TopNContainers: `${BASE_LOCAL_ROUTE_PATH}/topn/containers`,
    TopNDeployments: `${BASE_LOCAL_ROUTE_PATH}/topn/deployments`,
    TopNHosts: `${BASE_LOCAL_ROUTE_PATH}/topn/hosts`,
    TopNThreads: `${BASE_LOCAL_ROUTE_PATH}/topn/threads`,
    TopNTraces: `${BASE_LOCAL_ROUTE_PATH}/topn/traces`,
    FlamechartElastic: `${BASE_LOCAL_ROUTE_PATH}/flamechart/elastic`,
    FlamechartPixi: `${BASE_LOCAL_ROUTE_PATH}/flamechart/pixi`,
  };
}

export function getRemoteRoutePaths() {
  return {
    TopN: `${BASE_REMOTE_ROUTE_PATH}/topn`,
    TopNContainers: `${BASE_REMOTE_ROUTE_PATH}/topn/containers`,
    TopNDeployments: `${BASE_REMOTE_ROUTE_PATH}/topn/deployments`,
    TopNHosts: `${BASE_REMOTE_ROUTE_PATH}/topn/hosts`,
    TopNThreads: `${BASE_REMOTE_ROUTE_PATH}/topn/threads`,
    TopNTraces: `${BASE_REMOTE_ROUTE_PATH}/topn/traces`,
    FlamechartElastic: `${BASE_REMOTE_ROUTE_PATH}/flamechart/elastic`,
    FlamechartPixi: `${BASE_REMOTE_ROUTE_PATH}/flamechart/pixi`,
  };
}

function toMilliseconds(seconds: string): number {
  return parseInt(seconds, 10) * 1000;
}

export interface TopNDisplayData {
  x: number | string;
  y: number | string;
  g: number | string;
}

export function getTopNDisplayData(esResp: TopNAggregateResponse): TopNDisplayData[] {
  const data: TopNDisplayData[] = [];
  // needed for data served from Elasticsearch
  esResp.topN.histogram.buckets.forEach((timeBucket: TopNHistogramBucket) => {
    timeBucket.group_by.buckets.forEach((stacktraceBucket: TopNItemCountAggregation) => {
      data.push({
        x: timeBucket.key,
        y: stacktraceBucket.Count.value as number,
        g: stacktraceBucket.key,
      });
    });
  });

  return data;
}
// FIXME remove this in favor of getTopNDisplayData when fixtures are not needed anymore
export function getTopN(obj): TopNDisplayData[] {
  const data: TopNDisplayData[] = [];

  // This is where we are fed the fixtures
  if (obj.TopN!) {
    // needed for data served from fixtures
    for (const x in obj.TopN) {
      if (obj.TopN.hasOwnProperty(x)) {
        const values = obj.TopN[x];
        for (let i = 0; i < values.length; i++) {
          const v = values[i];
          data.push({ x: toMilliseconds(x), y: v.Count, g: v.Value });
        }
      }
    }
    return data;
  } else {
    return getTopNDisplayData(obj);
  }
}

export function groupSamplesByCategory(samples: TopNDisplayData[]) {
  const series = new Map();
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!series.has(v.g)) {
      series.set(v.g, []);
    }
    const value = series.get(v.g);
    value.push([v.x, v.y]);
  }
  return series;
}

export function timeRangeFromRequest(request: any): [number, number] {
  const timeFrom = parseInt(request.query.timeFrom!, 10);
  const timeTo = parseInt(request.query.timeTo!, 10);
  return [timeFrom, timeTo];
}
