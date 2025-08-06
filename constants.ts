


import { MenuSettings, HnmLevelConfig, AIModel, ModelProvider, InstrumentScripts } from './types';

export const VERSION = "1.0.0-PsyTek";
export const USE_DEBUG = true;
export const TARGET_FPS = 55;
export const STATE_VECTOR_SIZE = 64;
export const INPUT_VECTOR_SIZE = 64;
export const EMBEDDING_DIM = 384;
export const MAX_ARTIFACTS = 16;
export const MAX_ACTIVE_ARTIFACTS_LOGIC = 4;
export const REASONABLE_SHADER_ARTIFACT_CAP = 4;
export const ARTIFACT_SIMILARITY_THRESHOLD = 0.46;
export const ARTIFACT_CREATION_SYNC_THRESHOLD = 0.65; 
export const ARTIFACT_CREATION_SYNC_DURATION_MS = 2500;
export const ARTIFACT_CREATION_INTERVAL_MS = 9000; // Cooldown between creations
export const ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MIN = 0.28;
export const ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MAX = 0.85;
export const EMBEDDING_MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
export const MIC_FFT_SIZE = 256;
export const ACCEL_FFT_SIZE = 64;
export const LOCAL_STORAGE_KEY = `infundibulumEchoesState_v${VERSION}`;
export const LOCAL_STORAGE_MENU_KEY = 'infundibulumEchoesMenuSettings';

export const SPEECH_COMMANDS: { [key: string]: string[] } = {
    CREATE: ["create artifact", "make echo", "capture this", "remember this"],
    FORGET_OLDEST: ["forget oldest", "remove last echo", "clear history", "forget last"],
    RESET: ["reset echoes", "start over", "clear all", "forget everything"],
};

export const SYNC_THRESHOLD = 0.3;
export const SYNC_DECAY = 0.98;
export const ACCEL_ANALYSIS_INTERVAL_S = ACCEL_FFT_SIZE / (TARGET_FPS * 0.9);
export const LONG_PRESS_DURATION_MS = 2000;
export const RESET_SECOND_TAP_WINDOW_MS = 400;
export const FULLSCREEN_REQUESTED_KEY = `infundibulumEchoesFullscreenReq_v${VERSION}`;
export const HNM_VERBOSE = false;
export const HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM = STATE_VECTOR_SIZE;
export const HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM = STATE_VECTOR_SIZE;

export const HNM_HIERARCHY_LEVEL_CONFIGS: HnmLevelConfig[] = [
    { name: "L0_IntentProcessing", dim: 96, raw_sensory_input_dim: STATE_VECTOR_SIZE, bu_source_level_names: [], td_source_level_names: ["L1_ContextualResonance"], external_input_config: { source_signal_name: "ArtifactSignalSource", dim: HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM }, nmm_params: { mem_model_depth: 2, mem_model_expansion: 1.5, external_signal_dim: HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM, external_signal_role: "add_to_bu", verbose: HNM_VERBOSE } },
    { name: "L1_ContextualResonance", dim: STATE_VECTOR_SIZE, bu_source_level_names: ["L0_IntentProcessing"], td_source_level_names: [], external_input_config: { source_signal_name: "ActiveGenreRuleSignal", dim: HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM }, nmm_params: { mem_model_depth: 2, mem_model_expansion: 2.0, external_signal_dim: HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM, external_signal_role: "add_to_target", verbose: HNM_VERBOSE } }
];

export const HNM_POLICY_HEAD_INPUT_LEVEL_NAME = "L1_ContextualResonance";

export const TUNING_MODE_PRESET: Partial<MenuSettings> = {
    masterBPM: 135,
    energyLevel: 0.5,
    harmonicComplexity: 0.1,
    mood: 2, // Dark
    // Set other instruments to silent by default in tuning mode
    kickPatternDensity: 0.0, kickLevel: 0.0,
    bassPatternDensity: 0.0, bassLevel: 0.0,
    leadPatternDensity: 0.0, leadLevel: 0.0,
    atmosLevel: 0.0,
    rhythmPatternDensity: 0.0, rhythmLevel: 0.0,
    snarePatternDensity: 0.0, snareLevel: 0.0,
    riserTriggerRate: 0, riserLevel: 0.0,
    delayMix: 0, reverbMix: 0,
};

export const TUNING_SCRIPTS: InstrumentScripts = {
    "Master Bus": [{
        name: "FX Sweep (Kick Source)",
        description: "Activates a kick drum and sweeps Delay and Reverb to test the master bus.",
        steps: [
            { duration: 2000, params: { kickPatternDensity: 1.0, kickLevel: 0.8, kickAmpDecay: 0.3, delayMix: 0.5, delayFeedback: 0.5, delayFilterCutoff: 0.8, reverbMix: 0.0 }, description: "Delay: Mid Feedback" },
            { duration: 2000, params: { delayFeedback: 0.9, delayStereo: 0.8 }, description: "Delay: High Feedback, Wide" },
            { duration: 2000, params: { delayFilterCutoff: 0.2 }, description: "Delay: Filtered" },
            { duration: 3000, params: { delayMix: 0.0, reverbMix: 0.5, reverbSize: 0.5, reverbDamp: 0.5, reverbShimmer: 0.0 }, description: "Reverb: Mid Size" },
            { duration: 3000, params: { reverbSize: 0.95, reverbDamp: 0.1 }, description: "Reverb: Large Size" },
            { duration: 3000, params: { reverbShimmer: 0.9 }, description: "Reverb: High Shimmer" },
        ]
    }],
    "System": [{
        name: "Orchestra Test",
        description: "Enables all instruments with default patterns to test the full mix.",
        steps: [
            { 
                duration: 30000, // run for 30 seconds
                params: {
                    kickPatternDensity: 1.0, kickLevel: 0.9,
                    bassPatternDensity: 0.9, bassLevel: 0.8,
                    leadPatternDensity: 0.9, leadLevel: 0.65,
                    atmosLevel: 0.4,
                    rhythmPatternDensity: 0.8, rhythmLevel: 0.6,
                    snarePatternDensity: 1.0, snareLevel: 0.7,
                    riserTriggerRate: 0, riserLevel: 0.4,
                    delayMix: 0.4, reverbMix: 0.5,
                },
                description: "All instruments active"
            }
        ]
    }],
    "Kick": [{
        name: "Tune, Decay & Distortion Test",
        description: "Sweeps tune and decay, then introduces distortion to test the clipper.",
        steps: [
            { duration: 1500, params: { kickTune: 0.1, kickAmpDecay: 0.2, kickDistortion: 0.0 }, description: "Low Tune, Short" },
            { duration: 1500, params: { kickTune: 0.9, kickAmpDecay: 0.2, kickDistortion: 0.0 }, description: "High Tune, Short" },
            { duration: 1500, params: { kickTune: 0.1, kickAmpDecay: 0.8, kickDistortion: 0.0 }, description: "Low Tune, Long" },
            { duration: 1500, params: { kickTune: 0.9, kickAmpDecay: 0.8, kickDistortion: 0.0 }, description: "High Tune, Long" },
            { duration: 1500, params: { kickTune: 0.5, kickAmpDecay: 0.5, kickDistortion: 0.5 }, description: "Mid Tune, Mid Decay, 50% Dist" },
            { duration: 1500, params: { kickTune: 0.5, kickAmpDecay: 0.5, kickDistortion: 1.0 }, description: "Mid Tune, Mid Decay, 100% Dist" },
        ]
    }],
    "Bass": [{
        name: "Filter, Glide & Octave Sweep",
        description: "Tests filter, glide, and octave switching to check the full range of the bass synth.",
        steps: [
            { duration: 2000, params: { bassCutoff: 0.2, bassReso: 0.1, bassGlide: 0, bassOctave: 1 }, description: "Sub-1 Octave, Low Cut, No Glide" },
            { duration: 2000, params: { bassCutoff: 0.8, bassReso: 0.1, bassGlide: 0, bassOctave: 1 }, description: "Sub-1 Octave, High Cut, No Glide" },
            { duration: 2000, params: { bassCutoff: 0.2, bassReso: 0.9, bassGlide: 0, bassOctave: 1 }, description: "Sub-1 Octave, Low Cut, High Reso" },
            { duration: 2000, params: { bassCutoff: 0.4, bassReso: 0.7, bassGlide: 0.15, bassOctave: 1 }, description: "Sub-1 Octave, Mid Cut, With Glide" },
            { duration: 2000, params: { bassCutoff: 0.4, bassReso: 0.7, bassGlide: 0.05, bassOctave: 0 }, description: "Sub-2 Octave, Mid Cut" },
        ]
    }],
    "Lead": [{
        name: "Accent, Decay & Reso Test",
        description: "Tests the critical interaction between accent, decay, and resonance.",
        steps: [
            { duration: 2000, params: { leadDecay: 0.1, leadAccentAmount: 0.0, leadReso: 0.5 }, description: "Short, No Accent, Mid Reso" },
            { duration: 2000, params: { leadDecay: 0.1, leadAccentAmount: 1.0, leadReso: 0.5 }, description: "Short, Full Accent, Mid Reso" },
            { duration: 2000, params: { leadDecay: 0.8, leadAccentAmount: 0.0, leadReso: 0.9 }, description: "Long, No Accent, High Reso" },
            { duration: 2000, params: { leadDecay: 0.8, leadAccentAmount: 1.0, leadReso: 0.9 }, description: "Long, Full Accent, High Reso" },
        ]
    }],
    "Snare": [{
        name: "Noise, Body & Filter Mix",
        description: "Blends Noise/Body levels and sweeps noise filter to test snare character.",
        steps: [
            { duration: 1500, params: { snareNoiseLevel: 1.0, snareBodyLevel: 0.0, snareNoiseCutoff: 0.5 }, description: "Noise Only" },
            { duration: 1500, params: { snareNoiseLevel: 0.0, snareBodyLevel: 1.0 }, description: "Body Only" },
            { duration: 1500, params: { snareNoiseLevel: 0.7, snareBodyLevel: 0.7, snareNoiseCutoff: 0.2 }, description: "Mix, Low Cutoff" },
            { duration: 1500, params: { snareNoiseLevel: 0.7, snareBodyLevel: 0.7, snareNoiseCutoff: 0.9 }, description: "Mix, High Cutoff" },
            { duration: 1500, params: { snareNoiseDecay: 0.02, snareBodyDecay: 0.05}, description: "Tight Decay"},
            { duration: 1500, params: { snareNoiseDecay: 0.25, snareBodyDecay: 0.4}, description: "Loose Decay"},
        ]
    }],
    "Rhythm": [{
        name: "Decay, HPF & Metallic Test",
        description: "Tests open/closed decay times and the metallic character.",
        steps: [
            { duration: 2000, params: { rhythmClosedDecay: 0.02, rhythmOpenDecay: 0.1, rhythmHpfCutoff: 0.5, rhythmMetallicAmount: 0.1 }, description: "Tight, Low Metallic" },
            { duration: 2000, params: { rhythmClosedDecay: 0.1, rhythmOpenDecay: 0.4, rhythmHpfCutoff: 0.5, rhythmMetallicAmount: 0.1 }, description: "Loose, Low Metallic" },
            { duration: 2000, params: { rhythmHpfCutoff: 0.2, rhythmMetallicAmount: 0.9 }, description: "Loose, High Metallic, Low HPF" },
            { duration: 2000, params: { rhythmHpfCutoff: 0.9, rhythmMetallicAmount: 0.9 }, description: "Loose, High Metallic, High HPF" },
        ]
    }],
    "Atmos": [{
        name: "Evolution & Spread Test",
        description: "Tests the pad's evolution rate and stereo spread.",
        steps: [
            { duration: 3000, params: { atmosEvolutionRate: 0.1, atmosCutoff: 0.4, atmosSpread: 0.1, atmosOscType: 0 }, description: "Saw, Slow Evo, Narrow" },
            { duration: 3000, params: { atmosEvolutionRate: 0.9, atmosCutoff: 0.4, atmosSpread: 0.1, atmosOscType: 0 }, description: "Saw, Fast Evo, Narrow" },
            { duration: 3000, params: { atmosEvolutionRate: 0.5, atmosCutoff: 0.7, atmosSpread: 0.9, atmosOscType: 1 }, description: "FMish, Mid Evo, Wide" },
            { duration: 3000, params: { atmosEvolutionRate: 0.9, atmosCutoff: 0.7, atmosSpread: 0.9, atmosOscType: 1 }, description: "FMish, Fast Evo, Wide" },
        ]
    }],
    "Riser": [{
        name: "Tension & Sweep Test",
        description: "Tests the riser's attack/decay time and pitch sweep.",
        steps: [
            { duration: 5000, params: { riserAttack: 4, riserDecay: 1, riserPitchSweep: 0.2, riserCutoff: 0.3, riserReso: 0.8 }, description: "Slow Attack, Low Sweep" },
            { duration: 5000, params: { riserAttack: 4, riserDecay: 1, riserPitchSweep: 0.9, riserCutoff: 0.3, riserReso: 0.8 }, description: "Slow Attack, High Sweep" },
            { duration: 3000, params: { riserAttack: 1, riserDecay: 2, riserPitchSweep: 0.7 }, description: "Fast Attack" },
        ]
    }],
};


export const DEFAULT_MENU_SETTINGS: MenuSettings = {
    playerInfluence: 0.6,
    hnmModulationDepth: 0.5,
    micFeedbackToL0Strength: 0.25,
    explorationInfluence: 0.1,
    energyLevel: 0.8,
    harmonicComplexity: 0.85,
    mood: 2, // Dark
    masterBPM: 145,
    kickPatternDensity: 1.0,
    kickTune: 0.5,
    kickAttack: 0.8,
    kickPitchDecay: 0.05,
    kickAmpDecay: 0.4,
    kickDistortion: 0.3,
    kickLevel: 0.9,
    bassPatternDensity: 0.9,
    bassOscType: 0,
    bassSubOscLevel: 0.5,
    bassOctave: 0,
    bassPW: 0.5,
    bassGlide: 0.05,
    bassCutoff: 0.3,
    bassReso: 0.6,
    bassEnvAmt: 0.7,
    bassFilterKeyTrack: 0.4,
    bassFilterDecay: 0.15,
    bassAmpDecay: 0.1,
    bassDistortion: 0.0,
    bassLevel: 0.8,
    leadPatternDensity: 0.9,
    leadOctave: 2,
    leadWaveformMix: 1.0,
    leadFmAmount: 0.0,
    leadDistortion: 0.0,
    leadCutoff: 0.75,
    leadReso: 0.8,
    leadEnvAmt: 0.9,
    leadDecay: 0.15,
    leadAccentAmount: 0.5,
    leadLevel: 0.65,
    acidPatternDensity: 0.0,
    acidOctave: 1,
    acidCutoff: 0.5,
    acidReso: 0.7,
    acidEnvAmt: 0.8,
    acidDecay: 0.2,
    acidAccentAmount: 0.6,
    acidLevel: 0.0,
    atmosOscType: 1,
    atmosEvolutionRate: 0.7,
    atmosCutoff: 0.65,
    atmosReso: 0.5,
    atmosSpread: 0.8,
    atmosLevel: 0.4,
    rhythmPatternDensity: 0.8,
    rhythmClosedDecay: 0.05,
    rhythmOpenDecay: 0.25,
    rhythmHpfCutoff: 0.7,
    rhythmMetallicAmount: 0.6,
    rhythmLevel: 0.6,
    snarePatternDensity: 1.0,
    snareFlamAmount: 0.2,
    snareNoiseLevel: 0.8,
    snareNoiseDecay: 0.08,
    snareNoiseCutoff: 0.6,
    snareBodyTune: 0.5,
    snareBodyDecay: 0.15,
    snareBodyLevel: 0.5,
    snareLevel: 0.7,
    riserTriggerRate: 2,
    riserAttack: 2.0,
    riserDecay: 2.0,
    riserPitchSweep: 0.7,
    riserCutoff: 0.2,
    riserReso: 0.5,
    riserLevel: 0.4,
    delayTimeMode: 1,
    delayFeedback: 0.6,
    delayFilterCutoff: 0.5,
    delayStereo: 0.3,
    delayMix: 0.4,
    reverbSize: 0.85,
    reverbDamp: 0.5,
    reverbPreDelay: 0.02,
    reverbShimmer: 0.6,
    reverbMix: 0.5,
    enableSpeechCommands: true,
    enableLongPressToggleUI: true,
    enablePsyCoreModulatorMode: false,
    enableAiCopilotMode: false,
    aiCopilotThought: 'AI Co-pilot is idle.',
    selectedModelId: 'gemini-2.5-flash',
    googleApiKey: '',
    openAiApiKey: '',
    openAiBaseUrl: '',
    ollamaHost: '',
    showAiMuse: false,
    aiCallCount: 0,
    aiDebugLog: 'AI Idle. Configure & select a model.',
    showAiDebugLog: false,
    enableHnmTraining: false,
    hnmLearningRate: 0.0002,
    hnmWeightDecay: 0.0001,
    showLocalAiPanel: false,
    localAiStatus: { isRunning: false, logs: ['Awaiting user action.'] },
    showMemoryDebug: false,
    isUiVisible: true,
    enableInstrumentTuningMode: false,
    tuningWorkbench_selectedInstrument: 'Master Bus',
    tuningWorkbench_selectedScript: 'FX Sweep (Kick Source)',
    tuningWorkbench_isScriptRunning: false,
    tuningWorkbench_currentStepInfo: 'Idle',


    // --- DEPRECATED - For older GUI compatibility ---
    genreRuleInfluence: 0.5,
    psySpectrumPosition: 0.5,
    darknessModifier: 0.5,
    kickClick: 0.5,
    bassFilterLfoRate: 0.2,
    bassFilterLfoDepth: 0,
    leadOscType: 2,
    leadPW: 0.5,
    leadFilterDecay: 0.3,
    leadAmpDecay: 0.5,
    leadPitchLfoRate: 0.2,
    leadPitchLfoDepth: 0,
    leadFilterLfoRate: 0.3,
    leadFilterLfoDepth: 0,
    hatClosedDecay: 0.05,
    hatOpenDecay: 0.2,
    hatHpfCutoff: 0.5,
    hatTone: 0.5,
    hatLevel: 0.5,
    noiseFxFiltType: 1,
    noiseFxCutoff: 0.5,
    noiseFxReso: 0.5,
    noiseFxLfoRate: 0.3,
    noiseFxLfoDepth: 0,
    noiseFxLevel: 0.3,
    acidMode: 0,
};

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, max));

export const AI_MODELS: AIModel[] = [
{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (GoogleAI)', provider: ModelProvider.GoogleAI, audioSupport: true },
{ id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite (GoogleAI)', provider: ModelProvider.GoogleAI, audioSupport: true },
{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (GoogleAI)', provider: ModelProvider.GoogleAI, audioSupport: true },
{ id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite (GoogleAI)', provider: ModelProvider.GoogleAI, audioSupport: true },
{ id: 'gemma-3n-e4b-it', name: 'Gemma 3n E4B (GoogleAI)', provider: ModelProvider.GoogleAI },
{ id: 'gemma-3n-e2b-it', name: 'Gemma 3n E2B (GoogleAI)', provider: ModelProvider.GoogleAI },
{ id: 'unsloth/gemma-3n-E2B-it-unsloth-bnb-4bit', name: 'gemma-3n-E2B-it (OpenAI_API)', provider: ModelProvider.OpenAI_API, audioSupport: true },
{ id: 'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:IQ2_M', name: 'Qwen3 Coder 30B A3B (OpenAI_API)', provider: ModelProvider.OpenAI_API },
{ id: 'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:IQ2_M', name: 'Qwen3 Coder 30B A3B (Ollama)', provider: ModelProvider.Ollama },
{ id: 'gemma3n:e4b', name: 'Gemma 3N E4B (Ollama)', provider: ModelProvider.Ollama },
{ id: 'gemma3n:e2b', name: 'Gemma 3N E2B (Ollama)', provider: ModelProvider.Ollama },
{ id: 'qwen3:14b', name: 'Qwen3 14B (Ollama)', provider: ModelProvider.Ollama },
{ id: 'qwen3:8b', name: 'Qwen3 8B (Ollama)', provider: ModelProvider.Ollama },
{ id: 'qwen3:4b', name: 'Qwen3 4B (Ollama)', provider: ModelProvider.Ollama },
{ id: 'qwen3:1.7b', name: 'Qwen3 1.7B (Ollama)', provider: ModelProvider.Ollama },
{ id: 'qwen3:0.6b', name: 'Qwen3 0.6B (Ollama)', provider: ModelProvider.Ollama },
{ id: 'onnx-community/gemma-3-1b-it-ONNX', name: 'gemma-3-1b-it-ONNX (HuggingFace)', provider: ModelProvider.HuggingFace },
{ id: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3-0.6B (HuggingFace)', provider: ModelProvider.HuggingFace },
{ id: 'onnx-community/gemma-3n-E2B-it-ONNX', name: 'Gemma 3N E2B (HuggingFace)', provider: ModelProvider.HuggingFace },
{ id: 'onnx-community/Qwen3-4B-ONNX', name: 'Qwen3-4B (HuggingFace)', provider: ModelProvider.HuggingFace },
{ id: 'onnx-community/Qwen3-1.7B-ONNX', name: 'Qwen3-1.7B (HuggingFace)', provider: ModelProvider.HuggingFace }
];


export const STANDARD_TOOL_CALL_SYSTEM_PROMPT = `You have access to a set of tools. To use a tool, you MUST respond with a single, valid JSON object containing the tool name and its arguments, and nothing else. Do not add any other text, explanation, or markdown formatting.

Available tools:
{{TOOLS_JSON}}

Your response MUST be in the format:
{"name": "tool_name", "arguments": {"arg1": "value1", "arg2": "value2"}}
`;