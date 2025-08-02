# Infundibulum Echoes - Resonant Artifacts

<p align="center">
  <img src="https://i.imgur.com/7gZ9e3h.jpeg" alt="Infundibulum Echoes Screenshot" width="700"/>
</p>

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

2.  **LLM (Google Gemini) - The Strategic Producer:**
    *   **Function:** The high-level, strategic "brain" of the system. It operates on a slower timescale (every ~20 seconds).
    *   **Role:** It analyzes rich context from the HNM and the system's memory to provide intelligent guidance.
        *   **AI Muse:** Generates completely new sound designs from descriptive text prompts.
        *   **Genre-Adapt Mode:** Subtly steers the musical genre based on the user's activity and ambient environment.

3.  **Embeddings (RAG) - The Associative Memory:**
    *   **Function:** The system's long-term, semantic memory, implementing a **Retrieval-Augmented Generation (RAG)** pattern.
    *   **Role:** When you save a "Resonant Artifact," its sonic essence is converted into a numerical vector (an embedding). The HNM can then "recall" these past moments, comparing its current state to its memory and allowing past creative choices to influence the present, creating thematic coherence and evolution.

## Key Features

*   **Deeply Interactive:** Your every move and the sound of your environment directly influence the generative art.
*   **AI Muse:** Use a text prompt (e.g., "dreamy ambient soundscape with a slow, pulsing beat") to have the AI completely reconfigure the synthesizer.
*   **Genre-Adapt Mode:** An autonomous mode where the AI listens to the environment and watches your actions, subtly shifting the musical style to match the vibe.
*   **Resonant Artifacts (Memory):** Capture your favorite moments. The system learns from what you save and uses these "memories" to inform its future creations.
*   **HRM Training Mode (Experimental):** Based on the HRM paper, this mode allows the core HNM to learn and adapt its internal weights in real-time, personalizing its response to you.

## Tech Stack

*   **AI:** Google Gemini API, TensorFlow.js, Xenova Transformers.js
*   **Frontend:** React, TypeScript, Three.js (for WebGL rendering)
*   **Audio:** Web Audio API, AudioWorklet
*   **UI:** TailwindCSS, lil-gui

## Running Locally

### Prerequisites

*   Node.js
*   A [Google Gemini API Key](https://aistudio.google.com/app/apikey)

### Setup Instructions

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  **Set the API Key.** You have two options:
    *   **(Recommended) Environment Variable:** Create a file named `.env.local` in the root of the project and add your API key:
        ```
        GEMINI_API_KEY=your_api_key_here
        ```
        The application's build process will automatically make this available.
    *   **(Session-based) In-App Prompt:** If you do not set the environment variable, the application will prompt you to enter an API key when you first launch it. This key will be stored in `sessionStorage` and will be forgotten when you close the browser tab.

4.  Run the development server:
    ```bash
    npm run dev
    ```

## Philosophy & Research

This project explores the frontier of human-AI collaboration in the creative arts. It's built on the idea that the most interesting results come from a symbiotic relationship between a human's intuitive actions and an AI's deep, contextual understanding.

The core HNM architecture is heavily inspired by the groundbreaking research in the paper:
**"Hierarchical Reasoning Model"** (arXiv:2506.21734v2). The paper's findings on hierarchical, multi-timescale processing in neural networks provide the theoretical foundation for the HNM's design and its ability to generate complex, coherent output without the massive scale of traditional LLMs.
