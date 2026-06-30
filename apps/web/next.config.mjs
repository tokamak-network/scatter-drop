/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace SDK is shipped as TypeScript source (ESM); let Next transpile it
  // and its merkle dependency rather than expecting a prebuilt bundle.
  transpilePackages: [
    "@tokamak-network/scatter-drop-sdk",
    "@tokamak-network/scatter-drop-merkle",
  ],
  webpack: (config) => {
    // The SDK is authored in NodeNext style with explicit `.js` extensions in
    // its TypeScript source imports. Tell webpack to resolve `.js` requests to
    // the actual `.ts`/`.tsx` files first so the source package resolves.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
