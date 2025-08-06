import React, { useEffect, useRef } from 'react';
import GUI from 'lil-gui';
import { MenuSettings } from './types';
import { VERSION, AI_MODELS } from './constants';

interface GuiControllerProps {
    menuSettings: MenuSettings;
    onMenuSettingChange: <K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => void;
    resetMenuToDefaults: () => void;
    resetHnmRag: () => void;
    isDisabled: boolean;
    toggleAiConfigModal: () => void;
    handleTrainOnArtifacts: () => void;
}

const GuiController: React.FC<GuiControllerProps> = ({
    menuSettings,
    onMenuSettingChange,
    resetMenuToDefaults,
    resetHnmRag,
    isDisabled,
    toggleAiConfigModal,
    handleTrainOnArtifacts
}) => {
    const guiRef = useRef<GUI | null>(null);
    const controlsRef = useRef<any>({});
    const propsRef = useRef({ onMenuSettingChange, resetMenuToDefaults, resetHnmRag, toggleAiConfigModal, handleTrainOnArtifacts });
    propsRef.current = { onMenuSettingChange, resetMenuToDefaults, resetHnmRag, toggleAiConfigModal, handleTrainOnArtifacts };


    useEffect(() => {
        if (guiRef.current) return;

        const gui = new GUI({ autoPlace: true, title: `Echoes Controls v${VERSION.split('-')[0]}` });
        gui.domElement.style.zIndex = '20';
        gui.domElement.style.top = '10px';
        gui.domElement.style.right = '10px';
        gui.domElement.style.maxHeight = 'calc(100vh - 20px)';
        gui.domElement.style.overflowY = 'auto';

        const aiFolder = gui.addFolder('AI').open();
        const modelOptions = AI_MODELS.reduce((acc, model) => {
            acc[model.name] = model.id;
            return acc;
        }, {} as Record<string, string>);
        
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

        const systemFolder = gui.addFolder('System & HNM').open();
        systemFolder.add(menuSettings, 'enableSpeechCommands').name('Enable Speech').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableSpeechCommands', value));
        systemFolder.add(menuSettings, 'enableTapReset').name('Enable Tap Reset').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableTapReset', value));
        systemFolder.add({ reset: () => propsRef.current.resetMenuToDefaults() }, 'reset').name('Reset Menu Defaults');
        systemFolder.add({ reset: () => propsRef.current.resetHnmRag() }, 'reset').name('Reset HNM/RAG State');
        systemFolder.add(menuSettings, 'playerInfluence', 0, 1, 0.01).name('Bio-Feedback Influence').onChange((v:number) => propsRef.current.onMenuSettingChange('playerInfluence', v));
        systemFolder.add(menuSettings, 'hnmModulationDepth', 0, 1, 0.01).name('HNM Synth Modulation').onChange((v:number) => propsRef.current.onMenuSettingChange('hnmModulationDepth', v));
        systemFolder.add(menuSettings, 'explorationInfluence', 0, 1, 0.01).name('HNM Anomaly Explor.').onChange((v:number) => propsRef.current.onMenuSettingChange('explorationInfluence', v));
        systemFolder.add(menuSettings, 'micFeedbackToL0Strength', 0, 1, 0.01).name('MicDiff Ext.Strength(L0)').onChange((v:number) => propsRef.current.onMenuSettingChange('micFeedbackToL0Strength', v));

        const hnmTrainingFolder = gui.addFolder('HNM Training (Experimental)').close();
        hnmTrainingFolder.add(menuSettings, 'enableHnmTraining').name('Enable Training').onChange(value => propsRef.current.onMenuSettingChange('enableHnmTraining', value));
        hnmTrainingFolder.add(menuSettings, 'hnmLearningRate', 0.00001, 0.005, 0.00001).name('Learning Rate').onChange(value => propsRef.current.onMenuSettingChange('hnmLearningRate', value));
        hnmTrainingFolder.add(menuSettings, 'hnmWeightDecay', 0.0, 0.001, 0.00001).name('Weight Decay').onChange(value => propsRef.current.onMenuSettingChange('hnmWeightDecay', value));
        hnmTrainingFolder.add({ train: () => propsRef.current.handleTrainOnArtifacts() }, 'train').name('Train on Artifacts');

        const generativeFolder = gui.addFolder('Psy-Tek Framework').open();
        controlsRef.current.energyController = generativeFolder.add(menuSettings, 'energyLevel', 0, 1, 0.01).name('Energy Level').onChange((v:number) => propsRef.current.onMenuSettingChange('energyLevel', v));
        controlsRef.current.complexityController = generativeFolder.add(menuSettings, 'harmonicComplexity', 0, 1, 0.01).name('Harmonic Complexity').onChange((v:number) => propsRef.current.onMenuSettingChange('harmonicComplexity', v));
        controlsRef.current.moodController = generativeFolder.add(menuSettings, 'mood', { Light: 0, Twilight: 1, Dark: 2 }).name('Mood').onChange((v:number) => propsRef.current.onMenuSettingChange('mood', Number(v)));
        generativeFolder.add(menuSettings, 'masterBPM', 60, 220, 1).name('Master BPM').onChange((v:number) => propsRef.current.onMenuSettingChange('masterBPM', v));

        const kickFolder = gui.addFolder('Kick Drum').close();
        kickFolder.add(menuSettings, 'kickPatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v:number) => propsRef.current.onMenuSettingChange('kickPatternDensity', v));
        kickFolder.add(menuSettings, 'kickTune', 0, 1, 0.01).name('Tune').onChange((v:number) => propsRef.current.onMenuSettingChange('kickTune', v));
        kickFolder.add(menuSettings, 'kickAttack', 0, 1, 0.01).name('Attack').onChange((v: number) => propsRef.current.onMenuSettingChange('kickAttack', v));
        kickFolder.add(menuSettings, 'kickPitchDecay', 0.005, 0.1, 0.001).name('Pitch Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('kickPitchDecay', v));
        kickFolder.add(menuSettings, 'kickAmpDecay', 0.05, 1, 0.01).name('Amp Decay').onChange((v:number) => propsRef.current.onMenuSettingChange('kickAmpDecay', v));
        kickFolder.add(menuSettings, 'kickDistortion', 0, 1, 0.01).name('Distortion').onChange((v: number) => propsRef.current.onMenuSettingChange('kickDistortion', v));
        kickFolder.add(menuSettings, 'kickLevel', 0, 1, 0.01).name('Level').onChange((v:number) => propsRef.current.onMenuSettingChange('kickLevel', v));

        const bassFolder = gui.addFolder('Bass').close();
        bassFolder.add(menuSettings, 'bassPatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v:number) => propsRef.current.onMenuSettingChange('bassPatternDensity', v));
        bassFolder.add(menuSettings, 'bassOscType', { Saw: 0, Square: 1 }).name('Osc Type').onChange((v:number) => propsRef.current.onMenuSettingChange('bassOscType', Number(v)));
        bassFolder.add(menuSettings, 'bassSubOscLevel', 0, 1, 0.01).name('Sub Osc Level').onChange((v: number) => propsRef.current.onMenuSettingChange('bassSubOscLevel', v));
        bassFolder.add(menuSettings, 'bassOctave', { 'Sub -2': 0, 'Sub -1': 1, 'Root': 2 }).name('Octave').onChange((v:number) => propsRef.current.onMenuSettingChange('bassOctave', Number(v)));
        bassFolder.add(menuSettings, 'bassPW', 0.05, 0.95, 0.01).name('Pulse Width').onChange((v: number) => propsRef.current.onMenuSettingChange('bassPW', v));
        bassFolder.add(menuSettings, 'bassGlide', 0, 0.2, 0.001).name('Glide').onChange((v: number) => propsRef.current.onMenuSettingChange('bassGlide', v));
        bassFolder.add(menuSettings, 'bassCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v:number) => propsRef.current.onMenuSettingChange('bassCutoff', v));
        bassFolder.add(menuSettings, 'bassReso', 0, 1, 0.01).name('Reso').onChange((v:number) => propsRef.current.onMenuSettingChange('bassReso', v));
        bassFolder.add(menuSettings, 'bassEnvAmt', 0, 1, 0.01).name('Env Amt').onChange((v:number) => propsRef.current.onMenuSettingChange('bassEnvAmt', v));
        bassFolder.add(menuSettings, 'bassFilterKeyTrack', 0, 1, 0.01).name('Key Track').onChange((v: number) => propsRef.current.onMenuSettingChange('bassFilterKeyTrack', v));
        bassFolder.add(menuSettings, 'bassFilterDecay', 0.01, 0.5, 0.005).name('Filter Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('bassFilterDecay', v));
        bassFolder.add(menuSettings, 'bassAmpDecay', 0.01, 0.5, 0.005).name('Amp Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('bassAmpDecay', v));
        bassFolder.add(menuSettings, 'bassLevel', 0, 1, 0.01).name('Level').onChange((v:number) => propsRef.current.onMenuSettingChange('bassLevel', v));
        
        const acidFolder = gui.addFolder('Acid Synth').close();
        acidFolder.add(menuSettings, 'acidPatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v: number) => propsRef.current.onMenuSettingChange('acidPatternDensity', v));
        acidFolder.add(menuSettings, 'acidOctave', { Low: 0, Mid: 1, High: 2 }).name('Octave').onChange((v: number) => propsRef.current.onMenuSettingChange('acidOctave', Number(v)));
        acidFolder.add(menuSettings, 'acidCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v: number) => propsRef.current.onMenuSettingChange('acidCutoff', v));
        acidFolder.add(menuSettings, 'acidReso', 0, 1, 0.01).name('Resonance').onChange((v: number) => propsRef.current.onMenuSettingChange('acidReso', v));
        acidFolder.add(menuSettings, 'acidEnvAmt', 0, 1, 0.01).name('Env Amount').onChange((v: number) => propsRef.current.onMenuSettingChange('acidEnvAmt', v));
        acidFolder.add(menuSettings, 'acidDecay', 0.01, 1, 0.01).name('Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('acidDecay', v));
        acidFolder.add(menuSettings, 'acidAccentAmount', 0, 1, 0.01).name('Accent').onChange((v: number) => propsRef.current.onMenuSettingChange('acidAccentAmount', v));
        acidFolder.add(menuSettings, 'acidLevel', 0, 1, 0.01).name('Level').onChange((v: number) => propsRef.current.onMenuSettingChange('acidLevel', v));

        const atmosFolder = gui.addFolder('Atmos Pad').close();
        atmosFolder.add(menuSettings, 'atmosOscType', { Saw: 0, FMish: 1 }).name('Osc Type').onChange((v: number) => propsRef.current.onMenuSettingChange('atmosOscType', Number(v)));
        atmosFolder.add(menuSettings, 'atmosEvolutionRate', 0, 1, 0.01).name('Evolution Rate').onChange((v: number) => propsRef.current.onMenuSettingChange('atmosEvolutionRate', v));
        atmosFolder.add(menuSettings, 'atmosCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v: number) => propsRef.current.onMenuSettingChange('atmosCutoff', v));
        atmosFolder.add(menuSettings, 'atmosReso', 0, 1, 0.01).name('Resonance').onChange((v: number) => propsRef.current.onMenuSettingChange('atmosReso', v));
        atmosFolder.add(menuSettings, 'atmosSpread', 0, 1, 0.01).name('Stereo Spread').onChange((v: number) => propsRef.current.onMenuSettingChange('atmosSpread', v));
        atmosFolder.add(menuSettings, 'atmosLevel', 0, 1, 0.01).name('Level').onChange((v: number) => propsRef.current.onMenuSettingChange('atmosLevel', v));
        
        const rhythmFolder = gui.addFolder('Rhythm Synth').close();
        rhythmFolder.add(menuSettings, 'rhythmPatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v: number) => propsRef.current.onMenuSettingChange('rhythmPatternDensity', v));
        rhythmFolder.add(menuSettings, 'rhythmClosedDecay', 0.005, 0.2, 0.001).name('Closed Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('rhythmClosedDecay', v));
        rhythmFolder.add(menuSettings, 'rhythmOpenDecay', 0.05, 0.5, 0.005).name('Open Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('rhythmOpenDecay', v));
        rhythmFolder.add(menuSettings, 'rhythmHpfCutoff', 0.1, 1, 0.01).name('HPF Cutoff').onChange((v: number) => propsRef.current.onMenuSettingChange('rhythmHpfCutoff', v));
        rhythmFolder.add(menuSettings, 'rhythmMetallicAmount', 0, 1, 0.01).name('Metallic').onChange((v: number) => propsRef.current.onMenuSettingChange('rhythmMetallicAmount', v));
        rhythmFolder.add(menuSettings, 'rhythmLevel', 0, 1, 0.01).name('Level').onChange((v: number) => propsRef.current.onMenuSettingChange('rhythmLevel', v));

        const snareFolder = gui.addFolder('Snare').close();
        snareFolder.add(menuSettings, 'snarePatternDensity', 0, 1, 0.01).name('Pattern Density').onChange((v: number) => propsRef.current.onMenuSettingChange('snarePatternDensity', v));
        snareFolder.add(menuSettings, 'snareFlamAmount', 0, 1, 0.01).name('Flam Amount').onChange((v: number) => propsRef.current.onMenuSettingChange('snareFlamAmount', v));
        snareFolder.add(menuSettings, 'snareNoiseLevel', 0, 1, 0.01).name('Noise Level').onChange((v: number) => propsRef.current.onMenuSettingChange('snareNoiseLevel', v));
        snareFolder.add(menuSettings, 'snareNoiseDecay', 0.01, 0.3, 0.005).name('Noise Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('snareNoiseDecay', v));
        snareFolder.add(menuSettings, 'snareNoiseCutoff', 0.01, 1, 0.01).name('Noise Cutoff').onChange((v: number) => propsRef.current.onMenuSettingChange('snareNoiseCutoff', v));
        snareFolder.add(menuSettings, 'snareBodyTune', 0, 1, 0.01).name('Body Tune').onChange((v: number) => propsRef.current.onMenuSettingChange('snareBodyTune', v));
        snareFolder.add(menuSettings, 'snareBodyDecay', 0.01, 0.5, 0.005).name('Body Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('snareBodyDecay', v));
        snareFolder.add(menuSettings, 'snareBodyLevel', 0, 1, 0.01).name('Body Level').onChange((v: number) => propsRef.current.onMenuSettingChange('snareBodyLevel', v));
        snareFolder.add(menuSettings, 'snareLevel', 0, 1, 0.01).name('Master Level').onChange((v: number) => propsRef.current.onMenuSettingChange('snareLevel', v));
        
        const riserFolder = gui.addFolder('Riser FX').close();
        riserFolder.add(menuSettings, 'riserTriggerRate', { Off:0, '4 Bars':1, '8 Bars':2, '16 Bars':3 }).name('Trigger Rate').onChange((v: number) => propsRef.current.onMenuSettingChange('riserTriggerRate', Number(v)));
        riserFolder.add(menuSettings, 'riserAttack', 0.01, 4, 0.01).name('Attack').onChange((v: number) => propsRef.current.onMenuSettingChange('riserAttack', v));
        riserFolder.add(menuSettings, 'riserDecay', 0.1, 8, 0.01).name('Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('riserDecay', v));
        riserFolder.add(menuSettings, 'riserPitchSweep', 0, 1, 0.01).name('Pitch Sweep').onChange((v: number) => propsRef.current.onMenuSettingChange('riserPitchSweep', v));
        riserFolder.add(menuSettings, 'riserCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v: number) => propsRef.current.onMenuSettingChange('riserCutoff', v));
        riserFolder.add(menuSettings, 'riserReso', 0, 1, 0.01).name('Resonance').onChange((v: number) => propsRef.current.onMenuSettingChange('riserReso', v));
        riserFolder.add(menuSettings, 'riserLevel', 0, 1, 0.005).name('Level').onChange((v: number) => propsRef.current.onMenuSettingChange('riserLevel', v));

        const fxFolder = gui.addFolder('Master FX Bus').close();
        fxFolder.add(menuSettings, 'delayTimeMode', { '1/16':0, '1/8':1, '3/16':2, '1/4':3, '1/2':4 }).name('Delay Time').onChange((v: number) => propsRef.current.onMenuSettingChange('delayTimeMode', Number(v)));
        fxFolder.add(menuSettings, 'delayFeedback', 0, 0.98, 0.01).name('Delay Feedback').onChange((v: number) => propsRef.current.onMenuSettingChange('delayFeedback', v));
        fxFolder.add(menuSettings, 'delayFilterCutoff', 0.05, 1, 0.01).name('Delay Filter').onChange((v: number) => propsRef.current.onMenuSettingChange('delayFilterCutoff', v));
        fxFolder.add(menuSettings, 'delayStereo', 0, 1, 0.01).name('Delay Stereo').onChange((v: number) => propsRef.current.onMenuSettingChange('delayStereo', v));
        fxFolder.add(menuSettings, 'delayMix', 0, 1, 0.01).name('Delay Mix').onChange((v:number) => propsRef.current.onMenuSettingChange('delayMix', v));
        fxFolder.add(menuSettings, 'reverbSize', 0.1, 1, 0.01).name('Reverb Size').onChange((v: number) => propsRef.current.onMenuSettingChange('reverbSize', v));
        fxFolder.add(menuSettings, 'reverbDamp', 0, 1, 0.01).name('Reverb Damp').onChange((v: number) => propsRef.current.onMenuSettingChange('reverbDamp', v));
        fxFolder.add(menuSettings, 'reverbPreDelay', 0, 0.2, 0.001).name('Reverb Pre-Delay').onChange((v: number) => propsRef.current.onMenuSettingChange('reverbPreDelay', v));
        fxFolder.add(menuSettings, 'reverbShimmer', 0, 1, 0.01).name('Reverb Shimmer').onChange((v: number) => propsRef.current.onMenuSettingChange('reverbShimmer', v));
        fxFolder.add(menuSettings, 'reverbMix', 0, 1, 0.01).name('Reverb Mix').onChange((v:number) => propsRef.current.onMenuSettingChange('reverbMix', v));
        
        guiRef.current = gui;

        return () => {
            guiRef.current?.destroy();
            guiRef.current = null;
        };
    }, []); 

    useEffect(() => {
        if (!guiRef.current) return;
        
        const setControllerDisabled = (controller: any, isDisabled: boolean) => {
            if (controller) {
                controller.domElement.style.pointerEvents = isDisabled ? 'none' : 'auto';
                (controller.domElement.parentElement as HTMLElement).style.opacity = isDisabled ? '0.5' : '1';
            }
        };

        const isPsyCoreModulatorActive = menuSettings.enablePsyCoreModulatorMode;
        const isCopilotActive = menuSettings.enableAiCopilotMode;
        
        const isGenerativeControlDisabled = isPsyCoreModulatorActive || isCopilotActive;
        setControllerDisabled(controlsRef.current.energyController, isGenerativeControlDisabled);
        setControllerDisabled(controlsRef.current.complexityController, isGenerativeControlDisabled);
        setControllerDisabled(controlsRef.current.moodController, isGenerativeControlDisabled);
        
        // Disable other AI modes if one is active
        setControllerDisabled(controlsRef.current.aiMuseToggle, isPsyCoreModulatorActive || isCopilotActive);
        setControllerDisabled(controlsRef.current.psyCoreModulatorToggle, isDisabled || isCopilotActive);
        setControllerDisabled(controlsRef.current.aiCopilotToggle, isDisabled || isPsyCoreModulatorActive);

    }, [menuSettings.enableAiCopilotMode, menuSettings.enablePsyCoreModulatorMode, isDisabled]);

    // Update GUI when state props change from outside
    useEffect(() => {
        if (!guiRef.current) return;
        guiRef.current.controllersRecursive().forEach(controller => {
            if (Object.prototype.hasOwnProperty.call(menuSettings, controller.property)) {
                if (controller.object[controller.property] !== menuSettings[controller.property as keyof MenuSettings]) {
                    controller.setValue(menuSettings[controller.property as keyof MenuSettings]);
                }
            }
        });
    }, [menuSettings]);

    return null;
};

export default GuiController;
