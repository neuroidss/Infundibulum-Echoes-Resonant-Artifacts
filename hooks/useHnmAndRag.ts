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
            hnmLastStepOutputs.current = {};
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
        return tf.tidy(() => {
            if (!activeArtifacts || activeArtifacts.ids.length === 0) {
                return tf.keep(tf.zeros([1, 1, dim]));
            }
            const blendedSignal = tf.tidy(() => {
                let accumulatedSignal = tf.zeros([dim]);
                let totalSim = 0;
                for (let i = 0; i < activeArtifacts.ids.length; i++) {
                    const stateVec = activeArtifacts.stateArrays[i];
                    const similarity = activeArtifacts.similarities[i];
                    if (stateVec.length >= dim) {
                        const stateTensor = tf.tensor1d(stateVec.slice(0, dim));
                        accumulatedSignal = accumulatedSignal.add(stateTensor.mul(similarity));
                        totalSim += similarity;
                        stateTensor.dispose();
                    }
                }
                if (totalSim > 1e-6) {
                    return accumulatedSignal.div(totalSim);
                }
                return accumulatedSignal;
            });
    
            const emptyState = tf.zeros([dim]);
            const finalSignal = tensorLerp(emptyState, blendedSignal, Math.min(1.0, activeArtifacts.ids.length / REASONABLE_SHADER_ARTIFACT_CAP));
            
            emptyState.dispose();
            blendedSignal.dispose();
    
            return tf.keep(finalSignal.reshape([1, 1, dim]));
        });
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
            await new Promise(resolve => setTimeout(resolve, 10));

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
    };
};