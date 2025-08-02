// @ts-nocheck
// This is a direct port of the provided hnm_core_v1.js.
// It relies on a global `tf` object from the TensorFlow.js CDN script.
// Minimal changes have been made to make it a valid TypeScript module.

declare var tf: any;

function hnmLog(message, level = "info") {
    console[level](`[HNM] ${message}`);
}

export class MemoryMLP_TFJS {
    constructor(inputDim, depth, expansionOrTargetDim, namePrefix = '', activation = 'elu') {
        this.inputDim = inputDim;
        this.depth = depth;
        this.namePrefix = namePrefix;
        this.model = null;
        this.isDisposed = false;

        if (depth < 1) { this.isIdentity = true; return; }
        this.isIdentity = false;

        const layers = [];
        let currentLayerInputShape = [this.inputDim];

        for (let i = 0; i < depth; i++) {
            const isLast = i === (depth - 1);
            let currentLayerOutputUnits;

            if (depth === 1) { currentLayerOutputUnits = expansionOrTargetDim; }
            else { currentLayerOutputUnits = isLast ? this.inputDim : Math.floor(this.inputDim * expansionOrTargetDim); }

            const denseLayerConfig = {
                units: currentLayerOutputUnits, kernelInitializer: 'glorotUniform',
                biasInitializer: 'zeros', name: `${namePrefix}_mlp_dense_${i}`
            };
            if (i === 0) { denseLayerConfig.inputShape = currentLayerInputShape; }
            layers.push(tf.layers.dense(denseLayerConfig));
            currentLayerInputShape = [currentLayerOutputUnits];

            if (!isLast) { layers.push(tf.layers.activation({ activation: activation, name: `${namePrefix}_mlp_act_${i}` })); }
        }
        this.model = tf.sequential({ name: `${namePrefix}_mlp_sequential`, layers });
    }

    call(inputs) {
        if (this.isDisposed) throw new Error(`${this.namePrefix} MLP model is disposed.`);
        if (this.isIdentity) return tf.keep(inputs.clone());
        if (!this.model) throw new Error(`MemoryMLP_TFJS (${this.namePrefix}): Model not initialized properly.`);
        return this.model.apply(inputs);
    }

    getWeights() {
        if (this.isDisposed || this.isIdentity || !this.model) return [];
        return this.model.getWeights().map(w => tf.keep(w.clone()));
    }

    setWeights(weights) {
        if (this.isDisposed || this.isIdentity || !this.model || !weights || weights.length === 0) return;
        this.model.setWeights(weights);
    }

    getTrainableVariables() {
        if (this.isDisposed || this.isIdentity || !this.model) return [];
        return this.model.trainableWeights.map(tw => tw.val);
    }

    dispose() {
        if (this.isDisposed) return;
        if (this.model && typeof this.model.dispose === 'function') { this.model.dispose(); }
        this.model = null; this.isDisposed = true;
    }
}

export function createNeuralMemState(seq_index = 0, layerWeights = {}, optim_state = {}) {
    return { seq_index, layerWeights, optim_state };
}

export function memStateDetach(state) {
    if (!state) return null;
    const detachedLayerWeights = {};
    for (const key in state.layerWeights) {
        if (Array.isArray(state.layerWeights[key])) {
            detachedLayerWeights[key] = state.layerWeights[key].map(t => {
                if (t && !t.isDisposed) return tf.keep(t.clone());
                hnmLog(`Warning: memStateDetach found disposed or null tensor for weight key ${key}. Returning null for this tensor.`, "warn");
                return null;
            }).filter(t => t !== null);
        } else {
            hnmLog(`Warning: memStateDetach encountered non-array weights for key ${key}`, "warn");
            detachedLayerWeights[key] = [];
        }
    }
    const detachedOptimState = JSON.parse(JSON.stringify(state.optim_state || {}));
    return createNeuralMemState(state.seq_index, detachedLayerWeights, detachedOptimState);
}

export function disposeMemStateWeights(state) {
    if (state && state.layerWeights) {
        for (const key in state.layerWeights) {
            if (Array.isArray(state.layerWeights[key])) {
                state.layerWeights[key].forEach(t => { if (t && !t.isDisposed) t.dispose(); });
            }
        }
        state.layerWeights = {};
    }
}

export function disposeHnsResultsTensors(hnsResults) {
    if (!hnsResults) return;
    const tensorDictionaries = [
        hnsResults.anomalies,
        hnsResults.weightChanges,
        hnsResults.buNorms,
        hnsResults.tdNorms,
        hnsResults.extNorms
    ];
    tensorDictionaries.forEach(dict => {
        if (dict) {
            Object.values(dict).forEach(tensor => {
                if (tensor && !tensor.isDisposed && typeof tensor.dispose === 'function') {
                    tensor.dispose();
                }
            });
        }
    });
}

export class NMM_TD_V5_TFJS {
    constructor(config) {
        this.levelName = config.name; this.dim = config.dim;
        this.buInputDims = { ...(config.bu_input_dims || {}) };
        this.tdInputDims = { ...(config.td_input_dims || {}) };

        this.nmmParams = {
            mem_model_depth: 2,
            mem_model_expansion: 2.0,
            learning_rate: 0.000,
            weight_decay: 0.000,
            beta1: 0.9,
            beta2: 0.999,
            max_grad_norm: 1.0,
            external_signal_dim: config.nmm_params?.external_signal_dim || 0,
            external_signal_role: config.nmm_params?.external_signal_role || 'none',
            verbose: config.nmm_params?.verbose || false,
            ...(config.nmm_params || {})
        };

        this.memoryModel = new MemoryMLP_TFJS(this.dim, this.nmmParams.mem_model_depth, this.nmmParams.mem_model_expansion, `${this.levelName}_mem_mlp`);
        this.toValueTarget = new MemoryMLP_TFJS(this.dim, 1, this.dim, `${this.levelName}_val_proj`);

        this.buProjections = {};
        for (const name in this.buInputDims) { this.buProjections[name] = new MemoryMLP_TFJS(this.buInputDims[name], 1, this.dim, `${this.levelName}_bu_proj_${name}`); }
        this.tdProjections = {};
        for (const name in this.tdInputDims) { this.tdProjections[name] = new MemoryMLP_TFJS(this.tdInputDims[name], 1, this.dim, `${this.levelName}_td_proj_${name}`); }

        this.externalSignalProjection = null;
        if (this.nmmParams.external_signal_dim > 0 && this.nmmParams.external_signal_role !== 'none') {
            this.externalSignalProjection = new MemoryMLP_TFJS(this.nmmParams.external_signal_dim, 1, this.dim, `${this.levelName}_ext_proj`);
        }

        this.lossFn = (labels, predictions) => tf.losses.meanSquaredError(labels, predictions);
        this.optimizer = null;
        this.updateLearningParams(this.nmmParams.learning_rate, this.nmmParams.weight_decay);
        
        if (this.nmmParams.verbose) hnmLog(`NMM_TD_V5_TFJS (${this.levelName}): Dim=${this.dim}, ExtDim=${this.nmmParams.external_signal_dim}, Role=${this.nmmParams.external_signal_role}, LR=${this.nmmParams.learning_rate.toExponential(2)}`);
        this.isDisposed = false;
    }

    updateLearningParams(lr, wd) {
        this.nmmParams.learning_rate = lr;
        this.nmmParams.weight_decay = wd;
        
        if (this.optimizer && typeof this.optimizer.dispose === 'function') {
            this.optimizer.dispose();
        }
        this.optimizer = null;

        if (this.nmmParams.learning_rate > 0) {
            this.optimizer = tf.train.adam(this.nmmParams.learning_rate, this.nmmParams.beta1, this.nmmParams.beta2, 1e-7);
            if (this.nmmParams.verbose) hnmLog(`NMM_TD_V5_TFJS (${this.levelName}): Optimizer re-created with LR=${this.nmmParams.learning_rate.toExponential(2)}`);
        } else {
            if (this.nmmParams.verbose) hnmLog(`NMM_TD_V5_TFJS (${this.levelName}): Optimizer disabled as LR is 0.`);
        }
    }

    _getLayerWeights() {
        if (this.isDisposed) throw new Error(`${this.levelName} NMM is disposed.`);
        const weights = { memoryModel: this.memoryModel.getWeights(), toValueTarget: this.toValueTarget.getWeights() };
        for (const name in this.buProjections) { weights[`buProj_${name}`] = this.buProjections[name].getWeights(); }
        for (const name in this.tdProjections) { weights[`tdProj_${name}`] = this.tdProjections[name].getWeights(); }
        if (this.externalSignalProjection) { weights.externalSignalProjection = this.externalSignalProjection.getWeights(); }
        return weights;
    }

    _applyLayerWeights(layerWeights) {
        if (this.isDisposed) throw new Error(`${this.levelName} NMM is disposed.`);
        if (!layerWeights) return;

        const tempClonedWeights = {};
        for (const key in layerWeights) {
            if (Array.isArray(layerWeights[key])) {
                tempClonedWeights[key] = layerWeights[key].map(t => t && !t.isDisposed ? t.clone() : null).filter(t => t);
            }
        }

        this.memoryModel.setWeights(tempClonedWeights.memoryModel || []);
        this.toValueTarget.setWeights(tempClonedWeights.toValueTarget || []);
        for (const name in this.buProjections) { this.buProjections[name].setWeights(tempClonedWeights[`buProj_${name}`] || []); }
        for (const name in this.tdProjections) { this.tdProjections[name].setWeights(tempClonedWeights[`tdProj_${name}`] || []); }
        if (this.externalSignalProjection && tempClonedWeights.externalSignalProjection) { this.externalSignalProjection.setWeights(tempClonedWeights.externalSignalProjection || []); }

        for (const key in tempClonedWeights) {
            if (Array.isArray(tempClonedWeights[key])) {
                tempClonedWeights[key].forEach(t => { if (t && !t.isDisposed) t.dispose(); });
            }
        }
    }

    getInitialState() {
        if (this.isDisposed) throw new Error(`${this.levelName} NMM is disposed.`);
        return createNeuralMemState(0, this._getLayerWeights(), { lr: this.nmmParams.learning_rate, wd: this.nmmParams.weight_decay });
    }

    _calculateWeightChange(oldWeightsMap, newWeightsMap) {
        return tf.tidy(`${this.levelName}_WeightChange`, () => {
            if (this.nmmParams.learning_rate === 0) return tf.keep(tf.tensor(0.0));

            let totalDiffSqSum = tf.tensor(0.0);
            for (const key in newWeightsMap) {
                const oldWArray = oldWeightsMap[key]; const newWArray = newWeightsMap[key];
                if (oldWArray && newWArray && oldWArray.length === newWArray.length) {
                    for (let i = 0; i < newWArray.length; i++) {
                        const oldW = oldWArray[i]; const newW = newWArray[i];
                        if (oldW && newW && !oldW.isDisposed && !newW.isDisposed && oldW.shape.toString() === newW.shape.toString()) {
                            const diff = newW.sub(oldW);
                            totalDiffSqSum = totalDiffSqSum.add(diff.square().sum());
                            diff.dispose();
                        } else { if (this.nmmParams.verbose) hnmLog(`Warning: Tensor mismatch or disposal during weight change calc for ${key}[${i}]`, "warn"); }
                    }
                }
            }
            return tf.keep(totalDiffSqSum.sqrt());
        });
    }

    forwardStep(buInputs, tdSignals, currentState, externalSignal = null, detachNextState = true) {
        if (this.isDisposed) throw new Error(`${this.levelName} NMM is disposed.`);

        const oldWeightsForChangeCalc = (this.nmmParams.learning_rate > 0) ? this._getLayerWeights() : null;
        this._applyLayerWeights(currentState.layerWeights);

        const resultsTidy = tf.tidy(`${this.levelName}_NMM_ForwardStep`, () => {
            const preparedInputs = tf.tidy(`${this.levelName}_InputPrep`, () => {
                const projectedBuSignals = [];
                for (const name in buInputs) {
                    if (this.buProjections[name] && buInputs[name] && !buInputs[name].isDisposed && buInputs[name].shape) {
                        projectedBuSignals.push(this.buProjections[name].call(buInputs[name].reshape([-1, this.buInputDims[name]])));
                    } else {
                        if (this.nmmParams.verbose) hnmLog(`Warning: Skipping BU input for ${name} in ${this.levelName}. Using zeros.`, "warn");
                        projectedBuSignals.push(tf.zeros([1, this.dim]));
                    }
                }
                const combBu = projectedBuSignals.length > 0 ? tf.addN(projectedBuSignals) : tf.zeros([1, this.dim]);
                projectedBuSignals.forEach(t => { if (t && !t.isDisposed) t.dispose(); });
                const cBuNorm = tf.norm(combBu);

                const projectedTdSignals = [];
                for (const name in tdSignals) {
                    if (this.tdProjections[name] && tdSignals[name] && !tdSignals[name].isDisposed && tdSignals[name].shape) {
                        projectedTdSignals.push(this.tdProjections[name].call(tdSignals[name].reshape([-1, this.tdInputDims[name]])));
                    } else {
                        if (this.nmmParams.verbose) hnmLog(`Warning: Skipping TD input for ${name} in ${this.levelName}. Using zeros.`, "warn");
                        projectedTdSignals.push(tf.zeros([1, this.dim]));
                    }
                }
                const combTd = projectedTdSignals.length > 0 ? tf.addN(projectedTdSignals) : tf.zeros([1, this.dim]);
                projectedTdSignals.forEach(t => { if (t && !t.isDisposed) t.dispose(); });
                const cTdNorm = tf.norm(combTd);

                let projExtSig = null;
                let cExtNorm = tf.tensor(0.0);
                if (this.nmmParams.external_signal_role !== 'none' && this.externalSignalProjection) {
                    if (externalSignal && !externalSignal.isDisposed && externalSignal.shape && externalSignal.shape.length === 3 && externalSignal.shape[externalSignal.shape.length - 1] === this.nmmParams.external_signal_dim) {
                        projExtSig = this.externalSignalProjection.call(externalSignal.reshape([-1, this.nmmParams.external_signal_dim]));
                    } else {
                        if (this.nmmParams.verbose && externalSignal) hnmLog(`Warning: External signal for ${this.levelName} invalid. Using zeros. Expected dim ${this.nmmParams.external_signal_dim}, got shape ${externalSignal?.shape}`, "warn");
                        else if (this.nmmParams.verbose && !externalSignal && this.nmmParams.external_signal_dim > 0) hnmLog(`Warning: External signal for ${this.levelName} missing. Using zeros. Expected dim ${this.nmmParams.external_signal_dim}`, "warn");
                        projExtSig = tf.zeros([1, this.dim]);
                    }
                    cExtNorm.dispose();
                    cExtNorm = tf.norm(projExtSig);
                }

                let keyBaseForPredictionTarget = combBu.clone();
                if (this.nmmParams.external_signal_role === 'add_to_bu' && projExtSig) {
                    keyBaseForPredictionTarget = keyBaseForPredictionTarget.add(projExtSig);
                }

                let mInput = combBu.add(combTd);
                if (this.nmmParams.external_signal_role === 'add_to_bu' && projExtSig) {
                    mInput = mInput.add(projExtSig);
                } else if (this.nmmParams.external_signal_role === 'add_to_td' && projExtSig) {
                    mInput = mInput.add(projExtSig);
                }

                let fValTarget = this.toValueTarget.call(keyBaseForPredictionTarget);
                if (this.nmmParams.external_signal_role === 'add_to_target' && projExtSig) {
                    fValTarget = fValTarget.add(projExtSig);
                }
                if (projExtSig && projExtSig !== externalSignal && !projExtSig.isDisposed && projExtSig.rank > 0) projExtSig.dispose();

                return { memInput: mInput, finalValTarget: fValTarget, currentBuNorm: cBuNorm, currentTdNorm: cTdNorm, currentExtNorm: cExtNorm };
            });

            const keptBuNorm = tf.keep(preparedInputs.currentBuNorm);
            const keptTdNorm = tf.keep(preparedInputs.currentTdNorm);
            const keptExtNorm = tf.keep(preparedInputs.currentExtNorm);

            const predictionBeforeTrain = this.memoryModel.call(preparedInputs.memInput);
            const keptPredictionForOutput = tf.keep(predictionBeforeTrain.clone().reshape([1, 1, this.dim]));

            let currentLossTensor = tf.tensor(0.0);

            if (this.optimizer && this.nmmParams.learning_rate > 0) {
                const trainableVarsForOptimizer = [];
                this.memoryModel.getTrainableVariables().forEach(v => trainableVarsForOptimizer.push(v));
                if (this.externalSignalProjection && this.nmmParams.external_signal_role !== 'none' && this.nmmParams.external_signal_dim > 0) {
                    this.externalSignalProjection.getTrainableVariables().forEach(v => trainableVarsForOptimizer.push(v));
                }

                if (trainableVarsForOptimizer.length > 0) {
                    const calculateLossFn = () => {
                        const currentPred = this.memoryModel.call(preparedInputs.memInput);
                        let mseLoss = this.lossFn(preparedInputs.finalValTarget, currentPred);
                        if (this.nmmParams.weight_decay > 0) {
                            let l2Loss = tf.tensor(0.0);
                            trainableVarsForOptimizer.forEach(v => { if (v.name.includes('kernel')) { l2Loss = l2Loss.add(v.square().sum()); } });
                            mseLoss = mseLoss.add(l2Loss.mul(this.nmmParams.weight_decay / 2));
                            l2Loss.dispose();
                        }
                        return mseLoss;
                    };

                    if (this.nmmParams.max_grad_norm && this.nmmParams.max_grad_norm > 0) {
                        const { value, grads } = this.optimizer.computeGradients(calculateLossFn, trainableVarsForOptimizer);
                        currentLossTensor.dispose(); currentLossTensor = value ? tf.keep(value) : tf.keep(tf.tensor(0.0));
                        if (grads) {
                            const gradArray = trainableVarsForOptimizer.map(v => grads[v.name]).filter(g => g && !g.isDisposed);
                            let finalGradsForApply = {};
                            if (gradArray.length > 0) {
                                const globalNorm = tf.tidy('globalNormCalc', () => { let totalNormSq = tf.scalar(0.0); for (const grad of gradArray) { totalNormSq = totalNormSq.add(tf.norm(grad).square()); } return totalNormSq.sqrt(); });
                                const globalNormVal = globalNorm.dataSync()[0]; globalNorm.dispose();
                                let clipRatioScalar = null; if (globalNormVal > this.nmmParams.max_grad_norm) { clipRatioScalar = tf.scalar(this.nmmParams.max_grad_norm / (globalNormVal + 1e-6)); }
                                trainableVarsForOptimizer.forEach(v => { if (grads[v.name] && !grads[v.name].isDisposed) { finalGradsForApply[v.name] = clipRatioScalar ? grads[v.name].mul(clipRatioScalar) : grads[v.name].clone(); } });
                                if (clipRatioScalar) clipRatioScalar.dispose();
                            }
                            this.optimizer.applyGradients(finalGradsForApply);
                            trainableVarsForOptimizer.forEach(v => { if (grads[v.name] && !grads[v.name].isDisposed) grads[v.name].dispose(); });
                            Object.values(finalGradsForApply).forEach(g => { if (g && !g.isDisposed) g.dispose(); });
                        } else { if (this.nmmParams.verbose) hnmLog(`Warning: Grads object from computeGradients is null/undefined for NMM ${this.levelName}.`, "warn"); }
                    } else {
                        const lossTensorFromOptimizer = this.optimizer.minimize(calculateLossFn, true, trainableVarsForOptimizer);
                        currentLossTensor.dispose(); currentLossTensor = lossTensorFromOptimizer ? tf.keep(lossTensorFromOptimizer) : tf.keep(tf.tensor(0.0));
                    }
                } else { if (this.nmmParams.verbose) hnmLog(`Warning: No trainable variables for NMM ${this.levelName}. Training skipped.`, "warn"); }
            } else {
                currentLossTensor.dispose();
                currentLossTensor = tf.keep(this.lossFn(predictionBeforeTrain, preparedInputs.finalValTarget));
            }
            if (preparedInputs.memInput && !preparedInputs.memInput.isDisposed) preparedInputs.memInput.dispose();
            if (preparedInputs.finalValTarget && !preparedInputs.finalValTarget.isDisposed) preparedInputs.finalValTarget.dispose();

            return { prediction: keptPredictionForOutput, loss: currentLossTensor, buNorm: keptBuNorm, tdNorm: keptTdNorm, extNorm: keptExtNorm };
        });

        const retrievedValForOutput = resultsTidy.prediction;
        const lossVal = resultsTidy.loss;
        const buNormVal = resultsTidy.buNorm;
        const tdNormVal = resultsTidy.tdNorm;
        const extNormVal = resultsTidy.extNorm;

        let weightChangeVal;
        let newModelWeightsAfterTraining;
        if (this.nmmParams.learning_rate > 0 && oldWeightsForChangeCalc) {
            newModelWeightsAfterTraining = this._getLayerWeights();
            weightChangeVal = this._calculateWeightChange(oldWeightsForChangeCalc, newModelWeightsAfterTraining);
            Object.values(oldWeightsForChangeCalc).forEach(arr => arr.forEach(t => { if (t && !t.isDisposed) t.dispose(); }));
        } else {
            weightChangeVal = tf.keep(tf.tensor(0.0));
            newModelWeightsAfterTraining = currentState.layerWeights;
        }

        const nextStateInterim = createNeuralMemState(currentState.seq_index + 1, newModelWeightsAfterTraining, currentState.optim_state);
        const nextStateFinal = detachNextState ? memStateDetach(nextStateInterim) : nextStateInterim;
        if (detachNextState && this.nmmParams.learning_rate > 0 && newModelWeightsAfterTraining !== currentState.layerWeights) {
            disposeMemStateWeights(nextStateInterim);
        } else if (detachNextState && this.nmmParams.learning_rate === 0) {
            // No disposal needed here if not training, as memStateDetach clones.
        }

        return { retrievedVal: retrievedValForOutput, nextState: nextStateFinal, anomalyScore: lossVal, weightChange: weightChangeVal, buNorm: buNormVal, tdNorm: tdNormVal, extNorm: extNormVal };
    }

    dispose() {
        if (this.isDisposed) return;
        this.memoryModel.dispose(); this.toValueTarget.dispose();
        Object.values(this.buProjections).forEach(p => p.dispose()); Object.values(this.tdProjections).forEach(p => p.dispose());
        if (this.externalSignalProjection) this.externalSignalProjection.dispose();
        this.isDisposed = true; hnmLog(`NMM ${this.levelName} disposed.`);
    }
}

export class HierarchicalSystemV5_TFJS {
    constructor(levelConfigsHLC, globalSimConfig) {
        this.levelConfigsOriginal = JSON.parse(JSON.stringify(levelConfigsHLC));
        this.globalConfig = globalSimConfig;
        this.numLevels = 0; this.levels = [];
        this.levelNameToIndex = {}; this.dims = {}; this.isDisposed = false;
        this.level_expected_external_details = [];

        this._initializeLevels();
    }

    _initializeLevels() {
        hnmLog(`HS_V5_TFJS: Initializing ${this.levelConfigsOriginal.length} levels.`);
        this.levelConfigsOriginal.forEach((cfg, i) => {
            if (!cfg.name || !cfg.dim) throw new Error(`Level ${i} config missing name or dim.`);
            this.levelNameToIndex[cfg.name] = i; this.dims[cfg.name] = cfg.dim;
        });

        this.levelConfigsOriginal.forEach((hlc_level_cfg, i) => {
            const nmmConstructorConfig = {
                name: hlc_level_cfg.name,
                dim: hlc_level_cfg.dim,
                bu_input_dims: {},
                td_input_dims: {},
                nmm_params: {
                    verbose: this.globalConfig.HNM_VERBOSE || false,
                    learning_rate: 0.000,
                    weight_decay: 0.000,
                    beta1: 0.9, beta2: 0.999, max_grad_norm: 1.0,
                    external_signal_dim: 0, external_signal_role: 'none',
                    mem_model_depth: 2, mem_model_expansion: 2.0,
                    ...(hlc_level_cfg.nmm_params || {})
                }
            };

            if (!hlc_level_cfg.bu_source_level_names || hlc_level_cfg.bu_source_level_names.length === 0) {
                if (!hlc_level_cfg.raw_sensory_input_dim || hlc_level_cfg.raw_sensory_input_dim <= 0) {
                    throw new Error(`Lvl '${hlc_level_cfg.name}' is a sensory level but lacks a valid 'raw_sensory_input_dim'.`);
                }
                nmmConstructorConfig.bu_input_dims[hlc_level_cfg.name] = hlc_level_cfg.raw_sensory_input_dim;
            } else {
                hlc_level_cfg.bu_source_level_names.forEach(srcName => {
                    if (!this.dims[srcName]) throw new Error(`Unknown BU source '${srcName}' for level '${hlc_level_cfg.name}'.`);
                    nmmConstructorConfig.bu_input_dims[srcName] = this.dims[srcName];
                });
            }
            if (hlc_level_cfg.td_source_level_names) {
                hlc_level_cfg.td_source_level_names.forEach(srcName => {
                    if (!this.dims[srcName]) throw new Error(`Unknown TD source '${srcName}' for level '${hlc_level_cfg.name}'.`);
                    nmmConstructorConfig.td_input_dims[srcName] = this.dims[srcName];
                });
            }

            let expectedNmmExtSourceName = null;
            let nmmExtSignalDimForNMM = 0;
            let nmmExtSignalRoleForNMM = nmmConstructorConfig.nmm_params.external_signal_role;

            const specificExtConfig = hlc_level_cfg.external_input_config;
            if (specificExtConfig && typeof specificExtConfig === 'object' && !Array.isArray(specificExtConfig) &&
                specificExtConfig.source_signal_name && specificExtConfig.dim > 0) {
                expectedNmmExtSourceName = specificExtConfig.source_signal_name;
                nmmExtSignalDimForNMM = specificExtConfig.dim;
                if (nmmExtSignalDimForNMM > 0 && nmmExtSignalRoleForNMM === 'none') {
                    nmmExtSignalRoleForNMM = 'add_to_bu';
                }
            } else if (specificExtConfig && nmmConstructorConfig.nmm_params.verbose) {
                hnmLog(`Warning for ${hlc_level_cfg.name}: external_input_config is present but invalid or incomplete. ${JSON.stringify(specificExtConfig)}`, "warn");
            }

            nmmConstructorConfig.nmm_params.external_signal_dim = nmmExtSignalDimForNMM;
            nmmConstructorConfig.nmm_params.external_signal_role = nmmExtSignalRoleForNMM;
            this.level_expected_external_details[i] = { name: expectedNmmExtSourceName, dim: nmmExtSignalDimForNMM };

            this.levels.push(new NMM_TD_V5_TFJS(nmmConstructorConfig));
        });
        this.numLevels = this.levels.length;
        hnmLog(`HS_V5_TFJS: Initialization complete. ${this.levels.length} levels created.`);
    }

    setLearningParameters(learningRate, weightDecay) {
        if (this.isDisposed) return;
        hnmLog(`HS_V5_TFJS: Updating learning parameters. LR=${learningRate}, WD=${weightDecay}`);
        this.levels.forEach(level => {
            if (level && typeof level.updateLearningParams === 'function') {
                level.updateLearningParams(learningRate, weightDecay);
            }
        });
    }

    getInitialStates() {
        if (this.isDisposed) throw new Error(`HNS is disposed.`);
        return this.levels.map(level => level.getInitialState());
    }

    step(currentBotLevelStates, currentBotLastStepOutputs, sensoryInputs, externalInputsAllSources = {}, detachNextStatesMemory = true) {
        if (this.isDisposed) throw new Error(`HNS is disposed.`);

        const nextBotLevelStatesList = new Array(this.numLevels).fill(null);
        const newlyRetrievedValuesForAllLevelsDict = {};
        const stepAnomalies = {}; const stepWeightChanges = {};
        const stepBuNorms = {}; const stepTdNorms = {}; const stepExternalNorms = {};
        const currentStepIntermediateOutputs = {};

        for (let i = 0; i < this.numLevels; i++) {
            const lvlMgr = this.levels[i]; const cfg = this.levelConfigsOriginal[i];
            const lvlName = cfg.name; const buSrcNames = cfg.bu_source_level_names || []; const tdSrcNames = cfg.td_source_level_names || [];
            const currentLevelSpecificState = currentBotLevelStates[i];
            const lvlBuIn = {}; const lvlTdIn = {};

            if (buSrcNames.length === 0) {
                const rawSensoryDim = cfg.raw_sensory_input_dim;
                const sensoryInputTensor = sensoryInputs[lvlName];

                if (sensoryInputTensor && !sensoryInputTensor.isDisposed &&
                    sensoryInputTensor.shape && sensoryInputTensor.shape.length === 3 &&
                    sensoryInputTensor.shape[0] === 1 && sensoryInputTensor.shape[1] === 1 &&
                    sensoryInputTensor.shape[2] === rawSensoryDim) {
                    lvlBuIn[lvlName] = sensoryInputTensor;
                } else {
                    if (lvlMgr.nmmParams.verbose) hnmLog(`Warning: Sensory input for ${lvlName} is invalid or missing. Using zeros. Expected shape [1,1,${rawSensoryDim}], got ${sensoryInputTensor?.shape}`, "warn");
                    lvlBuIn[lvlName] = tf.keep(tf.zeros([1, 1, rawSensoryDim]));
                }
            } else {
                buSrcNames.forEach(srcName => {
                    const buSourceOutput = currentStepIntermediateOutputs[srcName];
                    if (buSourceOutput && !buSourceOutput.isDisposed) { lvlBuIn[srcName] = buSourceOutput; }
                    else {
                        hnmLog(`Warning: Missing BU source output from '${srcName}' for level '${lvlName}' in current step. Using zeros.`, "warn");
                        lvlBuIn[srcName] = tf.keep(tf.zeros([1, 1, this.dims[srcName]]));
                    }
                });
            }

            tdSrcNames.forEach(srcName => {
                const tdSourceOutput = currentBotLastStepOutputs[srcName]?.retrievedVal;
                if (tdSourceOutput && !tdSourceOutput.isDisposed) { lvlTdIn[srcName] = tdSourceOutput; }
                else {
                    lvlTdIn[srcName] = tf.keep(tf.zeros([1, 1, this.dims[srcName]]));
                }
            });

            let lvlExtInForNMMStep = null;
            const expectedExternal = this.level_expected_external_details[i];
            if (expectedExternal && expectedExternal.name && expectedExternal.dim > 0) {
                const providedSignal = externalInputsAllSources[expectedExternal.name];
                if (providedSignal && !providedSignal.isDisposed && providedSignal.shape &&
                    providedSignal.shape.length === 3 && providedSignal.shape[0] === 1 &&
                    providedSignal.shape[1] === 1 && providedSignal.shape[2] === expectedExternal.dim) {
                    lvlExtInForNMMStep = providedSignal;
                } else {
                    if (lvlMgr.nmmParams.verbose) hnmLog(`Warning for ${lvlName}: External signal '${expectedExternal.name}' invalid or missing from externalInputsAllSources. Using zeros. Expected dim ${expectedExternal.dim}, got ${providedSignal?.shape}`, "warn");
                    lvlExtInForNMMStep = tf.keep(tf.zeros([1, 1, expectedExternal.dim]));
                }
            }

            const nmmOutputs = lvlMgr.forwardStep(lvlBuIn, lvlTdIn, currentLevelSpecificState, lvlExtInForNMMStep, detachNextStatesMemory);

            nextBotLevelStatesList[i] = nmmOutputs.nextState;
            currentStepIntermediateOutputs[lvlName] = tf.keep(nmmOutputs.retrievedVal.clone());
            newlyRetrievedValuesForAllLevelsDict[lvlName] = nmmOutputs.retrievedVal;

            stepAnomalies[lvlName] = nmmOutputs.anomalyScore;
            stepWeightChanges[lvlName] = nmmOutputs.weightChange;
            stepBuNorms[lvlName] = nmmOutputs.buNorm;
            stepTdNorms[lvlName] = nmmOutputs.tdNorm;
            stepExternalNorms[lvlName] = nmmOutputs.extNorm;

            Object.entries(lvlBuIn).forEach(([key, t]) => { if (t !== sensoryInputs[lvlName] && t !== currentStepIntermediateOutputs[key] && t.rank === 3 && t.shape[0] === 1 && !t.isDisposed && t.dataSync().every(v => v === 0)) t.dispose(); });
            Object.entries(lvlTdIn).forEach(([key, t]) => { if (t !== currentBotLastStepOutputs[key]?.retrievedVal && t.rank === 3 && t.shape[0] === 1 && !t.isDisposed && t.dataSync().every(v => v === 0)) t.dispose(); });
            if (lvlExtInForNMMStep && lvlExtInForNMMStep !== externalInputsAllSources[expectedExternal?.name] && lvlExtInForNMMStep.rank === 3 && lvlExtInForNMMStep.shape[0] === 1 && !lvlExtInForNMMStep.isDisposed && lvlExtInForNMMStep.dataSync().every(v => v === 0)) lvlExtInForNMMStep.dispose();
        }

        Object.values(currentStepIntermediateOutputs).forEach(t => { if (t && !t.isDisposed) t.dispose(); });

        return { newlyRetrievedValues: newlyRetrievedValuesForAllLevelsDict, nextBotStates: nextBotLevelStatesList, anomalies: stepAnomalies, weightChanges: stepWeightChanges, buNorms: stepBuNorms, tdNorms: stepTdNorms, extNorms: stepExternalNorms };
    }

    dispose() {
        if (this.isDisposed) return;
        this.levels.forEach(l => { if (l && typeof l.dispose === 'function') l.dispose(); });
        this.levels = []; this.isDisposed = true; hnmLog("HNS Disposed.");
    }
}