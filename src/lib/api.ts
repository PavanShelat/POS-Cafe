import { supabase } from "@/integrations/supabase/client";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

type ApiOptions = RequestInit & { auth?: boolean };

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

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    throw new Error(message);
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

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    method: "GET",
    headers: finalHeaders,
  });

  if (!response.ok) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    const message = data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return response.blob();
}
