/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { CoreStart, HttpFetchError, HttpFetchQuery } from 'kibana/public';
import { getRemoteRoutePaths } from '../common';
import { ProdfilerPluginStartDeps } from './plugin';
import {
  DOWNSAMPLED_TOPN_STRATEGY,
  DownsampledRequest,
  DownsampledTopNResponse,
  TopNAggregateResponse,
} from '../common/types';

export interface Services {
  fetchTopN: (type: string, seconds: string) => Promise<any[] | HttpFetchError>;
  fetchElasticFlamechart: (seconds: string) => Promise<any[] | HttpFetchError>;
  fetchPixiFlamechart: (seconds: string) => Promise<any[] | HttpFetchError>;
  fetchTopNData: (searchField: string, seconds: string) => Promise<TopNAggregateResponse>;
}

function getFetchQuery(seconds: string): HttpFetchQuery {
  const unixTime = Math.floor(Date.now() / 1000);
  return {
    index: 'profiling-events',
    projectID: 5,
    timeFrom: unixTime - parseInt(seconds, 10),
    timeTo: unixTime,
    // TODO remove hard-coded value for topN items length and expose it through the UI
    n: 100,
  } as HttpFetchQuery;
}

export function getServices(core: CoreStart, data?: ProdfilerPluginStartDeps): Services {
  // To use local fixtures instead, use getLocalRoutePaths
  const paths = getRemoteRoutePaths();

  return {
    fetchTopNData: async (searchField: string, seconds: string): Promise<TopNAggregateResponse> => {
      const unixTime = Math.floor(Date.now() / 1000);
      const response: TopNAggregateResponse = { topN: { histogram: { buckets: [] } } };
      data!.data.search
        .search<DownsampledRequest, DownsampledTopNResponse>(
          {
            params: {
              projectID: 5,
              timeFrom: unixTime - parseInt(seconds, 10),
              timeTo: unixTime,
              // FIXME remove hard-coded value for topN items length and expose it through the UI
              topNItems: 100,
              searchField,
            },
          },
          {
            strategy: DOWNSAMPLED_TOPN_STRATEGY,
          }
        )
        .subscribe({
          next: (result) => {
            console.log('subscription data plugin rawResponse: %o', result.rawResponse);
            response.topN.histogram = result.rawResponse.aggregations.histogram;
          },
          // TODO error handling
          error: (err) => {
            console.log('subscription error: %o', err);
          },
          // FIXME remove this, used for debugging only
          complete: () => {
            console.log('subscription completed');
          },
        });

      console.log('returning Promise of TopNAggregateResponse');
      return await new Promise<TopNAggregateResponse>((resolve, _) => {
        return resolve(response);
      });
    },

    fetchTopN: async (type: string, seconds: string) => {
      try {
        const query = getFetchQuery(seconds);
        return await core.http.get(`${paths.TopN}/${type}`, { query });
      } catch (e) {
        return e;
      }
    },

    fetchElasticFlamechart: async (seconds: string) => {
      try {
        const query = getFetchQuery(seconds);
        return await core.http.get(paths.FlamechartElastic, { query });
      } catch (e) {
        return e;
      }
    },

    fetchPixiFlamechart: async (seconds: string) => {
      try {
        const query = getFetchQuery(seconds);
        return await core.http.get(paths.FlamechartPixi, { query });
      } catch (e) {
        return e;
      }
    },
  };
}
