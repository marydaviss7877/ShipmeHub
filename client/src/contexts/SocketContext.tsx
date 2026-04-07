import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { user, isAuthenticated, token } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user && token) {
      // Strip the /api path — Socket.IO connects to the base server URL only
      const apiUrl    = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
      const serverUrl = apiUrl.replace(/\/api\/?$/, '');

      const newSocket = io(serverUrl, {
        // Use default transports (polling → websocket upgrade).
        // Forcing websocket-only skips the HTTP handshake, so auth errors
        // surface as an opaque "websocket error" with no useful message.
        autoConnect: true,
        auth: { token },
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
        // Room joining is handled server-side after token verification.
        // No 'join-room' event needed — and it would be rejected anyway.
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
        setIsConnected(false);
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
        setSocket(null);
        setIsConnected(false);
      };
    } else {
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
    }
  }, [isAuthenticated, user, token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export default SocketContext;
