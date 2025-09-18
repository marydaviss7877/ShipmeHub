import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CurrencyDollarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  UserIcon,
  BanknotesIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Balance {
  currentBalance: number;
  recentTransactions: Array<{
    type: string;
    amount: number;
    description: string;
    date: string;
    performedBy?: {
      firstName: string;
      lastName: string;
    };
  }>;
}

interface Rate {
  labelRate: number;
  currency: string;
  effectiveFrom: string;
  notes?: string;
  setBy?: {
    firstName: string;
    lastName: string;
  };
}

const BalanceManagement: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showDeductModal, setShowDeductModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [deductAmount, setDeductAmount] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [rateAmount, setRateAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';
  const isReseller = user?.role === 'reseller';

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchUserBalance(selectedUser.id);
      fetchUserRate(selectedUser.id);
    }
  }, [selectedUser]);

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/users');
      if (isAdmin) {
        setUsers(response.data.users);
      } else if (isReseller) {
        // Filter to only show reseller's clients
        const clients = response.data.users.filter((u: User) => 
          u.role === 'user' && user?.clients?.includes(u.id)
        );
        setUsers(clients);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchUserBalance = async (userId: string) => {
    try {
      const response = await axios.get(`/balance/${userId}`);
      setBalance(response.data);
    } catch (error) {
      console.error('Error fetching user balance:', error);
    }
  };

  const fetchUserRate = async (userId: string) => {
    try {
      const response = await axios.get(`/rates/${userId}`);
      setRate(response.data);
    } catch (error) {
      console.error('Error fetching user rate:', error);
    }
  };

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !topUpAmount) return;

    setIsLoading(true);
    try {
      await axios.post('/balance/topup', {
        userId: selectedUser.id,
        amount: parseFloat(topUpAmount),
        description: description || `Balance top-up by ${user?.firstName} ${user?.lastName}`
      });

      setShowTopUpModal(false);
      setTopUpAmount('');
      setDescription('');
      setMessage('Balance topped up successfully!');
      fetchUserBalance(selectedUser.id);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to top up balance');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !deductAmount) return;

    setIsLoading(true);
    try {
      await axios.post('/balance/deduct', {
        userId: selectedUser.id,
        amount: parseFloat(deductAmount),
        description: description || `Balance deduction by ${user?.firstName} ${user?.lastName}`
      });

      setShowDeductModal(false);
      setDeductAmount('');
      setDescription('');
      setMessage('Balance deducted successfully!');
      fetchUserBalance(selectedUser.id);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to deduct balance');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !adjustAmount) return;

    setIsLoading(true);
    try {
      await axios.post('/balance/adjust', {
        userId: selectedUser.id,
        amount: parseFloat(adjustAmount),
        description: description || `Balance adjustment by ${user?.firstName} ${user?.lastName}`
      });

      setShowAdjustModal(false);
      setAdjustAmount('');
      setDescription('');
      setMessage('Balance adjusted successfully!');
      fetchUserBalance(selectedUser.id);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to adjust balance');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !rateAmount) return;

    setIsLoading(true);
    try {
      await axios.post('/rates/set', {
        userId: selectedUser.id,
        labelRate: parseFloat(rateAmount),
        notes: notes || `Rate set by ${user?.firstName} ${user?.lastName}`
      });

      setShowRateModal(false);
      setRateAmount('');
      setNotes('');
      setMessage('Rate set successfully!');
      fetchUserRate(selectedUser.id);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to set rate');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter((u) =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'topup':
        return <ArrowUpTrayIcon className="h-4 w-4 text-green-500" />;
      case 'deduction':
        return <ArrowDownTrayIcon className="h-4 w-4 text-red-500" />;
      case 'adjustment':
        return <AdjustmentsHorizontalIcon className="h-4 w-4 text-blue-500" />;
      default:
        return <BanknotesIcon className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'topup':
        return 'text-green-600';
      case 'deduction':
        return 'text-red-600';
      case 'adjustment':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Balance Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage user balances and label rates
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Users</h3>
              <div className="space-y-2">
                {filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedUser?.id === u.id
                        ? 'bg-primary-50 border border-primary-200'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => setSelectedUser(u)}
                  >
                    <div className="flex items-center">
                      <UserIcon className="h-8 w-8 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="text-sm text-gray-500">{u.email}</p>
                        <p className="text-xs text-gray-400 capitalize">{u.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Balance and Rate Info */}
        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="space-y-6">
              {/* Balance Card */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Balance</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setShowTopUpModal(true)}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        <ArrowUpTrayIcon className="h-4 w-4 mr-1" />
                        Top Up
                      </button>
                      <button
                        onClick={() => setShowDeductModal(true)}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                        Deduct
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setShowAdjustModal(true)}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <AdjustmentsHorizontalIcon className="h-4 w-4 mr-1" />
                          Adjust
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-3xl font-bold text-gray-900 mb-4">
                    ${balance?.currentBalance?.toFixed(2) || '0.00'}
                  </div>

                  {/* Recent Transactions */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Recent Transactions</h4>
                    <div className="space-y-2">
                      {balance?.recentTransactions?.slice(0, 5).map((transaction, index) => (
                        <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100">
                          <div className="flex items-center">
                            {getTransactionIcon(transaction.type)}
                            <div className="ml-2">
                              <p className="text-sm text-gray-900">{transaction.description}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(transaction.date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <span className={`text-sm font-medium ${getTransactionColor(transaction.type)}`}>
                            {transaction.type === 'deduction' ? '-' : '+'}${transaction.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rate Card */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Label Rate</h3>
                    <button
                      onClick={() => setShowRateModal(true)}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                      <CurrencyDollarIcon className="h-4 w-4 mr-1" />
                      Set Rate
                    </button>
                  </div>
                  
                  <div className="text-2xl font-bold text-gray-900 mb-2">
                    ${rate?.labelRate?.toFixed(2) || '0.00'} per label
                  </div>
                  
                  {rate?.notes && (
                    <p className="text-sm text-gray-500 mb-2">{rate.notes}</p>
                  )}
                  
                  {rate?.setBy && (
                    <p className="text-xs text-gray-400">
                      Set by {rate.setBy.firstName} {rate.setBy.lastName}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6 text-center">
                <UserIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a User</h3>
                <p className="text-sm text-gray-500">
                  Choose a user from the list to view and manage their balance and rate.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Up Modal */}
      {showTopUpModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Top Up Balance</h3>
              <form onSubmit={handleTopUp}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    className="focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowTopUpModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                  >
                    {isLoading ? 'Processing...' : 'Top Up'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Deduct Modal */}
      {showDeductModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Deduct Balance</h3>
              <form onSubmit={handleDeduct}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={deductAmount}
                    onChange={(e) => setDeductAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    className="focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowDeductModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    {isLoading ? 'Processing...' : 'Deduct'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Adjust Balance</h3>
              <form onSubmit={handleAdjust}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount (positive to add, negative to subtract)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    className="focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowAdjustModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {isLoading ? 'Processing...' : 'Adjust'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Set Rate Modal */}
      {showRateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Set Label Rate</h3>
              <form onSubmit={handleSetRate}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rate per Label ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={rateAmount}
                    onChange={(e) => setRateAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (optional)
                  </label>
                  <textarea
                    rows={3}
                    className="focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowRateModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                  >
                    {isLoading ? 'Processing...' : 'Set Rate'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Message/Error Display */}
      {message && (
        <div className="fixed bottom-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50">
          {message}
        </div>
      )}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
          {error}
        </div>
      )}
    </div>
  );
};

export default BalanceManagement;