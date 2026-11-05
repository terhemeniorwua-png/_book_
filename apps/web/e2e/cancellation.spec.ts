import { expect, test, type Page } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:4100';
const eligibleToken = 'A'.repeat(43);
const ineligibleToken = 'B'.repeat(43);
const expiredToken = 'C'.repeat(43);

function cancellationUrl(token: string) {
  return `/booking/cancel#token=${token}`;
}

async function openCancellation(page: Page, token: string) {
  await page.goto(cancellationUrl(token));
}

test.beforeEach(async ({ request }) => {
  await request.post(`${apiOrigin}/__test/reset`);
});

test('opens a secure cancellation page without cancelling the booking', async ({
  page,
  request,
}) => {
  await page.goto('/apartments');
  await openCancellation(page, eligibleToken);
  await expect(
    page.getByRole('heading', { name: 'Cancel this booking?' }),
  ).toBeVisible();
  await expect(page.getByText('AB-1234567890ABCD')).toBeVisible();
  await expect(
    page.getByText(/refund will be requested through Paystack under Staywell’s refund policy/i),
  ).toBeVisible();

  // The token is removed from the visible URL once the page has read it.
  expect(page.url()).not.toContain(eligibleToken);

  const state = await request.get(`${apiOrigin}/__test/state`);
  expect(await state.json()).toMatchObject({
    cancellationConfirms: 0,
    cancellationState: 'active',
  });

  await page.getByRole('button', { name: 'Unbook this apartment' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Confirm cancellation' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'No, keep my booking' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Confirm cancellation' }),
  ).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Cancel this booking?' }),
  ).toBeVisible();

  const afterDecline = await request.get(`${apiOrigin}/__test/state`);
  expect(await afterDecline.json()).toMatchObject({
    cancellationConfirms: 0,
    cancellationState: 'active',
  });
});

test('requires explicit confirmation before cancelling and refunding', async ({
  page,
  request,
}) => {
  await openCancellation(page, eligibleToken);
  await page.getByRole('button', { name: 'Unbook this apartment' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm cancellation' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Your cancellation request will be submitted for processing.');

  await page.getByRole('button', { name: 'Yes, unbook apartment' }).click();
  await expect(
    page.getByRole('heading', { name: 'Unbooking request received!' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Your cancellation request has been submitted successfully/),
  ).toBeVisible();
  await expect(page.getByText(/Paystack has confirmed your refund/)).toHaveCount(0);

  const state = await request.get(`${apiOrigin}/__test/state`);
  expect(await state.json()).toMatchObject({
    cancellationConfirms: 1,
    cancellationState: 'cancelled',
  });

  // Reusing the same link cannot submit a second cancellation.
  await page.goto('/apartments');
  await openCancellation(page, eligibleToken);
  await expect(
    page.getByRole('heading', {
      name: 'This booking cannot be cancelled online.',
    }),
  ).toBeVisible();
  await expect(page.getByText(/already been cancelled/i)).toBeVisible();
});

test('explains when the 24-hour cancellation deadline has passed', async ({
  page,
}) => {
  await openCancellation(page, ineligibleToken);
  await expect(
    page.getByRole('heading', {
      name: 'This booking cannot be cancelled online.',
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/cancellation deadline has passed/i),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Unbook this apartment' }),
  ).toHaveCount(0);
});

test('shows safe expired and invalid link states', async ({ page }) => {
  await openCancellation(page, expiredToken);
  await expect(
    page.getByRole('heading', {
      name: 'This cancellation link has expired.',
    }),
  ).toBeVisible();

  await page.goto('/apartments');
  await openCancellation(page, 'not-a-valid-token');
  await expect(
    page.getByRole('heading', {
      name: 'This cancellation link is not valid.',
    }),
  ).toBeVisible();
});
