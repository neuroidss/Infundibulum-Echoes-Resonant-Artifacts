

import { useRef, useCallback, useEffect } from 'react';
import type { MenuSettings, AiContext } from '../types';
import { AI_MODELS } from '../constants';
import { generateMusicSettings, getSoundRefinement, getGenreAdaptation } from '../lib/ai';

interface UseAiFeaturesProps {
    menuSettings: MenuSettings;
    isAiDisabled: boolean;
    showWarning: (message: string, duration?: number) => void;
    showLoading: (visible: boolean, message?: string, progress?: string) => void;
    setMenuSettings: React.Dispatch<React.SetStateAction<MenuSettings>>;
    handleMenuSettingChange: <K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => void;
    getInputState: () => Pick<AiContext, 'mic' | 'motion'>;
    getHnmAnomaly: () => number;
    captureAudioClip: () => Promise<{ mimeType: string, data: string } | null>;
    captureImageClip: () => { mimeType: string, data: string } | null;
}

export const useAiFeatures = ({
    menuSettings, isAiDisabled, showWarning, showLoading, setMenuSettings,
    handleMenuSettingChange, getInputState, getHnmAnomaly, captureAudioClip, captureImageClip
}: UseAiFeaturesProps) => {

    const aiCopilotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isCopilotThinkingRef = useRef(false);

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
            
            const newSettings = await generateMusicSettings(prompt, selectedModel, (msg) => handleAiProgress(`Muse: ${msg}`), menuSettings);
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
    }, [showLoading, showWarning, menuSettings, isAiDisabled, handleAiProgress, setMenuSettings]);

    const handleCopilotRefine = useCallback(async () => {
        if (isCopilotThinkingRef.current || isAiDisabled) return;
        
        isCopilotThinkingRef.current = true;
        
        try {
            const selectedModel = AI_MODELS.find(m => m.id === menuSettings.selectedModelId);
            if (!selectedModel) throw new Error("No AI model selected for Co-pilot.");

            let audioClip: { mimeType: string; data: string } | null = null;
            let imageClip: { mimeType: string; data: string } | null = null;

            if (selectedModel.audioSupport) { // Assume models with audio also benefit from image
                showLoading(true, 'Capturing context...');
                audioClip = await captureAudioClip();
                imageClip = captureImageClip();
                if (!audioClip) showWarning("Failed to record audio clip, using fallback.", 3000);
            }
            
            showLoading(true, 'Co-pilot is thinking...');
            handleAiProgress("Co-pilot: Refining sound...");
            
            const { aiDebugLog, aiCopilotThought, ...currentRelevantSettings } = menuSettings;
            const { mic, motion } = getInputState();
            const context: AiContext = {
                mic,
                motion,
                hnmAnomaly: getHnmAnomaly(),
                currentSettings: currentRelevantSettings,
                audioClip,
                imageClip,
            };

            const result = await getSoundRefinement(context, selectedModel, (msg) => handleAiProgress(`Co-pilot: ${msg}`), menuSettings);
            
            if (result) {
                const { thought, ...paramsToUpdate } = result;
                if (thought) {
                    handleMenuSettingChange('aiCopilotThought', thought as string);
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
    }, [isAiDisabled, menuSettings, handleAiProgress, showWarning, showLoading, captureAudioClip, captureImageClip, getInputState, getHnmAnomaly, handleMenuSettingChange, setMenuSettings]);

    // This effect manages the Co-pilot interval
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

    // This effect manages the Genre-Adapt logic
    useEffect(() => {
        // This is a placeholder for where the genre-adapt interval logic would go
        // For simplicity in this refactor, the logic is kept minimal.
        if (menuSettings.enableGenreAdaptMode && !isAiDisabled) {
             handleAiProgress("Adapt: Mode enabled.");
        } else {
             handleAiProgress("Adapt: Mode disabled.");
        }
    }, [menuSettings.enableGenreAdaptMode, isAiDisabled, handleAiProgress]);


    return {
        handleAiGenerate,
        handleCopilotRefine,
    };
};