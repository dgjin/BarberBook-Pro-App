
import { Buffer } from 'buffer';

/**
 * 科大讯飞语音合成 (TTS) 服务
 */

const getEnv = (key: string, fallback: string) => {
    try {
        return typeof process !== 'undefined' && process.env ? process.env[key] : fallback;
    } catch (e) {
        return fallback;
    }
};

const APPID = getEnv('XFYUN_APPID', 'xfyun_app_id');
const API_SECRET = getEnv('XFYUN_API_SECRET', 'xfyun_api_secret');
const API_KEY = getEnv('XFYUN_API_KEY', 'xfyun_api_key');

async function getAuthUrl() {
    const host = 'tts-api.xfyun.cn';
    const date = new Date().toUTCString();
    const algorithm = 'hmac-sha256';
    const headers = 'host date request-line';
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/tts HTTP/1.1`;
    
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
    
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureArrayBuffer)));
    const authorizationOrigin = `api_key="${API_KEY}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
    const authorization = btoa(authorizationOrigin);
    
    return `wss://${host}/v2/tts?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
}

export const generateXfyunSpeech = async (text: string): Promise<Uint8Array | null> => {
    if (APPID === 'xfyun_app_id') {
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
                        aue: 'raw',
                        auf: 'audio/L16;rate=16000',
                        vcn: 'xiaoyan',
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
