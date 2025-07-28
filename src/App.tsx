import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Chat } from '@google/genai';
import type { Explanation } from './types';
import { initializeChat, explainSlide } from './services/geminiService';
import * as tts from './services/ttsService';
import { PlayIcon, StopIcon, RobotIcon, BookOpenIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from './components/icons';

type Language = 'english' | 'indonesian';

const SLIDE_CHECK_INTERVAL = 300; 
const SIMILARITY_THRESHOLD = 0.97 
const MIN_PROCESSING_INTERVAL = 5000; 

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

const ScreenPreview: React.FC<{ videoRef: React.RefObject<HTMLVideoElement | null>; isSharing: boolean }> = ({ videoRef, isSharing }) => (
  <div className="w-full h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center">
    <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-contain ${isSharing ? '' : 'hidden'}`}></video>
    {!isSharing && (
      <div className="text-center text-gray-500">
        <BookOpenIcon className="w-24 h-24 mx-auto mb-4 stroke-1" />
        <h2 className="text-2xl font-bold">Your Slides Will Appear Here</h2>
        <p className="mt-2">Click "Start Presenting" to begin sharing your screen.</p>
      </div>
    )}
  </div>
);

const ProfessorView: React.FC<{ 
  explanations: Explanation[]; 
  isProcessing: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  language: Language;
  onToggleMute: () => void;
  onToggleLanguage: () => void;
}> = ({ explanations, isProcessing, isSpeaking, isMuted, language, onToggleMute, onToggleLanguage }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const reversedExplanations = [...explanations].reverse();

  return (
    <div className="bg-gray-800 rounded-lg p-6 flex flex-col h-full border border-gray-700 max-h-[600px]">
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold text-indigo-400 flex items-center gap-3">
          <RobotIcon className="w-8 h-8"/> Professor Gemini
        </h2>
        <div className="flex items-center gap-2">
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
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-gray-700" 
            aria-label={isMuted ? "Unmute TTS" : "Mute TTS"}
            title={isMuted ? "Unmute Text-to-Speech" : "Mute Text-to-Speech"}
          >
            {isMuted ? <SpeakerXMarkIcon className="w-6 h-6" /> : <SpeakerWaveIcon className="w-6 h-6" />}
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
         {isSpeaking && !isProcessing && (
           <div className="flex items-center gap-3 p-3 rounded-lg bg-green-600/20 border border-green-500/30">
             <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
             <p className="text-green-200 text-sm font-medium">Professor is speaking...</p>
           </div>
        )}
        {isMuted && !isProcessing && !isSpeaking && (
           <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-600/20 border border-orange-500/30">
             <SpeakerXMarkIcon className="w-4 h-4 text-orange-400" />
             <p className="text-orange-200 text-sm font-medium">
               Text-to-Speech is muted - click the speaker button to enable audio
             </p>
           </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-grow overflow-y-auto space-y-4 pr-2">
        {explanations.length === 0 && !isProcessing && (
           <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
             <p className="text-lg">The professor is ready.</p>
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
          <div key={exp.id} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600/50 shadow-sm hover:bg-gray-700/70 transition-colors">
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
              </div>
              <span className="text-xs text-gray-500">{exp.timestamp}</span>
            </div>
            <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-p:text-sm prose-p:leading-relaxed">
              <p className="whitespace-pre-wrap m-0">{exp.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Controls: React.FC<{ onStart: () => void; onStop: () => void; isSharing: boolean; error: string | null }> = ({ onStart, onStop, isSharing, error }) => (
    <div className="flex flex-col items-center justify-center p-4">
        {!isSharing ? (
            <button
                onClick={onStart}
                className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white font-bold rounded-full hover:bg-indigo-500 transition-all duration-300 shadow-lg shadow-indigo-600/30 transform hover:scale-105"
            >
                <PlayIcon className="w-6 h-6" />
                Start Presenting
            </button>
        ) : (
            <button
                onClick={onStop}
                className="flex items-center gap-3 px-8 py-4 bg-red-600 text-white font-bold rounded-full hover:bg-red-500 transition-all duration-300 shadow-lg shadow-red-600/30 transform hover:scale-105"
            >
                <StopIcon className="w-6 h-6" />
                Stop Presenting
            </button>
        )}
        {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
    </div>
);

export default function App() {
  const [isSharing, setIsSharing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [language, setLanguage] = useState<Language>('english');
  const [error, setError] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const previousCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const streamRef = useRef<MediaStream | null>(null);
  const chatRef = useRef<Chat | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedTimeRef = useRef<number>(0);
  const processingLockRef = useRef<boolean>(false);

  const checkForSlideChangeAndExplain = useCallback(async () => {
    if (processingLockRef.current || isProcessing || isSpeaking || !videoRef.current || videoRef.current.videoHeight === 0 || !chatRef.current) {
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
        const rawExplanationText = await explainSlide(base64Image, language);
        
        const explanationText = cleanExplanationText(rawExplanationText);
        console.log(`${language.toUpperCase()}]:\n${explanationText}\n`);


        setExplanations(prev => [...prev, {
            id: crypto.randomUUID(),
            text: explanationText,
            timestamp: new Date().toLocaleTimeString(),
            language: language, 
        }]);

        if (!isMuted) {
            console.log('TTS not muted - speaking explanation');
            setIsSpeaking(true);
            tts.speak(explanationText, () => {
                console.log('TTS finished speaking');
                setIsSpeaking(false);
            });
        } else {
            console.log('TTS is muted - skipping speech for this explanation');
        }
        
        setIsProcessing(false);
        processingLockRef.current = false;
        
    } catch (err) {
        console.error('Error processing slide:', err);
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to process slide: ${errorMessage}`);
        setIsProcessing(false);
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
    tts.cancel();
    setIsSharing(false);
    setIsProcessing(false);
    setIsSpeaking(false);
    chatRef.current = null;
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
    lastProcessedTimeRef.current = 0;
    processingLockRef.current = false;
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' } as any,
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      streamRef.current = stream;
      chatRef.current = initializeChat();
      setIsSharing(true);
      
      setTimeout(() => {
        intervalRef.current = setInterval(checkForSlideChangeAndExplain, SLIDE_CHECK_INTERVAL);
      }, 2000);
      
      stream.getVideoTracks()[0].onended = () => handleStopSharing();

    } catch (err) {
      console.error("Error starting screen share:", err);
      const errorMessage = err instanceof Error ? err.message : 'Could not start screen share.';
      setError(`Error: ${errorMessage}`);
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
    <div className="min-h-screen flex flex-col p-4 gap-4 bg-gray-900 text-gray-100">
        <header className="text-center">
            <p className="mt-3 max-w-md mx-auto text-base text-gray-400 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
                Share your slides and let Professor Gemini deliver the lecture.
            </p>
        </header>

        <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0 max-h-[calc(100vh-200px)]">
            <div className="lg:col-span-2 min-h-[400px] lg:min-h-0">
                <ScreenPreview videoRef={videoRef} isSharing={isSharing} />
            </div>
            <div className="lg:col-span-1 min-h-[400px] lg:min-h-0">
                <ProfessorView 
                    explanations={explanations} 
                    isProcessing={isProcessing}
                    isSpeaking={isSpeaking}
                    isMuted={isMuted}
                    language={language}
                    onToggleMute={handleToggleMute}
                    onToggleLanguage={handleToggleLanguage}
                />
            </div>
        </main>
        
        <footer>
            <Controls onStart={handleStartSharing} onStop={handleStopSharing} isSharing={isSharing} error={error} />
        </footer>
    </div>
  );
}