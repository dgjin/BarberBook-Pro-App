
import { Buffer } from 'buffer';

/**
 * 科大讯飞语音合成 (TTS) 服务
 * 采用 WebSocket 接口实现
 */

// 配置信息（建议通过环境变量管理，此处预留占位）
const APPID = (process.env as any).XFYUN_APPID || 'xfyun_app_id';
const API_SECRET = (process.env as any).XFYUN_API_SECRET || 'xfyun_api_secret';
const API_KEY = (process.env as any).XFYUN_API_KEY || 'xfyun_api_key';

/**
 * 签名生成逻辑
 */
async function getAuthUrl() {
    const host = 'tts-api.xfyun.cn';
    const date = new Date().toUTCString();
    const algorithm = 'hmac-sha256';
    const headers = 'host date request-line';
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/tts HTTP/1.1`;
    
    // 使用 Web Crypto API 生成 HMAC-SHA256 签名
    const encoder = new TextEncoder();
    const keyData = encoder.encode(API_SECRET);
    const cryptoKey = await crypto.subtle.importKey(
        'raw', 
        keyData, 
        { name: 'HMAC', hash: 'SHA-256' }, 
        false, 
        ['sign']
    );
    const signatureArrayBuffer = await crypto.subtle.sign(
        'HMAC', 
        cryptoKey, 
        encoder.encode(signatureOrigin)
    );
    
    // 转换为 Base64
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureArrayBuffer)));
    const authorizationOrigin = `api_key="${API_KEY}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
    const authorization = btoa(authorizationOrigin);
    
    return `wss://${host}/v2/tts?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
}

/**
 * 生成语音并返回 PCM 原始数据
 * 讯飞返回的数据通常是 Base64 编码的音频帧
 */
export const generateXfyunSpeech = async (text: string): Promise<Uint8Array | null> => {
    if (APPID === 'xfyun_app_id') {
        console.warn("讯飞 API 配置缺失，请在环境变量中设置 XFYUN_APPID, XFYUN_API_KEY, XFYUN_API_SECRET");
        return null;
    }

    return new Promise(async (resolve, reject) => {
        try {
            const url = await getAuthUrl();
            const socket = new WebSocket(url);
            let audioData = new Uint8Array(0);

            socket.onopen = () => {
                const params = {
                    common: { app_id: APPID },
                    business: {
                        aue: 'raw', // 原始 PCM 格式
                        auf: 'audio/L16;rate=16000', // 16k 采样率
                        vcn: 'xiaoyan', // 发音人：小燕
                        tte: 'UTF8'
                    },
                    data: {
                        status: 2,
                        text: btoa(unescape(encodeURIComponent(text)))
                    }
                };
                socket.send(JSON.stringify(params));
            };

            socket.onmessage = (event) => {
                const res = JSON.parse(event.data);
                if (res.code !== 0) {
                    console.error("讯飞 TTS 错误:", res.message);
                    socket.close();
                    reject(res.message);
                    return;
                }

                if (res.data && res.data.audio) {
                    const chunk = Uint8Array.from(atob(res.data.audio), c => c.charCodeAt(0));
                    const newAudioData = new Uint8Array(audioData.length + chunk.length);
                    newAudioData.set(audioData);
                    newAudioData.set(chunk, audioData.length);
                    audioData = newAudioData;
                }

                if (res.data && res.data.status === 2) {
                    socket.close();
                    resolve(audioData);
                }
            };

            socket.onerror = (err) => {
                console.error("WebSocket 错误:", err);
                reject(err);
            };

            socket.onclose = () => {
                if (audioData.length === 0) resolve(null);
            };

        } catch (e) {
            reject(e);
        }
    });
};
