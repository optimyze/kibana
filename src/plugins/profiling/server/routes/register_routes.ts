/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import type { IRouter } from '../../../../core/server';
import { DataRequestHandlerContext } from '../../../data/server';
import { registerTraceEventsTopNSearchRoute } from './search_profiling';

export function registerRoutes(router: IRouter<DataRequestHandlerContext>) {
  registerTraceEventsTopNSearchRoute(router);
}
