'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApiBase, adminRequest } from '@/lib/admin-api';

type Session = {
  csrfToken: string;
  admin: { email: string; displayName: string; role: string };
};
type Tab =
  | 'Overview'
  | 'Apartments'
  | 'Bookings'
  | 'Availability'
  | 'Payments'
  | 'Refunds'
  | 'Audit';
type Item = Record<string, unknown>;

export default function AdminDashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [items, setItems] = useState<Item[]>([]);
  const [metrics, setMetrics] = useState<Item | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionReasons, setActionReasons] = useState<Record<string, string>>(
    {},
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [bookingStatus, setBookingStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [apartmentId, setApartmentId] = useState('');
  const [selectedApartment, setSelectedApartment] = useState<Item | null>(null);
  const [amenities, setAmenities] = useState<Item[]>([]);
  const [calendarFrom, setCalendarFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [calendarTo, setCalendarTo] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch(`${adminApiBase}/auth/session`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        window.location.replace('/admin/login');
        return;
      }
      const body = (await response.json()) as { item: Session };
      setSession(body.item);
    } catch {
      setError('The administrator API is unavailable.');
    }
  }, []);
  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const loadTab = useCallback(
    async (selected: Tab, csrf: string) => {
      setBusy(true);
      setError('');
      setNotice('');
      try {
        if (selected === 'Overview') {
          const result = await adminRequest<{ item: Item }>('/dashboard', csrf);
          setMetrics(result.item);
          setItems([]);
        } else {
          const paths: Record<Tab, string> = {
            Overview: '/dashboard',
            Apartments: '/apartments',
            Bookings: `/bookings?limit=25&page=${page}${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ''}${bookingStatus ? `&status=${bookingStatus}` : ''}`,
            Availability: `/availability/calendar?from=${calendarFrom}&to=${calendarTo}`,
            Payments: '/payments?limit=25',
            Refunds: '/refunds?limit=25',
            Audit: '/audit?limit=25',
          };
          const result = await adminRequest<{ items?: Item[]; item?: Item }>(
            paths[selected],
            csrf,
          );
          if (selected === 'Apartments') {
            const amenityResult = await adminRequest<{ items: Item[] }>(
              '/amenities',
              csrf,
            );
            setAmenities(amenityResult.items);
          }
          const value = result.items ?? result.item;
          const pagination =
            result.item && typeof result.item === 'object'
              ? ((result.item as Item).pagination as Item | undefined)
              : undefined;
          setTotalPages(Number(pagination?.totalPages ?? 1));
          setItems(
            Array.isArray(value)
              ? value
              : value && typeof value === 'object'
                ? Object.entries(value).flatMap(([key, rows]) =>
                    Array.isArray(rows)
                      ? rows.map((row) => ({ ...row, kind: key }))
                      : [],
                  )
                : [],
          );
        }
      } catch (issue) {
        setError(
          issue instanceof Error
            ? issue.message
            : 'Could not load this section.',
        );
      } finally {
        setBusy(false);
      }
    },
    [calendarFrom, calendarTo, page, searchTerm, bookingStatus],
  );
  useEffect(() => {
    if (session) void loadTab(tab, session.csrfToken);
  }, [session, tab, loadTab]);

  async function act(path: string, method: string, body?: unknown) {
    if (!session) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await adminRequest(path, session.csrfToken, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      setNotice('Changes saved.');
      await loadTab(tab, session.csrfToken);
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : 'The action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (!session) return;
    try {
      await adminRequest('/auth/logout', session.csrfToken, {
        method: 'POST',
        body: '{}',
      });
    } finally {
      window.location.replace('/admin/login');
    }
  }

  if (!session)
    return (
      <main className="mx-auto max-w-4xl px-5 py-16" aria-live="polite">
        {error || 'Loading administrator session…'}
      </main>
    );
  const title = (value: unknown) =>
    typeof value === 'string' ? value : JSON.stringify(value);
  const renderRows = (rows: Item[]) =>
    rows.map((row, index) => (
      <article
        key={String(row.id ?? row.bookingReference ?? index)}
        className="rounded-2xl border border-stone-200 bg-white p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-stone-900">
              {String(
                row.name ??
                  row.bookingReference ??
                  row.reference ??
                  row.action ??
                  row.kind ??
                  'Record',
              )}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {String(row.slug ?? row.status ?? row.targetType ?? '')}
              {row.apartment && typeof row.apartment === 'object'
                ? ` · ${String((row.apartment as Item).name ?? '')}`
                : ''}
            </p>
          </div>
          {tab === 'Apartments' && (
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() =>
                  void act(`/apartments/${String(row.id)}`, 'PATCH', {
                    status: row.status === 'published' ? 'draft' : 'published',
                  })
                }
                className="rounded-full border border-stone-300 px-3 py-2 text-xs font-medium"
              >
                {row.status === 'published' ? 'Unpublish' : 'Publish'}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setApartmentId(String(row.id));
                  setSelectedApartment(row);
                }}
                className="rounded-full border border-stone-300 px-3 py-2 text-xs font-medium"
              >
                Edit
              </button>
            </div>
          )}
          {tab === 'Bookings' &&
            ['pending', 'confirmed'].includes(String(row.status)) && (
              <div className="flex items-center gap-2">
                <input
                  aria-label="Cancellation reason"
                  placeholder="Reason (8+ characters)"
                  value={actionReasons[String(row.id)] ?? ''}
                  onChange={(event) =>
                    setActionReasons((previous) => ({
                      ...previous,
                      [String(row.id)]: event.target.value,
                    }))
                  }
                  className="max-w-48 rounded-lg border px-2 py-2 text-xs"
                />
                <button
                  disabled={
                    busy ||
                    (actionReasons[String(row.id)] ?? '').trim().length < 8
                  }
                  onClick={() =>
                    void act(`/bookings/${String(row.id)}/status`, 'PATCH', {
                      status: 'cancelled',
                      reason: actionReasons[String(row.id)],
                    })
                  }
                  className="rounded-full border border-red-300 px-3 py-2 text-xs font-medium text-red-800"
                >
                  Cancel
                </button>
              </div>
            )}
          {tab === 'Payments' &&
            session.admin.role === 'superadmin' &&
            Boolean(row.booking) && (
              <div className="flex items-center gap-2">
                <input
                  aria-label="Refund reason"
                  placeholder="Reason (8+ characters)"
                  value={actionReasons[String(row.id)] ?? ''}
                  onChange={(event) =>
                    setActionReasons((previous) => ({
                      ...previous,
                      [String(row.id)]: event.target.value,
                    }))
                  }
                  className="max-w-48 rounded-lg border px-2 py-2 text-xs"
                />
                <button
                  disabled={
                    busy ||
                    row.status !== 'succeeded' ||
                    (actionReasons[String(row.id)] ?? '').trim().length < 8
                  }
                  onClick={() =>
                    void act(
                      `/bookings/${String((row.booking as Item).id)}/refund`,
                      'POST',
                      { reason: actionReasons[String(row.id)] },
                    )
                  }
                  className="rounded-full border border-amber-300 px-3 py-2 text-xs font-medium"
                >
                  Request refund
                </button>
              </div>
            )}
          {tab === 'Refunds' &&
            session.admin.role === 'superadmin' &&
            row.status === 'failed' && (
              <div className="flex items-center gap-2">
                <input
                  aria-label="Refund retry reason"
                  placeholder="Reason (8+ characters)"
                  value={actionReasons[String(row.id)] ?? ''}
                  onChange={(event) =>
                    setActionReasons((previous) => ({
                      ...previous,
                      [String(row.id)]: event.target.value,
                    }))
                  }
                  className="max-w-48 rounded-lg border px-2 py-2 text-xs"
                />
                <button
                  disabled={
                    busy ||
                    (actionReasons[String(row.id)] ?? '').trim().length < 8
                  }
                  onClick={() =>
                    void act(`/refunds/${String(row.id)}/retry`, 'POST', {
                      reason: actionReasons[String(row.id)],
                    })
                  }
                  className="rounded-full border border-amber-300 px-3 py-2 text-xs font-medium"
                >
                  Retry refund
                </button>
              </div>
            )}
          {tab === 'Availability' && row.kind === 'blocks' && (
            <button
              disabled={busy}
              onClick={() =>
                void act(`/availability/blocks/${String(row.id)}`, 'DELETE')
              }
              className="rounded-full border border-red-300 px-3 py-2 text-xs text-red-800"
            >
              Remove block
            </button>
          )}
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          {Object.entries(row)
            .filter(
              ([key, value]) =>
                ![
                  'id',
                  'name',
                  'slug',
                  'images',
                  'charges',
                  'amenities',
                  'paymentTransactions',
                  'kind',
                  'metadata',
                ].includes(key) &&
                (typeof value === 'string' ||
                  typeof value === 'number' ||
                  typeof value === 'boolean'),
            )
            .slice(0, 9)
            .map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wide text-stone-500">
                  {key
                    .replace(/[A-Z]/g, (letter) => ` ${letter}`)
                    .replaceAll('_', ' ')}
                </dt>
                <dd className="mt-1 break-words text-stone-800">
                  {title(value)}
                </dd>
              </div>
            ))}
        </dl>
        {tab === 'Bookings' &&
          Boolean(row.guest) &&
          typeof row.guest === 'object' && (
            <p className="mt-3 text-sm text-stone-700">
              Guest: {String((row.guest as Item).firstName)}{' '}
              {String((row.guest as Item).lastName)} ·{' '}
              {String((row.guest as Item).email)} ·{' '}
              {String((row.guest as Item).phone)}
            </p>
          )}
        {tab === 'Bookings' &&
          Boolean(row.cancellation) &&
          typeof row.cancellation === 'object' && (
            <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-800">
              <p className="font-medium">Cancellation</p>
              <p className="mt-1 text-xs leading-5">
                Requested{' '}
                {String((row.cancellation as Item).requestedAt ?? '—')} ·
                Deadline {String((row.cancellation as Item).deadlineAt ?? '—')}{' '}
                · Source {String((row.cancellation as Item).source ?? '—')}
              </p>
              {Boolean(row.refund) && typeof row.refund === 'object' ? (
                <p className="mt-1 text-xs leading-5">
                  Refund {String((row.refund as Item).status ?? '—')} ·{' '}
                  {String((row.refund as Item).amount ?? '')}{' '}
                  {String((row.refund as Item).currency ?? '')} · Provider ref{' '}
                  {String(
                    (row.refund as Item).providerRefundId ??
                      (row.refund as Item).providerReference ??
                      '—',
                  )}
                  {row.refund && (row.refund as Item).failureReason
                    ? ` · Failure: ${String((row.refund as Item).failureReason)}`
                    : ''}
                </p>
              ) : (
                <p className="mt-1 text-xs leading-5">No refund record.</p>
              )}
            </div>
          )}
        {tab === 'Refunds' && (
          <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-800">
            <p className="text-xs leading-5">
              Booking {String(row.bookingReference ?? '—')} · Booking status{' '}
              {String(row.bookingStatus ?? '—')} · Payment{' '}
              {String(row.originalPaymentReference ?? '—')} (
              {String(row.originalPaymentStatus ?? '—')})
            </p>
            <p className="mt-1 text-xs leading-5">
              Requested {String(row.cancellationRequestedAt ?? '—')} · Completed{' '}
              {String(row.cancellationCompletedAt ?? '—')} · Attempts{' '}
              {String(row.attempts ?? 0)}
            </p>
            <p className="mt-1 text-xs leading-5">
              Provider refund ref {String(row.providerRefundId ?? '—')} ·
              Failure {String(row.failureReason ?? 'none')} · Processed{' '}
              {String(row.processedAt ?? '—')}
            </p>
          </div>
        )}
        {Array.isArray(row.images) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(row.images as Item[]).map((image) => (
              <span
                key={String(image.id)}
                className="rounded bg-stone-100 px-2 py-1 text-xs"
              >
                {String(image.altText)}{' '}
                {image.isPublished ? '· public' : '· draft'}
              </span>
            ))}
          </div>
        )}
      </article>
    ));

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-800">
            Staywell administration
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-900">
            Welcome, {session.admin.displayName}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {session.admin.email} · {session.admin.role}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/"
            className="rounded-full border border-stone-300 px-4 py-2 text-sm"
          >
            View website
          </Link>
          <button
            onClick={() => void signOut()}
            className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white"
          >
            Sign out
          </button>
        </div>
      </header>
      <nav
        className="mt-8 flex gap-2 overflow-x-auto border-b border-stone-200 pb-3"
        aria-label="Administration sections"
      >
        {(
          [
            'Overview',
            'Apartments',
            'Bookings',
            'Availability',
            'Payments',
            'Refunds',
            'Audit',
          ] as Tab[]
        ).map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            aria-current={tab === name ? 'page' : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm ${tab === name ? 'bg-emerald-900 text-white' : 'bg-white text-stone-700'}`}
          >
            {name}
          </button>
        ))}
      </nav>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {tab === 'Overview' && metrics && (
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(metrics)
            .filter(
              ([key, value]) => key !== 'revenue' && typeof value !== 'object',
            )
            .map(([key, value]) => (
              <article
                key={key}
                className="rounded-2xl border border-stone-200 bg-white p-5"
              >
                <p className="text-sm text-stone-600">
                  {key.replace(/[A-Z]/g, (letter) => ` ${letter}`)}
                </p>
                <p className="mt-2 text-3xl font-semibold">{String(value)}</p>
              </article>
            ))}
          {Boolean(metrics.revenue) && (
            <article className="rounded-2xl border border-emerald-900/20 bg-emerald-50 p-5 sm:col-span-2">
              <h2 className="font-semibold">Verified Paystack receipts</h2>
              <p className="mt-2 text-sm">
                Gross {String((metrics.revenue as Item).grossReceipts)} ·
                Refunded {String((metrics.revenue as Item).completedRefunds)} ·
                Net {String((metrics.revenue as Item).netReceipts)}{' '}
                {String((metrics.revenue as Item).currency)}
              </p>
              <p className="mt-2 text-xs text-stone-600">
                {String((metrics.revenue as Item).basis)}
              </p>
            </article>
          )}
        </section>
      )}
      {tab === 'Apartments' && (
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            {busy ? 'Loading apartments…' : renderRows(items)}
          </div>
          <div className="space-y-4">
            <ApartmentForm
              csrf={session.csrfToken}
              amenities={amenities}
              apartmentId={apartmentId}
              initial={selectedApartment}
              clearSelected={() => {
                setApartmentId('');
                setSelectedApartment(null);
              }}
              onSaved={() => void loadTab('Apartments', session.csrfToken)}
            />
            {apartmentId && (
              <ImageManager
                csrf={session.csrfToken}
                apartmentId={apartmentId}
                images={
                  Array.isArray(selectedApartment?.images)
                    ? (selectedApartment.images as Item[])
                    : []
                }
                onSaved={() => void loadTab('Apartments', session.csrfToken)}
              />
            )}
          </div>
        </section>
      )}
      {tab === 'Availability' && (
        <section className="mt-6">
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              From
              <input
                type="date"
                value={calendarFrom}
                onChange={(event) => setCalendarFrom(event.target.value)}
                className="mt-1 block rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              To
              <input
                type="date"
                value={calendarTo}
                onChange={(event) => setCalendarTo(event.target.value)}
                className="mt-1 block rounded-lg border px-3 py-2"
              />
            </label>
            <button
              onClick={() => void loadTab('Availability', session.csrfToken)}
              className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white"
            >
              Load dates
            </button>
          </div>
          <AvailabilityForm
            csrf={session.csrfToken}
            onSaved={() => void loadTab('Availability', session.csrfToken)}
          />
          {items.length ? (
            <div className="mt-5 space-y-3">{renderRows(items)}</div>
          ) : (
            <p className="mt-6 text-sm text-stone-600">
              No reservations or blocked dates in this range.
            </p>
          )}
        </section>
      )}
      {['Bookings', 'Payments', 'Refunds', 'Audit'].includes(tab) && (
        <section className="mt-6 space-y-3">
          {tab === 'Bookings' && (
            <div className="flex flex-wrap gap-3 rounded-2xl bg-white p-4">
              <input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Search reference, guest, apartment"
                className="min-w-56 flex-1 rounded-lg border px-3 py-2 text-sm"
              />
              <select
                value={bookingStatus}
                onChange={(event) => {
                  setBookingStatus(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">All booking states</option>
                {[
                  'pending',
                  'confirmed',
                  'cancellation_requested',
                  'checked_in',
                  'completed',
                  'cancelled',
                  'expired',
                  'rejected',
                ].map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </div>
          )}
          {busy ? (
            'Loading records…'
          ) : items.length ? (
            renderRows(items)
          ) : (
            <p className="rounded-2xl bg-white p-6 text-stone-600">
              No records found.
            </p>
          )}
          {tab === 'Bookings' && (
            <div className="flex items-center justify-between">
              <button
                disabled={page <= 1 || busy}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-full border px-4 py-2 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-stone-600">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages || busy}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-full border px-4 py-2 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function ApartmentForm({
  csrf,
  amenities,
  apartmentId,
  initial,
  clearSelected,
  onSaved,
}: {
  csrf: string;
  amenities: Item[];
  apartmentId: string;
  initial: Item | null;
  clearSelected: () => void;
  onSaved: () => void;
}) {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(data: FormData) {
    setSaving(true);
    setMessage('');
    const feeName = String(data.get('feeName') ?? '').trim();
    const feeAmount = String(data.get('feeAmount') ?? '').trim();
    const fields = {
      name: String(data.get('name')),
      slug: String(data.get('slug')),
      shortDescription: String(data.get('shortDescription')),
      fullDescription: String(data.get('fullDescription')),
      nightlyPrice: String(data.get('nightlyPrice')),
      currency: 'NGN',
      bedrooms: Number(data.get('bedrooms')),
      bathrooms: Number(data.get('bathrooms')),
      maxGuests: Number(data.get('maxGuests')),
      displayLocation: String(data.get('displayLocation')),
      timezone: String(data.get('timezone') ?? '').trim() || null,
      checkInTime: String(data.get('checkInTime') ?? '').trim() || null,
      checkOutTime: String(data.get('checkOutTime') ?? '').trim() || null,
      minStayNights: Number(data.get('minStayNights') || 1),
      ...(String(data.get('maxStayNights') ?? '').trim()
        ? { maxStayNights: Number(data.get('maxStayNights')) }
        : {}),
      ...(feeName && feeAmount
        ? {
            charges: [
              {
                name: feeName,
                chargeType: 'fee',
                calculationBasis: 'flat',
                amount: feeAmount,
                currency: 'NGN',
                isRequired: true,
                isActive: true,
              },
            ],
          }
        : {}),
      amenityIds: data.getAll('amenityIds').map(String),
    };
    try {
      await adminRequest(
        apartmentId ? `/apartments/${apartmentId}` : '/apartments',
        csrf,
        {
          method: apartmentId ? 'PATCH' : 'POST',
          body: JSON.stringify(fields),
        },
      );
      setMessage('Apartment saved.');
      clearSelected();
      onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not save apartment.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      key={apartmentId || 'new'}
      action={submit}
      className="h-fit rounded-2xl border border-stone-200 bg-white p-5"
    >
      <h2 className="font-semibold">
        {apartmentId ? 'Edit apartment' : 'Add apartment'}
      </h2>
      <p className="mt-1 text-xs text-stone-500">
        New listings start as drafts. Configure nightly pricing, capacity, stay
        rules, and an optional flat fee.
      </p>
      <div className="mt-4 space-y-3">
        {[
          ['name', 'Name'],
          ['slug', 'URL slug'],
          ['shortDescription', 'Short description'],
          ['fullDescription', 'Full description'],
          ['nightlyPrice', 'Nightly price (NGN)'],
          ['bedrooms', 'Bedrooms'],
          ['bathrooms', 'Bathrooms'],
          ['maxGuests', 'Maximum guests'],
          ['displayLocation', 'Display location'],
          ['timezone', 'Timezone (IANA, optional)'],
          ['checkInTime', 'Check-in time (HH:MM, optional)'],
          ['checkOutTime', 'Check-out time (HH:MM, optional)'],
          ['minStayNights', 'Minimum nights'],
          ['maxStayNights', 'Maximum nights (optional)'],
          ['feeName', 'Optional fee name'],
          ['feeAmount', 'Optional flat fee (NGN)'],
        ].map(([name, label]) => (
          <label key={name} className="block text-sm">
            {label}
            <input
              required={
                ![
                  'feeName',
                  'feeAmount',
                  'maxStayNights',
                  'timezone',
                  'checkInTime',
                  'checkOutTime',
                ].includes(name)
              }
              name={name}
              type={
                [
                  'bedrooms',
                  'bathrooms',
                  'maxGuests',
                  'nightlyPrice',
                  'minStayNights',
                  'maxStayNights',
                  'feeAmount',
                ].includes(name)
                  ? 'number'
                  : name === 'checkInTime' || name === 'checkOutTime'
                    ? 'time'
                    : 'text'
              }
              step={name === 'bathrooms' ? '0.5' : 'any'}
              defaultValue={
                initial?.[name] !== undefined
                  ? String(initial[name])
                  : name === 'bedrooms'
                    ? 1
                    : ['bathrooms', 'maxGuests', 'minStayNights'].includes(name)
                      ? 1
                      : name === 'nightlyPrice'
                        ? '25000'
                        : name === 'timezone'
                          ? 'Africa/Lagos'
                          : name === 'checkInTime'
                            ? '14:00'
                            : ''
              }
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
        ))}
      </div>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium">Amenities</legend>
        {amenities.map((amenity) => (
          <label
            key={String(amenity.id)}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              name="amenityIds"
              value={String(amenity.id)}
              defaultChecked={
                Array.isArray(initial?.amenities) &&
                (initial.amenities as Item[]).some(
                  (item) => item.id === amenity.id,
                )
              }
            />
            {String(amenity.name)}
          </label>
        ))}
        <AmenityCreator csrf={csrf} onCreated={onSaved} />
      </fieldset>
      {message && (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      )}
      <button
        disabled={saving}
        className="mt-4 w-full rounded-full bg-emerald-900 px-4 py-2 text-sm font-semibold text-white"
      >
        {saving ? 'Saving…' : apartmentId ? 'Save changes' : 'Create draft'}
      </button>
      {apartmentId && (
        <button
          type="button"
          onClick={clearSelected}
          className="mt-2 w-full rounded-full border px-4 py-2 text-sm"
        >
          Cancel edit
        </button>
      )}
    </form>
  );
}

function ImageManager({
  csrf,
  apartmentId,
  images,
  onSaved,
}: {
  csrf: string;
  apartmentId: string;
  images: Item[];
  onSaved: () => void;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function upload(form: FormData) {
    const file = form.get('image');
    const altText = String(form.get('altText') ?? '').trim();
    if (!(file instanceof File) || !file.size || !altText) {
      setMessage('Choose an image and provide descriptive alt text.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const query = new URLSearchParams({
        altText,
        cover: String(form.get('cover') === 'on'),
        published: String(form.get('published') === 'on'),
      });
      const response = await fetch(
        `${adminApiBase}/apartments/${apartmentId}/images?${query}`,
        {
          method: 'POST',
          body: file,
          headers: { 'Content-Type': file.type, 'X-CSRF-Token': csrf },
          credentials: 'include',
        },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          result?.error?.message ?? `Upload failed (${response.status})`,
        );
      }
      setMessage('Photograph uploaded.');
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }
  async function updateImage(imageId: string, body: Item) {
    try {
      await adminRequest(`/apartments/${apartmentId}/images/${imageId}`, csrf, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not update photograph.',
      );
    }
  }
  async function deleteImage(imageId: string) {
    try {
      await adminRequest(`/apartments/${apartmentId}/images/${imageId}`, csrf, {
        method: 'DELETE',
      });
      onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not remove photograph.',
      );
    }
  }
  return (
    <form
      action={upload}
      className="rounded-2xl border border-stone-200 bg-white p-5"
    >
      <h2 className="font-semibold">Apartment photographs</h2>
      {images.map((image) => (
        <div
          key={String(image.id)}
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 p-3 text-sm"
        >
          <span>
            {String(image.altText)} · {image.isPublished ? 'Public' : 'Draft'}
            {image.isCover ? ' · Cover' : ''}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                void updateImage(String(image.id), {
                  isPublished: !image.isPublished,
                })
              }
              className="rounded border px-2 py-1"
            >
              {image.isPublished ? 'Unpublish' : 'Publish'}
            </button>
            <button
              type="button"
              onClick={() =>
                void updateImage(String(image.id), { isCover: true })
              }
              className="rounded border px-2 py-1"
            >
              Set cover
            </button>
            <button
              type="button"
              onClick={() => void deleteImage(String(image.id))}
              className="rounded border border-red-300 px-2 py-1 text-red-800"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <label className="mt-3 block text-sm">
        Image (JPEG, PNG, WebP; maximum 8 MB)
        <input
          required
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="mt-1 block w-full text-sm"
        />
      </label>
      <label className="mt-3 block text-sm">
        Alternative text
        <input
          required
          name="altText"
          minLength={3}
          maxLength={300}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <label className="mt-3 block text-sm">
        <input type="checkbox" name="cover" className="mr-2" />
        Set as cover
      </label>
      <label className="mt-2 block text-sm">
        <input type="checkbox" name="published" className="mr-2" />
        Make visible publicly
      </label>
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
      <button
        disabled={busy}
        className="mt-4 w-full rounded-full bg-stone-900 px-4 py-2 text-sm text-white"
      >
        {busy ? 'Uploading…' : 'Upload photograph'}
      </button>
    </form>
  );
}

function AmenityCreator({
  csrf,
  onCreated,
}: {
  csrf: string;
  onCreated: () => void;
}) {
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  async function submit() {
    try {
      await adminRequest('/amenities', csrf, {
        method: 'POST',
        body: JSON.stringify({ slug, name }),
      });
      setMessage('Amenity added.');
      setName('');
      setSlug('');
      onCreated();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not add amenity.',
      );
    }
  }
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        minLength={2}
        maxLength={100}
        placeholder="New amenity"
        className="rounded border px-2 py-1"
      />
      <input
        value={slug}
        onChange={(event) => setSlug(event.target.value)}
        minLength={2}
        maxLength={80}
        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        placeholder="amenity-slug"
        className="rounded border px-2 py-1"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={name.trim().length < 2 || slug.trim().length < 2}
        className="rounded border px-2 py-1 text-left"
      >
        Add amenity
      </button>
      {message && (
        <span role="status" className="text-xs">
          {message}
        </span>
      )}
    </div>
  );
}

function AvailabilityForm({
  csrf,
  onSaved,
}: {
  csrf: string;
  onSaved: () => void;
}) {
  const [message, setMessage] = useState('');
  async function submit(data: FormData) {
    try {
      await adminRequest('/availability/blocks', csrf, {
        method: 'POST',
        body: JSON.stringify({
          apartmentId: data.get('apartmentId'),
          startDate: data.get('startDate'),
          endDate: data.get('endDate'),
          reason: data.get('reason'),
        }),
      });
      setMessage('Dates blocked.');
      onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not block dates.',
      );
    }
  }
  return (
    <form
      action={submit}
      className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-5"
    >
      <h2 className="font-semibold sm:col-span-2 lg:col-span-5">
        Block dates for maintenance
      </h2>
      {[
        ['apartmentId', 'Apartment UUID'],
        ['startDate', 'Start date'],
        ['endDate', 'End date'],
        ['reason', 'Reason'],
      ].map(([name, label]) => (
        <label key={name} className="text-sm">
          {label}
          <input
            required
            name={name}
            type={name.includes('Date') ? 'date' : 'text'}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      ))}
      <button className="self-end rounded-full bg-stone-900 px-4 py-2 text-sm text-white">
        Block dates
      </button>
      {message && (
        <p role="status" className="sm:col-span-2 lg:col-span-5">
          {message}
        </p>
      )}
    </form>
  );
}
