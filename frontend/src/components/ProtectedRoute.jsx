import React from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';

/**
 * ProtectedRoute - Wrapper component that requires authentication
 *
 * Redirects to login page if user is not authenticated
 * Otherwise, renders the children components
 */
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = api.auth.isAuthenticated();

  if (!isAuthenticated) {
    // Redirect to login page if not authenticated
    return <Navigate to="/login" replace />;
  }

  // Render children if authenticated
  return children;
};

export default ProtectedRoute;
