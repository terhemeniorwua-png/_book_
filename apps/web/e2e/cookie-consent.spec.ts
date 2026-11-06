import { expect, test } from '@playwright/test';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
} from '../src/lib/cookie-consent';

test('first visit is blocked by the full-screen consent dialog; reject persists and can be changed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const dialog = page.getByRole('dialog', {
    name: 'Your Privacy Matters to Staywell',
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-cookie-page-content]')).toHaveAttribute(
    'inert',
    '',
  );
  await expect(
    dialog.getByText(/no analytics service is connected/i),
  ).toBeVisible();
  await expect(
    dialog.getByText(/no marketing tracker is connected/i),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Reject Non-Essential' }).click();
  await expect(dialog).toBeHidden();
  const saved = await page.evaluate((key) => {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }, COOKIE_CONSENT_STORAGE_KEY);
  expect(saved).toMatchObject({
    version: COOKIE_CONSENT_VERSION,
    preferences: {
      strictlyNecessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    },
  });

  await page.reload();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Cookie Settings' }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('checkbox', { name: 'Strictly Necessary Cookies' }),
  ).toBeChecked();
  await expect(
    dialog.getByRole('checkbox', { name: 'Strictly Necessary Cookies' }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('checkbox', { name: 'Functional Cookies' }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole('checkbox', { name: 'Analytics Cookies' }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole('checkbox', { name: 'Marketing Cookies' }),
  ).not.toBeChecked();
  const width = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(width).toBe(true);
});

test('custom preferences persist across reload and can be updated from the footer', async ({
  page,
}) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Customize Cookies' }).click();
  await dialog.getByRole('checkbox', { name: 'Functional Cookies' }).check();
  await dialog.getByRole('checkbox', { name: 'Analytics Cookies' }).check();
  await dialog.getByRole('button', { name: 'Save My Preferences' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Cookie Settings' }).click();
  await expect(
    dialog.getByRole('checkbox', { name: 'Functional Cookies' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('checkbox', { name: 'Functional Cookies' }),
  ).toBeChecked();
  await expect(
    dialog.getByRole('checkbox', { name: 'Analytics Cookies' }),
  ).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Analytics Cookies' }).uncheck();
  await dialog.getByRole('button', { name: 'Save My Preferences' }).click();
  const preferences = await page.evaluate((key) => {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value).preferences : null;
  }, COOKIE_CONSENT_STORAGE_KEY);
  expect(preferences).toEqual({
    strictlyNecessary: true,
    functional: true,
    analytics: false,
    marketing: false,
  });
});

test('accept all stores optional categories and policy links remain available before a choice', async ({
  page,
}) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('link', { name: 'Privacy Notice' }),
  ).toHaveAttribute('href', '/terms-and-privacy#privacy-notice');
  await expect(
    dialog.getByRole('link', { name: 'Cookie Policy' }),
  ).toHaveAttribute('href', '/terms-and-privacy#cookie-policy');
  await dialog.getByRole('link', { name: 'Privacy Notice' }).click();
  await expect(page).toHaveURL(/terms-and-privacy#privacy-notice$/);
  await expect(
    page.getByRole('heading', { name: 'Privacy Notice', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Return to Staywell' }).click();
  await expect(dialog).toBeVisible();

  const externalScripts = await page
    .locator('script[src]')
    .evaluateAll((scripts) =>
      scripts
        .map((script) => (script as HTMLScriptElement).src)
        .filter((src) => new URL(src).origin !== window.location.origin),
    );
  expect(externalScripts).toEqual([]);
  await dialog.getByRole('button', { name: 'Accept All' }).click();
  const preferences = await page.evaluate((key) => {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value).preferences : null;
  }, COOKIE_CONSENT_STORAGE_KEY);
  expect(preferences).toEqual({
    strictlyNecessary: true,
    functional: true,
    analytics: true,
    marketing: true,
  });
  await expect(
    page.locator(
      'script[data-cookie-category="analytics"], script[data-cookie-category="marketing"]',
    ),
  ).toHaveCount(0);
});
