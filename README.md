# Infundibulum Echoes - An AI Consciousness Tool

*Infundibulum Echoes* is an experimental tool for AI-assisted self-exploration. It uses a private, on-device hybrid AI to create a synergistic bio-feedback loop, translating your body's motion and environment into intense, generative audio-visualscapes. This is not about simple wellness, but about exploring the psyche and expanding perception.

> **Live Demo:** https://neuroidss.github.io/Infundibulum-Echoes-Resonant-Artifacts/

---

## The Impact: A Tool for Exploring Consciousness

The true frontier of AI is not just in solving external problems, but in helping us understand ourselves. *Infundibulum Echoes* leverages the privacy and real-time power of on-device AI like Gemma to create a personal tool for "digital psychonautics"—a journey into one's own mind, assisted by a silicon partner.

The application is built on the idea that psytrance is not therapy, but a form of psychoanalysis; a tool for transcending the everyday. The AI's role is not to pacify, but to synergize. It analyzes your motion and the ambient sound, not to calm you, but to understand your intent. If you dance, it intensifies the music. If you are still, it creates complex, meditative soundscapes. The **"Psy-Core Modulator"** mode acts as a co-pilot, helping you navigate and shape your own consciousness. This creates a powerful and deeply personal impact: a tool that helps you listen to yourself.

## How It Works: The Hybrid AI Brain

The application's core is a sophisticated, multi-layered AI system that runs entirely on your device, ensuring your data remains private.

1.  **Psy-Core Modulator (Powered by Gemma):**
    *   **Function:** The strategic "brain" of the system, designed to run locally using models like Gemma. It analyzes rich, multimodal context from your environment and interaction.
    *   **Role:** This is the core of the bio-resonant feedback loop. The AI's goal is to **synergize** with the user. If it detects high motion, it generates a more energetic and complex soundscape. If it detects stillness, it can weave intricate, ambient textures. It acts as a partner, helping you explore your own state of being.

2.  **HNM (Hierarchical Neural Matrix) - The Nervous System:**
    *   **Function:** The real-time core of the application, acting as its "nervous system." It runs dozens of times per second, directly processing user input (touch, motion) and sensor data to generate the immediate audio-visual state.
    *   **Role:** Provides the fluid, organic, and instantaneous interactive feel. It can also be trained on user-created "Resonant Artifacts" to learn personalized aesthetic preferences.

3.  **Embeddings (RAG) - The Associative Memory:**
    *   **Function:** The system's long-term, semantic memory. When you save a "Resonant Artifact," its sonic essence is converted into a numerical vector (an embedding).
    *   **Role:** The HNM can then "recall" these past moments, allowing past creative choices to influence the present, creating thematic coherence and evolution.

## Tech Stack

*   **AI:** Google Gemini API, Ollama, OpenAI-compatible APIs (for local models like Gemma), HuggingFace Transformers.js, TensorFlow.js
*   **Frontend:** React, TypeScript, Three.js (for WebGL rendering)
*   **Audio:** Web Audio API, AudioWorklet
*   **Backend (Optional, for Local AI Management):** Node.js, Express, Python

## Running Locally

### Option 1: Frontend Only (No Local AI Server)
This is the simplest way to run the app. Cloud-based AI models (Google) and browser-based models (HuggingFace) will work. The "Psy-Core Modulator" will use these models if a local one isn't available.

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
8.  **Install the AI Model Script:** Once the app is loaded, go to "AI > Debug & Local Server" and click **"Show Local Server"**. In the panel that appears, click the **"Install Script"** button. This will prepare the Python AI script on the server, making it ready to run. You can then start the local AI.
