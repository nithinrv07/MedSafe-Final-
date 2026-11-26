// Small fetch wrapper. The session lives in an HttpOnly cookie, so no token is handled in JS.
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request(method: string, path: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body: unknown = {}) => request('POST', path, body),
};
