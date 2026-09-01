#!/bin/bash

echo "Setting up PDF Narrator..."

# Check for Python virtual environment in root directory
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "Activating Python virtual environment..."
source .venv/bin/activate

# Install Python dependencies in virtual environment
if [ -f "backend/requirements.txt" ]; then
    echo "Installing Python dependencies in virtual environment..."
    pip install -r backend/requirements.txt
fi

# Backend Setup
echo "Checking backend dependencies..."
cd backend

# Check if backend needs npm install
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "Installing/updating Node.js dependencies..."
    npm install
else
    echo "Backend Node.js dependencies are up to date"
fi

# Check if TypeScript and ts-node are available (needed for dev script)
if ! npm list ts-node &> /dev/null; then
    echo "Installing ts-node locally..."
    npm install ts-node
fi

cd ..

# Frontend Setup
echo "Checking frontend dependencies..."
cd frontend

# Check if frontend needs npm install
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "Installing/updating React dependencies..."
    npm install
else
    echo "Frontend Node.js dependencies are up to date"
fi

cd ..

echo "Setup complete! Starting services..."

BACKEND_PORT=3001

# Start backend in background
(cd backend && npm run dev) &

# Wait for the backend to actually bind its port before starting the frontend.
# Otherwise Create React App sees 3000 busy and happily grabs 3001 out from
# under the backend, and every API call 404s against the dev server.
echo "Waiting for backend on port $BACKEND_PORT..."
for i in $(seq 1 60); do
    if curl -s -o /dev/null "http://localhost:$BACKEND_PORT/tts-engine"; then
        echo "Backend is up on port $BACKEND_PORT."
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "Backend did not come up on port $BACKEND_PORT - check the log above."
        exit 1
    fi
    sleep 1
done

# Pick the first free port for the frontend, never reusing the backend's.
FRONTEND_PORT=""
for candidate in 3000 3002 3003 3004 3005; do
    if [ "$candidate" = "$BACKEND_PORT" ]; then
        continue
    fi
    if ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then
        FRONTEND_PORT=$candidate
        break
    fi
done

if [ -z "$FRONTEND_PORT" ]; then
    echo "No free port available for the frontend (tried 3000, 3002-3005)."
    exit 1
fi

if [ "$FRONTEND_PORT" != "3000" ]; then
    echo "Port 3000 is in use - starting the frontend on port $FRONTEND_PORT instead."
fi

# Start frontend in background. PORT is set explicitly so CRA never prompts
# for an alternative port and never lands on the backend's.
(cd frontend && PORT=$FRONTEND_PORT npm start) &

# Wait for all background processes to complete
wait