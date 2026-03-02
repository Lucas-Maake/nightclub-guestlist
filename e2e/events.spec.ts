import { test, expect, type Page } from '@playwright/test';

async function waitForEventsPanelReady(page: Page) {
	await expect
		.poll(async () => {
			const hasEventCards = (await page.locator('a[href^="/event/"]').count()) > 0;
			const hasEmptyState = await page.getByText('No published events yet.').isVisible();
			const hasErrorState = await page.getByText('Unable to load events right now.').isVisible();
			return hasEventCards || hasEmptyState || hasErrorState;
		})
		.toBe(true);
}

test.describe('Events Page', () => {
	test('should display events page with tabs', async ({ page }) => {
		await page.goto('/event');

		// Check that the page loads
		await expect(page).toHaveURL('/event');

		// Check for the tab bar
		const eventsTab = page.getByRole('button', { name: /^events$/i });
		const ticketsTab = page.getByRole('button', { name: /^tickets$/i });

		await expect(eventsTab).toBeVisible();
		await expect(ticketsTab).toBeVisible();
	});

	test('should switch between Events and Tickets tab panels', async ({ page }) => {
		await page.goto('/event');
		await waitForEventsPanelReady(page);

		// Click Tickets tab
		await page.getByRole('button', { name: /^tickets$/i }).click();
		await expect(page.getByText('Sign in to view your active tables and tickets.')).toBeVisible();

		// Click Events tab
		await page.getByRole('button', { name: /^events$/i }).click();
		await waitForEventsPanelReady(page);
	});

	test('should display loading state initially', async ({ page }) => {
		await page.goto('/event');

		// The page should show some content immediately.
		const main = page.locator('main');
		await expect(main).toBeVisible();
	});
});

test.describe('Event Detail Page', () => {
	test('should handle non-existent event gracefully', async ({ page }) => {
		await page.goto('/event/non-existent-id');

		await expect(page.getByText('Event not found.')).toBeVisible();
	});
});
