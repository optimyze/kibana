/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { schema } from '@kbn/config-schema';
import type { ElasticsearchClient, IRouter, Logger } from 'kibana/server';
import type { DataRequestHandlerContext } from '../../../data/server';
import { getRoutePaths } from '../../common';
import { FlameGraph } from '../../common/flamegraph';
import { logExecutionLatency } from './logger';
import { createProjectTimeQuery, ProjectTimeQuery } from './query';
import { downsampleEventsRandomly, findDownsampledIndex } from './downsampling';
import {
  mgetExecutables,
  mgetStackFrames,
  mgetStackTraces,
  searchEventsGroupByStackTrace,
  searchStackTraces,
} from './stacktrace';
import { getClient } from './compat';

async function queryFlameGraph(
  logger: Logger,
  client: ElasticsearchClient,
  index: string,
  filter: ProjectTimeQuery,
  sampleSize: number
): Promise<FlameGraph> {
  const testing = index === 'profiling-events2';
  if (testing) {
    index = 'profiling-events-all';
  }

  const eventsIndex = await logExecutionLatency(
    logger,
    'query to find downsampled index',
    async () => {
      return await findDownsampledIndex(logger, client, index, filter, sampleSize);
    }
  );

  let { totalCount, stackTraceEvents } = await searchEventsGroupByStackTrace(
    logger,
    client,
    eventsIndex,
    filter
  );

  // Manual downsampling if totalCount exceeds sampleSize by 10%.
  if (totalCount > sampleSize * 1.1) {
    const p = sampleSize / totalCount;
    logger.info('downsampling events with p=' + p);
    await logExecutionLatency(logger, 'downsampling events', async () => {
      totalCount = downsampleEventsRandomly(stackTraceEvents, p, filter.toString());
    });
    logger.info('downsampled total count: ' + totalCount);
    logger.info('unique downsampled stacktraces: ' + stackTraceEvents.size);
  }

  // profiling-stacktraces is configured with 16 shards
  const { stackTraces, stackFrameDocIDs, executableDocIDs } = testing
    ? await searchStackTraces(logger, client, stackTraceEvents)
    : await mgetStackTraces(logger, client, stackTraceEvents);

  return Promise.all([
    mgetStackFrames(logger, client, stackFrameDocIDs),
    mgetExecutables(logger, client, executableDocIDs),
  ]).then(([stackFrames, executables]) => {
    return new FlameGraph(
      eventsIndex.sampleRate,
      totalCount,
      stackTraceEvents,
      stackTraces,
      stackFrames,
      executables
    );
  });
}

export function registerFlameChartElasticSearchRoute(
  router: IRouter<DataRequestHandlerContext>,
  logger: Logger
) {
  const paths = getRoutePaths();
  router.get(
    {
      path: paths.FlamechartElastic,
      validate: {
        query: schema.object({
          index: schema.maybe(schema.string()),
          projectID: schema.maybe(schema.string()),
          timeFrom: schema.maybe(schema.string()),
          timeTo: schema.maybe(schema.string()),
          n: schema.maybe(schema.number({ defaultValue: 200 })),
        }),
      },
    },
    async (context, request, response) => {
      const { index, projectID, timeFrom, timeTo } = request.query;
      const targetSampleSize = 20000; // minimum number of samples to get statistically sound results

      try {
        const esClient = await getClient(context);
        const filter = createProjectTimeQuery(projectID!, timeFrom!, timeTo!);

        const flamegraph = await queryFlameGraph(
          logger,
          esClient,
          index!,
          filter,
          targetSampleSize
        );
        logger.info('returning payload response to client');

        return response.ok({
          body: flamegraph.toElastic(),
        });
      } catch (e) {
        logger.error('Caught exception when fetching Flamegraph data: ' + e.message);
        return response.customError({
          statusCode: e.statusCode ?? 500,
          body: {
            message: e.message,
          },
        });
      }
    }
  );
}
