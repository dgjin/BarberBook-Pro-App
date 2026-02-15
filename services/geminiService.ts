import { GoogleGenAI } from "@google/genai";

// Safely access process.env
const getProcessEnv = (key: string) => {
  try {
    return typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  } catch (e) {
    return undefined;
  }
};

const apiKey = getProcessEnv('API_KEY') || '';
// Initialize AI only if key is present to avoid errors on load if key is missing
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateHairConsultation = async (
  query: string, 
  history: { role: string; parts: { text: string }[] }[]
): Promise<string> => {
  try {
    if (!apiKey || !ai) {
      console.warn("No API Key provided. Returning mock response.");
      return "（演示模式：请配置 API Key 以使用真实 AI）根据您的脸型，我建议尝试带有层次感的侧分短发，这能很好地修饰脸部线条。";
    }

    const model = 'gemini-2.5-flash-latest';
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