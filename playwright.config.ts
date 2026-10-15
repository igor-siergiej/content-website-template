import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    webServer: {
        // `ASTRO_PREVIEW_BACKGROUND=1` opts out of Astro 7.2+'s agent-detected auto-
        // background mode. Without it, `astro preview` forks and the parent process exits
        // before Playwright can health-check it, so every run reports "Process exited early".
        command: 'bun run preview',
        url: 'http://localhost:4321',
        reuseExistingServer: !process.env.CI,
        env: {
            ...process.env,
            ASTRO_PREVIEW_BACKGROUND: '1',
        },
    },
    use: {
        baseURL: 'http://localhost:4321',
    },
});
