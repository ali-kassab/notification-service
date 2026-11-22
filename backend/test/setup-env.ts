// Environment for e2e tests. Uses the separate `naas_test` database created by docker-compose.
// Values already present in the environment (e.g. in CI) win.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://naas:naas@localhost:5435/naas_test?schema=public',
  JWT_SECRET: 'test-dashboard-jwt-secret-0123456789abcdef',
  JWT_EXPIRES_IN: '1h',
  USER_TOKEN_SECRET: 'test-user-token-secret-0123456789abcdef',
  USER_TOKEN_DEFAULT_TTL_SECONDS: '600',
  CORS_ORIGINS: 'http://localhost:5173',
  RATE_LIMIT_TTL_MS: '60000',
  RATE_LIMIT_MAX: '100000',
  AUTH_RATE_LIMIT_MAX: '100000',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
