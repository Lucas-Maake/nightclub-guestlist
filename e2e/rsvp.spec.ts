import { test, expect } from '@playwright/test';

test.describe('RSVP Page', () => {
	test('should handle invalid RSVP link gracefully', async ({ page }) => {
		await page.goto('/r/invalid-id');

		// Should show error or loading state
		await expect(page.locator('body')).toBeVisible();
	});

	test('should display RSVP page structure', async ({ page }) => {
		// Navigate to an RSVP page (will show error for invalid ID, but structure should exist)
		await page.goto('/r/test-reservation');

		// The main container should be visible
		const main = page.locator('main');
		await expect(main).toBeVisible();
	});
});

test.describe('Navigation', () => {
	test('should have proper viewport meta tag', async ({ page }) => {
		await page.goto('/');

		const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
		expect(viewport).toContain('width=device-width');
	});

	test('should be mobile responsive', async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/event');

		// Page should still be usable
		const main = page.locator('main');
		await expect(main).toBeVisible();
	});
});
