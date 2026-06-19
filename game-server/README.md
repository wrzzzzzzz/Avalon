# Game Server

Express + Socket.io backend server for the multiplayer game application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file:
```bash
cp .env.example .env
```

3. Update the `.env` file with your configuration:
   - Set `MONGODB_URI` to your MongoDB connection string
   - Set `JWT_SECRET` to a secure random string
   - Set `CLIENT_URL` to your frontend URL

4. Make sure MongoDB is running.

5. Start the server:
```bash
npm run dev  # Development mode with nodemon
# or
npm start    # Production mode
```

The server will run on http://localhost:5000

## Project Structure

- `server.js` - Main server entry point
- `routes/` - API route definitions
- `controllers/` - Route handlers
- `models/` - MongoDB schemas
- `middleware/` - Express middleware (auth, etc.)
- `services/` - Business logic services
- `db/` - Database connection utilities
- `static/` - Static file storage

## API Documentation

See main README.md for API endpoints.

