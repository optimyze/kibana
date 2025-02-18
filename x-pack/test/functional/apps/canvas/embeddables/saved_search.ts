/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const PageObjects = getPageObjects(['canvas', 'common', 'header', 'discover']);
  const testSubjects = getService('testSubjects');
  const esArchiver = getService('esArchiver');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const dashboardPanelActions = getService('dashboardPanelActions');
  const archives = {
    es: 'test/functional/fixtures/es_archiver/dashboard/current/kibana',
  };

  describe('saved search in canvas', function () {
    before(async () => {
      await esArchiver.load(archives.es);
      // open canvas home
      await PageObjects.common.navigateToApp('canvas');
      // create new workpad
      await PageObjects.canvas.createNewWorkpad();
      await PageObjects.canvas.setWorkpadName('saved search tests');
    });

    after(async () => {
      await esArchiver.unload(archives.es);
    });

    describe('by-reference', () => {
      it('adds existing saved search embeddable from the visualize library', async () => {
        await PageObjects.canvas.clickAddFromLibrary();
        await dashboardAddPanel.addSavedSearch('Rendering-Test:-saved-search');
        await testSubjects.existOrFail('embeddablePanelHeading-RenderingTest:savedsearch');
      });

      it('edits saved search by-reference embeddable', async () => {
        await dashboardPanelActions.editPanelByTitle('Rendering Test: saved search');
        await PageObjects.discover.saveSearch('Rendering Test: saved search v2');
        await PageObjects.common.navigateToApp('canvas');
        await PageObjects.canvas.loadFirstWorkpad('saved search tests');
        await testSubjects.existOrFail('embeddablePanelHeading-RenderingTest:savedsearchv2');
      });
    });
  });
}
