import { describe, expect, it } from 'vitest';

import { readConfig } from './readConfig.js';

describe('readConfig', () => {
  it('parses optional auth token and migration flag', () => {
    const config = readConfig({
      DATABASE_URL: 'postgres://user:password@localhost:5432/example',
      LOKI_BASE_URL: 'http://not-used',
      PORT: '9090',
      INGEST_API_AUTH_TOKEN: 'secret',
      RUN_MIGRATIONS: 'true'
    });

    expect(config.port).toBe(9090);
    expect(config.authToken).toBe('secret');
    expect(config.runMigrations).toBe(true);
  });
});
