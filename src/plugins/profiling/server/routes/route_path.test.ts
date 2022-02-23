/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { ReadPathAPIRouteConfig } from './route_path';

describe('Creating route paths for the API', () => {
  describe('on read path', () => {
    test('compose the required parameters after the base path', () => {
      const basePath = '::anything::';
      const route = ReadPathAPIRouteConfig(basePath);
      expect(route.path).toContain(basePath);
      expect(route.validate).toBeDefined();
    });
  });
});
