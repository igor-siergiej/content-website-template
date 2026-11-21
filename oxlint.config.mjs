import shared from '@imapps/oxc-config/oxlint';
import { defineConfig } from 'oxlint';

export default defineConfig({
    ...shared,
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
    ],
    rules: {
        ...shared.rules,
        'one-var': ['error', 'never'],
    },
    overrides: [
        ...shared.overrides,
        {
            files: ['src/**/*'],
            rules: {
                'typescript/no-explicit-any': 'off',
                'no-unused-vars': 'off',
                'typescript/no-non-null-assertion': 'off',
            },
        },
        {
            files: ['**/*.astro'],
            // Template component references are outside the script-only lint scope.
            rules: { 'no-unused-vars': 'off' },
        },
    ],
});
