# pdf_narrator
some vibe coding narrator of pdfs (python tts, node.js, react)

using Gemini-2.5-pro

## Setup

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Install Python dependencies for TTS:
   ```bash
   pip install -r requirements.txt
   ```

4. Install TypeScript and nodemon globally (if not already installed):
   ```bash
   npm install -g typescript ts-node nodemon
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install React dependencies:
   ```bash
   npm install
   ```

## Running the Application

### Quick Start Commands

**Backend Server:**
```bash
cd backend && npm run dev
```

**Frontend Development Server:**
```bash
cd frontend && npm start
```

### Development Mode
1. Start the backend server (runs on port 3001):
   ```bash
   cd backend
   npm run dev
   ```
> npm scripts saved in package.json

2. In a new terminal, start the frontend (runs on port 3000):
   ```bash
   cd frontend
   npm start
   ```
> npm scripts saved in package.json

The frontend will automatically open in your browser at `http://localhost:3000` and will proxy API requests to the backend at `http://localhost:3001`. 

