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

# Start backend in background
(cd backend && npm run dev) &

# Start frontend in background
(cd frontend && npm start) &

# Wait for all background processes to complete
wait