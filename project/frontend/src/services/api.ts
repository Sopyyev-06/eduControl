export interface ApiError { code: string; message: string; details?: { path: string; message: string }[] }

let csrfToken = '';

function readCookie(name: string): string {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export function setCsrf(token: string) {
  csrfToken = token || readCookie('csrft');
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken || readCookie('csrft');
  let res = await fetch(url, { method, headers, credentials: 'include', body: body ? JSON.stringify(body) : undefined });

  if (res.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
    const refreshed = await fetch('/api/auth/refresh', { method: 'POST', headers, credentials: 'include' });
    if (refreshed.ok) {
      const data = await refreshed.json();
      setCsrf(data?.data?.csrfToken || '');
      res = await fetch(url, { method, headers: { ...headers, 'X-CSRF-Token': csrfToken }, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
    }
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const err: ApiError = payload?.error ?? { code: 'HTTP_' + res.status, message: 'Request failed' };
    throw err;
  }
  return payload?.data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
};
