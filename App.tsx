
import React, { useRef } from 'react';
import { useInfundibulum } from './hooks/useInfundibulum';
import UIOverlay from './components/UIOverlay';
import GuiController from './components/GuiController';
import AiMuse from './components/AiMuse';
import ApiKeyModal from './components/ApiKeyModal';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { 
    debugInfo, 
    warningInfo, 
    loadingInfo, 
    speechStatus, 
    isInitialized,
    isAiDisabled,
    isApiKeyModalOpen,
    handleApiKeySubmit,
    handleApiConfigChange,
    menuSettings,
    apiConfig,
    handleMenuSettingChange,
    resetMenuSettingsToDefault,
    resetHnmRag,
    genreEditState,
    handleGenreEditChange,
    loadSelectedGenreToSliders,
    saveSlidersToSelectedGenre,
    handleAiGenerate,
  } = useInfundibulum(canvasRef);

  return (
    <div className="relative h-full w-full bg-black">
      <ApiKeyModal isVisible={isApiKeyModalOpen} onSubmit={handleApiKeySubmit} />
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
            apiConfig={apiConfig}
            onMenuSettingChange={handleMenuSettingChange}
            onApiConfigChange={handleApiConfigChange}
            resetMenuToDefaults={resetMenuSettingsToDefault}
            resetHnmRag={resetHnmRag}
            genreEditState={genreEditState}
            onGenreEditChange={handleGenreEditChange}
            loadSelectedGenreToSliders={loadSelectedGenreToSliders}
            saveSlidersToSelectedGenre={saveSlidersToSelectedGenre}
            isDisabled={isAiDisabled}
          />
          <AiMuse
            isGenerating={loadingInfo.visible && loadingInfo.message.includes('Muse')}
            onGenerate={handleAiGenerate}
            isDisabled={isAiDisabled}
          />
        </>
      )}
    </div>
  );
};

export default App;
