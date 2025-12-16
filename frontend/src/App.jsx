import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Lobby from "./pages/Lobby";
import Workspace from "./pages/Workspace";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProtectedRoute from "./components/ProtectedRoute";

/**
 * App - Main application component with routing
 */
function App() {
  return (
    <Router>
      <Routes>
        {/* Default route - redirect to lobby */}
        <Route path="/" element={<Navigate to="/lobby" replace />} />

        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Main routes - Protected */}
        <Route
          path="/lobby"
          element={
            <ProtectedRoute>
              <Lobby />
            </ProtectedRoute>
          }
        />
        <Route
          path="/board/:id"
          element={
            <ProtectedRoute>
              <Workspace />
            </ProtectedRoute>
          }
        />

        {/* Catch-all - redirect to lobby */}
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
