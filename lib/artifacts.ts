import type { Artifact, ActiveArtifactInfo } from '../types';

declare var tf: any;

export class FeatureExtractor {
    constructor(public stateVectorSize: number) {}

    private _getCategory(v: number, thresholds: number[], labels: string[]): string {
        for (let i = 0; i < thresholds.length; i++) {
            if (v < thresholds[i]) return labels[i];
        }
        return labels[labels.length - 1];
    }

    extractTags(arr: number[] | Float32Array): string {
        if (!arr || arr.length !== this.stateVectorSize) return "";
        const tags = new Set<string>();
        const i = {
            kick: 0, arpSpeed: 1, bassCut: 2, bright: 3, sat: 4, hue: 5,
            flow: 6, warp: 7, complexity: 8, tempo: 9, reverb: 10,
            leadDecay: 11, noiseLevel: 12, leadPresence: 16
        };

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

export class ArtifactManager {
    artifacts: Artifact[] = [];
    nextId = 0;

    constructor(
        public maxArtifacts: number,
        public stateVectorSize: number,
        public embeddingDim: number,
        public featureExtractor: FeatureExtractor,
        public embeddingProvider: any
    ) {}

    async createArtifact(stateVectorTensor: any, areEmbeddingsReady: boolean): Promise<[boolean, Artifact | null]> {
        if (!areEmbeddingsReady || !this.featureExtractor || !this.embeddingProvider || !stateVectorTensor || stateVectorTensor.isDisposed) {
            return [false, null];
        }
        
        const stateArr = await stateVectorTensor.squeeze([0, 1]).data();
        const tags = this.featureExtractor.extractTags(stateArr);
        if (!tags) return [false, null];

        const embResult = await this.embeddingProvider(tags, { pooling: 'mean', normalize: true });
        if (!embResult || !embResult.data || embResult.data.length !== this.embeddingDim) return [false, null];
        
        const newArtifact: Artifact = {
            id: this.nextId++,
            stateVector: Array.from(stateArr),
            featureTags: tags,
            embedding: embResult.data,
            timestamp: Date.now()
        };

        this.artifacts.push(newArtifact);
        if (this.artifacts.length > this.maxArtifacts) {
            this.artifacts.sort((a, b) => a.timestamp - b.timestamp).shift();
        }
        
        return [true, newArtifact];
    }

    private _cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
        if (!a || !b || a.length !== b.length) return 0;
        let dot = 0, nA = 0, nB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            nA += a[i] * a[i];
            nB += b[i] * b[i];
        }
        return dot / (Math.sqrt(nA) * Math.sqrt(nB) + 1e-9);
    }

    async findRelevantArtifacts(stateTensor: any, areEmbeddingsReady: boolean, thresh: number, maxCnt: number): Promise<ActiveArtifactInfo> {
        const result: ActiveArtifactInfo = { ids: [], stateArrays: [], similarities: [] };
        if (!areEmbeddingsReady || this.artifacts.length === 0 || !stateTensor || stateTensor.isDisposed) return result;

        const stateArr = await stateTensor.squeeze([0, 1]).data();
        const tags = this.featureExtractor.extractTags(stateArr);
        if (!tags) return result;

        const queryEmb = (await this.embeddingProvider(tags, { pooling: 'mean', normalize: true })).data;
        if (!queryEmb) return result;
        
        const candidates = this.artifacts.map(art => ({
            art,
            similarity: this._cosineSimilarity(queryEmb, art.embedding as number[])
        }));

        const relevant = candidates.filter(c => c.similarity >= thresh).sort((a, b) => b.similarity - a.similarity);
        relevant.slice(0, maxCnt).forEach(item => {
            result.ids.push(item.art.id);
            result.stateArrays.push(item.art.stateVector);
            result.similarities.push(item.similarity);
        });
        
        return result;
    }

    getArtifactCount(): number {
        return this.artifacts.length;
    }

    setArtifacts(loaded: Artifact[]) {
        if (!Array.isArray(loaded)) {
            this.artifacts = [];
            this.nextId = 0;
            return;
        }
        this.artifacts = loaded.map(a => ({
            ...a,
            stateVector: Array.from(a.stateVector),
            embedding: Array.from(a.embedding)
        }));
        this.nextId = loaded.length > 0 ? Math.max(...loaded.map(a => a.id)) + 1 : 0;
    }

    forgetOldestArtifact(): boolean {
        if (this.artifacts.length === 0) return false;
        this.artifacts.sort((a, b) => a.timestamp - b.timestamp).shift();
        return true;
    }
}