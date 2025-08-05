import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { pipeline, env as xenovaEnv, TextGenerationPipeline } from '@xenova/transformers';
import type { MenuSettings, AIModel, LLMTool, AIResponse, ToolParameter, AiContext } from '../types';
import { ModelProvider } from '../types';
import { STANDARD_TOOL_CALL_SYSTEM_PROMPT } from '../constants';
import type { FunctionDeclaration, Part } from "@google/genai";

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, max));

// --- Provider-Specific Services ---

namespace GeminiService {
    const getAIClient = (settings: Partial<MenuSettings>): GoogleGenAI => {
        const apiKey = settings.googleApiKey || process.env.API_KEY;
        if (!apiKey) {
            throw new Error("Google AI API Key not provided in GUI or environment variable API_KEY.");
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
                if (param.items) {
                    properties[param.name].items = { type: Type.STRING }; 
                }
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
        return { textResponse: response.text };
    };

    export const generateWithNativeTools = async (userInput: string, systemInstruction: string, modelId: string, relevantTools: LLMTool[], settings: Partial<MenuSettings>, context: AiContext): Promise<AIResponse> => {
        const ai = getAIClient(settings);
        const { functionDeclarations, toolNameMap } = buildGeminiTools(relevantTools);
        
        const userParts: Part[] = [];

        if (context.imageClip) {
            userParts.push({
                inlineData: {
                    mimeType: context.imageClip.mimeType,
                    data: context.imageClip.data,
                }
            })
        }

        if (context.audioClip) {
            userParts.push({
                inlineData: {
                    mimeType: context.audioClip.mimeType,
                    data: context.audioClip.data
                }
            });
        }
        userParts.push({ text: userInput });
        
        const response = await ai.models.generateContent({
            model: modelId,
            contents: [{role: "user", parts: userParts}],
            config: {
                systemInstruction: { parts: [{ text: systemInstruction }] },
                temperature: 0.2,
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

    export const generateJsonOutput = async (userInput: string | any[], systemInstruction: string, modelId: string, settings: Partial<MenuSettings>): Promise<string> => {
        const apiKey = settings.openAiApiKey || process.env.OPENAI_API_KEY;
        const baseUrl = settings.openAiBaseUrl || process.env.OPENAI_BASE_URL;
        if (!apiKey) throw new Error("OpenAI API Key missing from GUI or environment variable OPENAI_API_KEY.");
        if (!baseUrl) throw new Error("OpenAI Base URL missing from GUI or environment variable OPENAI_BASE_URL.");

        const body = {
            model: modelId,
            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: userInput }],
            temperature: 0.2,
            response_format: { type: 'json_object' }
        };
        const response = await fetchWithTimeout(
            `${(baseUrl).replace(/\/+$/, '')}/chat/completions`,
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(body) }
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
    const TIMEOUT = 120000;
    const fetchWithTimeout = (url: string, options: RequestInit) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), TIMEOUT);
        return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
    };
    
    export const generateJsonOutput = async (userInput: string | any[], systemInstruction: string, modelId: string, settings: Partial<MenuSettings>): Promise<string> => {
        const host = settings.ollamaHost || process.env.OLLAMA_HOST;
        if (!host) throw new Error("Ollama Host URL missing from GUI or environment variable OLLAMA_HOST.");
        
        let promptText: string;
        let images: string[] = [];

        if (Array.isArray(userInput)) {
            promptText = userInput.find(p => p.type === 'text')?.text || '';
            images = userInput
                .filter(p => p.type === 'image_url')
                .map(p => p.image_url.url.split(',')[1]) // get base64 data
                .filter(d => d); // filter out null/undefined
        } else {
            promptText = userInput;
        }

        const body: any = {
            model: modelId,
            system: systemInstruction,
            prompt: promptText,
            stream: false,
            format: 'json',
            options: { temperature: 0.2 },
        };
        
        if (images.length > 0) {
            body.images = images;
        }

        const response = await fetchWithTimeout(
            `${(host).replace(/\/+$/, '')}/api/generate`,
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
    
    export const generateJsonOutput = async (userInput: string, systemInstruction: string, modelId: string, onProgress: (message: string) => void): Promise<string> => {
        const pipe = await getPipeline(modelId, onProgress);
        const prompt = `<|system|>\n${systemInstruction}<|end|>\n<|user|>\n${userInput}<|end|>\n<|assistant|>`;
        const outputs = await pipe(prompt, { max_new_tokens: 2048, temperature: 0.2, do_sample: true, top_k: 50 });
        const rawText = (outputs[0] as any).generated_text;
        const assistantResponse = rawText.split('<|assistant|>').pop()?.trim() || '{}';
        
        if (assistantResponse.startsWith('```json')) {
            return assistantResponse.substring(7, assistantResponse.length - 3).trim();
        }
        return assistantResponse;
    };
}

// --- Generic AI Dispatcher ---

const parseJsonOrNull = (jsonString: string): any => {
    if (!jsonString) return null;
    try {
        let cleanString = jsonString.trim();
        if (cleanString.startsWith("```json")) {
            cleanString = cleanString.substring(7);
            if (cleanString.endsWith("```")) {
                cleanString = cleanString.slice(0, -3);
            }
        }
        return JSON.parse(cleanString);
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
    onProgress: (message: string) => void,
    relevantTools: LLMTool[],
    settings: Partial<MenuSettings>,
    context: AiContext,
): Promise<AIResponse> => {
    onProgress(`Using ${model.provider} (${model.id})...`);
    const shortUserInput = userInput.length > 200 ? `${userInput.substring(0, 200)}...` : userInput;

    try {
        switch (model.provider) {
            case ModelProvider.GoogleAI: {
                onProgress(`Calling Gemini. Prompt: ${shortUserInput.replace(/\n/g, ' ')}`);
                const geminiResponse = await GeminiService.generateWithNativeTools(userInput, systemInstruction, model.id, relevantTools, settings, context);
                if (geminiResponse.toolCall) {
                    onProgress(`Gemini replied with tool: ${geminiResponse.toolCall.name}`);
                } else {
                    onProgress(`Gemini returned text response.`);
                }
                return geminiResponse;
            }

            case ModelProvider.OpenAI_API:
            case ModelProvider.Ollama: {
                if (relevantTools.length !== 1) {
                    throw new Error("This OpenAI/Ollama implementation currently supports exactly one tool.");
                }
                const tool = relevantTools[0];
                const paramsSchema = tool.parameters.map(p => `  "${p.name}": // type: ${p.type}, description: ${p.description}${p.required ? ' (required)' : ''}`).join('\n');
                const fullSystemInstruction = `${systemInstruction}\n\nYou MUST respond with a single, valid JSON object containing the arguments for the '${tool.name}' tool. Do not add any other text, explanation, or markdown formatting. The required arguments are:\n{\n${paramsSchema}\n}`;
    
                const userContent: any[] = [{ type: 'text', text: userInput }];
                 if (context.imageClip) {
                    userContent.push({
                        type: 'image_url',
                        image_url: { url: `data:${context.imageClip.mimeType};base64,${context.imageClip.data}` }
                    });
                    onProgress("Attached image to prompt.");
                }
                if (context.audioClip) {
                     if (model.provider === ModelProvider.Ollama) {
                        onProgress("Warning: Ollama provider doesn't support audio clips, ignoring.");
                     } else {
                        userContent.push({
                            type: 'image_url', // Using image_url for audio data URI as per convention for custom multimodal servers
                            image_url: { url: `data:${context.audioClip.mimeType};base64,${context.audioClip.data}` }
                        });
                        onProgress("Attached audio to prompt.");
                    }
                }

                let responseText = "{}";
                if (model.provider === ModelProvider.OpenAI_API) {
                    onProgress(`Calling OpenAI API. Prompt: ${shortUserInput.replace(/\n/g, ' ')}`);
                    responseText = await OpenAIService.generateJsonOutput(userContent, fullSystemInstruction, model.id, settings);
                    onProgress(`OpenAI response received.`);
                } else { // Ollama
                    onProgress(`Calling Ollama. Prompt: ${shortUserInput.replace(/\n/g, ' ')}`);
                    responseText = await OllamaService.generateJsonOutput(userContent, fullSystemInstruction, model.id, settings);
                    onProgress(`Ollama response received.`);
                }
    
                const parsedArgs = parseJsonOrNull(responseText);
                if (parsedArgs) {
                    onProgress(`Parsed args for tool: ${tool.name}`);
                    return { toolCall: { name: tool.name, arguments: parsedArgs } };
                }
                onProgress(`Failed to parse JSON for tool call.`);
                return { textResponse: responseText };
            }
    
            case ModelProvider.HuggingFace: {
                if (context.audioClip || context.imageClip) onProgress("Warning: This model provider does not support audio/image input. Analyzing text context only.");
                onProgress(`Loading local HuggingFace model...`);
                const toolsForPrompt = relevantTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
                const toolDefinitions = JSON.stringify(toolsForPrompt, null, 2);
                const fullSystemInstruction = `${systemInstruction}\n\n${STANDARD_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolDefinitions)}`;
                const responseText = await HuggingFaceService.generateJsonOutput(userInput, fullSystemInstruction, model.id, onProgress);
                onProgress(`HuggingFace response received.`);
                return parseToolCallResponse(responseText);
            }
    
            default:
                throw new Error(`Unsupported model provider: ${model.provider}`);
        }
    } catch (e) {
        const errorMsg = (e as Error).message;
        onProgress(`ERROR: ${errorMsg.substring(0, 150)}...`);
        throw e;
    }
};

// --- Application-Specific AI Logic ---

const menuSettingsProperties: { [key: string]: ToolParameter } = {
  playerInfluence: { name: 'playerInfluence', type: 'number', description: "User touch/motion influence. Range 0-1.", required: false },
  genreRuleInfluence: { name: 'genreRuleInfluence', type: 'number', description: "Influence of the base genre template. Range 0-1.", required: false },
  psySpectrumPosition: { name: 'psySpectrumPosition', type: 'number', description: "Blends between psytrance styles (chill/dub to progressive/full-on). Range 0-1.", required: true },
  darknessModifier: { name: 'darknessModifier', type: 'number', description: "Blends between light and dark styles. Range 0-1.", required: true },
  masterBPM: { name: 'masterBPM', type: 'number', description: "Master tempo in beats per minute. Typical psytrance is 135-150. Ambient is 60-90.", required: true },
  kickLevel: { name: 'kickLevel', type: 'number', description: "Kick drum volume. Range 0-1.", required: false },
  bassLevel: { name: 'bassLevel', type: 'number', description: "Bass volume. Range 0-1.", required: false },
  leadLevel: { name: 'leadLevel', type: 'number', description: "Lead synth volume. Range 0-1.", required: false },
  hatLevel: { name: 'hatLevel', type: 'number', description: "Hi-hat volume. Range 0-1.", required: false },
  snareLevel: { name: 'snareLevel', type: 'number', description: "Overall snare volume. Range 0-1.", required: false },
  delayMix: { name: 'delayMix', type: 'number', description: "Delay wet/dry mix. Range 0-1.", required: false },
  reverbMix: { name: 'reverbMix', type: 'number', description: "Reverb wet/dry mix. Range 0-1.", required: false },
};

const soundRefinementProperties: { [key: string]: ToolParameter } = {
    thought: { name: 'thought', type: 'string', description: "Your brief reasoning for the change you are making (e.g., 'The bass is muddy, I will reduce its decay').", required: true },
    masterBPM: { name: 'masterBPM', type: 'number', description: "Master tempo. Adjust slightly if needed. Typical range 135-150.", required: false },
    kickTune: { name: 'kickTune', type: 'number', description: "Kick pitch. Lower is deeper. Range 0-1.", required: false },
    kickPunch: { name: 'kickPunch', type: 'number', description: "Kick attack sharpness. Range 0-1.", required: false },
    kickLevel: { name: 'kickLevel', type: 'number', description: "Kick volume. Range 0-1.", required: false },
    bassCutoff: { name: 'bassCutoff', type: 'number', description: "Bass filter cutoff. Lower is darker/muddier. Range 0-1.", required: false },
    bassReso: { name: 'bassReso', type: 'number', description: "Bass filter resonance. Higher is more 'squelchy'. Range 0-1.", required: false },
    bassAmpDecay: { name: 'bassAmpDecay', type: 'number', description: "Bass note length. Higher is longer. Range 0.01-0.5.", required: false },
    bassLevel: { name: 'bassLevel', type: 'number', description: "Bass volume. Range 0-1.", required: false },
    leadCutoff: { name: 'leadCutoff', type: 'number', description: "Lead synth filter cutoff. Higher is brighter. Range 0-1.", required: false },
    leadReso: { name: 'leadReso', type: 'number', description: "Lead synth filter resonance. Range 0-1.", required: false },
    leadAmpDecay: { name: 'leadAmpDecay', type: 'number', description: "Lead synth note length. Higher is longer. Range 0.01-2.", required: false },
    leadLevel: { name: 'leadLevel', type: 'number', description: "Lead synth volume. Range 0-1.", required: false },
    delayMix: { name: 'delayMix', type: 'number', description: "Amount of delay effect. Range 0-1.", required: false },
    reverbMix: { name: 'reverbMix', type: 'number', description: "Amount of reverb effect. Range 0-1.", required: false },
};

const updateSoundParametersTool: LLMTool = {
    name: "update_sound_parameters",
    description: "Makes a specific, targeted adjustment to one or more synthesizer parameters to iteratively refine the sound.",
    parameters: Object.values(soundRefinementProperties)
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

export async function generateMusicSettings(prompt: string, model: AIModel, onProgress: (msg: string) => void, settings: Partial<MenuSettings>): Promise<Partial<MenuSettings>> {
    const systemInstruction = `You are an expert sound designer specializing in generative psytrance and ambient music. Your task is to generate a complete set of parameters for a complex synthesizer to match the user's request. Call the 'generate_music_settings' tool with the appropriate arguments. Be creative and bold with the parameters to create a unique sound.`;
    
    // For this tool, we don't need audio/image context.
    const emptyContext: AiContext = { mic: {} as any, motion: {} as any, hnmAnomaly: 0, currentSettings: {} };
    const response = await generateResponseWithTools(prompt, systemInstruction, model, onProgress, [generateMusicSettingsTool], settings, emptyContext);

    if (response.toolCall?.name === 'generate_music_settings' && response.toolCall.arguments) {
        return response.toolCall.arguments;
    }
    
    console.error("AI did not call the expected tool for music generation.", response);
    throw new Error("AI failed to generate music settings. The response was invalid.");
}

export async function getSoundRefinement(context: AiContext, model: AIModel, onProgress: (msg: string) => void, settings: Partial<MenuSettings>): Promise<(Partial<MenuSettings> & { thought: string; }) | null> {
    const systemInstruction = `You are an expert AI Sound Designer. Your goal is to iteratively refine the sound of a complex synthesizer to make it more musical, balanced, and interesting. You will be given multimodal context, including an image of the visuals and an audio clip of the current sound. Based on all available information, decide which one or two parameters to adjust to improve the sound. Call the 'update_sound_parameters' tool with ONLY the parameters you want to change and your reasoning in the 'thought' argument. Make small, subtle changes.`;

    const micEnergyDesc = context.mic.rhythmPeak > 0.6 ? 'high' : context.mic.rhythmPeak > 0.3 ? 'medium' : 'low';
    const hnmStabilityDesc = context.hnmAnomaly < 0.01 ? 'very stable' : context.hnmAnomaly < 0.05 ? 'stable' : 'chaotic';
    const currentParamsString = JSON.stringify(context.currentSettings);
    
    let prompt: string;
    if (context.audioClip || context.imageClip) {
        prompt = `CONTEXT:
- An audio clip and/or a visual snapshot of the current experience is provided. This is your PRIMARY source of truth. Please analyze it carefully.
- The sound's internal state is ${hnmStabilityDesc}.
- Ambient audio feedback: The detected rhythm is ${context.mic.rhythmTempo.toFixed(0)} BPM with ${micEnergyDesc} energy.
- For your reference, here is the text-based description of the synth parameters that a non-multimodal model would see. Use this for context or to confirm your analysis, but prioritize what you hear and see:
  - Current Parameters: ${currentParamsString}

ANALYSIS & ACTION:
Based PRIMARILY on the provided audio/visuals, what is a single, small adjustment that would improve the sound? Your goal is to make it more musical. For example, if the bass sounds muddy in the clip, reduce 'bassAmpDecay'. If the visuals are bright but the lead is dark, raise 'leadCutoff'. Justify your change in the 'thought' argument.`;
    } else {
        prompt = `CONTEXT:
- You are operating without multimodal input. Rely solely on this text description.
- Current State: The sound is ${hnmStabilityDesc}.
- Audio Feedback: The detected rhythm is ${context.mic.rhythmTempo.toFixed(0)} BPM with ${micEnergyDesc} energy.
- Current Parameters: ${currentParamsString}

ANALYSIS & ACTION:
Based on the text context, what is a single, small adjustment that would improve the sound? For example, if the bass is too loud, reduce 'bassLevel'. If the sound is too chaotic, maybe reduce a decay time or an LFO depth. Justify your change in the 'thought' argument.`;
    }

    const response = await generateResponseWithTools(prompt, systemInstruction, model, onProgress, [updateSoundParametersTool], settings, context);

    if (response.toolCall?.name === 'update_sound_parameters' && response.toolCall.arguments) {
        return response.toolCall.arguments;
    }
    
    console.error("AI did not call the expected tool for sound refinement.", response);
    return null;
}

export async function getGenreAdaptation(context: AiContext, model: AIModel, onProgress: (msg: string) => void, settings: Partial<MenuSettings>): Promise<{ psySpectrumPosition: number; darknessModifier: number } | null> {
    const systemInstruction = `You are an intelligent DJ assistant. Your goal is to subtly guide the musical genre. Based on the user's activity and environment (and multimodal context, if provided), call the 'get_genre_adaptation' tool to suggest a new target 'psySpectrumPosition' (0=chill, 1=full-on) and 'darknessModifier' (0=light, 1=dark).`;

    const micEnergyDesc = context.mic.rhythmPeak > 0.6 ? 'high' : context.mic.rhythmPeak > 0.3 ? 'medium' : 'low';
    const motionEnergyDesc = context.motion.rhythmPeak > 0.6 ? 'very active' : 'calm';

    const textContext = `
- Ambient Sound: ${context.mic.rhythmTempo.toFixed(0)} BPM, ${micEnergyDesc} energy.
- User Motion: ${motionEnergyDesc}.
- Current Synth Tempo: ${context.currentSettings.masterBPM?.toFixed(0)} BPM.`;

    let prompt: string;
    if (context.audioClip || context.imageClip) {
        prompt = `Context:
- An audio clip and/or visual snapshot of the current music is provided. Analyze its energy and mood as your PRIMARY source of truth.
- For reference, here is the text-based context a non-multimodal model would see:
${textContext}
Based PRIMARILY on the provided context, what is the ideal genre direction to shift towards?`;
    } else {
        prompt = `Context:
- You are operating without multimodal input. Rely solely on this text description.
${textContext}
Based on this text context, what is the ideal genre direction?`;
    }
    
    const response = await generateResponseWithTools(prompt, systemInstruction, model, onProgress, [getGenreAdaptationTool], settings, context);

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