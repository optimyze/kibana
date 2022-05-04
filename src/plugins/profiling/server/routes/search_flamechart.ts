/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { schema } from '@kbn/config-schema';
import type { ElasticsearchClient, IRouter, Logger } from 'kibana/server';
import seedrandom from 'seedrandom';
import type { DataRequestHandlerContext } from '../../../data/server';
import { getRemoteRoutePaths } from '../../common';
import { FlameGraph } from '../../common/flamegraph';
import {
  Executable,
  FileID,
  StackFrame,
  StackFrameID,
  StackTrace,
  StackTraceID,
} from '../../common/profiling';
import { newProjectTimeQuery, ProjectTimeQuery } from './mappings';

export interface DownsampledEventsIndex {
  name: string;
  sampleRate: number;
}

async function logExecutionLatency<T>(
  logger: Logger,
  activity: string,
  func: () => Promise<T>
): Promise<T> {
  const start = new Date().getTime();
  return await func().then((res) => {
    logger.info(activity + ' took ' + (new Date().getTime() - start) + 'ms');
    return res;
  });
}

// convertFrameIDToFileID extracts the FileID from the FrameID and returns as base64url string.
export function extractFileIDFromFrameID(frameID: string): string {
  // Step 1: Convert the base64-encoded frameID to an array of 22 bytes.
  // We use 'base64url' instead of 'base64' because frameID is encoded URL-friendly.
  // The first 16 bytes contain the FileID.
  const buf = Buffer.from(frameID, 'base64url');

  // Convert the FileID bytes into base64 with URL-friendly encoding.
  // We have to manually append '==' since we use the FileID string for
  // comparing / looking up the FileID strings in the ES indices, which have
  // the '==' appended.
  // We may want to remove '==' in the future to reduce the uncompressed storage size by 10%.
  return buf.toString('base64url', 0, 16) + '==';
}

// extractFileIDArrayFromFrameIDArray extracts all FileIDs from the array of FrameIDs
// and returns them as an array of base64url encoded strings. The order of this array
// corresponds to the order of the input array.
function extractFileIDArrayFromFrameIDArray(frameIDs: string[]): string[] {
  const fileIDs = Array<string>(frameIDs.length);
  for (let i = 0; i < frameIDs.length; i++) {
    fileIDs[i] = extractFileIDFromFrameID(frameIDs[i]);
  }
  return fileIDs;
}

// Return the index that has between targetSampleSize..targetSampleSize*samplingFactor entries.
// The starting point is the number of entries from the profiling-events-5pow<initialExp> index.
//
// More details on how the down-sampling works can be found at the write path
//   https://github.com/elastic/prodfiler/blob/bdcc2711c6cd7e89d63b58a17329fb9fdbabe008/pf-elastic-collector/elastic.go
export function getSampledTraceEventsIndex(
  index: string,
  targetSampleSize: number,
  sampleCountFromInitialExp: number,
  initialExp: number
): DownsampledEventsIndex {
  const maxExp = 11;
  const samplingFactor = 5;
  const fullEventsIndex: DownsampledEventsIndex = { name: index, sampleRate: 1 };
  const downsampledIndexPrefix =
    (index.endsWith('-all') ? index.replaceAll('-all', '') : index) + '-5pow';
  const downsampledIndex = (i: number): string => {
    return downsampledIndexPrefix + i.toString().padStart(2, '0');
  };

  if (sampleCountFromInitialExp === 0) {
    // Take the shortcut to the full events index.
    return fullEventsIndex;
  }

  if (sampleCountFromInitialExp >= samplingFactor * targetSampleSize) {
    // Search in more down-sampled indexes.
    for (let i = initialExp + 1; i <= maxExp; i++) {
      sampleCountFromInitialExp /= samplingFactor;
      if (sampleCountFromInitialExp < samplingFactor * targetSampleSize) {
        return { name: downsampledIndex(i), sampleRate: 1 / samplingFactor ** i };
      }
    }
    // If we come here, it means that the most sparse index still holds too many items.
    // The only problem is the query time, the result set is good.
    return { name: downsampledIndex(11), sampleRate: 1 / samplingFactor ** maxExp };
  } else if (sampleCountFromInitialExp < targetSampleSize) {
    // Search in less down-sampled indexes.
    for (let i = initialExp - 1; i >= 1; i--) {
      sampleCountFromInitialExp *= samplingFactor;
      if (sampleCountFromInitialExp >= targetSampleSize) {
        return {
          name: downsampledIndex(i),
          sampleRate: 1 / samplingFactor ** i,
        };
      }
    }

    return fullEventsIndex;
  }

  return {
    name: downsampledIndex(initialExp),
    sampleRate: 1 / samplingFactor ** initialExp,
  };
}

function downsampleEventsRandomly(
  stackTraceEvents: Map<StackTraceID, number>,
  p: number,
  seed: string
): number {
  let totalCount = 0;

  // Make the RNG predictable to get reproducible results.
  const random = seedrandom(seed);

  for (const [id, count] of stackTraceEvents) {
    let newCount = 0;
    for (let i = 0; i < count; i++) {
      if (random() < p) {
        newCount++;
      }
    }
    if (newCount) {
      stackTraceEvents.set(id, newCount);
      totalCount += newCount;
    } else {
      stackTraceEvents.delete(id);
    }
  }

  return totalCount;
}

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

async function queryFlameGraph(
  logger: Logger,
  client: ElasticsearchClient,
  index: string,
  filter: ProjectTimeQuery,
  sampleSize: number
): Promise<FlameGraph> {
  // Start with counting the results in the index down-sampled by 5^6.
  // That is in the middle of our down-sampled indexes.
  const initialExp = 6;
  const testing = index === 'profiling-events2';
  const downsampledIndexPrefix =
    (index.endsWith('-all') ? index.replaceAll('-all', '') : index) + '-5pow';
  const initialDownsampledIndex = downsampledIndexPrefix + initialExp.toString().padStart(2, '0');

  const eventsIndex = await logExecutionLatency(
    logger,
    'query to find downsampled index',
    async () => {
      let sampleCountFromInitialExp = 0;
      try {
        const resp = await client.search({
          index: initialDownsampledIndex,
          body: {
            query: filter,
            size: 0,
            track_total_hits: true,
          },
        });
        sampleCountFromInitialExp = resp.body.hits.total?.value as number;
      } catch (e) {
        logger.info(e.message);
      }

      logger.info('sampleCountFromPow6 ' + sampleCountFromInitialExp);
      return getSampledTraceEventsIndex(index, sampleSize, sampleCountFromInitialExp, initialExp);
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
      return await client.search({
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
              sum_count: {
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
      });
    }
  );

  let totalCount: number = resEvents.body.aggregations?.total_count.value;

  const stackTraceEvents = new Map<StackTraceID, number>();
  resEvents.body.aggregations?.group_by.buckets.forEach((item: any) => {
    const traceid: StackTraceID = item.key.traceid;
    stackTraceEvents.set(traceid, item.sum_count.value);
  });
  logger.info('events total count: ' + totalCount);
  logger.info('unique stacktraces: ' + stackTraceEvents.size);

  // Manual downsampling if totalCount exceeds sampleSize by 10%.
  if (totalCount > sampleSize * 1.1) {
    const p = sampleSize / totalCount;
    logger.info('downsampling events with p=' + p);
    totalCount = downsampleEventsRandomly(stackTraceEvents, p, filter.toString());
    logger.info('downsampled total count: ' + totalCount);
    logger.info('unique downsampled stacktraces: ' + stackTraceEvents.size);
  }

  const nQueries = 4;
  const results = new Array(nQueries);

  await logExecutionLatency(
    logger,
    'mget query for ' + stackTraceEvents.size + ' stacktraces',
    async () => {
      const promises = new Array(nQueries);
      const chunkSize = Math.floor(stackTraceEvents.size / nQueries);
      const stackTraceIDs = [...stackTraceEvents.keys()];

      logger.info('A');

      for (let i = 0; i < nQueries; i++) {
        const func = async () => {
          const chunk = stackTraceIDs.slice(chunkSize * i, chunkSize * (i + 1));
          return client.mget({
            index: 'profiling-stacktraces',
            ids: [...chunk],
            _source_includes: ['FrameID', 'Type'],
          });
        };

        // Build and send the queries asynchronously.
        promises[i] = func();
      }

      logger.info('B');

      /*      for (let i = 0; i < nQueries; i++) {
        await Promise.any(promises).then((res) => {
          results[i] = res;
          logger.info('Got result ' + res.body.docs.length);
        });
      }*/

      /*      await Promise.all(promises).then((res) => {
        results.push(res);
        logger.info('Got result');
        logger.info(`Results: ` + res);
      });
*/
      for (let i = 0; i < nQueries; i++) {
        results[i] = await promises[i];
      }
    }
  );

  logger.info('results len ' + results.length);

  // Create a lookup map StackTraceID -> StackTrace.
  const stackTraces = new Map<StackTraceID, StackTrace>();
  for (let i = 0; i < nQueries; i++) {
    if (testing) {
      for (const trace of results[i].body.hits.hits) {
        const frameIDs = trace.fields.FrameID as string[];
        const fileIDs = extractFileIDArrayFromFrameIDArray(frameIDs);
        stackTraces.set(trace._id, {
          FileID: fileIDs,
          FrameID: frameIDs,
          Type: trace.fields.Type,
        });
      }
    } else {
      for (const trace of results[i].body.docs) {
        // Sometimes we don't find the trace.
        // This is due to ES delays writing (data is not immediately seen after write).
        // Also, ES doesn't know about transactions.
        if (trace.found) {
          const frameIDs = trace._source.FrameID as string[];
          const fileIDs = extractFileIDArrayFromFrameIDArray(frameIDs);
          stackTraces.set(trace._id, {
            FileID: fileIDs,
            FrameID: frameIDs,
            Type: trace._source.Type,
          });
        }
      }
    }
  }

  if (stackTraces.size < stackTraceEvents.size) {
    logger.info(
      'failed to find ' +
        (stackTraceEvents.size - stackTraces.size) +
        ' stacktraces (todo: find out why)'
    );
  }

  logger.info(
    '* unique stacktraces without leaf frame: ' +
      getNumberOfUniqueStacktracesWithoutLeafNode(stackTraces, 1)
  );

  logger.info(
    '* unique stacktraces without 2 leaf frames: ' +
      getNumberOfUniqueStacktracesWithoutLeafNode(stackTraces, 2)
  );

  // Create the set of unique FrameIDs.
  const stackFrameDocIDs = new Set<string>();
  for (const trace of stackTraces.values()) {
    for (const frameID of trace.FrameID) {
      stackFrameDocIDs.add(frameID);
    }
  }

  const resStackFrames = await logExecutionLatency(
    logger,
    'mget query for ' + stackFrameDocIDs.size + ' stackframes',
    async () => {
      return await client.mget({
        index: 'profiling-stackframes',
        ids: [...stackFrameDocIDs],
      });
    }
  );

  // Create a lookup map StackFrameID -> StackFrame.
  const stackFrames = new Map<StackFrameID, StackFrame>();
  let framesFound = 0;
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
  logger.info('found ' + framesFound + ' / ' + stackFrameDocIDs.size + ' frames');

  // Create the set of unique executable FileIDs.
  const executableDocIDs = new Set<string>();
  for (const trace of stackTraces.values()) {
    for (const fileID of trace.FileID) {
      executableDocIDs.add(fileID);
    }
  }

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
  for (const exe of resExecutables.body.docs) {
    if (exe.found) {
      executables.set(exe._id, exe._source);
    } else {
      executables.set(exe._id, {
        FileName: '',
      });
    }
  }

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
  const paths = getRemoteRoutePaths();
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
  const paths = getRemoteRoutePaths();
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
