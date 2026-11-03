'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { adminRequest } from '@/lib/admin-api';

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(14).max(128),
});

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setError('');
    const parsed = loginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setError('Enter a valid email and password.');
      setBusy(false);
      return;
    }
    try {
      await adminRequest('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      router.replace('/admin');
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex max-w-md px-5 py-20">
      <form
        action={submit}
        className="w-full rounded-3xl border border-stone-200 bg-white p-8 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-emerald-800">
          Staywell administration
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-stone-900">Sign in</h1>
        <label className="mt-7 block text-sm font-medium">
          Email address
          <input
            required
            name="email"
            type="email"
            autoComplete="username"
            className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Password
          <input
            required
            name="password"
            type="password"
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3"
          />
        </label>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="mt-6 w-full rounded-full bg-emerald-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
