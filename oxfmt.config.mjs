import shared from '@imapps/oxc-config/oxfmt';

export default {
    ...shared,
    astro: true,
    overrides: [...shared.overrides, { files: ['**/*.astro'], options: { sortImports: false } }],
    ignorePatterns: [
        ...shared.ignorePatterns,
        '**/node_modules/**',
        '.astro/**',
        'dist/**',
        'test-results/**',
        'playwright-report/**',
        '.playwright-mcp/**',
        '.factory/**',
        'infra/.terraform/**',
        // CI/deployment files retain their existing formatting; migration does not alter them.
        '.github/workflows/**',
        '.forgejo/workflows/**',
        'bun.lock',
        // Frozen regression supplied by the factory; preserve its committed bytes.
        'src/lib/tooling.test.ts',
    ],
};
