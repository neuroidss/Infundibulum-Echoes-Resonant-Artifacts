
import { GoogleGenAI, Type } from "@google/genai";
import { pipeline, env as xenovaEnv, TextGenerationPipeline } from '@xenova/transformers';
import type { MenuSettings, AIModel, LLMTool, ToolParameter, AiContext, AiContextItem } from '../types';
import { ModelProvider } from '../types';
import { STANDARD_TOOL_CALL_SYSTEM_PROMPT } from '../constants';
import type { Part } from "@google/genai";

// --- Utility to parse JSON from AI response ---
const parseJsonOrNull = (jsonString: string): any => {
    if (!jsonString) return null;
    try {
        let cleanString = jsonString.trim();
        // Handle markdown code blocks
        if (cleanString.startsWith("```json")) {
            cleanString = cleanString.substring(7, cleanString.lastIndexOf("```")).trim();
        } else if (cleanString.startsWith("`")) {
            cleanString = cleanString.replace(/^`+|`+$/g, '').trim();
        }
        return JSON.parse(cleanString);
    } catch (e) {
        console.error("Failed to parse JSON response:", jsonString, e);
        return null;
    }
};

// --- Unified Prompt Generation for Multimodal context ---
const buildUnifiedUserInput = (userInput: string, context: AiContext, model: AIModel): { textPrompt: string, multiModalParts: any[] } => {
    const textParts: string[] = [];
    const multiModalParts: any[] = [];

    const addContextItemToPrompt = (item: AiContextItem, label: string) => {
        textParts.push(`\n--- ${label} ---`);
        textParts.push(`- Textual Analysis of Sound: ${item.spectrogramText}`);
        textParts.push(`- User State: Motion was ${item.motion.rhythmPeak > 0.6 ? 'active' : 'calm'}, and sound chaos (HNM anomaly) was ${item.hnmAnomaly.toFixed(3)}.`);
        textParts.push(`- Output Music State: Current BPM is ${item.outputRhythm.bpm.toFixed(1)}, rhythmic density is ${item.outputRhythm.density.toFixed(2)}.`);

        // Handle multimodal parts based on provider
        if (model.provider === ModelProvider.GoogleAI) {
            if (item.imageClip) multiModalParts.push({ inlineData: { mimeType: item.imageClip.mimeType, data: item.imageClip.data } });
            if (item.spectrogramClip) multiModalParts.push({ inlineData: { mimeType: item.spectrogramClip.mimeType, data: item.spectrogramClip.data } });
            if (item.audioClip && model.audioSupport) {
                multiModalParts.push({ inlineData: { mimeType: item.audioClip.mimeType, data: item.audioClip.data } });
                textParts.push(`- An audio clip is attached for direct analysis.`);
            }
        } else if (model.provider === ModelProvider.OpenAI_API || model.provider === ModelProvider.Ollama) {
            if (item.imageClip) multiModalParts.push({ type: 'image_url', image_url: { url: `data:${item.imageClip.mimeType};base64,${item.imageClip.data}` }});
            if (item.spectrogramClip) multiModalParts.push({ type: 'image_url', image_url: { url: `data:${item.spectrogramClip.mimeType};base64,${item.spectrogramClip.data}` }});
            if (item.audioClip && model.audioSupport) {
                multiModalParts.push({ type: 'audio_url', audio_url: { url: `data:${item.audioClip.mimeType};base64,${item.audioClip.data}` }});
                textParts.push(`- An audio clip is attached for direct analysis.`);
            }
        }
    };

    if (context.previousContext) {
        addContextItemToPrompt(context.previousContext, "PREVIOUS STATE (BEFORE YOUR LAST ACTION)");
        if (context.lastAction) {
            textParts.push(`\n--- LAST ACTION TAKEN ---\n${JSON.stringify(context.lastAction, null, 2)}`);
        }
    }
    addContextItemToPrompt(context, "CURRENT STATE");
    textParts.push(`\n--- YOUR TASK ---\n${userInput}`);
    
    return { textPrompt: textParts.join('\n'), multiModalParts };
}

// --- Provider-Specific Services ---
abstract class BaseAiService {
    protected TIMEOUT = 120000;
    protected fetchWithTimeout(url: string, options: RequestInit) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), this.TIMEOUT);
        return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
    }
}

class GeminiService extends BaseAiService {
    private getAIClient(settings: Partial<MenuSettings>): GoogleGenAI {
        const apiKey = settings.googleApiKey || process.env.API_KEY;
        if (!apiKey) throw new Error("Google AI API Key not provided.");
        return new GoogleGenAI({ apiKey });
    }
    
    async callTool(userContent: Part[], systemInstruction: string, modelId: string, settings: Partial<MenuSettings>, tool: LLMTool): Promise<any> {
        const ai = this.getAIClient(settings);
        const properties: { [key: string]: any } = {};
        const required: string[] = [];
        tool.parameters.forEach(p => {
            properties[p.name] = { type: p.type as Type, description: p.description };
            if (p.required) required.push(p.name);
        });

        const functionName = tool.name.replace(/[^a-zA-Z0-9_]/g, '_');
        const googleTool = { functionDeclarations: [{ name: functionName, description: tool.description, parameters: { type: Type.OBJECT, properties, required } }] };

        const response = await ai.models.generateContent({
            model: modelId,
            contents: [{ role: 'user', parts: userContent }],
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2,
                tools: [googleTool],
            },
        });
        
        const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
        if (call?.name === functionName) {
            return call.args;
        }
        
        const text = response.text?.trim();
        const parsed = text ? parseJsonOrNull(text) : null;
        if (parsed) return parsed;

        throw new Error("Gemini did not return a valid tool call or JSON.");
    }
}

class OpenAIService extends BaseAiService {
     async callTool(userContent: any[], systemInstruction: string, modelId: string, settings: Partial<MenuSettings>, tool: LLMTool): Promise<any> {
        const apiKey = settings.openAiApiKey || process.env.OPENAI_API_KEY;
        const baseUrl = settings.openAiBaseUrl || process.env.OPENAI_BASE_URL;
        if (!apiKey || !baseUrl) throw new Error("OpenAI API Key or Base URL missing.");

        const properties: { [key: string]: any } = {};
        const required: string[] = [];
        tool.parameters.forEach(p => {
            properties[p.name] = { type: p.type, description: p.description };
            if(p.type === 'array' && p.items) properties[p.name].items = { type: (p.items as any).type };
            if (p.required) required.push(p.name);
        });
        const openAiTool = { type: 'function', function: { name: tool.name, description: tool.description, parameters: { type: 'object', properties, required } } };

        const body = {
            model: modelId,
            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: userContent }],
            tools: [openAiTool],
            tool_choice: { type: "function", function: { name: tool.name } },
            temperature: 0.2,
        };

        const response = await this.fetchWithTimeout(
            `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(body) }
        );

        if (!response.ok) {
             let errorMessage = `OpenAI API Error (${response.status})`;
            try { const err = await response.json(); errorMessage += `: ${err.error?.message || JSON.stringify(err.detail) || JSON.stringify(err)}`; } 
            catch { errorMessage += `: ${response.statusText}`; }
            throw new Error(errorMessage);
        }
        const data = await response.json();
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

        if (toolCall?.function?.name === tool.name) {
            try {
                return JSON.parse(toolCall.function.arguments);
            } catch (e) { throw new Error(`OpenAI tool call arguments were not valid JSON: ${toolCall.function.arguments}`); }
        }
        
        const textContent = data.choices?.[0]?.message?.content?.trim();
        const parsed = textContent ? parseJsonOrNull(textContent) : null;
        if (parsed) return parsed;
        
        throw new Error("OpenAI-compatible API did not return a valid tool call or JSON content.");
    }
}

class OllamaService extends BaseAiService {
    async callTool(userContent: any, systemInstruction: string, modelId: string, settings: Partial<MenuSettings>, tool: LLMTool): Promise<any> {
        const host = settings.ollamaHost || process.env.OLLAMA_HOST;
        if (!host) throw new Error("Ollama Host URL missing.");
        
        const paramsSchema = tool.parameters.map(p => `  "${p.name}": // type: ${p.type}, description: "${p.description}"${p.required ? ' (required)' : ''}`).join(',\n');
        const finalSystemInstruction = `${systemInstruction}\n\nYou MUST respond with a single, valid JSON object that adheres to the following structure. Do not add any other text, explanation, or markdown formatting. Your entire response must be ONLY the JSON object.\n\nJSON Schema:\n{\n${paramsSchema}\n}`;
        
        const body: any = { model: modelId, system: finalSystemInstruction, prompt: userContent.text, stream: false, format: 'json', options: { temperature: 0.2 } };
        if (userContent.images.length > 0) body.images = userContent.images;

        const response = await this.fetchWithTimeout(`${host.replace(/\/+$/, '')}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) { let errText; try { const err = await response.json(); errText = err.error || JSON.stringify(err); } catch { errText = await response.text(); } throw new Error(`Ollama Error ${response.status}: ${errText}`); }
        const data = await response.json();
        const jsonString = data.response || '{}';

        const parsed = parseJsonOrNull(jsonString);
        if (!parsed) throw new Error("Ollama provider returned invalid or empty JSON.");
        return parsed;
    }
}


class HuggingFaceService extends BaseAiService {
    private generator: TextGenerationPipeline | null = null;
    private currentModelId: string | null = null;

    private async getPipeline(modelId: string, onProgress: (message: string) => void): Promise<TextGenerationPipeline> {
        if (this.generator && this.currentModelId === modelId) return this.generator;
        onProgress(`Initializing model: ${modelId}...`);
        if (this.generator) await this.generator.dispose();
        
        xenovaEnv.allowLocalModels = false;
        
        this.generator = await pipeline('text-generation', modelId, { 
            progress_callback: (p: any) => {
                const { status, file, progress, total, loaded } = p;
                if (status === 'progress' && progress > 0 && total > 0) onProgress(`Loading ${file}: ${Math.round(progress)}% (${(loaded/1e6).toFixed(1)}MB)`);
                else if (status !== 'progress') onProgress(`Status: ${status}...`);
            }
        }) as TextGenerationPipeline;
        this.currentModelId = modelId;
        onProgress(`Model ${modelId} loaded.`);
        return this.generator;
    }
    
    async callTool(userInput: string, systemInstruction: string, modelId: string, onProgress: (message: string) => void, tool: LLMTool): Promise<any> {
        const pipe = await this.getPipeline(modelId, onProgress);
        const toolJson = JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters.map(({ name, type, description, required }) => ({ name, type, description, required })) });
        const fullSystemInstruction = `${systemInstruction}\n\n${STANDARD_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolJson)}`;
        const prompt = `<|system|>\n${fullSystemInstruction}<|end|>\n<|user|>\n${userInput}<|end|>\n<|assistant|>`;
        
        const outputs = await pipe(prompt, { max_new_tokens: 2048, temperature: 0.2, do_sample: true, top_k: 50 });
        const rawText = (outputs[0] as any).generated_text;
        const assistantResponse = rawText.substring(prompt.length).trim() || '{}';
        
        const parsed = parseJsonOrNull(assistantResponse);
        if (!parsed) throw new Error("HuggingFace model returned invalid or empty JSON.");
        return parsed.arguments || parsed; // Return arguments if available, else the whole object
    }
}


// --- Service Instantiation & Main Dispatcher ---
const geminiService = new GeminiService();
const openAiService = new OpenAIService();
const ollamaService = new OllamaService();
const huggingFaceService = new HuggingFaceService();

export const callAiAndGetJson = async (
    userInput: string,
    systemInstruction: string,
    model: AIModel,
    onProgress: (message: string) => void,
    tool: LLMTool,
    settings: Partial<MenuSettings>,
    context: AiContext,
): Promise<any> => {
    onProgress(`Using ${model.provider} (${model.id})...`);
    const { textPrompt, multiModalParts } = buildUnifiedUserInput(userInput, context, model);
    const shortPrompt = textPrompt.length > 200 ? `${textPrompt.substring(0, 200)}...` : textPrompt;
    onProgress(`Calling ${model.provider}. Prompt: ${shortPrompt.replace(/\n/g, ' ')}`);

    try {
        switch (model.provider) {
            case ModelProvider.GoogleAI: {
                const geminiParts: Part[] = [{ text: textPrompt }, ...multiModalParts];
                const result = await geminiService.callTool(geminiParts, systemInstruction, model.id, settings, tool);
                onProgress(`Gemini response received.`);
                return result;
            }
            case ModelProvider.OpenAI_API: {
                const openAiParts = [{ type: 'text', text: textPrompt }, ...multiModalParts];
                const result = await openAiService.callTool(openAiParts, systemInstruction, model.id, settings, tool);
                onProgress(`OpenAI API response received.`);
                return result;
            }
            case ModelProvider.Ollama: {
                 const images = multiModalParts.filter(p => p.type === 'image_url').map(p => p.image_url.url.split(',')[1]);
                 const result = await ollamaService.callTool({ text: textPrompt, images }, systemInstruction, model.id, settings, tool);
                 onProgress(`Ollama response received.`);
                 return result;
            }
            case ModelProvider.HuggingFace: {
                if (context.audioClip || context.imageClip) onProgress("Warning: This model does not support audio/image input. Analyzing text only.");
                const result = await huggingFaceService.callTool(textPrompt, systemInstruction, model.id, onProgress, tool);
                onProgress(`HuggingFace response received.`);
                return result;
            }
            default:
                throw new Error(`Unsupported model provider: ${model.provider}`);
        }
    } catch(e: any) {
        onProgress(`ERROR: ${e.message}`);
        throw e;
    }
};


// --- Application-Specific AI Logic ---

export const transcribeSpectrogramData = (freqData: Uint8Array | null): string => {
    if (!freqData || freqData.length === 0) return 'No frequency data available.';
    
    const n = freqData.length;
    const subBassBand = freqData.slice(0, Math.floor(n * 0.05)); // ~0-100Hz
    const bassBand = freqData.slice(Math.floor(n * 0.05), Math.floor(n * 0.15)); // ~100-300Hz
    const lowMidsBand = freqData.slice(Math.floor(n * 0.15), Math.floor(n * 0.30)); // ~300-600Hz
    const midsBand = freqData.slice(Math.floor(n * 0.30), Math.floor(n * 0.50)); // ~600Hz-1kHz
    const highMidsBand = freqData.slice(Math.floor(n * 0.50), Math.floor(n * 0.75)); // ~1k-5kHz
    const highsBand = freqData.slice(Math.floor(n * 0.75)); // ~5k+

    const getBandEnergy = (band: Uint8Array): number => !band || band.length === 0 ? 0 : band.reduce((acc, val) => acc + val, 0) / band.length;
    const describeEnergy = (energy: number): string => {
        if (energy > 160) return 'very strong'; if (energy > 110) return 'strong';
        if (energy > 60) return 'moderate'; if (energy > 20) return 'present';
        return 'weak';
    };

    return `Freq Analysis - Sub-bass: ${describeEnergy(getBandEnergy(subBassBand))}, Bass: ${describeEnergy(getBandEnergy(bassBand))}, Mids: ${describeEnergy(getBandEnergy(midsBand))}, Highs: ${describeEnergy(getBandEnergy(highsBand))}`;
};

const soundRefinementProperties: { [key: string]: ToolParameter } = {
    thought: { name: 'thought', type: 'string', description: "Your brief reasoning for the change you are making (e.g., 'The bass is muddy, I will reduce its decay').", required: true },
    energyLevel: { name: 'energyLevel', type: 'number', description: "Overall energy. Affects tempo and pattern density. Range 0-1.", required: false },
    harmonicComplexity: { name: 'harmonicComplexity', type: 'number', description: "Generates more intricate, chaotic melodies. Range 0-1.", required: false },
    mood: { name: 'mood', type: 'number', description: "Musical mood. 0: Light, 1: Twilight, 2: Dark.", required: false },
    kickPatternDensity: { name: 'kickPatternDensity', type: 'number', description: "Kick drum pattern density. Range 0-1.", required: false },
    bassCutoff: { name: 'bassCutoff', type: 'number', description: "Bass filter cutoff. Lower is darker. Range 0-1.", required: false },
    acidCutoff: { name: 'acidCutoff', type: 'number', description: "Acid synth filter cutoff. Higher is brighter. Range 0-1.", required: false },
    atmosLevel: { name: 'atmosLevel', type: 'number', description: "Volume of the atmospheric pad. Range 0-1.", required: false },
    reverbMix: { name: 'reverbMix', type: 'number', description: "Amount of reverb effect. Range 0-1.", required: false },
    reverbShimmer: { name: 'reverbShimmer', type: 'number', description: "Amount of ethereal, pitch-shifted reverb. Range 0-1.", required: false },
};

const fullSoundscapeProperties = (()=>{
    const props = {...soundRefinementProperties};
    delete (props as any).thought;
    props.energyLevel.required = true;
    props.harmonicComplexity.required = true;
    props.mood.required = true;
    return props;
})();

const updateSoundParametersTool: LLMTool = { name: "update_sound_parameters", description: "Makes a targeted adjustment to musical parameters.", parameters: Object.values(soundRefinementProperties) };
const generateMusicSettingsTool: LLMTool = { name: "generate_music_settings", description: "Generates a complete set of musical parameters based on a user's prompt.", parameters: Object.values(fullSoundscapeProperties) };

export async function generateMusicSettings(prompt: string, model: AIModel, onProgress: (msg: string) => void, settings: Partial<MenuSettings>, context: AiContext): Promise<Partial<MenuSettings>> {
    let systemInstruction: string;
    const baseSystemInstruction = "You are an expert sound designer for a deterministic chaotic synthesizer. Your task is to set the *baseline* parameters which are then modulated in real-time by a neural net based on user biofeedback. Your goal is to provide a solid creative foundation.";

    if (context.previousContext) {
        systemInstruction = "You are an AI in a learning loop. Analyze the context BEFORE and AFTER your last action. Did your last action help create a more intense, complex, and engaging psychedelic experience? Based on this, generate a complete set of new baseline parameters to further increase the depth of the experience.";
    } else if (settings.enablePsyCoreModulatorMode) {
        systemInstruction = `${baseSystemInstruction} As a Psy-Core Modulator, your goal is to create an intense psychedelic experience that synergizes with the user. Analyze their context: high motion indicates a desire for energy, high sonic chaos indicates a desire for complexity. Generate a baseline that amplifies the user's state.`;
    } else {
        systemInstruction = `${baseSystemInstruction} Analyze the user's request and any provided context. You MUST generate a complete and unique sound by providing ALL required parameters.`;
    }

    try {
        return await callAiAndGetJson(prompt, systemInstruction, model, onProgress, generateMusicSettingsTool, settings, context);
    } catch (e) {
        console.error("AI did not generate valid music settings.", e);
        throw new Error(`AI failed to generate music settings. ${(e as Error).message}`);
    }
}

export async function getSoundRefinement(context: AiContext, model: AIModel, onProgress: (msg: string) => void, settings: Partial<MenuSettings>): Promise<(Partial<MenuSettings> & { thought: string; }) | null> {
    const systemInstruction = `You are an AI Sound Designer. Your goal is to make the sound more intricate and engaging. Analyze the multimodal context. Decide which one or two baseline parameters to adjust. Make bold, creative changes. Justify your change in the 'thought' field.`;
    const prompt = "Based on the CURRENT STATE, what single, creative adjustment would make the sound more psychedelic and complex?";
    
    try {
        const result = await callAiAndGetJson(prompt, systemInstruction, model, onProgress, updateSoundParametersTool, settings, context);
        if (result && result.thought) {
            return result;
        }
        return null;
    } catch (e) {
         console.error("AI did not suggest a valid refinement.", e);
         return null;
    }
}
