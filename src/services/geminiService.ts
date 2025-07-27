import { GoogleGenAI, Chat } from "@google/genai";

const apiKey = import.meta.env.VITE_API_KEY;

if (!apiKey) {
  throw new Error("VITE_API_KEY is not set");
}

const ai = new GoogleGenAI({ apiKey });

const SYSTEM_PROMPTS = {
  english: `You are a world-class university professor and expert public speaker. Your task is to explain each presentation slide in a simple, clear, and engaging way—not by reading the slide, but by elaborating on its ideas. Speak as if you're helping the audience truly understand the concepts, using plain and relatable language. Keep each explanation short, insightful, and connected to the previous slides to maintain a coherent flow, like you're giving a natural, continuous lecture. Begin each new slide with a smooth transition. Do not greet or use conversational fillers. Do not use markdown formatting. Use plain text only. Always respond in English. add a section [summary] and below it fills with summary of that long explanation to compact 1 or 2 paragraph`,
  
  indonesian: `Anda adalah profesor universitas kelas dunia dan pembicara publik yang ahli. Tugas Anda adalah menjelaskan setiap slide presentasi dengan cara yang sederhana, jelas, dan menarik—bukan dengan membaca isi slide, tapi dengan menguraikan ide-ide di dalamnya. Jelaskan seolah-olah Anda sedang membantu audiens benar-benar memahami konsepnya, menggunakan bahasa yang mudah dipahami dan dekat dengan kehidupan nyata. Buat penjelasan singkat, bermakna, dan tetap terhubung dengan slide sebelumnya agar alurnya terasa seperti kuliah yang mengalir secara alami. Mulailah setiap slide dengan transisi yang halus. Jangan menyapa atau menggunakan kata pembuka kasual. Jangan gunakan format markdown. Gunakan teks polos saja. Selalu tanggapi dalam Bahasa Indonesia. dan dibawah itu semua tambahkan section baru, yakni [ringkasan] yang dimana dibawahnya akan diisi ringkasan dari seluruh penjelasan panjang kedalam bentuk ringkas 1 atau 2 paragraf`
};

export function initializeChat(): Chat {
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: SYSTEM_PROMPTS.english,
    },
  });
}

export async function explainSlide(imageBase64: string, language: 'english' | 'indonesian' = 'english'): Promise<string> {
  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: imageBase64,
    },
  };
  
  const textPart = {
    text: language === 'english' 
      ? "Here is the current slide. Please explain it based on our ongoing lecture in English."
      : "Ini adalah slide saat ini. Silakan jelaskan berdasarkan kuliah kita yang sedang berlangsung dalam Bahasa Indonesia."
  };

  try {
    const languageSpecificChat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: SYSTEM_PROMPTS[language],
      },
    });
    
    const response = await languageSpecificChat.sendMessage({ message: [imagePart, textPart] }); 
    return response.text ?? "No response received from the AI.";
  } catch (error) {
    console.error("Error explaining slide:", error);
    if (error instanceof Error) {
        return language === 'english' 
          ? `An error occurred while analyzing the slide: ${error.message}`
          : `Terjadi kesalahan saat menganalisis slide: ${error.message}`;
    }
    return language === 'english' 
      ? "An unknown error occurred while analyzing the slide."
      : "Terjadi kesalahan yang tidak diketahui saat menganalisis slide.";
  }
}