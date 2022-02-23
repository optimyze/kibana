/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { schema } from '@kbn/config-schema';
import { RouteConfig } from 'kibana/server';

// Configures the route for GET to APIs that will return profiling payloads.
// We expect always:
// * unknown Params
// * unknown Query
// * empty Body
export function ReadPathAPIRouteConfig(
  baseAPIPath: string
): RouteConfig<unknown, unknown, undefined, 'get'> {
  return {
    path: baseAPIPath.concat('/{projectdID}', '/{timeFrom}', '/{timeTo}', '/{items}'),
    validate: {
      params: schema.object({
        projectID: schema.number(),
        timeFrom: schema.number(),
        timeTo: schema.number(),
        items: schema.number({ defaultValue: 100 }),
      }),
      query: schema.maybe(schema.mapOf(schema.string(), schema.string())),
      body: undefined,
    },
  };
}
