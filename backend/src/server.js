import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import boardRoutes from "./routes/boards.js";
import { setupSocketHandlers } from "./services/socketHandlers.js";

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.IO server with CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    mongodb:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/boards", boardRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoUri =
      process.env.MONGO_URI || "mongodb://mongo:27017/ideacanvas";

    await mongoose.connect(mongoUri);

    console.log("✅ MongoDB connected successfully");

    // Handle connection events
    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected");
    });
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    // In production, you might want to exit the process
    // process.exit(1);
  }
};

// Setup Socket.IO handlers
setupSocketHandlers(io);

// Start server
const PORT = process.env.BACKEND_PORT || 4000;

const startServer = async () => {
  // Connect to database first
  await connectDB();

  // Then start HTTP server
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Socket.IO ready for connections`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  });
};

startServer();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server gracefully...");
  httpServer.close(() => {
    console.log("Server closed");
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed");
      process.exit(0);
    });
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, closing server gracefully...");
  httpServer.close(() => {
    console.log("Server closed");
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed");
      process.exit(0);
    });
  });
});

// Export for testing
export { app, httpServer, io };
