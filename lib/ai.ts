
import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";
import { pipeline, env as xenovaEnv, TextGenerationPipeline } from '@xenova/transformers';
import type { MenuSettings, InputState, AIModel, APIConfig, LLMTool, AIResponse, ToolParameter } from '../types';
import { ModelProvider } from '../types';
import { AI_MODELS, STANDARD_TOOL_CALL_SYSTEM_PROMPT } from '../constants';

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, max));

// --- Provider-Specific Services ---

namespace GeminiService {
    const getAIClient = (apiConfig: APIConfig): GoogleGenAI => {
        const apiKey = apiConfig.googleAIAPIKey || (typeof process !== 'undefined' && process.env.API_KEY);
        if (!apiKey) {
            throw new Error("Google AI API Key not found. Please set it in the app's API Configuration.");
        }
        return new GoogleGenAI({ apiKey });
    };

    const sanitizeForFunctionName = (name: string): string => name.replace(/[^a-zA-Z0-9_]/g, '_');

    const mapTypeToGemini = (type: ToolParameter['type']): Type => {
        switch (type) {
            case 'string': return Type.STRING;
            case 'number': return Type.NUMBER;
            case 'boolean': return Type.BOOLEAN;
            case 'array': return Type.ARRAY;
            case 'object': return Type.OBJECT;
            default: return Type.STRING;
        }
    };
    
    const buildGeminiTools = (tools: LLMTool[]): { functionDeclarations: FunctionDeclaration[], toolNameMap: Map<string, string> } => {
        const toolNameMap = new Map<string, string>();
        const functionDeclarations = tools.map((tool): FunctionDeclaration => {
            const properties: Record<string, any> = {};
            const required: string[] = [];
            tool.parameters.forEach(param => {
                properties[param.name] = { type: mapTypeToGemini(param.type), description: param.description };
                if (param.required) required.push(param.name);
            });
            const functionName = sanitizeForFunctionName(tool.name);
            toolNameMap.set(functionName, tool.name);
            return { name: functionName, description: tool.description, parameters: { type: Type.OBJECT, properties, required } };
        });
        return { functionDeclarations, toolNameMap };
    };

    const parseNativeToolCall = (response: GenerateContentResponse, toolNameMap: Map<string, string>): AIResponse => {
        const functionCallPart = response.candidates?.[0]?.content?.parts?.find(part => 'functionCall' in part);
        if (functionCallPart && functionCallPart.functionCall) {
            const { name, args } = functionCallPart.functionCall;
            const originalToolName = toolNameMap.get(name);
            if (!originalToolName) {
                console.warn(`AI called an unknown tool via Gemini (native): ${name}`);
                return { toolCall: null };
            }
            return { toolCall: { name: originalToolName, arguments: args || {} } };
        }
        return { toolCall: null };
    };

    export const generateWithNativeTools = async (userInput: string, systemInstruction: string, modelId: string, apiConfig: APIConfig, relevantTools: LLMTool[]): Promise<AIResponse> => {
        const ai = getAIClient(apiConfig);
        const { functionDeclarations, toolNameMap } = buildGeminiTools(relevantTools);
        
        const response = await ai.models.generateContent({
            model: modelId,
            contents: userInput,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.1,
                tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
            },
        });
        
        return parseNativeToolCall(response, toolNameMap);
    };
}

namespace OpenAIService {
    const TIMEOUT = 120000;
    const fetchWithTimeout = (url: string, options: RequestInit) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), TIMEOUT);
        return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
    };

    export const generateJsonOutput = async (userInput: string, systemInstruction: string, modelId: string, apiConfig: APIConfig): Promise<string> => {
        if (!apiConfig.openAIAPIKey) throw new Error("OpenAI API Key is missing.");
        if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI Base URL is missing.");

        const body = {
            model: modelId.replace('openai/', ''),
            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: userInput }],
            temperature: 0.1,
            response_format: { type: 'json_object' }
        };
        const response = await fetchWithTimeout(
            `${apiConfig.openAIBaseUrl.replace(/\/+$/, '')}/chat/completions`,
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.openAIAPIKey}` }, body: JSON.stringify(body) }
        );
        if (!response.ok) {
            const err = await response.json();
            throw new Error(`OpenAI API Error: ${err.error.message}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '{}';
    };
}

namespace OllamaService {
    const TIMEOUT = 120000; // 2 minutes
    const fetchWithTimeout = (url: string, options: RequestInit) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), TIMEOUT);
        return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
    };
    
    export const generateJsonOutput = async (userInput: string, systemInstruction: string, modelId: string, apiConfig: APIConfig): Promise<string> => {
        if (!apiConfig.ollamaHost) throw new Error("Ollama Host URL is not configured.");
        const body = {
            model: modelId.replace('ollama/', ''),
            system: systemInstruction,
            prompt: userInput,
            stream: false,
            format: 'json',
            options: { temperature: 0.1 },
        };
        const response = await fetchWithTimeout(
            `${apiConfig.ollamaHost.replace(/\/+$/, '')}/api/generate`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama Error ${response.status}: ${errText}`);
        }
        const data = await response.json();
        return data.response || '{}';
    };
}

namespace HuggingFaceService {
    let generator: TextGenerationPipeline | null = null;
    let currentModelId: string | null = null;

    const handleProgress = (onProgress: (message: string) => void) => (progress: any) => {
        const { status, file, progress: p, loaded, total } = progress;
        if (status === 'progress' && p > 0 && total > 0) {
            const friendlyLoaded = (loaded / 1024 / 1024).toFixed(1);
            const friendlyTotal = (total / 1024 / 1024).toFixed(1);
            onProgress(`Loading ${file}: ${Math.round(p)}% (${friendlyLoaded}MB / ${friendlyTotal}MB)`);
        } else if (status !== 'progress') {
            onProgress(`Status: ${status}...`);
        }
    };

    const getPipeline = async (modelId: string, onProgress: (message: string) => void): Promise<TextGenerationPipeline> => {
        if (generator && currentModelId === modelId) return generator;
        onProgress(`Initializing model: ${modelId}. This may take a few minutes...`);
        if (generator) await generator.dispose();
        
        xenovaEnv.allowLocalModels = false;
        
        generator = await pipeline('text-generation', modelId, { progress_callback: handleProgress(onProgress) }) as TextGenerationPipeline;
        currentModelId = modelId;
        onProgress(`Model ${modelId} loaded successfully.`);
        return generator;
    };
    
    export const generateJsonOutput = async (userInput: string, systemInstruction: string, modelId: string, apiConfig: APIConfig, onProgress: (message: string) => void): Promise<string> => {
        const pipe = await getPipeline(modelId.replace('hf/', ''), onProgress);
        const prompt = `<|system|>\n${systemInstruction}<|end|>\n<|user|>\n${userInput}<|end|>\n<|assistant|>`;
        const outputs = await pipe(prompt, { max_new_tokens: 2048, temperature: 0.1, do_sample: false });
        const rawText = (outputs[0] as any).generated_text;
        return rawText.split('<|assistant|>').pop()?.trim() || '{}';
    };
}


// --- Generic AI Dispatcher ---

const parseJsonOrNull = (jsonString: string): any => {
    if (!jsonString) return null;
    let jsonText = jsonString.trim();
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.substring(7, jsonText.length - 3).trim();
    }
    try {
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse JSON response:", jsonString, e);
        return null;
    }
};

const parseToolCallResponse = (responseText: string): AIResponse => {
    const parsed = parseJsonOrNull(responseText);
    if (!parsed || !parsed.name) {
        return { toolCall: null, textResponse: responseText };
    }
    return { toolCall: { name: parsed.name, arguments: parsed.arguments || {} } };
};

export const generateResponseWithTools = async (
    userInput: string,
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    onProgress: (message: string) => void,
    relevantTools: LLMTool[],
): Promise<AIResponse> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return GeminiService.generateWithNativeTools(userInput, systemInstruction, model.id, apiConfig, relevantTools);

        case ModelProvider.OpenAI_API:
        case ModelProvider.Ollama:
        case ModelProvider.HuggingFace: {
            const toolsForPrompt = relevantTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
            const toolDefinitions = JSON.stringify(toolsForPrompt, null, 2);
            const fullSystemInstruction = `${systemInstruction}\n\n${STANDARD_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolDefinitions)}`;
            let responseText = "{}";
            if (model.provider === ModelProvider.OpenAI_API) {
                responseText = await OpenAIService.generateJsonOutput(userInput, fullSystemInstruction, model.id, apiConfig);
            } else if (model.provider === ModelProvider.Ollama) {
                responseText = await OllamaService.generateJsonOutput(userInput, fullSystemInstruction, model.id, apiConfig);
            } else { // HuggingFace
                responseText = await HuggingFaceService.generateJsonOutput(userInput, fullSystemInstruction, model.id, apiConfig, onProgress);
            }
            return parseToolCallResponse(responseText);
        }

        default:
            throw new Error(`Unsupported model provider: ${model.provider}`);
    }
};

// --- Application-Specific AI Logic ---

const menuSettingsProperties: { [key: string]: ToolParameter } = {
  playerInfluence: { name: 'playerInfluence', type: 'number', description: "User touch/motion influence. Range 0-1.", required: true },
  genreRuleInfluence: { name: 'genreRuleInfluence', type: 'number', description: "Influence of the base genre template. Range 0-1.", required: true },
  psySpectrumPosition: { name: 'psySpectrumPosition', type: 'number', description: "Blends between psytrance styles (chill/dub to progressive/full-on). Range 0-1.", required: true },
  darknessModifier: { name: 'darknessModifier', type: 'number', description: "Blends between light and dark styles. Range 0-1.", required: true },
  masterBPM: { name: 'masterBPM', type: 'number', description: "Master tempo in beats per minute. Typical psytrance is 135-150. Ambient is 60-90.", required: true },
  kickLevel: { name: 'kickLevel', type: 'number', description: "Kick drum volume. Range 0-1.", required: true },
  bassLevel: { name: 'bassLevel', type: 'number', description: "Bass volume. Range 0-1.", required: true },
  leadLevel: { name: 'leadLevel', type: 'number', description: "Lead synth volume. Range 0-1.", required: true },
  hatLevel: { name: 'hatLevel', type: 'number', description: "Hi-hat volume. Range 0-1.", required: true },
  snareLevel: { name: 'snareLevel', type: 'number', description: "Overall snare volume. Range 0-1.", required: true },
  delayMix: { name: 'delayMix', type: 'number', description: "Delay wet/dry mix. Range 0-1.", required: true },
  reverbMix: { name: 'reverbMix', type: 'number', description: "Reverb wet/dry mix. Range 0-1.", required: true },
};

const generateMusicSettingsTool: LLMTool = {
    name: "generate_music_settings",
    description: "Generates a complete set of synthesizer parameters to create a musical soundscape based on a user's descriptive prompt.",
    parameters: Object.values(menuSettingsProperties)
};

const getGenreAdaptationTool: LLMTool = {
    name: "get_genre_adaptation",
    description: "Suggests a new musical genre direction based on real-time environmental and user-interaction data.",
    parameters: [
        { name: 'psySpectrumPosition', type: 'number', description: "A value from 0.0 (chill/dub) to 1.0 (full-on/aggressive psytrance).", required: true },
        { name: 'darknessModifier', type: 'number', description: "A value from 0.0 (light/melodic) to 1.0 (dark/forest).", required: true }
    ]
};

export async function generateMusicSettings(prompt: string, model: AIModel, apiConfig: APIConfig, onProgress: (msg: string) => void): Promise<Partial<MenuSettings>> {
    const systemInstruction = `You are an expert sound designer specializing in generative psytrance and ambient music. Your task is to generate a complete set of parameters for a complex synthesizer to match the user's request. Call the 'generate_music_settings' tool with the appropriate arguments.`;
    
    const response = await generateResponseWithTools(prompt, systemInstruction, model, apiConfig, onProgress, [generateMusicSettingsTool]);

    if (response.toolCall?.name === 'generate_music_settings' && response.toolCall.arguments) {
        return response.toolCall.arguments;
    }
    
    console.error("AI did not call the expected tool for music generation.", response);
    throw new Error("AI failed to generate music settings. The response was invalid.");
}

export interface GenreAdaptContext {
    mic: InputState['mic'];
    motion: InputState['accelerometer'];
    recentArtifactTags: string[];
    currentBpm: number;
}

export async function getGenreAdaptation(context: GenreAdaptContext, model: AIModel, apiConfig: APIConfig, onProgress: (msg: string) => void): Promise<{ psySpectrumPosition: number; darknessModifier: number } | null> {
    const systemInstruction = `You are an intelligent DJ assistant. Your goal is to subtly guide the musical genre. Based on the user's activity and environment, call the 'get_genre_adaptation' tool to suggest a new target 'psySpectrumPosition' (0=chill, 1=full-on) and 'darknessModifier' (0=light, 1=dark).`;

    const micEnergyDesc = context.mic.rhythmPeak > 0.6 ? 'high' : context.mic.rhythmPeak > 0.3 ? 'medium' : 'low';
    const motionEnergyDesc = context.motion.rhythmPeak > 0.6 ? 'very active' : 'calm';
    const prompt = `Context:
- Ambient Sound: ${context.mic.rhythmTempo.toFixed(0)} BPM, ${micEnergyDesc} energy.
- User Motion: ${motionEnergyDesc}.
- Recent Vibe: "${context.recentArtifactTags.join(', ')}".
- Current Synth Tempo: ${context.currentBpm.toFixed(0)} BPM.
Based on this, what is the ideal genre direction?`;

    const response = await generateResponseWithTools(prompt, systemInstruction, model, apiConfig, onProgress, [getGenreAdaptationTool]);

    if (response.toolCall?.name === 'get_genre_adaptation' && response.toolCall.arguments) {
        const { psySpectrumPosition, darknessModifier } = response.toolCall.arguments;
        if (typeof psySpectrumPosition === 'number' && typeof darknessModifier === 'number') {
            return {
                psySpectrumPosition: clamp(psySpectrumPosition, 0, 1),
                darknessModifier: clamp(darknessModifier, 0, 1),
            };
        }
    }
    
    console.error("AI did not call the expected tool for genre adaptation.", response);
    return null;
}
