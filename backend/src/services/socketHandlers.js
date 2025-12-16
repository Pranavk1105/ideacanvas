import jwt from "jsonwebtoken";
import Board from "../models/Board.js";
import User from "../models/User.js";

/**
 * In-memory locks structure:
 * {
 *   boardId: {
 *     objectId: { socketId, userId, timestamp }
 *   }
 * }
 *
 * LIMITATION: Locks are not persistent and only work with single backend instance.
 * For multi-instance deployment, use Redis or similar distributed store.
 */
const locks = {};

/**
 * Lock timeout in milliseconds (30 seconds)
 * After this time, locks are automatically released
 */
const LOCK_TIMEOUT = 30000;

/**
 * In-memory presence tracking per board:
 * {
 *   boardId: {
 *     socketId: { userId, userName, color, cursor: {x, y} }
 *   }
 * }
 */
const presence = {};

/**
 * Authenticate socket connection via JWT token
 * Returns user object or null if authentication fails
 */
const authenticateSocket = async (token) => {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("name email");
    return user
      ? { userId: user._id.toString(), name: user.name, email: user.email }
      : null;
  } catch (err) {
    console.error("Socket auth error:", err.message);
    return null;
  }
};

/**
 * Check if user has access to a board
 */
const checkBoardAccess = async (boardId, userId) => {
  const board = await Board.findById(boardId);
  if (!board) return false;

  // Require authentication - no public access
  if (!userId) return false;

  // Allow access if user is owner or in allowedUsers
  return (
    board.ownerId.toString() === userId ||
    board.allowedUsers.some((id) => id.toString() === userId)
  );
};

/**
 * Generate a random color for user cursor
 */
const generateUserColor = () => {
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

/**
 * Clean up expired locks for a board
 */
const cleanExpiredLocks = (boardId) => {
  if (!locks[boardId]) return;

  const now = Date.now();
  Object.keys(locks[boardId]).forEach((objectId) => {
    const lock = locks[boardId][objectId];
    if (now - lock.timestamp > LOCK_TIMEOUT) {
      delete locks[boardId][objectId];
      console.log(`Lock expired for object ${objectId} on board ${boardId}`);
    }
  });

  // Clean up board entry if no locks remain
  if (Object.keys(locks[boardId]).length === 0) {
    delete locks[boardId];
  }
};

/**
 * Create compensating op for undo
 * Returns the inverse operation that will undo the given op
 */
const createUndoOp = (op, board) => {
  switch (op.opType) {
    case "create":
      // Undo create → delete the created shape
      return {
        opType: "delete",
        payload: {
          shapeId: op.payload.id,
          deletedShape: op.payload, // Store for potential redo
        },
      };

    case "delete":
      // Undo delete → recreate the shape
      return {
        opType: "create",
        payload: op.payload.deletedShape,
      };

    case "update":
      // Undo update → update back with previous values
      // Find the shape to get its current state
      const shape = board.shapes.find((s) => s.id === op.payload.shapeId);
      if (!shape) return null;

      // Build reverse changes object
      const reverseChanges = {};
      Object.keys(op.payload.changes).forEach((key) => {
        reverseChanges[key] = shape[key];
      });

      return {
        opType: "update",
        payload: {
          shapeId: op.payload.shapeId,
          changes: reverseChanges,
        },
      };

    default:
      return null;
  }
};

/**
 * Apply an operation to the board
 * Modifies board.shapes array based on the op
 */
const applyOpToBoard = (board, op) => {
  switch (op.opType) {
    case "create":
      // Add shape if it doesn't already exist
      if (!board.shapes.find((s) => s.id === op.payload.id)) {
        board.shapes.push(op.payload);
      }
      break;

    case "delete":
      // Remove shape
      board.shapes = board.shapes.filter((s) => s.id !== op.payload.shapeId);
      break;

    case "update":
      // Update shape properties
      const shapeIndex = board.shapes.findIndex(
        (s) => s.id === op.payload.shapeId,
      );
      if (shapeIndex !== -1) {
        Object.assign(board.shapes[shapeIndex], op.payload.changes);
      }
      break;
  }
};

/**
 * Main Socket.IO setup function
 * Registers all event handlers and manages connections
 */
export const setupSocketHandlers = (io) => {
  console.log("Setting up Socket.IO handlers...");

  io.on("connection", async (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Store user info on socket for easy access
    socket.userData = null;
    socket.currentBoardId = null;

    /**
     * EVENT: join-board
     * Client joins a board room and receives full board state
     * Payload: { boardId, token? }
     */
    socket.on("join-board", async (data) => {
      try {
        const { boardId, token } = data;

        // Authenticate if token provided
        if (token) {
          socket.userData = await authenticateSocket(token);
        }

        // Check board access
        const hasAccess = await checkBoardAccess(
          boardId,
          socket.userData?.userId,
        );
        if (!hasAccess) {
          socket.emit("error", { message: "Access denied to this board" });
          return;
        }

        // Leave previous board if any
        if (socket.currentBoardId) {
          socket.leave(socket.currentBoardId);
          // Remove from presence
          if (presence[socket.currentBoardId]) {
            delete presence[socket.currentBoardId][socket.id];
          }
        }

        // Join the board room
        socket.join(boardId);
        socket.currentBoardId = boardId;

        // Fetch board state
        const board = await Board.findById(boardId);
        if (!board) {
          socket.emit("error", { message: "Board not found" });
          return;
        }

        // Add user to presence
        if (!presence[boardId]) {
          presence[boardId] = {};
        }
        presence[boardId][socket.id] = {
          userId: socket.userData?.userId || `guest-${socket.id}`,
          userName: socket.userData?.name || "Guest",
          color: generateUserColor(),
          cursor: { x: 0, y: 0 },
        };

        // Send board state to joining client
        socket.emit("board-state", {
          shapes: board.shapes,
          ops: board.ops,
          locks: locks[boardId] || {},
        });

        // Send current presence to joining client
        socket.emit("presence-state", Object.values(presence[boardId]));

        // Notify others in room about new user
        socket.to(boardId).emit("user-joined", presence[boardId][socket.id]);

        console.log(`Socket ${socket.id} joined board ${boardId}`);
      } catch (error) {
        console.error("join-board error:", error);
        socket.emit("error", { message: "Failed to join board" });
      }
    });

    /**
     * EVENT: leave-board
     * Client explicitly leaves a board
     */
    socket.on("leave-board", () => {
      if (socket.currentBoardId) {
        const boardId = socket.currentBoardId;
        socket.leave(boardId);

        // Remove from presence
        if (presence[boardId]) {
          delete presence[boardId][socket.id];
          socket.to(boardId).emit("user-left", socket.id);
        }

        socket.currentBoardId = null;
        console.log(`Socket ${socket.id} left board ${boardId}`);
      }
    });

    /**
     * EVENT: draw-start
     * User starts a freehand drawing stroke
     * Payload: { id, x, y, color, strokeWidth }
     */
    socket.on("draw-start", (data) => {
      if (!socket.currentBoardId) return;

      // Broadcast to other users in the room
      socket.to(socket.currentBoardId).emit("draw-start", {
        ...data,
        userId: socket.userData?.userId || socket.id,
      });
    });

    /**
     * EVENT: draw-delta
     * User continues drawing - sends incremental points
     * Payload: { id, points: [{x, y}, ...] }
     *
     * Client should throttle these emissions (20-40ms intervals)
     */
    socket.on("draw-delta", (data) => {
      if (!socket.currentBoardId) return;

      // Broadcast delta to other users
      socket.to(socket.currentBoardId).emit("draw-delta", {
        ...data,
        userId: socket.userData?.userId || socket.id,
      });
    });

    /**
     * EVENT: draw-end
     * User completes a drawing stroke - persist to DB
     * Payload: { id, points: [{x, y}, ...], color, strokeWidth, layer? }
     */
    socket.on("draw-end", async (data) => {
      if (!socket.currentBoardId) return;

      try {
        const board = await Board.findById(socket.currentBoardId);
        if (!board) return;

        // Create shape object
        const shape = {
          id: data.id,
          type: "path",
          points: data.points,
          color: data.color,
          strokeWidth: data.strokeWidth,
          layer: data.layer || "default",
          createdBy: socket.userData?.userId || null,
          createdAt: new Date(),
        };

        // Add shape to board
        board.shapes.push(shape);

        // Create operation for undo/redo
        const op = {
          opType: "create",
          payload: shape,
          createdBy: socket.userData?.userId || null,
          createdAt: new Date(),
        };
        board.ops.push(op);

        await board.save();

        // Broadcast to room (including sender for confirmation)
        io.to(socket.currentBoardId).emit("draw-end", {
          ...data,
          userId: socket.userData?.userId || socket.id,
        });

        console.log(
          `Path ${data.id} persisted to board ${socket.currentBoardId}`,
        );
      } catch (error) {
        console.error("draw-end error:", error);
        socket.emit("error", { message: "Failed to save drawing" });
      }
    });

    /**
     * EVENT: create-shape
     * Create a shape (rect, circle, text)
     * Payload: { id, type, x, y, width, height, color, strokeWidth, text?, layer? }
     */
    socket.on("create-shape", async (data) => {
      if (!socket.currentBoardId) return;

      try {
        const board = await Board.findById(socket.currentBoardId);
        if (!board) return;

        // Create shape object
        const shape = {
          id: data.id,
          type: data.type,
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
          color: data.color,
          strokeWidth: data.strokeWidth,
          text: data.text || null,
          layer: data.layer || "default",
          createdBy: socket.userData?.userId || null,
          createdAt: new Date(),
        };

        // Add shape to board
        board.shapes.push(shape);

        // Create operation
        const op = {
          opType: "create",
          payload: shape,
          createdBy: socket.userData?.userId || null,
          createdAt: new Date(),
        };
        board.ops.push(op);

        await board.save();

        // Broadcast to room
        io.to(socket.currentBoardId).emit("shape-created", shape);

        console.log(
          `Shape ${data.id} created on board ${socket.currentBoardId}`,
        );
      } catch (error) {
        console.error("create-shape error:", error);
        socket.emit("error", { message: "Failed to create shape" });
      }
    });

    /**
     * EVENT: update-shape
     * Update shape properties (move, resize, style change)
     * Payload: { shapeId, changes: { x?, y?, width?, height?, color?, ... } }
     */
    socket.on("update-shape", async (data) => {
      if (!socket.currentBoardId) return;

      try {
        const board = await Board.findById(socket.currentBoardId);
        if (!board) return;

        // Find shape
        const shapeIndex = board.shapes.findIndex((s) => s.id === data.shapeId);
        if (shapeIndex === -1) {
          socket.emit("error", { message: "Shape not found" });
          return;
        }

        // Check if object is locked by another user
        cleanExpiredLocks(socket.currentBoardId);
        const lock = locks[socket.currentBoardId]?.[data.shapeId];
        if (lock && lock.socketId !== socket.id) {
          socket.emit("error", { message: "Object is locked by another user" });
          return;
        }

        // Store old values for undo
        const oldValues = {};
        Object.keys(data.changes).forEach((key) => {
          oldValues[key] = board.shapes[shapeIndex][key];
        });

        // Apply changes
        Object.assign(board.shapes[shapeIndex], data.changes);

        // Create operation
        const op = {
          opType: "update",
          payload: {
            shapeId: data.shapeId,
            changes: data.changes,
            oldValues, // Store for potential undo
          },
          createdBy: socket.userData?.userId || null,
          createdAt: new Date(),
        };
        board.ops.push(op);

        await board.save();

        // Broadcast to room
        io.to(socket.currentBoardId).emit("shape-updated", {
          shapeId: data.shapeId,
          changes: data.changes,
        });

        console.log(
          `Shape ${data.shapeId} updated on board ${socket.currentBoardId}`,
        );
      } catch (error) {
        console.error("update-shape error:", error);
        socket.emit("error", { message: "Failed to update shape" });
      }
    });

    /**
     * EVENT: delete-shape
     * Delete a shape from the board
     * Payload: { shapeId }
     */
    socket.on("delete-shape", async (data) => {
      if (!socket.currentBoardId) return;

      try {
        const board = await Board.findById(socket.currentBoardId);
        if (!board) return;

        // Find and store shape for undo
        const shape = board.shapes.find((s) => s.id === data.shapeId);
        if (!shape) {
          socket.emit("error", { message: "Shape not found" });
          return;
        }

        // Check if locked
        cleanExpiredLocks(socket.currentBoardId);
        const lock = locks[socket.currentBoardId]?.[data.shapeId];
        if (lock && lock.socketId !== socket.id) {
          socket.emit("error", { message: "Object is locked by another user" });
          return;
        }

        // Remove shape
        board.shapes = board.shapes.filter((s) => s.id !== data.shapeId);

        // Create operation
        const op = {
          opType: "delete",
          payload: {
            shapeId: data.shapeId,
            deletedShape: shape, // Store for undo
          },
          createdBy: socket.userData?.userId || null,
          createdAt: new Date(),
        };
        board.ops.push(op);

        await board.save();

        // Broadcast to room
        io.to(socket.currentBoardId).emit("shape-deleted", {
          shapeId: data.shapeId,
        });

        console.log(
          `Shape ${data.shapeId} deleted from board ${socket.currentBoardId}`,
        );
      } catch (error) {
        console.error("delete-shape error:", error);
        socket.emit("error", { message: "Failed to delete shape" });
      }
    });

    /**
     * EVENT: undo
     * Undo the last operation
     * Creates a compensating operation
     */
    socket.on("undo", async () => {
      if (!socket.currentBoardId) return;

      try {
        const board = await Board.findById(socket.currentBoardId);
        if (!board || board.ops.length === 0) {
          socket.emit("error", { message: "Nothing to undo" });
          return;
        }

        // Get last op
        const lastOp = board.ops[board.ops.length - 1];

        // Create compensating op
        const undoOp = createUndoOp(lastOp, board);
        if (!undoOp) {
          socket.emit("error", { message: "Cannot undo this operation" });
          return;
        }

        // Apply undo op to board state
        applyOpToBoard(board, undoOp);

        // Add undo op to history
        undoOp.createdBy = socket.userData?.userId || null;
        undoOp.createdAt = new Date();
        board.ops.push(undoOp);

        await board.save();

        // Broadcast undo to all clients
        io.to(socket.currentBoardId).emit("undo-applied", {
          undoOp,
          shapes: board.shapes, // Send full shapes state for simplicity
        });

        console.log(`Undo applied on board ${socket.currentBoardId}`);
      } catch (error) {
        console.error("undo error:", error);
        socket.emit("error", { message: "Failed to undo" });
      }
    });

    /**
     * EVENT: redo
     * Redo implementation (simplified - redo last undo)
     * In a full implementation, maintain separate undo/redo stacks
     */
    socket.on("redo", async () => {
      if (!socket.currentBoardId) return;

      // Simplified redo: similar logic to undo but operating on undo ops
      // For full production, maintain separate redo stack
      socket.emit("error", {
        message: "Redo not fully implemented - use undo to reverse",
      });
    });

    /**
     * EVENT: lock-object
     * Lock an object for editing (prevents others from modifying)
     * Payload: { objectId }
     */
    socket.on("lock-object", (data) => {
      if (!socket.currentBoardId) return;

      const { objectId } = data;
      const boardId = socket.currentBoardId;

      // Clean expired locks first
      cleanExpiredLocks(boardId);

      // Initialize board locks if needed
      if (!locks[boardId]) {
        locks[boardId] = {};
      }

      // Check if already locked by someone else
      const existingLock = locks[boardId][objectId];
      if (existingLock && existingLock.socketId !== socket.id) {
        socket.emit("lock-failed", {
          objectId,
          lockedBy: existingLock.userId,
        });
        return;
      }

      // Acquire lock
      locks[boardId][objectId] = {
        socketId: socket.id,
        userId: socket.userData?.userId || socket.id,
        timestamp: Date.now(),
      };

      // Broadcast lock update to room
      io.to(boardId).emit("lock-update", {
        objectId,
        locked: true,
        userId: socket.userData?.userId || socket.id,
      });

      console.log(
        `Object ${objectId} locked by ${socket.id} on board ${boardId}`,
      );
    });

    /**
     * EVENT: unlock-object
     * Release lock on an object
     * Payload: { objectId }
     */
    socket.on("unlock-object", (data) => {
      if (!socket.currentBoardId) return;

      const { objectId } = data;
      const boardId = socket.currentBoardId;

      if (!locks[boardId] || !locks[boardId][objectId]) {
        return; // Not locked
      }

      // Only the lock owner can unlock
      if (locks[boardId][objectId].socketId !== socket.id) {
        return;
      }

      // Release lock
      delete locks[boardId][objectId];

      // Broadcast unlock to room
      io.to(boardId).emit("lock-update", {
        objectId,
        locked: false,
      });

      console.log(
        `Object ${objectId} unlocked by ${socket.id} on board ${boardId}`,
      );
    });

    /**
     * EVENT: cursor-move
     * Update user cursor position for presence
     * Payload: { x, y }
     *
     * Client should throttle these emissions heavily (50-100ms)
     */
    socket.on("cursor-move", (data) => {
      if (!socket.currentBoardId) return;

      const boardId = socket.currentBoardId;
      if (presence[boardId] && presence[boardId][socket.id]) {
        presence[boardId][socket.id].cursor = { x: data.x, y: data.y };

        // Broadcast cursor update (excluding sender)
        socket.to(boardId).emit("cursor-update", {
          userId: presence[boardId][socket.id].userId,
          cursor: data,
        });
      }
    });

    /**
     * EVENT: disconnect
     * Clean up when socket disconnects
     */
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);

      if (socket.currentBoardId) {
        const boardId = socket.currentBoardId;

        // Remove from presence
        if (presence[boardId]) {
          delete presence[boardId][socket.id];
          socket.to(boardId).emit("user-left", socket.id);
        }

        // Release all locks held by this socket
        if (locks[boardId]) {
          Object.keys(locks[boardId]).forEach((objectId) => {
            if (locks[boardId][objectId].socketId === socket.id) {
              delete locks[boardId][objectId];
              io.to(boardId).emit("lock-update", {
                objectId,
                locked: false,
              });
            }
          });
        }
      }
    });
  });

  // Periodic cleanup of expired locks (every 60 seconds)
  setInterval(() => {
    Object.keys(locks).forEach((boardId) => {
      cleanExpiredLocks(boardId);
    });
  }, 60000);

  console.log("✅ Socket.IO handlers registered");
};
