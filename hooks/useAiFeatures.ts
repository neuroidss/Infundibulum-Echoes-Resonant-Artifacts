import { useRef, useCallback, useEffect } from 'react';
import type { MenuSettings, AiContext, AiContextItem } from '../types';
import { ModelProvider } from '../types';
import { AI_MODELS } from '../constants';
import { generateMusicSettings, getSoundRefinement, transcribeSpectrogramData } from '../lib/ai';

interface UseAiFeaturesProps {
    menuSettings: MenuSettings;
    isAiDisabled: boolean;
    showWarning: (message: string, duration?: number) => void;
    showLoading: (visible: boolean, message?: string, progress?: string) => void;
    setMenuSettings: React.Dispatch<React.SetStateAction<MenuSettings>>;
    handleMenuSettingChange: <K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => void;
    getInputState: () => Pick<AiContext, 'mic' | 'motion'>;
    getHnmAnomaly: () => number;
    captureMultimodalContext: (options?: { audio?: boolean; image?: boolean; spectrogram?: boolean; }) => Promise<{
        audioClip: { mimeType: string; data: string; } | null;
        imageClip: { mimeType: string; data: string; } | null;
        spectrogramClip: { mimeType: string; data: string; rawData: Uint8Array; } | null;
    }>;
}

export const useAiFeatures = ({
    menuSettings, isAiDisabled, showWarning, showLoading, setMenuSettings,
    handleMenuSettingChange, getInputState, getHnmAnomaly, captureMultimodalContext,
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
        handleAiProgress(`Muse: ${prompt.substring(0, 25)}...`);
        
        try {
            const selectedModel = AI_MODELS.find(m => m.id === menuSettings.selectedModelId);
            if (!selectedModel) throw new Error("No valid AI model selected.");
            
            // AI Muse is text-only, so pass a simple context.
            const { mic, motion } = getInputState();
            const context: AiContext = {
                mic,
                motion,
                hnmAnomaly: getHnmAnomaly(),
                currentSettings: menuSettings,
            };
            
            const newSettings = await generateMusicSettings(prompt, selectedModel, (msg) => handleAiProgress(`Muse: ${msg}`), menuSettings, context);
            setMenuSettings(prev => ({
                ...prev, 
                ...newSettings, 
                aiCallCount: (prev.aiCallCount || 0) + 1,
                aiDebugLog: "Muse: Success."
            }));
            showWarning("AI Muse has created a new soundscape!", 4000);
        } catch (error) {
            const errorMsg = (error as Error).message;
            console.error("AI Muse generation failed:", error);
            showWarning(`AI Muse failed: ${errorMsg}`, 5000);
            handleAiProgress(`Muse Error: ${errorMsg.substring(0, 40)}...`);
        } finally {
            showLoading(false);
        }
    }, [showLoading, showWarning, menuSettings, isAiDisabled, handleAiProgress, setMenuSettings, getInputState, getHnmAnomaly]);

    const handleCopilotRefine = useCallback(async () => {
        if (isCopilotThinkingRef.current || isAiDisabled) return;
        
        isCopilotThinkingRef.current = true;
        
        try {
            const selectedModel = AI_MODELS.find(m => m.id === menuSettings.selectedModelId);
            if (!selectedModel) throw new Error("No AI model selected for Co-pilot.");

            showLoading(true, 'Capturing context...');
            const { audioClip, imageClip, spectrogramClip } = await captureMultimodalContext({
                audio: selectedModel.audioSupport,
                image: true,
                spectrogram: true,
            });
            if (selectedModel.audioSupport && !audioClip) showWarning("Failed to record audio clip, using fallback.", 3000);
            
            showLoading(true, 'Co-pilot is thinking...');
            handleAiProgress("Co-pilot: Refining sound...");
            
            const { aiDebugLog, aiCopilotThought, ...currentRelevantSettings } = menuSettings;
            const { mic, motion } = getInputState();
            const spectrogramText = transcribeSpectrogramData(spectrogramClip?.rawData ?? null);

            const context: AiContext = {
                mic,
                motion,
                hnmAnomaly: getHnmAnomaly(),
                currentSettings: currentRelevantSettings,
                audioClip,
                imageClip,
                spectrogramClip,
                spectrogramText,
            };

            const result = await getSoundRefinement(context, selectedModel, (msg) => handleAiProgress(`Co-pilot: ${msg}`), menuSettings);
            
            if (result) {
                const thought = (result as any).thought || (result as any).reason || (result as any).explanation || "Co-pilot adjusted parameters.";
                const { thought: _t, reason: _r, explanation: _e, action: _a, ...paramsToUpdate } = result as any;

                if (thought && typeof thought === 'string') {
                    handleMenuSettingChange('aiCopilotThought', thought);
                }
                if (Object.keys(paramsToUpdate).length > 0) {
                     setMenuSettings(prev => ({...prev, ...paramsToUpdate, aiCallCount: (prev.aiCallCount || 0) + 1}));
                }
                handleAiProgress("Co-pilot: Refinement applied.");
            } else {
                handleAiProgress("Co-pilot: No refinement suggested.");
                handleMenuSettingChange('aiCopilotThought', 'No changes suggested.');
            }
        } catch(e) {
            const errorMsg = (e as Error).message;
            console.error("Co-pilot refinement failed:", e);
            showWarning(`Co-pilot failed: ${errorMsg}`, 3000);
            handleAiProgress(`Co-pilot Error: ${errorMsg.substring(0, 40)}...`);
            handleMenuSettingChange('aiCopilotThought', 'Error during refinement.');
        } finally {
            isCopilotThinkingRef.current = false;
            showLoading(false);
        }
    }, [isAiDisabled, menuSettings, handleAiProgress, showWarning, showLoading, captureMultimodalContext, getInputState, getHnmAnomaly, handleMenuSettingChange, setMenuSettings]);

    const runPsyCoreModulatorIteration = useCallback(async () => {
        if (isPsyCoreModulatorRunning.current || isAiDisabled) return;
        isPsyCoreModulatorRunning.current = true;
        
        showLoading(true, 'Psy-Core Modulator active...', 'Analyzing psyche...');
        handleAiProgress("Psy-Core: Analyzing current state...");
        
        try {
            const selectedModel = AI_MODELS.find(m => m.id === menuSettings.selectedModelId);
            if (!selectedModel) throw new Error("No AI model selected for Psy-Core Modulator.");
            
            const capturedContext = await captureMultimodalContext({ audio: true, image: true, spectrogram: true });
            const { mic, motion } = getInputState();
            const hnmAnomaly = getHnmAnomaly();
            const { aiDebugLog, aiCopilotThought, ...currentRelevantSettings } = menuSettings;

            const currentContextItem: AiContextItem = {
                ...capturedContext,
                mic,
                motion,
                hnmAnomaly,
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
            
            handleAiProgress(`Psy-Core Prompt: ${prompt}`);
            
            const newSettings = await generateMusicSettings(prompt, selectedModel, (msg) => handleAiProgress(`Psy-Core: ${msg}`), menuSettings, aiContext);
            
            setMenuSettings(prev => ({
                ...prev, 
                ...newSettings, 
                aiCallCount: (prev.aiCallCount || 0) + 1,
                aiDebugLog: "Psy-Core: New soundscape applied."
            }));
            
            psyCoreModulatorStateRef.current = {
                previousContext: currentContextItem,
                lastAction: newSettings,
            };
            
            showWarning("Psy-Core Modulator has evolved the vibe.", 4000);
    
        } catch (e) {
            const errorMsg = (e as Error).message;
            console.error("Psy-Core Modulator failed:", e);
            showWarning(`Psy-Core Modulator failed: ${errorMsg}`, 5000);
            handleAiProgress(`Psy-Core Error: ${errorMsg.substring(0, 40)}...`);
        } finally {
            isPsyCoreModulatorRunning.current = false;
            showLoading(false);
        }
    }, [isAiDisabled, menuSettings, showLoading, handleAiProgress, getInputState, getHnmAnomaly, setMenuSettings, showWarning, captureMultimodalContext]);

    // Effect for AI Co-pilot interval
    useEffect(() => {
        if (menuSettings.enableAiCopilotMode && !isAiDisabled) {
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
    }, [menuSettings.enableAiCopilotMode, isAiDisabled, handleCopilotRefine]);

    // Effect for Psy-Core Modulator interval
    useEffect(() => {
        if (menuSettings.enablePsyCoreModulatorMode && !isAiDisabled) {
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
    }, [menuSettings.enablePsyCoreModulatorMode, isAiDisabled, runPsyCoreModulatorIteration]);


    return {
        handleAiGenerate,
        handleCopilotRefine,
    };
};