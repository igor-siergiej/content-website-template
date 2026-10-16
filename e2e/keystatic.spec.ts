import { expect, test } from '@playwright/test';

test('keystatic admin renders without throwing', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    // The custom Keystatic integration in astro.config.mjs builds /keystatic as a static
    // page in `output: 'static'` mode (the custom hook writes a JS shim that pulls
    // @keystatic/astro/ui). This catches a broken @keystatic/astro upgrade before it
    // gets past CI: the page either 404s, returns the default 404, or hydrates into a
    // runtime error instead of the Cloud-mode login screen.
    const response = await page.goto('/keystatic');

    expect(response?.status()).toBe(200);
    // The Cloud-mode admin mounts the Keystatic Cloud sign-in form. Anything else
    // (the default 404, a build-error page, an unhydrated React shell) is a regression.
    await expect(page.getByText(/Log in with Keystatic Cloud/i)).toBeVisible();
    expect(errors).toEqual([]);
});
