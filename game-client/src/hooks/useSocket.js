import { useContext } from 'react';
import { SocketContext } from '../contexts/SocketContext';

export const useSocket = () => {
  const context = useContext(SocketContext);
  return context;
};

