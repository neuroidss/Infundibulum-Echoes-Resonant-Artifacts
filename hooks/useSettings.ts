
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    MenuSettings, ModelProvider
} from '../types';
import {
    DEFAULT_MENU_SETTINGS, VERSION,
    LOCAL_STORAGE_MENU_KEY, AI_MODELS
} from '../constants';

interface UseSettingsProps {
    showWarning: (message: string, duration?: number) => void;
    showError: (message: string) => void;
}

export const useSettings = ({ showWarning, showError }: UseSettingsProps) => {
    const [menuSettings, setMenuSettings] = useState<MenuSettings>(() => {
        const saved = localStorage.getItem(LOCAL_STORAGE_MENU_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.version === VERSION && data.settings) {
                    // Make sure new settings from code update are included
                    const combinedSettings = { ...DEFAULT_MENU_SETTINGS, ...data.settings };
                    // Clean up deprecated settings
                    delete (combinedSettings as any).enableGenreAdaptMode;
                    delete (combinedSettings as any).enableAiVibeProducerMode;
                    delete (combinedSettings as any).enableWellnessWeaverMode;
                    delete (combinedSettings as any).genreRuleInfluence; // Now hnmModulationDepth
                    return combinedSettings;
                }
            } catch (e) {
                console.error("Failed to load saved menu settings", e);
            }
        }
        return DEFAULT_MENU_SETTINGS;
    });

    const isAiDisabled = useMemo(() => {
        const selectedModel = AI_MODELS.find(m => m.id === menuSettings.selectedModelId);
        if (!selectedModel) return true;
        
        switch (selectedModel.provider) {
            case ModelProvider.GoogleAI:
                return !(menuSettings.googleApiKey || process.env.API_KEY);
            case ModelProvider.OpenAI_API:
                return !((menuSettings.openAiApiKey || process.env.OPENAI_API_KEY) && (menuSettings.openAiBaseUrl || process.env.OPENAI_BASE_URL));
            case ModelProvider.Ollama:
                return !(menuSettings.ollamaHost || process.env.OLLAMA_HOST);
            case ModelProvider.HuggingFace:
                return false; // Always available
            default:
                return true;
        }
    }, [menuSettings.selectedModelId, menuSettings.googleApiKey, menuSettings.openAiApiKey, menuSettings.openAiBaseUrl, menuSettings.ollamaHost]);

    const saveMenuSettings = useCallback(() => {
        try {
            const dataToSave = { version: VERSION, settings: menuSettings };
            localStorage.setItem(LOCAL_STORAGE_MENU_KEY, JSON.stringify(dataToSave));
        } catch (e) { console.error("Error saving menu settings", e); }
    }, [menuSettings]);

    useEffect(() => {
        saveMenuSettings();
    }, [menuSettings, saveMenuSettings]);

    const handleMenuSettingChange = useCallback(<K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => {
        setMenuSettings(prev => ({ ...prev, [key]: value }));
    }, []);

    const resetMenuSettingsToDefault = useCallback(() => {
        const { selectedModelId, googleApiKey, openAiApiKey, openAiBaseUrl, ollamaHost, ...defaults } = DEFAULT_MENU_SETTINGS;
        setMenuSettings(prev => ({ ...prev, ...defaults }));
        showWarning("Menu settings reset to default.", 2000);
    }, [showWarning]);

    return {
        menuSettings,
        setMenuSettings,
        handleMenuSettingChange,
        resetMenuSettingsToDefault,
        isAiDisabled
    };
};
