
import { GoogleGenAI, Modality } from "@google/genai";

// Helper: Safely get API key
const getApiKey = () => {
    try {
        return typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
    } catch (e) {
        return undefined;
    }
};

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
 */
export const generateHairConsultation = async (
  query: string, 
  history: { role: string; parts: { text: string }[] }[]
): Promise<string> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return "抱歉，API 密钥未配置。";

    const ai = new GoogleGenAI({ apiKey });
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
 */
export const generateSpeech = async (text: string): Promise<Uint8Array | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
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
