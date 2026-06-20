/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` is a native-ish server package; keep it out of the client/edge bundle.
  serverExternalPackages: ["pg", "web-push"],
  // Pin the file-tracing root to this repo so a parent-directory lockfile can't
  // mis-root the build, and so vendored runtime files (certs/, sample-app/) are
  // traced into the deployment.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
