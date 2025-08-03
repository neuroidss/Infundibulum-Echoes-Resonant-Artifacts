
import { useState, useCallback } from 'react';

export const useAppUI = () => {
    const [debugInfo, setDebugInfo] = useState('');
    const [warningInfo, setWarningInfo] = useState<{ message: string; visible: boolean }>({ message: 'Starting...', visible: true });
    const [loadingInfo, setLoadingInfo] = useState<{ message: string; progress: string; visible: boolean }>({ message: '', progress: '', visible: false });
    const [speechStatus, setSpeechStatus] = useState('Idle');
    const [isAiConfigModalVisible, setIsAiConfigModalVisible] = useState(false);

    const showWarning = useCallback((message: string, duration: number = 5000) => {
        setWarningInfo({ message, visible: true });
        if (duration > 0) {
            setTimeout(() => setWarningInfo(w => w.message === message ? { ...w, visible: false } : w), duration);
        }
    }, []);

    const hideWarning = useCallback(() => {
        setWarningInfo(w => ({ ...w, visible: false }));
    }, []);

    const showError = useCallback((message: string) => {
        setWarningInfo({ message: `FATAL: ${message}`, visible: true });
        console.error(`FATAL: ${message}`);
    }, []);

    const showLoading = useCallback((visible: boolean, message: string = '', progress: string = '') => {
        setLoadingInfo({ visible, message, progress });
    }, []);
    
    const toggleAiConfigModal = useCallback((forceState?: boolean) => {
        setIsAiConfigModalVisible(prev => typeof forceState === 'boolean' ? forceState : !prev);
    }, []);

    return {
        debugInfo, setDebugInfo,
        warningInfo, setWarningInfo, showWarning, hideWarning, showError,
        loadingInfo, setLoadingInfo, showLoading,
        speechStatus, setSpeechStatus,
        isAiConfigModalVisible, setIsAiConfigModalVisible, toggleAiConfigModal,
    };
};
