/**
 * API service for backend REST calls
 * Handles authentication, boards, and user operations
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Get auth token from localStorage
 */
const getToken = () => {
  return localStorage.getItem('token');
};

/**
 * Get auth headers with JWT token
 */
const getAuthHeaders = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
};

/**
 * Handle API response
 */
const handleResponse = async (response) => {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
};

/**
 * Authentication API
 */
export const authAPI = {
  /**
   * Register a new user
   * @param {Object} userData - { name, email, password }
   * @returns {Promise<Object>} { token, user }
   */
  register: async (userData) => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    const data = await handleResponse(response);

    // Store token
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }

    return data;
  },

  /**
   * Login existing user
   * @param {Object} credentials - { email, password }
   * @returns {Promise<Object>} { token, user }
   */
  login: async (credentials) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    const data = await handleResponse(response);

    // Store token
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }

    return data;
  },

  /**
   * Logout user (clear local storage)
   */
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  /**
   * Get current user from localStorage
   * @returns {Object|null}
   */
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated: () => {
    return !!getToken();
  }
};

/**
 * Boards API
 */
export const boardsAPI = {
  /**
   * Get all boards
   * @returns {Promise<Array>}
   */
  getBoards: async () => {
    const response = await fetch(`${API_URL}/api/boards`, {
      headers: getAuthHeaders()
    });

    return handleResponse(response);
  },

  /**
   * Get a single board by ID
   * @param {string} boardId
   * @returns {Promise<Object>}
   */
  getBoard: async (boardId) => {
    const response = await fetch(`${API_URL}/api/boards/${boardId}`, {
      headers: getAuthHeaders()
    });

    return handleResponse(response);
  },

  /**
   * Create a new board
   * @param {Object} boardData - { name }
   * @returns {Promise<Object>}
   */
  createBoard: async (boardData) => {
    const response = await fetch(`${API_URL}/api/boards`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(boardData)
    });

    return handleResponse(response);
  },

  /**
   * Delete a board
   * @param {string} boardId
   * @returns {Promise<Object>}
   */
  deleteBoard: async (boardId) => {
    const response = await fetch(`${API_URL}/api/boards/${boardId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    return handleResponse(response);
  },

  /**
   * Invite a user to a board
   * @param {string} boardId
   * @param {string} userEmail
   * @returns {Promise<Object>}
   */
  inviteUser: async (boardId, userEmail) => {
    const response = await fetch(`${API_URL}/api/boards/${boardId}/invite`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userEmail })
    });

    return handleResponse(response);
  }
};

export default {
  auth: authAPI,
  boards: boardsAPI,
  getToken
};
