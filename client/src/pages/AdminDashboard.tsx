import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';
import {
  UserGroupIcon,
  DocumentIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

interface AdminStats {
  totalUsers: number;
  totalFiles: number;
  pendingFiles: number;
  completedFiles: number;
  failedFiles: number;
  resellers: number;
  regularUsers: number;
}

interface RecentFileItem {
  id: string;
  originalName: string;
  fileType: string;
  status: string;
  createdAt: string;
  uploadedBy: {
    firstName: string;
    lastName: string;
    email: string;
  };
  clientId?: {
    firstName: string;
    lastName: string;
  };
}

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalFiles: 0,
    pendingFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    resellers: 0,
    regularUsers: 0,
  });
  const [recentFiles, setRecentFiles] = useState<RecentFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAdminData();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('file-uploaded', (data) => {
        console.log('File uploaded:', data);
        fetchAdminData();
      });

      socket.on('file-completed', (data) => {
        console.log('File completed:', data);
        fetchAdminData();
      });

      return () => {
        socket.off('file-uploaded');
        socket.off('file-completed');
      };
    }
  }, [socket]);

  // Role-based access control
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const fetchAdminData = async () => {
    try {
      const [usersResponse, filesResponse] = await Promise.all([
        axios.get('/users?limit=0'),
        axios.get('/files?limit=10'),
      ]);

      const users = usersResponse.data.users;
      const files = filesResponse.data.files;

      const adminStats: AdminStats = {
        totalUsers: users.length,
        totalFiles: files.length,
        pendingFiles: files.filter((f: any) => f.status === 'pending').length,
        completedFiles: files.filter((f: any) => f.status === 'completed').length,
        failedFiles: files.filter((f: any) => f.status === 'failed').length,
        resellers: users.filter((u: any) => u.role === 'reseller').length,
        regularUsers: users.filter((u: any) => u.role === 'user').length,
      };

      setStats(adminStats);
      setRecentFiles(files);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateFileStatus = async (fileId: string, status: string, notes?: string) => {
    try {
      await axios.put(`/files/${fileId}/status`, {
        status,
        processingNotes: notes,
      });
      fetchAdminData();
    } catch (error) {
      console.error('Error updating file status:', error);
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage users, files, and system operations.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UserGroupIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Users
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalUsers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

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
                  <dd className="text-lg font-medium text-gray-900">{stats.totalFiles}</dd>
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
                    Pending Files
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.pendingFiles}</dd>
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
                    Completed Files
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.completedFiles}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Breakdown */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <h3 className="text-lg font-medium text-gray-900 mb-4">User Breakdown</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Resellers</span>
                <span className="text-sm font-medium text-gray-900">{stats.resellers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Regular Users</span>
                <span className="text-sm font-medium text-gray-900">{stats.regularUsers}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <h3 className="text-lg font-medium text-gray-900 mb-4">File Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Pending</span>
                <span className="text-sm font-medium text-gray-900">{stats.pendingFiles}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Completed</span>
                <span className="text-sm font-medium text-gray-900">{stats.completedFiles}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Failed</span>
                <span className="text-sm font-medium text-gray-900">{stats.failedFiles}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Files */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Recent Files
            </h3>
            <a
              href="/files"
              className="text-sm font-medium text-primary-600 hover:text-primary-500"
            >
              View all files
            </a>
          </div>
          
          {recentFiles.length === 0 ? (
            <div className="text-center py-6">
              <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No files</h3>
              <p className="mt-1 text-sm text-gray-500">
                No files have been uploaded yet.
              </p>
            </div>
          ) : (
            <div className="flow-root">
              <ul className="-my-5 divide-y divide-gray-200">
                {recentFiles.map((file) => (
                  <li key={file.id} className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary-600">
                              {file.fileType === 'label_request' ? 'LR' : 'GL'}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.originalName}
                          </p>
                          <p className="text-sm text-gray-500">
                            <span className="font-medium">Requested by:</span> {file.uploadedBy.firstName} {file.uploadedBy.lastName} ({file.uploadedBy.email})
                            {file.clientId && (
                              <span className="block">
                                <span className="font-medium">Client:</span> {file.clientId.firstName} {file.clientId.lastName}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            {file.fileType.replace('_', ' ')} • {new Date(file.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                            file.status
                          )}`}
                        >
                          {file.status}
                        </span>
                        <div className="flex space-x-1">
                          {file.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updateFileStatus(file.id, 'processing')}
                                className="text-yellow-600 hover:text-yellow-900"
                                title="Mark as Processing"
                              >
                                <ClockIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => updateFileStatus(file.id, 'completed')}
                                className="text-green-600 hover:text-green-900"
                                title="Mark as Completed"
                              >
                                <CheckCircleIcon className="h-5 w-5" />
                              </button>
                            </>
                          )}
                          {file.status === 'processing' && (
                            <button
                              onClick={() => updateFileStatus(file.id, 'completed')}
                              className="text-green-600 hover:text-green-900"
                              title="Mark as Completed"
                            >
                              <CheckCircleIcon className="h-5 w-5" />
                            </button>
                          )}
                          {file.fileType === 'label_request' && (
                            <button
                              onClick={() => window.open(`/files/${file.id}/download`, '_blank')}
                              className="text-blue-600 hover:text-blue-900"
                              title="Download Sheet"
                            >
                              <DocumentTextIcon className="h-5 w-5" />
                            </button>
                          )}
                          {file.fileType === 'generated_label' && (
                            <button
                              onClick={() => window.open(`/files/${file.id}/download`, '_blank')}
                              className="text-primary-600 hover:text-primary-900"
                              title="Download Labels"
                            >
                              <ArrowDownTrayIcon className="h-5 w-5" />
                            </button>
                          )}
                        </div>
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

export default AdminDashboard;
