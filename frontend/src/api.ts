const API_URL =
  process.env.REACT_APP_API_URL || "http://localhost:3001";

/**
 * A helper function to handle fetch responses.
 * @param response The raw fetch response.
 * @returns The JSON data from the response.
 * @throws An error if the response is not ok.
 */
async function handleResponse(response: Response) {
  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "An unknown error occurred." }));
    throw new Error(
      errorData.error || "Failed to communicate with the server."
    );
  }
  return response.json();
}

/**
 * Uploads a PDF file to the backend.
 * @param file The PDF file to upload.
 * @returns A promise that resolves with the extracted sentences, the 1-based
 *          source page of each sentence, and the document's page count.
 */
export async function uploadPdf(
  file: File
): Promise<{ sentences: string[]; pages: number[]; numPages: number }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(response);
}

/**
 * Stops any currently running audio generation process on the backend.
 */
export async function stopAudio(): Promise<void> {
  const response = await fetch(`${API_URL}/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  await handleResponse(response);
}

/**
 * The audio for a sentence, generated unless the server already has it.
 * @param sentence The text to convert to speech.
 * @param speed The speech speed (words per minute).
 * @param voiceId The ID of the voice to use for speech generation.
 * @returns A promise that resolves with the audio URL and whether it was cached.
 */
export async function generateAudio(
  sentence: string,
  speed?: number,
  voiceId?: string
): Promise<{ audioUrl: string; filename: string; cached: boolean }> {
  const response = await fetch(`${API_URL}/generate-audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sentence, speed, voiceId }),
  });
  return handleResponse(response);
}

/**
 * Clears all audio cache files from the backend.
 */
export async function clearAudioCache(): Promise<{
  success: boolean;
  deletedCount: number;
  message: string;
}> {
  const response = await fetch(`${API_URL}/clear-audio-cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse(response);
}

/**
 * Gets the current TTS engine and available engines.
 * @returns A promise that resolves with the current TTS engine info.
 */
export async function getTtsEngine(): Promise<{
  success: boolean;
  currentEngine: string;
  availableEngines: string[];
}> {
  const response = await fetch(`${API_URL}/tts-engine`);
  return handleResponse(response);
}

/**
 * Sets the current TTS engine.
 * @param engine The TTS engine to use ('pyttsx3' or 'piper').
 * @returns A promise that resolves with the update result.
 */
export async function setTtsEngine(engine: string): Promise<{
  success: boolean;
  currentEngine: string;
  message: string;
}> {
  const response = await fetch(`${API_URL}/tts-engine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engine }),
  });
  return handleResponse(response);
}

/**
 * Gets the list of available TTS voices.
 * @returns A promise that resolves with the list of available voices.
 */
export async function getAvailableVoices(): Promise<{
  success: boolean;
  voices: Array<{
    id: string;
    name: string;
    languages: string[];
    gender: string;
    age: string;
    index: number;
    engine: string;
    type: string;
  }>;
  count: number;
  engines: {
    pyttsx3: number;
    piper: number;
  };
  currentEngine: string;
}> {
  const response = await fetch(`${API_URL}/voices`);
  return handleResponse(response);
}
