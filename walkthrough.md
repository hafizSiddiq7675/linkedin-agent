# LinkedIn Sales Navigator Scraper - AI Powered

## Installation
1.  Open Google Chrome and navigate to `chrome://extensions`.
2.  Enable **Developer mode** in the top right corner.
3.  Click **Load unpacked** in the top left.
4.  Select the directory: `/Users/hafiz/agents/linkedin-agent`.
5.  Click the **Refresh** icon on the extension card.

## Configuration (AI)
1.  Click the extension icon in the Chrome toolbar.
2.  Click the **Settings (Gear)** icon.
3.  **Choose your AI Provider**:
    -   **Chrome Built-in AI**: Requires Chrome Canary/Dev and specific flags.
    -   **OpenAI / Gemini**: Enter your API Key.
    -   **Ollama (Local)**:
        -   Ensure Ollama is running (`ollama serve`).
        -   Enter your endpoint (default: `http://localhost:11434`).
        -   Enter your model name (e.g., `llama3`, `mistral`).
4.  **Custom Prompt**: You can modify the logic for what counts as a "positive" response.
5.  Click **Save Settings**.

## Usage
1.  Log in to **LinkedIn Sales Navigator**.
2.  Navigate to your **Inbox** (Messages).
3.  The extension will auto-start and use the selected AI to analyze messages.
4.  Check the **CRM Dashboard** to see the results.

## Troubleshooting
-   **Ollama Errors?** Ensure Ollama is running and accessible. You might need to set `OLLAMA_ORIGINS="*"` environment variable if CORS issues persist, though the extension handles most cases.
