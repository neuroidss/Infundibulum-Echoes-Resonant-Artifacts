import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import * as THREE from 'three';
import { pipeline, env as xenovaEnv } from '@xenova/transformers';
import {
    VERSION, STATE_VECTOR_SIZE, INPUT_VECTOR_SIZE, EMBEDDING_DIM, MAX_ARTIFACTS,
    MAX_ACTIVE_ARTIFACTS_LOGIC, ARTIFACT_SIMILARITY_THRESHOLD, ARTIFACT_CREATION_INTERVAL_MS,
    ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MIN, ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MAX,
    EMBEDDING_MODEL_NAME, MIC_FFT_SIZE, ACCEL_FFT_SIZE, LOCAL_STORAGE_KEY, LOCAL_STORAGE_MENU_KEY,
    SPEECH_COMMANDS, SYNC_DECAY, ACCEL_ANALYSIS_INTERVAL_S, LONG_PRESS_DURATION_MS,
    RESET_SECOND_TAP_WINDOW_MS, FULLSCREEN_REQUESTED_KEY, HNM_VERBOSE, HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM,
    HNM_GENRE_RULE_EXTERNAL_SIGNAL_DIM, HNM_HIERARCHY_LEVEL_CONFIGS, HNM_POLICY_HEAD_INPUT_LEVEL_NAME,
    GENRE_TARGET_STATES, DEFAULT_MENU_SETTINGS, GENRE_EDIT_SLIDER_COUNT, GENRE_EDIT_SLIDER_MAPPING, clamp,
    TARGET_FPS, USE_DEBUG, SYNC_THRESHOLD, REASONABLE_SHADER_ARTIFACT_CAP
} from '../constants';
import { HierarchicalSystemV5_TFJS, disposeMemStateWeights, disposeHnsResultsTensors } from '../lib/hnm_core_v1';
import { generateMusicSettings, getGenreAdaptation } from '../lib/ai';
import type { MenuSettings, GenreEditState, InputState, Artifact, ActiveArtifactInfo, HnmState, HnmLastStepOutputs } from '../types';

declare var tf: any;

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
const fract = (n: number) => n - Math.floor(n);

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

const fragmentShader = (MAX_ARTIFACTS_SHADER: number) => `
    precision highp float;
    uniform float time; uniform vec2 resolution; uniform float mainState[${STATE_VECTOR_SIZE}];
    uniform int numActiveArtifacts;
    uniform float artifactStates[${MAX_ARTIFACTS_SHADER * STATE_VECTOR_SIZE}];
    uniform float artifactSimilarities[${MAX_ARTIFACTS_SHADER}];
    uniform float complexity; uniform float syncFactor; uniform float feedbackIntensity;
    varying vec2 vUv;
    #define PI 3.14159265359
    #define STATE_VEC_SIZE ${STATE_VECTOR_SIZE}
    float hash1(float n){ return fract(sin(n)*43758.5453); }
    vec2 hash2(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return -1.+2.*fract(sin(p)*43758.5453); }
    float noise(vec2 x){ vec2 p=floor(x); vec2 f=fract(x); f=f*f*(3.-2.*f); float n=p.x+p.y*57.; return mix(mix(hash1(n),hash1(n+1.),f.x),mix(hash1(n+57.),hash1(n+58.),f.x),f.y); }
    float fbm(vec2 p, float H, int octaves){ float G=exp2(-H); float f=1.; float a=1.; float t=0.; for(int i=0; i<10; i++){ if(i>=octaves) break; t+=a*noise(f*p); f*=2.; a*=G; } return t; }
    vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
    float pulse(float t, float freq){ return 0.5+0.5*cos(t*freq*2.*PI); }
    mat2 rotate2d(float a){ float s=sin(a); float c=cos(a); return mat2(c,-s,s,c); }
    float getArtifactState(int artIdx, int stateIdx){ if(artIdx < 0 || artIdx >= ${MAX_ARTIFACTS_SHADER} || stateIdx < 0 || stateIdx >= STATE_VEC_SIZE) return 0.5; int flatIdx = artIdx * STATE_VEC_SIZE + stateIdx; return artifactStates[flatIdx]; }
    float getMainStateSafe(int idx, float defaultVal) { if (idx >= 0 && idx < STATE_VEC_SIZE) { return mainState[idx]; } return defaultVal; }
    void main() { vec2 uv = vUv; vec2 centerUv = uv - 0.5; float distCenter = length(centerUv); float kick = getMainStateSafe(0, 0.5); float arpSpeed = 0.1 + getMainStateSafe(1, 0.5) * 2.5; float bassCut = getMainStateSafe(2, 0.5); float bright = 0.1 + getMainStateSafe(3, 0.5) * 0.7; float sat = 0.3 + getMainStateSafe(4, 0.5) * 0.7; float hueBase = getMainStateSafe(5, 0.5); float flowSpeed = 0.02 + getMainStateSafe(6, 0.0) * 0.45 * (0.5 + complexity * 1.5); float warpAmt = getMainStateSafe(7, 0.0) * 0.55 * (0.5 + complexity * 1.8); float compVal = getMainStateSafe(8, 0.5); float tempo = 80. + getMainStateSafe(9, 0.5) * 160.; float reverb = getMainStateSafe(10, 0.2) * (0.6 + complexity * 0.8); float leadDecay = getMainStateSafe(11, 0.5); float noiseInt = getMainStateSafe(12, 0.1) * 1.1 * (0.4 + complexity * 1.6); float vignette = 0.15 + getMainStateSafe(13, 0.5) * 0.8; float pulseInt = getMainStateSafe(14, 0.5) * 0.9; float masterVol = getMainStateSafe(15, 0.6); float grain = getMainStateSafe(20, 0.0) * 0.12 * (0.3 + complexity * 1.7); float rotationSpeed = (getMainStateSafe(21, 0.5) - 0.5) * 0.25 * (0.5 + complexity * 1.5); float compH = 0.3 + compVal * 0.6 * (0.3 + complexity * 1.2); int compOct = 1 + int(compVal * 6.0 * (0.4 + complexity * 1.4)); compOct = clamp(compOct, 1, 9); float globalPulse = pulse(time, 0.08 + complexity * 0.1); float globalRot = time * rotationSpeed; vec2 rotatedUv = rotate2d(globalRot) * centerUv + 0.5; float n = fbm(rotatedUv * (2.0 + complexity * 1.0) + time * 0.05, 0.5, 3); vec2 flowVec = vec2(cos(time * flowSpeed + globalPulse * 0.8), sin(time * flowSpeed * 1.2 + n * 0.1)) * (0.4 + complexity * 0.5); vec2 warpDir = hash2(rotatedUv * (2.5 + complexity * 1.5) + time * (0.05 + complexity * 0.1)); float warpEffect = warpAmt * (0.6 + noise(rotatedUv * (2.0+complexity*2.0) + time * (0.03+complexity*0.05)) * 0.4) * pow(1.0 - distCenter * 1.1, 2.8) * (1.0 + complexity * 1.2); vec2 warpOffset = warpDir * warpEffect; vec2 warpedUv = (rotatedUv - 0.5) * (1.0 - bassCut * 0.2 + kick * 0.1) + 0.5 + warpOffset; float baseFreq = 1.5 + arpSpeed * 4.0 * (0.7 + complexity * 0.6); n = fbm(warpedUv * baseFreq + flowVec + time*(0.02 + complexity * 0.04), compH, compOct); float hue = fract(hueBase + time * (0.02 + complexity * 0.03) + n * (0.08 + complexity*0.1) - bassCut * 0.25 + syncFactor * 0.15); float beatPulse = pulse(time, tempo / 60.0); float kickPulse = beatPulse * pow(kick, 1.8) * pulseInt; float finalBright = bright * (1.0 + kickPulse * 1.0 - pulseInt * 0.3 + masterVol * 0.3 + globalPulse * 0.15); finalBright *= pow(max(0., 1.0 - distCenter * distCenter * vignette * 3.0), 1.8); finalBright += (hash1(time * (15.0 + complexity * 10.0)) - 0.5) * (0.02 + complexity * 0.03); float trailEffect = reverb * leadDecay * (0.15 + complexity * 0.2); float trailN = fbm(warpedUv * (baseFreq*0.7) + flowVec*0.6 - time*0.03, compH*0.7, compOct-1); vec3 trailColor = hsv2rgb(vec3(fract(hue + 0.15 + complexity * 0.1), sat * 0.7, finalBright * 0.5)); vec3 finalColor = hsv2rgb(vec3(hue, sat, finalBright)) + trailColor * trailEffect * smoothstep(0.35, 0.65, trailN); for(int i = 0; i < numActiveArtifacts; ++i) { if (i >= ${MAX_ARTIFACTS_SHADER}) break; float sim = artifactSimilarities[i]; if(sim <= 0.05) continue; float artHueBase = getArtifactState(i, 5); float artSat = 0.3 + getArtifactState(i, 4) * 0.8; float artBright = 0.1 + getArtifactState(i, 3) * 0.8 * (0.6 + complexity * 0.7); float artTempo = 80. + getArtifactState(i, 9) * 160.; float artKick = getArtifactState(i, 0); float artCompVal = getArtifactState(i, 8); float artFlowSpeed = 0.01 + getArtifactState(i, 6) * 0.4 * (0.8 + complexity); float artSeed = hash1(float(i) * 1.37 + getArtifactState(i, 30)); float maskFreq = 2.0 + float(i) * 2.0 + artSeed * 3.0 + artCompVal * 4.0 * (0.8 + complexity * 0.5); float maskTime = time * 0.05 * (0.5 + float(i+1) * 0.7 + artSeed * 0.8 + artFlowSpeed * 6.0) * (0.8 + complexity * 0.8); float artMask = noise(rotatedUv * maskFreq + maskTime + artSeed * 7.0); artMask = smoothstep(0.38, 0.62, artMask); artMask *= sim * (0.6 + complexity * 0.8); float artHue = fract(artHueBase + time * (0.01 + complexity*0.01) + n * 0.05 + artSeed * 0.2); vec3 artColor = hsv2rgb(vec3(artHue, artSat, artBright * (1.0 + artKick * 0.6) )); finalColor = mix(finalColor, artColor, artMask * clamp(0.4 + complexity * 0.7, 0.1, 0.95)); float artBeatPulse = pulse(time, artTempo / 60.0); float echoIntensity = artBeatPulse * pow(artKick, 1.6) * sim * clamp(0.3 + complexity * 0.9, 0.1, 0.85); finalColor += vec3(echoIntensity * artMask) * artColor * 2.5; } finalColor += (hash1(dot(rotatedUv, vec2(12.9898, 78.233)) + time*(1.5 + complexity*0.5)) - 0.5) * grain * noiseInt * (0.8 + complexity * 0.8); finalColor = mix(finalColor, vec3(0.6, 0.7, 0.9), syncFactor * 0.15); finalColor += feedbackIntensity * vec3(1.0, 1.0, 0.9); gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0); }
`;

const audioWorkletCode = `
const WORKLET_STATE_SIZE = ${STATE_VECTOR_SIZE};
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

export const useInfundibulum = (canvasRef: RefObject<HTMLCanvasElement>) => {
    // UI State
    const [debugInfo, setDebugInfo] = useState('');
    const [warningInfo, setWarningInfo] = useState<{ message: string; visible: boolean }>({ message: 'Interact to initialize.', visible: true });
    const [loadingInfo, setLoadingInfo] = useState<{ message: string; progress: string; visible: boolean }>({ message: '', progress: '', visible: false });
    const [speechStatus, setSpeechStatus] = useState('Idle');
    const [isInitialized, setIsInitialized] = useState(false);
    
    // API Key State
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [isAiDisabled, setIsAiDisabled] = useState(true);
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

    // Menu/Settings State
    const [menuSettings, setMenuSettings] = useState<MenuSettings>({ ...DEFAULT_MENU_SETTINGS });
    const [genreEditState, setGenreEditState] = useState<GenreEditState>({
        genreEdit_Selected: "PSY_CHILL",
        _genreEdit_tempState: new Array(STATE_VECTOR_SIZE).fill(0.5),
        ...Object.fromEntries(Array.from({ length: GENRE_EDIT_SLIDER_COUNT }, (_, i) => [`genreEdit_Param${i}`, 0.5])) as any
    });

    const appState = useRef({
        renderer: null as THREE.WebGLRenderer | null,
        scene: null as THREE.Scene | null,
        camera: null as THREE.PerspectiveCamera | null,
        material: null as THREE.ShaderMaterial | null,
        audioContext: null as AudioContext | null,
        masterGain: null as GainNode | null,
        audioWorkletNode: null as AudioWorkletNode | null,
        analyserNode: null as AnalyserNode | null,
        micStreamSource: null as MediaStreamAudioSourceNode | null,
        speechController: null as any,
        embeddingPipeline: null as any,
        hnmSystem: null as HierarchicalSystemV5_TFJS | null,
        inputProcessor: null as any,
        featureExtractor: null as any,
        artifactManager: null as any,
        hnmMemoryStates: [] as HnmState[],
        hnmLastStepOutputs: {} as HnmLastStepOutputs,
        currentResonantState: null as any,
        inputState: {
            touch: { x: 0.5, y: 0.5, active: false, pressure: 0, dx: 0, dy: 0, lastX: 0.5, lastY: 0.5 },
            motion: { alpha: 0, beta: 0, gamma: 0, available: false },
            mic: { level: 0, fft: new Float32Array(MIC_FFT_SIZE / 2).fill(-140), available: false, rhythmPeak: 0, rhythmTempo: 0 },
            accelerometer: { x: 0, y: 0, z: 0, magnitude: 0, available: false, history: new Array(ACCEL_FFT_SIZE).fill(0), rhythmPeak: 0, rhythmTempo: 0 },
            syncFactor: 0.0, currentTime: 0.0
        } as InputState,
        lastTimestamp: 0, lastFpsTime: 0, frameCount: 0, currentFPS: TARGET_FPS,
        complexityLevel: 0.5, lastL0Anomaly: 0.0,
        activeArtifactInfo: { ids: [], stateArrays: [], similarities: [] } as ActiveArtifactInfo,
        lastArtifactCreationTime: 0, lastAccelTime: 0,
        visualFeedback: { active: false, intensity: 0, startTime: 0, duration: 0.1 },
        resetGestureState: { pointerDownTime: 0, longPressDetected: false, longPressReleaseTime: 0, resetTimeout: null as ReturnType<typeof setTimeout> | null },
        interactionOccurred: false, embeddingsReady: false, isLooping: false, stateLoadAttempted: false, stateLoadSucceeded: false,
        maxShaderArtifacts: 1, currentGenreRuleVector: new Array(STATE_VECTOR_SIZE).fill(0.5),
    }).current;
    
    const genreAdaptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const genreAdaptTargetRef = useRef<{ psySpectrumPosition: number; darknessModifier: number }>({ 
        psySpectrumPosition: DEFAULT_MENU_SETTINGS.psySpectrumPosition, 
        darknessModifier: DEFAULT_MENU_SETTINGS.darknessModifier 
    });
    const isAdaptingRef = useRef(false);
    const menuSettingsRef = useRef(menuSettings);
    useEffect(() => {
        menuSettingsRef.current = menuSettings;
    }, [menuSettings]);

    // --- API Key Management ---
    useEffect(() => {
        const envKey = (typeof process !== 'undefined' && process.env) ? process.env.GEMINI_API_KEY : null;
        const sessionKey = sessionStorage.getItem('gemini_api_key');
        
        if (envKey) {
            setApiKey(envKey);
        } else if (sessionKey) {
            setApiKey(sessionKey);
        } else {
            setIsApiKeyModalOpen(true);
        }
    }, []);

    useEffect(() => {
        setIsAiDisabled(!apiKey);
    }, [apiKey]);
    
    const handleApiKeySubmit = useCallback((key: string) => {
        sessionStorage.setItem('gemini_api_key', key);
        setApiKey(key);
        setIsApiKeyModalOpen(false);
        showWarning("API Key set for this session.", 3000);
    }, []);

    // UI Callbacks
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
    
    // Genre & Settings Callbacks
    const updateCurrentGenreRuleVector = useCallback(() => {
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
        
        appState.currentGenreRuleVector = new Array(STATE_VECTOR_SIZE).fill(0).map((_, i) => lerp(lightContinuumVector[i], darkContinuumVector[i], menuSettings.darknessModifier));
    }, [menuSettings.psySpectrumPosition, menuSettings.darknessModifier, appState]);

    const saveMenuSettings = useCallback(() => {
        try {
            const settingsToSave: Partial<MenuSettings & { version: string }> = { ...menuSettings, version: VERSION };
            localStorage.setItem(LOCAL_STORAGE_MENU_KEY, JSON.stringify(settingsToSave));
        } catch (e) { console.error("Error saving menu settings", e); }
    }, [menuSettings]);

    const handleMenuSettingChange = useCallback(<K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => {
        setMenuSettings(prev => {
            const newState = { ...prev, [key]: value };

            if (key === 'enableSpeechCommands') {
                if (value) {
                    appState.speechController?.startListening();
                } else {
                    appState.speechController?.stopListening();
                }
            }
            
            if (key === 'enableGenreAdaptMode') {
                if (value) {
                    if (!apiKey) {
                        showWarning("Genre-Adapt requires an API key.", 4000);
                        return { ...newState, enableGenreAdaptMode: false }; 
                    }
                    if (genreAdaptIntervalRef.current) clearInterval(genreAdaptIntervalRef.current);
                    
                    const adaptFn = async () => {
                        if (isAdaptingRef.current || !appState.artifactManager || !appState.inputState || !apiKey) return;

                        isAdaptingRef.current = true;
                        try {
                            const recentArtifacts = appState.artifactManager.artifacts.slice(-3);
                            const recentTags = recentArtifacts.map((a: Artifact) => a.featureTags);

                            const context = {
                                mic: appState.inputState.mic,
                                motion: appState.inputState.accelerometer,
                                recentArtifactTags: recentTags,
                                currentBpm: menuSettingsRef.current.masterBPM
                            };

                            const result = await getGenreAdaptation(context, apiKey);
                            if (result) {
                                genreAdaptTargetRef.current = result;
                            }
                        } catch (e) {
                            console.error("Genre adaptation failed:", e);
                            showWarning("Genre adaptation failed.", 3000);
                        } finally {
                            isAdaptingRef.current = false;
                        }
                    };
                    adaptFn(); 
                    genreAdaptIntervalRef.current = setInterval(adaptFn, 20000);

                } else {
                    if (genreAdaptIntervalRef.current) {
                        clearInterval(genreAdaptIntervalRef.current);
                        genreAdaptIntervalRef.current = null;
                    }
                }
            }
            return newState;
        });
    }, [appState.speechController, appState.artifactManager, appState.inputState, showWarning, apiKey]);

    const handleAiGenerate = useCallback(async (prompt: string) => {
        if (!apiKey) {
            showWarning("AI Muse requires an API key.", 4000);
            setIsApiKeyModalOpen(true);
            return;
        }
        if (!prompt) {
            showWarning("Please enter a description for the AI Muse.", 3000);
            return;
        }
        showLoading(true, "AI Muse is thinking...", "Generating soundscape...");
        try {
            const newSettings = await generateMusicSettings(prompt, apiKey);
            setMenuSettings(newSettings);
            showWarning("AI Muse has created a new soundscape!", 4000);
        } catch (error) {
            console.error("AI Muse generation failed:", error);
            showError("The AI Muse failed to generate a sound. Please try again.");
        } finally {
            showLoading(false);
        }
    }, [showLoading, showError, showWarning, apiKey]);

    useEffect(() => {
        updateCurrentGenreRuleVector();
        if(isInitialized) saveMenuSettings();
    }, [menuSettings, isInitialized, updateCurrentGenreRuleVector, saveMenuSettings]);

    const resetMenuSettingsToDefault = useCallback(() => {
        setMenuSettings(DEFAULT_MENU_SETTINGS);
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
            updateCurrentGenreRuleVector();
            showWarning(`Saved sliders to '${selectedGenreName}' (session only).`, 3000);
        } else { showError(`Genre '${selectedGenreName}' not found for saving.`); }
    }, [genreEditState, updateCurrentGenreRuleVector, showError, showWarning]);
    
    const resetHnmRag = useCallback(() => {
        showWarning("Resetting HNM/RAG State...", 1500);
        appState.speechController?.stopListening();
        sessionStorage.setItem('hnm_rag_reset_just_occurred', 'true');
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        sessionStorage.removeItem(FULLSCREEN_REQUESTED_KEY);
        setTimeout(() => window.location.reload(), 500);
    }, [showWarning, appState]);
    
    // HNM Training Mode Effect
    useEffect(() => {
        if (!appState.hnmSystem) return;

        const effectiveLR = menuSettings.enableHnmTrainingMode ? menuSettings.hnmLearningRate : 0;
        const effectiveWD = menuSettings.enableHnmTrainingMode ? menuSettings.hnmWeightDecay : 0;
        
        appState.hnmSystem.setLearningParameters(effectiveLR, effectiveWD);

    }, [menuSettings.enableHnmTrainingMode, menuSettings.hnmLearningRate, menuSettings.hnmWeightDecay, appState.hnmSystem]);

    // Main initialization and game loop effect
    useEffect(() => {
        let isMounted = true;
        let animationFrameId: number;
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Hoisted classes from original script
        class PlaceholderInputProcessor { 
            constructor(public inputDim: number, public outputDim: number) {}
            process(inputData: InputState, currentTime: number) {
                return tf.tidy(() => {
                    const vec = new Array(this.outputDim).fill(0);
                    const touchFactor = inputData.touch.active ? (inputData.touch.pressure || 1.0) : 0;
                    const micLevel = inputData.mic.available ? inputData.mic.level : 0;
                    const motionAvailable = inputData.motion.available;
                    const alphaNorm = motionAvailable ? (inputData.motion.alpha / 360.0) % 1.0 : 0.5;
                    const betaNorm = motionAvailable ? clamp((inputData.motion.beta + 180.0) / 360.0, 0, 1) : 0.5;
                    const gammaNorm = motionAvailable ? clamp((inputData.motion.gamma + 90.0) / 180.0, 0, 1) : 0.5;
                    const touchVelMag = clamp(Math.sqrt(inputData.touch.dx**2 + inputData.touch.dy**2) * 25, 0, 1);
                    const accelAvailable = inputData.accelerometer.available;
                    const accelNormX = accelAvailable ? clamp((inputData.accelerometer.x + 20) / 40, 0, 1) : 0.5;
                    const accelNormY = accelAvailable ? clamp((inputData.accelerometer.y + 20) / 40, 0, 1) : 0.5;
                    const accelNormZ = accelAvailable ? clamp((inputData.accelerometer.z + 20) / 40, 0, 1) : 0.5;
                    const accelMagNorm = accelAvailable ? clamp(inputData.accelerometer.magnitude / 25, 0, 1) : 0;
                    const micRhythmPeak = inputData.mic.available ? inputData.mic.rhythmPeak : 0;
                    const micRhythmTempoNorm = inputData.mic.available ? clamp((inputData.mic.rhythmTempo - 60) / (240 - 60), 0, 1) : 0.5;
                    const accelRhythmPeak = accelAvailable ? inputData.accelerometer.rhythmPeak : 0;
                    const accelRhythmTempoNorm = accelAvailable ? clamp((inputData.accelerometer.rhythmTempo - 60) / (240 - 60), 0, 1) : 0.5;
                    for (let i = 0; i < this.outputDim; i++) { switch (i % 16) { case 0: vec[i] = inputData.touch.x * (1.0 + touchFactor * 0.1); break; case 1: vec[i] = inputData.touch.y * (1.0 + touchFactor * 0.1); break; case 2: vec[i] = touchFactor; break; case 3: vec[i] = alphaNorm; break; case 4: vec[i] = betaNorm; break; case 5: vec[i] = gammaNorm; break; case 6: vec[i] = micLevel; break; case 7: vec[i] = touchVelMag; break; case 8: vec[i] = accelNormX; break; case 9: vec[i] = accelNormY; break; case 10: vec[i] = accelNormZ; break; case 11: vec[i] = accelMagNorm; break; case 12: vec[i] = micRhythmPeak; break; case 13: vec[i] = micRhythmTempoNorm; break; case 14: vec[i] = accelRhythmPeak; break; case 15: vec[i] = accelRhythmTempoNorm; break; } const prevVal = vec[(i + this.outputDim - 1) % this.outputDim] !== undefined ? vec[(i + this.outputDim - 1) % this.outputDim] : 0; const otherVal = vec[(i + 5) % this.outputDim] !== undefined ? vec[(i + 5) % this.outputDim] : 0; vec[i] = fract(vec[i]*1.1 + prevVal*0.3 + Math.sin(otherVal * 5.1 + i*0.1 + currentTime * 0.1) * 0.1); vec[i] = 1.0 / (1.0 + Math.exp(-(vec[i] * 2.0 - 1.0) * 1.8)); vec[i] = clamp(vec[i] || 0, 0, 1); }
                    if (inputData.mic.available && inputData.mic.fft) { const fftData = inputData.mic.fft; const fftLen = fftData.length; const segments = 8; const binsPerSegment = Math.max(1, Math.floor(fftLen / segments)); for(let seg = 0; seg < segments; seg++) { let peakDb = -140; const start = seg * binsPerSegment; const end = Math.min(start + binsPerSegment, fftLen); for(let k = start; k < end; k++) { if(isFinite(fftData[k])) peakDb = Math.max(peakDb, fftData[k]); } const normPeak = clamp((peakDb + 100) / 100, 0, 1); const tIdxStart = this.outputDim - 1 - seg * 2; if (tIdxStart >= 0) vec[tIdxStart] = (vec[tIdxStart] * 0.5 + normPeak * 0.5); if (tIdxStart - 1 >= 0) vec[tIdxStart - 1] = (vec[tIdxStart - 1] * 0.3 + normPeak * 0.7); } }
                    return tf.tensor1d(vec).expandDims(0).expandDims(0);
                });
            }
        }
        class FeatureExtractor {
            constructor(public stateVectorSize: number) {}
            private _getCategory(v: number, thresholds: number[], labels: string[]): string { for (let i = 0; i < thresholds.length; i++) { if (v < thresholds[i]) return labels[i]; } return labels[labels.length - 1]; }
            extractTags(arr: number[] | Float32Array): string {
                if (!arr || arr.length !== this.stateVectorSize) return "";
                const tags = new Set<string>();
                const i = { kick: 0, arpSpeed: 1, bassCut: 2, bright: 3, sat: 4, hue: 5, flow: 6, warp: 7, complexity: 8, tempo: 9, reverb: 10, leadDecay: 11, noiseLevel: 12, leadPresence: 16 };
                const getVal = (idx: number, def: number) => (idx !== undefined && arr[idx] !== undefined && typeof arr[idx] === 'number' && isFinite(arr[idx])) ? arr[idx] : def;
                tags.add(this._getCategory(getVal(i.tempo, 0.5), [0.25, 0.5, 0.75], ["slow", "mid", "fast", "very_fast"]));
                if (getVal(i.kick, 0.5) > 0.75) tags.add("drive");
                if (getVal(i.bassCut, 0.5) < 0.3 && getVal(i.bright, 0.5) > 0.6) tags.add("dark_bass");
                if (getVal(i.leadPresence, 0.5) > 0.6) tags.add(getVal(i.leadDecay, 0.1) < 0.15 ? "plucky_lead" : "long_lead");
                if (getVal(i.noiseLevel, 0.1) > 0.3) tags.add("noisy");
                tags.add(this._getCategory(getVal(i.complexity, 0.5), [0.4, 0.8], ["simple", "mid", "complex"]));
                if (getVal(i.flow, 0.0) > 0.7) tags.add("flow");
                if (getVal(i.reverb, 0.0) > 0.5) tags.add("reverb");
                return Array.from(tags).join(' ');
            }
        }
        class ArtifactManager {
            artifacts: Artifact[] = [];
            nextId = 0;
            constructor(public maxArtifacts: number, public stateVectorSize: number, public embeddingDim: number, public featureExtractor: FeatureExtractor, public embeddingProvider: any) {}
            async createArtifact(stateVectorTensor: any): Promise<boolean> {
                if (!appState.embeddingsReady || !this.featureExtractor || !this.embeddingProvider || !stateVectorTensor || stateVectorTensor.isDisposed) return false;
                const stateArr = await stateVectorTensor.squeeze([0, 1]).data();
                const tags = this.featureExtractor.extractTags(stateArr);
                if (!tags) return false;
                const embResult = await this.embeddingProvider(tags, { pooling: 'mean', normalize: true });
                if (!embResult || !embResult.data || embResult.data.length !== this.embeddingDim) return false;
                const newArt: Artifact = { id: this.nextId++, stateVector: Array.from(stateArr), featureTags: tags, embedding: embResult.data, timestamp: Date.now() };
                this.artifacts.push(newArt);
                if (this.artifacts.length > this.maxArtifacts) { this.artifacts.sort((a,b) => a.timestamp - b.timestamp).shift(); }
                triggerVisualFeedback(0.6, 0.2);
                saveStateToLocalStorage();
                return true;
            }
            _cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number { if (!a || !b || a.length !== b.length) return 0; let dot = 0, nA = 0, nB = 0; for(let i=0; i<a.length; i++) { dot += a[i] * b[i]; nA += a[i] * a[i]; nB += b[i] * b[i]; } return dot / (Math.sqrt(nA) * Math.sqrt(nB) + 1e-9); }
            async findRelevantArtifacts(stateTensor: any, thresh: number, maxCnt: number): Promise<ActiveArtifactInfo> {
                const result: ActiveArtifactInfo = { ids: [], stateArrays: [], similarities: [] };
                if (!appState.embeddingsReady || this.artifacts.length === 0 || !stateTensor || stateTensor.isDisposed) return result;
                const stateArr = await stateTensor.squeeze([0, 1]).data();
                const tags = this.featureExtractor.extractTags(stateArr);
                if (!tags) return result;
                const queryEmb = (await this.embeddingProvider(tags, { pooling: 'mean', normalize: true })).data;
                if (!queryEmb) return result;
                const candidates = this.artifacts.map(art => ({ art, similarity: this._cosineSimilarity(queryEmb, art.embedding as number[]) }));
                const relevant = candidates.filter(c => c.similarity >= thresh).sort((a,b) => b.similarity - a.similarity);
                relevant.slice(0, maxCnt).forEach(item => { result.ids.push(item.art.id); result.stateArrays.push(item.art.stateVector); result.similarities.push(item.similarity); });
                return result;
            }
            getArtifactCount() { return this.artifacts.length; }
            setArtifacts(loaded: Artifact[]) {
                if (!Array.isArray(loaded)) { this.artifacts = []; this.nextId = 0; return; }
                this.artifacts = loaded.map(a => ({...a, stateVector: Array.from(a.stateVector), embedding: Array.from(a.embedding) }));
                this.nextId = loaded.length > 0 ? Math.max(...loaded.map(a => a.id)) + 1 : 0;
            }
            forgetOldestArtifact() { if (this.artifacts.length === 0) return false; this.artifacts.sort((a, b) => a.timestamp - b.timestamp).shift(); saveStateToLocalStorage(); return true; }
        }
        class SpeechRecognitionController {
            recognition: any;
            isSupported: boolean;
            isListening = false;
            isActive = false;
            isStarting = false;
            isStopping = false;
            permissionGranted = false;
            commandCallback: (cmd: string) => void;
            consecutiveErrorCount = 0;
            MAX_CONSECUTIVE_ERRORS = 8;
            restartTimeoutId: ReturnType<typeof setTimeout> | null = null;
        
            constructor(commandCallback: (cmd: string) => void) {
                this.commandCallback = commandCallback;
                this.isSupported = ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
                if (!this.isSupported) {
                    setSpeechStatus("Unsupported");
                    return;
                }
            }
        
            _updateStatus(status: string) {
                setSpeechStatus(status);
            }
        
            async _requestPermissionAndInit() {
                if (!this.isSupported || this.recognition) return;
                try {
                    // Permission is now requested centrally in initAudio
                    // This just piggybacks on the existing permission
                    this._initializeRecognition();
                } catch (err: any) {
                     console.error("Speech init failed, likely no mic permission:", err.message);
                }
            }
        
            _initializeRecognition() {
                if (!this.isSupported || !this.permissionGranted || this.recognition) return;
                const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                this.recognition = new SpeechRecognition();
                this.recognition.continuous = true;
                this.recognition.interimResults = false;
                this.recognition.lang = 'en-US';
        
                this.recognition.onstart = () => {
                    this.isActive = true;
                    this.isStarting = false;
                    this._updateStatus("Listening");
                };
        
                this.recognition.onend = () => {
                    this.isActive = false;
                    this.isStarting = false;
                    this.isStopping = false;
                    if (this.isListening && menuSettingsRef.current.enableSpeechCommands) {
                        this._scheduleRestart(150 + Math.random() * 100);
                    } else {
                        this._updateStatus("Idle");
                    }
                };
        
                this.recognition.onresult = (event: any) => {
                    this.consecutiveErrorCount = 0;
                    const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
                    for (const commandType in SPEECH_COMMANDS) {
                        if (SPEECH_COMMANDS[commandType].some(phrase => transcript.includes(phrase))) {
                            this.commandCallback(commandType);
                            break;
                        }
                    }
                };
        
                this.recognition.onerror = (event: any) => {
                    const error = event.error;
                    this.isActive = false;
                    this.isStarting = false;
                    this.isStopping = false;
                    let autoRestart = true;
                    if (error === 'no-speech' || error === 'audio-capture') {
                        this.consecutiveErrorCount++;
                    } else if (error === 'not-allowed' || error === 'service-not-allowed') {
                        this.permissionGranted = false;
                        this.isListening = false;
                        autoRestart = false;
                        showError(`Voice commands blocked: ${error}`);
                    } else {
                        this.consecutiveErrorCount++;
                    }
                    if (this.consecutiveErrorCount > this.MAX_CONSECUTIVE_ERRORS) {
                        autoRestart = false;
                        this.isListening = false;
                        showWarning("Speech recognition stopped due to repeated errors.", 6000);
                    }
                    if (this.isListening && menuSettingsRef.current.enableSpeechCommands && autoRestart) {
                        this._scheduleRestart(750 + Math.random() * 500);
                    }
                };
                this._updateStatus("Initialized");
            }
        
            _scheduleRestart(delay: number) {
                if (this.restartTimeoutId) clearTimeout(this.restartTimeoutId);
                this.restartTimeoutId = setTimeout(() => {
                    this.restartTimeoutId = null;
                    this.startListening();
                }, delay);
            }
        
            startListening() {
                if (!menuSettingsRef.current.enableSpeechCommands || !this.isSupported || this.isActive || this.isStarting) return;
                
                if (!appState.inputState.mic.available) {
                    this._updateStatus("Mic N/A");
                    return;
                }
                
                if (!this.recognition) {
                   this.permissionGranted = true;
                   this._initializeRecognition();
                }

                if (!this.recognition) return;

                this.isListening = true;
                this.isStarting = true;
                this._updateStatus("Starting...");
                try {
                    if (this.restartTimeoutId) clearTimeout(this.restartTimeoutId);
                    this.recognition.start();
                } catch (e) {
                    this.isListening = false; this.isStarting = false; this.isActive = false;
                    this._scheduleRestart(1000);
                }
            }
        
            stopListening() {
                this.isListening = false;
                if (this.restartTimeoutId) clearTimeout(this.restartTimeoutId);
                if (!this.recognition || !this.isActive) return;
                this.isStopping = true;
                this._updateStatus("Stopping");
                try {
                    this.recognition.stop();
                } catch (e) {
                    this.isStopping = false; this.isActive = false;
                }
            }
        }

        // Helper functions
        const triggerVisualFeedback = (intensity = 0.5, duration = 0.1) => { appState.visualFeedback = { active: true, intensity: Math.max(appState.visualFeedback.intensity, intensity), startTime: performance.now() / 1000.0, duration }; };
        const handleSpeechCommand = (command: string) => { switch (command) { case 'CREATE': appState.artifactManager?.createArtifact(appState.currentResonantState); break; case 'FORGET_OLDEST': if (appState.artifactManager?.forgetOldestArtifact()) triggerVisualFeedback(0.3, 0.2); break; case 'RESET': resetHnmRag(); break; default: break; } };
        const analyzeRhythm = (data: Float32Array | number[], sampleRateOrFreq: number, dataSize: number) => { let peakFreqBin = -1; let peakMag = -Infinity; for (let i = 0; i < data.length; i++) { const magnitude = data[i]; const freq = i * (sampleRateOrFreq / dataSize); if (magnitude > peakMag && freq >= 1.0 && freq <= 10.0) { peakMag = magnitude; peakFreqBin = i; } } const peakFrequency = peakFreqBin * (sampleRateOrFreq / dataSize); let normalizedPeak = sampleRateOrFreq > 1000 ? clamp((peakMag + 80.0) / 80.0, 0, 1) : clamp(Array.from(data).reduce((a,b)=>a+b*b,0)/data.length / 5.0, 0, 1) ; const estimatedTempo = clamp(peakFrequency * 60, 60, 240); if (peakFreqBin === -1) return { peak: normalizedPeak, tempo: 120 }; return { peak: normalizedPeak, tempo: estimatedTempo }; };
        const projectArtifactsToExternalSignal = (activeInfo: ActiveArtifactInfo, targetDim: number) => tf.tidy(() => { if (!activeInfo || activeInfo.stateArrays.length === 0) return tf.keep(tf.zeros([1, 1, targetDim])); let sumVector = new Array(STATE_VECTOR_SIZE).fill(0); let totalSimilarityWeight = 0; for (let i = 0; i < activeInfo.stateArrays.length; i++) { const stateArr = activeInfo.stateArrays[i]; const similarity = activeInfo.similarities[i]; if (stateArr?.length === STATE_VECTOR_SIZE) { for (let j = 0; j < STATE_VECTOR_SIZE; j++) { sumVector[j] += stateArr[j] * similarity; } totalSimilarityWeight += similarity; } } if (totalSimilarityWeight > 1e-6) { sumVector = sumVector.map(v => v / totalSimilarityWeight); } let projectedTensor = tf.tensor1d(sumVector); if (STATE_VECTOR_SIZE > targetDim) { projectedTensor = projectedTensor.slice([0], [targetDim]); } else if (STATE_VECTOR_SIZE < targetDim) { projectedTensor = projectedTensor.pad([[0, targetDim - STATE_VECTOR_SIZE]], 0.5); } return tf.keep(projectedTensor.reshape([1, 1, targetDim])); });
        const processMicFFTtoStateVector = (micFFT: Float32Array, outputDim: number) => tf.tidy(() => { if (!micFFT || micFFT.length === 0) { return tf.keep(tf.zeros([1, 1, outputDim])); } const fftLength = micFFT.length; const segmentSize = Math.max(1, Math.floor(fftLength / outputDim)); const processed = new Array(outputDim).fill(0.0); for (let i = 0; i < outputDim; i++) { let sumDb = 0; let count = 0; const startBin = i * segmentSize; const endBin = Math.min((i + 1) * segmentSize, fftLength); for (let j = startBin; j < endBin; j++) { if (isFinite(micFFT[j]) && micFFT[j] > -120) { sumDb += (micFFT[j] + 120) / 120; count++; } } processed[i] = count > 0 ? clamp(sumDb / count, 0, 1) : 0.0; } return tf.keep(tf.tensor1d(processed).reshape([1,1,outputDim])); });
        const saveStateToLocalStorage = async () => { if (!appState.interactionOccurred || !appState.currentResonantState || appState.currentResonantState.isDisposed || !appState.artifactManager) return; try { const stateArray = await appState.currentResonantState.squeeze([0,1]).data(); const stateToSave = { resonantState: Array.from(stateArray), artifacts: appState.artifactManager.artifacts, timestamp: Date.now(), version: VERSION }; localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave)); } catch (e) { console.error("Save state error:", e); } };

        const initAudio = async () => {
            if (appState.audioContext) return true;
            try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 44100 });
                appState.audioContext = audioContext;
                await audioContext.resume();
    
                const masterGain = audioContext.createGain();
                masterGain.gain.setValueAtTime(1.0, audioContext.currentTime);
                masterGain.connect(audioContext.destination);
                appState.masterGain = masterGain;
    
                const analyserNode = audioContext.createAnalyser();
                analyserNode.fftSize = MIC_FFT_SIZE;
                analyserNode.smoothingTimeConstant = 0.5;
                appState.analyserNode = analyserNode;
                
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
                appState.micStreamSource = audioContext.createMediaStreamSource(stream);
                appState.micStreamSource.connect(analyserNode);
                appState.inputState.mic.available = true;
                
                const blob = new Blob([audioWorkletCode], { type: 'application/javascript' });
                const workletURL = URL.createObjectURL(blob);
                await audioContext.audioWorklet.addModule(workletURL);
                appState.audioWorkletNode = new AudioWorkletNode(audioContext, 'generative-processor', { outputChannelCount:[2], parameterData:{ masterLevel: 0.7 } });
                appState.audioWorkletNode.connect(masterGain);
                URL.revokeObjectURL(workletURL);
                return true;
            } catch (err) {
                 console.error("Microphone access denied:", err); showWarning("Mic Disabled/Denied.", 5000); appState.inputState.mic.available = false; 
                 return false;
            }
        };
        const initInputListeners = () => { 
            const handlePointerMove = (e: PointerEvent) => { const x = clamp(e.clientX / window.innerWidth, 0, 1); const y = 1.0 - clamp(e.clientY / window.innerHeight, 0, 1); appState.inputState.touch.dx = x - appState.inputState.touch.lastX; appState.inputState.touch.dy = y - appState.inputState.touch.lastY; appState.inputState.touch.x = x; appState.inputState.touch.y = y; appState.inputState.touch.lastX = x; appState.inputState.touch.lastY = y; appState.inputState.touch.pressure = e.pressure ?? (appState.inputState.touch.active ? 1.0 : 0); };
            const handlePointerDown = async (e: PointerEvent) => {
                if (!appState.interactionOccurred) {
                    const audioInitialized = await initAudio();
                    const fsReq = sessionStorage.getItem(FULLSCREEN_REQUESTED_KEY);
                    if (!fsReq) { document.documentElement.requestFullscreen().catch(err=>console.warn(err)); sessionStorage.setItem(FULLSCREEN_REQUESTED_KEY, 'true'); }
                    
                    if(audioInitialized) {
                        appState.speechController?.startListening();
                    }

                    appState.interactionOccurred = true;
                }
                const now = performance.now();
                if (menuSettingsRef.current.enableTapReset && appState.resetGestureState.longPressDetected && (now - appState.resetGestureState.longPressReleaseTime < RESET_SECOND_TAP_WINDOW_MS)) { resetHnmRag(); return; }
                appState.inputState.touch.active = true;
                appState.resetGestureState = { pointerDownTime: now, longPressDetected: false, longPressReleaseTime: 0, resetTimeout: null };
            };
            const handlePointerUp = () => {
                const now = performance.now();
                if (appState.inputState.touch.active) {
                    if (menuSettingsRef.current.enableTapReset) {
                        const pressDuration = now - appState.resetGestureState.pointerDownTime;
                        if (pressDuration > LONG_PRESS_DURATION_MS) {
                            showWarning(`Long Press: Tap again within ${RESET_SECOND_TAP_WINDOW_MS}ms to Reset.`, RESET_SECOND_TAP_WINDOW_MS + 100);
                            appState.resetGestureState.longPressDetected = true;
                            appState.resetGestureState.longPressReleaseTime = now;
                            appState.resetGestureState.resetTimeout = setTimeout(() => { appState.resetGestureState.longPressDetected = false; hideWarning(); }, RESET_SECOND_TAP_WINDOW_MS);
                        } else if (appState.resetGestureState.longPressDetected) {
                            hideWarning();
                        }
                    }
                    appState.inputState.touch.active = false;
                }
            };
            const requestMotionPermission = (type: 'deviceorientation' | 'devicemotion') => {
                const E = type === 'deviceorientation' ? DeviceOrientationEvent : DeviceMotionEvent;
                if (typeof (E as any).requestPermission === 'function') {
                    (E as any).requestPermission().then((state: string) => {
                        if (state === 'granted') {
                            window.addEventListener(type, handleMotion);
                        }
                    }).catch(console.error);
                } else {
                    window.addEventListener(type, handleMotion);
                }
            };
            const handleMotion = (e: DeviceMotionEvent | DeviceOrientationEvent) => {
                if ('alpha' in e) { appState.inputState.motion = { alpha: e.alpha || 0, beta: e.beta || 0, gamma: e.gamma || 0, available: true }; }
                if ('accelerationIncludingGravity' in e && e.accelerationIncludingGravity) { const acc = e.accelerationIncludingGravity; const mag = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2); appState.inputState.accelerometer = {...appState.inputState.accelerometer, x:acc.x||0, y:acc.y||0, z:acc.z||0, magnitude:mag, available: true }; appState.inputState.accelerometer.history.push(mag); if (appState.inputState.accelerometer.history.length > ACCEL_FFT_SIZE) appState.inputState.accelerometer.history.shift(); }
            };
            canvas.addEventListener('pointerdown', handlePointerDown); canvas.addEventListener('pointerup', handlePointerUp); canvas.addEventListener('pointerleave', handlePointerUp); canvas.addEventListener('pointermove', handlePointerMove);
            requestMotionPermission('deviceorientation'); requestMotionPermission('devicemotion');
        };

        const gameLoop = async (timestamp: number) => {
            if (!isMounted || !appState.isLooping) return;
            animationFrameId = requestAnimationFrame(gameLoop);
            
            if (appState.interactionOccurred) {
                setMenuSettings(prev => {
                    if (!prev.enableGenreAdaptMode) return prev;
                    
                    const newPsy = lerp(prev.psySpectrumPosition, genreAdaptTargetRef.current.psySpectrumPosition, 0.02);
                    const newDark = lerp(prev.darknessModifier, genreAdaptTargetRef.current.darknessModifier, 0.02);
                    
                    if (Math.abs(prev.psySpectrumPosition - newPsy) < 0.001 && Math.abs(prev.darknessModifier - newDark) < 0.001) {
                        return prev;
                    }
                    return {
                       ...prev,
                       psySpectrumPosition: newPsy,
                       darknessModifier: newDark,
                    }
                });
            }

            const { renderer, scene, camera, material, audioContext, audioWorkletNode, analyserNode, hnmSystem, inputState, currentResonantState } = appState;
            if (!renderer || !scene || !camera || !material || !audioContext || !audioWorkletNode || !hnmSystem || !currentResonantState || currentResonantState.isDisposed) return;
            
            const currentTime = timestamp / 1000.0;
            appState.lastTimestamp = currentTime;
            inputState.currentTime = currentTime;

            appState.frameCount++;
            const fpsElapsed = (timestamp - appState.lastFpsTime) / 1000.0;
            if (fpsElapsed >= 1.0) {
                appState.currentFPS = appState.frameCount / fpsElapsed;
                appState.lastFpsTime = timestamp;
                appState.frameCount = 0;
                const error = TARGET_FPS - appState.currentFPS;
                const adjustment = clamp(Math.tanh(error / (TARGET_FPS * 0.2)) * 1.5 * 0.025, -0.10, 0.10);
                appState.complexityLevel = clamp(appState.complexityLevel + adjustment, 0.05, 1.0);
            }

            if (analyserNode && inputState.mic.available) {
                analyserNode.getFloatFrequencyData(inputState.mic.fft);
                const rhythm = analyzeRhythm(inputState.mic.fft, audioContext.sampleRate, MIC_FFT_SIZE);
                inputState.mic.rhythmPeak = rhythm.peak; inputState.mic.rhythmTempo = rhythm.tempo;
                inputState.mic.level = clamp(inputState.mic.fft.reduce((acc: number, v: number) => acc + Math.pow(10, v/20), 0) / inputState.mic.fft.length * 11, 0, 1);
            }
            if (inputState.accelerometer.available && currentTime - appState.lastAccelTime > ACCEL_ANALYSIS_INTERVAL_S) {
                const rhythm = analyzeRhythm(inputState.accelerometer.history, 1.0/ACCEL_ANALYSIS_INTERVAL_S, ACCEL_FFT_SIZE);
                inputState.accelerometer.rhythmPeak = rhythm.peak; inputState.accelerometer.rhythmTempo = rhythm.tempo;
                appState.lastAccelTime = currentTime;
            }
            const tempoSim = Math.max(0, 1.0 - Math.abs(inputState.mic.rhythmTempo - inputState.accelerometer.rhythmTempo)/80);
            inputState.syncFactor = clamp(inputState.syncFactor * SYNC_DECAY + (inputState.mic.rhythmPeak * inputState.accelerometer.rhythmPeak * tempoSim * 2.0) * (1.0-SYNC_DECAY), 0,1);

            try {
                const hnmStepPackage = tf.tidy("HNM_Step_Execution", () => {
                    const playerIntent = appState.inputProcessor.process(inputState, currentTime).mul(tf.scalar(menuSettingsRef.current.playerInfluence));
                    const l0SensoryInput = currentResonantState.add(playerIntent).clipByValue(0, 1);
                    const artifactSignal = projectArtifactsToExternalSignal(appState.activeArtifactInfo, HNM_ARTIFACT_EXTERNAL_SIGNAL_DIM);
                    const diffVec = processMicFFTtoStateVector(inputState.mic.fft, STATE_VECTOR_SIZE).sub(currentResonantState).abs();
                    const combinedL0Ext = artifactSignal.add(diffVec.mul(tf.scalar(menuSettingsRef.current.micFeedbackToL0Strength))).clipByValue(0,1);
                    const genreRuleTensor = tf.tensor1d(appState.currentGenreRuleVector).reshape([1,1,STATE_VECTOR_SIZE]);

                    const hnsStepResults = hnmSystem.step(
                        appState.hnmMemoryStates, 
                        appState.hnmLastStepOutputs,
                        { [HNM_HIERARCHY_LEVEL_CONFIGS[0].name]: l0SensoryInput },
                        { ArtifactSignalSource: combinedL0Ext, ActiveGenreRuleSignal: genreRuleTensor.clone() },
                        true
                    );

                    let hnmL1Output = hnsStepResults.newlyRetrievedValues[HNM_POLICY_HEAD_INPUT_LEVEL_NAME];
                    const blendedOutput = hnmL1Output.mul(1.0 - menuSettingsRef.current.genreRuleInfluence).add(genreRuleTensor.mul(menuSettingsRef.current.genreRuleInfluence));
                    
                    let totalAnomaly = 0; Object.values(hnsStepResults.anomalies).forEach((t:any) => totalAnomaly += t.dataSync()[0]);
                    appState.lastL0Anomaly = hnsStepResults.anomalies[HNM_HIERARCHY_LEVEL_CONFIGS[0].name].dataSync()[0];
                    const perturbation = tf.randomNormal(blendedOutput.shape).mul(clamp(totalAnomaly * menuSettingsRef.current.explorationInfluence * 0.05, 0, 0.1));
                    
                    const finalState = blendedOutput.add(perturbation).clipByValue(0,1);

                    return {
                        newResonantState: tf.keep(finalState),
                        nextHnmStates: hnsStepResults.nextBotStates,
                        nextHnmOutputs: hnsStepResults.newlyRetrievedValues,
                        hnsAnomaliesEtc: { anomalies: tf.keep(hnsStepResults.anomalies), weightChanges: tf.keep(hnsStepResults.weightChanges), buNorms: tf.keep(hnsStepResults.buNorms), tdNorms: tf.keep(hnsStepResults.tdNorms), extNorms: tf.keep(hnsStepResults.extNorms) }
                    };
                });
                
                tf.dispose(appState.currentResonantState);
                appState.hnmMemoryStates.forEach(disposeMemStateWeights);
                Object.values(appState.hnmLastStepOutputs).forEach(o => o.retrievedVal?.dispose());
                disposeHnsResultsTensors(hnmStepPackage.hnsAnomaliesEtc);

                appState.currentResonantState = hnmStepPackage.newResonantState;
                appState.hnmMemoryStates = hnmStepPackage.nextHnmStates;
                appState.hnmLastStepOutputs = hnmStepPackage.newlyRetrievedValues;

            } catch(e) { console.error("Game loop TF/HNM error", e); }

            if (appState.embeddingsReady && appState.artifactManager && (Date.now() - appState.lastArtifactCreationTime > ARTIFACT_CREATION_INTERVAL_MS)) {
                appState.lastArtifactCreationTime = Date.now();
                const activityLevel = (appState.lastL0Anomaly * 0.6) + (inputState.mic.rhythmPeak * 0.2) + (inputState.accelerometer.rhythmPeak * 0.2);
                if (activityLevel > ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MIN && activityLevel < ARTIFACT_CREATION_ACTIVITY_THRESHOLD_MAX) {
                    const created = await appState.artifactManager.createArtifact(appState.currentResonantState);
                    if (created && inputState.syncFactor > SYNC_THRESHOLD) { triggerVisualFeedback(0.9, 0.35); }
                }
            }

            if(appState.artifactManager) appState.activeArtifactInfo = await appState.artifactManager.findRelevantArtifacts(appState.currentResonantState, ARTIFACT_SIMILARITY_THRESHOLD, MAX_ACTIVE_ARTIFACTS_LOGIC);

            const currentStateArray = await appState.currentResonantState.squeeze([0,1]).data();
            material.uniforms.time.value = currentTime;
            material.uniforms.complexity.value = appState.complexityLevel;
            material.uniforms.syncFactor.value = inputState.syncFactor;
            material.uniforms.mainState.value.set(currentStateArray);
            const numToSend = Math.min(appState.activeArtifactInfo.ids.length, appState.maxShaderArtifacts);
            material.uniforms.numActiveArtifacts.value = numToSend;
            for (let i = 0; i < numToSend; ++i) {
                material.uniforms.artifactStates.value.set(appState.activeArtifactInfo.stateArrays[i], i * STATE_VECTOR_SIZE);
                material.uniforms.artifactSimilarities.value[i] = appState.activeArtifactInfo.similarities[i];
            }
            if (appState.visualFeedback.active) {
                const elapsed = currentTime - appState.visualFeedback.startTime;
                if (elapsed < appState.visualFeedback.duration) material.uniforms.feedbackIntensity.value = appState.visualFeedback.intensity * (1.0 - elapsed / appState.visualFeedback.duration)**2;
                else appState.visualFeedback.active = false;
            } else { material.uniforms.feedbackIntensity.value *= 0.85; }
            renderer.render(scene, camera);

            const sanitizedMenuParams = Object.fromEntries(Object.entries(menuSettingsRef.current).filter(([_,v]) => typeof v !== 'function'));
            audioWorkletNode.port.postMessage({ state: currentStateArray, complexity: appState.complexityLevel, menuParams: sanitizedMenuParams });

            if (USE_DEBUG) {
                const { numBytes, numTensors } = tf.memory();
                const artCnt = appState.artifactManager?.getArtifactCount() ?? 0;
                const micStat = inputState.mic.available ? `Mic: ${inputState.mic.level.toFixed(2)}` : 'Mic: N/A';
                setDebugInfo(`V${VERSION.split('-')[0]}|FPS:${appState.currentFPS.toFixed(1)}|L0Anom:${appState.lastL0Anomaly.toFixed(3)}|Sync:${inputState.syncFactor.toFixed(2)}|Art:${artCnt}|TF:${numTensors}t/${(numBytes/1e6).toFixed(1)}MB|${micStat}`);
            }
        };

        const init = async () => {
            if (!isMounted) return;
            showLoading(true, "Initializing Core Systems...");
            await tf.ready();
            
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
            camera.position.z = 4;
            
            const gl = renderer.getContext();
            const maxVec = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
            const baseVec = Math.ceil(STATE_VECTOR_SIZE / 4) + 25;
            const vecPerArt = Math.ceil(STATE_VECTOR_SIZE / 4) + 1;
            const calculatedMax = Math.max(1, Math.floor((maxVec - baseVec) / vecPerArt * 0.8));
            appState.maxShaderArtifacts = Math.min(MAX_ARTIFACTS, REASONABLE_SHADER_ARTIFACT_CAP, calculatedMax);
            
            const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader: fragmentShader(appState.maxShaderArtifacts), uniforms: { time: { value: 0 }, resolution: { value: new THREE.Vector2(gl.drawingBufferWidth, gl.drawingBufferHeight) }, mainState: { value: new Float32Array(STATE_VECTOR_SIZE).fill(0.5) }, numActiveArtifacts: {value: 0}, artifactStates: {value: new Float32Array(appState.maxShaderArtifacts*STATE_VECTOR_SIZE)}, artifactSimilarities: {value: new Float32Array(appState.maxShaderArtifacts)}, complexity:{value: 0.5}, syncFactor: {value: 0.0}, feedbackIntensity: {value: 0.0} } });
            scene.add(new THREE.Mesh(new THREE.PlaneGeometry(10, 10), material));
            appState.renderer = renderer; appState.scene = scene; appState.camera = camera; appState.material = material;
            
            showLoading(true, "Loading Embedding Model...", "");
            xenovaEnv.allowLocalModels = false;
            appState.embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL_NAME, { 
                quantized: true, 
                progress_callback: (p: any) => {
                    if (!p) return;
                    const message = p.status ? `${p.status}${p.file ? `: ${p.file}` : ''}` : 'Loading model...';
                    let progress = '';
                    if (typeof p.loaded === 'number' && typeof p.total === 'number' && p.total > 0) {
                        progress = `${((p.loaded / p.total) * 100).toFixed(1)}%`;
                    }
                    showLoading(true, message, progress);
                }
            });
            appState.embeddingsReady = true;
            
            appState.inputProcessor = new PlaceholderInputProcessor(INPUT_VECTOR_SIZE, STATE_VECTOR_SIZE);
            appState.featureExtractor = new FeatureExtractor(STATE_VECTOR_SIZE);
            appState.artifactManager = new ArtifactManager(MAX_ARTIFACTS, STATE_VECTOR_SIZE, EMBEDDING_DIM, appState.featureExtractor, appState.embeddingPipeline);
            appState.hnmSystem = new HierarchicalSystemV5_TFJS(HNM_HIERARCHY_LEVEL_CONFIGS, { HNM_VERBOSE });
            appState.currentResonantState = tf.keep(tf.fill([1, 1, STATE_VECTOR_SIZE], 0.5));
            appState.hnmMemoryStates = appState.hnmSystem.getInitialStates();
            HNM_HIERARCHY_LEVEL_CONFIGS.forEach(cfg => { appState.hnmLastStepOutputs[cfg.name] = { retrievedVal: tf.keep(tf.zeros([1, 1, cfg.dim]))}; });
            appState.speechController = new SpeechRecognitionController(handleSpeechCommand);
            
            const hnmRagReset = sessionStorage.getItem('hnm_rag_reset_just_occurred') === 'true';
            sessionStorage.removeItem('hnm_rag_reset_just_occurred');
            const savedMenu = localStorage.getItem(LOCAL_STORAGE_MENU_KEY);
            if (savedMenu) {
                try {
                    const parsed = JSON.parse(savedMenu);
                    if (parsed.version && parsed.version.split('-')[0] === VERSION.split('-')[0] && !hnmRagReset) {
                        setMenuSettings(s => ({...s, ...parsed}));
                    }
                } catch(e) { console.error("Failed to parse saved menu settings", e); }
            }
            const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
            if(savedState && !hnmRagReset){
                const parsed = JSON.parse(savedState);
                if(parsed.version === VERSION) {
                    tf.tidy(()=>{ const loadedTensor = tf.tensor1d(parsed.resonantState).reshape([1,1,STATE_VECTOR_SIZE]); tf.dispose(appState.currentResonantState); appState.currentResonantState = tf.keep(loadedTensor); });
                    appState.artifactManager.setArtifacts(parsed.artifacts);
                    showWarning("Loaded previous state.", 3000);
                }
            }
            
            initInputListeners();
            showLoading(false);
            hideWarning();
            setIsInitialized(true);
            appState.isLooping = true;
            animationFrameId = requestAnimationFrame(gameLoop);
        };

        init().catch(err => {
            console.error("Initialization failed:", err);
            showError("Initialization failed. Check console.");
        });

        return () => {
            isMounted = false;
            cancelAnimationFrame(animationFrameId);
            appState.isLooping = false;
            appState.speechController?.stopListening();
            appState.audioContext?.close();
            appState.renderer?.dispose();
            tf.dispose(appState.currentResonantState);
            appState.hnmMemoryStates.forEach(disposeMemStateWeights);
            Object.values(appState.hnmLastStepOutputs).forEach(o => o.retrievedVal?.dispose());
            if (genreAdaptIntervalRef.current) {
                clearInterval(genreAdaptIntervalRef.current);
            }
        };
    }, []);

    return {
        debugInfo,
        warningInfo,
        loadingInfo,
        speechStatus,
        isInitialized,
        isAiDisabled,
        isApiKeyModalOpen,
        handleApiKeySubmit,
        menuSettings,
        handleMenuSettingChange,
        resetMenuSettingsToDefault,
        resetHnmRag,
        genreEditState,
        handleGenreEditChange,
        loadSelectedGenreToSliders,
        saveSlidersToSelectedGenre,
        handleAiGenerate,
    };
};
