#!/bin/bash

# Start backend in background
(cd backend && npm run dev) &

# Start frontend in background
(cd frontend && npm start) &

# Wait for all background processes to complete
wait