/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { schema } from '@kbn/config-schema';
import type { IRouter, KibanaResponseFactory } from 'kibana/server';
import type { DataRequestHandlerContext } from '../../../data/server';
import { getRemoteRoutePaths } from '../../common';
import { autoHistogramSumCountOnGroupByField, newProjectTimeQuery } from './mappings';
import {
  TopNHistogramAggregation,
  TopNHistogramBucket,
  TopNItemCountAggregation,
} from '../../common/types';

export async function topNElasticSearchQuery(
  context: DataRequestHandlerContext,
  index: string,
  projectID: string,
  timeFrom: string,
  timeTo: string,
  topNItems: number,
  searchField: string,
  response: KibanaResponseFactory
) {
  const esClient = context.core.elasticsearch.client.asCurrentUser;
  const resTopNStackTraces = await esClient.search({
    index,
    body: {
      query: newProjectTimeQuery(projectID, timeFrom, timeTo),
      aggs: {
        histogram: autoHistogramSumCountOnGroupByField(searchField, topNItems),
      },
    },
  });

  if (searchField === 'StackTraceID') {
    const docIDs: string[] = [];
    (resTopNStackTraces.body.aggregations?.histogram as TopNHistogramAggregation).buckets.forEach(
      (timeInterval: TopNHistogramBucket) => {
        timeInterval.group_by.buckets.forEach((stackTraceItem: TopNItemCountAggregation) => {
          docIDs.push(stackTraceItem.key);
        });
      }
    );

    const resTraceMetadata = await esClient.mget({
      index: 'profiling-stacktraces',
      body: { ids: docIDs },
    });

    return response.ok({
      body: {
        topN: resTopNStackTraces.body.aggregations,
        traceMetadata: resTraceMetadata.body.docs,
      },
    });
  } else {
    return response.ok({
      body: {
        topN: resTopNStackTraces.body.aggregations,
      },
    });
  }
}

export function queryTopNCommon(
  router: IRouter<DataRequestHandlerContext>,
  pathName: string,
  searchField: string
) {
  router.get(
    {
      path: pathName,
      validate: {
        query: schema.object({
          index: schema.string(),
          projectID: schema.string(),
          timeFrom: schema.string(),
          timeTo: schema.string(),
          n: schema.number({ defaultValue: 100 }),
        }),
      },
    },
    async (context, request, response) => {
      const { index, projectID, timeFrom, timeTo, n } = request.query;

      try {
        return await topNElasticSearchQuery(
          context,
          index,
          projectID,
          timeFrom,
          timeTo,
          n,
          searchField,
          response
        );
      } catch (e) {
        return response.customError({
          statusCode: e.statusCode ?? 500,
          body: {
            message: 'Profiling TopN request failed: ' + e.message + '; full error ' + e.toString(),
          },
        });
      }
    }
  );
}

// TODO
// register a strategy for TopN and flamegraph with the request parameters and query (optionally),
// the strategy needs to be registered at Plugin.start using the dependencies.
// Then use the strategy in context.search

export function registerTraceEventsTopNContainersSearchRoute(
  router: IRouter<DataRequestHandlerContext>
) {
  const paths = getRemoteRoutePaths();
  return queryTopNCommon(router, paths.TopNContainers, 'ContainerName');
}

export function registerTraceEventsTopNDeploymentsSearchRoute(
  router: IRouter<DataRequestHandlerContext>
) {
  const paths = getRemoteRoutePaths();
  return queryTopNCommon(router, paths.TopNDeployments, 'PodName');
}

export function registerTraceEventsTopNHostsSearchRoute(
  router: IRouter<DataRequestHandlerContext>
) {
  const paths = getRemoteRoutePaths();
  return queryTopNCommon(router, paths.TopNHosts, 'HostID');
}

export function registerTraceEventsTopNStackTracesSearchRoute(
  router: IRouter<DataRequestHandlerContext>
) {
  const paths = getRemoteRoutePaths();
  return queryTopNCommon(router, paths.TopNTraces, 'StackTraceID');
}

export function registerTraceEventsTopNThreadsSearchRoute(
  router: IRouter<DataRequestHandlerContext>
) {
  const paths = getRemoteRoutePaths();
  return queryTopNCommon(router, paths.TopNThreads, 'ThreadName');
}
