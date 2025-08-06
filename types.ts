


export interface TuningScriptStep {
    duration: number; // in milliseconds
    params: Partial<MenuSettings>;
    description?: string;
}

export interface TuningScript {
    name: string;
    description: string;
    steps: TuningScriptStep[];
}

export interface InstrumentScripts {
    [instrumentKey: string]: TuningScript[];
}

export interface LastRecording {
    audioBlob: Blob | null;
    scriptBlob: Blob | null;
    spectrogramDataUrl: string | null;
    scriptFileName: string | null;
}

export interface MenuSettings {
    playerInfluence: number;
    hnmModulationDepth: number;
    micFeedbackToL0Strength: number;
    explorationInfluence: number;
    
    // --- Psy-Tek Generative Framework ---
    energyLevel: number;
    harmonicComplexity: number;
    mood: number; // 0: Light, 1: Twilight, 2: Dark
    masterBPM: number;
    
    // KICK
    kickPatternDensity: number;
    kickTune: number;
    kickAttack: number;
    kickPitchDecay: number;
    kickAmpDecay: number;
    kickDistortion: number;
    kickLevel: number;
    
    // BASS
    bassPatternDensity: number;
    bassOscType: number; // 0: Saw, 1: Square
    bassSubOscLevel: number;
    bassOctave: number; // 0: Sub-2, 1: Sub-1, 2: Root
    bassPW: number;
    bassGlide: number;
    bassCutoff: number;
    bassReso: number;
    bassEnvAmt: number;
    bassFilterKeyTrack: number;
    bassFilterDecay: number;
    bassAmpDecay: number;
    bassDistortion: number;
    bassLevel: number;
    
    // LEAD SYNTH (Universal Chameleon)
    leadPatternDensity: number;
    leadOctave: number; // 0: Low, 1: Mid, 2: High
    leadWaveformMix: number; // 0: Sine/FM (Bubble), 1: Supersaw
    leadFmAmount: number;
    leadDistortion: number;
    leadCutoff: number;
    leadReso: number;
    leadEnvAmt: number;
    leadDecay: number;
    leadAccentAmount: number;
    leadLevel: number;

    // ATMOS PAD
    atmosOscType: number; // 0: Saw, 1: FMish
    atmosEvolutionRate: number;
    atmosCutoff: number;
    atmosReso: number;
    atmosSpread: number;
    atmosLevel: number;

    // RHYTHM SYNTH (formerly Hi-Hats)
    rhythmPatternDensity: number;
    rhythmClosedDecay: number;
    rhythmOpenDecay: number;
    rhythmHpfCutoff: number;
    rhythmMetallicAmount: number;
    rhythmLevel: number;

    // SNARE
    snarePatternDensity: number;
    snareFlamAmount: number;
    snareNoiseLevel: number;
    snareNoiseDecay: number;
    snareNoiseCutoff: number;
    snareBodyTune: number;
    snareBodyDecay: number;
    snareBodyLevel: number;
    snareLevel: number;

    // RISER FX (formerly Noise FX)
    riserTriggerRate: number; // 0:Off, 1:4bars, 2:8bars, 3:16bars
    riserAttack: number;
    riserDecay: number;
    riserPitchSweep: number;
    riserCutoff: number;
    riserReso: number;
    riserLevel: number;

    // MASTER FX BUS
    delayTimeMode: number;
    delayFeedback: number;
    delayFilterCutoff: number;
    delayStereo: number;
    delayMix: number;
    reverbSize: number;
    reverbDamp: number;
    reverbPreDelay: number;
    reverbShimmer: number;
    reverbMix: number;

    // App & AI Settings
    enableSpeechCommands: boolean;
    enableLongPressToggleUI: boolean;
    enablePsyCoreModulatorMode: boolean;
    enableAiCopilotMode: boolean;
    aiCopilotThought: string;
    selectedModelId: string;
    googleApiKey: string;
    openAiApiKey: string;
    openAiBaseUrl: string;
    ollamaHost: string;
    showAiMuse: boolean;
    aiCallCount: number;
    aiDebugLog: string;
    showAiDebugLog: boolean;
    enableHnmTraining: boolean;
    hnmLearningRate: number;
    hnmWeightDecay: number;
    showLocalAiPanel: boolean;
    localAiStatus: LocalAiStatus;
    showMemoryDebug: boolean;
    isUiVisible: boolean;
    
    // Instrument Tuning Workbench
    enableInstrumentTuningMode: boolean;
    tuningWorkbench_selectedInstrument: string;
    tuningWorkbench_selectedScript: string;
    tuningWorkbench_isScriptRunning: boolean;
    tuningWorkbench_currentStepInfo: string;


    // --- DEPRECATED - For older GUI compatibility ---
    genreRuleInfluence: number;
    psySpectrumPosition: number;
    darknessModifier: number;
    kickClick: number;
    bassFilterLfoRate: number;
    bassFilterLfoDepth: number;
    leadOscType: number;
    leadPW: number;
    leadFilterDecay: number;
    leadAmpDecay: number;
    leadPitchLfoRate: number;
    leadPitchLfoDepth: number;
    leadFilterLfoRate: number;
    leadFilterLfoDepth: number;
    hatClosedDecay: number;
    hatOpenDecay: number;
    hatHpfCutoff: number;
    hatTone: number;
    hatLevel: number;
    noiseFxFiltType: number;
    noiseFxCutoff: number;
    noiseFxReso: number;
    noiseFxLfoRate: number;
    noiseFxLfoDepth: number;
    noiseFxLevel: number;
    acidMode: number;
    acidPatternDensity: number;
    acidOctave: number;
    acidCutoff: number;
    acidReso: number;
    acidEnvAmt: number;
    acidDecay: number;
    acidAccentAmount: number;
    acidLevel: number;
}

export interface LocalAiStatus {
  isRunning: boolean;
  logs: string[];
}

export interface InputState {
    touch: {
        x: number;
        y: number;
        active: boolean;
        pressure: number;
        dx: number;
        dy: number;
        lastX: number;
        lastY: number;
    };
    motion: {
        alpha: number;
        beta: number;
        gamma: number;
        available: boolean;
    };
    mic: {
        level: number;
        fft: Float32Array;
        available: boolean;
        rhythmPeak: number;
        rhythmTempo: number;
    };
    accelerometer: {
        x: number;
        y: number;
        z: number;
        magnitude: number;
        available: boolean;
        history: number[];
        rhythmPeak: number;
        rhythmTempo: number;
    };
    outputRhythm: {
        bpm: number;
        density: number;
    };
    syncFactor: number;
    currentTime: number;
}

export interface Artifact {
    id: number;
    stateVector: number[];
    featureTags: string;
    embedding: number[] | Float32Array;
    timestamp: number;
}

export interface ActiveArtifactInfo {
    ids: number[];
    stateArrays: number[][];
    similarities: number[];
}

export interface HnmLevelConfig {
    name: string;
    dim: number;
    raw_sensory_input_dim?: number;
    bu_source_level_names: string[];
    td_source_level_names: string[];
    external_input_config?: {
        source_signal_name: string;
        dim: number;
    };
    nmm_params?: any;
}

export interface HnmLastStepOutput {
    retrievedVal: any; // tf.Tensor & { isDisposed: boolean; dispose: () => void; }
}

export interface HnmLastStepOutputs {
    [key: string]: HnmLastStepOutput;
}

export interface HnmState {
    seq_index: number;
    layerWeights: { [key: string]: any[] }; // Array of tf.Tensor
    optim_state: any;
}

// --- AI Service Types ---

export enum ModelProvider {
  GoogleAI = 'GoogleAI',
  OpenAI_API = 'OpenAI_API',
  Ollama = 'Ollama',
  HuggingFace = 'HuggingFace',
}

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  audioSupport?: boolean;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  items?: any;
}

export interface LLMTool {
  id?: string;
  name:string;
  description: string;
  parameters: ToolParameter[];
  category?: 'Server' | 'Client';
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  implementationCode?: string;
}

export interface NewToolPayload {
    name: string;
    description: string;
    category: 'Server' | 'Client';
    implementationCode: string;
    parameters: ToolParameter[];
}

export interface AIToolCall {
    name: string;
    arguments: any;
}

export interface AIResponse {
  toolCall?: {
    name: string;
    arguments: any;
  } | null;
  textResponse?: string;
}

export type AiContextItem = {
    mic: InputState['mic'];
    motion: InputState['accelerometer'];
    outputRhythm: InputState['outputRhythm'];
    hnmAnomaly: number;
    currentSettings: Partial<MenuSettings>;
    audioClip?: { mimeType: string, data: string } | null;
    imageClip?: { mimeType: string, data: string } | null;
    spectrogramClip?: { mimeType: string, data: string, rawData: Uint8Array } | null;
    spectrogramText?: string;
};

export interface AiContext extends AiContextItem {
    // For "before/after" learning loop
    previousContext?: AiContextItem | null;
    lastAction?: Partial<MenuSettings> | null;
}