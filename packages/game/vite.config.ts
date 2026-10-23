import { defineConfig, type Plugin } from 'vite';
import { headersFile, META_CSP } from './security.ts';

/** Production builds carry the security policy (see security.ts). Dev keeps Vite's inline HMR styles. */
function securityPolicy(): Plugin {
  return {
    name: 'lcp-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: META_CSP },
        injectTo: 'head-prepend',
      },
    ],
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile() });
    },
  };
}

export default defineConfig({
  plugins: [securityPolicy()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // The bridge (npm run dev -w @lcp/bridge) streams session events here.
      '/events': { target: 'ws://127.0.0.1:6464', ws: true, changeOrigin: true },
    },
  },
  // Fonts stay files instead of data: URIs, so the policy can say font-src 'self'.
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    // The licenses of every bundled library travel with the build (MIT and others require it).
    license: { fileName: 'licenses/third-party.md' },
  },
});
