const API_BASE_URL = import.meta.env.VITE_API_URL;

let csrfTokenCache: string | null = null;

const getCsrfToken = async (forceRefresh: boolean = false): Promise<string> => {
  if (csrfTokenCache && !forceRefresh) {
    return csrfTokenCache;
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/csrf-token`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch CSRF token');
  }

  const data = await response.json();
  csrfTokenCache = data.csrfToken;
  return csrfTokenCache as string;
};

// Prefetch CSRF token on module load so first POST (e.g. place order) doesn't pay the extra round-trip.
getCsrfToken().catch(() => { /* silent — will retry on first mutation */ });

const getBaseHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  return headers;
};

// Bearer fallback for clients where the cross-domain HttpOnly auth cookie
// is blocked (notably iOS Safari ITP). Kept in sync with AuthService.tokenKey.
const getStoredAuthToken = (): string | null => {
  try {
    return localStorage.getItem('markvista_token');
  } catch {
    return null;
  }
};

// Helper fetch wrapper that includes auth
const authFetch = async (url: string, options: RequestInit = {}): Promise<any> => {
  const method = (options.method || 'GET').toUpperCase();
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers: Record<string, string> = {
    ...(getBaseHeaders() as Record<string, string>),
    ...((options.headers as Record<string, string>) || {}),
  };

  const bearer = getStoredAuthToken();
  if (bearer && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${bearer}`;
  }

  if (isMutating) {
    const csrfToken = await getCsrfToken();
    headers['X-CSRF-Token'] = csrfToken;
  }

  let response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  // CSRF tokens have a bounded server-side TTL (≈1h). On expiry the server
  // returns 403 — refresh the token once and retry the same mutation.
  if (response.status === 403 && isMutating) {
    try {
      const fresh = await getCsrfToken(true);
      headers['X-CSRF-Token'] = fresh;
      response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers,
      });
    } catch { /* fall through to original 403 */ }
  }

  if (!response.ok) {
    if (response.status === 401 && window.location.pathname !== '/login') {
      // Clear token/auth state gracefully and redirect
      localStorage.removeItem('token');
      localStorage.removeItem('markvista_token');
      localStorage.removeItem('markvista_user');
      window.location.href = '/login?expired=true';
      // Throw a specific error to silent downstream `.catch` blocks so they don't spam UI
      throw new Error('Session expired');
    }
    const errorData = await response.json().catch(() => ({}));
    // Prefer `detail` (Bybit retMsg forwarded by backend) over the generic error label
    const msg =
      errorData.detail ||
      errorData.message ||
      errorData.error ||
      `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(msg);
  }

  return response.json();
};

// Helper fetch for public endpoints (no auth)
const publicFetch = async (url: string, options: RequestInit = {}): Promise<any> => {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...getBaseHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

// Risk Profiles
export const riskProfileApi = {
  // Get all risk profiles (authenticated) — returns the data array directly
  getAll: async () => {
    const response = await authFetch(`${API_BASE_URL}/api/riskprofiles`);
    // Backend returns { data: [...], pagination: {...} }; unwrap for callers
    return response.data ?? response;
  },

  // Get active risk profile (authenticated)
  getActive: async () => {
    return authFetch(`${API_BASE_URL}/api/riskprofiles/getactive`);
  },

  /**
   * Reset per-exchange runtime state (currentrisk + streak) for the active
   * profile on a specific exchange. If `exchange` is omitted, the backend
   * resets the user's currentlyActive exchange's state.
   * Does not touch state on other exchanges for the same profile.
   */
  resetState: async (exchange?: string) => {
    return authFetch(`${API_BASE_URL}/api/riskprofiles/reset-state`, {
      method: 'POST',
      body: JSON.stringify(exchange ? { exchange } : {}),
    });
  },

  // Get single risk profile by ID (authenticated)
  getSingle: async (id: string) => {
    return authFetch(`${API_BASE_URL}/api/riskprofiles/${id}`);
  },

  // Create a new risk profile (authenticated)
  create: async (profileData: any) => {
    return authFetch(`${API_BASE_URL}/api/riskprofiles`, {
      method: 'POST',
      body: JSON.stringify(profileData),
    });
  },

  // Update a risk profile (authenticated)
  update: async (id: string, profileData: any) => {
    return authFetch(`${API_BASE_URL}/api/riskprofiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(profileData),
    });
  },

  // Delete a risk profile (authenticated)
  delete: async (id: string) => {
    return authFetch(`${API_BASE_URL}/api/riskprofiles/${id}`, {
      method: 'DELETE',
    });
  },

  // Activate/deactivate a profile (toggle) (authenticated)
  activate: async (id: string, ison: boolean) => {
    return authFetch(`${API_BASE_URL}/api/riskprofiles/${id}/activate`, {
      method: 'PUT',
      body: JSON.stringify({ ison }),
    });
  },

  // Set a profile as default (authenticated)
  setDefault: async (id: string) => {
    return authFetch(`${API_BASE_URL}/api/riskprofiles/reset-default`, {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },
};

// Goals
export const goalApi = {
  // Get all goals from active risk profile (authenticated)
  getAll: async () => {
    return authFetch(`${API_BASE_URL}/api/goal/goals`);
  },

  // Create a new goal (authenticated)
  create: async (goalData: { goalType: string; goalAmount: number }) => {
    return authFetch(`${API_BASE_URL}/api/goal/goals`, {
      method: 'POST',
      body: JSON.stringify(goalData),
    });
  },

  // Delete a goal (authenticated)
  delete: async (goalId: string) => {
    return authFetch(`${API_BASE_URL}/api/goal/goals/${goalId}`, {
      method: 'DELETE',
    });
  },

  // Update a goal (authenticated)
  update: async (goalId: string, goalData: { goalType?: string; goalAmount?: number }) => {
    return authFetch(`${API_BASE_URL}/api/goal/goals`, {
      method: 'PUT',
      body: JSON.stringify({ goalId, ...goalData }),
    });
  },
};

// Orders & Positions
export const orderApi = {
  // Get account balance (authenticated)
  getBalance: async () => {
    return authFetch(`${API_BASE_URL}/api/order/showusdtbalance`);
  },

  // Get active positions (authenticated)
  getPositions: async (symbol?: string) => {
    const query = symbol ? `?symbol=${symbol}` : '';
    return authFetch(`${API_BASE_URL}/api/order/active-positions${query}`);
  },

  // Get pending orders (authenticated)
  getOrders: async () => {
    return authFetch(`${API_BASE_URL}/api/order/order-list`);
  },

  // Get closed PnL (trade history) (authenticated)
  getTradeHistory: async () => {
    return authFetch(`${API_BASE_URL}/api/order/closed-pnl`);
  },

  // Place order (authenticated)
  placeOrder: async (orderData: any) => {
    return authFetch(`${API_BASE_URL}/api/order/place-order`, {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  },

  // Cancel order (authenticated)
  cancelOrder: async (cancelData: { orderLinkId?: string; orderId?: string; symbol: string }) => {
    return authFetch(`${API_BASE_URL}/api/order/cancel-order`, {
      method: 'POST',
      body: JSON.stringify(cancelData),
    });
  },

  // Set leverage (authenticated)
  setLeverage: async (symbol: string, leverage: number) => {
    return authFetch(`${API_BASE_URL}/api/order/set-leverage`, {
      method: 'POST',
      body: JSON.stringify({ symbol, buyLeverage: leverage, sellLeverage: leverage }),
    });
  },

  // Real performance metrics for active risk profile (authenticated)
  getRealPerformance: async () => {
    return authFetch(`${API_BASE_URL}/api/order/real-performance`);
  },

  // Closed trades from our DB canonical ledger (use for portfolio/goals, not trading panel)
  getMyTrades: async () => {
    return authFetch(`${API_BASE_URL}/api/order/my-trades`);
  },

  // Delete all trade history and stamp the clear timestamp on the user.
  // Future Bybit-synced trades closed before the stamp stay hidden.
  clearTradeHistory: async () => {
    return authFetch(`${API_BASE_URL}/api/order/my-trades`, {
      method: 'DELETE',
    });
  },
};

// API Connection (Bybit) - all authenticated
export const connectionApi = {
  // Save API credentials
  connect: async (apiKey: string, secretKey: string, accountType: 'demo' | 'live' = 'demo') => {
    return authFetch(`${API_BASE_URL}/api/connection/api-connection`, {
      method: 'POST',
      body: JSON.stringify({ apiKey, secretKey, accountType }),
    });
  },

  // Delete API credentials (disconnect)
  disconnect: async () => {
    return authFetch(`${API_BASE_URL}/api/connection/api-connection`, {
      method: 'DELETE',
    });
  },

  // Check connection status (authenticated) — legacy single-exchange shim.
  getStatus: async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/connection/api-connection`);
      return { connected: true, data: response.data };
    } catch (error: any) {
      if (error.message?.includes('404')) {
        return { connected: false };
      }
      throw error;
    }
  },

  // ── Multi-exchange endpoints ────────────────────────────────────────────
  /** Static metadata about supported exchanges (label, tvPrefix, fee rates). */
  listExchanges: async () => {
    return authFetch(`${API_BASE_URL}/api/connection/exchanges`);
  },

  /** Per-user connection state: which exchanges are connected + the active one. */
  getConnections: async () => {
    return authFetch(`${API_BASE_URL}/api/connection/connections`);
  },

  /** Currently-selected active exchange. */
  getActiveExchange: async () => {
    return authFetch(`${API_BASE_URL}/api/connection/active-exchange`);
  },

  /** Aggregate USDT balance across every connected exchange. */
  getAllBalances: async (): Promise<{ total: number; balances: Array<{ exchange: string; mode: string; balance: number; ok: boolean; error?: string }> }> => {
    return authFetch(`${API_BASE_URL}/api/connection/balances`);
  },

  /** Switch the active exchange to one the user has credentials for. */
  setActiveExchange: async (exchange: string) => {
    return authFetch(`${API_BASE_URL}/api/connection/active-exchange`, {
      method: 'POST',
      body: JSON.stringify({ exchange }),
    });
  },

  /**
   * Connect (or re-connect) credentials for a specific exchange.
   * Required: apiKey, secretKey. Optional: passphrase (OKX, Bitget).
   */
  connectExchange: async (
    exchange: string,
    payload: { apiKey: string; secretKey: string; passphrase?: string; mode?: 'demo' | 'real' }
  ) => {
    return authFetch(`${API_BASE_URL}/api/connection/connection/${exchange}`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'demo', ...payload }),
    });
  },

  /** Disconnect credentials for a specific exchange. */
  disconnectExchange: async (exchange: string) => {
    return authFetch(`${API_BASE_URL}/api/connection/connection/${exchange}`, {
      method: 'DELETE',
    });
  },

  /** Fetch the markdown user guide for an exchange. */
  getGuide: async (exchange: string): Promise<string> => {
    const r = await fetch(`${API_BASE_URL}/api/connection/exchanges/${exchange}/guide`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    });
    if (!r.ok) throw new Error(`Failed to load ${exchange} guide`);
    return r.text();
  },
};

// Portfolio Summary (authenticated)
export const portfolioSummaryApi = {
  getSummary: async (opts: { includeExternal?: boolean } = {}) => {
    const qs = opts.includeExternal === false ? '?includeExternal=false' : '';
    return authFetch(`${API_BASE_URL}/api/order/portfolio-summary${qs}`);
  },
};

// Trading News (proxied through backend)
export const newsApi = {
  getNews: async () => {
    // Proxing through backend avoids CORS and timeout issues of public proxies
    const response = await publicFetch(`${API_BASE_URL}/api/news`);
    return response;
  },
};

// Trading Symbols - Public endpoints (no auth required)
// Short-lived caches collapse duplicate concurrent requests without breaking
// callers that expect fresh data every second (ticker TTL is sub-second).
const tickerCache = new Map<string, { data: any; expiresAt: number }>();
const tickerInflight = new Map<string, Promise<any>>();
const instrumentCache = new Map<string, { data: any; expiresAt: number }>();
const TICKER_TTL_MS = 750;             // below the 1s poll cadence
const INSTRUMENT_TTL_MS = 10 * 60_000; // instrument meta rarely changes

export const symbolsApi = {
  // Get all available trading symbols
  getAll: async () => {
    const response = await publicFetch(`${API_BASE_URL}/api/symbols`);
    // The backend returns { success: true, data: [...] }
    return response.data || response;
  },

  // Get instrument information (max leverage, filters, etc.)
  getInstrumentInfo: async (symbol: string) => {
    const now = Date.now();
    const cached = instrumentCache.get(symbol);
    if (cached && cached.expiresAt > now) return cached.data;

    const response = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${symbol}`);
    const json = await response.json();
    if (json.retCode !== 0) throw new Error(json.retMsg || 'Failed to fetch instrument info');
    const data = json.result.list[0];
    instrumentCache.set(symbol, { data, expiresAt: now + INSTRUMENT_TTL_MS });
    return data;
  },

  // Get current ticker price for a symbol (public Bybit endpoint)
  getTicker: async (symbol: string) => {
    const now = Date.now();
    const cached = tickerCache.get(symbol);
    if (cached && cached.expiresAt > now) return cached.data;

    // Coalesce concurrent callers onto the same in-flight request.
    const inflight = tickerInflight.get(symbol);
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
        const json = await response.json();
        if (json.retCode !== 0) throw new Error(json.retMsg || 'Failed to fetch ticker');
        const data = json.result.list[0];
        tickerCache.set(symbol, { data, expiresAt: Date.now() + TICKER_TTL_MS });
        return data;
      } finally {
        tickerInflight.delete(symbol);
      }
    })();
    tickerInflight.set(symbol, promise);
    return promise;
  },
};
