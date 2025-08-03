import React, { useState, useEffect } from 'react';
import type { MenuSettings } from '../types';

interface AiConfigModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (settings: Partial<MenuSettings>) => void;
  currentSettings: MenuSettings;
}

const AiConfigModal: React.FC<AiConfigModalProps> = ({ isVisible, onClose, onSubmit, currentSettings }) => {
  const [localSettings, setLocalSettings] = useState<Partial<MenuSettings>>({});

  useEffect(() => {
    if (isVisible) {
      setLocalSettings({
        googleApiKey: currentSettings.googleApiKey,
        openAiApiKey: currentSettings.openAiApiKey,
        openAiBaseUrl: currentSettings.openAiBaseUrl,
        ollamaHost: currentSettings.ollamaHost,
      });
    }
  }, [isVisible, currentSettings]);

  if (!isVisible) {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocalSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(localSettings);
  };

  const inputClass = "w-full px-4 py-3 bg-gray-800/80 text-white placeholder-gray-500 border border-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors";
  const labelClass = "block text-gray-400 text-xs font-mono mb-1";

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-gray-900 border border-blue-800/50 rounded-lg p-6 md:p-8 shadow-2xl shadow-blue-500/10" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-blue-300">AI Provider Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close configuration modal">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div>
            <h3 className="text-lg text-gray-200 font-semibold mb-2 border-b border-gray-700 pb-1">Google AI</h3>
            <label htmlFor="googleApiKey" className={labelClass}>GOOGLE_GEMINI_API_KEY</label>
            <input id="googleApiKey" name="googleApiKey" type="password" value={localSettings.googleApiKey || ''} onChange={handleInputChange} placeholder="Enter your Gemini API key" className={inputClass} />
          </div>

          <div>
            <h3 className="text-lg text-gray-200 font-semibold mb-2 border-b border-gray-700 pb-1">OpenAI Compatible</h3>
            <label htmlFor="openAiApiKey" className={labelClass}>OPENAI_API_KEY</label>
            <input id="openAiApiKey" name="openAiApiKey" type="password" value={localSettings.openAiApiKey || ''} onChange={handleInputChange} placeholder="Enter your OpenAI-compatible API key" className={inputClass} />
            <label htmlFor="openAiBaseUrl" className={`${labelClass} mt-3`}>OPENAI_BASE_URL</label>
            <input id="openAiBaseUrl" name="openAiBaseUrl" type="text" value={localSettings.openAiBaseUrl || ''} onChange={handleInputChange} placeholder="https://api.example.com/v1" className={inputClass} />
          </div>

          <div>
            <h3 className="text-lg text-gray-200 font-semibold mb-2 border-b border-gray-700 pb-1">Ollama (Local)</h3>
            <label htmlFor="ollamaHost" className={labelClass}>OLLAMA_HOST</label>
            <input id="ollamaHost" name="ollamaHost" type="text" value={localSettings.ollamaHost || ''} onChange={handleInputChange} placeholder="http://localhost:11434" className={inputClass} />
          </div>
          
          <button
            type="submit"
            className="w-full mt-4 px-6 py-3 bg-blue-600 text-white rounded-md font-semibold flex items-center justify-center disabled:bg-gray-600 hover:bg-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500"
            aria-label="Save AI Configuration"
          >
            Save & Close
          </button>
        </form>
         <p className="text-center text-gray-500 mt-6 text-xs">
          Keys are stored in your browser's local storage for this session.
          <br/>
          HuggingFace models run in-browser and require no configuration.
        </p>
      </div>
    </div>
  );
};

export default AiConfigModal;