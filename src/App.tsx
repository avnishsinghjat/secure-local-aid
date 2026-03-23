import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import AppSidebar from "@/components/AppSidebar";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import TicketListPage from "@/pages/TicketListPage";
import TicketDetailPage from "@/pages/TicketDetailPage";
import CreateTicketPage from "@/pages/CreateTicketPage";
import AuditLogPage from "@/pages/AuditLogPage";
import UserManagementPage from "@/pages/UserManagementPage";
import ReportsPage from "@/pages/ReportsPage";
import ExportPage from "@/pages/ExportPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary animate-pulse-glow font-mono text-sm">INITIALIZING SYSTEM...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/queue" element={<TicketListPage mode="queue" />} />
          <Route path="/my-tickets" element={<TicketListPage mode="my" />} />
          <Route path="/team-queue" element={<TicketListPage mode="team" />} />
          <Route path="/search" element={<TicketListPage mode="all" />} />
          <Route path="/create" element={<CreateTicketPage />} />
          <Route path="/ticket/:id" element={<TicketDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/audit" element={<AuditLogPage />} />
          <Route path="/admin/users" element={<UserManagementPage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/settings" element={<div className="text-foreground">Settings coming soon</div>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
