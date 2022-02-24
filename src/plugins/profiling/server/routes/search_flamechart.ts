/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { schema } from '@kbn/config-schema';
import type { IRouter, Logger } from 'kibana/server';
import type { DataRequestHandlerContext } from '../../../data/server';
import { getRemoteRoutePaths } from '../../common';
import { FlameGraph } from './flamegraph';
import { newProjectTimeQuery } from './mappings';
import { Executable, FileID, StackFrame, StackFrameID, StackTrace, StackTraceID } from './types';

export interface DownsampledEventsIndex {
  name: string;
  sampleRate: number;
}

const downsampledIndex = 'profiling-events-5pow';

// Return the index that has between targetSampleSize..targetSampleSize*samplingFactor entries.
// The starting point is the number of entries from the profiling-events-5pow<initialExp> index.
//
// More details on how the down-sampling works can be found at the write path
//   https://github.com/elastic/prodfiler/blob/bdcc2711c6cd7e89d63b58a17329fb9fdbabe008/pf-elastic-collector/elastic.go
export function getSampledTraceEventsIndex(
  targetSampleSize: number,
  sampleCountFromInitialExp: number,
  initialExp: number
): DownsampledEventsIndex {
  const maxExp = 11;
  const samplingFactor = 5;
  const fullEventsIndex: DownsampledEventsIndex = { name: 'profiling-events', sampleRate: 1 };

  if (sampleCountFromInitialExp === 0) {
    // Take the shortcut to the full events index.
    return fullEventsIndex;
  }

  if (sampleCountFromInitialExp >= samplingFactor * targetSampleSize) {
    // Search in more down-sampled indexes.
    for (let i = initialExp + 1; i <= maxExp; i++) {
      sampleCountFromInitialExp /= samplingFactor;
      if (sampleCountFromInitialExp < samplingFactor * targetSampleSize) {
        return { name: downsampledIndex + i, sampleRate: 1 / samplingFactor ** i };
      }
    }
    // If we come here, it means that the most sparse index still holds too many items.
    // The only problem is the query time, the result set is good.
    return { name: downsampledIndex + 11, sampleRate: 1 / samplingFactor ** maxExp };
  } else if (sampleCountFromInitialExp < targetSampleSize) {
    // Search in less down-sampled indexes.
    for (let i = initialExp - 1; i >= 1; i--) {
      sampleCountFromInitialExp *= samplingFactor;
      if (sampleCountFromInitialExp >= targetSampleSize) {
        return { name: downsampledIndex + i, sampleRate: 1 / samplingFactor ** i };
      }
    }

    return fullEventsIndex;
  }

  return { name: downsampledIndex + initialExp, sampleRate: 1 / samplingFactor ** initialExp };
}

export function registerFlameChartSearchRoute(
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
          n: schema.maybe(schema.number()),
        }),
      },
    },
    async (context, request, response) => {
      const { projectID, timeFrom, timeTo } = request.query;
      const targetSampleSize = 20000; // minimum number of samples to get statistically sound results

      try {
        const esClient = context.core.elasticsearch.client.asCurrentUser;
        const filter = newProjectTimeQuery(projectID!, timeFrom!, timeTo!);

        // Start with counting the results in the index down-sampled by 5^6.
        // That is in the middle of our down-sampled indexes.
        const initialExp = 6;

        logger.debug('Started downsampling query');
        const startDS = now();
        const resp = await esClient.search({
          index: downsampledIndex + initialExp,
          body: {
            query: filter,
            size: 0,
            track_total_hits: true,
          },
        });
        const sampleCountFromInitialExp = resp.body.hits.total.value as number;

        logger.debug('sampleCountFromPow6 ' + sampleCountFromInitialExp);

        const eventsIndex = getSampledTraceEventsIndex(
          targetSampleSize,
          sampleCountFromInitialExp,
          initialExp
        );
        logger.debug(
          'Completed downsampling calculation, findDownsampledIndex took ' + elapsed(startDS) + 'ms'
        );

        logger.debug('EventsIndex ' + eventsIndex);

        // Using filter_path is less readable and scrollSearch seems to be buggy - it
        // applies filter_path only to the first array of results, but not on the following arrays.
        // The downside of `_source` is: it takes 2.5x more time on the ES side (see "took" field).
        // The `composite` keyword skips sorting the buckets as and return results 'as is'.
        // A max bucket size of 100000 needs a cluster level setting "search.max_buckets: 100000".
        const start1 = now();
        logger.debug('Started events query on ' + eventsIndex.name);
        const resEvents = await esClient.search({
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
        logger.debug('Completed query of events, resEvents took ' + elapsed(start1) + 'ms');

        const totalCount: number = resEvents.body.aggregations.total_count.value;
        const stackTraceEvents = new Map<StackTraceID, number>();

        let docCount = 0;
        let bucketCount = 0;
        resEvents.body.aggregations.group_by.buckets.forEach((item: any) => {
          const traceid: StackTraceID = item.key.traceid;
          stackTraceEvents.set(traceid, item.sum_count.value);
          docCount += item.doc_count;
          bucketCount++;
        });
        logger.debug('took ' + resEvents.body.took);
        logger.debug('docs ' + docCount);
        logger.debug('total events ' + totalCount);
        logger.debug('unique events ' + bucketCount);

        const start2 = now();
        const resStackTraces = await esClient.mget({
          index: 'profiling-stacktraces',
          ids: [...stackTraceEvents.keys()],
          _source_includes: ['FrameID', 'FileID', 'Type'],
        });
        logger.debug('Completed stacktraces mget, resStackTraces took ' + elapsed(start2) + 'ms');

        // Sometimes we don't find the trace.
        // This is due to ES delays writing (data is not immediately seen after write).
        // Also, ES doesn't know about transactions.

        // Create a lookup map StackTraceID -> StackTrace.
        const stackTraces = new Map<StackTraceID, StackTrace>();
        for (const trace of resStackTraces.body.docs) {
          if (trace.found) {
            stackTraces.set(trace._id, {
              FileID: trace._source.FileID,
              FrameID: trace._source.FrameID,
              Type: trace._source.Type,
            });
          }
        }
        logger.debug('unique stacktraces ' + stackTraces.size);

        // Create the set of unique FrameIDs.
        const stackFrameDocIDs = new Set<string>();
        for (const trace of stackTraces.values()) {
          for (const frameID of trace.FrameID) {
            stackFrameDocIDs.add(frameID);
          }
        }
        logger.debug('unique frames' + stackFrameDocIDs.size);

        const start3 = now();
        const resStackFrames = await esClient.mget({
          index: 'profiling-stackframes',
          ids: [...stackFrameDocIDs],
        });
        logger.debug('Completed stackframes mget, resStackFrames took ' + elapsed(start3) + 'ms');

        // Create a lookup map StackFrameID -> StackFrame.
        const stackFrames = new Map<StackFrameID, StackFrame>();
        for (const frame of resStackFrames.body.docs) {
          if (frame.found) {
            stackFrames.set(frame._id, frame._source);
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

        // Create the set of unique executable FileIDs.
        const executableDocIDs = new Set<string>();
        for (const trace of stackTraces.values()) {
          for (const fileID of trace.FileID) {
            executableDocIDs.add(fileID);
          }
        }
        logger.debug('unique executable IDs ' + executableDocIDs.size);

        const start4 = now();
        const resExecutables = await esClient.mget<any>({
          index: 'profiling-executables',
          ids: [...executableDocIDs],
          _source_includes: ['FileName'],
        });
        logger.debug('Completed stacktraces mget, resExecutables took ' + elapsed(start4) + 'ms');

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

        const start5 = now();
        const flamegraph = new FlameGraph(
          eventsIndex.sampleRate,
          totalCount,
          stackTraceEvents,
          stackTraces,
          stackFrames,
          executables,
          logger
        );

        const ret = response.ok({
          body: flamegraph.toElastic(),
        });
        logger.debug('Completed Flamegraph aggregation, took ' + elapsed(start5) + 'ms');
        logger.debug('Completed Flamegraph, totalDuration ' + elapsed(startDS) + 'ms');

        return ret;
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

const now = () => {
  return new Date().getTime();
};

const elapsed = (start: number) => {
  return new Date().getTime() - start;
};
