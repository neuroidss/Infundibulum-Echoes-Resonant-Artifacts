





import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { pipeline, env as xenovaEnv, TextGenerationPipeline } from '@xenova/transformers';
import type { MenuSettings, AIModel, LLMTool, AIResponse, ToolParameter, AiContext, AiContextItem } from '../types';
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

    const buildUserPartsFromContext = (userInput: string, context: AiContext) => {
        const userParts: Part[] = [];

        const addContextItemToParts = (item: AiContextItem, label: string) => {
            userParts.push({ text: `--- ${label} ---` });
            if (item.imageClip) {
                userParts.push({ inlineData: { mimeType: item.imageClip.mimeType, data: item.imageClip.data } });
            }
            if (item.spectrogramClip) {
                 userParts.push({ inlineData: { mimeType: item.spectrogramClip.mimeType, data: item.spectrogramClip.data } });
            }
            if (item.audioClip) {
                userParts.push({ inlineData: { mimeType: item.audioClip.mimeType, data: item.audioClip.data } });
            }
        };

        if (context.previousContext) {
            addContextItemToParts(context.previousContext, "PREVIOUS STATE (BEFORE YOUR LAST ACTION)");
        }
        
        addContextItemToParts(context, "CURRENT STATE (AFTER YOUR LAST ACTION)");

        userParts.push({ text: userInput });

        return userParts;
    }

    export const generateWithNativeTools = async (userInput: string, systemInstruction: string, modelId: string, relevantTools: LLMTool[], settings: Partial<MenuSettings>, context: AiContext): Promise<AIResponse> => {
        const ai = getAIClient(settings);
        const { functionDeclarations, toolNameMap } = buildGeminiTools(relevantTools);
        
        const userParts = buildUserPartsFromContext(userInput, context);
        
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

    export const generateJsonOutput = async (userInput: string | any[], systemInstruction: string, modelId: string, settings: Partial<MenuSettings>, toolForPrompt?: LLMTool): Promise<string> => {
        const apiKey = settings.openAiApiKey || process.env.OPENAI_API_KEY;
        const baseUrl = settings.openAiBaseUrl || process.env.OPENAI_BASE_URL;
        if (!apiKey) throw new Error("OpenAI API Key missing from GUI or environment variable OPENAI_API_KEY.");
        if (!baseUrl) throw new Error("OpenAI Base URL missing from GUI or environment variable OPENAI_BASE_URL.");

        let finalSystemInstruction = systemInstruction;
        if (toolForPrompt) {
            const paramsSchema = toolForPrompt.parameters.map(p => `  "${p.name}": // type: ${p.type}, description: ${p.description}${p.required ? ' (required)' : ''}`).join('\n');
            finalSystemInstruction = `${systemInstruction}\n\nYou MUST respond with a single, valid JSON object with the fields you want to update. Do not add any other text, explanation, or markdown formatting. Your entire response must be ONLY the JSON object.\n\nExample of a valid response, changing only bass level and providing a thought:\n{\n  "thought": "The bass is a bit weak, increasing it slightly.",\n  "bassLevel": 0.75\n}\n\nAvailable fields to include in your JSON response:\n{\n${paramsSchema}\n}`;
        }
        
        const body = {
            model: modelId,
            messages: [{ role: 'system', content: finalSystemInstruction }, { role: 'user', content: userInput }],
            temperature: 0.2,
            response_format: { type: 'json_object' }
        };
        const response = await fetchWithTimeout(
            `${(baseUrl).replace(/\/+$/, '')}/chat/completions`,
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(body) }
        );
        if (!response.ok) {
            let errorMessage = `OpenAI API Error (${response.status})`;
            try {
                const err = await response.json();
                if (err.error?.message) {
                    errorMessage += `: ${err.error.message}`;
                } else if (err.detail) {
                    errorMessage += `: ${JSON.stringify(err.detail)}`;
                } else {
                    errorMessage += `: ${JSON.stringify(err)}`;
                }
            } catch (e) {
                // Body might not be JSON, just append status text
                errorMessage += `: ${response.statusText}`;
            }
            throw new Error(errorMessage);
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
    
    export const generateJsonOutput = async (userInput: string | any[], systemInstruction: string, modelId: string, settings: Partial<MenuSettings>, toolForPrompt?: LLMTool): Promise<string> => {
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
        
        let finalSystemInstruction = systemInstruction;
        if (toolForPrompt) {
            const paramsSchema = toolForPrompt.parameters.map(p => `  "${p.name}": // type: ${p.type}, description: ${p.description}${p.required ? ' (required)' : ''}`).join('\n');
            finalSystemInstruction = `${systemInstruction}\n\nYou MUST respond with a single, valid JSON object with the fields you want to update. Do not add any other text, explanation, or markdown formatting. Your entire response must be ONLY the JSON object.\n\nExample of a valid response, changing only bass level and providing a thought:\n{\n  "thought": "The bass is a bit weak, increasing it slightly.",\n  "bassLevel": 0.75\n}\n\nAvailable fields to include in your JSON response:\n{\n${paramsSchema}\n}`;
        }

        const body: any = {
            model: modelId,
            system: finalSystemInstruction,
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
            let errText: string;
            try {
                const err = await response.json();
                errText = err.error || JSON.stringify(err);
            } catch (e) {
                errText = await response.text();
            }
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
        const assistantResponse = rawText.substring(prompt.length).trim() || '{}';
        
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

const buildOllamaPrompt = (userInput: string, context: AiContext, model: AIModel) => {
    const userContent: any[] = [];
    const addContextItemToPrompt = (item: AiContextItem, label: string) => {
        let textParts = [label];

        // The local Gemma server (via OpenAI_API provider) does not support images, but supports audio.
        // True Ollama might support images, but not audio via this format.
        if (model.provider !== ModelProvider.OpenAI_API) {
            if (item.imageClip) {
                userContent.push({ type: 'image_url', image_url: { url: `data:${item.imageClip.mimeType};base64,${item.imageClip.data}` } });
            }
            if (item.spectrogramClip) {
                 userContent.push({ type: 'image_url', image_url: { url: `data:${item.spectrogramClip.mimeType};base64,${item.spectrogramClip.data}` } });
            }
        }

        // Send audio clip if model supports it (specifically for our local Gemma server)
        if (item.audioClip && model.provider === ModelProvider.OpenAI_API) {
            userContent.push({ type: 'audio_url', audio_url: { url: `data:${item.audioClip.mimeType};base64,${item.audioClip.data}` } });
            textParts.push(`An audio clip was provided and is attached for analysis.`);
        } else if (item.audioClip) {
            textParts.push(`An audio clip was provided but not attached.`);
        }

        textParts.push(`Text Analysis of sound from spectrogram: ${item.spectrogramText}`);
        return textParts.join('\n');
    }

    let fullPrompt = "";
    if (context.previousContext) {
        fullPrompt += addContextItemToPrompt(context.previousContext, "--- PREVIOUS STATE (BEFORE YOUR LAST ACTION) ---");
        fullPrompt += "\n\n";
    }
    fullPrompt += addContextItemToPrompt(context, "--- CURRENT STATE (AFTER YOUR LAST ACTION) ---");
    fullPrompt += `\n\n${userInput}`;
    userContent.unshift({ type: 'text', text: fullPrompt });
    return userContent;
}


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
                const userContent = buildOllamaPrompt(userInput, context, model);

                let responseText = "{}";
                if (model.provider === ModelProvider.OpenAI_API) {
                    onProgress(`Calling OpenAI API. Prompt: ${shortUserInput.replace(/\n/g, ' ')}`);
                    responseText = await OpenAIService.generateJsonOutput(userContent, systemInstruction, model.id, settings, tool);
                    onProgress(`OpenAI response received.`);
                } else { // Ollama
                    onProgress(`Calling Ollama. Prompt: ${shortUserInput.replace(/\n/g, ' ')}`);
                    responseText = await OllamaService.generateJsonOutput(userContent, systemInstruction, model.id, settings, tool);
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
                if (context.audioClip || context.imageClip) onProgress("Warning: This model provider does not support audio/image input. Analyzing text only.");
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

export const transcribeSpectrogramData = (freqData: Uint8Array | null): string => {
    if (!freqData || freqData.length === 0) return 'No frequency data available.';
    
    const n = freqData.length;
    // Define frequency bands based on typical FFT output for music
    const subBassBand = freqData.slice(0, Math.floor(n * 0.05)); // ~0-100Hz
    const bassBand = freqData.slice(Math.floor(n * 0.05), Math.floor(n * 0.15)); // ~100-300Hz
    const lowMidsBand = freqData.slice(Math.floor(n * 0.15), Math.floor(n * 0.30)); // ~300-600Hz
    const midsBand = freqData.slice(Math.floor(n * 0.30), Math.floor(n * 0.50)); // ~600Hz-1kHz
    const highMidsBand = freqData.slice(Math.floor(n * 0.50), Math.floor(n * 0.75)); // ~1k-5kHz
    const highsBand = freqData.slice(Math.floor(n * 0.75)); // ~5k+

    const getBandEnergy = (band: Uint8Array): number => {
        if (band.length === 0) return 0;
        const sum = band.reduce((acc, val) => acc + val, 0);
        return sum / band.length;
    };
    
    const describeEnergy = (energy: number): string => {
        if (energy > 160) return 'very strong';
        if (energy > 110) return 'strong';
        if (energy > 60) return 'moderate';
        if (energy > 20) return 'present';
        return 'weak';
    };

    const subBassEnergy = getBandEnergy(subBassBand);
    const bassEnergy = getBandEnergy(bassBand);
    const lowMidsEnergy = getBandEnergy(lowMidsBand);
    const midsEnergy = getBandEnergy(midsBand);
    const highMidsEnergy = getBandEnergy(highMidsBand);
    const highsEnergy = getBandEnergy(highsBand);

    const description = `Frequency spectrum analysis:
- Sub-bass energy is ${describeEnergy(subBassEnergy)}.
- Bass energy is ${describeEnergy(bassEnergy)}.
- Low-mid energy is ${describeEnergy(lowMidsEnergy)}.
- Mid-range energy is ${describeEnergy(midsEnergy)}.
- High-mid energy is ${describeEnergy(highMidsEnergy)}.
- High-frequency (treble) energy is ${describeEnergy(highsEnergy)}.
`;
    return description;
};


const soundRefinementProperties: { [key: string]: ToolParameter } = {
    thought: { name: 'thought', type: 'string', description: "Your brief reasoning for the change you are making (e.g., 'The bass is muddy, I will reduce its decay').", required: true },
    masterBPM: { name: 'masterBPM', type: 'number', description: "Master tempo. Adjust slightly if needed. Typical range 135-150.", required: false },
    kickTune: { name: 'kickTune', type: 'number', description: "Kick pitch. Lower is deeper. Range 0-1.", required: false },
    kickPunch: { name: 'kickPunch', type: 'number', description: "Kick attack sharpness. Range 0-1.", required: false },
    kickDecay: { name: 'kickDecay', type: 'number', description: "Kick drum length/body. Range 0.01-1.", required: false },
    kickClick: { name: 'kickClick', type: 'number', description: "Amount of high-frequency 'click' in the kick. Range 0-1.", required: false },
    kickLevel: { name: 'kickLevel', type: 'number', description: "Kick volume. Range 0-1.", required: false },
    bassOscType: { name: 'bassOscType', type: 'number', description: "Bass oscillator type. 0 for Sawtooth, 1 for Square.", required: false },
    bassOctave: { name: 'bassOctave', type: 'number', description: "Bass pitch octave. Range 0-1.", required: false },
    bassCutoff: { name: 'bassCutoff', type: 'number', description: "Bass filter cutoff. Lower is darker/muddier. Range 0-1.", required: false },
    bassReso: { name: 'bassReso', type: 'number', description: "Bass filter resonance. Higher is more 'squelchy'. Range 0-1.", required: false },
    bassEnvAmt: { name: 'bassEnvAmt', type: 'number', description: "Amount the filter envelope affects the cutoff. Range 0-1.", required: false },
    bassFilterDecay: { name: 'bassFilterDecay', type: 'number', description: "How quickly the bass filter envelope closes. Range 0.01-0.5.", required: false },
    bassAmpDecay: { name: 'bassAmpDecay', type: 'number', description: "Bass note length. Higher is longer. Range 0.01-0.5.", required: false },
    bassFilterLfoRate: { name: 'bassFilterLfoRate', type: 'number', description: "Speed of the bass filter's wobble (LFO). Range 0-1.", required: false },
    bassFilterLfoDepth: { name: 'bassFilterLfoDepth', type: 'number', description: "Amount of the bass filter's wobble (LFO). Range 0-1.", required: false },
    bassLevel: { name: 'bassLevel', type: 'number', description: "Bass volume. Range 0-1.", required: false },
    leadOscType: { name: 'leadOscType', type: 'number', description: "Lead oscillator type. 0:Saw, 1:Square, 2:FMish.", required: false },
    leadOctave: { name: 'leadOctave', type: 'number', description: "Lead pitch octave. Range 0-1.", required: false },
    leadPW: { name: 'leadPW', type: 'number', description: "Pulse width for the Square oscillator. Range 0.05-0.95.", required: false },
    leadCutoff: { name: 'leadCutoff', type: 'number', description: "Lead synth filter cutoff. Higher is brighter. Range 0-1.", required: false },
    leadReso: { name: 'leadReso', type: 'number', description: "Lead synth filter resonance. Range 0-1.", required: false },
    leadEnvAmt: { name: 'leadEnvAmt', type: 'number', description: "Amount the filter envelope affects the lead cutoff. Range 0-1.", required: false },
    leadFilterDecay: { name: 'leadFilterDecay', type: 'number', description: "How quickly the lead filter envelope closes. Range 0.01-1.", required: false },
    leadAmpDecay: { name: 'leadAmpDecay', type: 'number', description: "Lead synth note length. Higher is longer. Range 0.01-2.", required: false },
    leadPitchLfoRate: { name: 'leadPitchLfoRate', type: 'number', description: "Speed of the lead pitch vibrato (LFO). Range 0-1.", required: false },
    leadPitchLfoDepth: { name: 'leadPitchLfoDepth', type: 'number', description: "Amount of the lead pitch vibrato (LFO). Range 0-1.", required: false },
    leadFilterLfoRate: { name: 'leadFilterLfoRate', type: 'number', description: "Speed of the lead filter wobble (LFO). Range 0-1.", required: false },
    leadFilterLfoDepth: { name: 'leadFilterLfoDepth', type: 'number', description: "Amount of the lead filter wobble (LFO). Range 0-1.", required: false },
    leadLevel: { name: 'leadLevel', type: 'number', description: "Lead synth volume. Range 0-1.", required: false },
    hatClosedDecay: { name: 'hatClosedDecay', type: 'number', description: "Decay time for closed hi-hats. Range 0.005-0.2.", required: false },
    hatOpenDecay: { name: 'hatOpenDecay', type: 'number', description: "Decay time for open hi-hats. Range 0.05-0.5.", required: false },
    hatHpfCutoff: { name: 'hatHpfCutoff', type: 'number', description: "High-pass filter for hats, making them thinner. Range 0.1-1.", required: false },
    hatTone: { name: 'hatTone', type: 'number', description: "Adjusts the tone/pitch of the hats. Range 0-1.", required: false },
    hatLevel: { name: 'hatLevel', type: 'number', description: "Hi-hat volume. Range 0-1.", required: false },
    snareNoiseLevel: { name: 'snareNoiseLevel', type: 'number', description: "Volume of the snare's noisy 'snap'. Range 0-1.", required: false },
    snareNoiseDecay: { name: 'snareNoiseDecay', type: 'number', description: "Length of the snare's noisy 'snap'. Range 0.01-0.3.", required: false },
    snareBodyTune: { name: 'snareBodyTune', type: 'number', description: "Pitch of the snare's tonal body. Range 0-1.", required: false },
    snareBodyDecay: { name: 'snareBodyDecay', type: 'number', description: "Length of the snare's tonal body. Range 0.01-0.5.", required: false },
    snareBodyLevel: { name: 'snareBodyLevel', type: 'number', description: "Volume of the snare's tonal body. Range 0-1.", required: false },
    snareLevel: { name: 'snareLevel', type: 'number', description: "Overall snare volume. Range 0-1.", required: false },
    noiseFxFiltType: { name: 'noiseFxFiltType', type: 'number', description: "Filter type for the noise FX sweep. 0:LP, 1:HP, 2:BP.", required: false },
    noiseFxCutoff: { name: 'noiseFxCutoff', type: 'number', description: "Cutoff frequency for the noise FX filter. Range 0.01-1.", required: false },
    noiseFxReso: { name: 'noiseFxReso', type: 'number', description: "Resonance for the noise FX filter. Range 0-1.", required: false },
    noiseFxLfoRate: { name: 'noiseFxLfoRate', type: 'number', description: "Speed of the noise FX filter's LFO sweep. Range 0-1.", required: false },
    noiseFxLfoDepth: { name: 'noiseFxLfoDepth', type: 'number', description: "Amount of the noise FX filter's LFO sweep. Range 0-1.", required: false },
    noiseFxLevel: { name: 'noiseFxLevel', type: 'number', description: "Volume of the noise FX. Range 0-1.", required: false },
    delayTimeMode: { name: 'delayTimeMode', type: 'number', description: "Delay time sync. 0:'1/16', 1:'1/8', 2:'3/16', 3:'1/4', 4:'1/2'.", required: false },
    delayFeedback: { name: 'delayFeedback', type: 'number', description: "Number of delay repeats. Range 0-0.98.", required: false },
    delayMix: { name: 'delayMix', type: 'number', description: "Amount of delay effect. Range 0-1.", required: false },
    reverbSize: { name: 'reverbSize', type: 'number', description: "Size of the reverb space. Range 0.1-1.", required: false },
    reverbDamp: { name: 'reverbDamp', type: 'number', description: "How much high frequencies are dampened in the reverb. Range 0-1.", required: false },
    reverbMix: { name: 'reverbMix', type: 'number', description: "Amount of reverb effect. Range 0-1.", required: false },
};

const fullSoundscapeProperties = (()=>{
    const props = {...soundRefinementProperties};
    delete (props as any).thought; // Not needed for generating a full soundscape
    
    // Set core genre properties as required for a full generation
    props.psySpectrumPosition = { name: 'psySpectrumPosition', type: 'number', description: "High-level genre blend. 0 is chill/dub, 1 is progressive/full-on.", required: true };
    props.darknessModifier = { name: 'darknessModifier', type: 'number', description: "High-level mood. 0 is light/melodic, 1 is dark/forest.", required: true };
    props.masterBPM = { name: 'masterBPM', type: 'number', description: "Master tempo in beats per minute. Range 60-220.", required: true };

    return props;
})();

const updateSoundParametersTool: LLMTool = {
    name: "update_sound_parameters",
    description: "Makes a specific, targeted adjustment to one or more synthesizer parameters to iteratively refine the sound.",
    parameters: Object.values(soundRefinementProperties)
};

const generateMusicSettingsTool: LLMTool = {
    name: "generate_music_settings",
    description: "Generates a complete set of synthesizer parameters to create a musical soundscape based on a user's descriptive prompt and other context.",
    parameters: Object.values(fullSoundscapeProperties)
};

const getGenreAdaptationTool: LLMTool = {
    name: "get_genre_adaptation",
    description: "Suggests a new musical genre direction based on real-time environmental and user-interaction data.",
    parameters: [
        { name: 'psySpectrumPosition', type: 'number', description: "A value from 0.0 (chill/dub) to 1.0 (full-on/aggressive psytrance).", required: true },
        { name: 'darknessModifier', type: 'number', description: "A value from 0.0 (light/melodic) to 1.0 (dark/forest).", required: true }
    ]
};

const buildContextualPrompt = (basePrompt: string, context: AiContext): string => {
    let contextualPrompt = "";

    const formatContextItem = (item: AiContextItem, label: string): string => {
        let parts: string[] = [`--- ${label} ---`];
        parts.push(`- Multimodal Context: The following audio/visuals/spectrograms are provided for your analysis.`);
        parts.push(`- Textual Analysis: ${item.spectrogramText}`);
        parts.push(`- Other Data: The user motion was ${item.motion.rhythmPeak > 0.6 ? 'active' : 'calm'}, and the sound's internal chaos (anomaly) was ${item.hnmAnomaly.toFixed(3)}.`);
        parts.push(`- Synth Parameters: ${JSON.stringify(item.currentSettings, null, 2)}`);
        return parts.join('\n');
    };

    if (context.previousContext) {
        contextualPrompt += formatContextItem(context.previousContext, "PREVIOUS STATE (BEFORE YOUR LAST ACTION)");
        contextualPrompt += `\n\n--- LAST ACTION TAKEN ---\n${JSON.stringify(context.lastAction, null, 2)}\n\n`;
    }

    contextualPrompt += formatContextItem(context, "CURRENT STATE (THE RESULT OF YOUR LAST ACTION)");
    contextualPrompt += `\n\n--- YOUR TASK ---\n${basePrompt}`;

    return contextualPrompt;
};

export async function generateMusicSettings(prompt: string, model: AIModel, onProgress: (msg: string) => void, settings: Partial<MenuSettings>, context: AiContext): Promise<Partial<MenuSettings>> {
    
    let systemInstruction: string;
    let finalPrompt = prompt;

    if (context.previousContext) {
        systemInstruction = "You are a consciousness-expanding AI in a learning loop. You are shown the context BEFORE and AFTER your last action. Your goal is to create a more intense, complex, and engaging psychedelic experience that synergizes with the user's state. Analyze the change. Did your last action help achieve this? Based on this, generate new parameters for the NEXT state by calling 'generate_music_settings' to further increase the depth and complexity of the experience.";
        finalPrompt = buildContextualPrompt(prompt, context);
    } else if (settings.enablePsyCoreModulatorMode) {
        systemInstruction = "You are a consciousness-expanding AI, a partner in sonic exploration using an on-device model like Gemma. Your goal is to create an intense, complex, and engaging psychedelic experience that synergizes with the user. Analyze the user's context: high motion indicates a desire for energy, high HNM anomaly indicates a desire for complexity. Call the 'generate_music_settings' tool to create a soundscape that amplifies the user's current state and pushes the boundaries of their perception.";
    } else {
        systemInstruction = "You are an expert sound designer specializing in generative psytrance. Your task is to generate a complete set of parameters for a synthesizer. Analyze the user's request and any provided context. You MUST call the 'generate_music_settings' tool with ALL the appropriate arguments to define a complete and unique sound. Be creative and bold.";
    }

    const response = await generateResponseWithTools(finalPrompt, systemInstruction, model, onProgress, [generateMusicSettingsTool], settings, context);

    if (response.toolCall?.name === 'generate_music_settings' && response.toolCall.arguments) {
        return response.toolCall.arguments;
    }
    
    console.error("AI did not call the expected tool for music generation.", response);
    throw new Error("AI failed to generate music settings. The response was invalid.");
}

export async function getSoundRefinement(context: AiContext, model: AIModel, onProgress: (msg: string) => void, settings: Partial<MenuSettings>): Promise<(Partial<MenuSettings> & { thought: string; }) | null> {
    const systemInstruction = `You are an expert AI Sound Designer specializing in complex, evolving psychedelic soundscapes. Your goal is to make the sound more intricate, surprising, and engaging. Analyze the multimodal context. Decide which one or two parameters to adjust to make the soundscape more psychedelic or texturally interesting. Call the 'update_sound_parameters' tool with ONLY the parameters you want to change and your reasoning in the 'thought' argument. Make bold, creative changes.`;

    const prompt = buildContextualPrompt("Based on the CURRENT STATE, what single, creative adjustment would make the sound more psychedelic and complex? Justify your change in the 'thought' argument.", context);
    
    const response = await generateResponseWithTools(prompt, systemInstruction, model, onProgress, [updateSoundParametersTool], settings, context);

    if (response.toolCall?.name === 'update_sound_parameters' && response.toolCall.arguments) {
        return response.toolCall.arguments;
    }
    
    console.error("AI did not call the expected tool for sound refinement.", response);
    return null;
}