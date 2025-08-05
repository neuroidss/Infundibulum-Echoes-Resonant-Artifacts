
import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { pipeline, AutomaticSpeechRecognitionPipeline } from '@xenova/transformers';
import {
    VERSION, STATE_VECTOR_SIZE, LOCAL_STORAGE_KEY, LOCAL_STORAGE_MENU_KEY,
    HNM_HIERARCHY_LEVEL_CONFIGS, HNM_POLICY_HEAD_INPUT_LEVEL_NAME,
    ARTIFACT_CREATION_INTERVAL_MS, ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MIN,
    ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MAX, ARTIFACT_SIMILARITY_THRESHOLD,
    MAX_ACTIVE_ARTIFACTS_LOGIC, 
    HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM, HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM,
    TARGET_FPS,
    ARTIFACT_CREATION_SYNC_THRESHOLD,
    ARTIFACT_CREATION_SYNC_DURATION_MS
} from '../constants';
import { useSettings } from './useSettings';
import { useAppUI } from './useAppUI';
import { useIO } from './useIO';
import { useHnmAndRag } from './useHnmAndRag';
import { useRenderLoop } from './useAppLogic';
import { useAiFeatures } from './useAiFeatures';
import { PlaceholderInputProcessor } from '../lib/inputs';
import { tensorLerp, lerp } from '../lib/utils';
import { disposeMemStateWeights, disposeHnsResultsTensors } from '../lib/hnm_core_v1';
import type { MenuSettings } from '../types';

declare var tf: any;

// --- HNM Conductor Logic: The core of the new architecture ---
const calculateModulatedParams = (
    baseSettings: MenuSettings,
    hnmStateVector: number[],
    hnmModulationDepth: number
): MenuSettings => {
    const modulated = { ...baseSettings };
    if (!hnmStateVector || hnmStateVector.length < STATE_VECTOR_SIZE) {
        return modulated;
    }

    const hnm = (i: number) => hnmStateVector[i % STATE_VECTOR_SIZE] || 0.5;
    const mod = (base: number, hnmIdx: number) => lerp(base, hnm(hnmIdx), hnmModulationDepth);

    // This mapping determines which part of the HNM's "thought vector" controls which synth parameter.
    // The indices are arbitrary but spread out to tap into different parts of the vector.
    modulated.masterBPM = lerp(baseSettings.masterBPM, lerp(80, 220, hnm(0)), hnmModulationDepth);
    modulated.kickPatternDensity = mod(baseSettings.kickPatternDensity, 1);
    modulated.kickTune = mod(baseSettings.kickTune, 2);
    modulated.kickAttack = mod(baseSettings.kickAttack, 3);
    modulated.kickDistortion = mod(baseSettings.kickDistortion, 4);
    modulated.bassPatternDensity = mod(baseSettings.bassPatternDensity, 5);
    modulated.bassCutoff = mod(baseSettings.bassCutoff, 6);
    modulated.bassReso = mod(baseSettings.bassReso, 7);
    modulated.bassGlide = mod(baseSettings.bassGlide, 8);
    modulated.acidPatternDensity = mod(baseSettings.acidPatternDensity, 9);
    modulated.acidCutoff = mod(baseSettings.acidCutoff, 10);
    modulated.acidReso = mod(baseSettings.acidReso, 11);
    modulated.acidAccentAmount = mod(baseSettings.acidAccentAmount, 12);
    modulated.atmosEvolutionRate = mod(baseSettings.atmosEvolutionRate, 13);
    modulated.atmosCutoff = mod(baseSettings.atmosCutoff, 14);
    modulated.atmosSpread = mod(baseSettings.atmosSpread, 15);
    modulated.rhythmPatternDensity = mod(baseSettings.rhythmPatternDensity, 16);
    modulated.rhythmMetallicAmount = mod(baseSettings.rhythmMetallicAmount, 17);
    modulated.snarePatternDensity = mod(baseSettings.snarePatternDensity, 18);
    modulated.snareFlamAmount = mod(baseSettings.snareFlamAmount, 19);
    modulated.riserPitchSweep = mod(baseSettings.riserPitchSweep, 20);
    modulated.delayFeedback = mod(baseSettings.delayFeedback, 21);
    modulated.delayMix = mod(baseSettings.delayMix, 22);
    modulated.reverbSize = mod(baseSettings.reverbSize, 23);
    modulated.reverbShimmer = mod(baseSettings.reverbShimmer, 24);
    modulated.reverbMix = mod(baseSettings.reverbMix, 25);
    
    return modulated;
};


export const useInfundibulum = (canvasRef: RefObject<HTMLCanvasElement>) => {
    const {
        debugInfo, setDebugInfo, warningInfo, setWarningInfo, showWarning, hideWarning,
        showError, loadingInfo, showLoading, speechStatus, setSpeechStatus,
        isAiConfigModalVisible, toggleAiConfigModal,
    } = useAppUI();
    
    const {
        menuSettings, setMenuSettings, handleMenuSettingChange,
        resetMenuSettingsToDefault, isAiDisabled,
    } = useSettings({ showWarning, showError });
    
    const io = useIO({
        onSpeechCommand: handleSpeechCommand,
        setSpeechStatus,
        showError,
        showWarning
    });

    const hnm = useHnmAndRag(showLoading);
    const [hnmStateVector, setHnmStateVector] = useState<number[]>(new Array(STATE_VECTOR_SIZE).fill(0.5));

    const ai = useAiFeatures({
        menuSettings,
        isAiDisabled,
        showWarning,
        showLoading,
        setMenuSettings,
        handleMenuSettingChange,
        getInputState: () => ({ mic: io.inputState.current.mic, motion: io.inputState.current.accelerometer, outputRhythm: io.inputState.current.outputRhythm }),
        getHnmAnomaly: () => hnm.lastL0Anomaly.current,
        captureMultimodalContext: io.captureMultimodalContext,
    });
    
    const renderLoop = useRenderLoop(
        canvasRef,
        () => ({
            currentResonantStateVector: hnmStateVector,
            activeArtifactInfo: hnm.activeArtifactInfo.current,
            lastL0Anomaly: hnm.lastL0Anomaly.current,
        }),
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
        syncState: {
            isSyncing: false,
            syncStartTime: 0,
        }
    }).current;
    const gameLoopRef = useRef({ isRunning: false });
    const autoSaveInterval = useRef<ReturnType<typeof setInterval> | null>(null);

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
                createArtifactOnSync(true); // Force create
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
    
    const createArtifactOnSync = useCallback(async (force = false) => {
        const now = Date.now();
        if (!force && (now - appState.lastArtifactCreationTime < ARTIFACT_CREATION_INTERVAL_MS)) return;

        const complexity = hnm.lastL0Anomaly.current;
        if (!force && (complexity < ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MIN || complexity > ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MAX)) return;

        if (hnm.artifactManager.current) {
            const [created, artifact] = await hnm.artifactManager.current.createArtifact(hnm.currentResonantState.current, hnm.embeddingsReady);
            if (created) {
                appState.lastArtifactCreationTime = now;
                io.triggerVisualFeedback(0.6, 0.2);
                saveStateToLocalStorage();
                showWarning("Vibe Synchronized. Artifact Created.", 2000);
            }
        }
    }, [appState, hnm, io.triggerVisualFeedback, saveStateToLocalStorage, showWarning]);


    const handleTrainOnArtifacts = useCallback(async () => {
        if (!menuSettings.enableHnmTraining) {
            showWarning("HNM Training is disabled in settings.", 3000);
            return;
        }
        
        renderLoop.stop();
        gameLoopRef.current.isRunning = false;
        await new Promise(resolve => setTimeout(resolve, 100));
    
        try {
            await hnm.trainOnArtifacts(menuSettings.hnmLearningRate, menuSettings.hnmWeightDecay);
            showWarning("HNM training complete.", 3000);
        } catch(e: any) {
            showError(`Training failed: ${e.message}`);
        } finally {
            showLoading(false);
            renderLoop.start();
            gameLoopRef.current.isRunning = true;
            runGameLoop();
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

    const gameLogicDependencies = useRef({ hnm, appState, io, menuSettings, hnmStateVector });
    gameLogicDependencies.current = { hnm, appState, io, menuSettings, hnmStateVector };

    const gameStep = useCallback(async () => {
        const { hnm, appState, io, menuSettings } = gameLogicDependencies.current;
        if (!hnm.hnmSystem.current || !appState.inputProcessor) return;

        // --- Vibe Sync Logic ---
        const motionTempo = io.inputState.current.accelerometer.rhythmTempo;
        const outputTempo = io.inputState.current.outputRhythm.bpm;
        const tempoDiff = Math.abs(motionTempo - outputTempo);
        const syncFactor = Math.max(0, 1 - tempoDiff / 50); // 0 diff = 1.0 sync, 50bpm diff = 0.0 sync
        io.inputState.current.syncFactor = lerp(io.inputState.current.syncFactor, syncFactor, 0.1);

        // --- Artifact Creation on Sustained Sync ---
        const now = Date.now();
        if (io.inputState.current.syncFactor > ARTIFACT_CREATION_SYNC_THRESHOLD) {
            if (!appState.syncState.isSyncing) {
                appState.syncState.isSyncing = true;
                appState.syncState.syncStartTime = now;
            } else if (now - appState.syncState.syncStartTime > ARTIFACT_CREATION_SYNC_DURATION_MS) {
                createArtifactOnSync();
                appState.syncState.isSyncing = false; // Reset after creation
            }
        } else {
            appState.syncState.isSyncing = false;
        }


        const hnmStepPackage = tf.tidy(() => {
            const sensoryInputTensor = appState.inputProcessor!.process(io.inputState.current, io.inputState.current.currentTime);
            const artifactSignal = hnm.projectArtifactsToExternalSignal(hnm.activeArtifactInfo.current, HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM);
            
            // The "vibe target" is now dynamic, based on what the user is vibing with.
            // If sync is high, the target is the current state. If low, it's a state derived from user's bio-feedback.
            const vibeTargetVector = new Array(STATE_VECTOR_SIZE).fill(0.5);
            if (io.inputState.current.syncFactor < 0.4) { // User is out of sync, adapt to them
                const motionPeak = io.inputState.current.accelerometer.rhythmPeak; // Complexity
                const motionTempoNorm = (motionTempo - 60) / 160; // 60-220bpm range
                vibeTargetVector[0] = motionTempoNorm; // masterBPM
                vibeTargetVector[1] = motionPeak; // kick density
                vibeTargetVector[5] = motionPeak; // bass density
                vibeTargetVector[8] = motionPeak; // complexity
            } else { // User is in sync, reinforce current state
                hnmStateVector.forEach((val, i) => vibeTargetVector[i] = val);
            }
            const vibeTargetSignal = tf.tensor1d(vibeTargetVector).reshape([1, 1, HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM]);
            
            const micDiffMag = Math.abs(io.inputState.current.mic.rhythmPeak - io.inputState.current.accelerometer.rhythmPeak);
            const externalL0SignalRaw = hnm.currentResonantState.current.squeeze().mul(micDiffMag * menuSettings.micFeedbackToL0Strength);
            const externalL0Signal = externalL0SignalRaw.reshape([1,1,HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM]);

            const externalSignals = {
                [HNM_HIERARCHY_LEVEL_CONFIGS[0].external_input_config!.source_signal_name]: externalL0Signal,
                [HNM_HIERARCHY_LEVEL_CONFIGS[1].external_input_config!.source_signal_name]: vibeTargetSignal,
            };

            return hnm.hnmSystem.current!.step(
                hnm.hnmMemoryStates.current,
                hnm.hnmLastStepOutputs.current,
                { [HNM_HIERARCHY_LEVEL_CONFIGS[0].name]: sensoryInputTensor },
                externalSignals, true
            );
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
                hnm.currentResonantState.current, newResonantState, menuSettings.playerInfluence
            ));
            newResonantState.dispose();
            
            hnm.currentResonantState.current?.dispose();
            hnm.currentResonantState.current = tf.keep(blendedState);
        }
        
        const currentStateVector = await hnm.currentResonantState.current.squeeze([0, 1]).data();
        setHnmStateVector(currentStateVector);

        // RAG update
        hnm.activeArtifactInfo.current = await hnm.artifactManager.current!.findRelevantArtifacts(hnm.currentResonantState.current, hnm.embeddingsReady, ARTIFACT_SIMILARITY_THRESHOLD, MAX_ACTIVE_ARTIFACTS_LOGIC);
        
        // HNM Conductor: Calculate final params and send to audio worklet
        const modulatedParams = calculateModulatedParams(menuSettings, currentStateVector, menuSettings.hnmModulationDepth);
        io.updateAudioWorklet(modulatedParams);

        // Cleanup
        const l0AnomalyTensor = hnmStepPackage.anomalies['L0_IntentProcessing'];
        hnm.lastL0Anomaly.current = (await l0AnomalyTensor.data())[0];
        disposeHnsResultsTensors(hnmStepPackage);

    }, [createArtifactOnSync]);

    const runGameLoop = useCallback(async () => {
        if (!gameLoopRef.current.isRunning) return;
    
        const loopStart = performance.now();
    
        await gameStep();
    
        const loopEnd = performance.now();
        const duration = loopEnd - loopStart;
        const delay = Math.max(0, (1000 / TARGET_FPS) - duration);
        
        setTimeout(runGameLoop, delay);
    }, [gameStep]);
    
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
            gameLoopRef.current.isRunning = true;
            runGameLoop();

            if (autoSaveInterval.current) clearInterval(autoSaveInterval.current);
            autoSaveInterval.current = setInterval(saveStateToLocalStorage, 15000);
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
            gameLoopRef.current.isRunning = false;
            if (autoSaveInterval.current) clearInterval(autoSaveInterval.current);
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
