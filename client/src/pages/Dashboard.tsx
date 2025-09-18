import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';
import {
  DocumentIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  BanknotesIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';

interface FileStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

interface RecentFileItem {
  id: string;
  originalName: string;
  fileType: string;
  status: string;
  createdAt: string;
  size: number;
}

interface Balance {
  currentBalance: number;
  totalSpent: number;
  totalDistributed: number;
  totalDeposited: number;
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

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [fileStats, setFileStats] = useState<FileStats>({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
  const [recentFiles, setRecentFiles] = useState<RecentFileItem[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('file-uploaded', (data) => {
        console.log('File uploaded:', data);
        fetchDashboardData();
      });

      socket.on('file-completed', (data) => {
        console.log('File completed:', data);
        fetchDashboardData();
      });

      return () => {
        socket.off('file-uploaded');
        socket.off('file-completed');
      };
    }
  }, [socket]);

  const fetchDashboardData = async () => {
    try {
      const [statsResponse, filesResponse, balanceResponse, rateResponse] = await Promise.all([
        axios.get('/files?limit=0'),
        axios.get('/files?limit=5'),
        axios.get('/balance').catch(() => ({ data: null })),
        axios.get('/rates').catch(() => ({ data: null })),
      ]);

      const files = filesResponse.data.files;
      const stats = {
        total: files.length,
        pending: files.filter((f: any) => f.status === 'pending').length,
        processing: files.filter((f: any) => f.status === 'processing').length,
        completed: files.filter((f: any) => f.status === 'completed').length,
        failed: files.filter((f: any) => f.status === 'failed').length,
      };

      setFileStats(stats);
      setRecentFiles(files);
      setBalance(balanceResponse.data);
      setRate(rateResponse.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'failed':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.firstName}!
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Here's what's happening with your USPS labels today.
          </p>
        </div>
      </div>

      {/* Balance Overview */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">Balance Overview</h3>
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Current Balance */}
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                ${balance?.currentBalance?.toFixed(1) || '222.5'}
              </div>
              <div className="text-sm font-medium text-gray-900 mb-1">BALANCE</div>
              <div className="text-xs text-gray-500">Your remaining balance to use</div>
            </div>

            {/* Total Spent */}
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600 mb-2">
                ${balance?.totalSpent?.toFixed(0) || '0'}
              </div>
              <div className="text-sm font-medium text-gray-900 mb-1">TOTAL SPENT</div>
              <div className="text-xs text-gray-500">Total balance you have spent</div>
            </div>

            {/* Total Distributed */}
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                ${balance?.totalDistributed?.toFixed(1) || '9477.5'}
              </div>
              <div className="text-sm font-medium text-gray-900 mb-1">TOTAL DISTRIBUTED</div>
              <div className="text-xs text-gray-500">Balance you have distributed</div>
            </div>

            {/* Total Deposited */}
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                ${balance?.totalDeposited?.toFixed(0) || '9700'}
              </div>
              <div className="text-sm font-medium text-gray-900 mb-1">TOTAL DEPOSITED</div>
              <div className="text-xs text-gray-500">Total balance you have deposited</div>
            </div>
          </div>
        </div>
      </div>

      {/* Rate Card */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CurrencyDollarIcon className="h-6 w-6 text-blue-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Label Rate
                </dt>
                <dd className="text-2xl font-bold text-gray-900">
                  ${rate?.labelRate?.toFixed(2) || '0.00'} per label
                </dd>
              </dl>
            </div>
          </div>
          {rate?.notes && (
            <div className="mt-4">
              <p className="text-xs text-gray-500">{rate.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DocumentIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Files
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">{fileStats.total}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-6 w-6 text-yellow-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Pending
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">{fileStats.pending}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Completed
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">{fileStats.completed}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Failed
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">{fileStats.failed}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <a
              href="/files"
              className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary-500 rounded-lg border border-gray-300 hover:border-gray-400"
            >
              <div>
                <span className="rounded-lg inline-flex p-3 bg-primary-50 text-primary-700 ring-4 ring-white">
                  <ArrowUpTrayIcon className="h-6 w-6" />
                </span>
              </div>
              <div className="mt-8">
                <h3 className="text-lg font-medium">
                  <span className="absolute inset-0" aria-hidden="true" />
                  Upload Files
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Upload your bulk label request files for processing.
                </p>
              </div>
            </a>

            <a
              href="/files"
              className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary-500 rounded-lg border border-gray-300 hover:border-gray-400"
            >
              <div>
                <span className="rounded-lg inline-flex p-3 bg-green-50 text-green-700 ring-4 ring-white">
                  <ArrowDownTrayIcon className="h-6 w-6" />
                </span>
              </div>
              <div className="mt-8">
                <h3 className="text-lg font-medium">
                  <span className="absolute inset-0" aria-hidden="true" />
                  Download Labels
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Download your completed USPS labels.
                </p>
              </div>
            </a>
          </div>
        </div>
      </div>

      {/* Recent Files */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Recent Files
          </h3>
          {recentFiles.length === 0 ? (
            <div className="text-center py-6">
              <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No files</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by uploading your first file.
              </p>
            </div>
          ) : (
            <div className="flow-root">
              <ul className="-my-5 divide-y divide-gray-200">
                {recentFiles.map((file) => (
                  <li key={file.id} className="py-4">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {getStatusIcon(file.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.originalName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {file.fileType.replace('_', ' ')} • {formatFileSize(file.size)}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                            file.status
                          )}`}
                        >
                          {file.status}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
