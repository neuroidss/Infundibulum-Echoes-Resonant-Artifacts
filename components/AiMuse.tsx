import React, { useState, useRef, useEffect } from 'react';

interface AiMuseProps {
  isGenerating: boolean;
  onGenerate: (prompt: string) => void;
  isDisabled: boolean;
  isCopilotActive: boolean;
  isPsyCoreModulatorActive: boolean;
}

const AiMuse: React.FC<AiMuseProps> = ({ isGenerating, onGenerate, isDisabled, isCopilotActive, isPsyCoreModulatorActive }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const trulyDisabled = isDisabled || isCopilotActive || isPsyCoreModulatorActive;

  // If AI is disabled or another mode is active, ensure the panel is closed.
  useEffect(() => {
    if (trulyDisabled) {
        setIsOpen(false);
    }
  }, [trulyDisabled]);


  const handleToggle = () => {
    if (trulyDisabled) return;

    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    if (newIsOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isGenerating && !trulyDisabled) {
      onGenerate(prompt);
      setIsOpen(false);
    }
  };
  
  const getPlaceholderText = () => {
      if (isDisabled) return "AI is not configured";
      if (isCopilotActive) return "AI Co-pilot is active";
      if (isPsyCoreModulatorActive) return "Psy-Core Modulator is active";
      return "Describe a sound, genre, or mood...";
  }

  const fabIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white">
      <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 019.75 22.5a.75.75 0 01-.75-.75v-4.131A15.838 15.838 0 016.382 15H2.25a.75.75 0 01-.75-.75 6.75 6.75 0 017.815-6.666zM15 6.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" clipRule="evenodd" />
      <path d="M5.26 17.242a.75.75 0 10-1.06-1.06 7.5 7.5 0 00-1.964 5.344.75.75 0 00.75.75h.01a.75.75 0 00.74-.646 6 6 0 011.53-3.335z" />
    </svg>
  );

  return (
    <div className="fixed bottom-16 right-4 z-30">
      <div className="relative flex flex-col items-end gap-2">
        {/* Input form, shown when open */}
        <div 
          className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}
        >
          <form 
            onSubmit={handleSubmit} 
            className="flex items-center gap-2 p-2 bg-gray-900/80 backdrop-blur-md border border-purple-700/50 rounded-lg shadow-2xl"
          >
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={getPlaceholderText()}
              disabled={trulyDisabled || isGenerating}
              className="w-64 bg-transparent text-white placeholder-gray-400 focus:outline-none"
              aria-label="AI Muse Prompt"
            />
            <button 
              type="submit" 
              disabled={isGenerating || trulyDisabled || !prompt.trim()}
              className="p-2 bg-purple-600 rounded-md hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
              aria-label="Generate with AI Muse"
            >
              {isGenerating ? 
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> :
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M9.53 2.302a.75.75 0 01.94 0l1.25 1.25a.75.75 0 01.22.53v.016l.03 1.26a.75.75 0 01-1.498.032l-.03-1.26a.75.75 0 01.22-.53l-1.25-1.25a.75.75 0 01-.47-.218z" clipRule="evenodd" />
                    <path d="M4.94 4.94a.75.75 0 011.06 0l.292.293a.75.75 0 010 1.061l-2.02 2.02a.75.75 0 01-1.06 0l-.293-.292a.75.75 0 010-1.061l2.02-2.02z" />
                    <path d="M12.97 4.97a.75.75 0 011.06 0l2.02 2.02a.75.75 0 010 1.06l-.292.293a.75.75 0 01-1.061 0l-2.02-2.02a.75.75 0 010-1.06l.292-.293z" />
                    <path fillRule="evenodd" d="M10 8.25a.75.75 0 01.75.75v1.834l.28-.28A.75.75 0 0112.09 11.6l-2.5 2.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 111.06-1.06l.28.28V9a.75.75 0 01.75-.75z" clipRule="evenodd" />
                    <path d="M3.5 13.5a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zM14.5 13.5a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75z" />
                    <path fillRule="evenodd" d="M6.25 15.25a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75zM8.5 17.5a.75.75 0 01.75-.75h2a.75.75 0 010 1.5h-2a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                </svg>
              }
            </button>
          </form>
        </div>

        {/* FAB button */}
        <button
          onClick={handleToggle}
          disabled={trulyDisabled}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
            trulyDisabled ? 'bg-gray-600 cursor-not-allowed' : 
            isOpen ? 'bg-purple-800 hover:bg-purple-700' : 
            'bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500'
          }`}
          aria-label={isOpen ? 'Close AI Muse' : 'Open AI Muse'}
        >
          {isOpen ?
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-white"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg> :
             fabIcon
          }
        </button>
      </div>
    </div>
  );
};

export default AiMuse;
