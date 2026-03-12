"use client";

import { createContext, useState, useEffect, useCallback } from "react";
import type { Role } from "@/lib/types";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  matricule: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  role: Role;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
  setRole: (role: Role) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: "user",
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  updateUser: () => {},
  setRole: () => {},
});

const API_BASE = "/api/v1";

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 204) return null as T;
  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Erreur serveur (${res.status})`);
  }
  if (!res.ok) throw new Error((data.detail as string) || `Erreur ${res.status}`);
  return data as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const validateSession = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const userData = await apiRequest<AuthUser>("/auth/me");
      setUser(userData);
    } catch {
      // Try refresh
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const refreshData = await fetch(API_BASE + "/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (refreshData.ok) {
            const tokens = await refreshData.json();
            localStorage.setItem("access_token", tokens.access_token);
            localStorage.setItem("refresh_token", tokens.refresh_token);
            setUser(tokens.user);
          } else {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
          }
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
        }
      } else {
        localStorage.removeItem("access_token");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    validateSession();
  }, [validateSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<{
      access_token: string;
      refresh_token: string;
      user: AuthUser;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      try {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // ignore
      }
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedUser: AuthUser) => {
    setUser(updatedUser);
  }, []);

  const setRole = useCallback(() => {
    // No-op: role is derived from user
  }, []);

  const role: Role = (user?.role as Role) || "user";

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        updateUser,
        setRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
