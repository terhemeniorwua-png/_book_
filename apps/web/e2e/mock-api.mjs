import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const host = '127.0.0.1';
const port = Number(process.env.E2E_API_PORT ?? 4100);
const apartmentId = 'f410a7e3-7aa0-4fb7-a4af-794c85a85bfe';
const apartment = {
  id: apartmentId,
  slug: 'lagos-garden-apartment',
  name: 'Lagos Garden Apartment',
  shortDescription: 'A calm apartment for a Lagos stay.',
  fullDescription: 'A bright, comfortable home base in Lagos.',
  nightlyPrice: '25000.00',
  currency: 'NGN',
  bedrooms: 2,
  bathrooms: '2.0',
  maxGuests: 4,
  displayLocation: 'Lagos',
  locality: 'Ikeja',
  region: 'Lagos State',
  countryCode: 'NG',
  minStayNights: 1,
  maxStayNights: 30,
  coverImageUrl: null,
  coverImageAlt: null,
  amenities: [{ slug: 'wifi', name: 'Wi-Fi' }],
  images: [],
  pricing: {
    nightlyPrice: '25000.00',
    currency: 'NGN',
    minimumStayNights: 1,
    maximumStayNights: 30,
    additionalCharges: [],
  },
  houseRules: [],
  checkInPolicy: 'Check-in details will be shared after confirmation.',
  checkOutPolicy: 'Check out by 11:00 AM.',
  cancellationPolicy: 'Contact the property about cancellation terms.',
};

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}
function addDays(days) {
  const current = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(current);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  const today = new Date(
    `${values.year}-${values.month}-${values.day}T00:00:00Z`,
  );
  today.setUTCDate(today.getUTCDate() + days);
  return dateOnly(today);
}

const bookings = new Map();
const idempotency = new Map();
let bookingAttempts = 0;
let paymentAttempts = 0;
let cancellationConfirms = 0;
let cancellationState = 'active';
const cancellationToken = 'A'.repeat(43);
const ineligibleCancellationToken = 'B'.repeat(43);
const expiredCancellationToken = 'C'.repeat(43);

function send(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers':
      'authorization,content-type,idempotency-key,x-cancellation-token',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  response.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJson(request) {
  let data = '';
  for await (const chunk of request) data += chunk;
  return data ? JSON.parse(data) : {};
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204);
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  if (url.pathname === '/health') return send(response, 200, { status: 'ok' });
  if (request.method === 'POST' && url.pathname === '/__test/reset') {
    bookings.clear();
    idempotency.clear();
    bookingAttempts = 0;
    paymentAttempts = 0;
    cancellationConfirms = 0;
    cancellationState = 'active';
    return send(response, 204);
  }
  if (url.pathname === '/__test/state')
    return send(response, 200, {
      bookingAttempts,
      paymentAttempts,
      bookings: bookings.size,
      cancellationConfirms,
      cancellationState,
    });

  const base = '/api/v1';
  if (!url.pathname.startsWith(base))
    return send(response, 404, { error: { message: 'not found' } });
  const path = url.pathname.slice(base.length);

  if (request.method === 'GET' && path === '/apartments') {
    return send(response, 200, {
      items: [apartment],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      filters: { amenities: apartment.amenities },
    });
  }
  if (request.method === 'GET' && path === `/apartments/${apartment.slug}`)
    return send(response, 200, { item: apartment });

  const availabilityMatch = path.match(
    new RegExp(`^/apartments/${apartmentId}/availability$`),
  );
  if (request.method === 'GET' && availabilityMatch) {
    return send(response, 200, {
      apartment: {
        id: apartment.id,
        name: apartment.name,
        nightlyPrice: apartment.nightlyPrice,
        currency: apartment.currency,
        minStayNights: apartment.minStayNights,
        maxStayNights: apartment.maxStayNights,
        maxGuests: apartment.maxGuests,
        checkInPolicy: apartment.checkInPolicy,
        checkOutPolicy: apartment.checkOutPolicy,
      },
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      unavailableRanges: [{ startDate: addDays(7), endDate: addDays(9) }],
    });
  }
  const quoteMatch = path.match(
    new RegExp(`^/apartments/${apartmentId}/quote$`),
  );
  if (request.method === 'POST' && quoteMatch) {
    const body = await readJson(request);
    const nights =
      (Date.parse(body.checkOut) - Date.parse(body.checkIn)) / 86400000;
    const total = (25000 * nights).toFixed(2);
    return send(response, 200, {
      item: {
        apartment: {
          id: apartment.id,
          name: apartment.name,
          minStayNights: 1,
          maxStayNights: 30,
          maxGuests: 4,
          checkInPolicy: apartment.checkInPolicy,
          checkOutPolicy: apartment.checkOutPolicy,
        },
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        guestCount: body.guestCount,
        nights,
        nightlyPrice: '25000.00',
        currency: 'NGN',
        totalAmount: total,
        priceBreakdown: {
          nightly: {
            unitAmount: '25000.00',
            quantity: nights,
            lineTotal: total,
          },
          charges: [],
          discounts: [],
          discountTotal: '0.00',
          subtotal: total,
          total,
        },
      },
    });
  }

  if (request.method === 'POST' && path === '/bookings') {
    bookingAttempts += 1;
    const body = await readJson(request);
    const key = request.headers['idempotency-key'];
    let booking = idempotency.get(key);
    if (!booking) {
      const bookingReference = `AB-${randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()}`;
      booking = {
        bookingReference,
        accessToken: request.headers.authorization?.replace(/^Bearer /, ''),
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        guestCount: body.guestCount,
        guestEmail: body.email,
        status: 'pending',
        paymentStatus: 'pending',
        nights:
          (Date.parse(body.checkOut) - Date.parse(body.checkIn)) / 86400000,
        totalAmount: '50000.00',
        currency: 'NGN',
        priceBreakdown: {
          nightly: {
            unitAmount: '25000.00',
            quantity: 2,
            lineTotal: '50000.00',
          },
          charges: [],
          discounts: [],
          discountTotal: '0.00',
          subtotal: '50000.00',
          total: '50000.00',
        },
      };
      bookings.set(bookingReference, booking);
      idempotency.set(key, booking);
    }
    return send(response, 201, {
      item: {
        bookingReference: booking.bookingReference,
        status: 'pending',
        paymentStatus: 'pending',
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guestCount: booking.guestCount,
        nights: booking.nights,
        currency: 'NGN',
        totalAmount: booking.totalAmount,
        priceBreakdown: booking.priceBreakdown,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        accessToken: booking.accessToken,
        replayed: bookingAttempts > 1,
      },
    });
  }

  const checkoutMatch = path.match(/^\/bookings\/(AB-[A-F0-9]{14})\/checkout$/);
  if (request.method === 'GET' && checkoutMatch) {
    const booking = bookings.get(checkoutMatch[1]);
    if (
      !booking ||
      request.headers.authorization !== `Bearer ${booking.accessToken}`
    )
      return send(response, 401, {
        error: { message: 'Booking access denied' },
      });
    return send(response, 200, {
      item: {
        bookingReference: booking.bookingReference,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guestCount: booking.guestCount,
        nights: booking.nights,
        currency: booking.currency,
        totalAmount: booking.totalAmount,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        priceBreakdown: booking.priceBreakdown,
        apartment: {
          id: apartment.id,
          slug: apartment.slug,
          name: apartment.name,
          displayLocation: apartment.displayLocation,
          cancellationPolicy: apartment.cancellationPolicy,
          imageUrl: null,
          imageAlt: null,
        },
        paymentTerms:
          'Payment must be verified before your reservation is confirmed.',
      },
    });
  }

  const initializeMatch = path.match(
    /^\/payments\/bookings\/(AB-[A-F0-9]{14})\/initialize$/,
  );
  if (request.method === 'POST' && initializeMatch) {
    paymentAttempts += 1;
    const booking = bookings.get(initializeMatch[1]);
    if (
      !booking ||
      request.headers.authorization !== `Bearer ${booking.accessToken}`
    )
      return send(response, 401, {
        error: { message: 'Booking access denied' },
      });
    if (booking.guestEmail === 'payment-fail@example.test')
      return send(response, 502, {
        error: { message: 'Mock payment provider failure' },
      });
    booking.paymentReference = `mockref${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    return send(response, 200, {
      item: {
        authorizationUrl: `https://checkout.paystack.com/mock?reference=${booking.paymentReference}&bookingReference=${booking.bookingReference}`,
        reference: booking.paymentReference,
        currency: 'NGN',
      },
    });
  }
  if (request.method === 'POST' && path === '/payments/verify') {
    const body = await readJson(request);
    const booking = bookings.get(body.bookingReference);
    if (
      !booking ||
      request.headers.authorization !== `Bearer ${booking.accessToken}`
    )
      return send(response, 401, {
        error: { message: 'Booking access denied' },
      });
    if (body.reference !== booking.paymentReference)
      return send(response, 400, { error: { message: 'Reference mismatch' } });
    if (booking.guestEmail === 'verify-fail@example.test')
      return send(response, 200, {
        item: { status: 'failed', bookingStatus: 'pending' },
      });
    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    return send(response, 200, {
      item: { status: 'succeeded', bookingStatus: 'confirmed' },
    });
  }
  const cancellationItem = () => {
    const cancelled = cancellationState === 'cancelled';
    return {
      bookingReference: 'AB-1234567890ABCD',
      bookingStatus: cancelled ? 'cancelled' : 'confirmed',
      paymentStatus: cancelled ? 'refunded' : 'paid',
      guestName: 'Alex Guest',
      apartment: {
        name: apartment.name,
        location: apartment.displayLocation,
      },
      checkIn: addDays(10),
      checkOut: addDays(12),
      nights: 2,
      guestCount: 2,
      amountPaid: '50000.00',
      currency: 'NGN',
      scheduledCheckInAt: new Date(
        `${addDays(10)}T13:00:00.000Z`,
      ).toISOString(),
      cancellationDeadline: new Date(
        `${addDays(9)}T13:00:00.000Z`,
      ).toISOString(),
      deadlineLabel: `${addDays(9)} at 14:00`,
      timeZone: 'Africa/Lagos',
      eligible: !cancelled,
      reason: cancelled ? 'ALREADY_CANCELLED' : null,
      message: cancelled
        ? 'This booking has already been cancelled.'
        : 'This booking can be cancelled online.',
      checkedAt: new Date().toISOString(),
      alreadyCancelled: cancelled,
      cancelledAt: cancelled ? new Date().toISOString() : null,
      refundStatus: cancelled ? 'successful' : null,
    };
  };
  if (request.method === 'GET' && path === '/cancellations/request') {
    const token = request.headers['x-cancellation-token'];
    if (token === expiredCancellationToken)
      return send(response, 410, {
        error: {
          message:
            'This cancellation link has expired. Contact Staywell support for help.',
        },
      });
    if (token === cancellationToken)
      return send(response, 200, { item: cancellationItem() });
    if (token === ineligibleCancellationToken)
      return send(response, 200, {
        item: {
          ...cancellationItem(),
          eligible: false,
          reason: 'CANCELLATION_DEADLINE_PASSED',
          message:
            'The cancellation deadline has passed. This booking can no longer be cancelled online.',
        },
      });
    return send(response, 404, {
      error: {
        message:
          'This cancellation link is not valid. Use the link from your booking confirmation email.',
      },
    });
  }
  if (request.method === 'POST' && path === '/cancellations/confirm') {
    const token = request.headers['x-cancellation-token'];
    if (token === expiredCancellationToken)
      return send(response, 410, {
        error: {
          message:
            'This cancellation link has expired. Contact Staywell support for help.',
        },
      });
    if (token === ineligibleCancellationToken)
      return send(response, 409, {
        error: {
          message:
            'The cancellation deadline has passed. This booking can no longer be cancelled online.',
        },
      });
    if (token !== cancellationToken)
      return send(response, 404, {
        error: {
          message:
            'This cancellation link is not valid. Use the link from your booking confirmation email.',
        },
      });
    if (cancellationState === 'cancelled')
      return send(response, 409, {
        error: {
          message:
            'This cancellation request has already been submitted. Check your email for updates.',
        },
      });
    cancellationConfirms += 1;
    cancellationState = 'cancelled';
    return send(response, 200, {
      item: {
        bookingReference: 'AB-1234567890ABCD',
        bookingStatus: 'cancelled',
        refundStatus: 'successful',
        message: 'Unbooking request received!',
      },
    });
  }
  return send(response, 404, { error: { message: 'not found' } });
});

server.listen(port, host);
