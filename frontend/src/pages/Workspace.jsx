import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import api from "../services/api";

/**
 * Workspace - Main collaborative whiteboard component
 *
 * Features:
 * - HTML5 Canvas drawing with freehand paths
 * - Shape tools (rect, circle, text)
 * - Selection and transformation
 * - Layers panel
 * - Real-time collaboration via Socket.IO
 * - Undo/redo with operation log
 * - Object locking
 * - Presence (collaborative cursors)
 */
const Workspace = () => {
  const { id: boardId } = useParams();
  const navigate = useNavigate();

  // Refs
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const drawingRef = useRef(false);
  const currentPathRef = useRef(null);
  const lastEmitTimeRef = useRef(0);

  // Canvas state
  const [shapes, setShapes] = useState([]);
  const [boardName, setBoardName] = useState("");
  const [currentDrawingPath, setCurrentDrawingPath] = useState(null);
  const [currentDrawingShape, setCurrentDrawingShape] = useState(null);

  // Tool state
  const [currentTool, setCurrentTool] = useState("pen"); // pen, rect, circle, text, select
  const [currentColor, setCurrentColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);

  // Layer state
  const [layers, setLayers] = useState(["default"]);
  const [currentLayer, setCurrentLayer] = useState("default");
  const [layerVisibility, setLayerVisibility] = useState({ default: true });

  // Selection state
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  // Presence state
  const [collaborators, setCollaborators] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});

  // Lock state
  const [lockedObjects, setLockedObjects] = useState({});

  // UI state
  const [showLayers, setShowLayers] = useState(true);
  const [showCollaborators, setShowCollaborators] = useState(true);
  const [error, setError] = useState(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  /**
   * Generate unique ID for shapes
   */
  const generateId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * Throttle function for limiting event emissions
   */
  const throttle = (func, delay) => {
    return (...args) => {
      const now = Date.now();
      if (now - lastEmitTimeRef.current >= delay) {
        lastEmitTimeRef.current = now;
        func(...args);
      }
    };
  };

  /**
   * Initialize Socket.IO connection
   */
  useEffect(() => {
    const SOCKET_URL =
      import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
    const token = api.getToken();

    socketRef.current = io(SOCKET_URL, {
      auth: { token },
    });

    const socket = socketRef.current;

    // Join board room
    socket.emit("join-board", { boardId, token });

    // Listen for board state (on join)
    socket.on("board-state", (data) => {
      console.log("Received board state:", data);
      setShapes(data.shapes || []);
      setLockedObjects(data.locks || {});

      // Extract unique layers from shapes
      const uniqueLayers = [
        ...new Set(data.shapes.map((s) => s.layer || "default")),
      ];
      setLayers(uniqueLayers.length > 0 ? uniqueLayers : ["default"]);
    });

    // Listen for draw events from other users
    socket.on("draw-start", (data) => {
      console.log("Remote draw-start:", data);
      // Could show temporary drawing indicator
    });

    socket.on(
      "draw-delta",
      throttle((data) => {
        // Update in-progress remote drawing (optional visual feedback)
        // For simplicity, we wait for draw-end
      }, 50),
    );

    socket.on("draw-end", (data) => {
      console.log("Remote draw-end:", data);
      // Add the completed path to shapes
      const shape = {
        id: data.id,
        type: "path",
        points: data.points,
        color: data.color,
        strokeWidth: data.strokeWidth,
        layer: data.layer || "default",
      };
      setShapes((prev) => [...prev, shape]);
    });

    // Listen for shape events
    socket.on("shape-created", (shape) => {
      console.log("Remote shape-created:", shape);
      setShapes((prev) => [...prev, shape]);
    });

    socket.on("shape-updated", (data) => {
      console.log("Remote shape-updated:", data);
      setShapes((prev) =>
        prev.map((shape) =>
          shape.id === data.shapeId ? { ...shape, ...data.changes } : shape,
        ),
      );
    });

    socket.on("shape-deleted", (data) => {
      console.log("Remote shape-deleted:", data);
      setShapes((prev) => prev.filter((s) => s.id !== data.shapeId));
    });

    // Listen for undo events
    socket.on("undo-applied", (data) => {
      console.log("Undo applied:", data);
      // Server sends full shapes state after undo
      setShapes(data.shapes || []);
    });

    // Listen for lock events
    socket.on("lock-update", (data) => {
      console.log("Lock update:", data);
      if (data.locked) {
        setLockedObjects((prev) => ({ ...prev, [data.objectId]: data.userId }));
      } else {
        setLockedObjects((prev) => {
          const newLocks = { ...prev };
          delete newLocks[data.objectId];
          return newLocks;
        });
      }
    });

    socket.on("lock-failed", (data) => {
      setError(`Object is locked by another user`);
      setTimeout(() => setError(null), 3000);
    });

    // Listen for presence events
    socket.on("presence-state", (users) => {
      console.log("Presence state:", users);
      setCollaborators(users);
    });

    socket.on("user-joined", (user) => {
      console.log("User joined:", user);
      setCollaborators((prev) => [...prev, user]);
    });

    socket.on("user-left", (socketId) => {
      console.log("User left:", socketId);
      setCollaborators((prev) => prev.filter((u) => u.socketId !== socketId));
      setRemoteCursors((prev) => {
        const newCursors = { ...prev };
        delete newCursors[socketId];
        return newCursors;
      });
    });

    socket.on("cursor-update", (data) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [data.userId]: data.cursor,
      }));
    });

    // Listen for errors
    socket.on("error", (data) => {
      console.error("Socket error:", data);
      setError(data.message);

      // If access is denied, redirect to login
      if (
        data.message &&
        data.message.toLowerCase().includes("access denied")
      ) {
        setTimeout(() => {
          navigate("/login");
        }, 2000);
      } else {
        setTimeout(() => setError(null), 3000);
      }
    });

    // Cleanup on unmount
    return () => {
      socket.emit("leave-board");
      socket.disconnect();
    };
  }, [boardId]);

  /**
   * Load board metadata
   */
  useEffect(() => {
    const loadBoard = async () => {
      try {
        const board = await api.boards.getBoard(boardId);
        setBoardName(board.name);
      } catch (err) {
        console.error("Failed to load board:", err);
        setError("Failed to load board");
      }
    };

    loadBoard();
  }, [boardId]);

  /**
   * Invite user to board
   */
  const handleInviteUser = async () => {
    if (!inviteEmail || !inviteEmail.trim()) {
      setError("Please enter an email address");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setInviting(true);
    setError(null);
    setInviteSuccess(null);

    try {
      const response = await api.boards.inviteUser(boardId, inviteEmail.trim());
      setInviteSuccess(`Successfully invited ${inviteEmail}`);
      setInviteEmail("");
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSuccess(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to invite user:", err);
      setError(err.message || "Failed to invite user");
      setTimeout(() => setError(null), 3000);
    } finally {
      setInviting(false);
    }
  };

  /**
   * Redraw canvas when shapes change
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all shapes (respecting layer visibility)
    shapes.forEach((shape) => {
      const layerVisible = layerVisibility[shape.layer] !== false;
      if (!layerVisible) return;

      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.strokeWidth || 2;
      ctx.fillStyle = shape.color;

      if (shape.type === "path") {
        // Draw freehand path
        if (shape.points && shape.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i].x, shape.points[i].y);
          }
          ctx.stroke();
        }
      } else if (shape.type === "rect") {
        // Draw rectangle
        ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);

        // Highlight if selected
        if (shape.id === selectedShapeId) {
          ctx.strokeStyle = "#00ff00";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
          ctx.setLineDash([]);
        }
      } else if (shape.type === "circle") {
        // Draw circle
        const radius =
          Math.sqrt(shape.width * shape.width + shape.height * shape.height) /
          2;
        ctx.beginPath();
        ctx.arc(
          shape.x + shape.width / 2,
          shape.y + shape.height / 2,
          radius,
          0,
          2 * Math.PI,
        );
        ctx.stroke();

        // Highlight if selected
        if (shape.id === selectedShapeId) {
          ctx.strokeStyle = "#00ff00";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(
            shape.x + shape.width / 2,
            shape.y + shape.height / 2,
            radius,
            0,
            2 * Math.PI,
          );
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (shape.type === "text") {
        // Draw text
        ctx.font = `${shape.strokeWidth * 10 || 20}px sans-serif`;
        ctx.fillText(shape.text || "", shape.x, shape.y);

        // Highlight if selected
        if (shape.id === selectedShapeId) {
          const metrics = ctx.measureText(shape.text || "");
          ctx.strokeStyle = "#00ff00";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(
            shape.x - 2,
            shape.y - (shape.strokeWidth * 10 || 20),
            metrics.width + 4,
            (shape.strokeWidth * 10 || 20) + 4,
          );
          ctx.setLineDash([]);
        }
      }
    });

    // Draw in-progress path (if currently drawing with pen tool)
    if (currentDrawingPath && currentDrawingPath.points.length > 0) {
      ctx.strokeStyle = currentDrawingPath.color;
      ctx.lineWidth = currentDrawingPath.strokeWidth || 2;
      ctx.beginPath();
      ctx.moveTo(
        currentDrawingPath.points[0].x,
        currentDrawingPath.points[0].y,
      );
      for (let i = 1; i < currentDrawingPath.points.length; i++) {
        ctx.lineTo(
          currentDrawingPath.points[i].x,
          currentDrawingPath.points[i].y,
        );
      }
      ctx.stroke();
    }

    // Draw in-progress shape (rect/circle being drawn)
    if (currentDrawingShape) {
      ctx.strokeStyle = currentDrawingShape.color;
      ctx.lineWidth = currentDrawingShape.strokeWidth || 2;
      ctx.setLineDash([5, 5]); // Dashed preview

      if (currentDrawingShape.type === "rect") {
        ctx.strokeRect(
          currentDrawingShape.x,
          currentDrawingShape.y,
          currentDrawingShape.width,
          currentDrawingShape.height,
        );
      } else if (currentDrawingShape.type === "circle") {
        const radius =
          Math.sqrt(
            currentDrawingShape.width * currentDrawingShape.width +
              currentDrawingShape.height * currentDrawingShape.height,
          ) / 2;
        ctx.beginPath();
        ctx.arc(
          currentDrawingShape.x + currentDrawingShape.width / 2,
          currentDrawingShape.y + currentDrawingShape.height / 2,
          radius,
          0,
          2 * Math.PI,
        );
        ctx.stroke();
      }

      ctx.setLineDash([]); // Reset dash
    }

    // Draw remote cursors
    Object.entries(remoteCursors).forEach(([userId, cursor]) => {
      const collaborator = collaborators.find((c) => c.userId === userId);
      if (collaborator) {
        // Draw cursor
        ctx.fillStyle = collaborator.color || "#ff0000";
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Draw label
        ctx.font = "12px sans-serif";
        ctx.fillText(collaborator.userName, cursor.x + 10, cursor.y);
      }
    });
  }, [
    shapes,
    layerVisibility,
    selectedShapeId,
    remoteCursors,
    collaborators,
    currentDrawingPath,
    currentDrawingShape,
  ]);

  /**
   * Get canvas coordinates from mouse event
   */
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  /**
   * Check if point is inside a shape (for selection)
   */
  const isPointInShape = (x, y, shape) => {
    if (shape.type === "rect") {
      return (
        x >= shape.x &&
        x <= shape.x + shape.width &&
        y >= shape.y &&
        y <= shape.y + shape.height
      );
    } else if (shape.type === "circle") {
      const centerX = shape.x + shape.width / 2;
      const centerY = shape.y + shape.height / 2;
      const radius =
        Math.sqrt(shape.width * shape.width + shape.height * shape.height) / 2;
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      return dist <= radius;
    } else if (shape.type === "text") {
      // Simple bounding box for text
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.font = `${shape.strokeWidth * 10 || 20}px sans-serif`;
      const metrics = ctx.measureText(shape.text || "");
      return (
        x >= shape.x &&
        x <= shape.x + metrics.width &&
        y >= shape.y - (shape.strokeWidth * 10 || 20) &&
        y <= shape.y
      );
    }
    return false;
  };

  /**
   * Handle mouse down on canvas
   */
  const handleMouseDown = (e) => {
    const coords = getCanvasCoords(e);
    const socket = socketRef.current;

    if (currentTool === "select") {
      // Check if clicking on a shape
      const clickedShape = [...shapes]
        .reverse()
        .find((shape) => isPointInShape(coords.x, coords.y, shape));

      if (clickedShape) {
        // Check if locked
        if (lockedObjects[clickedShape.id]) {
          setError("Object is locked by another user");
          setTimeout(() => setError(null), 3000);
          return;
        }

        setSelectedShapeId(clickedShape.id);
        setIsDragging(true);
        setDragStart(coords);

        // Acquire lock
        socket.emit("lock-object", { objectId: clickedShape.id });
      } else {
        setSelectedShapeId(null);
      }
    } else if (currentTool === "pen") {
      // Start freehand drawing
      drawingRef.current = true;
      const pathId = generateId();
      const newPath = {
        id: pathId,
        points: [coords],
        color: currentColor,
        strokeWidth,
        layer: currentLayer,
      };
      currentPathRef.current = newPath;
      setCurrentDrawingPath(newPath);

      // Emit draw-start
      socket.emit("draw-start", {
        id: pathId,
        x: coords.x,
        y: coords.y,
        color: currentColor,
        strokeWidth,
      });
    } else if (["rect", "circle"].includes(currentTool)) {
      // Start shape creation
      drawingRef.current = true;
      setDragStart(coords);
      setCurrentDrawingShape({
        type: currentTool,
        x: coords.x,
        y: coords.y,
        width: 0,
        height: 0,
        color: currentColor,
        strokeWidth,
      });
    } else if (currentTool === "text") {
      // Insert text
      const text = prompt("Enter text:");
      if (text) {
        const shapeId = generateId();
        socket.emit("create-shape", {
          id: shapeId,
          type: "text",
          x: coords.x,
          y: coords.y,
          width: 100,
          height: 20,
          color: currentColor,
          strokeWidth,
          text,
          layer: currentLayer,
        });
      }
    }
  };

  /**
   * Handle mouse move on canvas
   */
  const handleMouseMove = useCallback(
    (e) => {
      const coords = getCanvasCoords(e);
      const socket = socketRef.current;

      // Throttled cursor position update for presence
      const emitCursor = throttle(() => {
        socket.emit("cursor-move", coords);
      }, 100);
      emitCursor();

      if (
        currentTool === "pen" &&
        drawingRef.current &&
        currentPathRef.current
      ) {
        // Continue freehand drawing
        currentPathRef.current.points.push(coords);

        // Update state to trigger redraw
        setCurrentDrawingPath({ ...currentPathRef.current });

        // Emit draw-delta (throttled)
        const emitDelta = throttle(() => {
          socket.emit("draw-delta", {
            id: currentPathRef.current.id,
            points: [coords],
          });
        }, 40);
        emitDelta();
      } else if (currentTool === "select" && isDragging && selectedShapeId) {
        // Drag selected shape
        const dx = coords.x - dragStart.x;
        const dy = coords.y - dragStart.y;

        setShapes((prev) =>
          prev.map((shape) =>
            shape.id === selectedShapeId
              ? { ...shape, x: shape.x + dx, y: shape.y + dy }
              : shape,
          ),
        );

        setDragStart(coords);
      } else if (
        ["rect", "circle"].includes(currentTool) &&
        drawingRef.current &&
        dragStart
      ) {
        // Update preview of rect/circle being drawn
        const width = coords.x - dragStart.x;
        const height = coords.y - dragStart.y;
        setCurrentDrawingShape({
          type: currentTool,
          x: Math.min(dragStart.x, coords.x),
          y: Math.min(dragStart.y, coords.y),
          width: Math.abs(width),
          height: Math.abs(height),
          color: currentColor,
          strokeWidth,
        });
      }
    },
    [
      currentTool,
      currentColor,
      strokeWidth,
      isDragging,
      selectedShapeId,
      dragStart,
    ],
  );

  /**
   * Handle mouse up on canvas
   */
  const handleMouseUp = (e) => {
    const coords = getCanvasCoords(e);
    const socket = socketRef.current;

    if (currentTool === "pen" && drawingRef.current && currentPathRef.current) {
      // Finish freehand drawing
      drawingRef.current = false;

      // Emit draw-end with full path
      socket.emit("draw-end", currentPathRef.current);

      currentPathRef.current = null;
      setCurrentDrawingPath(null);
    } else if (
      ["rect", "circle"].includes(currentTool) &&
      drawingRef.current &&
      dragStart
    ) {
      // Finish shape creation
      drawingRef.current = false;

      const width = coords.x - dragStart.x;
      const height = coords.y - dragStart.y;

      if (Math.abs(width) > 5 && Math.abs(height) > 5) {
        const shapeId = generateId();
        socket.emit("create-shape", {
          id: shapeId,
          type: currentTool,
          x: Math.min(dragStart.x, coords.x),
          y: Math.min(dragStart.y, coords.y),
          width: Math.abs(width),
          height: Math.abs(height),
          color: currentColor,
          strokeWidth,
          layer: currentLayer,
        });
      }

      setDragStart(null);
      setCurrentDrawingShape(null);
    } else if (currentTool === "select" && isDragging && selectedShapeId) {
      // Finish dragging - emit update
      const shape = shapes.find((s) => s.id === selectedShapeId);
      if (shape) {
        socket.emit("update-shape", {
          shapeId: selectedShapeId,
          changes: { x: shape.x, y: shape.y },
        });
      }

      setIsDragging(false);

      // Release lock
      socket.emit("unlock-object", { objectId: selectedShapeId });
    }
  };

  /**
   * Handle undo action
   */
  const handleUndo = () => {
    socketRef.current.emit("undo");
  };

  /**
   * Handle delete selected shape
   */
  const handleDelete = () => {
    if (selectedShapeId) {
      if (lockedObjects[selectedShapeId]) {
        setError("Object is locked by another user");
        setTimeout(() => setError(null), 3000);
        return;
      }

      socketRef.current.emit("delete-shape", { shapeId: selectedShapeId });
      setSelectedShapeId(null);
    }
  };

  /**
   * Clear all shapes from the board
   */
  const handleClearBoard = () => {
    if (
      window.confirm(
        "Are you sure you want to clear the entire board? This action cannot be undone.",
      )
    ) {
      const socket = socketRef.current;

      // Delete all shapes one by one
      shapes.forEach((shape) => {
        socket.emit("delete-shape", { shapeId: shape.id });
      });

      // Clear local state immediately
      setShapes([]);
      setSelectedShapeId(null);
    }
  };

  /**
   * Toggle layer visibility
   */
  const toggleLayerVisibility = (layer) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  };

  /**
   * Add new layer
   */
  const addLayer = () => {
    const layerName = prompt("Enter layer name:");
    if (layerName && !layers.includes(layerName)) {
      setLayers((prev) => [...prev, layerName]);
      setLayerVisibility((prev) => ({ ...prev, [layerName]: true }));
      setCurrentLayer(layerName);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => navigate("/lobby")} style={styles.backButton}>
          ← Back to Lobby
        </button>
        <h1 style={styles.title}>
          {boardName || "Loading..."}
          <span
            style={{
              fontSize: "12px",
              color: "#4caf50",
              marginLeft: "10px",
              fontWeight: "normal",
            }}
          ></span>
        </h1>
        <div style={styles.headerRight}>
          <button
            onClick={() => setShowInviteModal(true)}
            style={styles.inviteButton}
            title="Invite collaborator"
          >
            + Invite User
          </button>
          <span style={styles.boardId}>Board ID: {boardId}</span>
        </div>
      </div>

      {/* Error banner */}
      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* Main content */}
      <div style={styles.mainContent}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <div style={styles.toolSection}>
            <h3 style={styles.sectionTitle}>Tools</h3>
            <button
              onClick={() => setCurrentTool("select")}
              style={{
                ...styles.toolButton,
                ...(currentTool === "select" ? styles.activeButton : {}),
              }}
              title="Select (move/resize)"
            >
              ⬚
            </button>
            <button
              onClick={() => setCurrentTool("pen")}
              style={{
                ...styles.toolButton,
                ...(currentTool === "pen" ? styles.activeButton : {}),
              }}
              title="Pen (freehand)"
            >
              ✏️
            </button>
            <button
              onClick={() => setCurrentTool("rect")}
              style={{
                ...styles.toolButton,
                ...(currentTool === "rect" ? styles.activeButton : {}),
              }}
              title="Rectangle"
            >
              ▭
            </button>
            <button
              onClick={() => setCurrentTool("circle")}
              style={{
                ...styles.toolButton,
                ...(currentTool === "circle" ? styles.activeButton : {}),
              }}
              title="Circle"
            >
              ○
            </button>
            <button
              onClick={() => setCurrentTool("text")}
              style={{
                ...styles.toolButton,
                ...(currentTool === "text" ? styles.activeButton : {}),
              }}
              title="Text"
            >
              T
            </button>
          </div>

          <div style={styles.toolSection}>
            <h3 style={styles.sectionTitle}>Style</h3>
            <label style={styles.label}>
              Color:
              <input
                type="color"
                value={currentColor}
                onChange={(e) => setCurrentColor(e.target.value)}
                style={styles.colorPicker}
              />
            </label>
            <label style={styles.label}>
              Width:
              <input
                type="range"
                min="1"
                max="20"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                style={styles.slider}
              />
              <span>{strokeWidth}px</span>
            </label>
          </div>

          <div style={styles.toolSection}>
            <h3 style={styles.sectionTitle}>Actions</h3>
            <button onClick={handleUndo} style={styles.actionButton}>
              ↶ Undo
            </button>
            <button
              onClick={handleDelete}
              style={styles.actionButton}
              disabled={!selectedShapeId}
            >
              🗑️ Delete
            </button>
            <button
              onClick={handleClearBoard}
              style={{
                ...styles.actionButton,
                backgroundColor: "#dc3545",
                color: "white",
              }}
              disabled={shapes.length === 0}
            >
              🧹 Clear Board
            </button>
          </div>

          <div style={styles.toolSection}>
            <h3 style={styles.sectionTitle}>Layer</h3>
            <select
              value={currentLayer}
              onChange={(e) => setCurrentLayer(e.target.value)}
              style={styles.select}
            >
              {layers.map((layer) => (
                <option key={layer} value={layer}>
                  {layer}
                </option>
              ))}
            </select>
            <button onClick={addLayer} style={styles.actionButton}>
              + New Layer
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div style={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            width={1200}
            height={800}
            style={styles.canvas}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {/* Status indicator */}
          <div
            style={{
              position: "absolute",
              bottom: "20px",
              left: "20px",
              background: "rgba(255, 255, 255, 0.95)",
              padding: "12px 20px",
              borderRadius: "8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              fontSize: "14px",
              fontWeight: "600",
              color: "#333",
            }}
          >
            <div>Shapes: {shapes.length}</div>
            <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
              Tool: {currentTool}
              {(currentDrawingPath || currentDrawingShape) && (
                <span style={{ color: "#4caf50", marginLeft: "8px" }}>
                  ● Drawing...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Side panels */}
        <div style={styles.sidePanels}>
          {/* Layers Panel */}
          {showLayers && (
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <h3 style={styles.panelTitle}>Layers</h3>
                <button
                  onClick={() => setShowLayers(false)}
                  style={styles.closeButton}
                >
                  ×
                </button>
              </div>
              <div style={styles.panelContent}>
                {layers.map((layer) => (
                  <div key={layer} style={styles.layerItem}>
                    <input
                      type="checkbox"
                      checked={layerVisibility[layer] !== false}
                      onChange={() => toggleLayerVisibility(layer)}
                      style={styles.checkbox}
                    />
                    <span style={styles.layerName}>{layer}</span>
                    {layer === currentLayer && (
                      <span style={styles.currentBadge}>current</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collaborators Panel */}
          {showCollaborators && (
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <h3 style={styles.panelTitle}>
                  Collaborators ({collaborators.length})
                </h3>
                <button
                  onClick={() => setShowCollaborators(false)}
                  style={styles.closeButton}
                >
                  ×
                </button>
              </div>
              <div style={styles.panelContent}>
                {collaborators.map((collab, idx) => (
                  <div key={idx} style={styles.collaboratorItem}>
                    <div
                      style={{
                        ...styles.collaboratorDot,
                        backgroundColor: collab.color,
                      }}
                    />
                    <span style={styles.collaboratorName}>
                      {collab.userName}
                    </span>
                  </div>
                ))}
                {collaborators.length === 0 && (
                  <p style={styles.emptyText}>No other collaborators</p>
                )}
              </div>
            </div>
          )}

          {/* Toggle buttons if panels are closed */}
          {!showLayers && (
            <button
              onClick={() => setShowLayers(true)}
              style={styles.toggleButton}
            >
              Show Layers
            </button>
          )}
          {!showCollaborators && (
            <button
              onClick={() => setShowCollaborators(true)}
              style={styles.toggleButton}
            >
              Show Collaborators
            </button>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Invite User to Board</h2>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteEmail("");
                  setInviteSuccess(null);
                }}
                style={styles.modalCloseButton}
              >
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              <label style={styles.modalLabel}>
                Email Address:
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !inviting) {
                      handleInviteUser();
                    }
                  }}
                  placeholder="colleague@example.com"
                  style={styles.modalInput}
                  disabled={inviting}
                  autoFocus
                />
              </label>
              {inviteSuccess && (
                <div style={styles.successMessage}>{inviteSuccess}</div>
              )}
            </div>
            <div style={styles.modalFooter}>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteEmail("");
                  setInviteSuccess(null);
                }}
                style={styles.modalCancelButton}
                disabled={inviting}
              >
                Cancel
              </button>
              <button
                onClick={handleInviteUser}
                style={styles.modalInviteButton}
                disabled={inviting || !inviteEmail.trim()}
              >
                {inviting ? "Inviting..." : "Send Invitation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Inline styles for simplicity (in production, use CSS modules or styled-components)
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "#f5f5f5",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 24px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e0e0e0",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  backButton: {
    padding: "8px 16px",
    backgroundColor: "#f0f0f0",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
  title: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  boardId: {
    fontSize: "12px",
    color: "#666",
    fontFamily: "monospace",
  },
  inviteButton: {
    padding: "8px 16px",
    backgroundColor: "#4CAF50",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background-color 0.2s",
  },
  errorBanner: {
    padding: "12px",
    backgroundColor: "#fee",
    color: "#c00",
    textAlign: "center",
    fontWeight: "500",
    borderBottom: "1px solid #fcc",
  },
  mainContent: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  toolbar: {
    width: "200px",
    backgroundColor: "#ffffff",
    borderRight: "1px solid #e0e0e0",
    padding: "16px",
    overflowY: "auto",
  },
  toolSection: {
    marginBottom: "24px",
    paddingBottom: "16px",
    borderBottom: "1px solid #e0e0e0",
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: "14px",
    fontWeight: "600",
    color: "#333",
  },
  toolButton: {
    width: "100%",
    padding: "10px",
    margin: "4px 0",
    backgroundColor: "#f8f8f8",
    border: "1px solid #ddd",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "18px",
    transition: "all 0.2s",
  },
  activeButton: {
    backgroundColor: "#4CAF50",
    color: "white",
    borderColor: "#4CAF50",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    marginBottom: "12px",
    fontSize: "13px",
    color: "#555",
  },
  colorPicker: {
    marginTop: "4px",
    width: "100%",
    height: "32px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    cursor: "pointer",
  },
  slider: {
    width: "100%",
    marginTop: "4px",
  },
  actionButton: {
    width: "100%",
    padding: "8px",
    margin: "4px 0",
    backgroundColor: "#2196F3",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
  },
  select: {
    width: "100%",
    padding: "8px",
    marginBottom: "8px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "13px",
    backgroundColor: "white",
  },
  canvasContainer: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
    overflow: "auto",
    padding: "20px",
  },
  canvas: {
    border: "1px solid #ccc",
    backgroundColor: "#ffffff",
    cursor: "crosshair",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
  },
  sidePanels: {
    width: "250px",
    backgroundColor: "#ffffff",
    borderLeft: "1px solid #e0e0e0",
    padding: "16px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  panel: {
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    overflow: "hidden",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    backgroundColor: "#f8f8f8",
    borderBottom: "1px solid #e0e0e0",
  },
  panelTitle: {
    margin: 0,
    fontSize: "14px",
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    background: "none",
    border: "none",
    fontSize: "20px",
    cursor: "pointer",
    color: "#666",
    padding: "0 4px",
  },
  panelContent: {
    padding: "12px",
  },
  layerItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px",
    marginBottom: "4px",
    backgroundColor: "#f9f9f9",
    borderRadius: "4px",
  },
  checkbox: {
    cursor: "pointer",
  },
  layerName: {
    flex: 1,
    fontSize: "13px",
    color: "#333",
  },
  currentBadge: {
    padding: "2px 8px",
    backgroundColor: "#4CAF50",
    color: "white",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "500",
  },
  collaboratorItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px",
    marginBottom: "4px",
  },
  collaboratorDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
  },
  collaboratorName: {
    fontSize: "13px",
    color: "#333",
  },
  emptyText: {
    fontSize: "13px",
    color: "#999",
    fontStyle: "italic",
    margin: 0,
  },
  toggleButton: {
    padding: "8px 12px",
    backgroundColor: "#f0f0f0",
    border: "1px solid #ddd",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    marginBottom: "8px",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
    width: "90%",
    maxWidth: "500px",
    maxHeight: "90vh",
    overflow: "auto",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px",
    borderBottom: "1px solid #e0e0e0",
  },
  modalTitle: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "600",
    color: "#333",
  },
  modalCloseButton: {
    background: "none",
    border: "none",
    fontSize: "28px",
    cursor: "pointer",
    color: "#666",
    lineHeight: 1,
    padding: 0,
    width: "32px",
    height: "32px",
  },
  modalBody: {
    padding: "20px",
  },
  modalLabel: {
    display: "block",
    fontSize: "14px",
    fontWeight: "500",
    color: "#333",
    marginBottom: "8px",
  },
  modalInput: {
    width: "100%",
    padding: "10px 12px",
    marginTop: "8px",
    fontSize: "14px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    boxSizing: "border-box",
    outline: "none",
  },
  successMessage: {
    marginTop: "12px",
    padding: "12px",
    backgroundColor: "#d4edda",
    color: "#155724",
    borderRadius: "4px",
    fontSize: "14px",
    fontWeight: "500",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    padding: "20px",
    borderTop: "1px solid #e0e0e0",
  },
  modalCancelButton: {
    padding: "10px 20px",
    backgroundColor: "#f0f0f0",
    color: "#333",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
  modalInviteButton: {
    padding: "10px 20px",
    backgroundColor: "#4CAF50",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
};

export default Workspace;
