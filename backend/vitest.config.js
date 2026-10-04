export default {
  test: {
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SECRET_KEY: "test-secret-key",
      GITHUB_APP_ID: "123",
      GITHUB_APP_SLUG: "test-app",
      GITHUB_CLIENT_ID: "test-client-id",
      GITHUB_CLIENT_SECRET: "test-client-secret",
      GITHUB_PRIVATE_KEY: "test-private-key",
      STATE_SECRET: "test-state-secret-0123456789-abcdefghij",
      FRONTEND_URL: "http://localhost:3001",
    },
  },
};
