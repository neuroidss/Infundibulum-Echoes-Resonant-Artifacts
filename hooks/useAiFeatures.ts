

import { useRef, useCallback, useEffect } from 'react';
import type { MenuSettings, AiContext, AiContextItem } from '../types';
import { ModelProvider } from '../types';
import { AI_MODELS, TUNING_SCRIPTS } from '../constants';
import { generateMusicSettings, getSoundRefinement, transcribeSpectrogramData, getMusicAnalysis, generateMusicSettingsTool, morphToGenreTool, updateSoundParametersTool, analyzeMusicTool } from '../lib/ai';

interface UseAiFeaturesProps {
    menuSettings: MenuSettings;
    isAiDisabled: boolean;
    isInteractive: boolean;
    showWarning: (message: string, duration?: number) => void;
    showLoading: (visible: boolean, message?: string, progress?: string) => void;
    setMenuSettings: React.Dispatch<React.SetStateAction<MenuSettings>>;
    handleMenuSettingChange: <K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => void;
    smoothlyApplySettings: (targetParams: Partial<MenuSettings>, durationMs: number) => void;
    getInputState: () => Pick<AiContext, 'mic' | 'motion' | 'outputRhythm'>;
    getHnmAnomaly: () => number;
    captureMultimodalContext: (options?: { audio?: boolean; image?: boolean; spectrogram?: boolean; }) => Promise<{
        audioClip: { mimeType: string; data: string; } | null;
        imageClip: { mimeType: string; data: string; } | null;
        spectrogramClip: { mimeType: string; data: string; rawData: Uint8Array; } | null;
    }>;
}

export const useAiFeatures = ({
    menuSettings, isAiDisabled, isInteractive, showWarning, showLoading, setMenuSettings,
    handleMenuSettingChange, smoothlyApplySettings, getInputState, getHnmAnomaly, captureMultimodalContext,
}: UseAiFeaturesProps) => {

    const aiCopilotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isCopilotThinkingRef = useRef(false);
    const psyCoreModulatorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isPsyCoreModulatorRunning = useRef(false);
    const psyCoreModulatorStateRef = useRef<{ previousContext: AiContextItem | null, lastAction: Partial<MenuSettings> | null }>({ previousContext: null, lastAction: null });

    const handleAiProgress = useCallback((logMessage: string) => {
        handleMenuSettingChange('aiDebugLog', logMessage);
    }, [handleMenuSettingChange]);

    const handleAiGenerate = useCallback(async (prompt: string) => {
        if (isAiDisabled) {
            showWarning("AI Muse requires a configured AI model.", 5000);
            return;
        }
        if (!prompt) {
            showWarning("Please enter a description for the AI Muse.", 3000);
            return;
        }
        showLoading(true, "AI Muse is thinking...", "Generating soundscape...");
        
        try {
            const selectedModel = AI_MODELS.find(m => m.id === menuSettings.selectedModelId);
            if (!selectedModel) throw new Error("No valid AI model selected.");
            
            const { mic, motion, outputRhythm } = getInputState();
            const spectrogramText = transcribeSpectrogramData(null); // Passing null as there's no live data here

            const context: AiContext = {
                mic, motion, outputRhythm,
                hnmAnomaly: getHnmAnomaly(),
                currentSettings: menuSettings,
                spectrogramText
            };
            
            const systemInstruction = "You are an expert DJ and sound designer. You have two ways to respond: 1. Use the `generate_music_settings` tool to create a completely new sound from scratch based on the user's creative prompt. 2. Use the `morph_to_genre` tool to smoothly transition to a pre-defined, high-quality genre preset. Use the genre tool if the user's request directly and clearly maps to one of the available genres.";
            const toolsToUse = [generateMusicSettingsTool, morphToGenreTool];
            const aiResponse = await getMusicAnalysis(prompt, systemInstruction, selectedModel, handleAiProgress, menuSettings, context, toolsToUse);
            
            if (!aiResponse || !aiResponse.name) {
                throw new Error("AI did not return a valid tool call.");
            }
        
            const { name, arguments: args } = aiResponse;
            const duration = args.morphDurationMs && typeof args.morphDurationMs === 'number' ? args.morphDurationMs : 8000;
        
            switch (name) {
                case generateMusicSettingsTool.name: {
                    const { morphDurationMs, ...newSettings } = args;
                    smoothlyApplySettings(newSettings, duration);
                    setMenuSettings(prev => ({...prev, aiCallCount: (prev.aiCallCount || 0) + 1}));
                    showWarning("AI Muse has morphed the soundscape!", 4000);
                    break;
                }
                case morphToGenreTool.name: {
                    const genreName = args.genreName;
                    const script = TUNING_SCRIPTS['System']?.find(s => s.name === genreName);
                    if (script && script.steps[0]) {
                        smoothlyApplySettings(script.steps[0].params, duration);
                        setMenuSettings(prev => ({...prev, aiCallCount: (prev.aiCallCount || 0) + 1}));
                        showWarning(`AI Muse is morphing to ${genreName}...`, 4000);
                    } else {
                        throw new Error(`AI tried to use an unknown genre: ${genreName}`);
                    }
                    break;
                }
                default:
                    throw new Error(`AI returned an unknown tool: ${name}`);
            }

        } catch (error) {
            const errorMsg = (error as Error).message;
            console.error("AI Muse generation failed:", error);
            showWarning(`AI Muse failed: ${errorMsg}`, 5000);
        } finally {
            showLoading(false);
        }
    }, [showLoading, showWarning, menuSettings, isAiDisabled, handleAiProgress, setMenuSettings, getInputState, getHnmAnomaly, smoothlyApplySettings]);

    const handleCopilotRefine = useCallback(async () => {
        if (isCopilotThinkingRef.current || isAiDisabled) return;
        
        isCopilotThinkingRef.current = true;
        showLoading(true, 'Co-pilot is thinking...');
        
        try {
            const selectedModel = AI_MODELS.find(m => m.id === menuSettings.selectedModelId);
            if (!selectedModel) throw new Error("No AI model selected for Co-pilot.");

            const { audioClip, imageClip, spectrogramClip } = await captureMultimodalContext({
                audio: selectedModel.audioSupport,
                image: true,
                spectrogram: true,
            });
            if (selectedModel.audioSupport && !audioClip) showWarning("Failed to record audio clip, using fallback.", 3000);
            
            const { aiDebugLog, aiCopilotThought, ...currentRelevantSettings } = menuSettings;
            const { mic, motion, outputRhythm } = getInputState();
            
            const context: AiContext = {
                mic, motion, outputRhythm,
                hnmAnomaly: getHnmAnomaly(),
                currentSettings: currentRelevantSettings,
                audioClip, imageClip, spectrogramClip,
                spectrogramText: transcribeSpectrogramData(spectrogramClip?.rawData ?? null),
            };

            const result = await getSoundRefinement(context, selectedModel, handleAiProgress, menuSettings);
            
            if (result) {
                const thought = result.thought || "Co-pilot adjusted parameters.";
                const { thought: _t, morphDurationMs, ...paramsToUpdate } = result;
                const duration = typeof morphDurationMs === 'number' ? morphDurationMs : 4000;

                handleMenuSettingChange('aiCopilotThought', thought);
                if (Object.keys(paramsToUpdate).length > 0) {
                     smoothlyApplySettings(paramsToUpdate, duration);
                     setMenuSettings(prev => ({...prev, aiCallCount: (prev.aiCallCount || 0) + 1}));
                }
            } else {
                handleMenuSettingChange('aiCopilotThought', 'No changes suggested.');
            }
        } catch(e) {
            const errorMsg = (e as Error).message;
            console.error("Co-pilot refinement failed:", e);
            showWarning(`Co-pilot failed: ${errorMsg}`, 3000);
            handleMenuSettingChange('aiCopilotThought', 'Error during refinement.');
        } finally {
            isCopilotThinkingRef.current = false;
            showLoading(false);
        }
    }, [isAiDisabled, menuSettings, handleAiProgress, showWarning, showLoading, captureMultimodalContext, getInputState, getHnmAnomaly, handleMenuSettingChange, setMenuSettings, smoothlyApplySettings]);

    const runPsyCoreModulatorIteration = useCallback(async () => {
        if (isPsyCoreModulatorRunning.current || isAiDisabled) return;
        isPsyCoreModulatorRunning.current = true;
        
        showLoading(true, 'Psy-Core Modulator active...', 'Analyzing psyche...');
        
        try {
            const selectedModel = AI_MODELS.find(m => m.id === menuSettings.selectedModelId);
            if (!selectedModel) throw new Error("No AI model selected for Psy-Core Modulator.");
            
            const capturedContext = await captureMultimodalContext({ audio: selectedModel.audioSupport, image: true, spectrogram: true });
            const { mic, motion, outputRhythm } = getInputState();
            const hnmAnomaly = getHnmAnomaly();
            const { aiDebugLog, aiCopilotThought, ...currentRelevantSettings } = menuSettings;

            const currentContextItem: AiContextItem = {
                ...capturedContext,
                mic, motion, outputRhythm, hnmAnomaly,
                currentSettings: currentRelevantSettings,
                spectrogramText: transcribeSpectrogramData(capturedContext.spectrogramClip?.rawData ?? null),
            };
            
            const useLearningLoop = selectedModel.provider === ModelProvider.GoogleAI && selectedModel.audioSupport === true;

            const aiContext: AiContext = {
                ...currentContextItem,
                previousContext: useLearningLoop ? psyCoreModulatorStateRef.current.previousContext : null,
                lastAction: useLearningLoop ? psyCoreModulatorStateRef.current.lastAction : null,
            };

            const prompt = `Based on the user's current state (motion peak: ${motion.rhythmPeak.toFixed(2)}, sonic chaos/anomaly: ${hnmAnomaly.toFixed(2)}), generate a new soundscape that synergizes with and amplifies their state. If motion is high, increase energy. If chaos is high, make it more complex and interesting.`;
            
            const result = await generateMusicSettings(prompt, selectedModel, handleAiProgress, menuSettings, aiContext);
            const { morphDurationMs, ...newSettings } = result;
            const duration = typeof morphDurationMs === 'number' ? morphDurationMs : 10000;
            
            smoothlyApplySettings(newSettings, duration);
            setMenuSettings(prev => ({ ...prev, aiCallCount: (prev.aiCallCount || 0) + 1 }));
            
            psyCoreModulatorStateRef.current = {
                previousContext: currentContextItem,
                lastAction: newSettings,
            };
            
            showWarning("Psy-Core Modulator has evolved the vibe.", 4000);
    
        } catch (e) {
            const errorMsg = (e as Error).message;
            console.error("Psy-Core Modulator failed:", e);
            showWarning(`Psy-Core Modulator failed: ${errorMsg}`, 5000);
        } finally {
            isPsyCoreModulatorRunning.current = false;
            showLoading(false);
        }
    }, [isAiDisabled, menuSettings, showLoading, handleAiProgress, getInputState, getHnmAnomaly, setMenuSettings, showWarning, captureMultimodalContext, smoothlyApplySettings]);

    const handleEngineerAndAnalyze = useCallback(async (prompt: string) => {
        if (isAiDisabled) {
            showWarning("AI Engineer requires a configured AI model.", 5000);
            return;
        }
        if (!prompt.trim()) {
            showWarning("Please provide a goal for the AI Engineer.", 3000);
            return;
        }
    
        try {
            const selectedModel = AI_MODELS.find(m => m.id === menuSettings.selectedModelId);
            if (!selectedModel) throw new Error("No valid AI model selected.");
    
            // Step 1: Generate the best attempt
            showLoading(true, "AI Engineer: Generating attempt...", "Phase 1/3");
            const { mic, motion, outputRhythm } = getInputState();
            const genContext: AiContext = { mic, motion, outputRhythm, hnmAnomaly: getHnmAnomaly(), currentSettings: menuSettings, spectrogramText: '' };
            const genResult = await generateMusicSettings(prompt, selectedModel, handleAiProgress, menuSettings, genContext);
            const { morphDurationMs, ...newSettings } = genResult;
            
            // Apply settings immediately and count as one call
            setMenuSettings(prev => ({ ...prev, ...newSettings, aiCallCount: (prev.aiCallCount || 0) + 1 }));
    
            // Step 2: Wait for sound to play
            showLoading(true, "AI Engineer: Playing result...", "Phase 2/3");
            await new Promise(resolve => setTimeout(() => resolve(undefined), 5000));
    
            // Step 3: Capture and Analyze
            showLoading(true, "AI Engineer: Analyzing failure...", "Phase 3/3");
            const { audioClip, imageClip, spectrogramClip } = await captureMultimodalContext({
                audio: selectedModel.audioSupport, image: true, spectrogram: true,
            });
            
            const { aiDebugLog, aiCopilotThought, ...currentRelevantSettings } = menuSettings;
            const analysisContext: AiContext = {
                mic: getInputState().mic, motion: getInputState().motion, outputRhythm: getInputState().outputRhythm,
                hnmAnomaly: getHnmAnomaly(),
                currentSettings: currentRelevantSettings,
                audioClip, imageClip, spectrogramClip,
                spectrogramText: transcribeSpectrogramData(spectrogramClip?.rawData ?? null),
            };
            
            const analysisSystemInstruction = "You are a synthesizer engineer. Your task is to analyze why a sound generation attempt failed to meet the user's goal. You MUST use the 'summarize_synth_limitations' tool to report your findings.";
            const analysisResult = await getMusicAnalysis(prompt, analysisSystemInstruction, selectedModel, handleAiProgress, menuSettings, analysisContext, [analyzeMusicTool]);
            
            const report = `AI Engineer Report for Goal: "${prompt}"\n\nI failed to achieve this goal. Here are the technical limitations of the synth engine that prevented success:\n\n- ${analysisResult.arguments.limitations.join('\n- ')}`;
            handleMenuSettingChange('aiDebugLog', report);
            handleMenuSettingChange('showAiDebugLog', true);
            setMenuSettings(prev => ({ ...prev, aiCallCount: (prev.aiCallCount || 0) + 1 }));
    
        } catch (error) {
            const errorMsg = (error as Error).message;
            console.error("AI Engineer process failed:", error);
            showWarning(`AI Engineer failed: ${errorMsg}`, 5000);
        } finally {
            showLoading(false);
        }
    }, [isAiDisabled, menuSettings, showWarning, showLoading, handleAiProgress, setMenuSettings, getInputState, getHnmAnomaly, captureMultimodalContext, handleMenuSettingChange]);

    // Effect for AI Co-pilot interval
    useEffect(() => {
        if (menuSettings.enableAiCopilotMode && !isAiDisabled && isInteractive) {
            if (aiCopilotIntervalRef.current) clearInterval(aiCopilotIntervalRef.current);
            handleCopilotRefine(); // immediate refine
            aiCopilotIntervalRef.current = setInterval(handleCopilotRefine, 15000);
        } else {
            if (aiCopilotIntervalRef.current) {
                clearInterval(aiCopilotIntervalRef.current);
                aiCopilotIntervalRef.current = null;
            }
        }
        return () => {
            if (aiCopilotIntervalRef.current) clearInterval(aiCopilotIntervalRef.current);
        };
    }, [menuSettings.enableAiCopilotMode, isAiDisabled, isInteractive, handleCopilotRefine]);

    // Effect for Psy-Core Modulator interval
    useEffect(() => {
        if (menuSettings.enablePsyCoreModulatorMode && !isAiDisabled && isInteractive) {
            if (psyCoreModulatorIntervalRef.current) clearInterval(psyCoreModulatorIntervalRef.current);
            runPsyCoreModulatorIteration(); // run once immediately
            psyCoreModulatorIntervalRef.current = setInterval(runPsyCoreModulatorIteration, 18000); 
        } else {
            if (psyCoreModulatorIntervalRef.current) {
                clearInterval(psyCoreModulatorIntervalRef.current);
                psyCoreModulatorIntervalRef.current = null;
            }
            psyCoreModulatorStateRef.current = { previousContext: null, lastAction: null };
        }
        return () => {
            if (psyCoreModulatorIntervalRef.current) clearInterval(psyCoreModulatorIntervalRef.current);
        };
    }, [menuSettings.enablePsyCoreModulatorMode, isAiDisabled, isInteractive, runPsyCoreModulatorIteration]);


    return {
        handleAiGenerate,
        handleCopilotRefine,
        handleEngineerAndAnalyze,
    };
};