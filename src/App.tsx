import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Explanation } from './types';
import { explainSlideStream } from './services/geminiService';
import * as tts from './services/ttsService';
import { PlayIcon, StopIcon, BookOpenIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from './components/icons';

type Language = 'english' | 'indonesian';

const SLIDE_CHECK_INTERVAL = 100; 
const SIMILARITY_THRESHOLD = 0.978 
const MIN_PROCESSING_INTERVAL = 1000;

const cleanExplanationText = (text: string): string => {
  return text
    .replace(/(\*\*|__)(.*?)\1/g, '$2') 
    .replace(/(\*|_)(.*?)\1/g, '$2')   
    .replace(/`([^`]+)`/g, '$1')      
    .replace(/#+\s/g, '')              
    .trim();
};

const calculateImageSimilarity = (canvas1: HTMLCanvasElement, canvas2: HTMLCanvasElement): number => {
  if (canvas1.width !== canvas2.width || canvas1.height !== canvas2.height) {
    return 0;
  }

  const ctx1 = canvas1.getContext('2d');
  const ctx2 = canvas2.getContext('2d');
  
  if (!ctx1 || !ctx2) return 0;

  const imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
  const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
  
  const data1 = imageData1.data;
  const data2 = imageData2.data;
  
  let totalDiff = 0;
  const pixelCount = data1.length / 4; 
  
  for (let i = 0; i < data1.length; i += 4) {
    const rDiff = Math.abs(data1[i] - data2[i]);
    const gDiff = Math.abs(data1[i + 1] - data2[i + 1]);
    const bDiff = Math.abs(data1[i + 2] - data2[i + 2]);
    
    totalDiff += (rDiff + gDiff + bDiff) / 3;
  }
  
  const avgDiff = totalDiff / pixelCount;
  const similarity = 1 - (avgDiff / 255);
  
  return Math.max(0, Math.min(1, similarity));
};

const ScreenPreview: React.FC<{ 
  videoRef: React.RefObject<HTMLVideoElement | null>; 
  isSharing: boolean;
  onWheelForwardingChange: (enabled: boolean) => void;
  wheelForwardingEnabled: boolean;
  captureController: any;
}> = ({ videoRef, isSharing, onWheelForwardingChange, wheelForwardingEnabled, captureController }) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [controlStatus, setControlStatus] = useState<'none' | 'requesting' | 'active' | 'denied' | 'unsupported'>('none');
  const [isTabCapture, setIsTabCapture] = useState(false);
  const isCapturedSurfaceControlSupported = () => {
    return !!(window as any).CaptureController?.prototype.forwardWheel;
  };
  useEffect(() => {
    if (!isSharing || !videoRef.current?.srcObject) {
      setIsTabCapture(false);
      return;
    }

    const stream = videoRef.current.srcObject as MediaStream;
    const [track] = stream.getVideoTracks();
    if (track) {
      const settings = track.getSettings();
      const isTab = settings.displaySurface === 'browser';
      setIsTabCapture(isTab);
      console.log('Capture type:', settings.displaySurface, '- Tab capture:', isTab);
    }
  }, [isSharing, videoRef.current?.srcObject]);
  useEffect(() => {
    if (!isSharing || !previewRef.current || !wheelForwardingEnabled || !captureController) {
      setControlStatus('none');
      return;
    }

    const previewElement = previewRef.current;

    const setupWheelForwarding = async () => {
      try {
        if (!isCapturedSurfaceControlSupported()) {
          throw new Error('CaptureController forwardWheel not supported');
        }

        if (!isTabCapture) {
          throw new Error('Captured Surface Control only works with browser tabs');
        }

        setControlStatus('requesting');
        console.log('Setting up wheel forwarding for captured tab...');
        await captureController.forwardWheel(previewElement);
        setControlStatus('active');
        console.log('Wheel forwarding activated successfully');

      } catch (error) {
        console.warn('Failed to setup wheel forwarding:', error);
        
        if (error instanceof Error) {
          if (error.message.includes('not supported')) {
            setControlStatus('unsupported');
          } else if (error.message.includes('permission') || error.name === 'NotAllowedError') {
            setControlStatus('denied');
          } else {
            setControlStatus('denied');
          }
        }
        setupManualWheelHandling(previewElement);
      }
    };

    const setupManualWheelHandling = (element: HTMLElement) => {
      const handleWheelEvent = (event: WheelEvent) => {
        event.preventDefault();
        event.stopPropagation();
        
        const direction = event.deltaY > 0 ? 'down' : 'up';
        const magnitude = Math.abs(event.deltaY);
        
        console.log(`Manual wheel event: ${direction} (magnitude: ${magnitude})`);
        
        try {
          const keyEvent = direction === 'down' ? 'ArrowDown' : 'ArrowUp';
          const pageKeyEvent = direction === 'down' ? 'PageDown' : 'PageUp';
          
          const keys = [keyEvent, pageKeyEvent];
          
          keys.forEach((key, index) => {
            setTimeout(() => {
              const keydownEvent = new KeyboardEvent('keydown', {
                key: key,
                code: key,
                bubbles: true,
                cancelable: true
              });
              
              const keyupEvent = new KeyboardEvent('keyup', {
                key: key,
                code: key,
                bubbles: true,
                cancelable: true
              });
              
              document.dispatchEvent(keydownEvent);
              setTimeout(() => document.dispatchEvent(keyupEvent), 50);
              
              console.log(`Simulated ${key} key press`);
            }, index * 100);
          });
          
        } catch (err) {
          console.warn('Failed to simulate keyboard event:', err);
        }
      };

      element.addEventListener('wheel', handleWheelEvent, { passive: false });
      
      (element as any)._manualWheelHandler = handleWheelEvent;
    };

    setupWheelForwarding();

    return () => {
      if (captureController && wheelForwardingEnabled) {
        try {
          captureController.forwardWheel(null);
          console.log('Wheel forwarding stopped');
        } catch (error) {
          console.warn('Failed to stop wheel forwarding:', error);
        }
      }
      
      if (previewElement && (previewElement as any)._manualWheelHandler) {
        const handler = (previewElement as any)._manualWheelHandler;
        previewElement.removeEventListener('wheel', handler);
        delete (previewElement as any)._manualWheelHandler;
      }
      
      setControlStatus('none');
    };
  }, [isSharing, wheelForwardingEnabled, captureController, isTabCapture]);

  return (
    <div className="w-full h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700 flex flex-col">
      {isSharing && (
        <div className="flex justify-between items-center p-2 bg-gray-800/50 border-b border-gray-700">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            Scroll Control: 
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              controlStatus === 'active' ? 'bg-green-600 text-white' :
              controlStatus === 'requesting' ? 'bg-blue-600 text-white' :
              controlStatus === 'denied' ? 'bg-red-600 text-white' :
              controlStatus === 'unsupported' ? 'bg-orange-600 text-white' :
              'bg-gray-600 text-gray-300'
            }`}>
              {controlStatus === 'active' ? 'Active' :
               controlStatus === 'requesting' ? 'Requesting' :
               controlStatus === 'denied' ? 'Denied/Fallback' :
               controlStatus === 'unsupported' ? 'Unsupported' :
               'Disabled'}
            </span>
            {!isTabCapture && isSharing && (
              <span className="text-xs text-orange-400">
                (Tab capture required)
              </span>
            )}
          </div>
          
          <button
            onClick={() => onWheelForwardingChange(!wheelForwardingEnabled)}
            className={`flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
              wheelForwardingEnabled 
                ? 'bg-green-600 border-green-600 text-white hover:bg-green-700' 
                : 'bg-gray-600 border-gray-600 text-gray-300 hover:bg-gray-700'
            }`}
            title={wheelForwardingEnabled ? 'Disable scroll control' : 'Enable scroll control'}
            disabled={controlStatus === 'requesting'}
          >
            <span className={`w-2 h-2 rounded-full ${
              controlStatus === 'requesting' ? 'bg-blue-300 animate-pulse' :
              wheelForwardingEnabled ? 'bg-green-300' : 'bg-gray-400'
            }`}></span>
            {wheelForwardingEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      )}

      <div 
        ref={previewRef}
        className="flex-1 flex items-center justify-center"
        style={{ 
          cursor: wheelForwardingEnabled && isSharing ? 'grab' : 'default',
          userSelect: 'none'
        }}
        onMouseEnter={() => {
          if (wheelForwardingEnabled && previewRef.current) {
            previewRef.current.focus();
          }
        }}
        tabIndex={wheelForwardingEnabled ? 0 : -1}
      >
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline 
          className={`w-full h-full object-contain ${isSharing ? '' : 'hidden'}`}
        />
        {!isSharing && (
          <div className="text-center text-gray-500">
            <BookOpenIcon className="w-24 h-24 mx-auto mb-4 stroke-1" />
            <h2 className="text-2xl font-bold">Your Slides Will Appear Here</h2>
            <p className="mt-2">Click "Start Presenting" to begin sharing your screen.</p>
            <p className="mt-1 text-sm">Select a browser tab for scroll control features.</p>
          </div>
        )}
      </div>

      {isSharing && wheelForwardingEnabled && (
        <div className={`p-2 border-t ${
          controlStatus === 'active' ? 'bg-green-600/20 border-green-500/30' :
          controlStatus === 'requesting' ? 'bg-blue-600/20 border-blue-500/30' :
          controlStatus === 'denied' ? 'bg-red-600/20 border-red-500/30' :
          controlStatus === 'unsupported' ? 'bg-orange-600/20 border-orange-500/30' :
          'bg-blue-600/20 border-blue-500/30'
        }`}>
          <p className={`text-xs text-center ${
            controlStatus === 'active' ? 'text-green-200' :
            controlStatus === 'requesting' ? 'text-blue-200' :
            controlStatus === 'denied' ? 'text-red-200' :
            controlStatus === 'unsupported' ? 'text-orange-200' :
            'text-blue-200'
          }`}>
            {controlStatus === 'requesting' && '🔄 Requesting permission for scroll control...'}
            {controlStatus === 'active' && '🖱️ Native scroll control active - scroll here to control the captured tab'}
            {controlStatus === 'denied' && '❌ Using keyboard simulation fallback - scroll to send arrow/page key events'}
            {controlStatus === 'unsupported' && '⚠️ Native scroll control not supported - using keyboard simulation fallback'}
            {controlStatus === 'none' && !isTabCapture && '⚠️ Please capture a browser tab to enable scroll control'}
            {controlStatus === 'none' && isTabCapture && '🖱️ Click "Enabled" to activate scroll control'}
          </p>
        </div>
      )}
    </div>
  );
};

const ProfessorView: React.FC<{ 
  explanations: Explanation[]; 
  isProcessing: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  language: Language;
  streamingExplanationId: string | null;
  onToggleMute: () => void;
  onToggleLanguage: () => void;
  isSharing: boolean;
  onStart: () => void;
  onStop: () => void;
}> = ({ explanations, isProcessing, isSpeaking, isMuted, language, streamingExplanationId, onToggleMute, onToggleLanguage, isSharing, onStart, onStop }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
  }, [explanations, streamingExplanationId]);

  const reversedExplanations = [...explanations].reverse();

  return (
    <div className="bg-gray-800 rounded-lg p-4 sm:p-6 flex flex-col h-full border border-gray-700 max-h-[900px] sm:max-h-[600px] lg:max-h-[600px]">
      <div className="flex justify-between items-center mb-4 flex-shrink-0">

        <div className="flex items-center gap-2">
          {!isSharing ? (
            <button
              onClick={onStart}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              title="Start presenting"
            >
              <PlayIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Start Presenting</span>
            </button>
          ) : (
            <button
              onClick={onStop}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border bg-red-600 border-red-600 text-white hover:bg-red-700 transition-colors"
              title="Stop presenting"
            >
              <StopIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          )}
          
          <button 
            onClick={onToggleLanguage}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors hover:bg-gray-700"
            style={{
              backgroundColor: language === 'english' ? '#3b82f6' : '#ef4444',
              borderColor: language === 'english' ? '#3b82f6' : '#ef4444',
              color: 'white'
            }}
            title={`Switch to ${language === 'english' ? 'Indonesian' : 'English'}`}
          >
            {language === 'english' ? 'EN' : 'ID'}
          </button>
          
          <button 
            onClick={onToggleMute} 
            className="flex items-center justify-center px-3 py-2 text-xs font-medium rounded-lg border text-gray-400 hover:text-white border-gray-600 hover:bg-gray-700 transition-colors" 
            aria-label={isMuted ? "Unmute TTS" : "Mute TTS"}
            title={isMuted ? "Unmute Text-to-Speech" : "Mute Text-to-Speech"}
          >
            {isMuted ? <SpeakerXMarkIcon className="w-4 h-4" /> : <SpeakerWaveIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>
      
      <div className="flex-shrink-0 mb-4">
        {isProcessing && (
           <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-600/20 border border-indigo-500/30">
             <div className="w-3 h-3 bg-indigo-400 rounded-full animate-pulse"></div>
             <p className="text-indigo-200 text-sm font-medium">
               Professor is analyzing a new slide{language === 'indonesian' ? ' (Bahasa Indonesia)' : ' (English)'}...
             </p>
           </div>
        )}
        {streamingExplanationId && !isProcessing && (
           <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-600/20 border border-blue-500/30">
             <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
             <p className="text-blue-200 text-sm font-medium">Professor is explaining...</p>
           </div>
        )}
        {isSpeaking && !isProcessing && !streamingExplanationId && (
           <div className="flex items-center gap-3 p-3 rounded-lg bg-green-600/20 border border-green-500/30">
             <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
             <p className="text-green-200 text-sm font-medium">Professor is speaking...</p>
           </div>
        )}
        {isMuted && !isProcessing && !isSpeaking && !streamingExplanationId && (
           <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-600/20 border border-orange-500/30">
             <SpeakerXMarkIcon className="w-4 h-4 text-orange-400" />
             <p className="text-orange-200 text-sm font-medium">
               Text-to-Speech is muted - click the speaker button to enable audio
             </p>
           </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-grow overflow-y-auto space-y-4 pr-2">
        {explanations.length === 0 && !isProcessing && !streamingExplanationId && (
           <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
             <p className="text-base sm:text-lg">The professor is ready.</p>
             <p className="text-sm mt-2">
               Explanations will be delivered in {language === 'english' ? 'English' : 'Bahasa Indonesia'}.
             </p>
             {isMuted && (
               <p className="text-xs mt-1 text-orange-400">
                 (Audio is currently muted)
               </p>
             )}
           </div>
        )}
        
        {reversedExplanations.map((exp, index) => (
          <div key={exp.id} className={`bg-gray-700/50 rounded-lg p-3 sm:p-4 border border-gray-600/50 shadow-sm hover:bg-gray-700/70 transition-colors ${exp.isStreaming ? 'ring-2 ring-blue-500/50' : ''}`}>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-indigo-400 font-semibold">
                  Slide {explanations.length - index}
                </span>
                <span className="text-xs px-2 py-1 rounded-full" style={{
                  backgroundColor: exp.language === 'english' ? '#3b82f6' : '#ef4444',
                  color: 'white'
                }}>
                  {exp.language === 'english' ? 'EN' : 'ID'}
                </span>
                {exp.isStreaming && (
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-500 text-white animate-pulse">
                    Streaming...
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">{exp.timestamp}</span>
            </div>
            <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-p:text-sm prose-p:leading-relaxed">
              <p className="whitespace-pre-wrap m-0 text-sm sm:text-base">
                {exp.text}
                {exp.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse"></span>}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  const [isSharing, setIsSharing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [language, setLanguage] = useState<Language>('english');
  const [error, setError] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [streamingExplanationId, setStreamingExplanationId] = useState<string | null>(null);
  const [wheelForwardingEnabled, setWheelForwardingEnabled] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const previousCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedTimeRef = useRef<number>(0);
  const processingLockRef = useRef<boolean>(false);
  const captureControllerRef = useRef<any>(null);

  const checkForSlideChangeAndExplain = useCallback(async () => {
      if (processingLockRef.current || isProcessing || isSpeaking || !videoRef.current || videoRef.current.videoHeight === 0) {
          return;
      }

      const now = Date.now();
      
      if (now - lastProcessedTimeRef.current < MIN_PROCESSING_INTERVAL) {
          return;
      }

      try {
          processingLockRef.current = true;
          
          const video = videoRef.current;
          const currentCanvas = currentCanvasRef.current;
          const previousCanvas = previousCanvasRef.current;
          
          const thumbWidth = 320;
          const thumbHeight = (video.videoHeight / video.videoWidth) * thumbWidth;
          
          currentCanvas.width = thumbWidth;
          currentCanvas.height = thumbHeight;
          const currentContext = currentCanvas.getContext('2d', { willReadFrequently: true });
          if (!currentContext) return;
          
          currentContext.drawImage(video, 0, 0, thumbWidth, thumbHeight);

          if (previousCanvas.width > 0 && previousCanvas.height > 0) {
              const similarity = calculateImageSimilarity(currentCanvas, previousCanvas);
              
              if (similarity > SIMILARITY_THRESHOLD) {
                  console.log(`Slide similarity: ${similarity.toFixed(3)} - Skipping (threshold: ${SIMILARITY_THRESHOLD})`);
                  processingLockRef.current = false;
                  return;
              }
              
              console.log(`Slide similarity: ${similarity.toFixed(3)} - Processing new slide`);
          }

          previousCanvas.width = thumbWidth;
          previousCanvas.height = thumbHeight;
          const previousContext = previousCanvas.getContext('2d');
          if (previousContext) {
              previousContext.drawImage(currentCanvas, 0, 0);
          }

          lastProcessedTimeRef.current = now;
          
          setIsProcessing(true);
          setError(null);
          
          const fullCanvas = document.createElement('canvas');
          fullCanvas.width = video.videoWidth;
          fullCanvas.height = video.videoHeight;
          const fullContext = fullCanvas.getContext('2d');
          if (!fullContext) return;
          
          fullContext.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
          const fullImageDataUrl = fullCanvas.toDataURL('image/jpeg', 0.8);
          const base64Image = fullImageDataUrl.split(',')[1];
          
          console.log('Processing slide with AI...');
          
          const explanationId = crypto.randomUUID();
          const newExplanation: Explanation = {
              id: explanationId,
              text: '',
              timestamp: new Date().toLocaleTimeString(),
              language: language,
              isStreaming: true,
              isComplete: false
          };
          
          setExplanations(prev => [...prev, newExplanation]);
          setStreamingExplanationId(explanationId);
          setIsProcessing(false); 
          const handleChunk = (chunk: string) => {
              setExplanations(prev => 
                  prev.map(exp => 
                      exp.id === explanationId 
                          ? { ...exp, text: exp.text + chunk }
                          : exp
                  )
              );
          };
          
          const fullExplanationText = await explainSlideStream(base64Image, language, handleChunk);
          
          setExplanations(prev => 
              prev.map(exp => 
                  exp.id === explanationId 
                      ? { ...exp, isStreaming: false, isComplete: true }
                      : exp
              )
          );
          setStreamingExplanationId(null);
          
          const cleanedText = cleanExplanationText(fullExplanationText);
          console.log(`${language.toUpperCase()}]:\n${cleanedText}\n`);

          if (!isMuted) {
              console.log('TTS not muted - speaking explanation');
              setIsSpeaking(true);
              tts.speak(cleanedText, () => {
                  console.log('TTS finished speaking');
                  setIsSpeaking(false);
              });
          } else {
              console.log('TTS is muted - skipping speech for this explanation');
          }
          
          processingLockRef.current = false;
          
      } catch (err) {
          console.error('Error processing slide:', err);
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
          setError(`Failed to process slide: ${errorMessage}`);
          setIsProcessing(false);
          setStreamingExplanationId(null);
          processingLockRef.current = false;
      }
  }, [isProcessing, isSpeaking, isMuted, language]);

  const handleStopSharing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    if (captureControllerRef.current) {
      try {
        captureControllerRef.current.forwardWheel(null);
      } catch (error) {
        console.warn('Failed to clean up wheel forwarding:', error);
      }
      captureControllerRef.current = null;
    }
    
    tts.cancel();
    setIsSharing(false);
    setIsProcessing(false);
    setIsSpeaking(false);
    setStreamingExplanationId(null);
    setWheelForwardingEnabled(false);
    lastProcessedTimeRef.current = 0;
    processingLockRef.current = false;
    
    if (currentCanvasRef.current) {
      const ctx = currentCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, currentCanvasRef.current.width, currentCanvasRef.current.height);
      }
    }
    if (previousCanvasRef.current) {
      const ctx = previousCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, previousCanvasRef.current.width, previousCanvasRef.current.height);
      }
    }
  }, []);

  const handleStartSharing = useCallback(async () => {
    setError(null);
    setExplanations([]);
    setStreamingExplanationId(null);
    lastProcessedTimeRef.current = 0;
    processingLockRef.current = false;
    
    try {
      let controller = null;
      if ((window as any).CaptureController) {
        controller = new (window as any).CaptureController();
        captureControllerRef.current = controller;
        console.log('CaptureController created for Captured Surface Control');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' } as any,
        audio: false,
        ...(controller && { controller }) 
      } as any);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      streamRef.current = stream;
      setIsSharing(true);
      
      const [track] = stream.getVideoTracks();
      if (track) {
        const settings = track.getSettings();
        console.log('Capture settings:', settings);
        console.log('Display surface:', settings.displaySurface);
        console.log('Captured Surface Control available:', !!controller && settings.displaySurface === 'browser');
      }
      
      setTimeout(() => {
        intervalRef.current = setInterval(checkForSlideChangeAndExplain, SLIDE_CHECK_INTERVAL);
      }, 2000);
      
      stream.getVideoTracks()[0].onended = () => handleStopSharing();

    } catch (err) {
      console.error("Error starting screen share:", err);
      const errorMessage = err instanceof Error ? err.message : 'Could not start screen share.';
      setError(`Error: ${errorMessage}`);
      captureControllerRef.current = null;
    }
  }, [checkForSlideChangeAndExplain, handleStopSharing]);

  const handleToggleMute = useCallback(() => {
    setIsMuted(currentMutedState => {
      const newMutedState = !currentMutedState;
      
      if (newMutedState) { 
        console.log('Muting TTS - cancelling current speech and preventing future speech');
        tts.cancel();
        setIsSpeaking(false);
      } else {
        console.log('Unmuting TTS - future explanations will be spoken');
      }
      
      return newMutedState;
    });
  }, []);

  const handleToggleLanguage = useCallback(() => {
    setLanguage(current => {
      const newLanguage = current === 'english' ? 'indonesian' : 'english';
      console.log(`Language switched to: ${newLanguage}`);
      return newLanguage;
    });
  }, []);

  useEffect(() => {
    return () => {
      handleStopSharing();
    };
  }, [handleStopSharing]);

  return (
    <div className="min-h-screen flex flex-col p-2 sm:p-4 gap-2 sm:gap-4 bg-gray-900 text-gray-100">
        <header className="text-center">
            <p className="mt-2 sm:mt-3 max-w-md mx-auto text-sm sm:text-base text-gray-400 lg:text-lg md:mt-5 xl:text-xl md:max-w-3xl">
                Share your slides and let Professor Gemini deliver the lecture.
            </p>
        </header>

        <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-4 min-h-0 max-h-[calc(100vh-140px)] sm:max-h-[calc(100vh-200px)]">
            <div className="hidden lg:block lg:col-span-2 min-h-[400px] lg:min-h-0">
                 <ScreenPreview 
                   videoRef={videoRef} 
                   isSharing={isSharing} 
                   onWheelForwardingChange={setWheelForwardingEnabled}
                   wheelForwardingEnabled={wheelForwardingEnabled}
                   captureController={captureControllerRef.current}
                 />
            </div>
            
            <div className="col-span-1 lg:col-span-1 min-h-[400px] lg:min-h-0 h-full">
            <ProfessorView 
                explanations={explanations} 
                isProcessing={isProcessing}
                isSpeaking={isSpeaking}
                isMuted={isMuted}
                language={language}
                streamingExplanationId={streamingExplanationId}
                onToggleMute={handleToggleMute}
                onToggleLanguage={handleToggleLanguage}
                isSharing={isSharing}
                onStart={handleStartSharing}
                onStop={handleStopSharing}
            />
            </div>
        </main>
        
        <footer>
            {error && (
                <div className="flex justify-center p-4">
                    <p className="text-red-400 text-center text-sm">{error}</p>
                </div>
            )}
        </footer>
        
    </div>
  );
}