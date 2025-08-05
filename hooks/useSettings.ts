import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    MenuSettings, GenreEditState, ModelProvider, AIModel
} from '../types';
import {
    DEFAULT_MENU_SETTINGS, GENRE_TARGET_STATES, VERSION,
    GENRE_EDIT_SLIDER_COUNT, GENRE_EDIT_SLIDER_MAPPING, STATE_VECTOR_SIZE,
    LOCAL_STORAGE_MENU_KEY, AI_MODELS
} from '../constants';
import { lerp } from '../lib/utils';

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
                    return combinedSettings;
                }
            } catch (e) {
                console.error("Failed to load saved menu settings", e);
            }
        }
        return DEFAULT_MENU_SETTINGS;
    });

    const [genreEditState, setGenreEditState] = useState<GenreEditState>({
        genreEdit_Selected: "PSY_CHILL",
        _genreEdit_tempState: new Array(STATE_VECTOR_SIZE).fill(0.5),
        ...Object.fromEntries(Array.from({ length: GENRE_EDIT_SLIDER_COUNT }, (_, i) => [`genreEdit_Param${i}`, 0.5])) as any
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

    const currentGenreRuleVector = useMemo(() => {
        const spectrumVal = menuSettings.psySpectrumPosition * 100;
        let baseLightGenre1Name: string, baseLightGenre2Name: string, interpLight: number;
        let baseDarkGenre1Name: string, baseDarkGenre2Name: string, interpDark: number;

        if (spectrumVal <= 33.33) { baseLightGenre1Name = "PSY_CHILL"; baseLightGenre2Name = "PSY_DUB"; interpLight = spectrumVal / 33.33; baseDarkGenre1Name = "DARK_PSY_CHILL"; baseDarkGenre2Name = "DARK_PSY_DUB"; interpDark = interpLight; }
        else if (spectrumVal <= 66.66) { baseLightGenre1Name = "PSY_DUB"; baseLightGenre2Name = "PSY_PROGRESSIVE"; interpLight = (spectrumVal - 33.33) / 33.33; baseDarkGenre1Name = "DARK_PSY_DUB"; baseDarkGenre2Name = "DARK_PSY_PROG"; interpDark = interpLight; }
        else { baseLightGenre1Name = "PSY_PROGRESSIVE"; baseLightGenre2Name = "PSY_FULLON"; interpLight = (spectrumVal - 66.66) / 33.34; baseDarkGenre1Name = "DARK_PSY_PROG"; baseDarkGenre2Name = "DARK_PSY"; interpDark = interpLight; }

        const baseLightGenre1 = GENRE_TARGET_STATES[baseLightGenre1Name];
        const baseLightGenre2 = GENRE_TARGET_STATES[baseLightGenre2Name];
        const baseDarkGenre1 = GENRE_TARGET_STATES[baseDarkGenre1Name];
        const baseDarkGenre2 = GENRE_TARGET_STATES[baseDarkGenre2Name];

        const lightContinuumVector = new Array(STATE_VECTOR_SIZE).fill(0).map((_, i) => lerp(baseLightGenre1[i], baseLightGenre2[i], interpLight));
        const darkContinuumVector = new Array(STATE_VECTOR_SIZE).fill(0).map((_, i) => lerp(baseDarkGenre1[i], baseDarkGenre2[i], interpDark));
        
        return new Array(STATE_VECTOR_SIZE).fill(0).map((_, i) => lerp(lightContinuumVector[i], darkContinuumVector[i], menuSettings.darknessModifier));
    }, [menuSettings.psySpectrumPosition, menuSettings.darknessModifier]);

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

    const handleGenreEditChange = useCallback((key: string, value: any) => {
        setGenreEditState(prev => ({...prev, [key]: value}));
    }, []);

    const loadSelectedGenreToSliders = useCallback(() => {
        const selectedGenreName = genreEditState.genreEdit_Selected;
        if (GENRE_TARGET_STATES[selectedGenreName]) {
            const genreState = GENRE_TARGET_STATES[selectedGenreName];
            const newEditState: Partial<GenreEditState> = { _genreEdit_tempState: [...genreState] };
            for (let i = 0; i < GENRE_EDIT_SLIDER_COUNT; i++) {
                const stateVectorIndex = GENRE_EDIT_SLIDER_MAPPING[i];
                newEditState[`genreEdit_Param${i}`] = genreState[stateVectorIndex];
            }
            setGenreEditState(prev => ({...prev, ...newEditState}));
            showWarning(`Loaded '${selectedGenreName}' to genre editor.`, 2000);
        } else { showError(`Genre '${selectedGenreName}' not found for editing.`); }
    }, [genreEditState.genreEdit_Selected, showError, showWarning]);

    const saveSlidersToSelectedGenre = useCallback(() => {
        const selectedGenreName = genreEditState.genreEdit_Selected;
        if (GENRE_TARGET_STATES[selectedGenreName]) {
            const targetGenreArray = GENRE_TARGET_STATES[selectedGenreName];
            for (let i = 0; i < GENRE_EDIT_SLIDER_COUNT; i++) {
                const stateVectorIndex = GENRE_EDIT_SLIDER_MAPPING[i];
                targetGenreArray[stateVectorIndex] = genreEditState[`genreEdit_Param${i}` as keyof GenreEditState] as number;
            }
            for(let i = 0; i < STATE_VECTOR_SIZE; i++) {
                if (!GENRE_EDIT_SLIDER_MAPPING.includes(i) && genreEditState._genreEdit_tempState[i] !== undefined) {
                    targetGenreArray[i] = genreEditState._genreEdit_tempState[i];
                }
            }
            showWarning(`Saved sliders to '${selectedGenreName}' (session only).`, 3000);
        } else { showError(`Genre '${selectedGenreName}' not found for saving.`); }
    }, [genreEditState, showError, showWarning]);

    return {
        menuSettings,
        setMenuSettings,
        genreEditState,
        handleMenuSettingChange,
        resetMenuSettingsToDefault,
        handleGenreEditChange,
        loadSelectedGenreToSliders,
        saveSlidersToSelectedGenre,
        currentGenreRuleVector,
        isAiDisabled
    };
};