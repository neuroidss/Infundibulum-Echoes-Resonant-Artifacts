
import React, { useRef } from 'react';
import { useInfundibulum } from './hooks/useInfundibulum';
import UIOverlay from './components/UIOverlay';
import GuiController from './components/GuiController';
import AiMuse from './components/AiMuse';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { 
    debugInfo, 
    warningInfo, 
    loadingInfo, 
    speechStatus, 
    isInitialized,
    menuSettings,
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
          />
          <AiMuse
            isGenerating={loadingInfo.visible && loadingInfo.message.includes('Muse')}
            onGenerate={handleAiGenerate}
          />
        </>
      )}
    </div>
  );
};

export default App;
