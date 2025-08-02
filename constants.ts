
import { MenuSettings, HnmLevelConfig } from './types';

export const VERSION = "0.7.0-GenreAdaptMode";
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
export const LOCAL_STORAGE_MENU_KEY = `infundibulumEchoesMenuSettings_v${VERSION}`;

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
    { name: "L0_IntentProcessing", dim: 96, raw_sensory_input_dim: STATE_VECTOR_SIZE, bu_source_level_names: [], td_source_level_names: ["L1_ContextualResonance"], external_input_config: { source_signal_name: "ArtifactSignalSource", dim: HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM }, nmm_params: { mem_model_depth: 2, mem_model_expansion: 1.5, learning_rate: 0.000, weight_decay: 0.000, external_signal_dim: HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM, external_signal_role: "add_to_bu", verbose: HNM_VERBOSE } },
    { name: "L1_ContextualResonance", dim: STATE_VECTOR_SIZE, bu_source_level_names: ["L0_IntentProcessing"], td_source_level_names: [], external_input_config: { source_signal_name: "ActiveGenreRuleSignal", dim: HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM }, nmm_params: { mem_model_depth: 2, mem_model_expansion: 2.0, learning_rate: 0.000, weight_decay: 0.000, external_signal_dim: HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM, external_signal_role: "add_to_target", verbose: HNM_VERBOSE } }
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
    genreRuleInfluence: 0.5,
    micFeedbackToL0Strength: 0.25,
    explorationInfluence: 0.1,
    psySpectrumPosition: 0.5,
    darknessModifier: 0.0,
    masterBPM: 140,
    kickTune: 0.5,
    kickPunch: 0.7,
    kickDecay: 0.2,
    kickClick: 0.5,
    kickLevel: 0.8,
    bassOscType: 0,
    bassOctave: 0.3,
    bassCutoff: 0.3,
    bassReso: 0.6,
    bassEnvAmt: 0.7,
    bassFilterDecay: 0.15,
    bassAmpDecay: 0.1,
    bassFilterLfoRate: 0.2,
    bassFilterLfoDepth: 0.3,
    bassLevel: 0.7,
    leadOscType: 0,
    leadOctave: 0.6,
    leadPW: 0.5,
    leadCutoff: 0.6,
    leadReso: 0.7,
    leadEnvAmt: 0.8,
    leadFilterDecay: 0.3,
    leadAmpDecay: 0.4,
    leadPitchLfoRate: 0.5,
    leadPitchLfoDepth: 0.3,
    leadFilterLfoRate: 0.3,
    leadFilterLfoDepth: 0.4,
    leadLevel: 0.6,
    hatClosedDecay: 0.05,
    hatOpenDecay: 0.25,
    hatHpfCutoff: 0.7,
    hatTone: 0.5,
    hatLevel: 0.5,
    snareNoiseLevel: 0.8,
    snareNoiseDecay: 0.08,
    snareBodyTune: 0.5,
    snareBodyDecay: 0.15,
    snareBodyLevel: 0.5,
    snareLevel: 0.6,
    noiseFxFiltType: 0,
    noiseFxCutoff: 0.5,
    noiseFxReso: 0.4,
    noiseFxLfoRate: 0.3,
    noiseFxLfoDepth: 0.6,
    noiseFxLevel: 0.4,
    delayTimeMode: 2,
    delayFeedback: 0.45,
    delayMix: 0.3,
    reverbSize: 0.7,
    reverbDamp: 0.5,
    reverbMix: 0.25,
    enableSpeechCommands: true,
    enableTapReset: true,
    enableGenreAdaptMode: false,
};

export const GENRE_EDIT_SLIDER_COUNT = 16;
export const GENRE_EDIT_SLIDER_MAPPING = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, max));