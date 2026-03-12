const API_BASE = "/api/v1";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) return false;

    try {
      const res = await fetch(API_BASE + "/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const doFetch = async () => {
    const res = await fetch(API_BASE + path, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
        ...options.headers,
      },
      ...options,
    });
    return res;
  };

  let res = await doFetch();

  // 401 → try refresh and retry
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      throw new ApiError("Authentification requise", "UNAUTHORIZED", 401);
    }
  }

  if (res.status === 204) return null as T;

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(
      data.detail || `Erreur ${res.status}`,
      data.code || "UNKNOWN",
      res.status
    );
  }

  return data as T;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData
): Promise<T> {
  const doFetch = async () => {
    return await fetch(API_BASE + path, {
      method: "POST",
      body: formData,
      headers: getAuthHeaders(),
    });
  };

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      throw new ApiError("Authentification requise", "UNAUTHORIZED", 401);
    }
  }

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(
      data.detail || `Erreur ${res.status}`,
      data.code || "UNKNOWN",
      res.status
    );
  }

  return data as T;
}
