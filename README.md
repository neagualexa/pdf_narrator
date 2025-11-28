# PDF Narrator
Text-to-Speech synthesizer for PDFs (python tts, node.js, react) (Vibe coding project assisted by Claude Sonnet 4)

<figure align="center">
  <img src="misc/PDF_narrator_screenshot.png" alt="Preview of PDF Narrator Webapp" />
  <figcaption><em>PDF Narrator web interface</em></figcaption>
</figure>

## Features

### Core Functionality
- **PDF Text Extraction**: Upload PDF files and automatically extract text content using `pdf-parse`
- **Intelligent Sentence Splitting**: Smart sentence detection and splitting using NLTK for natural speech flow
- **Dual TTS Engines**: 
  - **Pyttsx3**: System-integrated TTS with platform-native voices
  - **Piper**: High-quality neural TTS with multiple voice models (Cori, Aru, Lessac, Ryan)
- **Real-time Audio Generation**: On-demand audio synthesis with intelligent caching

### User Interface & Controls
- **PDF Viewer**: Integrated PDF preview alongside sentence list
- **Interactive Sentence List**: Click any sentence to play, with visual indicators for current/playing sentences
- **Floating Media Controls**: Play/pause, next/previous, stop with keyboard shortcuts (spacebar, arrow keys)
- **Voice Customization**: 
  - Multiple voice selection (British/American accents, male/female voices)
  - Adjustable speech speed (50-300 WPM)
  - TTS engine switching (Pyttsx3 ↔ Piper)
- **Continuous Playback**: Auto-play through entire document or manual sentence navigation

### Advanced Features
- **Smart Audio Caching**: 
  - Intelligent preloading of adjacent sentences for seamless playback
  - Automatic cleanup of distant audio files to manage storage
  - Cache status monitoring

## Quick Start

The easiest way to set up and run the PDF Narrator application is using the automated setup script:

```bash
chmod +x ./run.sh  # Make the script executable
./run.sh           # Setup dependencies and start both frontend and backend
```

This script will:
- Create a Python virtual environment (if needed)
- Install all Node.js dependencies for frontend and backend
- Install Python dependencies for TTS functionality
- Start both the backend server (port 3001) and frontend (port 3000)

The frontend will automatically open in your browser at `http://localhost:3000` and will proxy API requests to the backend at `http://localhost:3001`.

## Manual Setup (Alternative)

If you prefer to set up the components individually:

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

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install React dependencies:
   ```bash
   npm install
   ```

### Manual Development Mode
Start the backend server (runs on port 3001):
```bash
cd backend && npm run dev
```

In a new terminal, start the frontend (runs on port 3000):
```bash
cd frontend && npm start
``` 

