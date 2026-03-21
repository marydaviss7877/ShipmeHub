import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

interface VendorInfo {
  _id: string;
  name: string;
  carriers: string[];
}

interface VendorAuthCtx {
  vendor: VendorInfo | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const VendorAuthContext = createContext<VendorAuthCtx | null>(null);

export const VendorAuthProvider = ({ children }: { children: ReactNode }) => {
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [token,  setToken]  = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('vendorToken');
    const info   = localStorage.getItem('vendorInfo');
    if (stored && info) {
      setToken(stored);
      setVendor(JSON.parse(info));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await axios.post(`${API}/vendor-portal/auth/login`, { email, password });
    setToken(data.token);
    setVendor(data.vendor);
    localStorage.setItem('vendorToken', data.token);
    localStorage.setItem('vendorInfo',  JSON.stringify(data.vendor));
  };

  const logout = () => {
    setToken(null);
    setVendor(null);
    localStorage.removeItem('vendorToken');
    localStorage.removeItem('vendorInfo');
  };

  return (
    <VendorAuthContext.Provider value={{ vendor, token, loading, login, logout }}>
      {children}
    </VendorAuthContext.Provider>
  );
};

export const useVendorAuth = () => {
  const ctx = useContext(VendorAuthContext);
  if (!ctx) throw new Error('useVendorAuth must be inside VendorAuthProvider');
  return ctx;
};
