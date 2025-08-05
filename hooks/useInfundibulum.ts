
import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { pipeline, AutomaticSpeechRecognitionPipeline } from '@xenova/transformers';
import {
    VERSION, STATE_VECTOR_SIZE, LOCAL_STORAGE_KEY, LOCAL_STORAGE_MENU_KEY,
    HNM_HIERARCHY_LEVEL_CONFIGS, HNM_POLICY_HEAD_INPUT_LEVEL_NAME,
    ARTIFACT_CREATION_INTERVAL_MS, ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MIN,
    ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MAX, ARTIFACT_SIMILARITY_THRESHOLD,
    MAX_ACTIVE_ARTIFACTS_LOGIC, REASONABLE_SHADER_ARTIFACT_CAP,
    HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM, HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM,
    TARGET_FPS
} from '../constants';
import { useSettings } from './useSettings';
import { useAppUI } from './useAppUI';
import { useIO } from './useIO';
import { useHnmAndRag } from './useHnmAndRag';
import { useRenderLoop } from './useAppLogic';
import { useAiFeatures } from './useAiFeatures';
import { PlaceholderInputProcessor } from '../lib/inputs';
import { tensorLerp } from '../lib/utils';
import { disposeMemStateWeights, disposeHnsResultsTensors } from '../lib/hnm_core_v1';

declare var tf: any;

export const useInfundibulum = (canvasRef: RefObject<HTMLCanvasElement>) => {
    const {
        debugInfo, setDebugInfo, warningInfo, setWarningInfo, showWarning, hideWarning,
        showError, loadingInfo, showLoading, speechStatus, setSpeechStatus,
        isAiConfigModalVisible, toggleAiConfigModal,
    } = useAppUI();
    
    const {
        menuSettings, setMenuSettings, genreEditState, handleMenuSettingChange,
        resetMenuSettingsToDefault, handleGenreEditChange, loadSelectedGenreToSliders,
        saveSlidersToSelectedGenre, currentGenreRuleVector, isAiDisabled,
    } = useSettings({ showWarning, showError });
    
    const io = useIO({
        onSpeechCommand: handleSpeechCommand,
        setSpeechStatus,
        showError,
        showWarning,
        getMenuSettings: () => menuSettings
    });

    const hnm = useHnmAndRag(showLoading);

    const ai = useAiFeatures({
        menuSettings,
        isAiDisabled,
        showWarning,
        showLoading,
        setMenuSettings,
        handleMenuSettingChange,
        getInputState: () => ({ mic: io.inputState.current.mic, motion: io.inputState.current.accelerometer }),
        getHnmAnomaly: () => hnm.lastL0Anomaly.current,
        captureMultimodalContext: io.captureMultimodalContext,
    });
    
    const renderLoop = useRenderLoop(
        canvasRef,
        () => menuSettings,
        () => io.inputState.current,
        () => ({
            currentResonantState: hnm.currentResonantState.current,
            activeArtifactInfo: hnm.activeArtifactInfo.current,
            lastL0Anomaly: hnm.lastL0Anomaly.current,
        }),
        io.updateAudioWorklet,
        setDebugInfo
    );

    const [isInitialized, setIsInitialized] = useState(false);
    const [isInstallingLocalAiScript, setIsInstallingLocalAiScript] = useState(false);
    const [isServerConnected, setIsServerConnected] = useState(false);
    const appState = useRef({
        inputProcessor: null as PlaceholderInputProcessor | null,
        lastArtifactCreationTime: 0,
        interactionOccurred: false,
        isSavingState: false,
    }).current;

    const saveStateToLocalStorage = useCallback(async () => {
        if (!appState.interactionOccurred || !hnm.currentResonantState.current || hnm.currentResonantState.current.isDisposed || !hnm.artifactManager.current || appState.isSavingState) return;
        appState.isSavingState = true;
        try {
            const stateArray = await hnm.currentResonantState.current.squeeze([0, 1]).data();
            const stateToSave = {
                resonantState: Array.from(stateArray),
                artifacts: hnm.artifactManager.current.artifacts,
                timestamp: Date.now(),
                version: VERSION
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (e) {
            console.error("Save state error:", e);
        } finally {
            appState.isSavingState = false;
        }
    }, [appState, hnm]);
    
    const resetHnmRag = useCallback(() => {
        showWarning("Resetting HNM/RAG State...", 1500);
        io.speechController.current?.stopListening();
        sessionStorage.setItem('hnm_rag_reset_just_occurred', 'true');
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        localStorage.removeItem(LOCAL_STORAGE_MENU_KEY);
        setTimeout(() => window.location.reload(), 500);
    }, [showWarning, io.speechController]);
    
    function handleSpeechCommand(command: string) {
        switch (command) {
            case 'CREATE':
                createArtifact();
                break;
            case 'FORGET_OLDEST':
                if (hnm.artifactManager.current?.forgetOldestArtifact()) {
                    io.triggerVisualFeedback(0.3, 0.2);
                    saveStateToLocalStorage();
                }
                break;
            case 'RESET':
                resetHnmRag();
                break;
        }
    }
    
    const createArtifact = useCallback(async () => {
        const now = Date.now();
        if (now - appState.lastArtifactCreationTime < ARTIFACT_CREATION_INTERVAL_MS) return;

        const complexity = hnm.lastL0Anomaly.current;
        if (complexity < ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MIN || complexity > ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MAX) return;

        if (hnm.artifactManager.current) {
            const [created, artifact] = await hnm.artifactManager.current.createArtifact(hnm.currentResonantState.current, hnm.embeddingsReady);
            if (created) {
                appState.lastArtifactCreationTime = now;
                io.triggerVisualFeedback(0.6, 0.2);
                saveStateToLocalStorage();
            }
        }
    }, [appState, hnm, io.triggerVisualFeedback, saveStateToLocalStorage]);


    const handleTrainOnArtifacts = useCallback(async () => {
        if (!menuSettings.enableHnmTraining) {
            showWarning("HNM Training is disabled in settings.", 3000);
            return;
        }
        
        renderLoop.stop();
        await new Promise(resolve => setTimeout(resolve, 100));
    
        try {
            await hnm.trainOnArtifacts(menuSettings.hnmLearningRate, menuSettings.hnmWeightDecay);
            showWarning("HNM training complete.", 3000);
        } catch(e: any) {
            showError(`Training failed: ${e.message}`);
        } finally {
            showLoading(false);
            renderLoop.start();
        }
    }, [menuSettings.enableHnmTraining, menuSettings.hnmLearningRate, menuSettings.hnmWeightDecay, hnm, renderLoop, showWarning, showError, showLoading]);

    // --- Local AI Server Logic ---
    const logLocalAiEvent = useCallback((log: string) => {
        setMenuSettings(prev => ({
            ...prev,
            localAiStatus: {
                ...prev.localAiStatus,
                logs: [...prev.localAiStatus.logs.slice(-50), log]
            }
        }));
    }, [setMenuSettings]);
    
    const executeServerTool = useCallback(async (toolName: string) => {
        if (!isServerConnected) {
            throw new Error("Backend server not connected.");
        }
        const response = await fetch('http://localhost:3001/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: toolName, arguments: {} })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Failed to execute server tool '${toolName}'.`);
        }
        return result;
    }, [isServerConnected]);

    const initialPollDone = useRef(false);
    const pollLocalAiStatus = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:3001/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Get Local AI Server Status', arguments: {} }),
                signal: AbortSignal.timeout(4000), // Add a timeout to prevent hanging
            });

            if (!response.ok) {
                let errorMsg = `Server returned status ${response.status}`;
                try {
                    const errBody = await response.json();
                    errorMsg = errBody.error || errorMsg;
                } catch {}
                throw new Error(errorMsg);
            }
            const result = await response.json();
            if (result.error) {
                throw new Error(result.error);
            }

            setIsServerConnected(wasConnected => {
                if (!wasConnected) {
                    logLocalAiEvent("Backend server connected.");
                }
                return true;
            });

            setMenuSettings(p => ({
                ...p,
                localAiStatus: { 
                    isRunning: result.isRunning, 
                    logs: result.logs 
                }
            }));
        } catch (e) {
            setIsServerConnected(wasConnected => {
                if (wasConnected) {
                    logLocalAiEvent("Backend server connection lost.");
                } else if (!initialPollDone.current) {
                    logLocalAiEvent("Backend server NOT connected. Run 'start.sh' in /server to use Local AI features.");
                }
                // If connection is lost, we can't be sure about the server state.
                // Setting isRunning to false is a safe assumption for the UI.
                setMenuSettings(p => ({
                    ...p,
                    localAiStatus: { ...p.localAiStatus, isRunning: false }
                }));
                return false;
            });
        } finally {
            initialPollDone.current = true;
        }
    }, [logLocalAiEvent, setMenuSettings]);

    const handleInstallGemmaScript = useCallback(async () => {
        if (!isServerConnected) {
            showWarning("Backend server not connected.", 3000);
            return;
        }
        setIsInstallingLocalAiScript(true);
        logLocalAiEvent("Action: Installing server script...");
        try {
            const result = await executeServerTool("Install Gemma Script");
            logLocalAiEvent(`SUCCESS: ${result.message}`);
            showWarning("Gemma server script installed/updated on backend.", 3000);
        } catch (e: any) {
            logLocalAiEvent(`ERROR: ${e.message}`);
            showError(`Failed to install script: ${e.message}`);
        } finally {
            setIsInstallingLocalAiScript(false);
        }
    }, [isServerConnected, logLocalAiEvent, showError, showWarning, executeServerTool]);

    const handleStartLocalAiServer = useCallback(async () => {
        logLocalAiEvent("Action: Starting local AI server...");
        showLoading(true, "Starting local AI server...");
        try {
            const result = await executeServerTool("Start Local AI Server");
            logLocalAiEvent(`SUCCESS: ${result.message}`);
        } catch (e: any) {
            logLocalAiEvent(`ERROR: ${e.message}`);
            if (!e.message?.includes('already running')) {
                showError(`Start failed: ${e.message}`);
            } else {
                logLocalAiEvent("Server was already running. Syncing status.");
            }
        } finally {
            await pollLocalAiStatus();
            showLoading(false);
        }
    }, [executeServerTool, logLocalAiEvent, showError, showLoading, pollLocalAiStatus]);

    const handleStopLocalAiServer = useCallback(async () => {
        logLocalAiEvent("Action: Stopping local AI server...");
        showLoading(true, "Stopping local AI server...");
        try {
            const result = await executeServerTool("Stop Local AI Server");
            logLocalAiEvent(`SUCCESS: ${result.message}`);
        } catch (e: any) {
            logLocalAiEvent(`ERROR: ${e.message}`);
            if (!e.message?.includes('not running')) {
                showError(`Stop failed: ${e.message}`);
            } else {
                logLocalAiEvent("Server was not running. Syncing status.");
            }
        } finally {
            await pollLocalAiStatus();
            showLoading(false);
        }
    }, [executeServerTool, logLocalAiEvent, showError, pollLocalAiStatus, showLoading]);
    
    const handleTestLocalAi = useCallback(async (audioBlob: Blob) => {
        if (!menuSettings.localAiStatus.isRunning) {
            throw new Error("Local AI Server is not running.");
        }
        logLocalAiEvent("Client Test: Sending audio to local Gemma server...");

        try {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            await new Promise<void>((resolve, reject) => {
                reader.onloadend = async () => {
                    try {
                        const base64Audio = reader.result as string;
                        const body = {
                            model: 'local/gemma-multimodal',
                            messages: [
                                { role: 'user', content: [
                                    { type: 'text', text: 'Transcribe this audio.' },
                                    { type: 'audio_url', audio_url: { url: base64Audio } }
                                ]}
                            ]
                        };
                        const response = await fetch('http://localhost:8008/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.detail || result.error?.message || 'Test request failed');
                        
                        const transcription = result.choices[0]?.message?.content || 'No transcription found.';
                        logLocalAiEvent(`LOCAL AI SERVER RESPONSE:\n"${transcription.trim()}"`);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                };
                reader.onerror = (e) => reject(new Error("Failed to read audio blob."));
            });
        } catch (e: any) {
            const errorMsg = `Local AI server test failed: ${e.message}. Is it running on port 8008?`;
            logLocalAiEvent(`ERROR: ${errorMsg}`);
            throw new Error(errorMsg);
        }
    }, [menuSettings.localAiStatus.isRunning, logLocalAiEvent]);

    const gameLogicDependencies = useRef({ hnm, appState, io, menuSettings, currentGenreRuleVector });
    gameLogicDependencies.current = { hnm, appState, io, menuSettings, currentGenreRuleVector };

    const gameStep = useCallback(async () => {
        const { hnm, appState, io, menuSettings, currentGenreRuleVector } = gameLogicDependencies.current;
        if (!hnm.hnmSystem.current || !appState.inputProcessor) return;

        const hnmStepPackage = tf.tidy(() => {
            const sensoryInputTensor = appState.inputProcessor!.process(io.inputState.current, io.inputState.current.currentTime);

            const artifactSignal = hnm.projectArtifactsToExternalSignal(hnm.activeArtifactInfo.current, HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM);
            const genreRuleSignal = tf.tensor1d(currentGenreRuleVector).reshape([1, 1, HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM]);
            
            const micDiffMag = Math.abs(io.inputState.current.mic.rhythmPeak - io.inputState.current.accelerometer.rhythmPeak);
            const externalL0SignalRaw = hnm.currentResonantState.current.squeeze().mul(micDiffMag * menuSettings.micFeedbackToL0Strength);
            const externalL0Signal = externalL0SignalRaw.reshape([1,1,HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM]);

            const externalSignals = {
                [HNM_HIERARCHY_LEVEL_CONFIGS[0].external_input_config!.source_signal_name]: externalL0Signal,
                [HNM_HIERARCHY_LEVEL_CONFIGS[1].external_input_config!.source_signal_name]: genreRuleSignal,
            };

            const stepResult = hnm.hnmSystem.current!.step(
                hnm.hnmMemoryStates.current,
                hnm.hnmLastStepOutputs.current,
                { [HNM_HIERARCHY_LEVEL_CONFIGS[0].name]: sensoryInputTensor },
                externalSignals,
                true
            );

            artifactSignal.dispose();
            // externalL0SignalRaw is not a separate tensor, it is the result of the mul which is externalL0Signal before reshape. TFJS manages it.
            return stepResult;
        });

        // Update state from step
        hnm.hnmMemoryStates.current.forEach(disposeMemStateWeights);
        hnm.hnmLastStepOutputs.current = hnmStepPackage.newlyRetrievedValues;
        hnm.hnmMemoryStates.current = hnmStepPackage.nextBotStates;
        
        const policyHeadOutput = hnmStepPackage.newlyRetrievedValues[HNM_POLICY_HEAD_INPUT_LEVEL_NAME]?.retrievedVal;
        if (policyHeadOutput && !policyHeadOutput.isDisposed) {
            const explorationFactor = menuSettings.explorationInfluence * hnm.lastL0Anomaly.current;
            const newResonantState = tf.tidy(() => {
                const noise = tf.randomUniform(policyHeadOutput.shape, -1, 1).mul(explorationFactor);
                return policyHeadOutput.add(noise).clipByValue(0,1);
            });
            
            const blendedState = tf.tidy(() => tensorLerp(
                hnm.currentResonantState.current, 
                newResonantState, 
                menuSettings.playerInfluence
            ));
            newResonantState.dispose();
            
            hnm.currentResonantState.current?.dispose();
            hnm.currentResonantState.current = tf.keep(blendedState);
        }

        // RAG update
        hnm.activeArtifactInfo.current = await hnm.artifactManager.current!.findRelevantArtifacts(hnm.currentResonantState.current, hnm.embeddingsReady, ARTIFACT_SIMILARITY_THRESHOLD, MAX_ACTIVE_ARTIFACTS_LOGIC);
        
        // Cleanup
        const l0AnomalyTensor = hnmStepPackage.anomalies['L0_IntentProcessing'];
        hnm.lastL0Anomaly.current = (await l0AnomalyTensor.data())[0];
        disposeHnsResultsTensors(hnmStepPackage);

    }, []);
    
    // Main Initialization
    useEffect(() => {
        let isMounted = true;
        
        const init = async () => {
            if (!isMounted) return;
            showLoading(true, "Initializing...", "Loading TFJS backend...");
            await tf.ready();
            await tf.setBackend('webgl');

            appState.inputProcessor = new PlaceholderInputProcessor(STATE_VECTOR_SIZE, STATE_VECTOR_SIZE);
            await hnm.initialize();
            
            const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedStateJSON) {
                try {
                    const saved = JSON.parse(savedStateJSON);
                    if (saved.version === VERSION) {
                       hnm.loadState(saved.artifacts, saved.resonantState);
                    }
                } catch (e) { console.error("Error loading saved state:", e); }
            }

            io.initialize(canvasRef.current!, handleInteractionStart);
            
            showLoading(false);
            setWarningInfo({ message: 'Interact to begin.', visible: true });
            setIsInitialized(true);
        };

        const handleInteractionStart = async () => {
            if (appState.interactionOccurred) return;
            appState.interactionOccurred = true;

            const audioReady = await io.initAudio();
            if(audioReady) io.speechController.current?.startListening();

            hideWarning();
            renderLoop.start();
            setInterval(gameStep, 1000 / TARGET_FPS);
            setInterval(saveStateToLocalStorage, 15000);
            setInterval(createArtifact, ARTIFACT_CREATION_INTERVAL_MS);
        };
        
        init().catch(err => {
            showError(`Initialization failed: ${err.message}`);
            showLoading(false);
        });

        pollLocalAiStatus();
        const statusInterval = setInterval(pollLocalAiStatus, 5000);

        return () => { 
            isMounted = false; 
            renderLoop.stop(); 
            hnm.reset(); 
            clearInterval(statusInterval);
        };
    }, []);

    return {
        debugInfo,
        warningInfo,
        loadingInfo,
        speechStatus,
        isInitialized,
        isAiDisabled,
        menuSettings,
        handleMenuSettingChange,
        resetMenuSettingsToDefault,
        resetHnmRag,
        genreEditState,
        handleGenreEditChange,
        loadSelectedGenreToSliders,
        saveSlidersToSelectedGenre,
        handleAiGenerate: ai.handleAiGenerate,
        isAiConfigModalVisible,
        toggleAiConfigModal,
        handleAiConfigSubmit: (cfg) => setMenuSettings(p => ({...p, ...cfg})),
        handleCopilotRefine: ai.handleCopilotRefine,
        handleTrainOnArtifacts,
        // Local AI Server methods
        handleInstallGemmaScript,
        handleStartLocalAiServer,
        handleStopLocalAiServer,
        handleTestLocalAi,
        isInstallingLocalAiScript,
        isServerConnected,
    };
};
