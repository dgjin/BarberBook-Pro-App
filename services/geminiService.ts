
import { GoogleGenAI, Modality } from "@google/genai";

// Helper: Base64 decode for raw PCM audio data
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a hair consultation response from Gemini.
 * Uses 'gemini-3-flash-preview' as recommended for basic text tasks.
 */
export const generateHairConsultation = async (
  query: string, 
  history: { role: string; parts: { text: string }[] }[]
): Promise<string> => {
  try {
    // Instantiate AI strictly using process.env.API_KEY right before the call
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-flash-preview';
    const systemInstruction = "你是一位专业的发型设计顾问。请根据用户的描述推荐合适的发型。回答要简洁、专业，并富有亲和力。如果用户询问发型，尽量给出具体的风格名称（如“美式油头”、“韩式纹理烫”）。";

    const chat = ai.chats.create({
      model: model,
      config: {
        systemInstruction: systemInstruction,
      },
      history: history,
    });

    const result = await chat.sendMessage({ message: query });
    return result.text || "抱歉，我暂时无法回答这个问题。";

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "网络连接似乎有点问题，请稍后再试。";
  }
};

/**
 * Generates speech (TTS) using the Gemini 2.5 Flash TTS model.
 * Returns raw PCM data as Uint8Array.
 */
export const generateSpeech = async (text: string): Promise<Uint8Array | null> => {
  if (!process.env.API_KEY) {
    console.warn("Gemini API Key is missing. TTS will not function. Please check your .env file.");
    return null;
  }

  try {
    // Instantiate AI strictly using process.env.API_KEY right before the call
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Options: 'Kore', 'Fenrir', 'Puck', 'Charon'
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
        return decodeBase64(base64Audio);
    }
    return null;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    return null;
  }
};
