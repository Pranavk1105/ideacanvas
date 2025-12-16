import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

/**
 * Login - User authentication page
 */
const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  /**
   * Handle login form submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    try {
      setLoading(true);
      await api.auth.login({ email, password });
      navigate('/lobby');
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.header}>
          <h1 style={styles.logo}>🎨 IdeaCanvas</h1>
          <p style={styles.tagline}>Collaborative Whiteboard</p>
        </div>

        <div style={styles.card}>
          <h2 style={styles.title}>Login</h2>

          {error && (
            <div style={styles.errorBanner}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                style={styles.input}
                autoFocus
                required
              />
            </label>

            <label style={styles.label}>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                style={styles.input}
                required
              />
            </label>

            <button
              type="submit"
              style={styles.submitButton}
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div style={styles.footer}>
            <p style={styles.footerText}>
              Don't have an account?{' '}
              <Link to="/register" style={styles.link}>
                Register here
              </Link>
            </p>
            <p style={styles.footerText}>
              <Link to="/lobby" style={styles.link}>
                Continue as guest
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Styles
const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f7fa',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '20px',
  },
  content: {
    width: '100%',
    maxWidth: '440px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logo: {
    margin: '0 0 8px 0',
    fontSize: '36px',
    fontWeight: '700',
    color: '#333',
  },
  tagline: {
    margin: 0,
    fontSize: '16px',
    color: '#666',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
  },
  title: {
    margin: '0 0 24px 0',
    fontSize: '28px',
    fontWeight: '600',
    color: '#222',
    textAlign: 'center',
  },
  errorBanner: {
    padding: '12px 16px',
    backgroundColor: '#fee',
    color: '#c00',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px',
    fontWeight: '500',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '20px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  input: {
    marginTop: '8px',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  submitButton: {
    marginTop: '8px',
    padding: '14px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'background-color 0.2s',
  },
  footer: {
    marginTop: '24px',
    textAlign: 'center',
  },
  footerText: {
    margin: '8px 0',
    fontSize: '14px',
    color: '#666',
  },
  link: {
    color: '#4CAF50',
    textDecoration: 'none',
    fontWeight: '500',
  },
};

export default Login;
