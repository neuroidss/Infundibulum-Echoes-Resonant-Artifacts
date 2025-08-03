
import type { InputState } from '../types';
import { clamp, fract } from './utils';

declare var tf: any;

export class PlaceholderInputProcessor {
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
            const touchVelMag = clamp(Math.sqrt(inputData.touch.dx ** 2 + inputData.touch.dy ** 2) * 25, 0, 1);
            
            const accelAvailable = inputData.accelerometer.available;
            const accelNormX = accelAvailable ? clamp((inputData.accelerometer.x + 20) / 40, 0, 1) : 0.5;
            const accelNormY = accelAvailable ? clamp((inputData.accelerometer.y + 20) / 40, 0, 1) : 0.5;
            const accelNormZ = accelAvailable ? clamp((inputData.accelerometer.z + 20) / 40, 0, 1) : 0.5;
            const accelMagNorm = accelAvailable ? clamp(inputData.accelerometer.magnitude / 25, 0, 1) : 0;

            const micRhythmPeak = inputData.mic.available ? inputData.mic.rhythmPeak : 0;
            const micRhythmTempoNorm = inputData.mic.available ? clamp((inputData.mic.rhythmTempo - 60) / (240 - 60), 0, 1) : 0.5;
            const accelRhythmPeak = accelAvailable ? inputData.accelerometer.rhythmPeak : 0;
            const accelRhythmTempoNorm = accelAvailable ? clamp((inputData.accelerometer.rhythmTempo - 60) / (240 - 60), 0, 1) : 0.5;

            for (let i = 0; i < this.outputDim; i++) {
                switch (i % 16) {
                    case 0: vec[i] = inputData.touch.x * (1.0 + touchFactor * 0.1); break;
                    case 1: vec[i] = inputData.touch.y * (1.0 + touchFactor * 0.1); break;
                    case 2: vec[i] = touchFactor; break;
                    case 3: vec[i] = alphaNorm; break;
                    case 4: vec[i] = betaNorm; break;
                    case 5: vec[i] = gammaNorm; break;
                    case 6: vec[i] = micLevel; break;
                    case 7: vec[i] = touchVelMag; break;
                    case 8: vec[i] = accelNormX; break;
                    case 9: vec[i] = accelNormY; break;
                    case 10: vec[i] = accelNormZ; break;
                    case 11: vec[i] = accelMagNorm; break;
                    case 12: vec[i] = micRhythmPeak; break;
                    case 13: vec[i] = micRhythmTempoNorm; break;
                    case 14: vec[i] = accelRhythmPeak; break;
                    case 15: vec[i] = accelRhythmTempoNorm; break;
                }
                const prevVal = vec[(i + this.outputDim - 1) % this.outputDim] !== undefined ? vec[(i + this.outputDim - 1) % this.outputDim] : 0;
                const otherVal = vec[(i + 5) % this.outputDim] !== undefined ? vec[(i + 5) % this.outputDim] : 0;
                vec[i] = fract(vec[i] * 1.1 + prevVal * 0.3 + Math.sin(otherVal * 5.1 + i * 0.1 + currentTime * 0.1) * 0.1);
                vec[i] = 1.0 / (1.0 + Math.exp(-(vec[i] * 2.0 - 1.0) * 1.8));
                vec[i] = clamp(vec[i] || 0, 0, 1);
            }

            if (inputData.mic.available && inputData.mic.fft) {
                const fftData = inputData.mic.fft;
                const fftLen = fftData.length;
                const segments = 8;
                const binsPerSegment = Math.max(1, Math.floor(fftLen / segments));
                for (let seg = 0; seg < segments; seg++) {
                    let peakDb = -140;
                    const start = seg * binsPerSegment;
                    const end = Math.min(start + binsPerSegment, fftLen);
                    for (let k = start; k < end; k++) {
                        if (isFinite(fftData[k])) peakDb = Math.max(peakDb, fftData[k]);
                    }
                    const normPeak = clamp((peakDb + 100) / 100, 0, 1);
                    const tIdxStart = this.outputDim - 1 - seg * 2;
                    if (tIdxStart >= 0) vec[tIdxStart] = (vec[tIdxStart] * 0.5 + normPeak * 0.5);
                    if (tIdxStart - 1 >= 0) vec[tIdxStart - 1] = (vec[tIdxStart - 1] * 0.3 + normPeak * 0.7);
                }
            }
            return tf.tensor1d(vec).expandDims(0).expandDims(0);
        });
    }
}
