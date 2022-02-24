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
import { DownsampledRequest, DownsampledTopNResponse } from '../common/types';

export interface Services {
  fetchTopN: (type: string, seconds: string) => Promise<any[] | HttpFetchError>;
  fetchElasticFlamechart: (seconds: string) => Promise<any[] | HttpFetchError>;
  fetchPixiFlamechart: (seconds: string) => Promise<any[] | HttpFetchError>;
  // FIXME
  fetchTopNData?: (searchField: string, seconds: string) => Promise<DownsampledTopNResponse>;
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
    fetchTopNData: (searchField: string, seconds: string): Promise<DownsampledTopNResponse> => {
      const unixTime = Math.floor(Date.now() / 1000);
      return (
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
              strategy: 'downsampledTopN',
            }
          )
          // get the results and prepare the Promise
          .toPromise<DownsampledTopNResponse>()
      );
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
