import { expect, test, type Page } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:4100';
const webOrigin = process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3015';

function lagosDateOffset(days: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  const date = new Date(
    `${values.year}-${values.month}-${values.day}T00:00:00Z`,
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarLabel(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

async function openBooking(page: Page) {
  await page.goto('/');
  await page
    .getByRole('link', { name: /book apartments/i })
    .first()
    .click();
  await page.getByRole('link', { name: 'View details' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Lagos Garden Apartment' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Start booking' }).click();
  await expect(page.getByText('Unavailable dates:')).toBeVisible();

  const checkIn = lagosDateOffset(10);
  const checkOut = lagosDateOffset(12);
  await page
    .getByRole('button', { name: calendarLabel(checkIn), exact: true })
    .click();
  await page
    .getByRole('button', { name: calendarLabel(checkOut), exact: true })
    .click();
  await expect(page.getByText(/Calculating your total/))
    .toBeVisible()
    .catch(() => undefined);
  const continueButton = page.getByRole('button', {
    name: 'Continue to guest information',
  });
  await expect(continueButton).toBeEnabled({ timeout: 20_000 });
  await continueButton.click();
  return { checkIn, checkOut };
}

async function submitGuest(page: Page, email = 'guest@example.test') {
  await page.getByLabel('Full name').fill('Alex Guest');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Phone number').fill('+2348012345678');
  await page.getByLabel(/I have read and agree to Staywell's/).check();
  await page
    .getByRole('button', { name: 'Review booking and payment' })
    .click();
}

async function mockPaystackReturn(page: Page) {
  await page.route('https://checkout.paystack.com/**', async (route) => {
    const providerUrl = new URL(route.request().url());
    const reference = providerUrl.searchParams.get('reference');
    const bookingReference = providerUrl.searchParams.get('bookingReference');
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><title>Paystack test checkout</title><main><h1>Mock Paystack test mode</h1><a href="${webOrigin}/booking/payment/callback?reference=${encodeURIComponent(reference ?? '')}&amp;bookingReference=${encodeURIComponent(bookingReference ?? '')}">Complete mocked test payment</a></main>`,
    });
  });
}

test.beforeEach(async ({ request }) => {
  await request.post(`${apiOrigin}/__test/reset`);
});

test('policy page provides both readable policy sections and return navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/terms-and-privacy');
  await expect(
    page.getByRole('heading', {
      name: 'Terms & Conditions and Privacy Notice',
    }),
  ).toBeVisible();
  await expect(page.locator('#terms-bookings')).toContainText(
    'A booking is confirmed only after the backend verifies successful payment',
  );
  await expect(page.locator('#privacy-notice')).toContainText(
    'Nigeria Data Protection Act',
  );
  await expect(
    page.getByRole('link', { name: 'Return to Staywell' }),
  ).toHaveAttribute('href', '/');
  await expect(
    page.getByRole('link', { name: 'Privacy Notice' }).first(),
  ).toHaveAttribute('href', '#privacy-notice');
});

test('completes a guest booking and confirms only after mocked payment verification', async ({
  page,
  request,
}) => {
  await mockPaystackReturn(page);
  await openBooking(page);
  const bookingRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname.endsWith('/bookings'),
  );
  await submitGuest(page);
  const bookingRequest = await bookingRequestPromise;
  await expect(page).toHaveURL(/\/checkout\/AB-/);
  await expect(
    page.getByRole('heading', { name: 'Review your stay.' }),
  ).toBeVisible();

  const bookingReference = new URL(page.url()).pathname.split('/').at(-1)!;
  const accessToken = await page.evaluate(
    (reference) =>
      sessionStorage.getItem(`staywell:booking-token:${reference}`),
    bookingReference,
  );
  const originalHeaders = await bookingRequest.allHeaders();
  const replay = await page.evaluate(
    async ({ headers, body }) => {
      const response = await fetch('http://127.0.0.1:4100/api/v1/bookings', {
        method: 'POST',
        headers,
        body,
      });
      return response.json();
    },
    {
      headers: {
        authorization: originalHeaders.authorization!,
        'idempotency-key': originalHeaders['idempotency-key']!,
        'content-type': 'application/json',
      },
      body: bookingRequest.postData()!,
    },
  );
  expect(replay.item.replayed).toBe(true);

  const secondGuestToken = 'b'.repeat(64);
  const secondGuest = await request.post(`${apiOrigin}/api/v1/bookings`, {
    headers: {
      authorization: `Bearer ${secondGuestToken}`,
      'idempotency-key': 'second-guest-test-idempotency-key',
    },
    data: {
      apartmentId: 'f410a7e3-7aa0-4fb7-a4af-794c85a85bfe',
      checkIn: '2035-05-10',
      checkOut: '2035-05-12',
      guestCount: 1,
      email: 'other-guest@example.test',
    },
  });
  const secondGuestReference = (await secondGuest.json()).item
    .bookingReference as string;
  const crossBookingAccess = await request.get(
    `${apiOrigin}/api/v1/bookings/${secondGuestReference}/checkout`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  expect(crossBookingAccess.status()).toBe(401);

  await page.getByRole('button', { name: 'Continue to Paystack' }).click();
  await expect(page).toHaveURL(/checkout\.paystack\.com/);
  await page
    .getByRole('link', { name: 'Complete mocked test payment' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your stay is confirmed.' }),
  ).toBeVisible();
  await expect(page.getByText(bookingReference)).toBeVisible();

  const state = (await (
    await request.get(`${apiOrigin}/__test/state`)
  ).json()) as {
    bookingAttempts: number;
    paymentAttempts: number;
    bookings: number;
  };
  expect(state).toEqual({
    bookingAttempts: 3,
    paymentAttempts: 1,
    bookings: 2,
  });
});

test('shows unavailable dates as disabled in the booking calendar', async ({
  page,
}) => {
  const unavailable = calendarLabel(lagosDateOffset(7));
  await page.goto(
    '/booking?apartmentId=f410a7e3-7aa0-4fb7-a4af-794c85a85bfe&apartmentSlug=lagos-garden-apartment',
  );
  await expect(
    page.getByRole('button', {
      name: `${unavailable}, unavailable`,
      exact: true,
    }),
  ).toBeDisabled();
});

test('rejects invalid guest details before creating a booking', async ({
  page,
  request,
}) => {
  await openBooking(page);
  await page.getByLabel('Full name').fill('Alex Guest');
  await page.getByLabel('Email address').fill('alex@example.test');
  await page.getByLabel('Phone number').fill('bad');
  await page.getByLabel(/I have read and agree to Staywell's/).check();
  await page
    .getByRole('button', { name: 'Review booking and payment' })
    .click();
  await expect(page.getByText('Enter a valid phone number.')).toBeVisible();
  const state = (await (
    await request.get(`${apiOrigin}/__test/state`)
  ).json()) as { bookings: number };
  expect(state.bookings).toBe(0);
});

test('requires policy acceptance and links both documents from booking', async ({
  page,
  request,
}) => {
  await openBooking(page);
  await page.getByLabel('Full name').fill('Alex Guest');
  await page.getByLabel('Email address').fill('alex@example.test');
  await page.getByLabel('Phone number').fill('+2348012345678');
  const policyCheckbox = page.getByLabel(/I have read and agree to Staywell's/);
  await expect(policyCheckbox).not.toBeChecked();
  await expect(
    page.getByRole('link', { name: 'Terms & Conditions' }),
  ).toHaveAttribute('href', '/terms-and-privacy#terms-and-conditions');
  await expect(
    page.getByRole('link', { name: 'Privacy Notice' }),
  ).toHaveAttribute('href', '/terms-and-privacy#privacy-notice');
  await page
    .getByRole('button', { name: 'Review booking and payment' })
    .click();
  await expect(
    page.getByText(
      'Agree to the Terms & Conditions and Privacy Notice to continue.',
    ),
  ).toBeVisible();
  const state = (await (
    await request.get(`${apiOrigin}/__test/state`)
  ).json()) as { bookings: number };
  expect(state.bookings).toBe(0);
});

test('shows provider initialization failures without claiming payment succeeded', async ({
  page,
}) => {
  await openBooking(page);
  await submitGuest(page, 'payment-fail@example.test');
  await expect(
    page.getByRole('heading', { name: 'Review your stay.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Paystack' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Mock payment provider failure',
  );
  await expect(page.getByText(/Reservation status: pending/)).toBeVisible();
});

test('shows a declined provider verification as unconfirmed', async ({
  page,
}) => {
  await mockPaystackReturn(page);
  await openBooking(page);
  await submitGuest(page, 'verify-fail@example.test');
  await page.getByRole('button', { name: 'Continue to Paystack' }).click();
  await page
    .getByRole('link', { name: 'Complete mocked test payment' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'We could not confirm payment.' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Payment was not completed. The reservation is not confirmed.',
    ),
  ).toBeVisible();
});
