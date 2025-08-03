import React, { useRef } from 'react';
import { useInfundibulum } from './hooks/useInfundibulum';
import UIOverlay from './components/UIOverlay';
import GuiController from './components/GuiController';
import AiMuse from './components/AiMuse';
import AiConfigModal from './components/AiConfigModal';
import AiDebugLog from './components/AiDebugLog';
import AiCopilotPanel from './components/AiCopilotPanel';

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
        </>
      )}
    </div>
  );
};

export default App;