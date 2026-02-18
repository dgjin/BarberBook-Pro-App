
import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { BottomNav } from '../components/BottomNav';
import { PageRoute, Barber, User } from '../types';
import { supabase } from '../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  onBarberSelect?: (barber: Barber | null) => void;
  currentUser?: User | null;
}

export const CustomerHome: React.FC<Props> = ({ onNavigate, onBarberSelect, currentUser }) => {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuickHelp, setShowQuickHelp] = useState(false);
  
  // Queue Real-time State
  const [queueCount, setQueueCount] = useState<number>(0);
  const [waitTime, setWaitTime] = useState<number>(0);
  const [loadingQueue, setLoadingQueue] = useState(true);

  const getTodayString = () => {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const fetchQueueData = async () => {
      try {
          const todayStr = getTodayString();
          const { data } = await supabase
              .from('app_appointments')
              .select('id')
              .eq('date_str', todayStr)
              .eq('status', 'checked_in');
          
          if (data) {
              const count = data.length;
              setQueueCount(count);
              setWaitTime(count * 15); 
          }
      } catch (e) {
          console.error("Error fetching queue data", e);
      } finally {
          setLoadingQueue(false);
      }
  };

  useEffect(() => {
    const fetchBarbers = async () => {
      try {
        const { data, error } = await supabase
          .from('app_barbers')
          .select('*')
          .order('rating', { ascending: false })
          .limit(6);

        if (error) throw error;
        setBarbers(data as unknown as Barber[]);
      } catch (err) {
        console.error('Error fetching barbers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBarbers();
    fetchQueueData();
    const channel = supabase.channel('home_queue_updates').on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, () => fetchQueueData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <Layout>
      <header className="pt-14 pb-6 px-6 flex justify-between items-center sticky top-0 bg-bg-main/80 ios-blur z-20">
        <div>
          <p className="text-[13px] text-text-secondary font-medium mb-0.5">{currentUser ? '早上好' : '欢迎光临'}</p>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">{currentUser ? currentUser.name : '游客 (Guest)'}</h1>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setShowQuickHelp(true)} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[20px]">help</span>
            </button>
            <div className="relative cursor-pointer transition-transform active:scale-95" onClick={() => currentUser ? onNavigate('check_in') : onNavigate('login')}>
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm bg-slate-200">
                    {currentUser?.avatar ? <img alt="User" className="w-full h-full object-cover" src={currentUser.avatar} /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><span className="material-symbols-outlined text-[20px]">person</span></div>}
                </div>
            </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-32 space-y-8 no-scrollbar">
        {/* Queue Status Card */}
        <section>
          <div className="bg-surface rounded-3xl p-6 shadow-xl shadow-gray-200/50 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
            <div className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 bg-primary/10 rounded-full">
              <span className={`w-1.5 h-1.5 rounded-full ${loadingQueue ? 'bg-slate-400' : 'bg-primary animate-pulse'}`}></span>
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider">今日实时排队</span>
            </div>
            <div className="mb-1"><span className="text-xs text-text-secondary font-medium">预计等待</span></div>
            <div className="flex items-baseline gap-1 mb-6">
              {loadingQueue ? <span className="text-5xl font-bold text-slate-200 animate-pulse">--</span> : <span className="text-5xl font-bold text-text-main animate-scale-in">{waitTime}</span>}
              <span className="text-lg font-semibold text-text-main">分钟</span>
            </div>
            <button onClick={() => onNavigate('monitor')} className="w-full bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[22px]">bolt</span>
              <span>查看详细监控</span>
            </button>
          </div>
        </section>

        {/* Top Barbers Section */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-text-main">顶尖理发师</h3>
            <button onClick={() => onNavigate('booking')} className="text-primary text-sm font-semibold">查看全部</button>
          </div>
          <div className="flex gap-5 overflow-x-auto pb-6 -mx-6 px-6 hide-scrollbar snap-x">
            {loading ? <div className="w-full text-center text-slate-400 py-10 text-xs">加载中...</div> : barbers.map((barber) => (
              <div key={barber.id} className="snap-start min-w-[170px] bg-white rounded-[32px] p-2 pb-5 border border-white shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-95" onClick={() => { if (onBarberSelect) onBarberSelect(barber); onNavigate('booking'); }}>
                <div className="relative aspect-square mb-4 rounded-[26px] overflow-hidden group">
                  <img alt={barber.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" src={barber.image} />
                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-md px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm border border-white/50">
                    <span className="material-symbols-outlined text-[10px] text-orange-400 fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span className="text-[10px] font-bold text-text-main">{barber.rating}</span>
                  </div>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 bg-black/40 backdrop-blur-sm rounded-lg">
                    <span className={`w-1.5 h-1.5 rounded-full ${barber.status === 'active' ? 'bg-green-400 animate-pulse' : barber.status === 'busy' ? 'bg-orange-400' : 'bg-slate-400'}`}></span>
                    <span className="text-[9px] font-bold text-white uppercase tracking-tighter">{barber.status === 'active' ? '在线' : barber.status === 'busy' ? '忙碌' : '休息'}</span>
                  </div>
                </div>
                <div className="px-2 text-center">
                    <p className="font-black text-sm text-text-main mb-1 truncate">{barber.name}</p>
                    <p className="text-[10px] text-text-secondary mb-3 truncate px-1 opacity-80">{barber.title || '理发师'}</p>
                    <div className="flex items-center justify-center gap-1 text-primary"><span className="text-[10px] font-black uppercase tracking-widest">立即预约</span><span className="material-symbols-outlined text-[12px]">arrow_forward</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Help & Nav */}
        <section>
          <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-text-main">快速导航</h3></div>
          <div className="space-y-3">
            <div className="bg-white rounded-3xl p-5 flex gap-4 items-center shadow-sm border border-white cursor-pointer active:bg-gray-50 transition-colors" onClick={() => setShowQuickHelp(true)}>
              <div className="bg-amber-100 text-amber-600 w-12 h-12 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">lightbulb</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-text-main text-[15px]">新手指南</h4>
                <p className="text-[11px] text-text-secondary">3步掌握理发预约流程</p>
              </div>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-main text-text-secondary"><span className="material-symbols-outlined text-[18px]">chevron_right</span></button>
            </div>
            
            <div className="bg-surface rounded-3xl p-5 flex gap-4 items-center shadow-sm border border-white cursor-pointer active:bg-gray-50 transition-colors" onClick={() => onNavigate('check_in')}>
              <div className="bg-primary/10 text-primary w-12 h-12 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">confirmation_number</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-text-main text-[15px]">理发券余额</h4>
                <p className="text-[11px] text-text-secondary">查看您的可用消费凭证</p>
              </div>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-main text-text-secondary"><span className="material-symbols-outlined text-[18px]">chevron_right</span></button>
            </div>
          </div>
        </section>
      </main>

      {/* Quick Help Modal */}
      {showQuickHelp && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowQuickHelp(false)}></div>
            <div className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-[slide-up_0.3s_ease-out] max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900">新手指南</h2>
                    <button onClick={() => setShowQuickHelp(false)} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500"><span className="material-symbols-outlined">close</span></button>
                </div>
                <div className="space-y-6">
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shrink-0 font-bold">1</div>
                        <div><h4 className="font-bold text-slate-900 mb-1">在线选人与预约</h4><p className="text-xs text-slate-500 leading-relaxed">在首页或预约页面选择心仪的发型师，挑选合适的日期和时段完成支付。未支付订单将不会被系统预留。</p></div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shrink-0 font-bold">2</div>
                        <div><h4 className="font-bold text-slate-900 mb-1">监控队列与到店</h4><p className="text-xs text-slate-500 leading-relaxed">进入“监控大屏”查看实时排队进度。建议在预计时间前15分钟到店，点击个人中心的“立即签到”获取排位。</p></div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shrink-0 font-bold">3</div>
                        <div><h4 className="font-bold text-slate-900 mb-1">自动扣券与结算</h4><p className="text-xs text-slate-500 leading-relaxed">服务结束后，理发师点击完成，系统将自动优先扣除您账户中的理发券。如预约被取消，理发券将自动原路返还。</p></div>
                    </div>
                </div>
                <button onClick={() => setShowQuickHelp(false)} className="w-full mt-8 bg-slate-900 text-white font-bold py-3.5 rounded-2xl">开始使用</button>
            </div>
        </div>
      )}
      
      <BottomNav activeRoute="home" onNavigate={onNavigate} userRole="customer" />
    </Layout>
  );
};
