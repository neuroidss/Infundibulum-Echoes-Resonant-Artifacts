
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MenuSettings, LastRecording } from '../types';
import { TUNING_SCRIPTS } from '../constants';

interface TuningWorkbenchModalProps {
  isVisible: boolean;
  onClose: () => void;
  menuSettings: MenuSettings;
  onMenuSettingChange: <K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => void;
  onRun: () => void;
  onRecord: () => void;
  onStop: () => void;
  analyserNode: AnalyserNode | null;
  lastRecording: LastRecording | null;
}

const TuningWorkbenchModal: React.FC<TuningWorkbenchModalProps> = ({
  isVisible,
  onClose,
  menuSettings,
  onMenuSettingChange,
  onRun,
  onRecord,
  onStop,
  analyserNode,
  lastRecording,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyStatus, setCopyStatus] = useState('');

  // --- HOOKS (must be called before any conditional returns) ---
  const {
    tuningWorkbench_selectedInstrument,
    tuningWorkbench_selectedScript,
    tuningWorkbench_isScriptRunning,
    tuningWorkbench_currentStepInfo,
  } = menuSettings;

  const instrumentOptions = useMemo(() => Object.keys(TUNING_SCRIPTS), []);
  
  const scriptOptions = useMemo(() => {
    const scripts = TUNING_SCRIPTS[tuningWorkbench_selectedInstrument as keyof typeof TUNING_SCRIPTS];
    return scripts ? scripts.map(s => s.name) : [];
  }, [tuningWorkbench_selectedInstrument]);

  const selectedScriptContent = useMemo(() => {
    const script = TUNING_SCRIPTS[tuningWorkbench_selectedInstrument as keyof typeof TUNING_SCRIPTS]?.find(
      s => s.name === tuningWorkbench_selectedScript
    );
    return script ? JSON.stringify(script.steps.map(s => ({ d: s.duration, p: s.params, desc: s.description })), null, 2) : 'No script selected.';
  }, [tuningWorkbench_selectedInstrument, tuningWorkbench_selectedScript]);

  useEffect(() => {
    if (!isVisible || !analyserNode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    let animationFrameId: number;

    const draw = () => {
        animationFrameId = requestAnimationFrame(draw);
        analyserNode.getByteFrequencyData(dataArray);

        ctx.fillStyle = 'rgb(15, 23, 42)'; // bg-slate-900
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / dataArray.length) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            barHeight = dataArray[i] / 2;
            const hue = 240 - (barHeight / 128) * 120; // from blue to magenta/red
            ctx.fillStyle = `hsl(${hue}, 90%, 65%)`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isVisible, analyserNode]);


  if (!isVisible) return null;

  // --- Event Handlers ---
  const handleInstrumentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newInstrument = e.target.value;
    onMenuSettingChange('tuningWorkbench_selectedInstrument', newInstrument);
    const firstScript = TUNING_SCRIPTS[newInstrument as keyof typeof TUNING_SCRIPTS]?.[0]?.name || '';
    onMenuSettingChange('tuningWorkbench_selectedScript', firstScript);
  };

  const handleScriptChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onMenuSettingChange('tuningWorkbench_selectedScript', e.target.value);
  };
  
    const showCopyFeedback = (message: string) => {
        setCopyStatus(message);
        setTimeout(() => setCopyStatus(''), 2000);
    };

    const handleDownload = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownloadUrl = (url: string, filename: string) => {
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    const handleCopyJson = async (blob: Blob | null) => {
        if (!blob) return;
        try {
            const text = await blob.text();
            await navigator.clipboard.writeText(text);
            showCopyFeedback('JSON Copied!');
        } catch (err) {
            console.error('Failed to copy JSON: ', err);
            showCopyFeedback('Copy Failed!');
        }
    };

    const handleCopyImage = async (dataUrl: string | null) => {
        if (!dataUrl) return;
        try {
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            showCopyFeedback('Image Copied!');
        } catch (err) {
            console.error('Failed to copy image: ', err);
            showCopyFeedback('Copy Failed!');
        }
    };

    const handleCopyAudio = async (blob: Blob | null) => {
        if (!blob) return;
        try {
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            showCopyFeedback('Audio Copied!');
        } catch (err) {
            console.error('Failed to copy audio: ', err);
            showCopyFeedback('Copy Failed!');
        }
    };


  const baseInputClass = "w-full px-4 py-3 bg-gray-800/80 text-white placeholder-gray-500 border border-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const baseButtonClass = "w-full px-6 py-3 rounded-md font-semibold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed";
  const smallButtonClass = "w-full px-2 py-1 bg-gray-700 text-white text-xs rounded-md hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-4xl bg-gray-900 border border-purple-800/50 rounded-lg p-6 md:p-8 shadow-2xl shadow-purple-500/10" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-purple-300">Instrument Tuning Workbench</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white transition-colors disabled:text-gray-600" 
            aria-label="Close tuning workbench"
            disabled={tuningWorkbench_isScriptRunning}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Controls */}
            <div className="flex flex-col gap-4">
                <div>
                    <label htmlFor="instrument-select" className="block text-gray-400 text-xs font-mono mb-1">INSTRUMENT</label>
                    <select id="instrument-select" value={tuningWorkbench_selectedInstrument} onChange={handleInstrumentChange} className={baseInputClass} disabled={tuningWorkbench_isScriptRunning}>
                        {instrumentOptions.map(inst => <option key={inst} value={inst}>{inst}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="script-select" className="block text-gray-400 text-xs font-mono mb-1">SCRIPT</label>
                    <select id="script-select" value={tuningWorkbench_selectedScript} onChange={handleScriptChange} className={baseInputClass} disabled={tuningWorkbench_isScriptRunning}>
                        {scriptOptions.map(script => <option key={script} value={script}>{script}</option>)}
                    </select>
                </div>
                <div className="bg-black/30 p-3 rounded-md">
                     <label htmlFor="status-display" className="block text-gray-400 text-xs font-mono mb-1">STATUS</label>
                     <p id="status-display" className="text-cyan-300 text-sm h-10 overflow-y-auto">{tuningWorkbench_currentStepInfo}</p>
                </div>

                {lastRecording && (
                    <div className="bg-black/30 p-3 rounded-md">
                        <h4 className="block text-gray-400 text-xs font-mono mb-2">RECORDING RESULTS <span className='text-cyan-300'>{copyStatus}</span></h4>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            {/* Audio */}
                            <div className="flex flex-col gap-1.5">
                                <p className="text-sm font-semibold text-gray-300">Audio</p>
                                <button onClick={() => handleCopyAudio(lastRecording.audioBlob)} disabled={!lastRecording.audioBlob} className={smallButtonClass}>Copy</button>
                                <button onClick={() => handleDownload(lastRecording.audioBlob!, `${lastRecording.scriptFileName}.webm`)} disabled={!lastRecording.audioBlob} className={smallButtonClass}>Download</button>
                            </div>
                            {/* JSON */}
                            <div className="flex flex-col gap-1.5">
                                 <p className="text-sm font-semibold text-gray-300">JSON</p>
                                <button onClick={() => handleCopyJson(lastRecording.scriptBlob)} disabled={!lastRecording.scriptBlob} className={smallButtonClass}>Copy</button>
                                <button onClick={() => handleDownload(lastRecording.scriptBlob!, `${lastRecording.scriptFileName}_script.json`)} disabled={!lastRecording.scriptBlob} className={smallButtonClass}>Download</button>
                            </div>
                            {/* Spectrogram */}
                            <div className="flex flex-col gap-1.5">
                                 <p className="text-sm font-semibold text-gray-300">Spectrogram</p>
                                <button onClick={() => handleCopyImage(lastRecording.spectrogramDataUrl)} disabled={!lastRecording.spectrogramDataUrl} className={smallButtonClass}>Copy</button>
                                <button onClick={() => handleDownloadUrl(lastRecording.spectrogramDataUrl!, `${lastRecording.scriptFileName}_spectrogram.png`)} disabled={!lastRecording.spectrogramDataUrl} className={smallButtonClass}>Download</button>
                            </div>
                        </div>
                    </div>
                )}


                 <div className="grid grid-cols-2 gap-3 mt-auto">
                    <button onClick={onRun} disabled={tuningWorkbench_isScriptRunning} className={`${baseButtonClass} bg-green-600 text-white hover:bg-green-500 disabled:bg-gray-700`}>
                        ▶️ Run
                    </button>
                     <button onClick={onRecord} disabled={tuningWorkbench_isScriptRunning} className={`${baseButtonClass} bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-700`}>
                        ⏺️ Record
                    </button>
                 </div>
                 <button onClick={onStop} disabled={!tuningWorkbench_isScriptRunning} className={`${baseButtonClass} bg-red-600 text-white hover:bg-red-500 disabled:bg-gray-700`}>
                    ⏹️ Stop
                </button>
            </div>

            {/* Right Column - Script & Spectrogram */}
            <div className="flex flex-col gap-4">
                 <label className="block text-gray-400 text-xs font-mono">LIVE SPECTROGRAM</label>
                 <canvas ref={canvasRef} className="w-full h-28 bg-slate-900 rounded-md border border-gray-700" width="512" height="128"></canvas>
                 <label htmlFor="script-content" className="block text-gray-400 text-xs font-mono mb-1">SCRIPT CONTENT (JSON)</label>
                 <textarea
                    id="script-content"
                    readOnly
                    value={selectedScriptContent}
                    className={`${baseInputClass} h-48 font-mono text-xs leading-relaxed`}
                 />
            </div>
        </div>
      </div>
    </div>
  );
};

export default TuningWorkbenchModal;
