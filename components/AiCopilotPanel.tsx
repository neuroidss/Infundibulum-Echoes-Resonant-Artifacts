import React from 'react';

interface AiCopilotPanelProps {
  thought: string;
  isThinking: boolean;
  onRefine: () => void;
  isDisabled: boolean;
}

const AiCopilotPanel: React.FC<AiCopilotPanelProps> = ({ thought, isThinking, onRefine, isDisabled }) => {

  const icon = isThinking 
    ? (
      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white">
        <path fillRule="evenodd" d="M9.661 2.234a.75.75 0 0 1 .678 0 11.947 11.947 0 0 0 7.23 7.23.75.75 0 0 1 0 .678A11.947 11.947 0 0 0 10.339 17.766a.75.75 0 0 1-.678 0 11.947 11.947 0 0 0-7.23-7.23.75.75 0 0 1 0-.678A11.947 11.947 0 0 0 9.66 2.234Z" clipRule="evenodd" />
      </svg>
    );

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg z-20">
      <div className="bg-gray-900/60 backdrop-blur-md border border-purple-500/30 rounded-full shadow-lg flex items-center justify-between p-2">
        <div className="flex items-center flex-1 min-w-0">
          <p className="text-purple-300/80 font-mono text-xs font-bold px-3 hidden sm:block">CO-PILOT</p>
          <p className="text-gray-200 text-sm px-2 truncate flex-1" title={thought}>
            {thought}
          </p>
        </div>
        <button
          onClick={onRefine}
          disabled={isThinking || isDisabled}
          className="flex-shrink-0 w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white font-semibold hover:bg-purple-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-400"
          aria-label="Manually trigger AI Co-pilot refinement"
        >
          {icon}
        </button>
      </div>
    </div>
  );
};

export default AiCopilotPanel;
