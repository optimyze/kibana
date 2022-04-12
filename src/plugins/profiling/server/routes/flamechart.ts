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
import {
  Executable,
  FileID,
  StackFrame,
  StackFrameID,
  StackTrace,
  StackTraceID,
} from '../../common/profiling';
import { logExecutionLatency } from './logger';
import { newProjectTimeQuery, ProjectTimeQuery } from './mappings';
import { downsampleEventsRandomly, findDownsampledIndex } from './downsampling';
import { mgetStackTraces, searchStackTraces } from './stacktrace';

function getNumberOfUniqueStacktracesWithoutLeafNode(
  stackTraces: Map<StackTraceID, StackTrace>,
  level: number
): number {
  // Calculate the reduction in lookups that would derive from
  // StackTraces without leaf frame.
  const stackTracesNoLeaf = new Set<string>();
  for (const trace of stackTraces.values()) {
    stackTracesNoLeaf.add(
      JSON.stringify({
        FileID: trace.FileID.slice(level),
        FrameID: trace.FrameID.slice(level),
        Type: trace.Type.slice(level),
      })
    );
  }
  return stackTracesNoLeaf.size;
}

export function parallelMget(
  nQueries: number,
  stackTraceIDs: StackTraceID[],
  chunkSize: number,
  client: ElasticsearchClient
): Array<Promise<any>> {
  const futures: Array<Promise<any>> = [];
  [...Array(nQueries).keys()].forEach((i) => {
    const ids = stackTraceIDs.slice(chunkSize * i, chunkSize * (i + 1));
    futures.push(
      client.mget({
        index: 'profiling-stacktraces',
        ids,
        _source_includes: ['FrameID', 'Type'],
      })
    );
  });

  return futures;
}

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

  // Using filter_path is less readable and scrollSearch seems to be buggy - it
  // applies filter_path only to the first array of results, but not on the following arrays.
  // The downside of `_source` is: it takes 2.5x more time on the ES side (see "took" field).
  // The `composite` keyword skips sorting the buckets as and return results 'as is'.
  // A max bucket size of 100000 needs a cluster level setting "search.max_buckets: 100000".
  const resEvents = await logExecutionLatency(
    logger,
    'query to fetch events from ' + eventsIndex.name,
    async () => {
      return await client.search(
        {
          index: eventsIndex.name,
          size: 0,
          query: filter,
          aggs: {
            group_by: {
              composite: {
                size: 100000, // This is the upper limit of entries per event index.
                sources: [
                  {
                    traceid: {
                      terms: {
                        field: 'StackTraceID',
                      },
                    },
                  },
                ],
              },
              aggs: {
                count: {
                  sum: {
                    field: 'Count',
                  },
                },
              },
            },
            total_count: {
              sum: {
                field: 'Count',
              },
            },
          },
        },
        {
          // Adrien and Dario found out this is a work-around for some bug in 8.1.
          // It reduces the query time by avoiding unneeded searches.
          querystring: {
            pre_filter_shard_size: 1,
            filter_path:
              'aggregations.group_by.buckets.key,aggregations.group_by.buckets.count,aggregations.total_count,_shards.failures',
          },
        }
      );
    }
  );

  let totalCount: number = resEvents.body.aggregations?.total_count.value;
  let stackTraceEvents = new Map<StackTraceID, number>();

  await logExecutionLatency(logger, 'processing events data', async () => {
    resEvents.body.aggregations?.group_by.buckets.forEach((item: any) => {
      const traceid: StackTraceID = item.key.traceid;
      stackTraceEvents.set(traceid, item.count.value);
    });
  });
  logger.info('events total count: ' + totalCount);
  logger.info('unique stacktraces: ' + stackTraceEvents.size);

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

  /*
    logger.info(
    '* unique stacktraces without leaf frame: ' +
      getNumberOfUniqueStacktracesWithoutLeafNode(stackTraces, 1)
  );

  logger.info(
    '* unique stacktraces without 2 leaf frames: ' +
      getNumberOfUniqueStacktracesWithoutLeafNode(stackTraces, 2)
  );
*/

  const resStackFrames = await logExecutionLatency(
    logger,
    'mget query for ' + stackFrameDocIDs.size + ' stackframes',
    async () => {
      return await client.mget({
        index: 'profiling-stackframes',
        ids: [...stackFrameDocIDs],
        realtime: false,
      });
    }
  );

  // Create a lookup map StackFrameID -> StackFrame.
  const stackFrames = new Map<StackFrameID, StackFrame>();
  let framesFound = 0;
  await logExecutionLatency(logger, 'processing data', async () => {
    for (const frame of resStackFrames.body.docs) {
      if (frame.found) {
        stackFrames.set(frame._id, frame._source);
        framesFound++;
      } else {
        stackFrames.set(frame._id, {
          FileName: '',
          FunctionName: '',
          FunctionOffset: 0,
          LineNumber: 0,
          SourceType: 0,
        });
      }
    }
  });
  logger.info('found ' + framesFound + ' / ' + stackFrameDocIDs.size + ' frames');

  const resExecutables = await logExecutionLatency(
    logger,
    'mget query for ' + executableDocIDs.size + ' executables',
    async () => {
      return await client.mget<any>({
        index: 'profiling-executables',
        ids: [...executableDocIDs],
        _source_includes: ['FileName'],
      });
    }
  );

  // Create a lookup map StackFrameID -> StackFrame.
  const executables = new Map<FileID, Executable>();
  await logExecutionLatency(logger, 'processing data', async () => {
    for (const exe of resExecutables.body.docs) {
      if (exe.found) {
        executables.set(exe._id, exe._source);
      } else {
        executables.set(exe._id, {
          FileName: '',
        });
      }
    }
  });

  return new Promise<FlameGraph>((resolve, _) => {
    return resolve(
      new FlameGraph(
        eventsIndex.sampleRate,
        totalCount,
        stackTraceEvents,
        stackTraces,
        stackFrames,
        executables,
        logger
      )
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
        const esClient = context.core.elasticsearch.client.asCurrentUser;
        const filter = newProjectTimeQuery(projectID!, timeFrom!, timeTo!);

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

export function registerFlameChartPixiSearchRoute(
  router: IRouter<DataRequestHandlerContext>,
  logger: Logger
) {
  const paths = getRoutePaths();
  router.get(
    {
      path: paths.FlamechartPixi,
      validate: {
        query: schema.object({
          index: schema.maybe(schema.string()),
          projectID: schema.maybe(schema.string()),
          timeFrom: schema.maybe(schema.string()),
          timeTo: schema.maybe(schema.string()),
          n: schema.maybe(schema.number()),
        }),
      },
    },
    async (context, request, response) => {
      const { index, projectID, timeFrom, timeTo } = request.query;
      const targetSampleSize = 20000; // minimum number of samples to get statistically sound results

      try {
        const esClient = context.core.elasticsearch.client.asCurrentUser;
        const filter = newProjectTimeQuery(projectID!, timeFrom!, timeTo!);

        const flamegraph = await queryFlameGraph(
          logger,
          esClient,
          index!,
          filter,
          targetSampleSize
        );

        return response.ok({
          body: flamegraph.toPixi(),
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
