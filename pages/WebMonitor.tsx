
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';
import { Barber, Appointment, PageRoute } from '../types';
import { generateSpeech } from '../services/geminiService';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

// Audio Helper: Convert PCM Int16 to AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const dataInt16 = new Int16Array(arrayBuffer);
  
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const WebMonitor: React.FC<Props> = ({ onNavigate }) => {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [recentLogs, setRecentLogs] = useState<string[]>([]);
  const [stats, setStats] = useState({
      servedToday: 0,
      totalWaiting: 0,
      avgWaitTime: 0
  });
  
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
          const { data: barberData } = await supabase
              .from('app_barbers')
              .select('*')
              .eq('status', 'active')
              .order('id');
          
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
              const waiting = activeAppts.filter((a: any) => a.status !== 'completed');
              
              setAppointments(activeAppts as Appointment[]);
              setStats({
                  servedToday: completed.length,
                  totalWaiting: waiting.length,
                  avgWaitTime: waiting.length * 15
              });
          }
      } catch (e) {
          console.error("WebMonitor Fetch Error", e);
      }
  };

  const initAudioContext = async () => {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
      }
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
      }
  };

  const toggleAudio = async () => {
      if (!audioEnabled) {
          try {
            await initAudioContext();
            setAudioEnabled(true);
            addLog("语音系统已激活");
            // Play a small click sound or vibration if needed
          } catch (e) {
            console.error("Failed to enable audio", e);
            addLog("语音系统初始化失败");
          }
      } else {
          setAudioEnabled(false);
          window.speechSynthesis.cancel();
          addLog("语音系统已关闭");
      }
  };

  const playNativeTTS = (text: string) => {
      if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'zh-CN';
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.onstart = () => setIsPlaying(true);
          utterance.onend = () => setIsPlaying(false);
          utterance.onerror = () => setIsPlaying(false);
          window.speechSynthesis.speak(utterance);
      } else {
          setIsPlaying(false);
      }
  };

  const playAnnouncement = async (text: string) => {
      if (!audioEnabled) return;
      
      setIsPlaying(true);
      try {
          await initAudioContext();
          if (audioContextRef.current && audioContextRef.current.state === 'running') {
            const pcmData = await generateSpeech(text);
            if (pcmData) {
                const audioBuffer = await decodeAudioData(pcmData, audioContextRef.current, 24000);
                const source = audioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContextRef.current.destination);
                source.onended = () => setIsPlaying(false);
                source.start();
                return;
            }
          }
      } catch (e) {
          console.warn("Gemini TTS failed, falling back to Native TTS", e);
      }
      playNativeTTS(text);
  };

  useEffect(() => {
    fetchMonitorData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const pollingTimer = setInterval(() => fetchMonitorData(), 5000); // More frequent polling as fallback
    
    // Improved Realtime Subscription
    const subscribe = () => {
        if (channelRef.current) return;
        
        channelRef.current = supabase.channel('web_monitor_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, (payload) => {
                fetchMonitorData();
                const newRecord = payload.new as Appointment;
                const oldRecord = payload.old as Appointment;
                
                if (payload.eventType === 'INSERT') {
                    addLog(`新预约: ${newRecord.customer_name}`);
                } else if (payload.eventType === 'UPDATE' && newRecord.status === 'checked_in' && oldRecord.status !== 'checked_in') {
                    addLog(`顾客到店: ${newRecord.customer_name}`);
                    const msg = `请 ${newRecord.id % 1000} 号顾客 ${newRecord.customer_name}，到 ${newRecord.barber_name} 处准备理发。`;
                    playAnnouncement(msg);
                } else if (payload.eventType === 'UPDATE' && newRecord.status === 'completed') {
                    addLog(`服务完成: ${newRecord.customer_name}`);
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log("Monitor successfully subscribed.");
                } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
                    console.warn("Channel issue, will retry polling...");
                }
            });
    };

    // Slight delay to allow WebSocket connection to stabilize
    const subTimeout = setTimeout(subscribe, 500);

    return () => {
        clearTimeout(subTimeout);
        clearInterval(timer);
        clearInterval(pollingTimer);
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
        window.speechSynthesis.cancel();
    };
  }, [audioEnabled]);

  const addLog = (msg: string) => {
      const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'});
      setRecentLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 10));
  };

  const getBarberQueue = (barberName: string) => {
      return appointments.filter(a => a.barber_name === barberName);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans overflow-hidden flex flex-col">
        {/* Header */}
        <header className="flex-none h-20 bg-slate-950/50 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-8">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 overflow-hidden relative">
                    <div className="absolute inset-0 barber-pole-bg animate-barber-scroll opacity-40"></div>
                    <span className="material-symbols-outlined text-2xl text-white relative z-10">content_cut</span>
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">BarberBook Pro <span className="text-primary">Monitor</span></h1>
                    <p className="text-xs text-slate-400 font-mono tracking-widest uppercase">实时服务监控系统</p>
                </div>
            </div>
            
            <div className="flex items-center gap-8">
                <button 
                    onClick={toggleAudio}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${audioEnabled 
                        ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(0,122,255,0.3)]' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                    {isPlaying ? (
                        <div className="flex gap-1 items-center h-4">
                            <span className="w-1 h-2 bg-primary animate-[bounce_0.5s_infinite]"></span>
                            <span className="w-1 h-4 bg-primary animate-[bounce_0.5s_infinite_0.1s]"></span>
                            <span className="w-1 h-2 bg-primary animate-[bounce_0.5s_infinite_0.2s]"></span>
                        </div>
                    ) : (
                        <span className="material-symbols-outlined text-lg">{audioEnabled ? 'volume_up' : 'volume_off'}</span>
                    )}
                    <span className="text-xs font-bold">{audioEnabled ? '语音播报已开启' : '开启语音叫号'}</span>
                </button>

                <div className="h-8 w-px bg-slate-800"></div>

                <div className="text-right">
                    <p className="text-3xl font-mono font-bold leading-none">{currentTime.toLocaleTimeString([], { hour12: false })}</p>
                    <p className="text-xs text-slate-400 font-medium mt-1">{currentTime.toLocaleDateString()} {['周日','周一','周二','周三','周四','周五','周六'][currentTime.getDay()]}</p>
                </div>
                <button onClick={() => onNavigate('home')} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-colors group">
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-white transition-colors">close</span>
                </button>
            </div>
        </header>

        {/* Stats Bar */}
        <div className="flex-none grid grid-cols-4 gap-6 px-8 py-6">
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 flex items-center gap-4 hover:border-blue-500/50 transition-colors cursor-default">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <span className="material-symbols-outlined text-2xl">groups</span>
                </div>
                <div>
                    <p className="text-sm text-slate-400 font-medium">当前等待人数</p>
                    <p className="text-3xl font-bold text-white">{stats.totalWaiting}</p>
                </div>
            </div>
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 flex items-center gap-4 hover:border-amber-500/50 transition-colors cursor-default">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
                    <span className="material-symbols-outlined text-2xl">timer</span>
                </div>
                <div>
                    <p className="text-sm text-slate-400 font-medium">预计平均等待</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white">{stats.avgWaitTime}</span>
                        <span className="text-sm text-slate-500">分钟</span>
                    </div>
                </div>
            </div>
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 flex items-center gap-4 hover:border-green-500/50 transition-colors cursor-default">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
                    <span className="material-symbols-outlined text-2xl">check_circle</span>
                </div>
                <div>
                    <p className="text-sm text-slate-400 font-medium">今日已服务</p>
                    <p className="text-3xl font-bold text-white">{stats.servedToday}</p>
                </div>
            </div>
            
            <div className="barber-border-wrapper group overflow-hidden shadow-2xl">
                <div className="bg-slate-900 rounded-[20px] h-full flex items-center justify-between relative overflow-hidden px-4">
                    <div className="barber-cylinder opacity-90 scale-y-110 shadow-lg border border-white/10"></div>
                    <div className="relative z-10 text-center flex-1 px-2">
                        <h2 className="text-5xl font-artistic text-white tracking-wider">欢迎光临</h2>
                        <p className="text-blue-300 text-[9px] font-bold uppercase tracking-[0.5em] mt-2 opacity-40">OPENING NOW</p>
                    </div>
                    <div className="barber-cylinder opacity-90 scale-y-110 shadow-lg border border-white/10"></div>
                    <div className="absolute inset-0 bg-slate-900/40 pointer-events-none"></div>
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
                        <div key={barber.id} className="bg-slate-800 rounded-3xl border border-slate-700 overflow-hidden flex flex-col h-[320px] transition-all hover:border-slate-500 hover:shadow-xl hover:shadow-black/40 group/card">
                            <div className="p-5 flex items-start gap-4 border-b border-slate-700/50 bg-slate-800/30">
                                <div className="relative">
                                    <div className={`absolute -inset-1 rounded-2xl opacity-30 blur-sm ${currentCustomer ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                                    <img src={barber.image} className="w-16 h-16 rounded-2xl object-cover ring-2 ring-slate-600 relative z-10" />
                                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 border-2 border-slate-800 rounded-full flex items-center justify-center z-20 ${currentCustomer ? 'bg-amber-500' : 'bg-green-500'}`}>
                                        <span className="material-symbols-outlined text-[10px] text-white font-bold">{currentCustomer ? 'more_horiz' : 'check'}</span>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-1">{barber.name}</h3>
                                    <span className="text-xs font-medium px-2 py-1 rounded bg-slate-700 text-slate-300 border border-slate-600">
                                        {barber.title || '理发师'}
                                    </span>
                                </div>
                                <div className="ml-auto flex flex-col items-end">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-1 border ${currentCustomer ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                                        {currentCustomer ? '服务中' : '空闲'}
                                    </span>
                                    <div className="flex items-center gap-1 text-amber-400">
                                        <span className="text-sm font-bold font-mono">{barber.rating}</span>
                                        <span className="material-symbols-outlined text-sm fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 p-5 flex flex-col">
                                {currentCustomer ? (
                                    <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-2xl p-4 border border-slate-600 mb-4 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <span className="material-symbols-outlined text-5xl">content_cut</span>
                                        </div>
                                        <p className="text-xs text-blue-300 font-bold uppercase mb-2 flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shadow-[0_0_5px_#60a5fa]"></span>
                                            正在服务
                                        </p>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-2xl font-bold text-white tracking-tight">{currentCustomer.customer_name}</p>
                                                <p className="text-sm text-slate-400 mt-1 font-medium">{currentCustomer.service_name}</p>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] text-slate-500 font-bold uppercase mb-1">时间</span>
                                                <span className="text-xs font-mono text-slate-300 bg-slate-900/50 px-2 py-0.5 rounded-md">{currentCustomer.time_str}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-700/50 rounded-2xl mb-4 bg-slate-800/30">
                                        <span className="material-symbols-outlined text-3xl mb-2 opacity-30">chair</span>
                                        <span className="text-xs font-bold uppercase tracking-widest opacity-50">等候接单</span>
                                    </div>
                                )}

                                <div className="mt-auto">
                                    <div className="flex justify-between items-center mb-2.5 px-1">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.1em]">等候队列 ({waitingList.length})</p>
                                        {waitingList.length > 0 && <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>}
                                    </div>
                                    <div className="space-y-2">
                                        {waitingList.slice(0, 2).map((w, idx) => (
                                            <div key={w.id} className="flex items-center justify-between bg-slate-900/40 p-2.5 rounded-xl border border-slate-700/50 group transition-all hover:bg-slate-900/60">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-5 h-5 rounded-md bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">{idx + 1}</span>
                                                    <span className="text-sm text-slate-200 font-bold">{w.customer_name}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] text-slate-500 font-medium px-1.5 py-0.5 bg-slate-800 rounded">{w.service_name}</span>
                                                    <span className="text-xs text-slate-400 font-mono font-bold">{w.time_str}</span>
                                                </div>
                                            </div>
                                        ))}
                                        {waitingList.length === 0 && <p className="text-[10px] text-slate-600 text-center py-2 font-bold uppercase tracking-widest">暂无等待</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Right: Sidebar */}
            <div className="w-80 flex-none flex flex-col gap-6">
                <div className="bg-slate-800 rounded-3xl p-6 flex flex-col items-center text-center shadow-2xl group">
                    <p className="text-white font-black text-xl mb-1 tracking-tight">手机扫码预约</p>
                    <p className="text-slate-400 text-xs mb-5 font-medium">无需到店等待，即刻极速排队</p>
                    <div className="bg-white p-3 rounded-[32px] mb-5 shadow-inner relative overflow-hidden group-hover:scale-105 transition-transform duration-500">
                        <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${window.location.origin}`} 
                            className="w-40 h-40 mix-blend-multiply opacity-95 relative z-10"
                            alt="Booking QR"
                        />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-300 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-700">
                        <span className="material-symbols-outlined text-sm text-primary">touch_app</span>
                        <span className="uppercase tracking-widest">支持 iOS / Android</span>
                    </div>
                </div>

                <div className="flex-1 bg-slate-800 rounded-3xl p-6 flex flex-col overflow-hidden shadow-2xl relative">
                    <h3 className="text-xs font-black text-slate-400 mb-5 flex items-center justify-between uppercase tracking-[0.2em]">
                        <span className="flex items-center gap-2">
                             <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]"></span>
                             实时动态
                        </span>
                        <span className="text-[9px] opacity-40 font-mono">LIVE FEED</span>
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                        {recentLogs.length > 0 ? recentLogs.map((log, i) => (
                            <div key={i} className="flex gap-4 animate-fade-in-left group">
                                <div className="flex flex-col items-center mt-1.5">
                                    <div className={`w-2 h-2 rounded-full transition-all group-hover:scale-125 ${i === 0 ? 'bg-primary shadow-[0_0_5px_#007aff]' : 'bg-slate-600'}`}></div>
                                    {i < recentLogs.length - 1 && <div className="w-px h-full bg-slate-700/50 my-1"></div>}
                                </div>
                                <div className="flex-1">
                                    <p className={`text-[11px] leading-relaxed py-0.5 font-medium transition-colors ${i === 0 ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>
                                        {log}
                                    </p>
                                </div>
                            </div>
                        )) : (
                            <div className="flex flex-col items-center justify-center h-full opacity-20">
                                <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">history_toggle_off</span>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">暂无动态记录</p>
                            </div>
                        )}
                    </div>
                    <div className="h-12 bg-gradient-to-t from-slate-800 to-transparent absolute bottom-0 left-0 right-0 pointer-events-none"></div>
                </div>
            </div>
        </div>
    </div>
  );
};
