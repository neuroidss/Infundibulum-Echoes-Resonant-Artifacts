
import React from 'react';
import { USE_DEBUG } from '../constants';

interface UIOverlayProps {
    debugInfo: string;
    warningInfo: { message: string; visible: boolean };
    loadingInfo: { message: string; progress: string; visible: boolean };
    speechStatus: string;
}

const UIOverlay: React.FC<UIOverlayProps> = ({
    debugInfo,
    warningInfo,
    loadingInfo,
    speechStatus
}) => {
    return (
        <>
            {USE_DEBUG && (
                <div id="debugInfo" className="absolute top-1 left-1 bg-black/50 text-gray-400 font-mono text-[7px] leading-tight p-1 rounded-sm z-10 pointer-events-none max-w-[calc(100%-8px)] whitespace-normal break-words" dangerouslySetInnerHTML={{ __html: debugInfo }}>
                </div>
            )}
            
            {warningInfo.visible && (
                <div id="warningInfo" className="absolute bottom-2.5 left-2.5 bg-black/60 text-yellow-300 font-sans text-xs p-2 rounded-md z-10 pointer-events-none">
                    {warningInfo.message}
                </div>
            )}

            {loadingInfo.visible && (
                <div id="loadingInfo" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-gray-200 text-sm p-4 rounded-lg z-20 pointer-events-none text-center flex flex-col items-center justify-center">
                    <span>{loadingInfo.message}</span>
                    <span id="loadingProgress" className="text-xs mt-1 text-gray-300">{loadingInfo.progress}</span>
                </div>
            )}

            {speechStatus && (
                <div id="speechStatus" className="absolute top-2.5 right-2.5 bg-blue-900/40 text-blue-300/60 font-mono text-[9px] px-1 py-0.5 rounded-sm z-10 pointer-events-none">
                    Speech: {speechStatus}
                </div>
            )}
        </>
    );
};

export default UIOverlay;
