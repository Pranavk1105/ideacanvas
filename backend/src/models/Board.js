import mongoose from "mongoose";

// Embedded Shape schema - represents a drawing object on the canvas
const shapeSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["path", "rect", "circle", "text"],
    },
    // For freehand paths: array of {x, y} points
    points: [
      {
        x: Number,
        y: Number,
      },
    ],
    // For shapes: position and dimensions
    x: Number,
    y: Number,
    width: Number,
    height: Number,
    // Styling
    color: {
      type: String,
      default: "#000000",
    },
    strokeWidth: {
      type: Number,
      default: 2,
    },
    // For text objects
    text: String,
    // Layer assignment (simple string-based layers)
    layer: {
      type: String,
      default: "default",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

// Embedded Op schema - operation log for undo/redo
const opSchema = new mongoose.Schema(
  {
    opType: {
      type: String,
      required: true,
      enum: ["create", "update", "delete"],
    },
    // Payload varies by opType:
    // create: full shape object
    // update: { shapeId, changes }
    // delete: { shapeId, deletedShape (for undo) }
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const boardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Simple access control: array of user IDs who can view/edit
  allowedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  // All shapes currently on the board
  shapes: [shapeSchema],
  // Operation log for undo/redo - append-only
  ops: [opSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp on save
boardSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster board lookups by owner
boardSchema.index({ ownerId: 1 });

const Board = mongoose.model("Board", boardSchema, "canvasdb");

export default Board;
