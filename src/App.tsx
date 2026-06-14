import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./modules/ProfileManagement/components/ProtectedRoute";
import DashboardLayout from "./components/layout/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";

// Public routes — small, load eagerly so first paint is instant
import IndexPage from "./modules/ProfileManagement/pages/IndexPage";
import LoginPage from "./modules/ProfileManagement/pages/LoginPage";
import SignupPage from "./modules/ProfileManagement/pages/SignupPage";
import ForgotPasswordPage from "./modules/ProfileManagement/pages/ForgotPasswordPage";

// Protected / heavy routes — lazy-loaded so they don't bloat the initial bundle
const DashboardPage = lazy(() => import("./modules/Dashboard/pages/DashboardPage"));
const RiskProfilePage = lazy(() => import("./modules/RiskProfile/pages/RiskProfilePage"));
const StrategySimulationPage = lazy(() => import("./modules/RiskProfile/pages/StrategySimulationPage"));
const RealPerformancePage = lazy(() => import("./modules/RiskProfile/pages/RealPerformancePage"));
const TradingPanelPage = lazy(() => import("./modules/TradingPanel/pages/TradingPanelPage"));
const UserPortfolioPage = lazy(() => import("./modules/UserPortfolio/pages/UserPortfolioPage"));
const ProfilePage = lazy(() => import("./modules/ProfileManagement/pages/ProfilePage"));
const ExchangePage = lazy(() => import("./modules/Exchange/pages/ExchangePage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 4xx errors — they need user action, not a retry
      retry: (failureCount, error: any) => {
        if (error?.message?.includes("401") || error?.message?.includes("403")) return false;
        return failureCount < 2;
      },
      // Cache data for 30 s before marking stale — reduces redundant API calls in trading app
      staleTime: 30_000,
      // Keep unused query data in cache for 5 minutes
      gcTime: 5 * 60_000,
      // Don't re-fetch automatically when window regains focus (avoids trading data spikes)
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const ProtectedDashboard = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <DashboardLayout>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </ErrorBoundary>
    </DashboardLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes — eagerly loaded */}
            <Route path="/" element={<IndexPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Protected routes — lazy-loaded behind Suspense */}
            <Route path="/dashboard" element={<ProtectedDashboard><DashboardPage /></ProtectedDashboard>} />
            <Route path="/risk-profile" element={<ProtectedDashboard><RiskProfilePage /></ProtectedDashboard>} />
            <Route
              path="/risk-profile/:profileId/simulate"
              element={<ProtectedDashboard><StrategySimulationPage /></ProtectedDashboard>}
            />
            <Route path="/trading" element={<ProtectedDashboard><TradingPanelPage /></ProtectedDashboard>} />
            <Route path="/real-performance" element={<ProtectedDashboard><RealPerformancePage /></ProtectedDashboard>} />
            <Route path="/portfolio" element={<ProtectedDashboard><UserPortfolioPage /></ProtectedDashboard>} />
            <Route path="/profile" element={<ProtectedDashboard><ProfilePage /></ProtectedDashboard>} />
            <Route path="/exchange" element={<ProtectedDashboard><ExchangePage /></ProtectedDashboard>} />
            <Route
              path="/upgrade"
              element={
                <ProtectedDashboard>
                  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
                    <div className="text-6xl">🚧</div>
                    <h2 className="text-2xl font-bold">PRO Upgrade</h2>
                    <p className="text-muted-foreground max-w-sm">
                      This feature is coming soon. Stay tuned for exclusive PRO perks!
                    </p>
                  </div>
                </ProtectedDashboard>
              }
            />
          </Routes>
        </BrowserRouter>
      </div>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
