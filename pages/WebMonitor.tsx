
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';
import { Barber, Appointment, PageRoute } from '../types';
import { generateSpeech } from '../services/geminiService';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

// 核心解码器：处理原始 PCM 16bit 24kHz 单声道数据
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  // 必须确保缓冲区是 2 字节对齐的，使用 slice 确保内存对齐
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const dataInt16 = new Int16Array(buffer);
  
  const frameCount = dataInt16.length / numChannels;
  const audioBuffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // 归一化 PCM 数据到 [-1, 1] 范围
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return audioBuffer;
}

export const WebMonitor: React.FC<Props> = ({ onNavigate }) => {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [recentLogs, setRecentLogs] = useState<string[]>([]);
  const [stats, setStats] = useState({ servedToday: 0, totalWaiting: 0, avgWaitTime: 0 });
  
  // 语音播报核心状态
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const channelRef = useRef<any>(null);

  const getTodayString = () => {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const fetchMonitorData = async () => {
      try {
          const { data: barberData } = await supabase.from('app_barbers').select('*').eq('status', 'active').order('id');
          if (barberData) setBarbers(barberData as unknown as Barber[]);

          const todayStr = getTodayString();
          const { data: apptData } = await supabase
              .from('app_appointments')
              .select('*')
              .eq('date_str', todayStr)
              .in('status', ['confirmed', 'pending', 'checked_in', 'completed'])
              .order('time_str', { ascending: true });

          if (apptData) {
              const activeAppts = apptData.filter((a: any) => a.status !== 'completed' && a.status !== 'cancelled');
              const completed = apptData.filter((a: any) => a.status === 'completed');
              setAppointments(activeAppts as Appointment[]);
              setStats({
                  servedToday: completed.length,
                  totalWaiting: activeAppts.length,
                  avgWaitTime: activeAppts.length * 15
              });
          }
      } catch (e) { console.error("WebMonitor Fetch Error", e); }
  };

  // 必须由用户点击触发，确保 AudioContext 处于 running 状态
  const initAudioContext = async () => {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
          console.log("AudioContext 状态已恢复:", audioContextRef.current.state);
      }
  };

  const toggleAudio = async () => {
      if (!audioEnabled) {
          try {
            await initAudioContext();
            // 播放一个极短的静音片段来彻底解锁浏览器音频锁
            const osc = audioContextRef.current!.createOscillator();
            const gain = audioContextRef.current!.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(audioContextRef.current!.destination);
            osc.start(0);
            osc.stop(0.1);

            setAudioEnabled(true);
            addLog("语音播报系统已就绪");
          } catch (e) {
            console.error("音频系统启动失败", e);
            addLog("音频权限请求失败");
          }
      } else {
          setAudioEnabled(false);
          window.speechSynthesis.cancel();
          addLog("语音系统已手动关闭");
      }
  };

  const playAnnouncement = async (text: string) => {
      if (!audioEnabled) return;
      
      console.log("正在准备播报:", text);
      setIsPlaying(true);
      try {
          await initAudioContext();
          if (audioContextRef.current && audioContextRef.current.state === 'running') {
            const pcmData = await generateSpeech(text);
            if (pcmData) {
                console.log("收到 PCM 数据流");
                const audioBuffer = await decodeAudioData(pcmData, audioContextRef.current, 24000);
                const source = audioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContextRef.current.destination);
                source.onended = () => setIsPlaying(false);
                source.start(0);
                return;
            }
          }
      } catch (e) {
          console.warn("Gemini TTS 失败，尝试回退到浏览器原生 TTS", e);
      }
      
      // 回退到 Web Speech API
      if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'zh-CN';
          utterance.rate = 1.0;
          utterance.onend = () => setIsPlaying(false);
          window.speechSynthesis.speak(utterance);
      } else { setIsPlaying(false); }
  };

  useEffect(() => {
    fetchMonitorData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const polling = setInterval(fetchMonitorData, 10000); // 10s 轮询作为备份
    
    // 实时监听签到动态
    const sub = () => {
        if (channelRef.current) return;
        channelRef.current = supabase.channel('web_monitor_realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_appointments' }, (payload) => {
                fetchMonitorData();
                const newRec = payload.new as Appointment;
                const oldRec = payload.old as Appointment;
                // 当状态变为 checked_in 时触发语音播报
                if (newRec.status === 'checked_in' && oldRec.status !== 'checked_in') {
                    addLog(`[叫号] ${newRec.customer_name} 已签到`);
                    playAnnouncement(`请 ${newRec.id % 1000} 号顾客 ${newRec.customer_name}，到 ${newRec.barber_name} 处准备理发。`);
                }
            })
            .subscribe();
    };

    const t = setTimeout(sub, 500);
    return () => {
        clearTimeout(t);
        clearInterval(timer);
        clearInterval(polling);
        if (channelRef.current) supabase.removeChannel(channelRef.current);
        window.speechSynthesis.cancel();
    };
  }, [audioEnabled]);

  const addLog = (msg: string) => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', second: '2-digit' });
      setRecentLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 10));
  };

  const getBarberQueue = (barberName: string) => appointments.filter(a => a.barber_name === barberName);

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans overflow-hidden flex flex-col">
        {/* Header */}
        <header className="flex-none h-20 bg-slate-950/50 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-8">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg relative overflow-hidden">
                    <div className="absolute inset-0 barber-pole-bg animate-barber-scroll opacity-40"></div>
                    <span className="material-symbols-outlined text-2xl text-white relative z-10">content_cut</span>
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">BarberBook Pro <span className="text-primary">Monitor</span></h1>
                    <p className="text-xs text-slate-400 font-mono tracking-widest uppercase">实时服务叫号系统</p>
                </div>
            </div>
            
            <div className="flex items-center gap-8">
                <button 
                    onClick={toggleAudio}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all ${audioEnabled 
                        ? 'bg-primary/20 border-primary text-primary shadow-[0_0_20px_rgba(0,122,255,0.4)]' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                    {isPlaying ? (
                        <div className="flex gap-1 items-center h-4">
                            <span className="w-1 h-3 bg-primary animate-pulse"></span>
                            <span className="w-1 h-5 bg-primary animate-pulse delay-75"></span>
                            <span className="w-1 h-3 bg-primary animate-pulse delay-150"></span>
                        </div>
                    ) : (
                        <span className="material-symbols-outlined text-lg">{audioEnabled ? 'volume_up' : 'volume_off'}</span>
                    )}
                    <span className="text-sm font-bold">{audioEnabled ? '语音播报已激活' : '点击开启语音叫号'}</span>
                </button>

                <div className="text-right">
                    <p className="text-3xl font-mono font-bold leading-none">{currentTime.toLocaleTimeString([], { hour12: false })}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">{currentTime.toLocaleDateString()}</p>
                </div>
                <button onClick={() => onNavigate('home')} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-colors group">
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-white">close</span>
                </button>
            </div>
        </header>

        {/* Stats Bar */}
        <div className="flex-none grid grid-cols-4 gap-6 px-8 py-6">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <span className="material-symbols-outlined text-2xl">groups</span>
                </div>
                <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">当前等待人数</p>
                    <p className="text-3xl font-bold">{stats.totalWaiting}</p>
                </div>
            </div>
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
                    <span className="material-symbols-outlined text-2xl">timer</span>
                </div>
                <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">预计平均等待</p>
                    <p className="text-3xl font-bold">{stats.avgWaitTime}<span className="text-sm ml-1 opacity-50">MIN</span></p>
                </div>
            </div>
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
                    <span className="material-symbols-outlined text-2xl">check_circle</span>
                </div>
                <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">今日已服务</p>
                    <p className="text-3xl font-bold">{stats.servedToday}</p>
                </div>
            </div>
            <div className="barber-border-wrapper overflow-hidden">
                <div className="bg-slate-900 rounded-[20px] h-full flex items-center justify-center relative overflow-hidden px-4">
                    <div className="absolute inset-0 bg-slate-900/60 pointer-events-none z-10"></div>
                    <h2 className="text-4xl font-artistic text-white tracking-widest relative z-20 drop-shadow-lg">欢迎光临</h2>
                </div>
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-6 px-8 pb-8 overflow-hidden">
            <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 lg:grid-cols-3 gap-6 content-start pb-20">
                {barbers.map(barber => {
                    const queue = getBarberQueue(barber.name);
                    const currentCustomer = queue.find(a => a.status === 'checked_in');
                    const waitingList = queue.filter(a => a.id !== currentCustomer?.id);

                    return (
                        <div key={barber.id} className="bg-slate-800/80 rounded-3xl border border-slate-700 overflow-hidden flex flex-col h-[340px] transition-all hover:border-primary shadow-xl group">
                            <div className="p-5 flex items-start gap-4 bg-slate-800/40">
                                <img src={barber.image} className="w-14 h-14 rounded-2xl object-cover ring-2 ring-slate-600" />
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-white truncate">{barber.name}</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{barber.title}</p>
                                </div>
                                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md border ${currentCustomer ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                                    {currentCustomer ? '正在服务' : '空闲'}
                                </span>
                            </div>

                            <div className="flex-1 p-5 flex flex-col">
                                {currentCustomer ? (
                                    <div className="bg-slate-900/60 rounded-2xl p-4 border border-slate-700 mb-4 animate-fade-in">
                                        <p className="text-[9px] text-primary font-bold uppercase mb-2">正在剪裁</p>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-xl font-bold text-white">{currentCustomer.customer_name}</p>
                                                <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-tighter">单号: #{currentCustomer.id}</p>
                                            </div>
                                            <span className="text-[10px] text-slate-500 font-mono">{currentCustomer.time_str}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-2xl mb-4 text-slate-600">
                                        <span className="material-symbols-outlined text-2xl mb-1">chair</span>
                                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">等候接单</span>
                                    </div>
                                )}

                                <div className="mt-auto space-y-2">
                                    <p className="text-[9px] text-slate-500 font-bold uppercase px-1">等待序列 ({waitingList.length})</p>
                                    {waitingList.slice(0, 2).map((w, idx) => (
                                        <div key={w.id} className="flex items-center justify-between bg-slate-900/30 p-2.5 rounded-xl border border-slate-700/50">
                                            <div className="flex items-center gap-3">
                                                <span className="w-5 h-5 rounded-md bg-slate-700 flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                                                <span className="text-sm font-bold">{w.customer_name}</span>
                                            </div>
                                            <span className="text-[10px] font-mono opacity-40">{w.time_str}</span>
                                        </div>
                                    ))}
                                    {waitingList.length === 0 && <p className="text-[10px] text-slate-700 text-center py-2 italic font-bold tracking-widest uppercase opacity-40">暂无预约</p>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Right: Sidebar */}
            <div className="w-80 flex-none flex flex-col gap-6">
                <div className="bg-slate-800 rounded-3xl p-6 flex flex-col items-center text-center shadow-2xl">
                    <p className="text-white font-black text-xl mb-1">扫码极速预约</p>
                    <p className="text-slate-500 text-[10px] mb-5 font-bold uppercase tracking-widest">Instant Queueing</p>
                    <div className="bg-white p-3 rounded-[32px] mb-6 shadow-inner">
                        <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${window.location.origin}`} 
                            className="w-40 h-40 mix-blend-multiply opacity-90"
                            alt="Booking QR"
                        />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-300 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-700 uppercase tracking-widest">
                        <span className="material-symbols-outlined text-sm text-primary">touch_app</span>
                        扫码查看您的实时排位
                    </div>
                </div>

                <div className="flex-1 bg-slate-800/80 rounded-3xl p-6 flex flex-col overflow-hidden relative border border-slate-700/50 shadow-2xl">
                    <h3 className="text-xs font-black text-slate-400 mb-5 flex items-center gap-2 uppercase tracking-widest">
                         <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                         实时动态 / LIVE FEED
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 no-scrollbar">
                        {recentLogs.map((log, i) => (
                            <div key={i} className={`flex gap-3 text-[11px] animate-fade-in-left ${i === 0 ? 'text-white' : 'text-slate-500'}`}>
                                <span className="opacity-30 flex-none font-mono tracking-tighter">[{recentLogs.length - i}]</span>
                                <p className="leading-relaxed font-medium">{log}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};
