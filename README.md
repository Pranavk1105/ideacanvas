# ZedCanvas 🎨

A real-time collaborative whiteboard application built with the MERN stack.

## Features

- **Real-time Collaboration**: Multiple users can draw simultaneously
- **Drawing Tools**: Pen, rectangle, circle, and text tools
- **Layers**: Organize drawings with layer support
- **Object Selection**: Select, move, and modify shapes
- **Presence**: See other users' cursors in real-time
- **Undo/Redo**: Operation-based history system
- **Authentication**: JWT-based user authentication

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express + Socket.IO
- **Database**: MongoDB + Mongoose
- **Real-time**: Socket.IO for WebSocket communication

## Prerequisites

- Node.js 18+
- MongoDB (running locally or connection string)

## Quick Start

### 1. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

Create `backend/.env` file:

```env
MONGO_URI=mongodb://localhost:27017/ideacanvas
BACKEND_PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

### 3. Start Services

```bash
# Terminal 1 - Start Backend
cd backend
npm start

# Terminal 2 - Start Frontend
cd frontend
npm run dev
```

### 4. Open Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000

## Usage

1. **Register/Login**: Create an account or login
2. **Create Board**: Click "Create New Board" in the lobby
3. **Draw**: Select a tool and start drawing on the canvas
4. **Collaborate**: Share the board URL with others to collaborate in real-time

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Boards

- `GET /api/boards` - List all accessible boards
- `POST /api/boards` - Create new board
- `GET /api/boards/:id` - Get board details
- `DELETE /api/boards/:id` - Delete board (owner only)
- `POST /api/boards/:id/invite` - Invite user to board

### Health Check

- `GET /health` - Server health status

## Socket.IO Events

### Client → Server

- `join-board` - Join a board room
- `draw-start` - Start drawing
- `draw-delta` - Drawing progress
- `draw-end` - Complete drawing
- `create-shape` - Create rectangle/circle/text
- `update-shape` - Update shape position/properties
- `delete-shape` - Delete a shape
- `undo` - Undo last operation
- `lock-object` - Lock object for editing
- `unlock-object` - Release object lock
- `cursor-move` - Update cursor position

### Server → Client

- `board-state` - Initial board state on join
- `shape-created` - New shape created
- `shape-updated` - Shape updated
- `shape-deleted` - Shape deleted
- `undo-applied` - Undo operation applied
- `lock-update` - Object lock status changed
- `presence-state` - Active users list
- `user-joined` - User joined board
- `user-left` - User left board
- `cursor-update` - Remote cursor position

## Project Structure

```
zedcanvas/
├── backend/
│   ├── src/
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   └── Board.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   └── boards.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── services/
│   │   │   └── socketHandlers.js
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Lobby.jsx
│   │   │   ├── Workspace.jsx
│   │   │   ├── Login.jsx
│   │   │   └── Register.jsx
│   │   ├── components/
│   │   │   └── ProtectedRoute.jsx
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   └── package.json
└── README.md
```

## Development

### Backend Development

```bash
cd backend
npm run dev  # Uses nodemon for auto-reload
```

### Frontend Development

```bash
cd frontend
npm run dev  # Vite dev server with HMR
```

## Testing Real-time Features

1. Open http://localhost:5173 in two different browsers
2. Login with different accounts in each
3. Create/join the same board
4. Draw in one browser and see it appear in the other instantly

## Security Notes

⚠️ **Important for Production:**

- Change `JWT_SECRET` to a secure random string
- Enable MongoDB authentication
- Use HTTPS/SSL certificates
- Configure proper CORS settings
- Add rate limiting
- Implement input validation
- Never commit `.env` files

## Known Limitations

- In-memory locks (not suitable for multi-instance deployment)
- No Redis adapter for Socket.IO (required for horizontal scaling)
- Last-write-wins conflict resolution
- No image upload support
- Limited redo functionality

## License

MIT

## Support

For issues or questions, please open a GitHub issue.

---

**Built with ❤️ using React, Node.js, Express, Socket.IO, and MongoDB**