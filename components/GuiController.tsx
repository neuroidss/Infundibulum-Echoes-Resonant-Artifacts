import React, { useEffect, useRef } from 'react';
import GUI from 'lil-gui';
import { MenuSettings, GenreEditState } from '../types';
import { GENRE_TARGET_STATES, GENRE_EDIT_SLIDER_COUNT, GENRE_EDIT_SLIDER_MAPPING, VERSION, AI_MODELS } from '../constants';

interface GuiControllerProps {
    menuSettings: MenuSettings;
    onMenuSettingChange: <K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => void;
    resetMenuToDefaults: () => void;
    resetHnmRag: () => void;
    genreEditState: GenreEditState;
    onGenreEditChange: (key: string, value: any) => void;
    loadSelectedGenreToSliders: () => void;
    saveSlidersToSelectedGenre: () => void;
    isDisabled: boolean;
    toggleAiConfigModal: () => void;
}

const GuiController: React.FC<GuiControllerProps> = ({
    menuSettings,
    onMenuSettingChange,
    resetMenuToDefaults,
    resetHnmRag,
    genreEditState,
    onGenreEditChange,
    loadSelectedGenreToSliders,
    saveSlidersToSelectedGenre,
    isDisabled,
    toggleAiConfigModal,
}) => {
    const guiRef = useRef<GUI | null>(null);
    const controlsRef = useRef<any>({});
    const propsRef = useRef({ onMenuSettingChange, onGenreEditChange, resetMenuToDefaults, resetHnmRag, loadSelectedGenreToSliders, saveSlidersToSelectedGenre, toggleAiConfigModal });
    propsRef.current = { onMenuSettingChange, onGenreEditChange, resetMenuToDefaults, resetHnmRag, loadSelectedGenreToSliders, saveSlidersToSelectedGenre, toggleAiConfigModal };


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
        controlsRef.current.genreAdaptToggle = aiModesFolder.add(menuSettings, 'enableGenreAdaptMode').name('Genre-Adapt').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableGenreAdaptMode', value));
        controlsRef.current.aiCopilotToggle = aiModesFolder.add(menuSettings, 'enableAiCopilotMode').name('AI Co-pilot').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableAiCopilotMode', value));
        
        const aiDebugFolder = aiFolder.addFolder('Debug').close();
        aiDebugFolder.add(menuSettings, 'showAiDebugLog').name('Show Debug Log').onChange(value => propsRef.current.onMenuSettingChange('showAiDebugLog', value));


        const systemFolder = gui.addFolder('System & State').open();
        systemFolder.add(menuSettings, 'enableSpeechCommands').name('Enable Speech').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableSpeechCommands', value));
        systemFolder.add(menuSettings, 'enableTapReset').name('Enable Tap Reset').onChange((value: boolean) => propsRef.current.onMenuSettingChange('enableTapReset', value));
        systemFolder.add({ reset: () => propsRef.current.resetMenuToDefaults() }, 'reset').name('Reset Menu Defaults');
        systemFolder.add({ reset: () => propsRef.current.resetHnmRag() }, 'reset').name('Reset HNM/RAG State');
        
        const hnmInfluenceFolder = gui.addFolder('HNM & Player Influence').open();
        hnmInfluenceFolder.add(menuSettings, 'playerInfluence', 0, 1, 0.01).name('Player Influence').onChange((v:number) => propsRef.current.onMenuSettingChange('playerInfluence', v));
        hnmInfluenceFolder.add(menuSettings, 'genreRuleInfluence', 0, 1, 0.01).name('Genre Rule Influence').onChange((v:number) => propsRef.current.onMenuSettingChange('genreRuleInfluence', v));
        hnmInfluenceFolder.add(menuSettings, 'micFeedbackToL0Strength', 0, 1, 0.01).name('MicDiff Ext.Strength(L0)').onChange((v:number) => propsRef.current.onMenuSettingChange('micFeedbackToL0Strength', v));
        hnmInfluenceFolder.add(menuSettings, 'explorationInfluence', 0, 1, 0.01).name('HNM Anomaly Explor.').onChange((v:number) => propsRef.current.onMenuSettingChange('explorationInfluence', v));

        const genreSelectFolder = gui.addFolder('Genre Selection').open();
        controlsRef.current.psyController = genreSelectFolder.add(menuSettings, 'psySpectrumPosition', 0, 1, 0.01).name('Psy Spectrum').onChange((v:number) => propsRef.current.onMenuSettingChange('psySpectrumPosition', v));
        controlsRef.current.darkController = genreSelectFolder.add(menuSettings, 'darknessModifier', 0, 1, 0.01).name('Darkness Modifier').onChange((v:number) => propsRef.current.onMenuSettingChange('darknessModifier', v));
        genreSelectFolder.add(menuSettings, 'masterBPM', 60, 220, 1).name('Master BPM').onChange((v:number) => propsRef.current.onMenuSettingChange('masterBPM', v));

        const kickFolder = gui.addFolder('Kick Drum').close();
        kickFolder.add(menuSettings, 'kickTune', 0, 1, 0.01).name('Tune').onChange((v:number) => propsRef.current.onMenuSettingChange('kickTune', v));
        kickFolder.add(menuSettings, 'kickPunch', 0, 1, 0.01).name('Punch').onChange((v:number) => propsRef.current.onMenuSettingChange('kickPunch', v));
        kickFolder.add(menuSettings, 'kickDecay', 0.01, 1, 0.01).name('Decay').onChange((v:number) => propsRef.current.onMenuSettingChange('kickDecay', v));
        kickFolder.add(menuSettings, 'kickClick', 0, 1, 0.01).name('Click').onChange((v:number) => propsRef.current.onMenuSettingChange('kickClick', v));
        kickFolder.add(menuSettings, 'kickLevel', 0, 1, 0.01).name('Level').onChange((v:number) => propsRef.current.onMenuSettingChange('kickLevel', v));

        const bassFolder = gui.addFolder('Bass').close();
        bassFolder.add(menuSettings, 'bassOscType', { Saw: 0, Square: 1 }).name('Osc Type').onChange((v:number) => propsRef.current.onMenuSettingChange('bassOscType', Number(v)));
        bassFolder.add(menuSettings, 'bassOctave', 0, 1, 0.01).name('Octave').onChange((v:number) => propsRef.current.onMenuSettingChange('bassOctave', v));
        bassFolder.add(menuSettings, 'bassCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v:number) => propsRef.current.onMenuSettingChange('bassCutoff', v));
        bassFolder.add(menuSettings, 'bassReso', 0, 1, 0.01).name('Reso').onChange((v:number) => propsRef.current.onMenuSettingChange('bassReso', v));
        bassFolder.add(menuSettings, 'bassEnvAmt', 0, 1, 0.01).name('Env Amt').onChange((v:number) => propsRef.current.onMenuSettingChange('bassEnvAmt', v));
        bassFolder.add(menuSettings, 'bassFilterDecay', 0.01, 0.5, 0.005).name('Filter Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('bassFilterDecay', v));
        bassFolder.add(menuSettings, 'bassAmpDecay', 0.01, 0.5, 0.005).name('Amp Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('bassAmpDecay', v));
        bassFolder.add(menuSettings, 'bassFilterLfoRate', 0, 1, 0.01).name('Filt LFO Rate').onChange((v: number) => propsRef.current.onMenuSettingChange('bassFilterLfoRate', v));
        bassFolder.add(menuSettings, 'bassFilterLfoDepth', 0, 1, 0.01).name('Filt LFO Depth').onChange((v: number) => propsRef.current.onMenuSettingChange('bassFilterLfoDepth', v));
        bassFolder.add(menuSettings, 'bassLevel', 0, 1, 0.01).name('Level').onChange((v:number) => propsRef.current.onMenuSettingChange('bassLevel', v));
        
        const leadFolder = gui.addFolder('Lead Synth').close();
        leadFolder.add(menuSettings, 'leadOscType', { Saw:0, Square:1, FMish:2 }).name('Osc Type').onChange((v:number) => propsRef.current.onMenuSettingChange('leadOscType', Number(v)));
        leadFolder.add(menuSettings, 'leadOctave', 0, 1, 0.01).name('Octave').onChange((v: number) => propsRef.current.onMenuSettingChange('leadOctave', v));
        leadFolder.add(menuSettings, 'leadPW', 0.05, 0.95, 0.01).name('Pulse Width').onChange((v: number) => propsRef.current.onMenuSettingChange('leadPW', v));
        leadFolder.add(menuSettings, 'leadCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v: number) => propsRef.current.onMenuSettingChange('leadCutoff', v));
        leadFolder.add(menuSettings, 'leadReso', 0, 1, 0.01).name('Reso').onChange((v: number) => propsRef.current.onMenuSettingChange('leadReso', v));
        leadFolder.add(menuSettings, 'leadEnvAmt', 0, 1, 0.01).name('Env Amt').onChange((v: number) => propsRef.current.onMenuSettingChange('leadEnvAmt', v));
        leadFolder.add(menuSettings, 'leadFilterDecay', 0.01, 1, 0.01).name('Filter Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('leadFilterDecay', v));
        leadFolder.add(menuSettings, 'leadAmpDecay', 0.01, 2, 0.01).name('Amp Decay').onChange((v:number) => propsRef.current.onMenuSettingChange('leadAmpDecay', v));
        leadFolder.add(menuSettings, 'leadPitchLfoRate', 0, 1, 0.01).name('Pitch LFO Rate').onChange((v: number) => propsRef.current.onMenuSettingChange('leadPitchLfoRate', v));
        leadFolder.add(menuSettings, 'leadPitchLfoDepth', 0, 1, 0.01).name('Pitch LFO Depth').onChange((v: number) => propsRef.current.onMenuSettingChange('leadPitchLfoDepth', v));
        leadFolder.add(menuSettings, 'leadFilterLfoRate', 0, 1, 0.01).name('Filt LFO Rate').onChange((v: number) => propsRef.current.onMenuSettingChange('leadFilterLfoRate', v));
        leadFolder.add(menuSettings, 'leadFilterLfoDepth', 0, 1, 0.01).name('Filt LFO Depth').onChange((v: number) => propsRef.current.onMenuSettingChange('leadFilterLfoDepth', v));
        leadFolder.add(menuSettings, 'leadLevel', 0, 1, 0.01).name('Level').onChange((v:number) => propsRef.current.onMenuSettingChange('leadLevel', v));

        const hatsFolder = gui.addFolder('Hi-Hats').close();
        hatsFolder.add(menuSettings, 'hatClosedDecay', 0.005, 0.2, 0.001).name('Closed Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('hatClosedDecay', v));
        hatsFolder.add(menuSettings, 'hatOpenDecay', 0.05, 0.5, 0.005).name('Open Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('hatOpenDecay', v));
        hatsFolder.add(menuSettings, 'hatHpfCutoff', 0.1, 1, 0.01).name('HPF Cutoff').onChange((v: number) => propsRef.current.onMenuSettingChange('hatHpfCutoff', v));
        hatsFolder.add(menuSettings, 'hatTone', 0, 1, 0.01).name('Tone Adjust').onChange((v: number) => propsRef.current.onMenuSettingChange('hatTone', v));
        hatsFolder.add(menuSettings, 'hatLevel', 0, 1, 0.01).name('Level').onChange((v: number) => propsRef.current.onMenuSettingChange('hatLevel', v));

        const snareFolder = gui.addFolder('Snare').close();
        snareFolder.add(menuSettings, 'snareNoiseLevel', 0, 1, 0.01).name('Noise Level').onChange((v: number) => propsRef.current.onMenuSettingChange('snareNoiseLevel', v));
        snareFolder.add(menuSettings, 'snareNoiseDecay', 0.01, 0.3, 0.005).name('Noise Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('snareNoiseDecay', v));
        snareFolder.add(menuSettings, 'snareBodyTune', 0, 1, 0.01).name('Body Tune').onChange((v: number) => propsRef.current.onMenuSettingChange('snareBodyTune', v));
        snareFolder.add(menuSettings, 'snareBodyDecay', 0.01, 0.5, 0.005).name('Body Decay').onChange((v: number) => propsRef.current.onMenuSettingChange('snareBodyDecay', v));
        snareFolder.add(menuSettings, 'snareBodyLevel', 0, 1, 0.01).name('Body Level').onChange((v: number) => propsRef.current.onMenuSettingChange('snareBodyLevel', v));
        snareFolder.add(menuSettings, 'snareLevel', 0, 1, 0.01).name('Master Level').onChange((v: number) => propsRef.current.onMenuSettingChange('snareLevel', v));
        
        const noiseFxFolder = gui.addFolder('Noise FX').close();
        noiseFxFolder.add(menuSettings, 'noiseFxFiltType', { LP:0, HP:1, BP:2 }).name('Filter Type').onChange((v: number) => propsRef.current.onMenuSettingChange('noiseFxFiltType', Number(v)));
        noiseFxFolder.add(menuSettings, 'noiseFxCutoff', 0.01, 1, 0.01).name('Cutoff').onChange((v: number) => propsRef.current.onMenuSettingChange('noiseFxCutoff', v));
        noiseFxFolder.add(menuSettings, 'noiseFxReso', 0, 1, 0.01).name('Resonance').onChange((v: number) => propsRef.current.onMenuSettingChange('noiseFxReso', v));
        noiseFxFolder.add(menuSettings, 'noiseFxLfoRate', 0, 1, 0.01).name('LFO Rate').onChange((v: number) => propsRef.current.onMenuSettingChange('noiseFxLfoRate', v));
        noiseFxFolder.add(menuSettings, 'noiseFxLfoDepth', 0, 1, 0.01).name('LFO Depth').onChange((v: number) => propsRef.current.onMenuSettingChange('noiseFxLfoDepth', v));
        noiseFxFolder.add(menuSettings, 'noiseFxLevel', 0, 1, 0.005).name('Level').onChange((v: number) => propsRef.current.onMenuSettingChange('noiseFxLevel', v));

        const fxFolder = gui.addFolder('FX Bus').close();
        fxFolder.add(menuSettings, 'delayTimeMode', { '1/16':0, '1/8':1, '3/16':2, '1/4':3, '1/2':4 }).name('Delay Time').onChange((v: number) => propsRef.current.onMenuSettingChange('delayTimeMode', Number(v)));
        fxFolder.add(menuSettings, 'delayFeedback', 0, 0.98, 0.01).name('Delay Feedback').onChange((v: number) => propsRef.current.onMenuSettingChange('delayFeedback', v));
        fxFolder.add(menuSettings, 'delayMix', 0, 1, 0.01).name('Delay Mix').onChange((v:number) => propsRef.current.onMenuSettingChange('delayMix', v));
        fxFolder.add(menuSettings, 'reverbSize', 0.1, 1, 0.01).name('Reverb Size').onChange((v: number) => propsRef.current.onMenuSettingChange('reverbSize', v));
        fxFolder.add(menuSettings, 'reverbDamp', 0, 1, 0.01).name('Reverb Damp').onChange((v: number) => propsRef.current.onMenuSettingChange('reverbDamp', v));
        fxFolder.add(menuSettings, 'reverbMix', 0, 1, 0.01).name('Reverb Mix').onChange((v:number) => propsRef.current.onMenuSettingChange('reverbMix', v));

        const genreEditFolder = gui.addFolder('Genre Editor (HNM Targets)').close();
        genreEditFolder.add(genreEditState, 'genreEdit_Selected', Object.keys(GENRE_TARGET_STATES)).name('Edit Genre').onChange(value => {
            propsRef.current.onGenreEditChange('genreEdit_Selected', value);
            propsRef.current.loadSelectedGenreToSliders();
        });
        genreEditFolder.add({ load: () => propsRef.current.loadSelectedGenreToSliders() }, 'load').name('Load to Sliders');
        for (let i = 0; i < GENRE_EDIT_SLIDER_COUNT; i++) {
            genreEditFolder.add(genreEditState, `genreEdit_Param${i}`, 0, 1, 0.01).name(`P${GENRE_EDIT_SLIDER_MAPPING[i]}`).onChange(value => propsRef.current.onGenreEditChange(`genreEdit_Param${i}`, value));
        }
        genreEditFolder.add({ save: () => propsRef.current.saveSlidersToSelectedGenre() }, 'save').name('Save Sliders to Genre');

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

        const isGenreAdaptActive = menuSettings.enableGenreAdaptMode;
        const isCopilotActive = menuSettings.enableAiCopilotMode;

        setControllerDisabled(controlsRef.current.psyController, isGenreAdaptActive || isCopilotActive);
        setControllerDisabled(controlsRef.current.darkController, isGenreAdaptActive || isCopilotActive);
        
        // Disable other AI modes if one is active
        setControllerDisabled(controlsRef.current.aiMuseToggle, isGenreAdaptActive || isCopilotActive);
        setControllerDisabled(controlsRef.current.genreAdaptToggle, isDisabled || isCopilotActive);
        setControllerDisabled(controlsRef.current.aiCopilotToggle, isDisabled || isGenreAdaptActive);

    }, [menuSettings.enableGenreAdaptMode, menuSettings.enableAiCopilotMode, isDisabled]);

    // Update GUI when state props change from outside
    useEffect(() => {
        if (!guiRef.current) return;
        guiRef.current.controllersRecursive().forEach(controller => {
            // Check if controller property exists in menuSettings before updating
            if (Object.prototype.hasOwnProperty.call(menuSettings, controller.property)) {
                // Check if the current value is different to prevent redundant updates
                if (controller.object[controller.property] !== menuSettings[controller.property as keyof MenuSettings]) {
                    controller.setValue(menuSettings[controller.property as keyof MenuSettings]);
                }
            }
            if (Object.prototype.hasOwnProperty.call(genreEditState, controller.property)) {
                 if (controller.object[controller.property] !== genreEditState[controller.property as keyof GenreEditState]) {
                    controller.setValue(genreEditState[controller.property as keyof GenreEditState]);
                }
            }
        });
    }, [menuSettings, genreEditState]);

    return null;
};

export default GuiController;