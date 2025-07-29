import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_API_KEY;

let isInitialized = false;
let ai: GoogleGenAI | null = null;

const initialize = () => {
    if (isInitialized) return;
    
    if (!apiKey) {
        throw new Error("VITE_API_KEY is not set");
    }
    
    try {
        ai = new GoogleGenAI({ apiKey });
        isInitialized = true;
    } catch (error) {
        console.error("Failed to initialize Google GenAI:", error);
    }
};

export const speak = async (text: string, onEnd: () => void) => {
    if (!isInitialized) {
        initialize();
    }
    
    if (!ai) {
        console.warn("Google GenAI not initialized. Please check your API key in .env file.");
        onEnd();
        return;
    }
    
    try {
        cancel();
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { 
                            voiceName: 'Kore' 
                        },
                    },
                },
            },
        });

        const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (!data) {
            console.error("No audio data received from Google TTS");
            onEnd();
            return;
        }

        const audioBuffer = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        console.log("Audio buffer size:", audioBuffer.length);
        
        const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const audio = new Audio(audioUrl);
        
        audio.onloadeddata = () => {
            console.log("Audio loaded, duration:", audio.duration);
        };
        
        audio.oncanplaythrough = () => {
            console.log("Audio can play through");
        };
        
        audio.onplaying = () => {
            console.log("Audio started playing");
        };
        
        audio.onended = () => {
            console.log("Audio playback ended");
            URL.revokeObjectURL(audioUrl);
            onEnd();
        };
        
        audio.onerror = (event) => {
            console.error("Audio playback error:", event);
            console.error("Audio error details:", audio.error);
            URL.revokeObjectURL(audioUrl);
            onEnd();
        };
        
        currentAudio = audio;
        
        audio.volume = 1.0;
        audio.muted = false;
        
        try {
            console.log("Attempting to play audio...");
            await audio.play();
            console.log("Audio play() succeeded");
        } catch (playError) {
            console.error("Audio play failed:", playError);
            throw playError;
        }
        
    } catch (error) {
        console.error("Google TTS error:", error);
        onEnd();
    }
};

let currentAudio: HTMLAudioElement | null = null;

export const cancel = () => {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
};

export const setApiKey = (_apiKey: string) => {
    console.warn('setApiKey is deprecated. Please set VITE_API_KEY environment variable instead.');
};

export const VOICE_OPTIONS = {
    KORE: 'Kore',
} as const;

export const speakWithVoice = async (
    text: string, 
    voiceName: string, 
    onEnd: () => void
) => {
    if (!isInitialized) {
        initialize();
    }
    
    if (!ai) {
        console.warn("Google GenAI not initialized. Please check your API key in .env file.");
        onEnd();
        return;
    }
    
    try {
        cancel();
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName },
                    },
                },
            },
        });

        const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (!data) {
            console.error("No audio data received from Google TTS");
            onEnd();
            return;
        }

        const audioBuffer = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const audio = new Audio(audioUrl);
        
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            onEnd();
        };
        
        audio.onerror = (event) => {
            console.error("Audio playback error:", event);
            URL.revokeObjectURL(audioUrl);
            onEnd();
        };
        
        currentAudio = audio;
        await audio.play();
        
    } catch (error) {
        console.error("Google TTS error:", error);
        onEnd();
    }
};