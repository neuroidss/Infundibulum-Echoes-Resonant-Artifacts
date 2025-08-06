
import { useState, useRef, useCallback } from 'react';
import { pipeline, env } from '@xenova/transformers';
import { HierarchicalSystemV5_TFJS, memStateDetach, disposeMemStateWeights, disposeHnsResultsTensors } from '../lib/hnm_core_v1';
import { FeatureExtractor, ArtifactManager } from '../lib/artifacts';
import {
    STATE_VECTOR_SIZE, EMBEDDING_DIM, MAX_ARTIFACTS, EMBEDDING_MODEL_NAME,
    HNM_HIERARCHY_LEVEL_CONFIGS, HNM_VERBOSE,
    HNM_POLICY_HEAD_INPUT_LEVEL_NAME,
    REASONABLE_SHADER_ARTIFACT_CAP
} from '../constants';
import type { HnmState, HnmLastStepOutputs, Artifact, ActiveArtifactInfo } from '../types';
import { tensorLerp } from '../lib/utils';

declare var tf: any;

export const useHnmAndRag = (showLoading: (visible: boolean, message?: string, progress?: string) => void) => {
    const [embeddingsReady, setEmbeddingsReady] = useState(false);
    const hnmSystem = useRef<HierarchicalSystemV5_TFJS | null>(null);
    const artifactManager = useRef<ArtifactManager | null>(null);
    const hnmMemoryStates = useRef<HnmState[]>([]);
    const hnmLastStepOutputs = useRef<HnmLastStepOutputs>({});
    const currentResonantState = useRef<any>(null); // tf.Tensor
    const lastL0Anomaly = useRef<number>(0.5);
    const activeArtifactInfo = useRef<ActiveArtifactInfo>({ ids: [], stateArrays: [], similarities: [] });

    const initialize = useCallback(async () => {
        showLoading(true, 'Initializing AI Core...', 'Loading HNM...');
        
        // Init HNM
        if (!hnmSystem.current) {
            const hnmConfig = { HNM_VERBOSE };
            hnmSystem.current = new HierarchicalSystemV5_TFJS(HNM_HIERARCHY_LEVEL_CONFIGS, hnmConfig);
            hnmMemoryStates.current = hnmSystem.current.getInitialStates();
            currentResonantState.current = tf.keep(tf.zeros([1, 1, STATE_VECTOR_SIZE]));
        }

        // Init RAG
        showLoading(true, 'Initializing AI Core...', 'Loading embedding model...');
        if (!artifactManager.current) {
            try {
                env.allowLocalModels = false;
                const embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL_NAME, {
                    progress_callback: (p: any) => {
                        if (p.status === 'progress') {
                             showLoading(true, 'Downloading embedding model', `${p.file} (${Math.round(p.progress)}%)`);
                        }
                    }
                });
                const featureExtractor = new FeatureExtractor(STATE_VECTOR_SIZE);
                artifactManager.current = new ArtifactManager(MAX_ARTIFACTS, STATE_VECTOR_SIZE, EMBEDDING_DIM, featureExtractor, embeddingPipeline);
                setEmbeddingsReady(true);
            } catch (e) {
                console.error("Failed to load embedding model", e);
                throw new Error("Failed to load embedding model. Check network connection.");
            }
        }
    }, [showLoading]);

    const projectArtifactsToExternalSignal = useCallback((activeArtifacts: ActiveArtifactInfo, dim: number): any => {
        // This function is called from within a tf.tidy block in the main loop,
        // so all tensors created here will be automatically cleaned up.
        if (!activeArtifacts || activeArtifacts.stateArrays.length === 0) {
            return tf.zeros([1, 1, dim]);
        }
    
        const stateArrays = activeArtifacts.stateArrays.map(arr => arr.slice(0, dim));
        const similarities = activeArtifacts.similarities;
    
        if (stateArrays.length === 0) {
            return tf.zeros([1, 1, dim]);
        }
        
        // Create one big tensor for all artifact states
        const artifactsTensor = tf.tensor2d(stateArrays); // Shape: [num_artifacts, dim]
        // Create one tensor for all similarities
        const similaritiesTensor = tf.tensor1d(similarities).reshape([-1, 1]); // Shape: [num_artifacts, 1]
    
        // Multiply them together (broadcasting)
        const scaledArtifacts = artifactsTensor.mul(similaritiesTensor); // Shape: [num_artifacts, dim]
    
        // Sum them along the artifact axis
        const summedSignal = scaledArtifacts.sum(0); // Shape: [dim]
    
        const totalSim = similarities.reduce((a, b) => a + b, 0);
    
        let blendedSignal;
        if (totalSim > 1e-6) {
            blendedSignal = summedSignal.div(totalSim);
        } else {
            blendedSignal = summedSignal;
        }
        
        const emptyState = tf.zeros([dim]);
        const finalSignal = tensorLerp(emptyState, blendedSignal, Math.min(1.0, activeArtifacts.ids.length / REASONABLE_SHADER_ARTIFACT_CAP));
        
        return finalSignal.reshape([1, 1, dim]);
    }, []);

    const trainOnArtifacts = useCallback(async (learningRate: number, weightDecay: number) => {
        if (!hnmSystem.current || !artifactManager.current || artifactManager.current.getArtifactCount() < 2) {
            throw new Error("Training requirements not met (HNM/RAG not ready or not enough artifacts).");
        }

        hnmSystem.current.setLearningParameters(learningRate, weightDecay);
        let trainingSessionStates = hnmMemoryStates.current.map(s => memStateDetach(s));
        const artifacts = artifactManager.current.artifacts;
        const N_SUPERVISION_STEPS = 25;

        for (let step = 0; step < N_SUPERVISION_STEPS; step++) {
            showLoading(true, "Training HNM...", `Supervision Step ${step + 1} / ${N_SUPERVISION_STEPS}`);
            await new Promise(resolve => setTimeout(() => resolve(undefined), 10));

            const inputArtifact = artifacts[Math.floor(Math.random() * artifacts.length)];
            const targetArtifact = artifacts[Math.floor(Math.random() * artifacts.length)];

            const hnmStepPackage = tf.tidy(() => {
                const inputStateVector = tf.tensor1d(inputArtifact.stateVector).reshape([1, 1, STATE_VECTOR_SIZE]);
                const targetStateVector = tf.tensor1d(targetArtifact.stateVector).reshape([1, 1, STATE_VECTOR_SIZE]);
                const trainingTargets = { [HNM_POLICY_HEAD_INPUT_LEVEL_NAME]: targetStateVector };

                return hnmSystem.current!.step(
                    trainingSessionStates,
                    hnmLastStepOutputs.current,
                    { [HNM_HIERARCHY_LEVEL_CONFIGS[0].name]: inputStateVector },
                    {},
                    false, // DO NOT detach the states yet
                    trainingTargets
                );
            });

            trainingSessionStates.forEach(disposeMemStateWeights);
            const newStates = (hnmStepPackage as any).nextBotStates;
            trainingSessionStates = newStates.map(s => memStateDetach(s));

            disposeMemStateWeights((hnmStepPackage as any).nextBotStates);
            disposeHnsResultsTensors(hnmStepPackage as any);
            Object.values((hnmStepPackage as any).newlyRetrievedValues as HnmLastStepOutputs).forEach(v => v.retrievedVal?.dispose());
        }

        hnmMemoryStates.current.forEach(disposeMemStateWeights);
        hnmMemoryStates.current = trainingSessionStates;

        hnmSystem.current.setLearningParameters(0, 0); // Disable learning after training
    }, [showLoading]);

    const getMemoryUsageInfo = useCallback(() => {
        let hnmWeightsBytes = 0;
        if (hnmMemoryStates.current && hnmMemoryStates.current.length > 0) {
            for (const state of hnmMemoryStates.current) {
                if (!state || !state.layerWeights) continue;
                for (const key in state.layerWeights) {
                    if (Array.isArray(state.layerWeights[key])) {
                        for (const tensor of state.layerWeights[key]) {
                            if (tensor && !tensor.isDisposed) {
                                hnmWeightsBytes += tensor.size * 4; // Assume float32
                            }
                        }
                    }
                }
            }
        }
    
        const resonantStateBytes = (currentResonantState.current && !currentResonantState.current.isDisposed)
            ? currentResonantState.current.size * 4
            : 0;
        
        let artifactBytes = 0;
        if (artifactManager.current) {
            for (const artifact of artifactManager.current.artifacts) {
                // embedding is Float32Array, stateVector is number[] treated as float32
                artifactBytes += (artifact.embedding.length + artifact.stateVector.length) * 4;
            }
        }
    
        return {
            totalUsefulBytes: hnmWeightsBytes + resonantStateBytes + artifactBytes,
        };
    }, []);

    const getTrackedTensorCount = useCallback(() => {
        let count = 0;
        
        // Resonant state
        if (currentResonantState.current && !currentResonantState.current.isDisposed) {
            count++;
        }
    
        // HNM Weights
        if (hnmMemoryStates.current && hnmMemoryStates.current.length > 0) {
            for (const state of hnmMemoryStates.current) {
                if (!state || !state.layerWeights) continue;
                for (const key in state.layerWeights) {
                    if (Array.isArray(state.layerWeights[key])) {
                        for (const tensor of state.layerWeights[key]) {
                            if (tensor && !tensor.isDisposed) {
                                count++;
                            }
                        }
                    }
                }
            }
        }
    
        // HNM Last step outputs
        if (hnmLastStepOutputs.current) {
            for(const key in hnmLastStepOutputs.current) {
                const output = hnmLastStepOutputs.current[key];
                if (output?.retrievedVal && !output.retrievedVal.isDisposed) {
                    count++;
                }
            }
        }
        
        return count;
    }, []);

    const reset = useCallback(() => {
        hnmMemoryStates.current.forEach(disposeMemStateWeights);
        Object.values(hnmLastStepOutputs.current).forEach(v => v.retrievedVal?.dispose());
        currentResonantState.current?.dispose();
        lastL0Anomaly.current = 0.5;
        activeArtifactInfo.current = { ids: [], stateArrays: [], similarities: [] };
        
        hnmSystem.current?.dispose();
        hnmSystem.current = null;
        artifactManager.current = null; // embeddings will reload on next init
        setEmbeddingsReady(false);
    }, []);

    const loadState = useCallback((savedArtifacts: Artifact[], savedResonantState: number[]) => {
        if(artifactManager.current) {
            artifactManager.current.setArtifacts(savedArtifacts);
        }
        if(savedResonantState?.length === STATE_VECTOR_SIZE) {
            currentResonantState.current?.dispose();
            currentResonantState.current = tf.keep(tf.tensor1d(savedResonantState).reshape([1,1,STATE_VECTOR_SIZE]));
        }
    }, []);


    return {
        initialize,
        hnmSystem,
        artifactManager,
        hnmMemoryStates,
        hnmLastStepOutputs,
        currentResonantState,
        embeddingsReady,
        trainOnArtifacts,
        reset,
        loadState,
        lastL0Anomaly,
        activeArtifactInfo,
        projectArtifactsToExternalSignal,
        getMemoryUsageInfo,
        getTrackedTensorCount,
    };
};
