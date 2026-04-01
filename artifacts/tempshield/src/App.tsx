import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useApplyHeadMeta } from "@/hooks/use-site-settings";
import NotFound from "@/pages/not-found";
import LandingPage from "./pages/landing";
import PricingPage from "./pages/pricing";
import LoginPage from "./pages/login";
import RegisterPage from "./pages/register";
import DashboardPage from "./pages/dashboard";
import DocsPage from "./pages/docs";
import UpgradePage from "./pages/upgrade";
import AdminPage from "./pages/admin";
import VerifyPage from "./pages/verify";

const queryClient = new QueryClient();

// Protected Route Wrapper
function ProtectedRoute({ component: Component, adminOnly = false }: { component: any, adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (adminOnly && user.role !== "ADMIN") {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function GlobalHeadManager() {
  useApplyHeadMeta();
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/docs" component={DocsPage} />
      <Route path="/verify" component={VerifyPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={RegisterPage} />
      
      {/* Protected Routes */}
      <Route path="/dashboard">
        {() => <ProtectedRoute component={DashboardPage} />}
      </Route>
      <Route path="/upgrade">
        {() => <ProtectedRoute component={UpgradePage} />}
      </Route>
      <Route path="/upgrade/success">
        {() => <ProtectedRoute component={UpgradePage} />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminPage} adminOnly={true} />}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <GlobalHeadManager />
            <Router />
          </AuthProvider>
        </WouterRouter>
        {/* We use Toaster here if it exists. If standard shadcn toaster is not present, we will silently fail which is fine. */}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
