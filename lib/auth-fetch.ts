// Plain fetch wrapper for API calls from client components.
// The httpOnly session cookie is sent automatically by the browser on all
// same-origin requests — no manual token injection needed.
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
}
