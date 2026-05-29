/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` is a native-ish server package; keep it out of the client/edge bundle.
  serverExternalPackages: ["pg", "web-push"],
  // The pipeline shells out to git and runs against a real Postgres; these only
  // ever run in Node server contexts (API routes / scripts), never the browser.
  experimental: {
    // Allow importing the orchestrator libs from route handlers without bundling churn.
  },
};

export default nextConfig;
