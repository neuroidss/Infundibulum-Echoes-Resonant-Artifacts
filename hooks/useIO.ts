

import { useRef, useCallback } from 'react';
import type { InputState, MenuSettings } from '../types';
import { MIC_FFT_SIZE, ACCEL_FFT_SIZE, LONG_PRESS_DURATION_MS, RESET_SECOND_TAP_WINDOW_MS, FULLSCREEN_REQUESTED_KEY } from '../constants';
import { clamp } from '../lib/utils';
import { SpeechRecognitionController } from '../lib/speech';

const audioWorkletCode = `
const WORKLET_STATE_SIZE = ${64};
function fract(n){return n-Math.floor(n);} function lerp(a,b,t){return a+(b-a)*t;} function clamp(v,min,max){return Math.min(max,Math.max(min,v));} function hash(n){return fract(Math.sin(n*12.9898)*43758.5);} function softClip(x, k = 1.0) { return Math.tanh(x * k); } function mtof(m) { return 440.0 * Math.pow(2.0, (m - 69.0) / 12.0); }
class SVF{ constructor(){this.z1=0;this.z2=0;this.g=0;this.k=0;this.inv_den=0;this.type='lp';} setParams(cutoffNorm,resNorm,sampleRate,type='lp'){ const f=20*Math.pow(1000,clamp(cutoffNorm,.001,.999)); const q=0.5+clamp(resNorm,0,.98)*19.5; this.g=Math.tan(Math.PI*f/sampleRate); this.k=1/q; const g2=this.g*this.g; this.inv_den=1/(1+this.k*this.g+g2); this.type=type; } process(input){ const v0=input; const v1=(this.z1+this.g*(v0-this.z2))*this.inv_den; const v2=(this.z2+this.g*v1)*this.inv_den; this.z1=2*v1-this.z1; this.z2=2*v2-this.z2; if(this.type==='lp') return v2; if(this.type==='bp') return v1; if(this.type==='hp') return v0-this.k*v1-v2; if(this.type==='notch') return v0-this.k*v1; return v2; } }
class Envelope { constructor(sr) { this.sr = sr; this.level = 0; this.phase = 'off'; this.attack=0.01;this.decay=0.1;this.sustain=0.5;this.release=0.2;} trigger(attackS, decayS, sustainLvl, releaseS) { this.attack = Math.max(0.001, attackS); this.decay = Math.max(0.001, decayS); this.sustain = clamp(sustainLvl,0,1); this.release = Math.max(0.001, releaseS); this.phase = 'attack'; this.level = 0; } noteOff() { if(this.phase !== 'off') this.phase = 'release'; } process() { const srInv = 1.0 / this.sr; switch (this.phase) { case 'attack': this.level += srInv / this.attack; if (this.level >= 1) { this.level = 1; this.phase = 'decay'; } break; case 'decay': this.level -= (1 - this.sustain) * srInv / this.decay; if (this.level <= this.sustain) { this.level = this.sustain; this.phase = 'sustain'; } break; case 'sustain': break; case 'release': this.level -= this.level * srInv / this.release; if (this.level <= 0.0001) { this.level = 0; this.phase = 'off'; } break; case 'off': this.level = 0; break; } return this.level = clamp(this.level,0,1); } isActive() { return this.phase !== 'off';} }
class GenerativeProcessor extends AudioWorkletProcessor {
    constructor(options) { super(options); this.sr=sampleRate; this.phase=0; this.state=new Array(WORKLET_STATE_SIZE).fill(.5); this.lastBeatPhase=0; this.lastSixteenthPhase=0; this.beatCounter=0; this.sixteenthCounter=0; this.complexity=0.5; this.menuParams={}; this.lfoPhase={leadPitch:0, noiseFx:0, bassFilter:0, leadFilter:0}; this.kickEnv=new Envelope(this.sr); this.bassFEnv=new Envelope(this.sr); this.bassAEnv=new Envelope(this.sr); this.leadFEnv=new Envelope(this.sr); this.leadAEnv=new Envelope(this.sr); this.snareNoiseEnv=new Envelope(this.sr); this.snareBodyEnv=new Envelope(this.sr); this.filters={ bassL:new SVF(),bassR:new SVF(),leadL:new SVF(),leadR:new SVF(),hatL:new SVF(),hatR:new SVF(),snareNoiseL:new SVF(),snareNoiseR:new SVF(),snareBodyL:new SVF(),snareBodyR:new SVF(),noiseFxL:new SVF(),noiseFxR:new SVF() }; const maxDelaySeconds=1.2; this.delayBuffer=[new Float32Array(Math.ceil(this.sr*maxDelaySeconds)), new Float32Array(Math.ceil(this.sr*maxDelaySeconds))]; this.delayWritePos=[0,0]; const combDelaysSeconds=[.0311,.0383,.0427,.0459]; const createCombBuf=s=>new Float32Array(Math.ceil(this.sr*s)); this.combBuffers=combDelaysSeconds.map(l=>[createCombBuf(l),createCombBuf(l)]); this.combWritePos=combDelaysSeconds.map(()=>[0,0]); this.combLastSample=combDelaysSeconds.map(()=>[0,0]); const apDelaysSeconds=[.0053,.0121]; const createAPBuf=s=>new Float32Array(Math.ceil(this.sr*s)); this.apBuffers=apDelaysSeconds.map(l=>[createAPBuf(l),createAPBuf(l)]); this.apWritePos=apDelaysSeconds.map(()=>[0,0]); this.port.onmessage=(e)=>{ if(e.data.state?.length===WORKLET_STATE_SIZE)this.state=e.data.state; if(typeof e.data.complexity==='number')this.complexity=clamp(e.data.complexity,0,1); if(e.data.menuParams)this.menuParams=e.data.menuParams;}; console.log("PsySynth Worklet Initialized. SR:", this.sr); }
    static get parameterDescriptors(){ return[{name:'masterLevel',defaultValue:0.7,minValue:0,maxValue:1.0,automationRate:'a-rate'}];} 
    getStateVal(idx,defVal=0.5){return(this.state&&this.state[idx]!==undefined)?this.state[idx]:defVal;}
    getMenuParam(key,defVal=0.5){return(this.menuParams&&this.menuParams[key]!==undefined)?this.menuParams[key]:defVal;}
    process(inputs,outputs,parameters){
        const output=outputs[0]; const bufferSize=output[0].length; const masterLevelParam=parameters.masterLevel; const srInv=1.0/this.sr; const comp=this.complexity; const bpm=this.getMenuParam('masterBPM',140); const secondsPerBeat=60.0/clamp(bpm,40,260);
        const hnmKickMod=this.getStateVal(0); const hnmBassCutMod=this.getStateVal(2); const hnmBassResMod=this.getStateVal(3); const hnmLeadCutMod=this.getStateVal(6); const hnmLeadResMod=this.getStateVal(7); const hnmLeadPitchLfoRateMod=this.getStateVal(21); const hnmLeadPitchLfoDepthMod=this.getStateVal(18); const hnmHatTimeMod=this.getStateVal(28); const hnmSnareToneMod=this.getStateVal(38); const hnmNoiseCutMod=this.getStateVal(13); const hnmDelayTimeMod = this.getStateVal(31); const hnmReverbMixMod = this.getStateVal(10);
        const kickBasePitch = 30 + this.getMenuParam('kickTune',0.5)*40; const kickPitchEnvAmt = 500 + this.getMenuParam('kickPunch',0.7)*1500; const kickPitchDecay = 0.005 + this.getMenuParam('kickPunch',0.7)*0.03; const kickAmpDecay = 0.05 + this.getMenuParam('kickDecay',0.2)*0.25; const kickClick = this.getMenuParam('kickClick',0.5); const kickLevel = this.getMenuParam('kickLevel',0.8);
        const bassOscType = this.getMenuParam('bassOscType',0); const bassOct = Math.floor(this.getMenuParam('bassOctave',0.3)*3)-1; const bassBaseFreq = mtof(36 + bassOct*12); const bassCut = clamp(this.getMenuParam('bassCutoff',0.3) + (hnmBassCutMod-0.5)*0.2, 0.01, 0.95); const bassRes = clamp(this.getMenuParam('bassReso',0.6) + (hnmBassResMod-0.5)*0.3, 0.0, 0.95); const bassFEnvAmt = this.getMenuParam('bassEnvAmt',0.7); const bassFDecay = 0.01 + this.getMenuParam('bassFilterDecay',0.15)*0.2; const bassADecay = 0.01 + this.getMenuParam('bassAmpDecay',0.1)*0.3; const bassFilterLfoRateVal = this.getMenuParam('bassFilterLfoRate', 0.2) * 10; const bassFilterLfoDepthVal = this.getMenuParam('bassFilterLfoDepth', 0.3); const bassLevel = this.getMenuParam('bassLevel',0.7);
        const leadOscType = this.getMenuParam('leadOscType',0); const leadOct = Math.floor(this.getMenuParam('leadOctave',0.6)*3)-1; const leadBaseFreq = mtof(60 + leadOct*12); const leadPW = this.getMenuParam('leadPW',0.5); const leadCut = clamp(this.getMenuParam('leadCutoff',0.6) + (hnmLeadCutMod-0.5)*0.3, 0.01, 0.95); const leadRes = clamp(this.getMenuParam('leadReso',0.7) + (hnmLeadResMod-0.5)*0.3, 0.0, 0.95); const leadFEnvAmt = this.getMenuParam('leadEnvAmt',0.8); const leadFDecay = 0.01 + this.getMenuParam('leadFilterDecay',0.3)*0.5; const leadADecay = 0.01 + this.getMenuParam('leadAmpDecay',0.4)*0.8; const leadPitchLfoRate = (1 + this.getMenuParam('leadPitchLfoRate',0.5)*19) * (0.5 + (hnmLeadPitchLfoRateMod-0.5)*1.5); const leadPitchLfoDepth = this.getMenuParam('leadPitchLfoDepth',0.3)*12 * (0.5 + (hnmLeadPitchLfoDepthMod-0.5)*1.5); const leadFilterLfoRateVal = this.getMenuParam('leadFilterLfoRate', 0.3) * 15; const leadFilterLfoDepthVal = this.getMenuParam('leadFilterLfoDepth', 0.4); const leadLevel = this.getMenuParam('leadLevel',0.6);
        const hatClosedDecay = 0.005 + this.getMenuParam('hatClosedDecay',0.05)*0.05 * (0.5 + (hnmHatTimeMod-0.5)*0.8); const hatOpenDecay = 0.05 + this.getMenuParam('hatOpenDecay',0.25)*0.2 * (0.5 + (hnmHatTimeMod-0.5)*0.8); const baseHatHpfCut = this.getMenuParam('hatHpfCutoff',0.7); const hatToneVal = this.getMenuParam('hatTone', 0.5); const finalHatHpfCut = clamp(baseHatHpfCut + (hatToneVal - 0.5) * 0.3, 0.1, 0.95); const hatLevel = this.getMenuParam('hatLevel',0.5);
        const snareNoiseDecay = 0.01 + this.getMenuParam('snareNoiseDecay',0.08)*0.1; const snareNoiseLevelVal = this.getMenuParam('snareNoiseLevel',0.8); const snareBodyTune = 40 + this.getMenuParam('snareBodyTune',0.5)*160 * (0.8 + (hnmSnareToneMod-0.5)*0.4) ; const snareBodyDecay = 0.02 + this.getMenuParam('snareBodyDecay',0.15)*0.2; const snareBodyLevelVal = this.getMenuParam('snareBodyLevel', 0.5); const snareMasterLevel = this.getMenuParam('snareLevel',0.6);
        const noiseFxFiltTypeVal = this.getMenuParam('noiseFxFiltType',0); const noiseFxCut = clamp(this.getMenuParam('noiseFxCutoff',0.5) + (hnmNoiseCutMod-0.5)*0.4, 0.01,0.95); const noiseFxRes = this.getMenuParam('noiseFxReso',0.4); const noiseFxLfoRate = 0.1 + this.getMenuParam('noiseFxLfoRate',0.3)*5; const noiseFxLfoDepth = this.getMenuParam('noiseFxLfoDepth',0.6); const noiseFxLevel = this.getMenuParam('noiseFxLevel',0.4); 
        const delayTimeModeVal = this.getMenuParam('delayTimeMode',2); let delayTimeSec = secondsPerBeat*3/8; const delayTimeModFactor = 0.5 + (hnmDelayTimeMod-0.5)*0.9; if(delayTimeModeVal === 0) delayTimeSec = secondsPerBeat/4; else if(delayTimeModeVal === 1) delayTimeSec = secondsPerBeat/2; else if(delayTimeModeVal === 2) delayTimeSec = secondsPerBeat*3/8; else if(delayTimeModeVal === 3) delayTimeSec = secondsPerBeat; else if(delayTimeModeVal === 4) delayTimeSec = secondsPerBeat*2; delayTimeSec = Math.max(0.001, delayTimeSec * delayTimeModFactor);
        const delayFeedback = this.getMenuParam('delayFeedback',0.45); const delayMix = this.getMenuParam('delayMix',0.3);
        const reverbSize = this.getMenuParam('reverbSize',0.7); const reverbDamp = this.getMenuParam('reverbDamp',0.5); const reverbMix = this.getMenuParam('reverbMix',0.25) * (0.5 + (hnmReverbMixMod-0.5)*1.8);
        const lfoUpdateVal = bufferSize * srInv; this.lfoPhase.leadPitch = fract(this.lfoPhase.leadPitch + lfoUpdateVal * leadPitchLfoRate); this.lfoPhase.noiseFx = fract(this.lfoPhase.noiseFx + lfoUpdateVal * noiseFxLfoRate); this.lfoPhase.bassFilter = fract(this.lfoPhase.bassFilter + lfoUpdateVal * bassFilterLfoRateVal); this.lfoPhase.leadFilter = fract(this.lfoPhase.leadFilter + lfoUpdateVal * leadFilterLfoRateVal);
        const bassFilterLfoMod = Math.sin(this.lfoPhase.bassFilter * 2 * Math.PI) * bassFilterLfoDepthVal; this.filters.bassL.setParams(clamp(bassCut+bassFilterLfoMod,0.01,0.95),bassRes,this.sr,'lp'); this.filters.bassR.setParams(clamp(bassCut+bassFilterLfoMod,0.01,0.95),bassRes,this.sr,'lp'); 
        const leadFilterLfoMod = Math.sin(this.lfoPhase.leadFilter * 2 * Math.PI) * leadFilterLfoDepthVal; this.filters.leadL.setParams(clamp(leadCut+leadFilterLfoMod,0.01,0.95),leadRes,this.sr,'lp'); this.filters.leadR.setParams(clamp(leadCut+leadFilterLfoMod,0.01,0.95),leadRes,this.sr,'lp'); 
        this.filters.hatL.setParams(finalHatHpfCut,0.1,this.sr,'hp'); this.filters.hatR.setParams(finalHatHpfCut,0.1,this.sr,'hp'); this.filters.snareNoiseL.setParams(0.3,0.2,this.sr,'hp');this.filters.snareNoiseR.setParams(0.3,0.2,this.sr,'hp'); this.filters.snareBodyL.setParams(clamp(snareBodyTune/1000,0.05,0.8),0.5,this.sr,'bp');this.filters.snareBodyR.setParams(clamp(snareBodyTune/1000,0.05,0.8),0.5,this.sr,'bp'); const noiseFxFiltType = noiseFxFiltTypeVal < 0.33 ? 'lp' : (noiseFxFiltTypeVal < 0.66 ? 'hp' : 'bp'); this.filters.noiseFxL.setParams(clamp(noiseFxCut + Math.sin(this.lfoPhase.noiseFx*2*Math.PI)*noiseFxLfoDepth*0.5,0.01,0.95),noiseFxRes,this.sr,noiseFxFiltType); this.filters.noiseFxR.setParams(clamp(noiseFxCut + Math.cos(this.lfoPhase.noiseFx*2*Math.PI)*noiseFxLfoDepth*0.5,0.01,0.95),noiseFxRes,this.sr,noiseFxFiltType);

        for(let ch=0;ch<output.length;++ch){ const outCh=output[ch];
            for(let i=0;i<bufferSize;++i){
                const currentMasterLevel = masterLevelParam.length>1?masterLevelParam[i]:masterLevelParam[0]; const currentPhase=this.phase+i; const currentTime=currentPhase*srInv; const currentBeat=currentTime/secondsPerBeat; const beatPhase=fract(currentBeat); const sixteenthPhase=fract(currentBeat*4.0); const sixteenthNum=Math.floor(currentBeat*4.0); const beatTrig=beatPhase<this.lastBeatPhase; const sixteenthTrig=sixteenthPhase<this.lastSixteenthPhase; if(beatTrig)this.beatCounter=(this.beatCounter+1)%4; if(sixteenthTrig)this.sixteenthCounter=(this.sixteenthCounter+1)%16; this.lastBeatPhase=beatPhase;this.lastSixteenthPhase=sixteenthPhase;
                let kickSig=0; if(beatTrig && this.beatCounter===0){ this.kickEnv.trigger(0.002,kickAmpDecay,0,kickAmpDecay); } const kickEnvVal=this.kickEnv.process(); if(kickEnvVal>0){ const pitch=kickBasePitch+kickPitchEnvAmt*Math.exp(-this.kickEnv.level/kickPitchDecay); kickSig=Math.sin(currentTime*2*Math.PI*pitch)*kickEnvVal; kickSig+=(hash(currentTime*9000+ch)-.5)*kickClick*kickEnvVal*Math.exp(-this.kickEnv.level/0.002); }
                let bassSig=0; const playBass=this.getStateVal(4,0) < 0.5 ? (sixteenthTrig && (this.sixteenthCounter%2 !==0)) : (sixteenthTrig && [0,3,6,7,9,12,14,15].includes(this.sixteenthCounter)); if(playBass){ this.bassAEnv.trigger(0.005,bassADecay,0,bassADecay); this.bassFEnv.trigger(0.005,bassFDecay,0,bassFDecay);} const bassAEnvVal=this.bassAEnv.process(); const bassFEnvVal=this.bassFEnv.process(); if(bassAEnvVal>0){ let rawBass=0; const freq=bassBaseFreq*(1.0+(this.getStateVal(20,0.5)-0.5)*0.05); if(bassOscType<0.5) rawBass=(fract(currentTime*freq)*2-1); else rawBass=fract(currentTime*freq)<leadPW?1:-1; rawBass*=bassAEnvVal; const filt = ch===0?this.filters.bassL:this.filters.bassR; filt.setParams(clamp(bassCut+bassFEnvVal*bassFEnvAmt + bassFilterLfoMod,0.01,0.95),bassRes,this.sr,'lp'); bassSig=filt.process(rawBass); }
                let leadSig=0; const playLead = this.getStateVal(19,0) < 0.5 ? (sixteenthTrig && [0,4,7,10,13].includes(this.sixteenthCounter)) : (sixteenthTrig && (this.sixteenthCounter%3===0 || this.sixteenthCounter%5===0)); if(playLead){ this.leadAEnv.trigger(0.005,leadADecay,0,leadADecay); this.leadFEnv.trigger(0.005,leadFDecay,0,leadFDecay); } const leadAEnvVal=this.leadAEnv.process(); const leadFEnvVal=this.leadFEnv.process(); if(leadAEnvVal>0){ let rawLead=0; const pitchLfo = Math.sin(this.lfoPhase.leadPitch * 2 * Math.PI) * leadPitchLfoDepth; const freq = leadBaseFreq * Math.pow(2, pitchLfo/12); if(leadOscType<0.33) rawLead = (fract(currentTime*freq)*2-1); else if(leadOscType<0.66) rawLead = fract(currentTime*freq)<leadPW?1:-1; else rawLead = Math.sin(currentTime*2*Math.PI*freq + Math.sin(currentTime*2*Math.PI*freq*6)*0.3); rawLead*=leadAEnvVal; const filt=ch===0?this.filters.leadL:this.filters.leadR; filt.setParams(clamp(leadCut+leadFEnvVal*leadFEnvAmt + leadFilterLfoMod,0.01,0.95),leadRes,this.sr,'lp'); leadSig=filt.process(rawLead); }
                let hatSig=0; const playHatClosed=sixteenthTrig && this.sixteenthCounter%2 !==0; const playHatOpen=sixteenthTrig && this.sixteenthCounter%4===2; if(playHatClosed) hatSig+=(hash(currentTime*15000+ch)-.5)*Math.exp(-sixteenthPhase/hatClosedDecay); if(playHatOpen) hatSig+=(hash(currentTime*18000+ch)-.5)*Math.exp(-sixteenthPhase/hatOpenDecay); const hatFilt=ch===0?this.filters.hatL:this.filters.hatR; hatSig=hatFilt.process(hatSig);
                let snareSigPartNoise=0; let snareSigPartBody=0; if(beatTrig && (this.beatCounter===1 || this.beatCounter===3)){ this.snareNoiseEnv.trigger(0.001,snareNoiseDecay,0,snareNoiseDecay); this.snareBodyEnv.trigger(0.002,snareBodyDecay,0,snareBodyDecay); } const snareNEnvVal=this.snareNoiseEnv.process(); const snareBEnvVal=this.snareBodyEnv.process(); if(snareNEnvVal>0){ const noiseFilt=ch===0?this.filters.snareNoiseL:this.filters.snareNoiseR; snareSigPartNoise = noiseFilt.process((hash(currentTime*20000+ch)-.5)*snareNEnvVal) * snareNoiseLevelVal; } if(snareBEnvVal>0){ const bodyFilt=ch===0?this.filters.snareBodyL:this.filters.snareBodyR; snareSigPartBody = bodyFilt.process(Math.sin(currentTime*2*Math.PI*snareBodyTune)*snareBEnvVal) * snareBodyLevelVal; } const snareSig = (snareSigPartNoise + snareSigPartBody) * snareMasterLevel;
                let noiseFxSig=(hash(currentTime*1000+ch)-.5); const noiseFiltFx=ch===0?this.filters.noiseFxL:this.filters.noiseFxR; noiseFxSig=noiseFiltFx.process(noiseFxSig);
                let dryMix = kickSig*kickLevel + bassSig*bassLevel + leadSig*leadLevel + hatSig*hatLevel + snareSig + noiseFxSig*noiseFxLevel; dryMix = softClip(dryMix*0.7);
                let dwp=this.delayWritePos[ch]; const delayBuf=this.delayBuffer[ch]; const delayLen=delayBuf.length; const delayReadPos=(dwp - Math.floor(delayTimeSec*this.sr) + delayLen)%delayLen; const delayedSample=delayBuf[delayReadPos]; delayBuf[dwp]=softClip(dryMix + delayedSample*delayFeedback);
                let combSum=0; for(let c=0;c<this.combBuffers.length;c++){const cBuf=this.combBuffers[c][ch];const cLen=cBuf.length;const cReadPos=(this.combWritePos[c][ch]-cLen+cLen)%cLen;let cOut=cBuf[cReadPos];this.combLastSample[c][ch]=cOut*(1.0-reverbDamp*0.5)+this.combLastSample[c][ch]*reverbDamp*0.5; cBuf[this.combWritePos[c][ch]]=softClip(dryMix+this.combLastSample[c][ch]*reverbSize*0.95);combSum+=cOut;this.combWritePos[c][ch]=(this.combWritePos[c][ch]+1)%cLen;} combSum*=1.0/this.combBuffers.length;
                let apInput=combSum;let apOut=0; for(let a=0;a<this.apBuffers.length;a++){const aBuf=this.apBuffers[a][ch];const aLen=aBuf.length;const aReadPos=(this.apWritePos[a][ch]-aLen+aLen)%aLen;apOut=aBuf[aReadPos];const apProc=softClip(apInput+apOut*0.5);aBuf[this.apWritePos[a][ch]]=apProc;apInput=apOut-apProc*0.5;this.apWritePos[a][ch]=(this.apWritePos[a][ch]+1)%aLen;}
                const wetSignal=apInput;
                outCh[i]=softClip((dryMix*(1.0-delayMix-reverbMix) + delayedSample*delayMix + wetSignal*reverbMix) * currentMasterLevel * 0.8);
                this.delayWritePos[ch]=(dwp+1)%delayLen;
            }
        }
        this.phase+=bufferSize; return true;
    }
}
registerProcessor('generative-processor', GenerativeProcessor);
`;

interface UseIOProps {
    onSpeechCommand: (command: string) => void;
    setSpeechStatus: (status: string) => void;
    showError: (message: string) => void;
    showWarning: (message: string, duration?: number) => void;
    getMenuSettings: () => MenuSettings;
}

export const useIO = ({ onSpeechCommand, setSpeechStatus, showError, showWarning, getMenuSettings }: UseIOProps) => {
    const inputState = useRef<InputState>({
        touch: { x: 0.5, y: 0.5, active: false, pressure: 0, dx: 0, dy: 0, lastX: 0.5, lastY: 0.5 },
        motion: { alpha: 0, beta: 0, gamma: 0, available: false },
        mic: { level: 0, fft: new Float32Array(MIC_FFT_SIZE / 2).fill(-140), available: false, rhythmPeak: 0, rhythmTempo: 0 },
        accelerometer: { x: 0, y: 0, z: 0, magnitude: 0, available: false, history: new Array(ACCEL_FFT_SIZE).fill(0), rhythmPeak: 0, rhythmTempo: 0 },
        syncFactor: 0.0,
        currentTime: 0.0,
    });
    
    const audioContext = useRef<AudioContext | null>(null);
    const audioWorkletNode = useRef<AudioWorkletNode | null>(null);
    const audioCaptureDestination = useRef<MediaStreamAudioDestinationNode | null>(null);
    const speechController = useRef<SpeechRecognitionController | null>(null);
    const visualFeedback = useRef({ active: false, intensity: 0, startTime: 0, duration: 0.1 });
    const canvasRefForIO = useRef<HTMLCanvasElement | null>(null);

    const initAudio = useCallback(async (): Promise<boolean> => {
        if (audioContext.current) return true;
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 44100 });
            audioContext.current = context;
            await context.resume();

            const masterGain = context.createGain();
            masterGain.gain.setValueAtTime(1.0, context.currentTime);
            masterGain.connect(context.destination);

            const analyserNode = context.createAnalyser();
            analyserNode.fftSize = MIC_FFT_SIZE;
            analyserNode.smoothingTimeConstant = 0.5;
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
            const micStreamSource = context.createMediaStreamSource(stream);
            micStreamSource.connect(analyserNode);
            inputState.current.mic.available = true;
            
            const blob = new Blob([audioWorkletCode], { type: 'application/javascript' });
            const workletURL = URL.createObjectURL(blob);
            await context.audioWorklet.addModule(workletURL);
            const worklet = new AudioWorkletNode(context, 'generative-processor', { outputChannelCount:[2], parameterData:{ masterLevel: 0.7 } });
            worklet.connect(masterGain);
            audioWorkletNode.current = worklet;
            
            const captureDest = context.createMediaStreamDestination();
            worklet.connect(captureDest);
            audioCaptureDestination.current = captureDest;

            URL.revokeObjectURL(workletURL);
            return true;
        } catch (err) {
            console.error("Microphone access denied:", err);
            showWarning("Mic Disabled/Denied.", 5000);
            inputState.current.mic.available = false; 
            return false;
        }
    }, [showWarning]);

    const initialize = useCallback((canvas: HTMLCanvasElement, onInteraction: () => void) => {
        canvasRefForIO.current = canvas;
        speechController.current = new SpeechRecognitionController(onSpeechCommand, setSpeechStatus, (msg) => showWarning(msg, 6000));
        
        const resetGestureState = { pointerDownTime: 0, longPressDetected: false, longPressReleaseTime: 0, resetTimeout: null as ReturnType<typeof setTimeout> | null };

        const handlePointerDown = (e: PointerEvent) => {
            onInteraction();
            const now = performance.now();
            if (getMenuSettings().enableTapReset && resetGestureState.longPressDetected && (now - resetGestureState.longPressReleaseTime < RESET_SECOND_TAP_WINDOW_MS)) {
                onSpeechCommand('RESET'); // Simulate reset command
                return;
            }
            inputState.current.touch.active = true;
            resetGestureState.pointerDownTime = now;
            resetGestureState.longPressDetected = false;
        };

        const handlePointerUp = () => {
             const now = performance.now();
            if (inputState.current.touch.active) {
                if (getMenuSettings().enableTapReset) {
                    const pressDuration = now - resetGestureState.pointerDownTime;
                    if (pressDuration > LONG_PRESS_DURATION_MS) {
                        showWarning(`Long Press: Tap again within ${RESET_SECOND_TAP_WINDOW_MS}ms to Reset.`, RESET_SECOND_TAP_WINDOW_MS + 100);
                        resetGestureState.longPressDetected = true;
                        resetGestureState.longPressReleaseTime = now;
                        resetGestureState.resetTimeout = setTimeout(() => { resetGestureState.longPressDetected = false; showWarning('',0); }, RESET_SECOND_TAP_WINDOW_MS);
                    } else if (resetGestureState.longPressDetected) {
                        showWarning('',0);
                    }
                }
                inputState.current.touch.active = false;
            }
        };

        const handlePointerMove = (e: PointerEvent) => {
            const x = clamp(e.clientX / window.innerWidth, 0, 1);
            const y = 1.0 - clamp(e.clientY / window.innerHeight, 0, 1);
            inputState.current.touch.dx = x - inputState.current.touch.lastX;
            inputState.current.touch.dy = y - inputState.current.touch.lastY;
            inputState.current.touch.x = x;
            inputState.current.touch.y = y;
            inputState.current.touch.lastX = x;
            inputState.current.touch.lastY = y;
            inputState.current.touch.pressure = e.pressure ?? (inputState.current.touch.active ? 1.0 : 0);
        };

        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('pointerleave', handlePointerUp);
        canvas.addEventListener('pointermove', handlePointerMove);
        
        // Motion listeners
        const handleMotion = (e: DeviceMotionEvent | DeviceOrientationEvent) => {
            if ('alpha' in e) { inputState.current.motion = { alpha: e.alpha || 0, beta: e.beta || 0, gamma: e.gamma || 0, available: true }; }
            if ('accelerationIncludingGravity' in e && e.accelerationIncludingGravity) { const acc = e.accelerationIncludingGravity; const mag = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2); inputState.current.accelerometer = {...inputState.current.accelerometer, x:acc.x||0, y:acc.y||0, z:acc.z||0, magnitude:mag, available: true }; inputState.current.accelerometer.history.push(mag); if (inputState.current.accelerometer.history.length > ACCEL_FFT_SIZE) inputState.current.accelerometer.history.shift(); }
        };
        const requestMotionPermission = (type: 'deviceorientation' | 'devicemotion') => {
            const E = type === 'deviceorientation' ? DeviceOrientationEvent : DeviceMotionEvent;
            if (typeof (E as any).requestPermission === 'function') {
                (E as any).requestPermission().then((state: string) => {
                    if (state === 'granted') window.addEventListener(type, handleMotion);
                }).catch(console.error);
            } else {
                window.addEventListener(type, handleMotion);
            }
        };
        requestMotionPermission('deviceorientation');
        requestMotionPermission('devicemotion');

    }, [onSpeechCommand, setSpeechStatus, showError, showWarning, getMenuSettings]);
    
    const updateAudioWorklet = useCallback((state: any, complexity: number) => {
        if (audioWorkletNode.current) {
            audioWorkletNode.current.port.postMessage({
                state,
                complexity,
                menuParams: getMenuSettings()
            });
        }
    }, [getMenuSettings]);

    const captureAudioClip = useCallback((): Promise<{ mimeType: string, data: string } | null> => {
        return new Promise((resolve) => {
            if (!audioCaptureDestination.current?.stream || !audioCaptureDestination.current.stream.active) {
                console.error("Audio capture stream is not available.");
                resolve(null);
                return;
            }
            const mediaRecorder = new MediaRecorder(audioCaptureDestination.current.stream, { mimeType: 'audio/webm;codecs=opus' });
            const audioChunks: Blob[] = [];
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                if (audioChunks.length === 0) { resolve(null); return; }
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
                const reader = new FileReader();
                reader.onloadend = () => {
                    const [header, data] = (reader.result as string).split(',');
                    const mimeType = header.split(':')[1].split(';')[0];
                    resolve({ mimeType, data });
                };
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(audioBlob);
            };
            mediaRecorder.start();
            setTimeout(() => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 5000);
        });
    }, []);

    const captureImageClip = useCallback((): { mimeType: string; data: string } | null => {
        if (!canvasRefForIO.current) {
            console.error("Canvas for image capture is not available.");
            return null;
        }
        try {
            const dataUrl = canvasRefForIO.current.toDataURL('image/jpeg', 0.8);
            const [header, data] = dataUrl.split(',');
            if (!data) return null;
            const mimeType = header.split(':')[1].split(';')[0];
            return { mimeType, data };
        } catch (e) {
            console.error("Failed to capture image from canvas:", e);
            return null;
        }
    }, []);


    const triggerVisualFeedback = (intensity = 0.5, duration = 0.1) => {
        visualFeedback.current = {
            active: true,
            intensity: Math.max(visualFeedback.current.intensity, intensity),
            startTime: performance.now() / 1000.0,
            duration
        };
    };

    return {
        inputState,
        initAudio,
        initialize,
        updateAudioWorklet,
        captureAudioClip,
        captureImageClip,
        speechController,
        triggerVisualFeedback,
        visualFeedback,
    };
};