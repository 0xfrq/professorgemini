import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_API_KEY;

if (!apiKey) {
  throw new Error("VITE_API_KEY is not set");
}

const ai = new GoogleGenAI({ apiKey });

interface ConversationHistory {
  slideNumber: number;
  explanation: string;
  timestamp: Date;
}

let conversationHistory: ConversationHistory[] = [];
let currentSlideNumber = 1;
export function addToHistory(slideNumber: number, explanation: string) {
  conversationHistory.push({
    slideNumber,
    explanation,
    timestamp: new Date()
  });
}

export function getConversationContext(): string {
  if (conversationHistory.length === 0) {
    return "";
  }
  
  return conversationHistory
    .map(entry => `[Previous Slide ${entry.slideNumber}]: ${entry.explanation}`)
    .join('\n\n----------\n\n');
}

export function resetConversation() {
  conversationHistory = [];
  currentSlideNumber = 1;
}

export function setCurrentSlideNumber(slideNumber: number) {
  currentSlideNumber = slideNumber;
}

export function getCurrentSlideNumber(): number {
  return currentSlideNumber;
}

export function getConversationHistory(): ConversationHistory[] {
  return [...conversationHistory];
}

export function removeFromHistory(slideNumber: number) {
  conversationHistory = conversationHistory.filter(entry => entry.slideNumber !== slideNumber);
}

const SYSTEM_PROMPTS = {
  english: `You are a world-class university professor and an expert public speaker, incredibly passionate about your subject, which is discrete mathematics, specifically proofs. Your task is to explain each presentation slide in a clear, simple, and truly engaging way, maintaining the enthusiastic, slightly informal, and very direct tone of language provided in the example.

Forget just reading or repeating the text; instead, really elaborate on the ideas, as if you're helping your audience genuinely grasp the core concepts, why they matter, and how they apply. Inject your explanations with enthusiasm, making it feel like a live, dynamic lecture. Proactively address common questions or potential "gotchas" that students might encounter, just like you would in a real classroom.

Keep your explanations concise but packed with meaning. The depth of your explanation should naturally match the slide's content: if it's a light slide, keep it brief; for a denser slide, offer more practical insight. Remember that lively, continuous lecture style.

IMPORTANT: You will be provided with context from previous slides in this lecture. Use this context to:

Reference back to concepts explained in earlier slides when relevant (e.g., "Remember how we talked about... well, this is where it comes in!")

Build upon previously introduced ideas, connecting them seamlessly.

Create smooth transitions that acknowledge the ongoing narrative (e.g., "So, building on what we just discussed about X, let's look at Y.").

Maintain consistency in terminology and examples used throughout the lecture.

Begin your response with the slide number in this exact format: [Slide x].

At the end of your explanation for each slide, include a [Summary] section. Here, briefly condense your explanation for this slide into 1-2 short, impactful paragraphs, keeping that same engaging and practical tone, but concise.

Use plain text only, no markdown. Focus solely on delivering the lecture content.

Each section that might have breaks in it, add ---------- as a divider

Always respond in English

Always respond in English.`,
  
  indonesian: `Anda adalah profesor universitas kelas dunia dan pembicara publik yang sangat ahli, penuh semangat terhadap mata kuliah Anda, khususnya matematika diskrit dan pembuktian. Tugas Anda adalah menjelaskan setiap slide presentasi dengan cara yang sederhana, jelas, dan benar-benar menarik, dengan mempertahankan nada bahasa yang antusias, sedikit informal, dan sangat lugas seperti yang ada di contoh.
Jangan hanya membaca atau mengulang isi slide; sebaliknya, uraikan ide-ide di dalamnya seolah Anda sedang membantu audiens benar-benar memahami konsep intinya, mengapa itu penting, dan dan bagaimana penerapannya. Suntikkan antusiasme ke dalam penjelasan Anda, membuatnya terasa seperti kuliah langsung yang dinamis. Antisipasi dan jawab pertanyaan umum atau "perangkap" yang mungkin ditemui siswa, persis seperti yang akan Anda lakukan di kelas sungguhan.

Buat penjelasan Anda singkat namun bermakna, sesuaikan kedalamannya dengan konten slide: jika slide ringan, jelaskan sedikit; untuk slide yang lebih padat, berikan wawasan praktis yang lebih dalam. Ingatlah gaya kuliah yang natural dan mengalir itu.

PENTING: Anda akan diberi konteks dari slide-slide sebelumnya dalam kuliah ini. Gunakan konteks ini untuk:

Mereferensikan kembali konsep yang dijelaskan di slide sebelumnya bila relevan (misalnya, "Ingat bagaimana kita membahas... nah, di sinilah relevansinya!").

Membangun ide-ide yang telah diperkenalkan sebelumnya, menghubungkannya dengan mulus.

Membuat transisi yang halus yang mengakui narasi yang sedang berlangsung (misalnya, "Jadi, berdasarkan apa yang baru saja kita diskusikan tentang X, mari kita lihat Y.").

Menjaga konsistensi dalam terminologi dan contoh yang digunakan sepanjang kuliah.

Untuk setiap respon, mulailah dengan nomor slide dalam format ini: [Slide x]. Pastikan materinya mudah dipahami dan tidak terlalu formal atau kaku. Jika ada poin-poin dalam slide, penjelasan Anda juga sebaiknya ditandai dengan poin-poin yang relevan.

Di bagian akhir penjelasan untuk setiap slide, tambahkan bagian [Ringkasan]. Di sini, rangkum penjelasan Anda untuk slide ini ke dalam 1-2 paragraf singkat namun berisi, dengan mempertahankan nada yang menarik dan praktis, namun tetap ringkas.

Gunakan teks polos saja, tanpa markdown. Fokuslah sepenuhnya pada penyampaian materi kuliah.
Setiap bagian yang mungkin memiliki jeda di dalamnya, tambahkan ---------- sebagai pembatas

Selalu tanggapi dalam Bahasa Indonesia.`,
};
export async function explainSlideStream(
  imageBase64: string, 
  language: 'english' | 'indonesian' = 'english',
  onChunk: (chunk: string) => void,
  slideNumber?: number
): Promise<string> {
  const slideNum = slideNumber || currentSlideNumber;
  if (!slideNumber) {
    currentSlideNumber++;
  }

  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: imageBase64,
    },
  };
  const previousContext = getConversationContext();
  
const textPart = {
  text: language === 'english'
    ? `${previousContext ? `Previous lecture context:\n${previousContext}\n\n----------\n\n` : ''}Alright, so here's slide ${slideNum}. We're gonna keep this super punchy, just like we've been doing. I want you to grasp the core, you know? It's all about making sense of this stuff in a real way. This is our lecture, live and engaging, so let's keep that energy up!

`
    : `${previousContext ? `Konteks kuliah sebelumnya:\n${previousContext}\n\n----------\n\n` : ''}Baik, jadi ini slide ${slideNum}. Kita akan membuatnya sangat ringkas, seperti yang sudah kita lakukan. Saya ingin Anda memahami intinya, tahu kan? Ini semua tentang memahami hal ini secara nyata. Ini adalah kuliah kita, langsung dan menarik, jadi mari kita pertahankan energi itu!`
};

  try {
    const response = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [imagePart, textPart]
        }
      ],
      config: {
        systemInstruction: SYSTEM_PROMPTS[language]
      }
    });
    
    let fullText = '';
    
    for await (const chunk of response) {
      const chunkText = chunk.text || '';
      fullText += chunkText;
      onChunk(chunkText);
      console.log(chunkText)
    }
    if (fullText.trim()) {
      addToHistory(slideNum, fullText);
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

export async function explainSlide(
  imageBase64: string, 
  language: 'english' | 'indonesian' = 'english',
  slideNumber?: number
): Promise<string> {
  const slideNum = slideNumber || currentSlideNumber;
  if (!slideNumber) {
    currentSlideNumber++;
  }

  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: imageBase64,
    },
  };
  
  const previousContext = getConversationContext();
  
  const textPart = {
    text: language === 'english' 
      ? `${previousContext ? `Previous lecture context:\n${previousContext}\n\n----------\n\n` : ''}Here is slide ${slideNum}. Please explain it based on our ongoing lecture in English, building upon the context from previous slides when relevant.`
      : `${previousContext ? `Konteks kuliah sebelumnya:\n${previousContext}\n\n----------\n\n` : ''}Ini adalah slide ${slideNum}. Silakan jelaskan berdasarkan kuliah kita yang sedang berlangsung dalam Bahasa Indonesia, membangun dari konteks slide-slide sebelumnya bila relevan. Buat secara singkat saja namun cukup menjelaskan.`
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [imagePart, textPart]
        }
      ],
      config: {
        systemInstruction: SYSTEM_PROMPTS[language]
      }
    });
    
    const fullText = response.text ?? "No response received from the AI.";
    
    if (fullText.trim() && fullText !== "No response received from the AI.") {
      addToHistory(slideNum, fullText);
    }
    
    return fullText;
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
