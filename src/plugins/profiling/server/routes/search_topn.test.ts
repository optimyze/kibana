/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { topNElasticSearchQuery } from './search_topn';
import { DataRequestHandlerContext } from '../../../data/server';
import { kibanaResponseFactory } from '../../../../core/server';
import { AggregationsAggregationContainer } from '@elastic/elasticsearch/lib/api/types';

const anyQuery = 'any::query';
const index = 'test';
const testAgg = { aggs: { test: {} } };

jest.mock('./mappings', () => ({
  projectTimeRangeQuery: (proj: string, from: string, to: string) => {
    return anyQuery;
  },
  autoHistogramSumCountOnGroupByField: (searchField: string): AggregationsAggregationContainer => {
    return testAgg;
  },
}));

function mockDataContext() {
  return {
    core: {
      elasticsearch: {
        client: {
          asCurrentUser: {
            search: jest.fn().mockResolvedValue({ body: {} }),
          },
        },
      },
    },
  };
}

describe('Getting data from Elasticsearch', () => {
  it('build a query that filters by projectID and aggregates timerange on histogram', async () => {
    const mock = mockDataContext();
    const queryMock = mock as unknown as DataRequestHandlerContext;
    await topNElasticSearchQuery(
      queryMock,
      index,
      '123',
      '456',
      '789',
      'field',
      kibanaResponseFactory
    );
    expect(mock.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith(
      {
        index,
        body: {
          query: anyQuery,
          aggs: {
            histogram: testAgg,
          },
        },
      },
      {}
    );
  });
});
