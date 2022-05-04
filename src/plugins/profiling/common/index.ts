/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
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
    FlamechartPixi: `${BASE_LOCAL_ROUTE_PATH}/flamechart/pixi`
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
    FlamechartPixi: `${BASE_REMOTE_ROUTE_PATH}/flamechart/pixi`
  };
}

export function getTopN(obj) {
  const data = [];
  for (let i = 0; i < obj.topN.histogram.buckets.length; i++) {
    const bucket = obj.topN.histogram.buckets[i];
    for (let j = 0; j < bucket.group_by.buckets.length; j++) {
      const v = bucket.group_by.buckets[j];
      if(typeof v.key === 'string') {
        data.push({x: bucket.key, y: v.Count.value, g: v.key});
      } else {
        data.push({x: bucket.key, y: v.Count.value, g: v.key_as_string});
      }

    }
  }
  return data;
}

export function groupSamplesByCategory(samples) {
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
