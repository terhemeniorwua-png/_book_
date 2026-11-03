export const adminApiBase = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1'}/admin`;

export async function adminRequest<T>(
  path: string,
  csrfToken?: string,
  options: RequestInit = {},
) {
  const headers = new Headers(options.headers);
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  )
    headers.set('Content-Type', 'application/json');
  const response = await fetch(`${adminApiBase}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      result?.error?.message ?? `Request failed (${response.status})`,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
