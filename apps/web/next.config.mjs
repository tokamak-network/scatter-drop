/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace SDK is shipped as TypeScript source (ESM); let Next transpile it
  // and its merkle dependency rather than expecting a prebuilt bundle.
  transpilePackages: [
    "@tokamak-network/scatter-drop-sdk",
    "@tokamak-network/scatter-drop-merkle",
    "@tokamak-network/scatter-drop-snapshot",
  ],
  webpack: (config) => {
    // The SDK is authored in NodeNext style with explicit `.js` extensions in
    // its TypeScript source imports. Tell webpack to resolve `.js` requests to
    // the actual `.ts`/`.tsx` files first so the source package resolves.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    // We only use the `injected()` connector, but importing it from wagmi's
    // connector barrel pulls in MetaMask/WalletConnect/Coinbase connectors too,
    // each dragging optional deps that aren't used in the browser build. Stub
    // them to empty modules so webpack resolves cleanly instead of warning
    // "Module not found: Can't resolve ...".
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@react-native-async-storage/async-storage": false, // MetaMask SDK (RN-only)
      "pino-pretty": false, // WalletConnect logger (dev pretty-printer)
    };
    // viem/ox `tempo` modules use a dynamic `require(expr)` that trips webpack's
    // "Critical dependency: the request of a dependency is an expression"
    // warning. We don't use those paths; silence the noise.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /node_modules[\\/]ox[\\/]_esm[\\/]tempo[\\/]/ },
    ];
    return config;
  },
};

export default nextConfig;
