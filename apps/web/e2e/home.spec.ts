import { expect, test } from '@playwright/test';

test('shows the Staywell apartment homepage and discovery entry points', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: /room to feel at home/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /explore apartments/i }).first(),
  ).toHaveAttribute('href', '/apartments');
});
