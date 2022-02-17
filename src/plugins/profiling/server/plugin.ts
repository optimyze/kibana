/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { PluginInitializerContext, CoreSetup, CoreStart, Plugin, Logger } from 'kibana/server';

import type { DataRequestHandlerContext } from '../../data/server';

import { ProfilingPluginSetupDeps, ProfilingPluginStartDeps } from './types';
import { registerRoutes } from './routes';

export class ProfilingPlugin
  implements Plugin<void, void, ProfilingPluginSetupDeps, ProfilingPluginStartDeps>
{
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup<ProfilingPluginStartDeps>, { data }: ProfilingPluginSetupDeps) {
    this.logger.debug('profiling: Setup');
    // TODO we should create a query here using "data".
    // We should ensure there are profiling data in the expected indices
    // and return an error otherwise.
    // This should be done only once at startup and before exposing the routed APIs.
    const router = core.http.createRouter<DataRequestHandlerContext>();
    core.getStartServices().then(() => {
      registerRoutes(router, this.logger);
    });

    return {};
  }

  public start(core: CoreStart, { data }: ProfilingPluginStartDeps) {
    this.logger.debug('profiling: Started');
    // TODO preload down-sampling factor value here.
    // We want to calculate and set into a class property the starting index to read data from.
    // We may want to do this here to speed up the resolution of queries afterwards.
    return {};
  }

  public stop() {}
}
