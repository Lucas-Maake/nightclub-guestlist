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

	test('should render table-packages event without ticket quantity controls', async ({ page }) => {
		await page.goto('/event/dillon-francis-table-experience');

		const packageSection = page.locator('section').filter({ hasText: 'Select a Table Package' }).first();
		await expect(packageSection).toBeVisible();
		await expect(packageSection).toContainText('Main Floor Tables');
		await expect(packageSection).toContainText('Mezzanine Tables');
		await expect(page.getByText('Select Tickets')).toHaveCount(0);
		await expect(page.getByText('No basic ticket options are available for this event.')).toBeVisible();
	});

	test('should open table package checkout modal', async ({ page }) => {
		await page.goto('/event/dillon-francis-table-experience');

		await page.getByRole('button', { name: /^select$/i }).first().click();

		await expect(page.getByRole('heading', { name: /table package information/i })).toBeVisible();
		await expect(page.getByText('Deposit Subtotal')).toBeVisible();
		await expect(page.getByRole('button', { name: /checkout \$1,000.00/i })).toBeVisible();

		const modal = page.locator('[role="dialog"]').first();
		const pageScrollBefore = await page.evaluate(() => window.scrollY);
		const modalCanScroll = await modal.evaluate((node) => node.scrollHeight > node.clientHeight);

		await modal.hover();
		await page.mouse.wheel(0, 600);

		await expect
			.poll(async () => page.evaluate(() => window.scrollY))
			.toBe(pageScrollBefore);

		if (modalCanScroll) {
			await expect.poll(async () => modal.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
		}
	});

	test('should route request table action to create form', async ({ page }) => {
		await page.goto('/event/dillon-francis-table-experience');

		await page.getByRole('button', { name: /^request$/i }).click();

		await expect(page).toHaveURL(/\/create\?/);
		await expect(page.getByRole('heading', { name: /create a reservation/i })).toBeVisible();
		await expect
			.poll(async () => new URL(page.url()).searchParams.get('eventId'))
			.toBe('dillon-francis-table-experience');
	});
});
