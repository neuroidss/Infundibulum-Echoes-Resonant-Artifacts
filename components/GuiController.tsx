import React, { useEffect, useRef } from 'react';
import GUI from 'lil-gui';
import type { GUI as GUIType } from 'lil-gui';
import { MenuSettings } from '../types';
import { VERSION, AI_MODELS } from '../constants';

type onChangeType = <K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => void;

const lerp = (start: number, end: number, amt: number): number => {
  return (1 - amt) * start + amt * end;
};

// Helper function to create the detailed instrument and FX GUI
const createInstrumentAndFxGui = (
    parentFolder: GUIType, 
    settings: MenuSettings, 
    onChange: onChangeType
) => {
    const kickFolder = parentFolder.addFolder('Kick Drum').close();
    kickFolder.add(settings, 'kickPatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v:number) => onChange('kickPatternDensity', v));
    kickFolder.add(settings, 'kickTune', 0, 1, 0.01).name('Tune').onChange((v:number) => onChange('kickTune', v));
    kickFolder.add(settings, 'kickAttack', 0, 1, 0.01).name('Attack').onChange((v: number) => onChange('kickAttack', v));
    kickFolder.add(settings, 'kickPitchDecay', 0.005, 0.1, 0.001).name('Pitch Decay').onChange((v: number) => onChange('kickPitchDecay', v));
    kickFolder.add(settings, 'kickAmpDecay', 0.05, 1, 0.01).name('Amp Decay').onChange((v:number) => onChange('kickAmpDecay', v));
    kickFolder.add(settings, 'kickDistortion', 0, 1, 0.01).name('Distortion').onChange((v: number) => onChange('kickDistortion', v));
    kickFolder.add(settings, 'kickLevel', 0, 1, 0.01).name('Level').onChange((v:number) => onChange('kickLevel', v));

    const bassFolder = parentFolder.addFolder('Bass').close();
    bassFolder.add(settings, 'bassPatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v:number) => onChange('bassPatternDensity', v));
    bassFolder.add(settings, 'bassOscType', { Saw: 0, Square: 1 }).name('Osc Type').onChange((v:number) => onChange('bassOscType', Number(v)));
    bassFolder.add(settings, 'bassSubOscLevel', 0, 1, 0.01).name('Sub Osc Level').onChange((v: number) => onChange('bassSubOscLevel', v));
    bassFolder.add(settings, 'bassOctave', { 'Sub -2': 0, 'Sub -1': 1, 'Root': 2 }).name('Octave').onChange((v:number) => onChange('bassOctave', Number(v)));
    bassFolder.add(settings, 'bassPW', 0.05, 0.95, 0.01).name('Pulse Width').onChange((v: number) => onChange('bassPW', v));
    bassFolder.add(settings, 'bassGlide', 0, 0.2, 0.001).name('Glide').onChange((v: number) => onChange('bassGlide', v));
    bassFolder.add(settings, 'bassCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v:number) => onChange('bassCutoff', v));
    bassFolder.add(settings, 'bassReso', 0, 1, 0.01).name('Reso').onChange((v:number) => onChange('bassReso', v));
    bassFolder.add(settings, 'bassEnvAmt', 0, 1, 0.01).name('Env Amt').onChange((v:number) => onChange('bassEnvAmt', v));
    bassFolder.add(settings, 'bassFilterKeyTrack', 0, 1, 0.01).name('Key Track').onChange((v: number) => onChange('bassFilterKeyTrack', v));
    bassFolder.add(settings, 'bassFilterDecay', 0.01, 0.5, 0.005).name('Filter Decay').onChange((v: number) => onChange('bassFilterDecay', v));
    bassFolder.add(settings, 'bassAmpDecay', 0.01, 0.5, 0.005).name('Amp Decay').onChange((v: number) => onChange('bassAmpDecay', v));
    bassFolder.add(settings, 'bassDistortion', 0, 1, 0.01).name('Distortion').onChange((v: number) => onChange('bassDistortion', v));
    bassFolder.add(settings, 'bassLevel', 0, 1, 0.01).name('Level').onChange((v:number) => onChange('bassLevel', v));
    
    const leadFolder = parentFolder.addFolder('Lead Synth').close();
    leadFolder.add(settings, 'leadPatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v: number) => onChange('leadPatternDensity', v));
    leadFolder.add(settings, 'leadWaveformMix', 0, 1, 0.01).name('Waveform (Bubble > Saw)').onChange((v: number) => onChange('leadWaveformMix', v));
    leadFolder.add(settings, 'leadFmAmount', 0, 1, 0.01).name('FM Amount (Metallic)').onChange((v: number) => onChange('leadFmAmount', v));
    leadFolder.add(settings, 'leadDistortion', 0, 1, 0.01).name('Distortion').onChange((v: number) => onChange('leadDistortion', v));
    leadFolder.add(settings, 'leadOctave', { Low: 0, Mid: 1, High: 2 }).name('Octave').onChange((v: number) => onChange('leadOctave', Number(v)));
    leadFolder.add(settings, 'leadCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v: number) => onChange('leadCutoff', v));
    leadFolder.add(settings, 'leadReso', 0, 1, 0.01).name('Resonance').onChange((v: number) => onChange('leadReso', v));
    leadFolder.add(settings, 'leadEnvAmt', 0, 1, 0.01).name('Env Amount').onChange((v: number) => onChange('leadEnvAmt', v));
    leadFolder.add(settings, 'leadDecay', 0.01, 1, 0.01).name('Decay').onChange((v: number) => onChange('leadDecay', v));
    leadFolder.add(settings, 'leadAccentAmount', 0, 1, 0.01).name('Accent').onChange((v: number) => onChange('leadAccentAmount', v));
    leadFolder.add(settings, 'leadLevel', 0, 1, 0.01).name('Level').onChange((v: number) => onChange('leadLevel', v));

    const atmosFolder = parentFolder.addFolder('Atmos Pad').close();
    atmosFolder.add(settings, 'atmosOscType', { Saw: 0, FMish: 1 }).name('Osc Type').onChange((v: number) => onChange('atmosOscType', Number(v)));
    atmosFolder.add(settings, 'atmosEvolutionRate', 0, 1, 0.01).name('Evolution Rate').onChange((v: number) => onChange('atmosEvolutionRate', v));
    atmosFolder.add(settings, 'atmosCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v: number) => onChange('atmosCutoff', v));
    atmosFolder.add(settings, 'atmosReso', 0, 1, 0.01).name('Resonance').onChange((v: number) => onChange('atmosReso', v));
    atmosFolder.add(settings, 'atmosSpread', 0, 1, 0.01).name('Stereo Spread').onChange((v: number) => onChange('atmosSpread', v));
    atmosFolder.add(settings, 'atmosLevel', 0, 1, 0.01).name('Level').onChange((v: number) => onChange('atmosLevel', v));
    
    const rhythmFolder = parentFolder.addFolder('Rhythm Synth').close();
    rhythmFolder.add(settings, 'rhythmPatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v: number) => onChange('rhythmPatternDensity', v));
    rhythmFolder.add(settings, 'rhythmClosedDecay', 0.005, 0.2, 0.001).name('Closed Decay').onChange((v: number) => onChange('rhythmClosedDecay', v));
    rhythmFolder.add(settings, 'rhythmOpenDecay', 0.05, 0.5, 0.005).name('Open Decay').onChange((v: number) => onChange('rhythmOpenDecay', v));
    rhythmFolder.add(settings, 'rhythmHpfCutoff', 0.1, 1, 0.01).name('HPF Cutoff').onChange((v: number) => onChange('rhythmHpfCutoff', v));
    rhythmFolder.add(settings, 'rhythmMetallicAmount', 0, 1, 0.01).name('Metallic').onChange((v: number) => onChange('rhythmMetallicAmount', v));
    rhythmFolder.add(settings, 'rhythmLevel', 0, 1, 0.01).name('Level').onChange((v: number) => onChange('rhythmLevel', v));

    const snareFolder = parentFolder.addFolder('Snare').close();
    snareFolder.add(settings, 'snarePatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v: number) => onChange('snarePatternDensity', v));
    snareFolder.add(settings, 'snareFlamAmount', 0, 1, 0.01).name('Flam Amount').onChange((v: number) => onChange('snareFlamAmount', v));
    snareFolder.add(settings, 'snareNoiseLevel', 0, 1, 0.01).name('Noise Level').onChange((v: number) => onChange('snareNoiseLevel', v));
    snareFolder.add(settings, 'snareNoiseDecay', 0.01, 0.3, 0.005).name('Noise Decay').onChange((v: number) => onChange('snareNoiseDecay', v));
    snareFolder.add(settings, 'snareNoiseCutoff', 0.01, 1, 0.01).name('Noise Cutoff').onChange((v: number) => onChange('snareNoiseCutoff', v));
    snareFolder.add(settings, 'snareBodyTune', 0, 1, 0.01).name('Body Tune').onChange((v: number) => onChange('snareBodyTune', v));
    snareFolder.add(settings, 'snareBodyDecay', 0.01, 0.5, 0.005).name('Body Decay').onChange((v: number) => onChange('snareBodyDecay', v));
    snareFolder.add(settings, 'snareBodyLevel', 0, 1, 0.01).name('Body Level').onChange((v: number) => onChange('snareBodyLevel', v));
    snareFolder.add(settings, 'snareLevel', 0, 1, 0.01).name('Master Level').onChange((v: number) => onChange('snareLevel', v));
    
    const riserFolder = parentFolder.addFolder('Riser FX').close();
    riserFolder.add(settings, 'riserTriggerRate', { Off:0, '4 Bars':1, '8 Bars':2, '16 Bars':3 }).name('Trigger Rate').onChange((v: number) => onChange('riserTriggerRate', Number(v)));
    riserFolder.add(settings, 'riserAttack', 0.01, 4, 0.01).name('Attack').onChange((v: number) => onChange('riserAttack', v));
    riserFolder.add(settings, 'riserDecay', 0.1, 8, 0.01).name('Decay').onChange((v: number) => onChange('riserDecay', v));
    riserFolder.add(settings, 'riserPitchSweep', 0, 1, 0.01).name('Pitch Sweep').onChange((v: number) => onChange('riserPitchSweep', v));
    riserFolder.add(settings, 'riserCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v: number) => onChange('riserCutoff', v));
    riserFolder.add(settings, 'riserReso', 0, 1, 0.01).name('Resonance').onChange((v: number) => onChange('riserReso', v));
    riserFolder.add(settings, 'riserLevel', 0, 1, 0.005).name('Level').onChange((v: number) => onChange('riserLevel', v));

    const fxFolder = parentFolder.addFolder('Master FX Bus').close();
    fxFolder.add(settings, 'delayTimeMode', { '1/16':0, '1/8':1, '3/16':2, '1/4':3, '1/2':4 }).name('Delay Time').onChange((v: number) => onChange('delayTimeMode', Number(v)));
    fxFolder.add(settings, 'delayFeedback', 0, 0.98, 0.01).name('Delay Feedback').onChange((v: number) => onChange('delayFeedback', v));
    fxFolder.add(settings, 'delayFilterCutoff', 0.05, 1, 0.01).name('Delay Filter').onChange((v: number) => onChange('delayFilterCutoff', v));
    fxFolder.add(settings, 'delayStereo', 0, 1, 0.01).name('Delay Stereo').onChange((v: number) => onChange('delayStereo', v));
    fxFolder.add(settings, 'delayMix', 0, 1, 0.01).name('Delay Mix').onChange((v:number) => onChange('delayMix', v));
    fxFolder.add(settings, 'reverbSize', 0.1, 1, 0.01).name('Reverb Size').onChange((v: number) => onChange('reverbSize', v));
    fxFolder.add(settings, 'reverbDamp', 0, 1, 0.01).name('Reverb Damp').onChange((v: number) => onChange('reverbDamp', v));
    fxFolder.add(settings, 'reverbPreDelay', 0, 0.2, 0.001).name('Reverb Pre-Delay').onChange((v: number) => onChange('reverbPreDelay', v));
    fxFolder.add(settings, 'reverbShimmer', 0, 1, 0.01).name('Reverb Shimmer').onChange((v: number) => onChange('reverbShimmer', v));
    fxFolder.add(settings, 'reverbMix', 0, 1, 0.01).name('Reverb Mix').onChange((v:number) => onChange('reverbMix', v));
};

interface GuiControllerProps {
    menuSettings: MenuSettings;
    onMenuSettingChange: <K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => void;
    resetMenuToDefaults: () => void;
    resetHnmRag: () => void;
    isDisabled: boolean;
    toggleAiConfigModal: () => void;
    handleTrainOnArtifacts: () => void;
    isUiVisible: boolean;
}

const GuiController: React.FC<GuiControllerProps> = ({
    menuSettings,
    onMenuSettingChange,
    resetMenuToDefaults,
    resetHnmRag,
    isDisabled,
    toggleAiConfigModal,
    handleTrainOnArtifacts,
    isUiVisible
}) => {
    const guiRef = useRef<GUI | null>(null);
    const controlsRef = useRef<any>({});
    const propsRef = useRef({ onMenuSettingChange, resetMenuToDefaults, resetHnmRag, toggleAiConfigModal, handleTrainOnArtifacts });
    propsRef.current = { onMenuSettingChange, resetMenuToDefaults, resetHnmRag, toggleAiConfigModal, handleTrainOnArtifacts };

    const createSmoothTransitioner = (targetParams: Partial<MenuSettings>, durationMs: number) => {
        const startTime = performance.now();
        
        // Create a snapshot of the starting parameters, which may contain NaN
        const startParamsSnapshot: { [k: string]: any } = {};
        const numericKeysToAnimate: Array<keyof MenuSettings> = [];
    
        for (const key of Object.keys(targetParams) as Array<keyof MenuSettings>) {
            const endValue = targetParams[key];
            const startValue = menuSettings[key];
    
            if (typeof endValue === 'number') {
                // Store the start value, even if it's NaN. We'll handle it in the loop.
                startParamsSnapshot[key] = startValue;
                numericKeysToAnimate.push(key);
            } else if (startValue !== endValue) {
                // Instantly set non-numeric values.
                if (endValue !== undefined && typeof endValue !== 'object') {
                    propsRef.current.onMenuSettingChange(key, endValue);
                }
            }
        }
    
        const transitionFrame = () => {
            const elapsedTime = performance.now() - startTime;
            const progress = Math.min(elapsedTime / durationMs, 1.0);
            const easedProgress = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    
            for (const key of numericKeysToAnimate) {
                let startValue = startParamsSnapshot[key] as number;
                const endValue = targetParams[key] as number;
    
                // *** ROBUSTNESS FIX ***
                // If the starting value from the main state was invalid (NaN),
                // "heal" it by snapping it to the target value for this animation.
                // This prevents NaN from propagating via the lerp function.
                if (!isFinite(startValue)) {
                    startValue = endValue;
                }
    
                // Now, lerp is guaranteed to receive valid numbers.
                const currentValue = lerp(startValue, endValue, easedProgress);
                propsRef.current.onMenuSettingChange(key, currentValue);
            }
    
            if (progress < 1.0) {
                requestAnimationFrame(transitionFrame);
            }
        };
        
        requestAnimationFrame(transitionFrame);
    };

    const runFullOnTest = () => {
        const fullOnParams: Partial<MenuSettings> = {
          masterBPM: 145,
          kickPatternDensity: 1.0, kickAmpDecay: 0.09, kickPitchDecay: 0.015, kickLevel: 1.0,
          bassPatternDensity: 1.0, bassOctave: 1, bassAmpDecay: 0.07, bassFilterDecay: 0.1, bassCutoff: 0.25, bassReso: 0.6, bassEnvAmt: 0.8, bassLevel: 0.85,
          leadWaveformMix: 1.0,
          leadPatternDensity: 0.7, leadOctave: 1, leadDecay: 0.2, leadCutoff: 0.4, leadReso: 0.5, leadEnvAmt: 0.6, leadLevel: 0.7,
          snarePatternDensity: 0.5, snareLevel: 0.5,
          rhythmPatternDensity: 1.0, rhythmOpenDecay: 0.15, rhythmLevel: 0.4,
          delayTimeMode: 2, delayFeedback: 0.6, delayMix: 0.3,
          reverbMix: 0.2
        };
        createSmoothTransitioner(fullOnParams, 5000);
    };

    const runPsyChillTest = () => {
        const psyChillParams: Partial<MenuSettings> = {
            masterBPM: 110,
            kickPatternDensity: 0.7, kickAmpDecay: 0.4, kickPitchDecay: 0.05, kickLevel: 0.8,
            bassPatternDensity: 0.5, bassOctave: 0, bassAmpDecay: 0.5, bassFilterDecay: 0.6, bassCutoff: 0.15, bassReso: 0.3, bassEnvAmt: 0.4, bassLevel: 0.9,
            leadWaveformMix: 0.0,
            leadFmAmount: 0.2,
            leadPatternDensity: 0.4, leadOctave: 2, leadDecay: 0.8, leadCutoff: 0.3, leadReso: 0.6, leadEnvAmt: 0.7, leadLevel: 0.6,
            rhythmPatternDensity: 0.3,
            delayTimeMode: 1, delayFeedback: 0.8, delayStereo: 0.7, delayMix: 0.5,
            reverbSize: 0.95, reverbDamp: 0.2, reverbMix: 0.6
        };
        createSmoothTransitioner(psyChillParams, 8000);
    };


    useEffect(() => {
        if (guiRef.current) {
            guiRef.current.destroy();
            guiRef.current = null;
        }

        const gui = new GUI({ autoPlace: true, title: `Echoes Controls v${VERSION.split('-')[0]}` });
        gui.domElement.style.zIndex = '20';
        gui.domElement.style.top = '10px';
        gui.domElement.style.right = '10px';
        gui.domElement.style.maxHeight = 'calc(100vh - 20px)';
        gui.domElement.style.overflowY = 'auto';
        
        const aiFolder = gui.addFolder('AI').open();
        const systemFolder = gui.addFolder('System & HNM').open();
        const instrumentsFolder = gui.addFolder('Instruments & FX').close();

        // --- AI Folder ---
        const modelOptions = AI_MODELS.reduce((acc, model) => { acc[model.name] = model.id; return acc; }, {} as Record<string, string>);
        const aiConfigFolder = aiFolder.addFolder('Configuration').close();
        aiConfigFolder.add(menuSettings, 'selectedModelId', modelOptions).name('AI Model').onChange(value => propsRef.current.onMenuSettingChange('selectedModelId', value));
        aiConfigFolder.add({ configure: () => propsRef.current.toggleAiConfigModal() }, 'configure').name('Configure AI...');
        aiConfigFolder.add(menuSettings, 'aiCallCount').name('API Calls').listen().disable();
        const aiModesFolder = aiFolder.addFolder('Modes').open();
        controlsRef.current.aiMuseToggle = aiModesFolder.add(menuSettings, 'showAiMuse').name('AI Muse').onChange(value => propsRef.current.onMenuSettingChange('showAiMuse', value));
        controlsRef.current.aiCopilotToggle = aiModesFolder.add(menuSettings, 'enableAiCopilotMode').name('AI Co-pilot').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableAiCopilotMode', value));
        controlsRef.current.psyCoreModulatorToggle = aiModesFolder.add(menuSettings, 'enablePsyCoreModulatorMode').name('Psy-Core Modulator').onChange(value => propsRef.current.onMenuSettingChange('enablePsyCoreModulatorMode', value));
        
        const aiDebugFolder = gui.addFolder('Debug & Local Server').close();
        aiDebugFolder.add(menuSettings, 'showAiDebugLog').name('Show Debug Log').onChange(value => propsRef.current.onMenuSettingChange('showAiDebugLog', value));
        aiDebugFolder.add(menuSettings, 'showLocalAiPanel').name('Show Local Server').onChange(value => propsRef.current.onMenuSettingChange('showLocalAiPanel', value));
        aiDebugFolder.add(menuSettings, 'showMemoryDebug').name('Show Memory Stats').onChange(value => propsRef.current.onMenuSettingChange('showMemoryDebug', value));
        
        const testRunners = { runFullOn: runFullOnTest, runPsyChill: runPsyChillTest };
        aiDebugFolder.add(testRunners, 'runFullOn').name('Morph to Full-On');
        aiDebugFolder.add(testRunners, 'runPsyChill').name('Morph to Psy-Chill');


        // --- System & HNM Folder ---
        systemFolder.add(menuSettings, 'enableSpeechCommands').name('Enable Speech').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableSpeechCommands', value));
        systemFolder.add(menuSettings, 'enableLongPressToggleUI').name('Long-press UI Toggle').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableLongPressToggleUI', value));
        systemFolder.add({ hide: () => propsRef.current.onMenuSettingChange('isUiVisible', false) }, 'hide').name('Hide UI (H)');
        systemFolder.add({ reset: () => propsRef.current.resetMenuToDefaults() }, 'reset').name('Reset Menu Defaults');
        systemFolder.add({ reset: () => propsRef.current.resetHnmRag() }, 'reset').name('Reset HNM/RAG State');
        systemFolder.add(menuSettings, 'enableInstrumentTuningMode').name('Instrument Tuning Mode').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableInstrumentTuningMode', value));
        systemFolder.add(menuSettings, 'playerInfluence', 0, 1, 0.01).name('Bio-Feedback Influence').onChange((v:number) => propsRef.current.onMenuSettingChange('playerInfluence', v));
        systemFolder.add(menuSettings, 'hnmModulationDepth', 0, 1, 0.01).name('HNM Synth Modulation').onChange((v:number) => propsRef.current.onMenuSettingChange('hnmModulationDepth', v));
        systemFolder.add(menuSettings, 'explorationInfluence', 0, 1, 0.01).name('HNM Anomaly Explor.').onChange((v:number) => propsRef.current.onMenuSettingChange('explorationInfluence', v));
        systemFolder.add(menuSettings, 'micFeedbackToL0Strength', 0, 1, 0.01).name('MicDiff Ext.Strength(L0)').onChange((v:number) => propsRef.current.onMenuSettingChange('micFeedbackToL0Strength', v));
        const hnmTrainingFolder = systemFolder.addFolder('HNM Training (Experimental)').close();
        hnmTrainingFolder.add(menuSettings, 'enableHnmTraining').name('Enable Training').onChange(value => propsRef.current.onMenuSettingChange('enableHnmTraining', value));
        hnmTrainingFolder.add(menuSettings, 'hnmLearningRate', 0.00001, 0.005, 0.00001).name('Learning Rate').onChange(value => propsRef.current.onMenuSettingChange('hnmLearningRate', value));
        hnmTrainingFolder.add(menuSettings, 'hnmWeightDecay', 0.0, 0.001, 0.00001).name('Weight Decay').onChange(value => propsRef.current.onMenuSettingChange('hnmWeightDecay', value));
        hnmTrainingFolder.add({ train: () => propsRef.current.handleTrainOnArtifacts() }, 'train').name('Train on Artifacts');
        const generativeFolder = systemFolder.addFolder('Psy-Tek Framework');
        controlsRef.current.energyController = generativeFolder.add(menuSettings, 'energyLevel', 0, 1, 0.01).name('Energy Level').onChange((v:number) => propsRef.current.onMenuSettingChange('energyLevel', v));
        controlsRef.current.complexityController = generativeFolder.add(menuSettings, 'harmonicComplexity', 0, 1, 0.01).name('Harmonic Complexity').onChange((v:number) => propsRef.current.onMenuSettingChange('harmonicComplexity', v));
        controlsRef.current.moodController = generativeFolder.add(menuSettings, 'mood', { Light: 0, Twilight: 1, Dark: 2 }).name('Mood').onChange((v:number) => propsRef.current.onMenuSettingChange('mood', Number(v)));
        generativeFolder.add(menuSettings, 'masterBPM', 60, 220, 1).name('Master BPM').onChange((v:number) => propsRef.current.onMenuSettingChange('masterBPM', v));
        
        // --- Instruments & FX Folder (populated by helper) ---
        createInstrumentAndFxGui(instrumentsFolder, menuSettings, (k, v) => propsRef.current.onMenuSettingChange(k, v));
        
        guiRef.current = gui;

        return () => {
            guiRef.current?.destroy();
            guiRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    // Effect to handle disabling of controls based on app state
    useEffect(() => {
        if (!guiRef.current) return;
        guiRef.current.domElement.style.display = isUiVisible ? 'block' : 'none';
        
        const setControllerDisabled = (controller: any, isDisabled: boolean) => {
            if (controller) {
                controller.domElement.style.pointerEvents = isDisabled ? 'none' : 'auto';
                (controller.domElement.parentElement as HTMLElement).style.opacity = isDisabled ? '0.5' : '1';
            }
        };

        const isPsyCoreModulatorActive = menuSettings.enablePsyCoreModulatorMode;
        const isCopilotActive = menuSettings.enableAiCopilotMode;
        
        // Handle generative control states
        const isGenerativeControlDisabled = isPsyCoreModulatorActive || isCopilotActive;
        setControllerDisabled(controlsRef.current.energyController, isGenerativeControlDisabled);
        setControllerDisabled(controlsRef.current.complexityController, isGenerativeControlDisabled);
        setControllerDisabled(controlsRef.current.moodController, isGenerativeControlDisabled);
        
        // Handle AI mode toggle states
        setControllerDisabled(controlsRef.current.aiMuseToggle, isPsyCoreModulatorActive || isCopilotActive);
        setControllerDisabled(controlsRef.current.psyCoreModulatorToggle, isDisabled || isCopilotActive);
        setControllerDisabled(controlsRef.current.aiCopilotToggle, isDisabled || isCopilotActive);

    }, [isUiVisible, isDisabled, menuSettings.enableAiCopilotMode, menuSettings.enablePsyCoreModulatorMode]);

    // Update GUI when state props change from outside
    useEffect(() => {
        if (!guiRef.current) return;
        // This is a "heavy" way to update, but lil-gui doesn't have a great react-style binding model.
        // It ensures that external state changes (like from AI) are reflected in the GUI.
        guiRef.current.controllersRecursive().forEach(controller => {
            if (Object.prototype.hasOwnProperty.call(menuSettings, controller.property)) {
                const liveValue = menuSettings[controller.property as keyof MenuSettings];
                // lil-gui controllers only handle primitive types.
                // We check if the value is a primitive and if it has changed.
                if (typeof liveValue === 'string' || typeof liveValue === 'number' || typeof liveValue === 'boolean') {
                    if (controller.object[controller.property] !== liveValue) {
                        // setValue is generic, but we've ensured it's a primitive.
                        controller.setValue(liveValue);
                    }
                }
            }
        });
    }, [menuSettings]);

    return null;
};

export default GuiController;