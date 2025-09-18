import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';
import {
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

interface FileItem {
  id: string;
  filename: string;
  originalName: string;
  fileType: string;
  status: string;
  size: number;
  createdAt: string;
  uploadedBy: {
    firstName: string;
    lastName: string;
    email: string;
  };
  clientId?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  relatedRequest?: {
    id: string;
    originalName: string;
    status: string;
  };
  generatedLabels?: Array<{
    id: string;
    originalName: string;
    status: string;
  }>;
  processingDetails?: {
    processedBy: {
      firstName: string;
      lastName: string;
    };
    processedAt: string;
    processingNotes: string;
  };
}

const Files: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState({
    fileType: user?.role === 'admin' ? 'generated_label' : 'label_request',
    relatedRequestId: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchFiles();
  }, [currentPage, statusFilter, typeFilter]);

  useEffect(() => {
    if (socket) {
      socket.on('file-uploaded', (data) => {
        console.log('File uploaded:', data);
        fetchFiles();
      });

      socket.on('file-completed', (data) => {
        console.log('File completed:', data);
        fetchFiles();
      });

      return () => {
        socket.off('file-uploaded');
        socket.off('file-completed');
      };
    }
  }, [socket]);

  const fetchFiles = async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
      });

      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('fileType', typeFilter);

      const response = await axios.get(`/files?${params}`);
      setFiles(response.data.files);
      setTotalPages(response.data.totalPages);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file to upload.');
      return;
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/zip', 'application/x-zip-compressed'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Invalid file type. Only PDF, Excel, CSV, and ZIP files are allowed.');
      return;
    }

    // Validate file size (50MB limit)
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size too large. Maximum size is 50MB.');
      return;
    }

    setIsUploading(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('fileType', uploadData.fileType);
      if (uploadData.relatedRequestId) {
        formData.append('relatedRequestId', uploadData.relatedRequestId);
      }

      await axios.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadData({
        fileType: isAdmin ? 'generated_label' : 'label_request',
        relatedRequestId: '',
      });
      setMessage('File uploaded successfully!');
      fetchFiles();
    } catch (error: any) {
      console.error('Error uploading file:', error);
      setError(error.response?.data?.message || 'Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (fileId: string, originalName: string) => {
    try {
      console.log('Attempting to download file:', { fileId, originalName });
      
      const response = await axios.get(`/files/${fileId}/download`, {
        responseType: 'blob',
      });

      console.log('Download response:', {
        status: response.status,
        headers: response.headers,
        dataSize: response.data.size
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setMessage('File downloaded successfully!');
    } catch (error: any) {
      console.error('Error downloading file:', error);
      setError(error.response?.data?.message || 'Failed to download file');
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      await axios.delete(`/files/${fileId}`);
      fetchFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  const handleUploadGeneratedLabel = (requestId: string) => {
    setUploadData({
      fileType: 'generated_label',
      relatedRequestId: requestId
    });
    setShowUploadModal(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  const filteredFiles = files.filter((file) =>
    file.originalName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isAdmin ? 'File Management' : 'My Labels'}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {isAdmin 
                  ? 'Manage all label requests and upload generated labels.' 
                  : 'Request USPS labels and download your generated labels.'
                }
              </p>
            </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => {
              setShowUploadModal(true);
              setError('');
              setMessage('');
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <ArrowUpTrayIcon className="h-4 w-4 mr-2" />
            {isAdmin ? 'Upload Generated Labels' : 'Request New Labels'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700">
              Search
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                name="search"
                id="search"
                className="focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="status-filter"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div>
            <label htmlFor="type-filter" className="block text-sm font-medium text-gray-700">
              Type
            </label>
                  <select
                    id="type-filter"
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="label_request">Label Request</option>
                    {isAdmin && (
                      <option value="generated_label">Generated Label</option>
                    )}
                  </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setTypeFilter('');
              }}
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <FunnelIcon className="h-4 w-4 mr-2" />
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Files Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12">
            <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No files</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by uploading your first file.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredFiles.map((file) => (
              <li key={file.id}>
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary-600">
                          {file.fileType === 'label_request' ? 'LR' : 'GL'}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {file.originalName}
                      </div>
                      <div className="text-sm text-gray-500">
                        {file.fileType.replace('_', ' ')} • {formatFileSize(file.size)} •{' '}
                        {new Date(file.createdAt).toLocaleDateString()}
                      </div>
                          {isAdmin && file.uploadedBy && (
                            <div className="text-xs text-gray-400">
                              Requested by: {file.uploadedBy.firstName} {file.uploadedBy.lastName} ({file.uploadedBy.email})
                            </div>
                          )}
                          {file.clientId && (
                            <div className="text-xs text-gray-400">
                              Client: {file.clientId.firstName} {file.clientId.lastName}
                            </div>
                          )}
                          {file.fileType === 'label_request' && file.generatedLabels && file.generatedLabels.length > 0 && (
                            <div className="text-xs text-green-600">
                              ✅ Generated labels available ({file.generatedLabels.length})
                            </div>
                          )}
                          {file.fileType === 'generated_label' && file.relatedRequest && (
                            <div className="text-xs text-blue-600">
                              📋 For request: {file.relatedRequest.originalName}
                            </div>
                          )}
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
                          {isAdmin ? (
                            // Admin actions
                            <>
                              {file.fileType === 'label_request' && (
                                <>
                                  <button
                                    onClick={() => handleDownload(file.id, file.originalName)}
                                    className="text-blue-600 hover:text-blue-900"
                                    title="Download Request Sheet"
                                  >
                                    <DocumentTextIcon className="h-5 w-5" />
                                  </button>
                                  {file.status === 'pending' && (
                                    <button
                                      onClick={() => handleUploadGeneratedLabel(file.id)}
                                      className="text-green-600 hover:text-green-900"
                                      title="Upload Generated Labels"
                                    >
                                      <ArrowUpTrayIcon className="h-5 w-5" />
                                    </button>
                                  )}
                                </>
                              )}
                              {file.fileType === 'generated_label' && (
                                <button
                                  onClick={() => handleDownload(file.id, file.originalName)}
                                  className="text-primary-600 hover:text-primary-900"
                                  title="Download Generated Labels"
                                >
                                  <ArrowDownTrayIcon className="h-5 w-5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(file.id)}
                                className="text-red-600 hover:text-red-900"
                                title="Delete"
                              >
                                <TrashIcon className="h-5 w-5" />
                              </button>
                            </>
                          ) : (
                            // User/Reseller actions - can only download generated labels for their requests
                            <>
                              {file.fileType === 'label_request' && file.generatedLabels && file.generatedLabels.length > 0 && (
                                <button
                                  onClick={() => {
                                    // Download the first generated label (or show a list if multiple)
                                    const firstLabel = file.generatedLabels?.[0];
                                    if (firstLabel) {
                                      handleDownload(firstLabel.id, firstLabel.originalName);
                                    }
                                  }}
                                  className="text-green-600 hover:text-green-900"
                                  title="Download Generated Labels"
                                >
                                  <ArrowDownTrayIcon className="h-5 w-5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Page <span className="font-medium">{currentPage}</span> of{' '}
                <span className="font-medium">{totalPages}</span>
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {isAdmin 
                  ? (uploadData.relatedRequestId ? 'Upload Generated Labels for Request' : 'Upload Generated Labels')
                  : 'Request Labels'
                }
              </h3>
              <form onSubmit={handleFileUpload} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-800">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {message && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-green-800">{message}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    File
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                    accept=".pdf,.xlsx,.xls,.csv,.zip"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    File Type
                  </label>
                  <select
                    value={uploadData.fileType}
                    onChange={(e) => setUploadData({ ...uploadData, fileType: e.target.value })}
                    disabled={uploadData.relatedRequestId !== ''}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {isAdmin ? (
                      <option value="generated_label">Generated Label</option>
                    ) : (
                      <option value="label_request">Label Request</option>
                    )}
                  </select>
                </div>


                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading || !selectedFile}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Files;
