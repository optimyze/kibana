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
import { TopNHistogramAggregation, TopNItemCountAggregation } from '../../common/types';

const anyQuery = 'any::query';
const index = 'test';
const testAgg = { aggs: { test: {} } };

jest.mock('./mappings', () => ({
  newProjectTimeQuery: (proj: string, from: string, to: string) => {
    return anyQuery;
  },
  autoHistogramSumCountOnGroupByField: (searchField: string): AggregationsAggregationContainer => {
    return testAgg;
  },
}));

function mockTopNData() {
  return {
    core: {
      elasticsearch: {
        client: {
          asCurrentUser: {
            search: jest.fn().mockResolvedValue({
              body: {
                aggregations: {
                  histogram: {
                    buckets: [
                      {
                        key_as_string: '123',
                        key: 123000,
                        doc_count: 10,
                        group_by: {
                          doc_count_error_upper_bound: 0,
                          sum_other_doc_count: 0,
                          buckets: [
                            {
                              key: '::any::key::',
                              doc_count: 10,
                              Count: {
                                value: 100.0,
                              },
                            } as TopNItemCountAggregation,
                          ],
                        },
                      },
                    ],
                  } as TopNHistogramAggregation,
                } as AggregationsAggregationContainer,
              },
            }),
            mget: jest.fn().mockResolvedValue({
              body: {
                docs: [],
              },
            }),
          },
        },
      },
    },
  };
}

describe('TopN data from Elasticsearch', () => {
  const mock = mockTopNData();
  const queryMock = mock as unknown as DataRequestHandlerContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('building the query', () => {
    it('filters by projectID and aggregates timerange on histogram', async () => {
      await topNElasticSearchQuery(
        queryMock,
        index,
        '123',
        '456',
        '789',
        10,
        'field',
        kibanaResponseFactory
      );
      expect(mock.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith({
        index,
        body: {
          query: anyQuery,
          aggs: {
            histogram: testAgg,
          },
        },
      });
    });
  });
  describe('when fetching Stack Traces', () => {
    it('should search first then mget', async () => {
      await topNElasticSearchQuery(
        queryMock,
        index,
        '123',
        '456',
        '789',
        10,
        'StackTraceID',
        kibanaResponseFactory
      );
      expect(mock.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledTimes(1);
      expect(mock.core.elasticsearch.client.asCurrentUser.mget).toHaveBeenCalledTimes(1);
    });
  });

  describe('using the data plugin', () => {
    it('should call the context search as current user', async () => {
      // TODO
    });
  });
});
