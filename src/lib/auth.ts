// Falls back to the local dev backend only if VITE_API_URL is unset (see api.ts).
import { resetCsrfToken } from './api';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface AuthResponse {
  message: string;
  token?: string;
  user: User;
}

class AuthService {
  private userKey = 'markvista_user';
  // Bearer token fallback for environments where the cross-domain HttpOnly
  // auth cookie is blocked (notably iOS Safari ITP).
  private tokenKey = 'markvista_token';
  private csrfToken: string | null = null;

  private setSession(authResponse: AuthResponse) {
    localStorage.setItem(this.userKey, JSON.stringify(authResponse.user));
    if (authResponse.token) {
      localStorage.setItem(this.tokenKey, authResponse.token);
    }
    // The CSRF token is now bound to the user — drop any anonymous token cached
    // before login so the next mutation fetches one bound to this session.
    this.csrfToken = null;
    resetCsrfToken();
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  private async getCsrfToken(forceRefresh: boolean = false): Promise<string> {
    if (this.csrfToken && !forceRefresh) {
      return this.csrfToken;
    }

    // Send the Bearer token (when present) so the server binds the issued CSRF
    // token to this user even on ITP clients where the auth cookie is blocked.
    const bearer = this.getToken();
    const response = await fetch(`${API_BASE_URL}/api/auth/csrf-token`, {
      credentials: 'include',
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
    });

    if (!response.ok) {
      throw new Error('Failed to fetch CSRF token');
    }

    const data = await response.json();
    this.csrfToken = data.csrfToken;
    return this.csrfToken as string;
  }

  // Get stored user
  getUser(): User | null {
    const userStr = localStorage.getItem(this.userKey);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  // Check if user is logged in
  isAuthenticated(): boolean {
    return !!this.getUser();
  }

  // Logout - clear all auth data
  logout(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.getUser()) {
        resolve();
        return;
      }

      // Force-refresh so the logout POST carries a CSRF token bound to the
      // CURRENT session (a stale anonymous token would be rejected now that
      // CSRF is user-bound, leaving the server-side token un-invalidated).
      this.getCsrfToken(true)
        .then((csrfToken) => {
          // Send the Bearer token so the server can identify and invalidate the
          // session even on cookieless (iOS-Safari-ITP) clients — without it,
          // optionalAuth finds no token and the server-side token is never removed.
          const bearer = this.getToken();
          return fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken,
              ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
            }
          });
        })
        .then(() => {
          localStorage.removeItem(this.userKey);
          localStorage.removeItem(this.tokenKey);
          this.csrfToken = null;
          resetCsrfToken();
          resolve();
        })
        .catch((error) => {
          // Even if logout fails on server, clear local cached user
          localStorage.removeItem(this.userKey);
          localStorage.removeItem(this.tokenKey);
          this.csrfToken = null;
          resetCsrfToken();
          resolve();
        });
    });
  }

  // Register new user
  async register(email: string, password: string, name: string, phone?: string): Promise<AuthResponse> {
    const csrfToken = await this.getCsrfToken(true);
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ email, password, name, phone })
    });

    const data = await response.json();

    if (!response.ok) {
      // Surface specific field-level validation messages when available
      if (data.errors && data.errors.length > 0) {
        const messages = data.errors.map((e: { field: string; message: string }) => e.message).join(' ');
        throw new Error(messages);
      }
      throw new Error(data.message || 'Registration failed');
    }

    this.setSession(data);
    return data;
  }

  // Login user
  async login(email: string, password: string): Promise<AuthResponse> {
    const csrfToken = await this.getCsrfToken(true);
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.errors && data.errors.length > 0) {
        const messages = data.errors.map((e: { field: string; message: string }) => e.message).join(' ');
        throw new Error(messages);
      }
      throw new Error(data.message || 'Login failed');
    }

    this.setSession(data);
    return data;
  }

  // Get current user profile
  async getCurrentUser(): Promise<User | null> {
    try {
      const token = this.getToken();
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.logout(); // Clear invalid token
        }
        return null;
      }

      const data = await response.json();
      localStorage.setItem(this.userKey, JSON.stringify(data.user));
      return data.user;
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
export type { User, AuthResponse };
