import { env } from '../config/env.js';

export const CANCELLATION_NOTICE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CHECK_IN_TIME = '14:00';

export type CancellationSchedule = {
  checkInAt: Date;
  deadlineAt: Date;
  timeZone: string;
  checkInTime: string;
  eligible: boolean;
  reason: 'CANCELLATION_DEADLINE_PASSED' | 'CHECK_IN_STARTED' | null;
};

type ScheduleBooking = {
  checkIn: string;
  acceptedPolicySnapshot?: unknown;
};

type ScheduleApartment = {
  timezone?: string | null;
  checkInTime?: string | null;
};

function snapshotValue(snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

export function normalizeCheckInTime(value: string | null | undefined) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(
    String(value ?? '').trim(),
  );
  if (!match) return DEFAULT_CHECK_IN_TIME;
  return `${match[1]}:${match[2]}`;
}

export function isValidTimeZone(value: string | null | undefined) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<string, number>;
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/**
 * Converts a wall-clock date and time in an IANA timezone to a UTC instant.
 * The iterative offset correction handles daylight-saving transitions without
 * adding a date-time dependency to the API.
 */
export function zonedDateTimeToUtc(
  dateOnly: string,
  time: string,
  timeZone: string,
) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
    normalizeCheckInTime(time),
  );
  if (!dateMatch || !timeMatch || !isValidTimeZone(timeZone))
    throw new Error('Invalid check-in schedule');
  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const desired = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(instant), timeZone);
    const representedAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const difference = desired - representedAsUtc;
    instant += difference;
    if (difference === 0) break;
  }
  return new Date(instant);
}

export function resolveCancellationSchedule(
  booking: ScheduleBooking,
  apartment: ScheduleApartment,
  now: Date = new Date(),
): CancellationSchedule {
  const snapshot = booking.acceptedPolicySnapshot;
  const configuredTimeZone =
    snapshotValue(snapshot, 'timeZone') ?? apartment.timezone ?? undefined;
  const timeZone = isValidTimeZone(configuredTimeZone)
    ? String(configuredTimeZone)
    : env.BOOKING_TIME_ZONE;
  const checkInTime = normalizeCheckInTime(
    snapshotValue(snapshot, 'checkInTime') ??
      apartment.checkInTime ??
      DEFAULT_CHECK_IN_TIME,
  );
  const checkInAt = zonedDateTimeToUtc(booking.checkIn, checkInTime, timeZone);
  const deadlineAt = new Date(checkInAt.getTime() - CANCELLATION_NOTICE_MS);
  const nowTime = now.getTime();
  const reason =
    nowTime >= checkInAt.getTime()
      ? ('CHECK_IN_STARTED' as const)
      : nowTime > deadlineAt.getTime()
        ? ('CANCELLATION_DEADLINE_PASSED' as const)
        : null;
  return {
    checkInAt,
    deadlineAt,
    timeZone,
    checkInTime,
    eligible: reason === null,
    reason,
  };
}

export function formatScheduledDateTime(
  value: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone,
    dateStyle: 'long',
    timeStyle: 'short',
    ...options,
  }).format(value);
}

export function formatScheduledDateTimeWithZone(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(value);
}

export function formatScheduledTimeWithZone(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(value);
}
