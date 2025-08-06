
import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import type { ActiveArtifactInfo } from '../types';
import { lerp } from '../lib/utils';
import { TARGET_FPS, USE_DEBUG, STATE_VECTOR_SIZE } from '../constants';

declare var tf: any;

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


export const useAppLogic = (
    canvasRef: React.RefObject<HTMLCanvasElement>,
    getHnmOutputs: () => {
        currentResonantStateVector: number[],
        activeArtifactInfo: ActiveArtifactInfo,
        lastL0Anomaly: number
    },
    updateDebugDisplay: (fps: number) => void
) => {
    const renderer = useRef<THREE.WebGLRenderer | null>(null);
    const scene = useRef<THREE.Scene | null>(null);
    const camera = useRef<THREE.PerspectiveCamera | null>(null);
    const material = useRef<THREE.ShaderMaterial | null>(null);

    const frameInfo = useRef({
        lastTimestamp: 0,
        lastFpsTime: 0,
        frameCount: 0,
        currentFPS: TARGET_FPS,
        isLooping: false,
    });
    
    const complexityLevel = useRef(0.5);
    const syncFactor = useRef(0.0);

    const renderDependencies = useRef({ getHnmOutputs, updateDebugDisplay });
    renderDependencies.current = { getHnmOutputs, updateDebugDisplay };

    const gameLoop = useCallback(async (timestamp: number) => {
        const { getHnmOutputs, updateDebugDisplay } = renderDependencies.current;

        if (!frameInfo.current.isLooping || !renderer.current || !scene.current || !camera.current || !material.current) return;
        
        requestAnimationFrame(gameLoop);

        const { currentResonantStateVector, activeArtifactInfo, lastL0Anomaly } = getHnmOutputs();

        // Timing and FPS
        const currentTime = timestamp / 1000.0;
        frameInfo.current.lastTimestamp = currentTime;
        frameInfo.current.frameCount++;
        const fpsElapsed = (timestamp - frameInfo.current.lastFpsTime) / 1000.0;
        if (fpsElapsed >= 1.0) {
            frameInfo.current.currentFPS = frameInfo.current.frameCount / fpsElapsed;
            frameInfo.current.lastFpsTime = timestamp;
            frameInfo.current.frameCount = 0;
            if (USE_DEBUG) {
                updateDebugDisplay(frameInfo.current.currentFPS);
            }
        }
        
        // State updates for visuals
        complexityLevel.current = lerp(complexityLevel.current, lastL0Anomaly, 0.01);
        
        if (currentResonantStateVector) {
            material.current.uniforms.mainState.value = currentResonantStateVector;
            material.current.uniforms.numActiveArtifacts.value = activeArtifactInfo.ids.length;

            if (activeArtifactInfo.ids.length > 0) {
                const flatStates = activeArtifactInfo.stateArrays.flat();
                material.current.uniforms.artifactStates.value.splice(0, flatStates.length, ...flatStates);
                material.current.uniforms.artifactSimilarities.value.splice(0, activeArtifactInfo.similarities.length, ...activeArtifactInfo.similarities);
            }
        }
        
        material.current.uniforms.time.value = currentTime;
        // syncFactor is now calculated inside the shader based on HNM state if needed, or can be derived from specific state vector elements
        material.current.uniforms.syncFactor.value = currentResonantStateVector?.[28] || 0.0;
        material.current.uniforms.complexity.value = complexityLevel.current;
        
        renderer.current.render(scene.current, camera.current);

    }, []);

    const start = () => {
        if (!frameInfo.current.isLooping) {
            frameInfo.current.isLooping = true;
            requestAnimationFrame(gameLoop);
        }
    };
    
    const stop = () => {
        frameInfo.current.isLooping = false;
    };
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const threeRenderer = new THREE.WebGLRenderer({ canvas });
        threeRenderer.setSize(window.innerWidth, window.innerHeight);
        renderer.current = threeRenderer;
        scene.current = new THREE.Scene();
        camera.current = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.current.position.z = 1;

        const MAX_SHADER_ARTIFACTS = 4;
        const geometry = new THREE.PlaneGeometry(2, 2);
        const shaderMaterial = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader: fragmentShader(MAX_SHADER_ARTIFACTS),
            uniforms: {
                time: { value: 0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                mainState: { value: new Array(STATE_VECTOR_SIZE).fill(0.5) },
                numActiveArtifacts: { value: 0 },
                artifactStates: { value: new Array(MAX_SHADER_ARTIFACTS * STATE_VECTOR_SIZE).fill(0.5) },
                artifactSimilarities: { value: new Array(MAX_SHADER_ARTIFACTS).fill(0) },
                complexity: { value: 0.5 },
                syncFactor: { value: 0.0 },
                feedbackIntensity: { value: 0.0 }
            }
        });
        material.current = shaderMaterial;
        const mesh = new THREE.Mesh(geometry, shaderMaterial);
        scene.current.add(mesh);

        const handleResize = () => {
            if (renderer.current && camera.current && material.current) {
                const width = window.innerWidth;
                const height = window.innerHeight;
                renderer.current.setSize(width, height);
                camera.current.aspect = width / height;
                camera.current.updateProjectionMatrix();
                material.current.uniforms.resolution.value.set(width, height);
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            stop();
            window.removeEventListener('resize', handleResize);
            renderer.current?.dispose();
            material.current?.dispose();
            geometry.dispose();
        };
    }, [canvasRef, gameLoop]);

    return { start, stop };
};
