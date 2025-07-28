import { GoogleGenAI, Chat } from "@google/genai";

const apiKey = import.meta.env.VITE_API_KEY;

if (!apiKey) {
  throw new Error("VITE_API_KEY is not set");
}

const ai = new GoogleGenAI({ apiKey });

const SYSTEM_PROMPTS = {
  english: `You are a world-class university professor and expert public speaker. Your task is to explain each presentation slide in a clear, simple, and engaging way. Do not read or repeat the text on the slide. Instead, elaborate on the ideas, as if you're helping the audience truly understand the core concepts.

Speak in a natural, continuous lecture style—connect each slide to the previous one with a smooth transition. Keep your explanations short but meaningful. The amount of explanation should match the content on the slide: if it's a light slide, explain less.

Begin your response with the slide number in this format: [Slide x].

At the end of your response, include a [Summary] section, where you briefly condense your explanation into 1-2 short paragraphs.

Use plain text only, no markdown, no greetings, no conversational fillers.

Always respond in English.`,
  
  indonesian: `Anda adalah profesor universitas kelas dunia dan pembicara publik yang ahli. Tugas Anda adalah menjelaskan setiap slide presentasi dengan cara yang sederhana, jelas, dan menarik—bukan dengan membaca isi slide, tapi dengan menguraikan ide-ide di dalamnya. Jelaskan seolah-olah Anda sedang membantu audiens benar-benar memahami konsepnya, menggunakan bahasa yang mudah dipahami dan dekat dengan kehidupan nyata. Buat penjelasan singkat, bermakna, dan tetap terhubung dengan slide sebelumnya agar alurnya terasa seperti kuliah yang mengalir secara alami. Mulailah setiap slide dengan transisi yang halus. Jangan menyapa atau menggunakan kata pembuka kasual. Jangan gunakan format markdown. Gunakan teks polos saja. Selalu tanggapi dalam Bahasa Indonesia. dan dibawah itu semua tambahkan section baru, yakni [ringkasan] yang dimana dibawahnya akan diisi ringkasan dari seluruh penjelasan panjang kedalam bentuk ringkas 1 atau 2 paragraf. di bagian respon kamu yang paling atas, beritahu aku kamu sedang melihat slide yang mana, tuliskan saja [slide x], buat materi yang mudah dipahami. jangan terlalu formal dan kaku. jika ada bulletpoint pada slide, penjelasan yang anda berikaan juga sebaiknya ditandai juga dengan bulletpoint`
};

export function initializeChat(): Chat {
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: SYSTEM_PROMPTS.english,
    },
  });
}

// Streaming version of explainSlide
export async function explainSlideStream(
  imageBase64: string, 
  language: 'english' | 'indonesian' = 'english',
  onChunk: (chunk: string) => void
): Promise<string> {
  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: imageBase64,
    },
  };
  
  const textPart = {
    text: language === 'english' 
      ? "Here is the current slide. Please explain it based on our ongoing lecture in English."
      : "Ini adalah slide saat ini. Silakan jelaskan berdasarkan kuliah kita yang sedang berlangsung dalam Bahasa Indonesia. buat secara singkat saja namun cukup menjelaskan"
  };

  try {
    const languageSpecificChat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: SYSTEM_PROMPTS[language],
      },
    });
    
    const response = await languageSpecificChat.sendMessageStream({ 
      message: [imagePart, textPart] 
    });
    
    let fullText = '';
    
    for await (const chunk of response) {
      const chunkText = chunk.text || '';
      fullText += chunkText;
      onChunk(chunkText);
    }
    
    return fullText;
  } catch (error) {
    console.error("Error explaining slide:", error);
    const errorMessage = error instanceof Error 
      ? (language === 'english' 
          ? `An error occurred while analyzing the slide: ${error.message}`
          : `Terjadi kesalahan saat menganalisis slide: ${error.message}`)
      : (language === 'english' 
          ? "An unknown error occurred while analyzing the slide."
          : "Terjadi kesalahan yang tidak diketahui saat menganalisis slide.");
    
    onChunk(errorMessage);
    return errorMessage;
  }
}

// Keep the original non-streaming version for backward compatibility
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
      : "Ini adalah slide saat ini. Silakan jelaskan berdasarkan kuliah kita yang sedang berlangsung dalam Bahasa Indonesia. buat secara singkat saja namun cukup menjelaskan"
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