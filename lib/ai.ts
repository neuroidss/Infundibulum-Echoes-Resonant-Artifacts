
import { GoogleGenAI, Type } from "@google/genai";
import type { MenuSettings, InputState } from '../types';

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, max));

const menuSettingsProperties = {
  playerInfluence: { type: Type.NUMBER, description: "User touch/motion influence. Range 0-1." },
  genreRuleInfluence: { type: Type.NUMBER, description: "Influence of the base genre template. Range 0-1." },
  micFeedbackToL0Strength: { type: Type.NUMBER, description: "How much mic input affects the neural net. Range 0-1." },
  explorationInfluence: { type: Type.NUMBER, description: "Neural net's tendency to explore new sounds. Range 0-1." },
  psySpectrumPosition: { type: Type.NUMBER, description: "Blends between psytrance styles (chill/dub to progressive/full-on). Range 0-1." },
  darknessModifier: { type: Type.NUMBER, description: "Blends between light and dark styles. Range 0-1." },
  masterBPM: { type: Type.INTEGER, description: "Master tempo in beats per minute. Typical psytrance is 135-150. Ambient is 60-90." },
  kickTune: { type: Type.NUMBER, description: "Kick drum pitch. Range 0-1 (low to high)." },
  kickPunch: { type: Type.NUMBER, description: "Kick drum impact/attack. Range 0-1." },
  kickDecay: { type: Type.NUMBER, description: "Kick drum length/decay. Range 0.01-1." },
  kickClick: { type: Type.NUMBER, description: "High-frequency click on kick attack. Range 0-1." },
  kickLevel: { type: Type.NUMBER, description: "Kick drum volume. Range 0-1." },
  bassOscType: { type: Type.INTEGER, description: "Bass oscillator type. 0: Saw, 1: Square." },
  bassOctave: { type: Type.NUMBER, description: "Bass pitch octave. Range 0-1 (low to high)." },
  bassCutoff: { type: Type.NUMBER, description: "Bass filter cutoff frequency. Range 0.01-1 (dark to bright)." },
  bassReso: { type: Type.NUMBER, description: "Bass filter resonance. Range 0-1 (subtle to sharp)." },
  bassEnvAmt: { type: Type.NUMBER, description: "Bass filter envelope amount. Range 0-1." },
  bassFilterDecay: { type: Type.NUMBER, description: "Bass filter envelope decay time. Range 0.01-0.5." },
  bassAmpDecay: { type: Type.NUMBER, description: "Bass volume envelope decay time. Range 0.01-0.5." },
  bassFilterLfoRate: { type: Type.NUMBER, description: "Bass filter LFO speed. Range 0-1." },
  bassFilterLfoDepth: { type: Type.NUMBER, description: "Bass filter LFO amount. Range 0-1." },
  bassLevel: { type: Type.NUMBER, description: "Bass volume. Range 0-1." },
  leadOscType: { type: Type.INTEGER, description: "Lead synth oscillator type. 0: Saw, 1: Square, 2: FM-like." },
  leadOctave: { type: Type.NUMBER, description: "Lead synth pitch octave. Range 0-1." },
  leadPW: { type: Type.NUMBER, description: "Lead synth pulse width (for Square wave). Range 0.05-0.95." },
  leadCutoff: { type: Type.NUMBER, description: "Lead filter cutoff. Range 0.01-1." },
  leadReso: { type: Type.NUMBER, description: "Lead filter resonance. Range 0-1." },
  leadEnvAmt: { type: Type.NUMBER, description: "Lead filter envelope amount. Range 0-1." },
  leadFilterDecay: { type: Type.NUMBER, description: "Lead filter envelope decay. Range 0.01-1." },
  leadAmpDecay: { type: Type.NUMBER, description: "Lead volume envelope decay. Range 0.01-2." },
  leadPitchLfoRate: { type: Type.NUMBER, description: "Lead pitch vibrato speed. Range 0-1." },
  leadPitchLfoDepth: { type: Type.NUMBER, description: "Lead pitch vibrato amount. Range 0-1." },
  leadFilterLfoRate: { type: Type.NUMBER, description: "Lead filter LFO speed. Range 0-1." },
  leadFilterLfoDepth: { type: Type.NUMBER, description: "Lead filter LFO amount. Range 0-1." },
  leadLevel: { type: Type.NUMBER, description: "Lead synth volume. Range 0-1." },
  hatClosedDecay: { type: Type.NUMBER, description: "Closed hi-hat decay time. Range 0.005-0.2." },
  hatOpenDecay: { type: Type.NUMBER, description: "Open hi-hat decay time. Range 0.05-0.5." },
  hatHpfCutoff: { type: Type.NUMBER, description: "Hi-hat high-pass filter cutoff. Range 0.1-1 (thinner to fuller)." },
  hatTone: { type: Type.NUMBER, description: "Hi-hat tone adjustment. Range 0-1." },
  hatLevel: { type: Type.NUMBER, description: "Hi-hat volume. Range 0-1." },
  snareNoiseLevel: { type: Type.NUMBER, description: "Snare 'noise' component volume. Range 0-1." },
  snareNoiseDecay: { type: Type.NUMBER, description: "Snare 'noise' component decay. Range 0.01-0.3." },
  snareBodyTune: { type: Type.NUMBER, description: "Snare 'body' pitch. Range 0-1." },
  snareBodyDecay: { type: Type.NUMBER, description: "Snare 'body' decay. Range 0.01-0.5." },
  snareBodyLevel: { type: Type.NUMBER, description: "Snare 'body' volume. Range 0-1." },
  snareLevel: { type: Type.NUMBER, description: "Overall snare volume. Range 0-1." },
  noiseFxFiltType: { type: Type.INTEGER, description: "Noise FX filter type. 0: Low-pass, 1: High-pass, 2: Band-pass." },
  noiseFxCutoff: { type: Type.NUMBER, description: "Noise FX filter cutoff. Range 0.01-1." },
  noiseFxReso: { type: Type.NUMBER, description: "Noise FX filter resonance. Range 0-1." },
  noiseFxLfoRate: { type: Type.NUMBER, description: "Noise FX LFO speed. Range 0-1." },
  noiseFxLfoDepth: { type: Type.NUMBER, description: "Noise FX LFO amount. Range 0-1." },
  noiseFxLevel: { type: Type.NUMBER, description: "Noise FX volume. Range 0-1." },
  delayTimeMode: { type: Type.INTEGER, description: "Delay time sync. 0: 1/16, 1: 1/8, 2: 3/16, 3: 1/4, 4: 1/2." },
  delayFeedback: { type: Type.NUMBER, description: "Delay feedback amount (repeats). Range 0-0.98." },
  delayMix: { type: Type.NUMBER, description: "Delay wet/dry mix. Range 0-1." },
  reverbSize: { type: Type.NUMBER, description: "Reverb space size. Range 0.1-1." },
  reverbDamp: { type: Type.NUMBER, description: "Reverb damping (high frequency decay). Range 0-1." },
  reverbMix: { type: Type.NUMBER, description: "Reverb wet/dry mix. Range 0-1." },
  enableSpeechCommands: { type: Type.BOOLEAN, description: "Enable speech commands. Always set to true." },
  enableTapReset: { type: Type.BOOLEAN, description: "Enable tap reset gesture. Always set to true." },
  enableGenreAdaptMode: { type: Type.BOOLEAN, description: "Enable the auto-adapting genre mode. Always set to false initially." },
};

const MENU_SETTINGS_SCHEMA = {
  type: Type.OBJECT,
  properties: menuSettingsProperties,
  required: Object.keys(menuSettingsProperties),
};

const SYSTEM_INSTRUCTION = `You are an expert sound designer and music producer specializing in generative electronic music, particularly psytrance, techno, and ambient genres. Your task is to generate a complete set of parameters for a complex synthesizer to match the user's request. The user will provide a descriptive prompt. You must return a single JSON object that strictly adheres to the provided schema.

Pay close attention to the descriptions of each parameter. They explain how each value affects the sound. Your goal is to create a cohesive, interesting, and musical patch. Do not just use random values. The relationships between parameters are important. For example, a fast BPM ('masterBPM') often pairs well with shorter decay times on drums ('kickDecay', 'snareNoiseDecay'). A 'dark' sound might have a lower filter cutoff ('bassCutoff', 'leadCutoff').

Analyze the user's prompt for keywords related to tempo, mood, energy, texture, and genre. Translate these concepts into the parameter values. For example, 'dreamy' suggests high reverb and delay, while 'aggressive' suggests faster LFOs and a punchy kick.

Return ONLY the JSON object and nothing else. Ensure all floating point numbers are within their specified ranges.`;


export async function generateMusicSettings(prompt: string): Promise<MenuSettings> {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: MENU_SETTINGS_SCHEMA,
    },
  });

  try {
    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);
    
    // Basic validation
    if (typeof parsed.masterBPM !== 'number' || typeof parsed.kickLevel !== 'number') {
        throw new Error("Parsed JSON is missing required fields.");
    }
    
    return parsed as MenuSettings;
  } catch (e) {
    console.error("Failed to parse AI response:", response.text, e);
    throw new Error("AI returned an invalid response format.");
  }
}

const GENRE_ADAPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    psySpectrumPosition: {
      type: Type.NUMBER,
      description: "A value from 0.0 (chill/dub) to 1.0 (full-on/aggressive psytrance)."
    },
    darknessModifier: {
      type: Type.NUMBER,
      description: "A value from 0.0 (light/melodic) to 1.0 (dark/forest)."
    }
  },
  required: ['psySpectrumPosition', 'darknessModifier']
};

const GENRE_ADAPT_SYSTEM_INSTRUCTION = `You are an intelligent DJ and music producer assistant. Your goal is to subtly guide the musical genre of a generative synthesizer. Based on the following real-time data, suggest a new target 'psySpectrumPosition' (0=chill/dub, 0.5=progressive, 1=full-on) and 'darknessModifier' (0=light/melodic, 1=dark/forest).

The user wants the music to adapt to their environment and actions.
- If motion is high and ambient tempo is high, lean towards 'full-on' (higher psySpectrumPosition).
- If ambient sound is quiet and motion is low, lean towards 'chill' (lower psySpectrumPosition).
- If recent user-created 'artifacts' have tags like 'dark_bass' or 'noisy', increase the 'darknessModifier'.
- If the ambient sound seems complex or has a lot of high frequencies, consider a higher psySpectrumPosition.
- If the ambient sound is simple or bass-heavy, a lower psySpectrumPosition might be better.

Return ONLY a JSON object with your suggestions. Do not add any other text. Keep the values within the 0.0 to 1.0 range.`;

export interface GenreAdaptContext {
    mic: InputState['mic'];
    motion: InputState['accelerometer'];
    recentArtifactTags: string[];
    currentBpm: number;
}

export async function getGenreAdaptation(context: GenreAdaptContext): Promise<{ psySpectrumPosition: number; darknessModifier: number } | null> {
  if (!process.env.API_KEY) {
    console.error("API_KEY environment variable not set");
    return null;
  }

  const micEnergyDesc = context.mic.rhythmPeak > 0.6 ? 'high' : context.mic.rhythmPeak > 0.3 ? 'medium' : 'low';
  const motionEnergyDesc = context.motion.rhythmPeak > 0.6 ? 'very active' : context.motion.rhythmPeak > 0.3 ? 'moderately active' : 'calm';
  const fftDesc = (() => {
      const fft = context.mic.fft;
      if (!fft || fft.length === 0) return 'unknown';
      const bass = fft.slice(0, fft.length * 0.1).reduce((a, b) => a + Math.pow(10, b / 20), 0);
      const treble = fft.slice(fft.length * 0.5).reduce((a, b) => a + Math.pow(10, b / 20), 0);
      if (bass > treble * 2) return 'bass-heavy';
      if (treble > bass * 2) return 'treble-heavy';
      return 'balanced';
  })();
  
  const prompt = `
    Current Context:
    - Ambient Sound: Tempo is around ${context.mic.rhythmTempo.toFixed(0)} BPM with ${micEnergyDesc} rhythmic energy. The frequency spectrum is ${fftDesc}.
    - User Motion: The user is currently ${motionEnergyDesc}.
    - Recent Vibe: The user has recently saved sounds described as: "${context.recentArtifactTags.join(', ')}".
    - Current Synth Tempo: ${context.currentBpm.toFixed(0)} BPM.

    Based on this, what is the ideal 'psySpectrumPosition' and 'darknessModifier' to match the vibe?
    `;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: GENRE_ADAPT_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: GENRE_ADAPT_SCHEMA,
        },
    });

    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);

    if (typeof parsed.psySpectrumPosition === 'number' && typeof parsed.darknessModifier === 'number') {
        return {
            psySpectrumPosition: clamp(parsed.psySpectrumPosition, 0, 1),
            darknessModifier: clamp(parsed.darknessModifier, 0, 1),
        };
    }
    console.error("Parsed JSON from AI is missing required fields.", parsed);
    return null;

  } catch (e) {
    console.error("Failed to get or parse AI response for genre adaptation:", e);
    return null;
  }
}
