import express from "express";
import Board from "../models/Board.js";
import User from "../models/User.js";
import { authenticateToken, optionalAuth } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/boards
 * Get list of all boards (public endpoint, optionally filtered by user access)
 * Returns: [{ id, name, ownerId, createdAt }]
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Show boards user owns or has access to
    const query = {
      $or: [{ ownerId: req.user.userId }, { allowedUsers: req.user.userId }],
    };

    const boards = await Board.find(query)
      .select("name ownerId createdAt")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(
      boards.map((board) => ({
        id: board._id,
        name: board.name,
        ownerId: board.ownerId,
        createdAt: board.createdAt,
      })),
    );
  } catch (error) {
    console.error("Get boards error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/boards
 * Create a new board (protected)
 * Body: { name }
 * Returns: { id, name, ownerId, shapes, ops, createdAt }
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Board name is required" });
    }

    const board = new Board({
      name: name.trim(),
      ownerId: req.user.userId,
      allowedUsers: [req.user.userId], // Owner is automatically allowed
      shapes: [],
      ops: [],
    });

    await board.save();

    res.status(201).json({
      id: board._id,
      name: board.name,
      ownerId: board.ownerId,
      shapes: board.shapes,
      ops: board.ops,
      createdAt: board.createdAt,
    });
  } catch (error) {
    console.error("Create board error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/boards/:id
 * Get full board state including shapes and ops
 * Returns: { id, name, ownerId, allowedUsers, shapes, ops, createdAt, updatedAt }
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ error: "Board not found" });
    }

    // Check access: owner or allowed user only
    const hasAccess =
      board.ownerId.toString() === req.user.userId ||
      board.allowedUsers.some((id) => id.toString() === req.user.userId);

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({
      id: board._id,
      name: board.name,
      ownerId: board.ownerId,
      allowedUsers: board.allowedUsers,
      shapes: board.shapes,
      ops: board.ops,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    });
  } catch (error) {
    console.error("Get board error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/boards/:id
 * Delete a board (owner only)
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ error: "Board not found" });
    }

    // Check ownership
    if (board.ownerId.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ error: "Only the owner can delete this board" });
    }

    await Board.findByIdAndDelete(req.params.id);

    res.json({ message: "Board deleted successfully" });
  } catch (error) {
    console.error("Delete board error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/boards/:id/invite
 * Invite a user to a board (simple implementation: add to allowedUsers)
 * Body: { userEmail }
 * Returns: { message, allowedUsers }
 */
router.post("/:id/invite", authenticateToken, async (req, res) => {
  try {
    const { userEmail } = req.body;

    if (!userEmail) {
      return res.status(400).json({ error: "User email is required" });
    }

    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ error: "Board not found" });
    }

    // Check if requester is owner or already has access
    const hasAccess =
      board.ownerId.toString() === req.user.userId ||
      board.allowedUsers.some((id) => id.toString() === req.user.userId);

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Find user to invite
    const userToInvite = await User.findOne({ email: userEmail });

    if (!userToInvite) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if already invited
    if (
      board.allowedUsers.some(
        (id) => id.toString() === userToInvite._id.toString(),
      )
    ) {
      return res.status(400).json({ error: "User already has access" });
    }

    // Add user to allowedUsers
    board.allowedUsers.push(userToInvite._id);
    await board.save();

    res.json({
      message: "User invited successfully",
      allowedUsers: board.allowedUsers,
    });
  } catch (error) {
    console.error("Invite user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
