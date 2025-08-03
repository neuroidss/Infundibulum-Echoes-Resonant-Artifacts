# Infundibulum Echoes - Resonant Artifacts

**A portal to a different reality. This is not a music app; it's an instrument for 'vibecoding'—collaborating with an AI to generate audio-visual experiences that defy the laws of our universe.**

> **Live Demo:** https://neuroidss.github.io/Infundibulum-Echoes-Resonant-Artifacts/

---

## Core Concept

*Infundibulum Echoes* is an experimental platform for creating emergent, non-linear art. Your touch, motion, and voice become the inputs to a complex hybrid AI "brain," summoning alien soundscapes and impossible visuals. You can capture these fleeting moments as "Resonant Artifacts"—memories of a world that shouldn't exist, but does. The goal is to provide a tool for maximum creativity, where nothing is familiar.

## How It Works: The Hybrid AI Brain

The application's core is a sophisticated, multi-layered AI system inspired by cognitive neuroscience and recent AI research. It consists of three main components working in symbiosis:

1.  **HNM (Hierarchical Neural Matrix) - The Nervous System:**
    *   **Function:** The real-time core of the application, acting as its "nervous system." It runs dozens of times per second, directly processing user input (touch, motion) and sensor data (microphone) to generate the immediate audio-visual state (`currentResonantState`).
    *   **Inspiration:** Its architecture is directly inspired by the **Hierarchical Reasoning Model (HRM)** paper, featuring interconnected high-level (slow, contextual) and low-level (fast, reactive) modules.
    *   **Role:** Provides the fluid, organic, and instantaneous interactive feel.

2.  **LLM (Interchangeable) - The Strategic Producer:**
    *   **Function:** The high-level, strategic "brain" of the system. It can be powered by various local or cloud-based Large Language Models.
    *   **Role:** It analyzes rich context from the HNM and the system's memory to provide intelligent guidance.
        *   **AI Muse:** Generates completely new sound designs from descriptive text prompts.
        *   **AI Co-pilot Mode:** A new iterative mode where the AI "listens" to the current soundscape and makes small, targeted adjustments to improve its musicality and balance over time.
        *   **Genre-Adapt Mode:** Subtly steers the musical genre based on the user's activity and ambient environment.

3.  **Embeddings (RAG) - The Associative Memory:**
    *   **Function:** The system's long-term, semantic memory, implementing a **Retrieval-Augmented Generation (RAG)** pattern.
    *   **Role:** When you save a "Resonant Artifact," its sonic essence is converted into a numerical vector (an embedding). The HNM can then "recall" these past moments, comparing its current state to its memory and allowing past creative choices to influence the present, creating thematic coherence and evolution.

## Key Features

*   **Deeply Interactive:** Your every move and the sound of your environment directly influence the generative art.
*   **Flexible AI Backend:** Supports multiple LLM providers, including Google Gemini, OpenAI-compatible APIs, local Ollama servers, and in-browser HuggingFace models.
*   **AI Muse:** Use a text prompt (e.g., "dreamy ambient soundscape with a slow, pulsing beat") to have the AI completely reconfigure the synthesizer.
*   **AI Co-pilot Mode:** An iterative mode where the AI actively listens and refines the sound, acting as a collaborative partner.
*   **Genre-Adapt Mode:** An autonomous mode where the AI listens to the environment and watches your actions, subtly shifting the musical style to match the vibe.
*   **Resonant Artifacts (Memory):** Capture your favorite moments. The system learns from what you save and uses these "memories" to inform its future creations.

## Tech Stack

*   **AI:** Google Gemini API, Ollama, OpenAI-compatible APIs, HuggingFace Transformers.js, TensorFlow.js, Xenova Transformers.js
*   **Frontend:** React, TypeScript, Three.js (for WebGL rendering)
*   **Audio:** Web Audio API, AudioWorklet
*   **UI:** TailwindCSS, lil-gui

## Running Locally

### Prerequisites

*   Node.js and npm.
*   For local models, you'll need [Ollama](https://ollama.com/) running on your machine.
*   For cloud models, you'll need an API key from a provider like [Google AI Studio](https://aistudio.google.com/app/apikey).

### Setup Instructions

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  **Configure AI Providers:**
    *   The application is designed to use API keys set as environment variables (`process.env.API_KEY` for Google, etc.). This is the standard for deployment.
    *   For local development or simple client-side use, you can configure providers directly in the app.
    *   Open the settings panel (top-right), go to the "AI" folder, and click **"Configure AI..."**.
    *   A modal window will appear where you can enter your keys and host URLs. These are saved in your browser's local storage and used as a fallback if environment variables aren't found.

4.  Run the development server:
    ```bash
    npm run dev # Or your preferred script
    ```

5.  **Select the AI Model in the App:**
    *   Once the app is running, open the settings panel.
    *   In the "AI" folder, select your desired model from the "AI Model" dropdown.
    *   If the required credentials for that model are set, the AI features (Muse, Co-pilot, etc.) will be enabled.
    *   **For HuggingFace:** No configuration is needed as these models run directly in the browser.
