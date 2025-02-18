/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { deleteAllCaseItems, getCaseMetrics } from '../../../../common/lib/utils';

// eslint-disable-next-line import/no-default-export
export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');
  const kibanaServer = getService('kibanaServer');

  describe('case metrics', () => {
    describe('closed case from kbn archive', () => {
      const closedCaseId = 'e49ad6e0-cf9d-11eb-a603-13e7747d215z';

      before(async () => {
        await kibanaServer.importExport.load(
          'x-pack/test/functional/fixtures/kbn_archiver/cases/7.13.2/cases.json'
        );
      });

      after(async () => {
        await kibanaServer.importExport.unload(
          'x-pack/test/functional/fixtures/kbn_archiver/cases/7.13.2/cases.json'
        );
        await deleteAllCaseItems(es);
      });

      it('returns the lifespan of the case', async () => {
        const metrics = await getCaseMetrics({
          supertest,
          caseId: closedCaseId,
          features: ['lifespan'],
        });

        expect(metrics.lifespan?.creationDate).to.be('2021-06-17T18:57:41.682Z');
        expect(metrics.lifespan?.closeDate).to.eql('2021-06-17T18:57:42.682Z');
      });

      it('returns an error when passing invalid features', async () => {
        const errorResponse = (await getCaseMetrics({
          supertest,
          caseId: closedCaseId,
          features: ['bananas'],
          expectedHttpCode: 400,
          // casting here because we're expecting an error with a message field
        })) as unknown as { message: string };

        expect(errorResponse.message).to.contain('invalid features');
      });
    });

    describe('status changes', () => {
      const caseId = '0215ff30-6e39-11ec-8e5f-bf82b2955cf8';

      before(async () => {
        await kibanaServer.importExport.load(
          'x-pack/test/functional/fixtures/kbn_archiver/cases/8.1.0/status_changes.json'
        );
      });

      after(async () => {
        await kibanaServer.importExport.unload(
          'x-pack/test/functional/fixtures/kbn_archiver/cases/8.1.0/status_changes.json'
        );
        await deleteAllCaseItems(es);
      });

      it('returns the lifespan of the case for status changes', async () => {
        // each status change happens after 10 minutes, these are the changes in the status_changes.json file:
        // open at "2022-01-05T15:00:00.000Z" -> in-progress 15:10 -> closed 15:20 -> open 15:30 -> closed 15:40 -> open 15:50 -> closed 16:00
        const metrics = await getCaseMetrics({
          supertest,
          caseId,
          features: ['lifespan'],
        });

        expect(metrics).to.eql({
          lifespan: {
            creationDate: '2022-01-05T15:00:00.000Z',
            closeDate: null,
            statusInfo: {
              openDuration: minutesToMilliseconds(30),
              inProgressDuration: minutesToMilliseconds(10),
              numberOfReopens: 2,
            },
          },
        });
      });
    });
  });
};

function minutesToMilliseconds(minutes: number): number {
  return minutes * 60 * 1000;
}
