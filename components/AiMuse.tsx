import React, { useState, useRef } from 'react';

interface AiMuseProps {
  isGenerating: boolean;
  onGenerate: (prompt: string) => void;
  isDisabled: boolean;
}

const AiMuse: React.FC<AiMuseProps> = ({ isGenerating, onGenerate, isDisabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (isDisabled) {
    return null;
  }

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isGenerating) {
      onGenerate(prompt);
      setIsOpen(false);
    }
  };

  const fabIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
      <path d="M12.75 3.375a.75.75 0 0 0-1.5 0V4.5h-1.125a.75.75 0 0 0 0 1.5h1.125V7.125a.75.75 0 0 0 1.5 0V6h1.125a.75.75 0 0 0 0-1.5H12.75V3.375z" />
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM11.663 10.237c.394.066.663.41.663.813v.002a.85.85 0 0 1-.663.813q-.16.026-.328.026c-.864 0-1.6-.563-1.6-1.462 0-.9 1.125-1.462 1.928-1.462.434 0 .813.148 1.125.45l-.832.744a.43.43 0 0 0-.293-.45zM14.25 10.237c.394.066.663.41.663.813v.002a.85.85 0 0 1-.663.813q-.16.026-.328.026c-.864 0-1.6-.563-1.6-1.462 0-.9 1.125-1.462 1.928-1.462.434 0 .813.148 1.125.45l-.832.744a.43.43 0 0 0-.293-.45z" clipRule="evenodd" />
    </svg>
  );

  return (
    <>
      <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl mb-4 z-20 transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none -bottom-20'}`}>
        <form onSubmit={handleSubmit} className="relative w-full">
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a sound, genre, or mood..."
            className="w-full pl-4 pr-28 py-4 bg-gray-900/70 text-white placeholder-gray-400 border border-blue-500/30 rounded-full focus:ring-2 focus:ring-blue-400 focus:outline-none backdrop-blur-sm shadow-lg"
            disabled={isGenerating}
            aria-label="AI Muse Prompt"
          />
          <button
            type="submit"
            disabled={isGenerating || !prompt.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-12 px-6 bg-blue-600 text-white rounded-full font-semibold flex items-center justify-center disabled:bg-gray-500 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
            aria-label="Generate with AI Muse"
          >
            {isGenerating ? '...' : 'Generate'}
          </button>
        </form>
      </div>
      
      <div className="fixed bottom-4 right-4 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:right-4 z-30">
        <button
          onClick={handleToggle}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-white transition-all duration-300 ease-in-out transform shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-blue-400
            ${isOpen ? 'bg-red-600 hover:bg-red-500 scale-90' : 'bg-blue-600 hover:bg-blue-500 scale-100'}
          `}
          aria-label={isOpen ? 'Close AI Muse' : 'Open AI Muse'}
        >
          {isOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : fabIcon}
        </button>
      </div>
    </>
  );
};

export default AiMuse;
