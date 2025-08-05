import { MenuSettings, HnmLevelConfig, AIModel, ModelProvider } from './types';

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
export const ARTIFACT_CREATION_INTERVAL_MS = 9000;
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

export const GENRE_TARGET_STATES: { [key: string]: number[] } = {
    "PSY_CHILL": [0.5, 0.2, 0.3, 0.7, 0.5, 0.7, 0.3, 0.2, 0.3, 0.2, 0.7, 0.6, 0.1, 0.5, 0.2, 0.6, 0.4, 0.5, 0.3, 0.5, 0.5, 0.2, 0.6, 0.3, 0.2, 0.3, 0.4, 0.2, 0.4, 0.4, 0.5, 0.6, 0.4, 0.5, 0.7, 0.6, 0.2, 0.5, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    "PSY_DUB": [0.6, 0.3, 0.2, 0.4, 0.6, 0.6, 0.4, 0.2, 0.4, 0.35, 0.6, 0.5, 0.2, 0.7, 0.3, 0.7, 0.3, 0.4, 0.2, 0.6, 0.2, 0.1, 0.7, 0.4, 0.3, 0.4, 0.3, 0.3, 0.5, 0.5, 0.3, 0.7, 0.6, 0.6, 0.8, 0.7, 0.3, 0.6, 0.3, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    "PSY_PROGRESSIVE": [0.5, 0.6, 0.4, 0.6, 0.5, 0.5, 0.6, 0.4, 0.6, 0.55, 0.4, 0.5, 0.3, 0.4, 0.6, 0.65, 0.6, 0.5, 0.4, 0.5, 0.5, 0.4, 0.5, 0.5, 0.4, 0.5, 0.5, 0.4, 0.4, 0.4, 0.4, 0.4, 0.3, 0.4, 0.5, 0.4, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    "PSY_FULLON": [0.7, 0.7, 0.5, 0.3, 0.6, 0.4, 0.7, 0.6, 0.7, 0.75, 0.3, 0.4, 0.4, 0.3, 0.7, 0.3, 0.8, 0.6, 0.6, 0.4, 0.4, 0.6, 0.4, 0.6, 0.5, 0.6, 0.7, 0.3, 0.3, 0.3, 0.3, 0.3, 0.2, 0.3, 0.4, 0.3, 0.5, 0.4, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    "DARK_PSY_CHILL": [0.4, 0.3, 0.6, 0.2, 0.6, 0.1, 0.5, 0.4, 0.5, 0.4, 0.5, 0.4, 0.5, 0.6, 0.3, 0.6, 0.5, 0.6, 0.5, 0.4, 0.4, 0.3, 0.5, 0.4, 0.4, 0.4, 0.4, 0.3, 0.4, 0.4, 0.4, 0.5, 0.3, 0.5, 0.6, 0.5, 0.3, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    "DARK_PSY_DUB": [0.5, 0.2, 0.7, 0.3, 0.7, 0.2, 0.5, 0.3, 0.6, 0.45, 0.5, 0.3, 0.6, 0.7, 0.2, 0.65, 0.4, 0.5, 0.4, 0.5, 0.3, 0.2, 0.6, 0.5, 0.4, 0.5, 0.4, 0.2, 0.4, 0.4, 0.3, 0.6, 0.5, 0.5, 0.7, 0.6, 0.4, 0.5, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    "DARK_PSY_PROG": [0.4, 0.5, 0.6, 0.4, 0.6, 0.3, 0.7, 0.5, 0.8, 0.65, 0.3, 0.3, 0.6, 0.6, 0.4, 0.7, 0.6, 0.6, 0.7, 0.4, 0.3, 0.5, 0.4, 0.6, 0.5, 0.6, 0.5, 0.2, 0.3, 0.3, 0.3, 0.3, 0.2, 0.3, 0.4, 0.3, 0.5, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    "DARK_PSY": [0.8, 0.4, 0.7, 0.3, 0.7, 0.2, 0.8, 0.8, 0.9, 0.85, 0.4, 0.2, 0.7, 0.8, 0.2, 0.75, 0.7, 0.7, 0.8, 0.3, 0.3, 0.8, 0.2, 0.7, 0.6, 0.7, 0.6, 0.2, 0.2, 0.2, 0.2, 0.2, 0.1, 0.2, 0.3, 0.2, 0.6, 0.3, 0.7, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
};

export const DEFAULT_MENU_SETTINGS: MenuSettings = {
    playerInfluence: 0.5,
    hnmModulationDepth: 0.5,
    micFeedbackToL0Strength: 0.25,
    explorationInfluence: 0.1,
    energyLevel: 0.5,
    harmonicComplexity: 0.3,
    mood: 1, // Twilight
    masterBPM: 140,
    kickPatternDensity: 0.9,
    kickTune: 0.5,
    kickAttack: 0.8,
    kickPitchDecay: 0.05,
    kickAmpDecay: 0.4,
    kickDistortion: 0.2,
    kickLevel: 0.8,
    bassPatternDensity: 0.7,
    bassOscType: 0,
    bassSubOscLevel: 0.5,
    bassOctave: 1,
    bassPW: 0.5,
    bassGlide: 0.05,
    bassCutoff: 0.3,
    bassReso: 0.6,
    bassEnvAmt: 0.7,
    bassFilterKeyTrack: 0.4,
    bassFilterDecay: 0.15,
    bassAmpDecay: 0.1,
    bassLevel: 0.7,
    acidPatternDensity: 0.2,
    acidOctave: 1,
    acidCutoff: 0.6,
    acidReso: 0.7,
    acidEnvAmt: 0.8,
    acidDecay: 0.3,
    acidAccentAmount: 0.5,
    acidLevel: 0.6,
    atmosOscType: 1,
    atmosEvolutionRate: 0.3,
    atmosCutoff: 0.5,
    atmosReso: 0.4,
    atmosSpread: 0.6,
    atmosLevel: 0.5,
    rhythmPatternDensity: 0.8,
    rhythmClosedDecay: 0.05,
    rhythmOpenDecay: 0.25,
    rhythmHpfCutoff: 0.7,
    rhythmMetallicAmount: 0.6,
    rhythmLevel: 0.5,
    snarePatternDensity: 0.9,
    snareFlamAmount: 0.2,
    snareNoiseLevel: 0.8,
    snareNoiseDecay: 0.08,
    snareNoiseCutoff: 0.6,
    snareBodyTune: 0.5,
    snareBodyDecay: 0.15,
    snareBodyLevel: 0.5,
    snareLevel: 0.6,
    riserTriggerRate: 1,
    riserAttack: 2.0,
    riserDecay: 2.0,
    riserPitchSweep: 0.7,
    riserCutoff: 0.2,
    riserReso: 0.5,
    riserLevel: 0.4,
    delayTimeMode: 2,
    delayFeedback: 0.45,
    delayFilterCutoff: 0.5,
    delayStereo: 0.3,
    delayMix: 0.3,
    reverbSize: 0.7,
    reverbDamp: 0.5,
    reverbPreDelay: 0.02,
    reverbShimmer: 0.3,
    reverbMix: 0.25,
    enableSpeechCommands: true,
    enableTapReset: true,
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
};

export const GENRE_EDIT_SLIDER_COUNT = 16;
export const GENRE_EDIT_SLIDER_MAPPING = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, max));

export const AI_MODELS: AIModel[] = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (GoogleAI)', provider: ModelProvider.GoogleAI, audioSupport: true },
    { id: 'ollama-model/gemma2:latest', name: 'Gemma 2 (Ollama)', provider: ModelProvider.Ollama },
    { id: 'openai-model/gpt-4o-mini', name: 'GPT-4o mini (OpenAI API)', provider: ModelProvider.OpenAI_API },
    { id: 'Xenova/all-MiniLM-L6-v2', name: 'MiniLM (HuggingFace)', provider: ModelProvider.HuggingFace },
];


export const STANDARD_TOOL_CALL_SYSTEM_PROMPT = `You have access to a set of tools. To use a tool, you MUST respond with a single, valid JSON object containing the tool name and its arguments, and nothing else. Do not add any other text, explanation, or markdown formatting.

Available tools:
{{TOOLS_JSON}}

Your response MUST be in the format:
{"name": "tool_name", "arguments": {"arg1": "value1", "arg2": "value2"}}
`;