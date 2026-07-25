/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source (no build step) — Next compiles them.
  transpilePackages: [
    '@matchday/domain',
    '@matchday/scoring',
    '@matchday/provider',
    '@matchday/jobs',
    '@matchday/notify',
  ],
  // Lint runs once, from the repo root, as the second step of `pnpm check` — that config
  // owns the import boundaries. Re-running Next's own discovery here would double the
  // work and miss the boundary rules anyway.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Keeps monorepo file tracing rooted at the repo, not apps/web.
    externalDir: true,
  },
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default nextConfig;
