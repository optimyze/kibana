/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { SearchTotalHits } from '@elastic/elasticsearch/lib/api/types';
import { IEsSearchRequest, ISearchStrategy, PluginStart } from '../../../data/server';
import {
  autoHistogramSumCountOnGroupByField,
  newProjectTimeQuery,
  ProjectTimeQuery,
} from '../routes/mappings';
import { downsampledIndex, getSampledTraceEventsIndex } from '../routes/search_flamechart';
import { DownsampledRequest, DownsampledTopNResponse } from '../../common/types';

export const DownsampledTopNFactory = (
  data: PluginStart
): ISearchStrategy<DownsampledRequest, DownsampledTopNResponse> => {
  const es = data.search.getSearchStrategy();

  // FIXME these 2 constants should be configurable?
  const initialExp = 6;
  const targetSampleSize = 20000; // minimum number of samples to get statistically sound results

  // Calculate the right down-sampled index to query data from
  const sampleCountFromInitialExp = (filter: ProjectTimeQuery, options, deps): number => {
    // By default, we return no samples and use the un-sampled index
    let sampleCount = 0;
    es.search(
      {
        params: {
          index: downsampledIndex + initialExp,
          body: {
            query: filter,
            size: 0,
            track_total_hits: true,
          },
        },
      },
      options,
      deps
    ).subscribe({
      next: (value) => {
        sampleCount = (value.rawResponse.hits.total as SearchTotalHits).value;
      },
    });
    return sampleCount;
  };
  return {
    search: (request, options, deps) => {
      const { projectID, timeFrom, timeTo, topNItems, searchField } = request.params!;
      const filter = newProjectTimeQuery(
        projectID.toString(),
        timeFrom.toString(),
        timeTo.toString()
      );

      // Create the query for the actual data
      const downsampledReq = {
        params: {
          index: getSampledTraceEventsIndex(
            targetSampleSize,
            sampleCountFromInitialExp(filter, options, deps),
            initialExp
          ).name,
          body: {
            query: filter,
            aggs: {
              histogram: autoHistogramSumCountOnGroupByField(searchField, topNItems),
            },
          },
        },
      } as IEsSearchRequest;
      return es.search(downsampledReq, options, deps);
    },
    cancel: async (id, options, deps) => {
      if (es.cancel) {
        await es.cancel(id, options, deps);
      }
    },
  };
};
