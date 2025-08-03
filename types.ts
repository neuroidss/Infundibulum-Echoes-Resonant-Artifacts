
export interface MenuSettings {
    playerInfluence: number;
    genreRuleInfluence: number;
    micFeedbackToL0Strength: number;
    explorationInfluence: number;
    psySpectrumPosition: number;
    darknessModifier: number;
    masterBPM: number;
    kickTune: number;
    kickPunch: number;
    kickDecay: number;
    kickClick: number;
    kickLevel: number;
    bassOscType: number;
    bassOctave: number;
    bassCutoff: number;
    bassReso: number;
    bassEnvAmt: number;
    bassFilterDecay: number;
    bassAmpDecay: number;
    bassFilterLfoRate: number;
    bassFilterLfoDepth: number;
    bassLevel: number;
    leadOscType: number;
    leadOctave: number;
    leadPW: number;
    leadCutoff: number;
    leadReso: number;
    leadEnvAmt: number;
    leadFilterDecay: number;
    leadAmpDecay: number;
    leadPitchLfoRate: number;
    leadPitchLfoDepth: number;
    leadFilterLfoRate: number;
    leadFilterLfoDepth: number;
    leadLevel: number;
    hatClosedDecay: number;
    hatOpenDecay: number;
    hatHpfCutoff: number;
    hatTone: number;
    hatLevel: number;
    snareNoiseLevel: number;
    snareNoiseDecay: number;
    snareBodyTune: number;
    snareBodyDecay: number;
    snareBodyLevel: number;
    snareLevel: number;
    noiseFxFiltType: number;
    noiseFxCutoff: number;
    noiseFxReso: number;
    noiseFxLfoRate: number;
    noiseFxLfoDepth: number;
    noiseFxLevel: number;
    delayTimeMode: number;
    delayFeedback: number;
    delayMix: number;
    reverbSize: number;
    reverbDamp: number;
    reverbMix: number;
    enableSpeechCommands: boolean;
    enableTapReset: boolean;
    enableGenreAdaptMode: boolean;
    enableHnmTrainingMode: boolean;
    hnmLearningRate: number;
    hnmWeightDecay: number;
    selectedModelId: string;
}

export interface GenreEditState {
    genreEdit_Selected: string;
    _genreEdit_tempState: number[];
    [key: `genreEdit_Param${number}`]: number;
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
    retrievedVal: any; // tf.Tensor
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
}

export interface APIConfig {
  googleAIAPIKey: string;
  openAIAPIKey: string;
  openAIBaseUrl: string;
  ollamaHost: string;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  items?: any;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface AIResponse {
  toolCall?: {
    name: string;
    arguments: any;
  } | null;
  textResponse?: string;
}
