import { expect, test } from '@playwright/test';

test('shows the project foundation landing page', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Project foundation is ready.' }),
  ).toBeVisible();
});
