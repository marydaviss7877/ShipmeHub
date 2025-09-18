import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Files from './pages/Files';
import AdminDashboard from './pages/AdminDashboard';
import UserManagement from './pages/UserManagement';
import BalanceManagement from './pages/BalanceManagement';
import Profile from './pages/Profile';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <div className="App">
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              
              {/* Protected routes with nested layout */}
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="files" element={<Files />} />
                <Route path="profile" element={<Profile />} />
                
                {/* Admin routes */}
                <Route path="admin" element={<AdminDashboard />} />
                <Route path="admin/users" element={<UserManagement />} />
                <Route path="admin/balance" element={<BalanceManagement />} />
              </Route>
              
              {/* Catch all route */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </div>
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
