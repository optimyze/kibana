/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { AppMountParameters, CoreSetup, CoreStart, Plugin } from 'kibana/public';
import { getServices } from './services';
import { DataPublicPluginSetup, DataPublicPluginStart } from '../../data/public';

export interface ProdfilerPluginStartDeps {
  data: DataPublicPluginStart;
}

export interface ProdfilerPluginSetupDeps {
  data: DataPublicPluginSetup;
}

export class ProdfilerPlugin
  implements Plugin<void, void, ProdfilerPluginSetupDeps, ProdfilerPluginStartDeps>
{
  public setup(core: CoreSetup<ProdfilerPluginStartDeps>) {
    // Register an application into the side navigation menu
    core.application.register({
      id: 'prodfiler',
      title: 'Prodfiler',
      async mount({ element }: AppMountParameters) {
        const [coreStart, dataPlugin] = await core.getStartServices();
        const startServices = getServices(coreStart, dataPlugin);
        const { renderApp } = await import('./app');
        return renderApp(startServices, element);
      },
    });
  }

  public start(core: CoreStart) {
    return {};
  }

  public stop() {}
}
