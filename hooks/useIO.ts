import { useRef, useCallback } from 'react';
import type { InputState, MenuSettings } from '../types';
import { MIC_FFT_SIZE, ACCEL_FFT_SIZE, LONG_PRESS_DURATION_MS, RESET_SECOND_TAP_WINDOW_MS, FULLSCREEN_REQUESTED_KEY } from '../constants';
import { clamp } from '../lib/utils';
import { SpeechRecognitionController } from '../lib/speech';

const audioWorkletCode = `
function fract(n){return n-Math.floor(n);} function lerp(a,b,t){return a+(b-a)*t;} function clamp(v,min,max){return Math.min(max,Math.max(min,v));} function softClip(x, k = 1.0) { return Math.tanh(x * k); } function mtof(m) { return 440.0 * Math.pow(2.0, (m - 69.0) / 12.0); }
class SVF{ constructor(){this.z1=0;this.z2=0;this.g=0;this.k=0;this.inv_den=0;this.type='lp';} setParams(cutoffNorm,resNorm,sampleRate,type='lp'){ const f=20*Math.pow(1000,clamp(cutoffNorm,.001,.999)); const q=0.5+clamp(resNorm,0,.98)*19.5; this.g=Math.tan(Math.PI*f/sampleRate); this.k=1/q; const g2=this.g*this.g; this.inv_den=1/(1+this.k*this.g+g2); this.type=type; } process(input){ const v0=input; const v1=(this.z1+this.g*(v0-this.z2))*this.inv_den; const v2=(this.z2+this.g*v1)*this.inv_den; this.z1=2*v1-this.z1; this.z2=2*v2-this.z2; if(this.type==='lp') return v2; if(this.type==='bp') return v1; if(this.type==='hp') return v0-this.k*v1-v2; if(this.type==='notch') return v0-this.k*v1; return v2; } }
class Envelope { constructor(sr) { this.sr = sr; this.level = 0; this.phase = 'off'; this.attack=0.01;this.decay=0.1;this.sustain=0.5;this.release=0.2;} trigger(attackS, decayS, sustainLvl, releaseS) { this.attack = Math.max(0.001, attackS); this.decay = Math.max(0.001, decayS); this.sustain = clamp(sustainLvl,0,1); this.release = Math.max(0.001, releaseS); this.phase = 'attack'; this.level = 0; } noteOff() { if(this.phase !== 'off') this.phase = 'release'; } process() { const srInv = 1.0 / this.sr; switch (this.phase) { case 'attack': this.level += srInv / this.attack; if (this.level >= 1) { this.level = 1; this.phase = 'decay'; } break; case 'decay': this.level -= (1 - this.sustain) * srInv / this.decay; if (this.level <= this.sustain) { this.level = this.sustain; this.phase = 'sustain'; } break; case 'sustain': break; case 'release': this.level -= this.level * srInv / this.release; if (this.level <= 0.0001) { this.level = 0; this.phase = 'off'; } break; case 'off': this.level = 0; break; } return this.level = clamp(this.level,0,1); } isActive() { return this.phase !== 'off';} }

class GenerativeProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this.sr = sampleRate; this.masterPhase = 0; this.params = {};
        this.lastBeatPhase = 0; this.lastSixteenthPhase = 0; this.beatCounter = 0; this.sixteenthCounter = 0; this.barCounter = 0;

        this.kickEnv = new Envelope(this.sr); this.kickPitchEnv = new Envelope(this.sr); 
        this.bassAEnv = new Envelope(this.sr); this.bassFEnv = new Envelope(this.sr); 
        this.leadAEnv = new Envelope(this.sr); this.leadFEnv = new Envelope(this.sr);
        this.snareNoiseEnv = new Envelope(this.sr); this.snareBodyEnv = new Envelope(this.sr);
        this.riserEnv = new Envelope(this.sr); this.riserPitchEnv = new Envelope(this.sr);
        this.rhythmEnv = new Envelope(this.sr); // Эта огибающая раньше не использовалась!
        this.leadSubPhase = 0;
        
        this.filters={ bassL:new SVF(),bassR:new SVF(), leadL:new SVF(), leadR:new SVF(), atmosL: new SVF(), atmosR: new SVF(), rhythmL:new SVF(),rhythmR:new SVF(),snareNoiseL:new SVF(),snareNoiseR:new SVF(),snareBodyL:new SVF(),snareBodyR:new SVF(),riserL:new SVF(),riserR:new SVF(), delayL: new SVF(), delayR: new SVF() };
        
        this.rootNote = 41; this.scales = { light: [0, 2, 4, 5, 7, 9, 11], twilight: [0, 1, 3, 5, 7, 8, 10], dark: [0, 1, 4, 5, 8, 10] }; this.activeScale = this.scales.twilight; this.lastMood = 1;
        
        this.targetBassFreq = mtof(this.rootNote - 12); this.currentBassFreq = this.targetBassFreq;
        this.targetLeadFreq = mtof(this.rootNote); this.currentLeadFreq = this.targetLeadFreq;
        
        this.snareBodyPhase1 = 0;
        this.rhythmOscPhases = Array(6).fill(0).map((_, i) => (i * 0.137) % 1);
        this.atmosPhase = 0; this.atmosSubPhase = 0;
        this.lfoPhase = { atmos: 0, riser: 0 };
        this.chaoticState = { x: 0.5, y: 0.5, z: 0.5 };

        const maxDelaySeconds=1.2; this.delayBuffer=[new Float32Array(Math.ceil(this.sr*maxDelaySeconds)), new Float32Array(Math.ceil(this.sr*maxDelaySeconds))]; this.delayWritePos=[0,0];
        const maxPreDelaySeconds = 0.25; this.preDelayBuffer = [new Float32Array(Math.ceil(this.sr*maxPreDelaySeconds)), new Float32Array(Math.ceil(this.sr*maxPreDelaySeconds))]; this.preDelayWritePos = [0,0];
        this.reverb = this.initReverb();
        
        this.port.onmessage = e => { if(e.data.params) this.params = e.data.params; };
    }
    
    initReverb() { const R = {}; R.combDelays = [.0311, .0383, .0427, .0459]; R.apDelays = [.0053, .0121]; R.createBuf = s => new Float32Array(Math.ceil(this.sr * s)); R.combBuffers = R.combDelays.map(l => [R.createBuf(l), R.createBuf(l)]); R.combWritePos = R.combDelays.map(() => [0, 0]); R.combLastSample = R.combDelays.map(() => [0, 0]); R.apBuffers = R.apDelays.map(l => [R.createBuf(l), R.createBuf(l)]); R.apWritePos = R.apDelays.map(() => [0, 0]); R.shimmerBuffer = [R.createBuf(0.5), R.createBuf(0.5)]; R.shimmerWritePos = [0,0]; return R; }
    
    logisticMapStep() { const r = 3.57 + (this.params.harmonicComplexity || 0.3) * 0.429; this.chaoticState.x = r * this.chaoticState.x * (1 - this.chaoticState.x); this.chaoticState.y = r * this.chaoticState.y * (1 - this.chaoticState.y); this.chaoticState.z = r * this.chaoticState.z * (1 - this.chaoticState.z); }
    d_hash(n) { return fract(Math.sin(n * 12.9898) * 43758.5); }
    shouldTrigger(density, seed) { const chaos = (this.chaoticState.x + this.chaoticState.y) / 2; const threshold = 1.0 - density; return (chaos + this.d_hash(this.sixteenthCounter + seed * 1.37)) / 2 > threshold; }
    
    process(inputs,outputs,parameters){
        const output=outputs[0]; const bufferSize=output[0].length; const srInv=1.0/this.sr; 
        const bpm = this.params.masterBPM || 140; const secondsPerBeat = 60.0/bpm;

        for(let ch=0;ch<output.length;++ch){ const outCh=output[ch];
            for(let i=0;i<bufferSize;++i){
                const currentTime= (this.masterPhase+i)*srInv; const currentBeat=currentTime/secondsPerBeat; const beatPhase=fract(currentBeat); const sixteenthPhase=fract(currentBeat*4.0); const beatTrig=beatPhase<this.lastBeatPhase; const sixteenthTrig=sixteenthPhase<this.lastSixteenthPhase;
                
                if(sixteenthTrig) { 
                    this.sixteenthCounter=(this.sixteenthCounter+1)%16; this.logisticMapStep();
                    if (this.shouldTrigger(this.params.kickPatternDensity || 0, 0.1) && this.sixteenthCounter % 4 === 0) { this.kickEnv.trigger(0.001,this.params.kickAmpDecay||0.4,0,this.params.kickAmpDecay||0.4); this.kickPitchEnv.trigger(0.001,this.params.kickPitchDecay||0.05,0,this.params.kickPitchDecay||0.05); }
                    if (this.shouldTrigger(this.params.bassPatternDensity || 0, 0.2)) { const noteIdx = Math.floor(this.chaoticState.x*this.activeScale.length*0.5); this.targetBassFreq = mtof(this.activeScale[noteIdx]+(this.params.bassOctave||1)*12-24); this.bassAEnv.trigger(0.005,this.params.bassAmpDecay||0.1,0.9,this.params.bassAmpDecay||0.1); this.bassFEnv.trigger(0.005,this.params.bassFilterDecay||0.15,0.9,this.params.bassFilterDecay||0.15); }
                    // ИСПРАВЛЕНИЕ БАГА #2: Используем правильные параметры \`lead...\`
                    if (this.shouldTrigger(this.params.leadPatternDensity || 0, 0.3)) { const noteIdx = Math.floor(this.activeScale.length*0.25+this.chaoticState.y*this.activeScale.length*0.5); this.targetLeadFreq = mtof(this.activeScale[noteIdx]+(this.params.leadOctave||1)*12); const velocity = 0.5 + this.chaoticState.z*0.5; this.leadAEnv.trigger(0.002,this.params.leadDecay||0.3,velocity,this.params.leadDecay||0.3); this.leadFEnv.trigger(0.002,this.params.leadDecay||0.3,velocity,this.params.leadDecay||0.3); }
                    if (this.shouldTrigger(this.params.snarePatternDensity || 0, 0.4) && (this.sixteenthCounter%8===4)) { this.snareNoiseEnv.trigger(0.001,this.params.snareNoiseDecay||0.08,0,this.params.snareNoiseDecay||0.08); this.snareBodyEnv.trigger(0.002,this.params.snareBodyDecay||0.15,0,this.params.snareBodyDecay||0.15); }
                    // ИСПРАВЛЕНИЕ БАГА #1: Триггерим настоящую огибающую для ритма
                    if (this.shouldTrigger(this.params.rhythmPatternDensity || 0, 0.5)) { const isOpen=this.sixteenthCounter%4!==0; const decay=isOpen?(this.params.rhythmOpenDecay||0.25):(this.params.rhythmClosedDecay||0.05); this.rhythmEnv.trigger(0.001, decay, 0, decay); }
                }
                
                let kickSig=0; const kEnv=this.kickEnv.process(); if(kEnv>0){ const kPitchEnv=this.kickPitchEnv.process(); const pitch=(this.params.kickTune||0.5)*40+20+(400+(this.params.kickAttack||0.8)*2000)*kPitchEnv; const clickNoise=(this.d_hash(currentTime*90000)*2-1)*kPitchEnv*0.5; const body=Math.sin((this.masterPhase+i)*srInv*2*Math.PI*pitch); kickSig=softClip((body*0.8+clickNoise*0.2)*(1+(this.params.kickDistortion||0.0)*5))*kEnv; }

                let bassSig=0; const bAEnv=this.bassAEnv.process(); const bFEnv=this.bassFEnv.process(); if(bAEnv>0){ const glide=Math.pow(0.5,(this.params.bassGlide||0.05)*200*srInv); this.currentBassFreq=(this.currentBassFreq*glide)+(this.targetBassFreq*(1-glide)); const f=this.currentBassFreq; const saw1=fract(currentTime*f*0.995)*2-1; const saw2=fract(currentTime*f*1.005)*2-1; let rawBass=(saw1+saw2)*0.5; rawBass=softClip(rawBass*(1+(this.params.bassDistortion||0)*4)); rawBass*=bAEnv; const filt=ch===0?this.filters.bassL:this.filters.bassR; const keyTrackedCutoff=(this.params.bassCutoff||0.3)+(Math.log2(clamp(this.currentBassFreq,20,20000)/40)/6)*(this.params.bassFilterKeyTrack||0.4); filt.setParams(clamp(keyTrackedCutoff+bFEnv*(this.params.bassEnvAmt||0.7),0.01,0.95),(this.params.bassReso||0.6),this.sr,'lp'); bassSig=filt.process(rawBass); }

                let leadSig=0; const lAEnv=this.leadAEnv.process(); const lFEnv=this.leadFEnv.process(); if(lAEnv>0){ const glide=Math.pow(0.5,0.1*200*srInv); this.currentLeadFreq=(this.currentLeadFreq*glide)+(this.targetLeadFreq*(1-glide)); const accentMod=1+(lAEnv.level>0.9?(this.params.leadAccentAmount||0.5):0); let rawLead=0; const waveformMix=this.params.leadWaveformMix||0; this.leadSubPhase+=this.currentLeadFreq*1.58*srInv; const modulator=Math.sin(this.leadSubPhase*2*Math.PI)*(this.params.leadFmAmount||0)*15*lFEnv; const bubblePart=Math.sin(currentTime*2*Math.PI*this.currentLeadFreq+modulator); let supersawPart=0; const numVoices=5; for(let v=0;v<numVoices;v++){const detune=1.0+(v-(numVoices-1)/2)*0.006; const phase=currentTime*this.currentLeadFreq*detune; supersawPart+=(fract(phase)*2-1);} supersawPart=supersawPart/numVoices; rawLead=lerp(bubblePart,supersawPart,waveformMix); rawLead=softClip(rawLead*(1+(this.params.leadDistortion||0)*4)); rawLead*=lAEnv; const filt=ch===0?this.filters.leadL:this.filters.leadR; filt.setParams(clamp((this.params.leadCutoff||0.6)*accentMod+lFEnv*(this.params.leadEnvAmt||0.8),0.01,0.95),clamp((this.params.leadReso||0.7)*accentMod,0,0.98),this.sr,'lp'); leadSig=filt.process(rawLead); }
                
                let atmosSig=0; const atmosLFO=Math.sin(((this.masterPhase+i)/this.sr)*0.1*2*Math.PI); const atmosFreq=mtof(this.activeScale[2]+this.rootNote-24); this.atmosPhase=fract(this.atmosPhase+atmosFreq*srInv*(1+atmosLFO*0.05)); this.atmosSubPhase=fract(this.atmosSubPhase+atmosFreq*1.5*srInv); let rawAtmos=Math.sin(this.atmosPhase*2*Math.PI+Math.sin(this.atmosSubPhase*2*Math.PI)*0.5); const atmosFilt=ch===0?this.filters.atmosL:this.filters.atmosR; atmosFilt.setParams(clamp((this.params.atmosCutoff||0.4)+atmosLFO*0.2,0.01,0.95),(this.params.atmosReso||0.6),this.sr,'lp'); atmosSig=atmosFilt.process(rawAtmos);
                
                // ИСПРАВЛЕНИЕ БАГА #1: Используем правильную огибающую
                let rhythmSig = 0; const rEnv = this.rhythmEnv.process(); if(rEnv > 0) { const noisePart = (this.d_hash(currentTime*90000+ch)*2-1)*(1-(this.params.rhythmMetallicAmount||0.6)); let metalPart=0; const baseMetalFreq=4000; for(let j=0;j<6;j++){this.rhythmOscPhases[j]=fract(this.rhythmOscPhases[j]+(baseMetalFreq*(1+j*0.13*(1+(this.params.harmonicComplexity||0.3))))*srInv);metalPart+=(fract(this.rhythmOscPhases[j])<0.5?1:-1);} metalPart=metalPart/6*(this.params.rhythmMetallicAmount||0.6); const rhythmFilt=ch===0?this.filters.rhythmL:this.filters.rhythmR; rhythmFilt.setParams(this.params.rhythmHpfCutoff||0.7,0.1,this.sr,'hp'); rhythmSig=rhythmFilt.process(noisePart+metalPart)*rEnv; }

                let snareSig=0; const sNEnv=this.snareNoiseEnv.process(); const sBEnv=this.snareBodyEnv.process(); if(sNEnv>0||sBEnv>0){const noiseFilt=ch===0?this.filters.snareNoiseL:this.filters.snareNoiseR;noiseFilt.setParams(this.params.snareNoiseCutoff||0.6,0.4,this.sr,'bp');const noisePart=noiseFilt.process((this.d_hash(currentTime*20000+ch)-.5)*sNEnv)*(this.params.snareNoiseLevel||0.8);const bodyFilt=ch===0?this.filters.snareBodyL:this.filters.snareBodyR;bodyFilt.setParams(clamp((this.params.snareBodyTune||0.5)*200/1000,0.05,0.8),0.5,this.sr,'bp');const bodyFreq=((this.params.snareBodyTune||0.5)*150)+180; this.snareBodyPhase1=fract(this.snareBodyPhase1+bodyFreq*srInv); const triBody=Math.asin(Math.sin(this.snareBodyPhase1*2*Math.PI))*(2/Math.PI);const bodyPart=bodyFilt.process(triBody*sBEnv)*(this.params.snareBodyLevel||0.5);snareSig=(noisePart+bodyPart)*(this.params.snareLevel||0.6);}

                const riserEnvVal=this.riserEnv.process(); let riserSig = 0; if(riserEnvVal>0){ const pitchMod=Math.pow(this.riserPitchEnv.process(),2)*(this.params.riserPitchSweep||0.7); const riserLFO=Math.sin(this.lfoPhase.riser*2*Math.PI); const riserFilt=ch===0?this.filters.riserL:this.filters.riserR; riserFilt.setParams(clamp((this.params.riserCutoff||0.2)+riserLFO*0.3,0.01,0.95),(this.params.riserReso||0.5),this.sr,'bp'); riserSig=riserFilt.process((this.d_hash(currentTime*40000+ch)*2-1))*riserEnvVal*Math.pow(2,pitchMod*4); }
                
                const sidechainGain=1.0-(Math.pow(kEnv,0.3)*0.9);
                // ИСПРАВЛЕНИЕ БАГА #2: Используем \`leadLevel\`, а не \`acidLevel\`
                let dryMix = (kickSig*(this.params.kickLevel||0)) + ((bassSig*(this.params.bassLevel||0)) + (leadSig*(this.params.leadLevel||0)) + (atmosSig*(this.params.atmosLevel||0)) + (rhythmSig*(this.params.rhythmLevel||0)) + (snareSig*(this.params.snareLevel||0)))*sidechainGain + (riserSig*(this.params.riserLevel||0));
                dryMix = softClip(dryMix*0.7);

                const R=this.reverb; const preDelayLen=this.preDelayBuffer[ch].length; const preDelayReadPos=(this.preDelayWritePos[ch]-Math.floor((this.params.reverbPreDelay||0.02)*this.sr)+preDelayLen)%preDelayLen; const preDelayedSample=this.preDelayBuffer[ch][preDelayReadPos]; this.preDelayBuffer[ch][this.preDelayWritePos[ch]]=dryMix; this.preDelayWritePos[ch]=(this.preDelayWritePos[ch]+1)%preDelayLen;
                const shimmerReadPos=(R.shimmerWritePos[ch]-Math.floor(this.sr*0.2)+R.shimmerBuffer[ch].length)%R.shimmerBuffer[ch].length; const shimmerSample=R.shimmerBuffer[ch][shimmerReadPos]*Math.pow(2,12/12); R.shimmerBuffer[ch][R.shimmerWritePos[ch]]=preDelayedSample; R.shimmerWritePos[ch]=(R.shimmerWritePos[ch]+1)%R.shimmerBuffer[ch].length;
                let reverbInput=preDelayedSample+shimmerSample*(this.params.reverbShimmer||0.3);
                let combSum=0; for(let c=0;c<R.combBuffers.length;c++){const cBuf=R.combBuffers[c][ch];const cLen=cBuf.length;const cReadPos=(R.combWritePos[c][ch]-cLen+cLen)%cLen;let cOut=cBuf[cReadPos];const damp=this.params.reverbDamp||0.5;R.combLastSample[c][ch]=cOut*(1-damp*0.5)+R.combLastSample[c][ch]*damp*0.5;const reverbFeedback=(this.params.reverbSize||0.7)*0.95;cBuf[R.combWritePos[c][ch]]=softClip(reverbInput+R.combLastSample[c][ch]*reverbFeedback);combSum+=cOut;R.combWritePos[c][ch]=(R.combWritePos[c][ch]+1)%cLen;} combSum*=1/R.combBuffers.length;
                let apInput=combSum,apOut=0;for(let a=0;a<R.apBuffers.length;a++){const aBuf=R.apBuffers[a][ch];const aLen=aBuf.length;const aReadPos=(R.apWritePos[a][ch]-aLen+aLen)%aLen;apOut=aBuf[aReadPos];const apProc=softClip(apInput+apOut*0.5);aBuf[R.apWritePos[a][ch]]=apProc;apInput=apOut-apProc*0.5;R.apWritePos[a][ch]=(R.apWritePos[a][ch]+1)%aLen;}
                const reverbSignal=apInput;
                
                const delayBuf=this.delayBuffer[ch]; const delayLen=delayBuf.length; let delayTimeSec=secondsPerBeat*3/8; const dtm=this.params.delayTimeMode||2; if(dtm===0)delayTimeSec=secondsPerBeat/4;else if(dtm===1)delayTimeSec=secondsPerBeat/2;else if(dtm===3)delayTimeSec=secondsPerBeat;else if(dtm===4)delayTimeSec=secondsPerBeat*2;
                const delayReadPos=(this.delayWritePos[ch]-Math.floor(delayTimeSec*this.sr)+delayLen)%delayLen; let delayedSample=delayBuf[delayReadPos];
                const dlyFilt=ch===0?this.filters.delayL:this.filters.delayR; dlyFilt.setParams(this.params.delayFilterCutoff||0.5,0.1,this.sr,'lp'); 
                const feedbackSignal=dlyFilt.process(delayedSample*(this.params.delayFeedback||0.45));
                const stereoFeedback=this.delayBuffer[ch===0?1:0][delayReadPos]*(this.params.delayStereo||0.3);
                // УЛУЧШЕНИЕ: Не добавляем dryMix в фидбэк петлю
                delayBuf[this.delayWritePos[ch]]=softClip(feedbackSignal+stereoFeedback);
                this.delayWritePos[ch]=(this.delayWritePos[ch]+1)%delayLen;
                
                const dMix=this.params.delayMix||0; const rMix=this.params.reverbMix||0;
                outCh[i]=softClip((dryMix*(1-dMix-rMix)+delayedSample*dMix+reverbSignal*rMix)*0.9);
                this.lastBeatPhase=beatPhase; this.lastSixteenthPhase=sixteenthPhase;
            }
        }
        this.masterPhase+=bufferSize; return true;
    }
}
registerProcessor('generative-processor', GenerativeProcessor);
`;

interface UseIOProps {
    onSpeechCommand: (command: string) => void;
    setSpeechStatus: (status: string) => void;
    showError: (message: string) => void;
    showWarning: (message: string, duration?: number) => void;
    onToggleUI: () => void;
    isLongPressUIToggleEnabled: boolean;
}

export const useIO = (props: UseIOProps) => {
    const propsRef = useRef(props);
    propsRef.current = props;

    const inputState = useRef<InputState>({
        touch: { x: 0.5, y: 0.5, active: false, pressure: 0, dx: 0, dy: 0, lastX: 0.5, lastY: 0.5 },
        motion: { alpha: 0, beta: 0, gamma: 0, available: false },
        mic: { level: 0, fft: new Float32Array(MIC_FFT_SIZE / 2).fill(-140), available: false, rhythmPeak: 0, rhythmTempo: 0 },
        accelerometer: { x: 0, y: 0, z: 0, magnitude: 0, available: false, history: new Array(ACCEL_FFT_SIZE).fill(0), rhythmPeak: 0, rhythmTempo: 0 },
        outputRhythm: { bpm: 140, density: 0.5 },
        syncFactor: 0.0,
        currentTime: 0.0,
    });
    
    const audioContext = useRef<AudioContext | null>(null);
    const masterGain = useRef<GainNode | null>(null);
    const audioWorkletNode = useRef<AudioWorkletNode | null>(null);
    const audioCaptureDestination = useRef<MediaStreamAudioDestinationNode | null>(null);
    const outputAnalyser = useRef<AnalyserNode | null>(null);
    const speechController = useRef<SpeechRecognitionController | null>(null);
    const visualFeedback = useRef({ active: false, intensity: 0, startTime: 0, duration: 0.1 });
    const canvasRefForIO = useRef<HTMLCanvasElement | null>(null);

    const handleWorkletMessage = useCallback((event: MessageEvent) => {
        if (event.data.type === 'rhythmUpdate') {
            inputState.current.outputRhythm = {
                bpm: event.data.bpm,
                density: event.data.density,
            };
        }
    }, []);

    const initAudio = useCallback(async (): Promise<boolean> => {
        if (audioContext.current) return true;
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 44100 });
            audioContext.current = context;
            await context.resume();

            masterGain.current = context.createGain();
            masterGain.current.gain.setValueAtTime(1.0, context.currentTime);
            masterGain.current.connect(context.destination);

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
            const worklet = new AudioWorkletNode(context, 'generative-processor', { outputChannelCount:[2] });
            worklet.port.onmessage = handleWorkletMessage;
            worklet.connect(masterGain.current);
            audioWorkletNode.current = worklet;
            
            // Capture destination for recording output
            const captureDest = context.createMediaStreamDestination();
            worklet.connect(captureDest);
            audioCaptureDestination.current = captureDest;

            // Analyser for spectrogram of output
            const outAnalyser = context.createAnalyser();
            outAnalyser.fftSize = 512;
            outAnalyser.smoothingTimeConstant = 0.3;
            worklet.connect(outAnalyser);
            outputAnalyser.current = outAnalyser;

            URL.revokeObjectURL(workletURL);
            return true;
        } catch (err) {
            console.error("Microphone access denied:", err);
            propsRef.current.showWarning("Mic Disabled/Denied.", 5000);
            inputState.current.mic.available = false; 
            return false;
        }
    }, [handleWorkletMessage]);

    const setMasterGain = useCallback((level: number, rampTime: number = 0.05) => {
        if (masterGain.current && audioContext.current) {
            masterGain.current.gain.linearRampToValueAtTime(level, audioContext.current.currentTime + rampTime);
        }
    }, []);

    const initialize = useCallback((canvas: HTMLCanvasElement) => {
        const onInteraction = () => {
             if (audioContext.current?.state === 'suspended') {
                audioContext.current.resume();
            }
        }
        canvasRefForIO.current = canvas;
        speechController.current = new SpeechRecognitionController(
            (cmd) => propsRef.current.onSpeechCommand(cmd),
            (status) => propsRef.current.setSpeechStatus(status),
            (msg) => propsRef.current.showWarning(msg, 6000)
        );
        
        const gestureState = { 
            pointerDownTime: 0, 
            longPressDetected: false, 
            longPressReleaseTime: 0, 
            resetTimeout: null as ReturnType<typeof setTimeout> | null,
        };

        const handlePointerDown = (e: PointerEvent) => {
            onInteraction();
            const now = performance.now();
            
            if (propsRef.current.isLongPressUIToggleEnabled && gestureState.longPressDetected && (now - gestureState.longPressReleaseTime < RESET_SECOND_TAP_WINDOW_MS)) {
                propsRef.current.onToggleUI();
                gestureState.longPressDetected = false;
                if (gestureState.resetTimeout) clearTimeout(gestureState.resetTimeout);
                propsRef.current.showWarning('', 0);
                return;
            }

            inputState.current.touch.active = true;
            gestureState.pointerDownTime = now;
            gestureState.longPressDetected = false;
        };

        const handlePointerUp = () => {
             const now = performance.now();
             const { showWarning: showWarningFn, isLongPressUIToggleEnabled } = propsRef.current;
            if (inputState.current.touch.active) {
                const pressDuration = now - gestureState.pointerDownTime;
                if (isLongPressUIToggleEnabled && pressDuration > LONG_PRESS_DURATION_MS) {
                    showWarningFn(`Long Press: Tap again to toggle UI.`, RESET_SECOND_TAP_WINDOW_MS + 100);
                    gestureState.longPressDetected = true;
                    gestureState.longPressReleaseTime = now;
                    gestureState.resetTimeout = setTimeout(() => { 
                        gestureState.longPressDetected = false; 
                        showWarningFn('',0); 
                    }, RESET_SECOND_TAP_WINDOW_MS);
                } else if (gestureState.longPressDetected) {
                    showWarningFn('',0);
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
            if ('accelerationIncludingGravity' in e && e.accelerationIncludingGravity) { 
                const acc = e.accelerationIncludingGravity; 
                const mag = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2); 
                inputState.current.accelerometer = {...inputState.current.accelerometer, x:acc.x||0, y:acc.y||0, z:acc.z||0, magnitude:mag, available: true }; 
                inputState.current.accelerometer.history.push(mag); if (inputState.current.accelerometer.history.length > ACCEL_FFT_SIZE) inputState.current.accelerometer.history.shift(); 
            }
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

    }, []);
    
    const updateAudioWorklet = useCallback((params: MenuSettings) => {
        if (audioWorkletNode.current) {
            audioWorkletNode.current.port.postMessage({ params });
        }
    }, []);

    const captureMultimodalContext = useCallback(async (options: {
        audio?: boolean;
        image?: boolean;
        spectrogram?: boolean;
    } = { audio: true, image: true, spectrogram: true }) => {

        const captureAudioClip = (): Promise<{ mimeType: string, data: string } | null> => {
            return new Promise((resolve) => {
                if (!audioCaptureDestination.current?.stream || !audioCaptureDestination.current.stream.active) {
                    console.error("Audio capture stream is not available.");
                    resolve(null); return;
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
        };

        const captureImageClip = (): { mimeType: string; data: string } | null => {
            if (!canvasRefForIO.current) return null;
            try {
                const dataUrl = canvasRefForIO.current.toDataURL('image/jpeg', 0.8);
                const [header, data] = dataUrl.split(',');
                if (!data) return null;
                const mimeType = header.split(':')[1].split(';')[0];
                return { mimeType, data };
            } catch (e) { console.error("Failed to capture image from canvas:", e); return null; }
        };

        const captureSpectrogramClip = (): { mimeType: string; data: string; rawData: Uint8Array } | null => {
            if (!outputAnalyser.current) return null;
            const analyser = outputAnalyser.current;
            const freqData = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(freqData);

            const canvas = document.createElement('canvas');
            const width = 256;
            const height = 128;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);
            const barWidth = width / analyser.frequencyBinCount;

            for (let i = 0; i < analyser.frequencyBinCount; i++) {
                const barHeight = (freqData[i] / 255) * height;
                const hue = 240 - (barHeight / 128) * 120; // from blue to magenta/red
                ctx.fillStyle = `hsl(${hue}, 90%, 65%)`;
                ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
            }
            
            const dataUrl = canvas.toDataURL('image/png');
            const [, data] = dataUrl.split(',');
            if (!data) return null;
            return { mimeType: 'image/png', data, rawData: new Uint8Array(freqData) };
        };

        const audioClipPromise = options.audio ? captureAudioClip() : Promise.resolve(null);
        const imageClip = options.image ? captureImageClip() : null;
        const spectrogramClip = options.spectrogram ? captureSpectrogramClip() : null;

        const audioClip = await audioClipPromise;

        return { audioClip, imageClip, spectrogramClip };

    }, [canvasRefForIO]);

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
        captureMultimodalContext,
        speechController,
        triggerVisualFeedback,
        visualFeedback,
        audioCaptureDestination,
        outputAnalyser,
        setMasterGain,
    };
};