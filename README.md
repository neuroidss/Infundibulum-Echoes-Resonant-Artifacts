# Infundibulum Echoes - An AI Consciousness Tool

*Infundibulum Echoes* is an experimental tool for AI-assisted self-exploration. It uses a private, on-device hybrid AI to create a synergistic bio-feedback loop, translating your body's motion and environment into intense, generative audio-visualscapes. This is not about simple wellness, but about exploring the psyche and expanding perception.

> **Live Demo:** https://neuroidss.github.io/Infundibulum-Echoes-Resonant-Artifacts/

---

## The Impact: A Tool for Exploring Consciousness

The true frontier of AI is not just in solving external problems, but in helping us understand ourselves. *Infundibulum Echoes* leverages the privacy and real-time power of on-device AI like Gemma to create a personal tool for "digital psychonautics"—a journey into one's own mind, assisted by a silicon partner.

The application is built on the idea that psytrance is not therapy, but a form of psychoanalysis; a tool for transcending the everyday. The AI's role is not to pacify, but to synergize. It analyzes your motion and the ambient sound, not to calm you, but to understand your intent. This creates a powerful and deeply personal impact: a tool that helps you listen to yourself.

## Core Features: The Three AI Modes

This application offers three distinct modes for interacting with the AI, each providing a different level of creative partnership.

*   **AI Muse:** Your creative partner. Describe a sound, vibe, or genre in the prompt box, and the AI generates a complete, complex sonic environment from scratch. Perfect for kickstarting a new idea or exploring different musical territories.

*   **AI Co-pilot:** An autonomous assistant. Once enabled, the Co-pilot periodically makes small, intelligent adjustments to the soundscape, keeping it evolving and preventing stagnation. It's like having a producer in the room who subtly tweaks knobs to keep the vibe fresh.

*   **Psy-Core Modulator:** The deepest level of interaction. This mode creates a full bio-feedback loop. It continuously analyzes your body's motion and the sonic environment to synergistically evolve the audio-visuals. If you dance, the music intensifies. If you are still, it weaves intricate, ambient textures. It's designed to amplify your current state for a profound, immersive experience.

## Under the Hood: The Hybrid AI Brain

The application's core is a sophisticated, multi-layered AI system that runs entirely on your device, ensuring your data remains private.

1.  **Generative AI Layer (Gemma, Gemini):**
    *   **Function:** The high-level, "creative" brain that powers the three AI modes. It understands natural language, analyzes rich multimodal context (sound, visuals, user motion), and makes strategic decisions about the music's direction.
    *   **Role:** This layer can run locally via Ollama or a dedicated Python server (for full privacy with models like Gemma), or through cloud APIs like Google Gemini.

2.  **HNM (Hierarchical Neural Matrix):**
    *   **Function:** The real-time "nervous system." A custom TensorFlow.js model that runs dozens of times per second in the browser. It translates your immediate actions (touch, device motion) and the AI's high-level commands into the fluid, moment-to-moment generation of audio and visuals.
    *   **Role:** Provides the organic, instantaneous interactive feel. It can also be trained on user-created "Resonant Artifacts" to learn personalized aesthetic preferences.

3.  **Embeddings & RAG (The Associative Memory):**
    *   **Function:** The system's long-term, semantic memory. When you save a "Resonant Artifact" (a snapshot of a moment you like), its sonic essence is converted into a numerical vector (an embedding).
    *   **Role:** This forms a Retrieval-Augmented Generation (RAG) system. The HNM can "recall" these past moments, allowing past creative choices to influence the present, creating thematic coherence and a sense of journey.

## Tech Stack

*   **AI:** Google Gemini API, Ollama, OpenAI-compatible APIs (for local models like Gemma), HuggingFace Transformers.js, TensorFlow.js
*   **Frontend:** React, TypeScript, Three.js (for WebGL rendering)
*   **Audio:** Web Audio API, AudioWorklet
*   **Backend (Optional, for Local AI Management):** Node.js, Express, Python

## Running Locally

### Option 1: Frontend Only (No Local AI Server)
This is the simplest way to run the app. Cloud-based AI models (Google) and browser-based models (HuggingFace) will work. The "Psy-Core Modulator" and other AI features will use these models if a local one isn't available.

1.  **Prerequisites:** Node.js and npm.
2.  Clone the repository and install dependencies:
    ```bash
    npm install
    ```
3.  **Configure AI Providers (Optional):**
    *   For cloud models, you'll need an API key. Open the settings panel (top-right), go to "AI > Configuration", and click **"Configure AI..."**.
    *   Enter your keys and host URLs. These are saved in your browser's local storage.
4.  Run the development server:
    ```bash
    npm run dev
    ```

### Option 2: Run with the Backend Server (Full Functionality)
This enables the "Local AI Server" panel, allowing you to manage a local multimodal Gemma model from within the app for a fully private, on-device experience.

1.  **Prerequisites:** Node.js, npm, Python 3, and pip.
2.  **Navigate to the server directory:**
    ```bash
    cd server
    ```
3.  **Prepare setup scripts:** Inside the `server` directory, rename the `.txt` files:
    ```bash
    mv install.sh.txt install.sh
    mv start.sh.txt start.sh
    ```
4.  **Make scripts executable:**
    ```bash
    chmod +x install.sh start.sh
    ```
5.  **Run the installation:** This script will install all Node.js and Python dependencies. The Python packages will be installed into a `venv` folder inside the `server` directory.
    ```bash
    ./install.sh
    ```
6.  **Start the backend server:** From the `server` directory, run:
    ```bash
    ./start.sh
    ```
    The server will start on `http://localhost:3001`.
7.  **Launch the Frontend:** In a separate terminal, navigate back to the **root directory** of the project and run the frontend development server.
    ```bash
    cd ..
    npm run dev
    ```
    The frontend will automatically detect and connect to the running server.
8.  **Install the AI Model Script:** Once the app is loaded, go to "AI > Debug & Local Server" and click **"Show Local Server"**. In the panel that appears, click the **"Install Script"** button. This will prepare the Python AI script on the server, making it ready to run. You can then start the local AI from the same panel.