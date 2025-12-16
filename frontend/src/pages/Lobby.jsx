import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

/**
 * Lobby - Board list and creation page
 * Shows all available boards and allows creating new ones
 */
const Lobby = () => {
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [creating, setCreating] = useState(false);

  const currentUser = api.auth.getCurrentUser();
  const isAuthenticated = api.auth.isAuthenticated();

  /**
   * Load boards on mount
   */
  useEffect(() => {
    loadBoards();
  }, []);

  /**
   * Fetch boards from API
   */
  const loadBoards = async () => {
    try {
      setLoading(true);
      const boardsList = await api.boards.getBoards();
      setBoards(boardsList);
      setError(null);
    } catch (err) {
      console.error('Failed to load boards:', err);
      setError('Failed to load boards. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle logout
   */
  const handleLogout = () => {
    api.auth.logout();
    navigate('/login');
  };

  /**
   * Handle create board
   */
  const handleCreateBoard = async (e) => {
    e.preventDefault();

    if (!newBoardName.trim()) {
      setError('Board name is required');
      return;
    }

    if (!isAuthenticated) {
      setError('You must be logged in to create a board');
      navigate('/login');
      return;
    }

    try {
      setCreating(true);
      const newBoard = await api.boards.createBoard({ name: newBoardName });
      setBoards([newBoard, ...boards]);
      setNewBoardName('');
      setShowCreateModal(false);
      setError(null);

      // Navigate to the new board
      navigate(`/board/${newBoard.id}`);
    } catch (err) {
      console.error('Failed to create board:', err);
      setError(err.message || 'Failed to create board');
    } finally {
      setCreating(false);
    }
  };

  /**
   * Handle delete board
   */
  const handleDeleteBoard = async (boardId) => {
    if (!window.confirm('Are you sure you want to delete this board?')) {
      return;
    }

    try {
      await api.boards.deleteBoard(boardId);
      setBoards(boards.filter(b => b.id !== boardId));
      setError(null);
    } catch (err) {
      console.error('Failed to delete board:', err);
      setError(err.message || 'Failed to delete board');
    }
  };

  /**
   * Open board
   */
  const openBoard = (boardId) => {
    navigate(`/board/${boardId}`);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.logo}>🎨 IdeaCanvas</h1>
          <div style={styles.headerRight}>
            {isAuthenticated ? (
              <>
                <span style={styles.username}>👤 {currentUser?.name}</span>
                <button onClick={handleLogout} style={styles.logoutButton}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('/login')} style={styles.loginButton}>
                  Login
                </button>
                <button onClick={() => navigate('/register')} style={styles.registerButton}>
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        <div style={styles.content}>
          {/* Title and Create Button */}
          <div style={styles.titleSection}>
            <h2 style={styles.title}>Your Boards</h2>
            {isAuthenticated && (
              <button
                onClick={() => setShowCreateModal(true)}
                style={styles.createButton}
              >
                + Create New Board
              </button>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div style={styles.errorBanner}>
              {error}
              <button onClick={() => setError(null)} style={styles.dismissButton}>×</button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Loading boards...</p>
            </div>
          )}

          {/* Boards Grid */}
          {!loading && boards.length > 0 && (
            <div style={styles.boardsGrid}>
              {boards.map(board => (
                <div key={board.id} style={styles.boardCard}>
                  <div
                    style={styles.boardCardContent}
                    onClick={() => openBoard(board.id)}
                  >
                    <h3 style={styles.boardName}>{board.name}</h3>
                    <p style={styles.boardMeta}>
                      Created: {new Date(board.createdAt).toLocaleDateString()}
                    </p>
                    <p style={styles.boardId}>ID: {board.id}</p>
                  </div>
                  <div style={styles.boardActions}>
                    <button
                      onClick={() => openBoard(board.id)}
                      style={styles.openButton}
                    >
                      Open
                    </button>
                    {isAuthenticated && currentUser?.id === board.ownerId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBoard(board.id);
                        }}
                        style={styles.deleteButton}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && boards.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📋</div>
              <h3 style={styles.emptyTitle}>No boards yet</h3>
              <p style={styles.emptyText}>
                {isAuthenticated
                  ? 'Create your first collaborative whiteboard to get started!'
                  : 'Login or register to create your first board.'}
              </p>
              {isAuthenticated && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={styles.createButtonLarge}
                >
                  Create Your First Board
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Create Board Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Create New Board</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={styles.modalClose}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateBoard} style={styles.modalForm}>
              <label style={styles.label}>
                Board Name
                <input
                  type="text"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="My Awesome Board"
                  style={styles.input}
                  autoFocus
                  required
                />
              </label>
              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={styles.cancelButton}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.submitButton}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={styles.footer}>
        <p style={styles.footerText}>
          IdeaCanvas - Real-time Collaborative Whiteboard
        </p>
      </footer>
    </div>
  );
};

// Styles
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#f5f7fa',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e0e0e0',
    boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '700',
    color: '#333',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  username: {
    fontSize: '14px',
    color: '#555',
    fontWeight: '500',
  },
  logoutButton: {
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  loginButton: {
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  registerButton: {
    padding: '8px 16px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  main: {
    flex: 1,
    padding: '40px 24px',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  titleSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '32px',
  },
  title: {
    margin: 0,
    fontSize: '32px',
    fontWeight: '700',
    color: '#222',
  },
  createButton: {
    padding: '12px 24px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
    transition: 'all 0.2s',
  },
  errorBanner: {
    padding: '16px',
    backgroundColor: '#fee',
    color: '#c00',
    borderRadius: '8px',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontWeight: '500',
  },
  dismissButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#c00',
    padding: '0 8px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #f0f0f0',
    borderTop: '4px solid #4CAF50',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '16px',
    fontSize: '16px',
    color: '#666',
  },
  boardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '24px',
  },
  boardCard: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    cursor: 'pointer',
  },
  boardCardContent: {
    marginBottom: '16px',
  },
  boardName: {
    margin: '0 0 12px 0',
    fontSize: '20px',
    fontWeight: '600',
    color: '#222',
  },
  boardMeta: {
    margin: '4px 0',
    fontSize: '14px',
    color: '#666',
  },
  boardId: {
    margin: '4px 0',
    fontSize: '12px',
    color: '#999',
    fontFamily: 'monospace',
  },
  boardActions: {
    display: 'flex',
    gap: '8px',
  },
  openButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  deleteButton: {
    padding: '10px 16px',
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 20px',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '24px',
    lineHeight: '1.5',
  },
  createButtonLarge: {
    padding: '14px 32px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '500px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid #e0e0e0',
  },
  modalTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: '#222',
  },
  modalClose: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#666',
    padding: '0 8px',
    lineHeight: '1',
  },
  modalForm: {
    padding: '24px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '24px',
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
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#f0f0f0',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  submitButton: {
    padding: '10px 20px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  footer: {
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e0e0e0',
    padding: '20px',
    textAlign: 'center',
  },
  footerText: {
    margin: 0,
    fontSize: '14px',
    color: '#666',
  },
};

export default Lobby;
