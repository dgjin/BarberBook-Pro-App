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
  const dataInt16 = new Int16Array(data.buffer);
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
  
  // Audio State
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const getTodayString = () => {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const fetchMonitorData = async () => {
      try {
          // 1. Fetch Active Barbers
          const { data: barberData } = await supabase
              .from('app_barbers')
              .select('*')
              .eq('status', 'active')
              .order('id');
          
          if (barberData) setBarbers(barberData as unknown as Barber[]);

          // 2. Fetch Today's Appointments
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

  // Toggle Audio
  const toggleAudio = async () => {
      if (!audioEnabled) {
          try {
            // Initialize Audio Context on user gesture
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
            }
            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }
            // Play a silent sound to unlock audio on iOS/Android
            const buffer = audioContextRef.current.createBuffer(1, 1, 22050);
            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);
            source.start(0);

            setAudioEnabled(true);
            console.log("Audio System Enabled");
          } catch (e) {
            console.error("Failed to enable audio", e);
            // Even if Context fails, we enable state to allow Native TTS fallback
            setAudioEnabled(true);
          }
      } else {
          setAudioEnabled(false);
          // Cancel any ongoing native speech
          window.speechSynthesis.cancel();
      }
  };

  // Browser Native TTS Fallback
  const playNativeTTS = (text: string) => {
      if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel(); // Cancel previous
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'zh-CN'; // Set Chinese
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          
          utterance.onstart = () => setIsPlaying(true);
          utterance.onend = () => setIsPlaying(false);
          utterance.onerror = () => setIsPlaying(false);
          
          window.speechSynthesis.speak(utterance);
      } else {
          console.error("Browser does not support Speech Synthesis");
          setIsPlaying(false);
      }
  };

  // Play Announcement (Try AI first, then Native)
  const playAnnouncement = async (text: string) => {
      if (!audioEnabled) return;
      
      setIsPlaying(true);

      // 1. Try Gemini AI TTS
      try {
          // Check if Context is healthy
          if (audioContextRef.current && audioContextRef.current.state === 'running') {
            const pcmData = await generateSpeech(text);
            if (pcmData) {
                const audioBuffer = await decodeAudioData(pcmData, audioContextRef.current, 24000);
                const source = audioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContextRef.current.destination);
                source.onended = () => setIsPlaying(false);
                source.start();
                return; // Success, exit
            }
          }
      } catch (e) {
          console.warn("Gemini TTS failed, falling back to Native TTS", e);
      }

      // 2. Fallback to Native TTS (No Key or Network Error)
      console.log("Using Native TTS Fallback");
      playNativeTTS(text);
  };

  useEffect(() => {
    fetchMonitorData();

    // Clock (every 1s)
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    // Polling Backup (every 5s) to ensure data freshness
    const pollingTimer = setInterval(() => fetchMonitorData(), 5000);

    // Realtime Subscription
    const channel = supabase.channel('web_monitor_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, (payload) => {
            fetchMonitorData();
            // Add to log feed
            const newRecord = payload.new as Appointment;
            const oldRecord = payload.old as Appointment;

            if (payload.eventType === 'INSERT') {
                addLog(`新预约: ${newRecord.customer_name} 预约了 ${newRecord.service_name}`);
            } else if (payload.eventType === 'UPDATE' && newRecord.status === 'checked_in' && oldRecord.status !== 'checked_in') {
                // Trigger TTS for Check-in / Call
                addLog(`顾客到店: ${newRecord.customer_name} 已签到`);
                const msg = `请 ${newRecord.id} 号顾客，${newRecord.customer_name}，到 ${newRecord.barber_name} 总监处准备理发。`;
                playAnnouncement(msg);
            } else if (payload.eventType === 'UPDATE' && newRecord.status === 'completed') {
                addLog(`服务完成: ${newRecord.customer_name} 的服务已结束`);
            }
        })
        .subscribe();

    return () => {
        clearInterval(timer);
        clearInterval(pollingTimer);
        supabase.removeChannel(channel);
        window.speechSynthesis.cancel();
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
    };
  }, [audioEnabled]);

  const addLog = (msg: string) => {
      const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      setRecentLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 8));
  };

  const getBarberQueue = (barberName: string) => {
      return appointments.filter(a => a.barber_name === barberName);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans overflow-hidden flex flex-col">
        {/* Header */}
        <header className="flex-none h-20 bg-slate-950/50 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-8">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <span className="material-symbols-outlined text-2xl text-white">content_cut</span>
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">BarberBook Pro <span className="text-primary">Monitor</span></h1>
                    <p className="text-xs text-slate-400 font-mono tracking-widest uppercase">实时服务监控系统</p>
                </div>
            </div>
            
            <div className="flex items-center gap-8">
                {/* Audio Toggle */}
                <button 
                    onClick={toggleAudio}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${audioEnabled 
                        ? 'bg-primary/20 border-primary text-primary' 
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
                <button onClick={() => onNavigate('home')} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-colors">
                    <span className="material-symbols-outlined text-slate-400">close</span>
                </button>
            </div>
        </header>

        {/* Stats Bar */}
        <div className="flex-none grid grid-cols-4 gap-6 px-8 py-6">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <span className="material-symbols-outlined text-2xl">groups</span>
                </div>
                <div>
                    <p className="text-sm text-slate-400 font-medium">当前等待人数</p>
                    <p className="text-3xl font-bold text-white">{stats.totalWaiting}</p>
                </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
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
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
                    <span className="material-symbols-outlined text-2xl">check_circle</span>
                </div>
                <div>
                    <p className="text-sm text-slate-400 font-medium">今日已服务</p>
                    <p className="text-3xl font-bold text-white">{stats.servedToday}</p>
                </div>
            </div>
            <div className="bg-gradient-to-r from-primary to-blue-600 rounded-2xl p-5 flex items-center justify-between relative overflow-hidden shadow-lg shadow-blue-900/50">
                <div className="relative z-10">
                    <p className="text-blue-100 text-sm font-bold uppercase tracking-wider mb-1">正在营业</p>
                    <p className="text-white text-lg font-bold">欢迎光临</p>
                </div>
                <span className="material-symbols-outlined text-6xl text-white/20 absolute -right-2 -bottom-4">storefront</span>
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-6 px-8 pb-8 overflow-hidden">
            {/* Left: Barbers Grid */}
            <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 lg:grid-cols-3 gap-6 content-start pb-20">
                {barbers.map(barber => {
                    const queue = getBarberQueue(barber.name);
                    const currentCustomer = queue.find(a => a.status === 'checked_in');
                    const waitingList = queue.filter(a => a.id !== currentCustomer?.id);

                    return (
                        <div key={barber.id} className="bg-slate-800 rounded-3xl border border-slate-700 overflow-hidden flex flex-col h-[320px]">
                            {/* Barber Header */}
                            <div className="p-5 flex items-start gap-4 border-b border-slate-700/50 bg-slate-800/50">
                                <div className="relative">
                                    <img src={barber.image} className="w-16 h-16 rounded-2xl object-cover ring-2 ring-slate-600" />
                                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 border-2 border-slate-800 rounded-full flex items-center justify-center ${currentCustomer ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-1">{barber.name}</h3>
                                    <span className="text-xs font-medium px-2 py-1 rounded bg-slate-700 text-slate-300 border border-slate-600">
                                        {barber.title || '高级发型师'}
                                    </span>
                                </div>
                                <div className="ml-auto flex flex-col items-end">
                                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full mb-1 ${currentCustomer ? 'bg-amber-500/10 text-amber-400' : 'bg-green-500/10 text-green-400'}`}>
                                        {currentCustomer ? 'BUSY' : 'FREE'}
                                    </span>
                                    <div className="flex items-center gap-1 text-amber-400">
                                        <span className="text-sm font-bold">{barber.rating}</span>
                                        <span className="material-symbols-outlined text-sm fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                    </div>
                                </div>
                            </div>

                            {/* Current Status */}
                            <div className="flex-1 p-5 flex flex-col">
                                {currentCustomer ? (
                                    <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl p-4 border border-slate-600 mb-4 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <span className="material-symbols-outlined text-5xl">content_cut</span>
                                        </div>
                                        <p className="text-xs text-blue-300 font-bold uppercase mb-2 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
                                            正在服务
                                        </p>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-2xl font-bold text-white">{currentCustomer.customer_name}</p>
                                                <p className="text-sm text-slate-400 mt-1">{currentCustomer.service_name}</p>
                                            </div>
                                            <span className="text-xs font-mono text-slate-500">{currentCustomer.time_str}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-700 rounded-2xl mb-4">
                                        <span className="material-symbols-outlined text-3xl mb-2 opacity-50">chair</span>
                                        <span className="text-sm font-medium">当前空闲</span>
                                    </div>
                                )}

                                {/* Waiting List */}
                                <div className="mt-auto">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">等待队列 ({waitingList.length})</p>
                                    </div>
                                    <div className="space-y-2">
                                        {waitingList.slice(0, 2).map((w, idx) => (
                                            <div key={w.id} className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-700/50">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-5 h-5 rounded-md bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">{idx + 1}</span>
                                                    <span className="text-sm text-slate-200 font-medium">{w.customer_name}</span>
                                                </div>
                                                <span className="text-xs text-slate-500 font-mono">{w.time_str}</span>
                                            </div>
                                        ))}
                                        {waitingList.length === 0 && <p className="text-xs text-slate-600 text-center py-2">暂无排队</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Right: Sidebar */}
            <div className="w-80 flex-none flex flex-col gap-6">
                {/* QR Code Card */}
                <div className="bg-white rounded-3xl p-6 flex flex-col items-center text-center shadow-2xl shadow-black/20">
                    <p className="text-slate-900 font-bold text-lg mb-1">手机扫码预约</p>
                    <p className="text-slate-400 text-xs mb-4">无需等待，即刻排队</p>
                    <div className="bg-slate-100 p-2 rounded-xl mb-4">
                        <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${window.location.origin}`} 
                            className="w-40 h-40 mix-blend-multiply opacity-90"
                            alt="Booking QR"
                        />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                        <span className="material-symbols-outlined text-sm">touch_app</span>
                        <span>支持 iOS & Android</span>
                    </div>
                </div>

                {/* Activity Feed */}
                <div className="flex-1 bg-slate-800 rounded-3xl border border-slate-700 p-5 flex flex-col overflow-hidden">
                    <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        实时动态
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {recentLogs.length > 0 ? recentLogs.map((log, i) => (
                            <div key={i} className="flex gap-3 animate-fade-in-left">
                                <div className="flex flex-col items-center mt-1">
                                    <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                                    {i < recentLogs.length - 1 && <div className="w-px h-full bg-slate-700 my-1"></div>}
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed py-0.5">{log}</p>
                            </div>
                        )) : (
                            <p className="text-xs text-slate-600 text-center mt-10">暂无最新动态</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};