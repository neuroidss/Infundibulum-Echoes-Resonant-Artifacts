import React, { useState } from 'react';

interface ApiKeyModalProps {
  isVisible: boolean;
  onSubmit: (apiKey: string) => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isVisible, onSubmit }) => {
  const [key, setKey] = useState('');

  if (!isVisible) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
      onSubmit(key.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="w-full max-w-md bg-gray-900 border border-blue-800/50 rounded-lg p-8 shadow-2xl shadow-blue-500/10">
        <h2 className="text-2xl font-bold text-center text-blue-300 mb-2">AI Features Disabled</h2>
        <p className="text-center text-gray-400 mb-6 text-sm">
          To enable the AI Muse and Genre-Adapt mode, please provide your Google Gemini API key.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="apiKeyInput" className="text-gray-400 text-xs font-mono">
            GEMINI_API_KEY
          </label>
          <input
            id="apiKeyInput"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter your API key here"
            className="w-full px-4 py-3 bg-gray-800/80 text-white placeholder-gray-500 border border-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
            autoFocus
            aria-label="Gemini API Key Input"
          />
          <button
            type="submit"
            disabled={!key.trim()}
            className="w-full mt-2 px-6 py-3 bg-blue-600 text-white rounded-md font-semibold flex items-center justify-center disabled:bg-gray-600 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500"
            aria-label="Submit API Key"
          >
            Activate for Session
          </button>
        </form>
        <p className="text-center text-gray-500 mt-6 text-xs">
          This key is stored in your browser's sessionStorage and will be forgotten when you close this tab.
          <br />
          For persistence, set `GEMINI_API_KEY` in a `.env.local` file.
        </p>
      </div>
    </div>
  );
};

export default ApiKeyModal;
