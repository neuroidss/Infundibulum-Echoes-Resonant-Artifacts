

import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import {
    VERSION, STATE_VECTOR_SIZE, LOCAL_STORAGE_KEY, LOCAL_STORAGE_MENU_KEY,
    HNM_HIERARCHY_LEVEL_CONFIGS, HNM_POLICY_HEAD_INPUT_LEVEL_NAME,
    ARTIFACT_CREATION_INTERVAL_MS, ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MIN,
    ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MAX, ARTIFACT_SIMILARITY_THRESHOLD,
    MAX_ACTIVE_ARTIFACTS_LOGIC, 
    HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM, HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM,
    TARGET_FPS,
    ARTIFACT_CREATION_SYNC_THRESHOLD,
    ARTIFACT_CREATION_SYNC_DURATION_MS,
    DEFAULT_MENU_SETTINGS,
    TUNING_MODE_PRESET,
    TUNING_SCRIPTS
} from '../constants';
import { useSettings } from './useSettings';
import { useAppUI } from './useAppUI';
import { useIO } from './useIO';
import { useHnmAndRag } from './useHnmAndRag';
import { useAppLogic } from './useAppLogic';
import { useAiFeatures } from './useAiFeatures';
import { PlaceholderInputProcessor } from '../lib/inputs';
import { tensorLerp, lerp } from '../lib/utils';
import { disposeMemStateWeights } from '../lib/hnm_core_v1';
import type { MenuSettings, HnmLastStepOutput, LastRecording } from '../types';

declare var tf: any;

// --- Parameter Sanitization Helper ---
const sanitizeParams = (params: MenuSettings): MenuSettings => {
    const sanitized = { ...params };
    for (const key in sanitized) {
        const k = key as keyof MenuSettings;
        const value = (sanitized as any)[k];
        if (typeof value === 'number' && !isFinite(value)) {
            console.warn(`[Sanitizer] Found non-finite value for param "${k}": ${value}. Resetting to default.`);
            (sanitized as any)[k] = (DEFAULT_MENU_SETTINGS as any)[k] ?? 0;
        }
    }
    return sanitized;
};


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
    modulated.leadPatternDensity = mod(baseSettings.leadPatternDensity, 9);
    modulated.leadCutoff = mod(baseSettings.leadCutoff, 10);
    modulated.leadReso = mod(baseSettings.leadReso, 11);
    modulated.leadAccentAmount = mod(baseSettings.leadAccentAmount, 12);
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
        menuSettings, setMenuSettings,
        handleMenuSettingChange: originalHandleMenuSettingChange,
        resetMenuSettingsToDefault: baseResetMenuToDefault,
        isAiDisabled,
    } = useSettings({ showWarning, showError });
    
    const hnm = useHnmAndRag(showLoading);
    
    const scriptRunnerTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const hnmStateVector = useRef<number[]>(new Array(STATE_VECTOR_SIZE).fill(0.5));
    
    const [lastRecording, setLastRecording] = useState<LastRecording | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isInteractive, setIsInteractive] = useState(false);
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

    // Forward declare refs for callbacks to break dependency cycles
    const onSpeechCommandRef = useRef<(command: string) => void | null>(null);
    const onToggleUIRef = useRef<() => void | null>(null);

    const io = useIO({
        onSpeechCommand: (command) => onSpeechCommandRef.current?.(command),
        setSpeechStatus,
        showError,
        showWarning,
        onToggleUI: () => onToggleUIRef.current?.(),
        isLongPressUIToggleEnabled: menuSettings.enableLongPressToggleUI,
    });

    const saveStateToLocalStorage = useCallback(async () => {
        if (!appState.interactionOccurred || !hnm.currentResonantState.current || hnm.currentResonantState.current.isDisposed || !hnm.artifactManager.current || appState.isSavingState) return;
        appState.isSavingState = true;
        try {
            const stateArray = await tf.tidy('saveState', () => hnm.currentResonantState.current.squeeze([0, 1])).data();
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
    }, [appState, hnm, io, saveStateToLocalStorage, showWarning]);
    
    const handleSpeechCommand = useCallback((command: string) => {
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
    }, [createArtifactOnSync, hnm.artifactManager, io, saveStateToLocalStorage, resetHnmRag]);

    const gameLogicDependencies = useRef({ hnm, appState, io, menuSettings, hnmStateVector: hnmStateVector.current });
    gameLogicDependencies.current = { hnm, appState, io, menuSettings, hnmStateVector: hnmStateVector.current };

    const gameStep = useCallback(async () => {
        if (!gameLoopRef.current.isRunning) return;
    
        const { hnm, appState, io, menuSettings } = gameLogicDependencies.current;
    
        if (menuSettings.enableInstrumentTuningMode) return;
        if (!hnm.hnmSystem.current || !appState.inputProcessor || !hnm.artifactManager.current) {
            if (gameLoopRef.current.isRunning) console.warn("gameStep skipped: HNM or other critical refs not initialized.");
            return;
        }
    
        const motionTempo = io.inputState.current.accelerometer.rhythmTempo;
        const outputTempo = io.inputState.current.outputRhythm.bpm;
        const tempoDiff = Math.abs(motionTempo - outputTempo);
        const syncFactor = Math.max(0, 1 - tempoDiff / 50);
        io.inputState.current.syncFactor = lerp(io.inputState.current.syncFactor, syncFactor, 0.1);
    
        const now = Date.now();
        if (io.inputState.current.syncFactor > ARTIFACT_CREATION_SYNC_THRESHOLD) {
            if (!appState.syncState.isSyncing) {
                appState.syncState.isSyncing = true;
                appState.syncState.syncStartTime = now;
            } else if (now - appState.syncState.syncStartTime > ARTIFACT_CREATION_SYNC_DURATION_MS) {
                await createArtifactOnSync();
                appState.syncState.isSyncing = false;
            }
        } else {
            appState.syncState.isSyncing = false;
        }
    
        // --- Core logic in a single tidy block for robust memory management ---
        const {
            finalResonantState,
            finalMemoryStates,
            finalLastStepOutputs,
            l0AnomalyForUpdate,
            vectorForUpdate,
        } = tf.tidy(() => {
            const sensoryInputTensor = appState.inputProcessor!.process(io.inputState.current, io.inputState.current.currentTime);
            const artifactSignal = hnm.projectArtifactsToExternalSignal(hnm.activeArtifactInfo.current, HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM);
    
            const vibeTargetVector = new Array(STATE_VECTOR_SIZE).fill(0.5);
            if (io.inputState.current.syncFactor < 0.4) {
                const motionTempoNorm = (io.inputState.current.accelerometer.rhythmTempo - 60) / 160;
                const motionPeak = io.inputState.current.accelerometer.rhythmPeak;
                vibeTargetVector[0] = motionTempoNorm;
                vibeTargetVector[1] = motionPeak;
                vibeTargetVector[5] = motionPeak;
                vibeTargetVector[8] = motionPeak;
            } else {
                gameLogicDependencies.current.hnmStateVector.forEach((val: number, i: number) => vibeTargetVector[i] = val);
            }
            const vibeTargetSignal = tf.tensor1d(vibeTargetVector).reshape([1, 1, HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM]);
    
            const micDiffMag = Math.abs(io.inputState.current.mic.rhythmPeak - io.inputState.current.accelerometer.rhythmPeak);
            const micFeedbackTerm = hnm.currentResonantState.current.squeeze().mul(micDiffMag * menuSettings.micFeedbackToL0Strength);
            const combinedL0Signal = artifactSignal.squeeze().add(micFeedbackTerm).reshape([1, 1, HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM]);
    
            const externalSignals = {
                [HNM_HIERARCHY_LEVEL_CONFIGS[0].external_input_config!.source_signal_name]: combinedL0Signal,
                [HNM_HIERARCHY_LEVEL_CONFIGS[1].external_input_config!.source_signal_name]: vibeTargetSignal,
            };
    
            const hnmStepPackage = hnm.hnmSystem.current!.step(
                hnm.hnmMemoryStates.current,
                hnm.hnmLastStepOutputs.current,
                { [HNM_HIERARCHY_LEVEL_CONFIGS[0].name]: sensoryInputTensor },
                externalSignals, true
            );
    
            let resonantStateCandidate;
            const policyHeadOutput = hnmStepPackage.newlyRetrievedValues[HNM_POLICY_HEAD_INPUT_LEVEL_NAME]?.retrievedVal;
    
            if (policyHeadOutput && !policyHeadOutput.isDisposed) {
                const explorationFactor = menuSettings.explorationInfluence * hnm.lastL0Anomaly.current;
                const noise = tf.randomUniform(policyHeadOutput.shape, -1, 1).mul(explorationFactor);
                const noisyState = policyHeadOutput.add(noise).clipByValue(0, 1);
                resonantStateCandidate = tensorLerp(hnm.currentResonantState.current, noisyState, menuSettings.playerInfluence);
            } else {
                resonantStateCandidate = hnm.currentResonantState.current.clone();
            }
    
            return {
                finalResonantState: resonantStateCandidate,
                finalMemoryStates: hnmStepPackage.nextBotStates,
                finalLastStepOutputs: hnmStepPackage.newlyRetrievedValues,
                l0AnomalyForUpdate: hnmStepPackage.anomalies['L0_IntentProcessing'],
                vectorForUpdate: resonantStateCandidate.squeeze([0, 1]),
            };
        });
    
        // --- Dispose old tensors ---
        hnm.currentResonantState.current?.dispose();
        hnm.hnmMemoryStates.current.forEach(disposeMemStateWeights);
        if (hnm.hnmLastStepOutputs.current) {
            Object.values(hnm.hnmLastStepOutputs.current).forEach((output: HnmLastStepOutput) => {
                if (output?.retrievedVal && !output.retrievedVal.isDisposed) {
                    output.retrievedVal.dispose();
                }
            });
        }
    
        // --- Assign new, "kept" tensors from the tidy block ---
        hnm.currentResonantState.current = finalResonantState;
        hnm.hnmMemoryStates.current = finalMemoryStates;
        hnm.hnmLastStepOutputs.current = finalLastStepOutputs;
    
        // --- Asynchronously get data and update JS state ---
        const [data, l0AnomalyValue] = await Promise.all([vectorForUpdate.data(), l0AnomalyForUpdate.data()]);
        hnmStateVector.current = Array.from(data as Float32Array);
        hnm.lastL0Anomaly.current = l0AnomalyValue[0];
    
        // --- Dispose temporary tensors now that async ops are done ---
        vectorForUpdate.dispose();
        l0AnomalyForUpdate.dispose();
    
        // --- Find relevant artifacts (also async) ---
        hnm.activeArtifactInfo.current = await hnm.artifactManager.current!.findRelevantArtifacts(
            hnm.currentResonantState.current, hnm.embeddingsReady, ARTIFACT_SIMILARITY_THRESHOLD, MAX_ACTIVE_ARTIFACTS_LOGIC
        );
    
    }, [createArtifactOnSync, hnm]);

    const runGameLoop = useCallback(async () => {
        if (!gameLoopRef.current.isRunning) return;
    
        const loopStart = performance.now();
    
        await gameStep();
    
        const loopEnd = performance.now();
        const duration = loopEnd - loopStart;
        const delay = Math.max(0, (1000 / TARGET_FPS) - duration);
        
        setTimeout(runGameLoop, delay);
    }, [gameStep]);

    const stopTuningScript = useCallback(() => {
        scriptRunnerTimeouts.current.forEach(clearTimeout);
        scriptRunnerTimeouts.current = [];
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }
        setMenuSettings(prev => {
            if (!prev.enableInstrumentTuningMode) return prev;
            const wasRunning = prev.tuningWorkbench_isScriptRunning;
            const newSettings = {
                ...prev,
                ...TUNING_MODE_PRESET,
                enableInstrumentTuningMode: true,
                tuningWorkbench_isScriptRunning: false,
                tuningWorkbench_currentStepInfo: wasRunning ? 'Stopped.' : 'Idle.'
            };
            io.updateAudioWorklet(newSettings);
            return newSettings;
        });
    }, [setMenuSettings, io]);

    const resetMenuSettingsToDefault = useCallback(() => {
        const currentUIVisibility = menuSettings.isUiVisible;
        const currentApiSettings = {
            googleApiKey: menuSettings.googleApiKey,
            openAiApiKey: menuSettings.openAiApiKey,
            openAiBaseUrl: menuSettings.openAiBaseUrl,
            ollamaHost: menuSettings.ollamaHost,
            selectedModelId: menuSettings.selectedModelId,
            localAiStatus: menuSettings.localAiStatus,
        };
        baseResetMenuToDefault();
        setMenuSettings(prev => ({
            ...prev,
            ...currentApiSettings,
            isUiVisible: currentUIVisibility,
        }));
    }, [baseResetMenuToDefault, menuSettings, setMenuSettings]);

    const handleMenuSettingChange = useCallback(<K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => {
        if (key === 'enableInstrumentTuningMode') {
            setLastRecording(null);
            io.setMasterGain(0, 0.02); // Mute audio immediately

            if (value === true) { // ENTERING tuning mode
                gameLoopRef.current.isRunning = false;
                // The timeout ensures the gain ramp completes before we change settings and unmute
                setTimeout(() => {
                    const newSettings = {
                        ...menuSettings,
                        ...TUNING_MODE_PRESET,
                        enableInstrumentTuningMode: true,
                        tuningWorkbench_currentStepInfo: 'Idle. Select a script to run.',
                        tuningWorkbench_isScriptRunning: false,
                    };
                    setMenuSettings(newSettings);
                    io.updateAudioWorklet(newSettings);
                    io.setMasterGain(1.0, 0.05); // Unmute
                }, 50);

            } else { // EXITING tuning mode
                stopTuningScript();
                setTimeout(() => {
                    resetMenuSettingsToDefault(); // This triggers useEffect to update worklet
                    gameLoopRef.current.isRunning = true;
                    runGameLoop();
                    io.setMasterGain(1.0, 0.1); // Unmute
                }, 50);
                showWarning("Exited Tuning Mode. Settings reset to default.", 3000);
            }
        } else {
            originalHandleMenuSettingChange(key, value);
        }
    }, [
        originalHandleMenuSettingChange,
        io,
        menuSettings,
        setMenuSettings,
        stopTuningScript,
        showWarning,
        runGameLoop,
        resetMenuSettingsToDefault
    ]);

    // Assign callbacks to refs. This hook updates the refs whenever the callbacks change.
    useEffect(() => {
        onSpeechCommandRef.current = handleSpeechCommand;
        onToggleUIRef.current = () => {
            handleMenuSettingChange('isUiVisible', !menuSettings.isUiVisible)
        };
    }, [handleSpeechCommand, handleMenuSettingChange, menuSettings.isUiVisible]);
    
    const ai = useAiFeatures({
        menuSettings,
        isAiDisabled,
        isInteractive,
        showWarning,
        showLoading,
        setMenuSettings,
        handleMenuSettingChange: originalHandleMenuSettingChange,
        getInputState: () => ({ mic: io.inputState.current.mic, motion: io.inputState.current.accelerometer, outputRhythm: io.inputState.current.outputRhythm }),
        getHnmAnomaly: () => hnm.lastL0Anomaly.current,
        captureMultimodalContext: io.captureMultimodalContext,
    });
    
    const updateDebugDisplay = useCallback((fps: number) => {
        const baseInfo = `FPS: ${fps.toFixed(1)} | Comp: ${hnm.lastL0Anomaly.current.toFixed(3)} | Arts: ${hnm.artifactManager.current?.getArtifactCount() || 0}`;

        if (!menuSettings.showMemoryDebug) {
            setDebugInfo(baseInfo);
            return;
        }

        const totalMemInfo = tf.memory();
        const trackedTensors = hnm.getTrackedTensorCount();
        const untrackedTensors = totalMemInfo.numTensors - trackedTensors;
        const totalMB = (totalMemInfo.numBytes / 1024 / 1024).toFixed(2);
        const leakStyle = untrackedTensors > 50 ? 'style="color: #fca5a5;"' : ''; // Style for leak warning

        const debugString = `
${baseInfo}
<br/>Total Mem: ${totalMB}MB | Buffers: ${totalMemInfo.numDataBuffers}
<br/>Tensors: ${totalMemInfo.numTensors} (Tracked: ${trackedTensors})
<br/><span ${leakStyle}>Untracked (Leak): ${untrackedTensors}</span>
        `.trim();

        setDebugInfo(debugString);
    }, [hnm, setDebugInfo, menuSettings.showMemoryDebug]);

    const renderLoop = useAppLogic(
        canvasRef,
        () => ({
            currentResonantStateVector: hnmStateVector.current,
            activeArtifactInfo: hnm.activeArtifactInfo.current,
            lastL0Anomaly: hnm.lastL0Anomaly.current,
        }),
        updateDebugDisplay
    );
    
    const runScript = useCallback((isRecording: boolean) => {
        setLastRecording(null); // Clear previous results on new run
        const { tuningWorkbench_selectedInstrument, tuningWorkbench_selectedScript } = menuSettings;
        const script = TUNING_SCRIPTS[tuningWorkbench_selectedInstrument as keyof typeof TUNING_SCRIPTS]?.find(s => s.name === tuningWorkbench_selectedScript);

        if (!script) {
            showWarning("Selected tuning script not found.", 3000);
            return;
        }

        scriptRunnerTimeouts.current.forEach(clearTimeout);
        scriptRunnerTimeouts.current = [];
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }

        const baseSettings: Partial<MenuSettings> = { ...TUNING_MODE_PRESET };

        if (tuningWorkbench_selectedInstrument !== "System" && tuningWorkbench_selectedInstrument !== "Master Bus") {
            const keyPrefix = tuningWorkbench_selectedInstrument.toLowerCase();
            (baseSettings as any)[`${keyPrefix}PatternDensity`] = 1.0;
            (baseSettings as any)[`${keyPrefix}Level`] = 0.8;
        }

        setMenuSettings(prev => {
            const newSettings = {
                ...prev,
                ...baseSettings,
                tuningWorkbench_isScriptRunning: true,
                tuningWorkbench_currentStepInfo: `Starting script: ${script.name}`
            };
            io.updateAudioWorklet(newSettings);
            return newSettings;
        });

        let cumulativeTime = 0;
        script.steps.forEach((step, index) => {
            const timeoutId = setTimeout(() => {
                setMenuSettings(currentSettings => {
                    if (!currentSettings.tuningWorkbench_isScriptRunning) return currentSettings;
                    const newStepSettings = {
                        ...currentSettings,
                        ...step.params,
                        tuningWorkbench_currentStepInfo: `Step ${index + 1}/${script.steps.length}: ${step.description || 'Executing...'}`
                    };
                    io.updateAudioWorklet(newStepSettings);
                    return newStepSettings;
                });
            }, cumulativeTime);
            scriptRunnerTimeouts.current.push(timeoutId);
            cumulativeTime += step.duration;
        });

        const finalTimeout = setTimeout(() => {
            stopTuningScript();
            setMenuSettings(prev => ({...prev, tuningWorkbench_currentStepInfo: 'Script finished.'}));
        }, cumulativeTime);
        scriptRunnerTimeouts.current.push(finalTimeout);

        if (isRecording) {
            if (!io.audioCaptureDestination.current) {
                showError("Audio capture node not available for recording.");
                stopTuningScript();
                return;
            }
            try {
                recordedChunksRef.current = [];
                const mimeType = 'audio/webm;codecs=opus';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    showError(`Recording failed: MimeType ${mimeType} not supported.`);
                    stopTuningScript();
                    return;
                }
                mediaRecorderRef.current = new MediaRecorder(io.audioCaptureDestination.current.stream, { mimeType });
                
                mediaRecorderRef.current.ondataavailable = (e) => {
                    if (e.data.size > 0) recordedChunksRef.current.push(e.data);
                };
                
                mediaRecorderRef.current.onstop = async () => {
                    const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType });
                    const scriptBlob = new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' });
                    
                    const { spectrogramClip } = await io.captureMultimodalContext({ spectrogram: true, audio: false, image: false });
                    
                    const scriptFileName = `${tuningWorkbench_selectedInstrument}_${tuningWorkbench_selectedScript.replace(/\s+/g, '_')}`;

                    const spectrogramDataUrl = spectrogramClip ? `data:${spectrogramClip.mimeType};base64,${spectrogramClip.data}` : null;

                    setLastRecording({
                        audioBlob,
                        scriptBlob,
                        spectrogramDataUrl,
                        scriptFileName
                    });

                    mediaRecorderRef.current = null;
                    recordedChunksRef.current = [];
                };

                mediaRecorderRef.current.start();
            } catch (e) {
                 showError(`Recording failed: ${(e as Error).message}`);
                 stopTuningScript();
            }
        }
    }, [menuSettings, showWarning, setMenuSettings, io, showError, stopTuningScript]);
    
    const handleTrainOnArtifacts = useCallback(async () => {
        if (!menuSettings.enableHnmTraining) {
            showWarning("HNM Training is disabled in settings.", 3000);
            return;
        }
        
        renderLoop.stop();
        gameLoopRef.current.isRunning = false;
        await new Promise(resolve => setTimeout(() => resolve(undefined), 100));
    
        try {
            await hnm.trainOnArtifacts(menuSettings.hnmLearningRate, menuSettings.hnmWeightDecay);
            showWarning("HNM training complete.", 3000);
        } catch(e: any) {
            showError(`Training failed: ${e.message}`);
        } finally {
            showLoading(false, '', '');
            renderLoop.start();
            gameLoopRef.current.isRunning = true;
            runGameLoop();
        }
    }, [menuSettings.enableHnmTraining, menuSettings.hnmLearningRate, menuSettings.hnmWeightDecay, hnm, renderLoop, showWarning, showError, showLoading, runGameLoop]);

    // --- Local AI Server Logic ---
    const logLocalAiEvent = useCallback((log: string) => {
        setMenuSettings(prev => ({
            ...prev,
            localAiStatus: {
                ...prev.localAiStatus,
                logs: [...(prev.localAiStatus?.logs || []).slice(-50), log]
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
                } catch (e) {}
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
            showLoading(false, '');
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
            showLoading(false, '');
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

    const handleRunTuningScript = useCallback(() => runScript(false), [runScript]);
    const handleRecordAndDownload = useCallback(() => runScript(true), [runScript]);
    
    // This effect ensures the audio worklet always has the latest parameters,
    // especially after settings are loaded, reset, or changed by the AI.
    // We don't run this in tuning mode as that has its own update logic.
    useEffect(() => {
        if (isInitialized && !menuSettings.enableInstrumentTuningMode) {
            const modulatedParams = calculateModulatedParams(menuSettings, hnmStateVector.current, menuSettings.hnmModulationDepth);
            // This is the safety net. No matter what the HNM does, we ensure the parameters are valid before sending them.
            const sanitizedModulatedParams = sanitizeParams(modulatedParams);
            io.updateAudioWorklet(sanitizedModulatedParams);
        }
    }, [menuSettings, isInitialized, io]);

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
                       hnmStateVector.current = saved.resonantState;
                    }
                } catch (e) { console.error("Error loading saved state:", e); }
            }

            io.initialize(canvasRef.current!);
            
            showLoading(false, '');
            setWarningInfo({ message: 'Interact to begin.', visible: true });
            setIsInitialized(true);
        };

        init().catch(err => {
            showError(`Initialization failed: ${err.message}`);
            console.error(err);
            showLoading(false, '');
        });

        const handleInteractionStart = async () => {
            if (appState.interactionOccurred) return;
            appState.interactionOccurred = true;
            setIsInteractive(true);
            
            // In a normal start, we now immediately send a clean set of parameters
            // to stabilize the audio worklet BEFORE starting the game loop.
            if (!menuSettings.enableInstrumentTuningMode) {
                io.updateAudioWorklet(sanitizeParams(menuSettings));
            } else {
                 io.updateAudioWorklet(TUNING_MODE_PRESET as MenuSettings);
            }

            const audioReady = await io.initAudio();
            if(audioReady) io.speechController.current?.startListening();

            showWarning('', 0);
            renderLoop.start();
            
            if (!menuSettings.enableInstrumentTuningMode) {
                 gameLoopRef.current.isRunning = true;
                 runGameLoop();
            }

            if (autoSaveInterval.current) clearInterval(autoSaveInterval.current);
            autoSaveInterval.current = setInterval(saveStateToLocalStorage, 15000);
        };
        
        const interactionEvents = ['pointerdown', 'keydown'];
        interactionEvents.forEach(evt => window.addEventListener(evt, handleInteractionStart, { once: true }));
        
        pollLocalAiStatus();
        const statusInterval = setInterval(pollLocalAiStatus, 5000);

        return () => { 
            isMounted = false; 
            renderLoop.stop();
            gameLoopRef.current.isRunning = false;
            interactionEvents.forEach(evt => window.removeEventListener(evt, handleInteractionStart));
            if (autoSaveInterval.current) clearInterval(autoSaveInterval.current);
            hnm.reset(); 
            clearInterval(statusInterval);
            stopTuningScript();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

     useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'h') {
                const newVisibility = !menuSettings.isUiVisible;
                handleMenuSettingChange('isUiVisible', newVisibility);
                if (!newVisibility) {
                    showWarning("UI hidden. Long-press then tap to restore.", 3000);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [menuSettings.isUiVisible, handleMenuSettingChange, showWarning]);

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
        handleEngineerAndAnalyze: ai.handleEngineerAndAnalyze,
        isAiConfigModalVisible,
        toggleAiConfigModal,
        handleAiConfigSubmit: (cfg) => setMenuSettings(p => ({...p, ...cfg})),
        handleCopilotRefine: ai.handleCopilotRefine,
        handleTrainOnArtifacts,
        handleInstallGemmaScript,
        handleStartLocalAiServer,
        handleStopLocalAiServer,
        handleTestLocalAi,
        isInstallingLocalAiScript,
        isServerConnected,
        handleRunTuningScript,
        handleRecordAndDownload,
        stopTuningScript,
        outputAnalyser: io.outputAnalyser,
        lastRecording,
    };
};
