import React from 'react';

interface AiDebugLogProps {
  log: string;
  onClose: () => void;
}

const AiDebugLog: React.FC<AiDebugLogProps> = ({ log, onClose }) => {
  return (
    <div className="fixed bottom-4 left-4 max-w-sm w-[calc(100%-2rem)] bg-black/70 backdrop-blur-sm border border-blue-900/50 rounded-lg shadow-2xl z-40 text-white font-mono text-xs">
      <div className="flex justify-between items-center p-2 bg-black/30 border-b border-blue-900/50">
        <h3 className="font-semibold text-blue-300">AI Debug Log</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close AI Debug Log">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
      </div>
      <div className="p-3 max-h-48 overflow-y-auto">
        <pre className="whitespace-pre-wrap break-words">{log}</pre>
      </div>
    </div>
  );
};

export default AiDebugLog;