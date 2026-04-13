const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface AuthResponse {
  message: string;
  user: User;
}

class AuthService {
  private userKey = 'markvista_user';
  private csrfToken: string | null = null;

  // Store user data only (token is HttpOnly cookie)
  private setSession(authResponse: AuthResponse) {
    localStorage.setItem(this.userKey, JSON.stringify(authResponse.user));
  }

  private async getCsrfToken(forceRefresh: boolean = false): Promise<string> {
    if (this.csrfToken && !forceRefresh) {
      return this.csrfToken;
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/csrf-token`, {
      credentials: 'include',
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

      this.getCsrfToken()
        .then((csrfToken) => fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          }
        }))
        .then(() => {
          localStorage.removeItem(this.userKey);
          this.csrfToken = null;
          resolve();
        })
        .catch((error) => {
          // Even if logout fails on server, clear local cached user
          localStorage.removeItem(this.userKey);
          this.csrfToken = null;
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
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include',
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
