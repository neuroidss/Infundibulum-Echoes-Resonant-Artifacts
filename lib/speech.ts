
import { SPEECH_COMMANDS } from '../constants';

export class SpeechRecognitionController {
    recognition: any;
    isSupported: boolean;
    isListening = false;
    isActive = false;
    isStarting = false;
    isStopping = false;
    permissionGranted = false;
    commandCallback: (cmd: string) => void;
    statusCallback: (status: string) => void;
    errorCallback: (message: string) => void;
    consecutiveErrorCount = 0;
    MAX_CONSECUTIVE_ERRORS = 8;
    restartTimeoutId: ReturnType<typeof setTimeout> | null = null;

    constructor(
        commandCallback: (cmd: string) => void,
        statusCallback: (status: string) => void,
        errorCallback: (message: string) => void,
    ) {
        this.commandCallback = commandCallback;
        this.statusCallback = statusCallback;
        this.errorCallback = errorCallback;
        this.isSupported = ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
        if (!this.isSupported) {
            this.statusCallback("Unsupported");
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
            this.statusCallback("Listening");
        };

        this.recognition.onend = () => {
            this.isActive = false;
            this.isStarting = false;
            this.isStopping = false;
            if (this.isListening) {
                this._scheduleRestart(150 + Math.random() * 100);
            } else {
                this.statusCallback("Idle");
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
                this.errorCallback(`Voice commands blocked: ${error}`);
            } else {
                this.consecutiveErrorCount++;
            }
            if (this.consecutiveErrorCount > this.MAX_CONSECUTIVE_ERRORS) {
                autoRestart = false;
                this.isListening = false;
                this.errorCallback("Speech recognition stopped due to repeated errors.");
            }
            if (this.isListening && autoRestart) {
                this._scheduleRestart(750 + Math.random() * 500);
            }
        };
        this.statusCallback("Initialized");
    }

    _scheduleRestart(delay: number) {
        if (this.restartTimeoutId) clearTimeout(this.restartTimeoutId);
        this.restartTimeoutId = setTimeout(() => {
            this.restartTimeoutId = null;
            this.startListening();
        }, delay);
    }

    startListening() {
        if (!this.isSupported || this.isActive || this.isStarting) return;
        
        if (!this.recognition) {
           this.permissionGranted = true;
           this._initializeRecognition();
        }

        if (!this.recognition) return;

        this.isListening = true;
        this.isStarting = true;
        this.statusCallback("Starting...");
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
        this.statusCallback("Stopping");
        try {
            this.recognition.stop();
        } catch (e) {
            this.isStopping = false; this.isActive = false;
        }
    }
}
