import { supabase } from "@/integrations/supabase/client";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

type ApiOptions = RequestInit & { auth?: boolean };

// A cold start, a 502 from the host or a missing VITE_API_BASE_URL can return an
// HTML page instead of JSON. Treat anything unparseable as "no body".
function parseJsonBody(text: string): { error?: string } | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorMessageFor(response: Response, data: { error?: string } | null) {
  if (data?.error) return data.error;
  if (response.status >= 500) return `The server is not responding right now (${response.status}). Please try again in a moment.`;
  return `Request failed (${response.status})`;
}

async function fetchOrThrow(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
}

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);

  if (!finalHeaders.has("Content-Type") && rest.body) {
    finalHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      finalHeaders.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetchOrThrow(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  const text = await response.text();
  const data = parseJsonBody(text);

  if (!response.ok) {
    throw new Error(errorMessageFor(response, data));
  }
  if (text && data === null) {
    throw new Error("The server sent an unexpected response. Please try again in a moment.");
  }

  return data as T;
}

async function createHeaders(headers: HeadersInit | undefined, auth: boolean) {
  const finalHeaders = new Headers(headers);

  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      finalHeaders.set("Authorization", `Bearer ${token}`);
    }
  }

  return finalHeaders;
}

export async function apiGet<T>(path: string, options: ApiOptions = {}) {
  return apiFetch<T>(path, {
    ...options,
    method: "GET",
  });
}

export async function apiPost<T>(path: string, body?: unknown, options: ApiOptions = {}) {
  return apiFetch<T>(path, {
    ...options,
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch<T>(path: string, body?: unknown, options: ApiOptions = {}) {
  return apiFetch<T>(path, {
    ...options,
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T>(path: string, body?: unknown, options: ApiOptions = {}) {
  return apiFetch<T>(path, {
    ...options,
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete<T>(path: string, options: ApiOptions = {}) {
  return apiFetch<T>(path, {
    ...options,
    method: "DELETE",
  });
}

export async function apiGetBlob(path: string, options: ApiOptions = {}) {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders = await createHeaders(headers, auth);

  const response = await fetchOrThrow(`${API_BASE}${path}`, {
    ...rest,
    method: "GET",
    headers: finalHeaders,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(errorMessageFor(response, parseJsonBody(text)));
  }

  return response.blob();
}
