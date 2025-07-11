const API_URL = "http://localhost:3001";

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
 * @returns A promise that resolves with the extracted sentences.
 */
export async function uploadPdf(file: File): Promise<{ sentences: string[] }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(response);
}

/**
 * Sends a sentence to the backend to be spoken.
 * @param sentence The text to speak.
 * @param index The index of the sentence in the list.
 * @param speed The speech speed (words per minute).
 */
export async function speakSentence(
  sentence: string,
  index: number,
  speed?: number
): Promise<void> {
  const response = await fetch(`${API_URL}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sentence, index, speed }),
  });
  await handleResponse(response);
}

/**
 * Sends a request to the backend to stop the current speech.
 */
export async function stopSpeech(): Promise<void> {
  const response = await fetch(`${API_URL}/stop`, {
    method: "POST",
  });
  await handleResponse(response);
}
