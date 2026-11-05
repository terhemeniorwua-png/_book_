import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_NOTICE_MS,
  formatScheduledDateTime,
  isValidTimeZone,
  normalizeCheckInTime,
  resolveCancellationSchedule,
  zonedDateTimeToUtc,
} from './cancellation-policy.js';

describe('cancellation policy', () => {
  const apartment = { timezone: 'Africa/Lagos', checkInTime: '14:00:00' };

  it('converts apartment-local check-in times to UTC', () => {
    expect(
      zonedDateTimeToUtc('2030-08-01', '14:00', 'Africa/Lagos').toISOString(),
    ).toBe('2030-08-01T13:00:00.000Z');
    expect(
      zonedDateTimeToUtc(
        '2030-01-15',
        '14:00',
        'America/New_York',
      ).toISOString(),
    ).toBe('2030-01-15T19:00:00.000Z');
    expect(
      zonedDateTimeToUtc(
        '2030-07-15',
        '14:00',
        'America/New_York',
      ).toISOString(),
    ).toBe('2030-07-15T18:00:00.000Z');
  });

  it('allows cancellation exactly 24 hours before check-in and rejects the next millisecond', () => {
    const booking = { checkIn: '2030-08-01' };
    const checkInAt = new Date('2030-08-01T13:00:00.000Z');
    const deadline = new Date(checkInAt.getTime() - CANCELLATION_NOTICE_MS);
    const atDeadline = resolveCancellationSchedule(
      booking,
      apartment,
      deadline,
    );
    expect(atDeadline.eligible).toBe(true);
    expect(atDeadline.reason).toBeNull();
    expect(atDeadline.deadlineAt.toISOString()).toBe(
      '2030-07-31T13:00:00.000Z',
    );
    const justAfter = resolveCancellationSchedule(
      booking,
      apartment,
      new Date(deadline.getTime() + 1),
    );
    expect(justAfter.eligible).toBe(false);
    expect(justAfter.reason).toBe('CANCELLATION_DEADLINE_PASSED');
  });

  it('rejects cancellation at or after the actual check-in instant', () => {
    const booking = { checkIn: '2030-08-01' };
    const atCheckIn = resolveCancellationSchedule(
      booking,
      apartment,
      new Date('2030-08-01T13:00:00.000Z'),
    );
    expect(atCheckIn.eligible).toBe(false);
    expect(atCheckIn.reason).toBe('CHECK_IN_STARTED');
  });

  it('uses the immutable booking snapshot before current apartment settings', () => {
    const schedule = resolveCancellationSchedule(
      {
        checkIn: '2030-08-01',
        acceptedPolicySnapshot: {
          timeZone: 'Africa/Lagos',
          checkInTime: '16:30',
        },
      },
      { timezone: 'America/New_York', checkInTime: '09:00' },
      new Date('2030-07-01T00:00:00.000Z'),
    );
    expect(schedule.timeZone).toBe('Africa/Lagos');
    expect(schedule.checkInTime).toBe('16:30');
    expect(schedule.checkInAt.toISOString()).toBe('2030-08-01T15:30:00.000Z');
  });

  it('normalizes check-in times and validates IANA zones', () => {
    expect(normalizeCheckInTime('9:30')).toBe('14:00');
    expect(normalizeCheckInTime('09:30:45')).toBe('09:30');
    expect(normalizeCheckInTime(null)).toBe('14:00');
    expect(isValidTimeZone('Africa/Lagos')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(
      formatScheduledDateTime(
        new Date('2030-07-31T13:00:00.000Z'),
        'Africa/Lagos',
      ),
    ).toContain('31');
  });
});
