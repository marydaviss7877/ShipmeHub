import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { VendorAuthProvider } from './contexts/VendorAuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import VendorLayout from './components/VendorLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import UserManagement from './pages/UserManagement';
import Profile from './pages/Profile';
import Announcements from './pages/Announcements';
import LabelGenerator from './pages/LabelGenerator';
import LabelHistory from './pages/LabelHistory';
import BulkLabels from './pages/BulkLabels';
import BulkLabelGenerator from './pages/BulkLabelGenerator';
import VendorManagement from './pages/VendorManagement';
import UserVendorAccess from './pages/UserVendorAccess';
import AdminManifestOps from './pages/AdminManifestOps';
import LiveActivity from './pages/LiveActivity';
import VendorLogin from './pages/vendor/VendorLogin';
import VendorDashboard from './pages/vendor/VendorDashboard';
import VendorJobDetail from './pages/vendor/VendorJobDetail';
import VendorEarnings  from './pages/vendor/VendorEarnings';
import ResellerClients from './pages/ResellerClients';
import SalesAgents         from './pages/SalesAgents';
import Finance             from './pages/Finance';
import CashBook            from './pages/CashBook';
import FinancialDashboard  from './pages/FinancialDashboard';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <VendorAuthProvider>
          <Router>
            <div className="App">
              <Routes>
                {/* Public routes */}
                <Route path="/login"  element={<Login />} />
                <Route path="/signup" element={<Signup />} />

                {/* ── Vendor Portal (completely separate, neutral branding) ── */}
                <Route path="/vendor-portal/login" element={<VendorLogin />} />
                <Route path="/vendor-portal" element={<VendorLayout />}>
                  <Route index element={<Navigate to="/vendor-portal/jobs" replace />} />
                  <Route path="jobs"      element={<VendorDashboard />} />
                  <Route path="jobs/:id"  element={<VendorJobDetail />} />
                  <Route path="earnings"  element={<VendorEarnings />} />
                </Route>

                {/* ── Main portal (ShipmeHub users) ─────────────────────── */}
                <Route path="/" element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="profile"   element={<Profile />} />

                  {/* Announcements */}
                  <Route path="announcements" element={<Announcements />} />

                  {/* Non-manifested (API) labels */}
                  <Route path="labels/single" element={<LabelGenerator />} />
                  <Route path="labels/bulk"   element={<BulkLabelGenerator />} />
                  <Route path="labels/history" element={<LabelHistory />} />
                  <Route path="labels/bulk-history" element={<BulkLabels />} />

                  {/* Manifested labels */}
                  <Route path="manifest/upload" element={<Navigate to="/labels/bulk" replace />} />

                  {/* Admin routes */}
                  <Route path="admin"                         element={<AdminDashboard />} />
                  <Route path="admin/users"                   element={<UserManagement />} />
                  <Route path="admin/users/:userId/access"    element={<UserVendorAccess />} />
                  <Route path="admin/vendors"                 element={<VendorManagement />} />
                  <Route path="admin/manifest"                element={<AdminManifestOps />} />
                  <Route path="admin/sales-agents"            element={<SalesAgents />} />
                  <Route path="admin/finance"                 element={<Finance />} />
                  <Route path="admin/cashbook"               element={<CashBook />} />
                  <Route path="admin/financial-dashboard"    element={<FinancialDashboard />} />

                  {/* Reseller portal */}
                  <Route path="reseller/clients"  element={<ResellerClients />} />
                  <Route path="reseller/finance"  element={<Finance />} />

                  {/* Platform activity */}
                  <Route path="activity" element={<LiveActivity />} />
                </Route>

                {/* Catch all */}
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </div>
          </Router>
        </VendorAuthProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
