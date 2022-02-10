/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { schema } from '@kbn/config-schema';
import type { IRouter } from 'kibana/server';
import {
  AggregationsHistogramBucket,
  AggregationsMultiBucketAggregateBase,
} from '@elastic/elasticsearch/lib/api/types';
import type { DataRequestHandlerContext } from '../../../data/server';
import { getRemoteRoutePaths } from '../../common';

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
          index: schema.maybe(schema.string()),
          projectID: schema.maybe(schema.string()),
          timeFrom: schema.maybe(schema.string()),
          timeTo: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      const { index, projectID, timeFrom, timeTo } = request.query;

      try {
        const esClient = context.core.elasticsearch.client.asCurrentUser;
        const resTopNStackTraces = await esClient.search(
          {
            index,
            body: {
              query: {
                bool: {
                  must: [
                    {
                      term: {
                        ProjectID: {
                          value: projectID!,
                          boost: 1.0,
                        },
                      },
                    },
                    {
                      range: {
                        '@timestamp': {
                          gte: timeFrom,
                          lt: timeTo,
                          format: 'epoch_second',
                          boost: 1.0,
                        },
                      },
                    },
                  ],
                },
              },
              aggs: {
                histogram: {
                  auto_date_histogram: {
                    field: '@timestamp',
                    buckets: 100,
                  },
                  aggs: {
                    group_by: {
                      terms: {
                        field: searchField,
                        order: {
                          Count: 'desc',
                        },
                        size: 100,
                      },
                      aggs: {
                        Count: {
                          sum: {
                            field: 'Count',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          {}
        );

        if (searchField === 'StackTraceID') {
          const docIDs: string[] = [];
          const autoDateHistogram = resTopNStackTraces.body.aggregations
            ?.histogram as AggregationsMultiBucketAggregateBase<AggregationsHistogramBucket>;

          autoDateHistogram.buckets?.forEach((timeInterval: any) => {
            timeInterval.group_by.buckets.forEach((stackTraceItem: any) => {
              docIDs.push(stackTraceItem.key);
            });
          });

          const resTraceMetadata = await esClient.mget<any>({
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
