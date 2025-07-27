let voices: SpeechSynthesisVoice[] = [];
let isInitialized = false;

const getVoices = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    voices = window.speechSynthesis.getVoices();
};

const initialize = () => {
    if (isInitialized || typeof window === 'undefined' || !window.speechSynthesis) {
        return;
    }
    getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = getVoices;
    }
    isInitialized = true;
};

initialize();

export const speak = (text: string, onEnd: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        console.warn("Speech Synthesis not supported.");
        onEnd(); 
        return;
    }
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.onend = onEnd;
    utterance.onerror = (event) => {
        console.error("SpeechSynthesisUtterance.onerror", event);
        onEnd();
    };

    // Try to find the most natural-sounding voice
    const preferredVoice = voices.find(v => v.name.includes("Neural")) ||
                          voices.find(v => v.name.includes("Premium")) ||
                          voices.find(v => v.name.includes("Enhanced")) ||
                          voices.find(v => v.name.includes("Google US English")) ||
                          voices.find(v => v.lang === "en-US");
    
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }
    
    // Adjust parameters for more natural speech
    utterance.pitch = 1.0;  // Normal pitch
    utterance.rate = 0.9;   // Slightly slower rate
    utterance.volume = 1.0; // Full volume
    
    window.speechSynthesis.speak(utterance);
};

export const cancel = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
};
