import React, { useRef, useState } from 'react';
import { useInfundibulum } from './hooks/useInfundibulum';
import UIOverlay from './components/UIOverlay';
import GuiController from './components/GuiController';
import AiMuse from './components/AiMuse';
import AiConfigModal from './components/AiConfigModal';
import AiDebugLog from './components/AiDebugLog';
import AiCopilotPanel from './components/AiCopilotPanel';
import type { LocalAiStatus } from './types';


// --- Local AI Panel Component ---
interface LocalAiPanelProps {
  status: LocalAiStatus;
  isServerConnected: boolean;
  onInstall: () => void;
  onStart: () => void;
  onStop: () => void;
  onTest: (audioBlob: Blob) => void;
  onClose: () => void;
  isInstalling: boolean;
}

const LocalAiPanel: React.FC<LocalAiPanelProps> = ({
  status,
  isServerConnected,
  onInstall,
  onStart,
  onStop,
  onTest,
  onClose,
  isInstalling,
}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
    const [testResult, setTestResult] = useState('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const logsContainerRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
    }, [status.logs]);

    const handleStartRecording = async () => {
        setTestResult('');
        setRecordedAudioBlob(null);
        audioChunksRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            const mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              console.error(`Audio recording failed: MimeType ${mimeType} is not supported.`);
              return;
            }
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                setRecordedAudioBlob(blob);
                if (mediaRecorderRef.current?.stream) {
                    mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
                }
                setIsRecording(false);
            };
            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error(`Audio recording failed: ${err}`);
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    };
    
    const handleTest = async () => {
        if (!recordedAudioBlob) return;
        setIsProcessing(true);
        setTestResult('');
        try {
            await onTest(recordedAudioBlob);
            setTestResult('Audio sent to local server for transcription. Check logs for result.');
        } catch (e: any) {
             setTestResult(`Test failed: ${e.message}`);
        } finally {
             setIsProcessing(false);
        }
    }

    return (
        <div className="fixed bottom-4 left-4 max-w-sm w-[calc(100%-2rem)] bg-gray-900/80 backdrop-blur-md border border-indigo-700/50 rounded-lg shadow-2xl z-40 text-white font-mono text-xs">
            <div className="flex justify-between items-center p-2 bg-black/30 border-b border-indigo-700/50">
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isServerConnected ? (status.isRunning ? 'bg-green-500 animate-pulse' : 'bg-yellow-500') : 'bg-red-500'}`}></div>
                    <h3 className="font-semibold text-indigo-300">Local AI Server</h3>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close Local AI Panel">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            
            <div className="p-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                    <button onClick={onInstall} disabled={isInstalling || !isServerConnected} className="flex-1 bg-purple-600 text-white font-semibold py-1 px-3 text-xs rounded hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        {isInstalling ? '...' : 'Install Script'}
                    </button>
                    <button onClick={onStart} disabled={status.isRunning || !isServerConnected} className="flex-1 bg-green-600 text-white font-semibold py-1 px-3 text-xs rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed">Start</button>
                    <button onClick={onStop} disabled={!status.isRunning || !isServerConnected} className="flex-1 bg-red-600 text-white font-semibold py-1 px-3 text-xs rounded hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed">Stop</button>
                </div>
                
                <div>
                    <h4 className="font-semibold text-gray-400 text-[10px] mb-1 uppercase">Server Logs</h4>
                    <div ref={logsContainerRef} className="h-24 bg-black/30 p-2 rounded text-[10px] overflow-y-auto scroll-smooth">
                        {status.logs.map((log, index) => (
                            <div key={index} className="text-slate-400 break-words whitespace-pre-wrap">{log}</div>
                        ))}
                    </div>
                </div>

                <div>
                    <h4 className="font-semibold text-gray-400 text-[10px] mb-2 uppercase">Multimodal Test</h4>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button onClick={isRecording ? handleStopRecording : handleStartRecording} disabled={!status.isRunning || isProcessing} className={`px-3 py-1 font-bold text-white text-xs rounded flex items-center gap-2 transition-all duration-200 disabled:opacity-50 ${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                          {isRecording ? 'Stop' : 'Record'}
                        </button>
                        <button onClick={handleTest} disabled={!recordedAudioBlob || isProcessing || isRecording || !status.isRunning} className="px-3 py-1 font-bold text-white text-xs rounded flex items-center gap-2 transition-all duration-200 bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                          {isProcessing ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div> : '🧪'}
                          {isProcessing ? 'Testing...' : 'Test Audio'}
                        </button>
                    </div>
                    {recordedAudioBlob && !isRecording && (
                        <div className="mt-2 text-center">
                            <audio controls src={URL.createObjectURL(recordedAudioBlob)} className="w-full h-8" />
                        </div>
                    )}
                    {testResult && (
                        <div className="mt-2">
                            <pre className="mt-1 text-xs text-cyan-200 bg-black/30 p-1.5 rounded-md whitespace-pre-wrap">{testResult}</pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { 
    debugInfo, 
    warningInfo, 
    loadingInfo, 
    speechStatus, 
    isInitialized,
    isAiDisabled,
    menuSettings,
    handleMenuSettingChange,
    resetMenuSettingsToDefault,
    resetHnmRag,
    genreEditState,
    handleGenreEditChange,
    loadSelectedGenreToSliders,
    saveSlidersToSelectedGenre,
    handleAiGenerate,
    isAiConfigModalVisible,
    toggleAiConfigModal,
    handleAiConfigSubmit,
    handleCopilotRefine,
    handleTrainOnArtifacts,
    handleInstallGemmaScript,
    handleStartLocalAiServer,
    handleStopLocalAiServer,
    handleTestLocalAi,
    isInstallingLocalAiScript,
    isServerConnected,
  } = useInfundibulum(canvasRef);

  return (
    <div className="relative h-full w-full bg-black">
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full block" />
      <UIOverlay
        debugInfo={debugInfo}
        warningInfo={warningInfo}
        loadingInfo={loadingInfo}
        speechStatus={speechStatus}
      />
      {isInitialized && (
        <>
          <GuiController
            menuSettings={menuSettings}
            onMenuSettingChange={handleMenuSettingChange}
            resetMenuToDefaults={resetMenuSettingsToDefault}
            resetHnmRag={resetHnmRag}
            genreEditState={genreEditState}
            onGenreEditChange={handleGenreEditChange}
            loadSelectedGenreToSliders={loadSelectedGenreToSliders}
            saveSlidersToSelectedGenre={saveSlidersToSelectedGenre}
            isDisabled={isAiDisabled}
            toggleAiConfigModal={toggleAiConfigModal}
            handleTrainOnArtifacts={handleTrainOnArtifacts}
          />
          {menuSettings.showAiMuse && !menuSettings.enableAiCopilotMode && (
            <AiMuse
              isGenerating={loadingInfo.visible && loadingInfo.message.startsWith('AI Muse')}
              onGenerate={handleAiGenerate}
              isDisabled={isAiDisabled}
              isCopilotActive={menuSettings.enableAiCopilotMode}
              isPsyCoreModulatorActive={menuSettings.enablePsyCoreModulatorMode}
            />
          )}
          {menuSettings.enableAiCopilotMode && (
            <AiCopilotPanel
              thought={menuSettings.aiCopilotThought}
              isThinking={loadingInfo.visible && loadingInfo.message.startsWith('Co-pilot')}
              onRefine={handleCopilotRefine}
              isDisabled={isAiDisabled}
            />
          )}
          <AiConfigModal
            isVisible={isAiConfigModalVisible}
            onClose={() => toggleAiConfigModal(false)}
            onSubmit={handleAiConfigSubmit}
            currentSettings={menuSettings}
          />
          {menuSettings.showAiDebugLog && (
              <AiDebugLog 
                log={menuSettings.aiDebugLog}
                onClose={() => handleMenuSettingChange('showAiDebugLog', false)}
              />
          )}
          {menuSettings.showLocalAiPanel && (
            <LocalAiPanel 
              status={menuSettings.localAiStatus}
              isServerConnected={isServerConnected}
              onInstall={handleInstallGemmaScript}
              onStart={handleStartLocalAiServer}
              onStop={handleStopLocalAiServer}
              onTest={handleTestLocalAi}
              onClose={() => handleMenuSettingChange('showLocalAiPanel', false)}
              isInstalling={isInstallingLocalAiScript}
            />
          )}
        </>
      )}
    </div>
  );
};

export default App;