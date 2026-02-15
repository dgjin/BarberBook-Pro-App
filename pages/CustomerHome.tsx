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
  
  // Queue Real-time State
  const [queueCount, setQueueCount] = useState<number>(0);
  const [waitTime, setWaitTime] = useState<number>(0);
  const [loadingQueue, setLoadingQueue] = useState(true);

  // Helper to get today's date string matching DB format "M月D日"
  const getTodayString = () => {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  // Fetch Queue Data
  const fetchQueueData = async () => {
      try {
          const todayStr = getTodayString();
          // OPTIMIZATION: Only count 'checked_in' status for the real-time queue.
          // 'confirmed' appointments are future bookings and shouldn't count towards current waiting time.
          const { data, error } = await supabase
              .from('app_appointments')
              .select('id')
              .eq('date_str', todayStr)
              .eq('status', 'checked_in'); // Only count people physically in store
          
          if (data) {
              const count = data.length;
              setQueueCount(count);
              // Estimate 15 minutes per person in queue
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
          .limit(5);

        if (error) throw error;
        
        if (data && data.length > 0) {
          setBarbers(data as unknown as Barber[]);
        } else {
            // Fallback mock data if DB is empty
            setBarbers([
              { id: 1, name: 'Marcus K.', title: '美式渐变 / 刻痕', rating: 4.9, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuASZI54tUmbDSYe5gS24e3PgOMrI9qj3GqCIEsupdXwc_RqEBRxxdeTzuQ3J0BROacciMi8-E7ETF5xeF2c2Uk4cf7YG5pilwN59DTPHgqMFtmR-BKshgwP10w2kJSINs_ypgvRDwU3w6nM3XlqoTe2P00EUzVesNcHEhim30CLfIwvsP3__IjMVSrLxerwxTk_9QTAUp9wDxhQiUOSQBM247evrYwIqH808FQf91hnQpmGCY8fFpkv8bZ_2SuikN86EqZhUYAYaRc', specialties: [], status: 'active' },
              { id: 2, name: 'James L.', title: '经典剪裁 / 造型', rating: 4.8, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD1qwvlDy5vm9u_b33_rfD-P40Tj3GDKG0BNW3yV3q6xsmoWSeF97hNH2lUiW2hPUuOombMFpnxNvcaTI3fvuVnlFjtiUQiAPARwitCM7fkkOmGhqU45Tbfv2ctMYXUcYuJog4zB8RNrPbkTdkcJVWtuV76N-kCOflrxai1WG_Ugv2XKZ674N23ONPrmzVGCM84SUkgpRzXQw-w7-ygvF6JovNcvEb3vxZjcdJvYqoeV8QJiVFDljKvMKL_L7dDIwrIvQXwOquUvYg', specialties: [], status: 'active' },
            ]);
        }
      } catch (err) {
        console.error('Error fetching barbers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBarbers();
    fetchQueueData();

    // Realtime Subscription for Queue Updates
    const channel = supabase.channel('home_queue_updates')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'app_appointments' }, 
            (payload) => {
                fetchQueueData();
            }
        )
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleBarberClick = (barber: Barber) => {
    if (onBarberSelect) {
      onBarberSelect(barber);
    }
    onNavigate('booking');
  };

  const handleViewAll = () => {
      if (onBarberSelect) {
          onBarberSelect(null);
      }
      onNavigate('booking');
  };

  return (
    <Layout>
      <header className="pt-14 pb-6 px-6 flex justify-between items-center sticky top-0 bg-bg-main/80 ios-blur z-20">
        <div>
          <p className="text-[13px] text-text-secondary font-medium mb-0.5">{currentUser ? '早上好' : '欢迎光临'}</p>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">{currentUser ? currentUser.name : '游客 (Guest)'}</h1>
        </div>
        <div 
          className="relative cursor-pointer transition-transform active:scale-95" 
          onClick={() => currentUser ? onNavigate('check_in') : onNavigate('login')}
        >
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm bg-slate-200">
            {currentUser?.avatar ? (
                <img 
                  alt="User" 
                  className="w-full h-full object-cover" 
                  src={currentUser.avatar}
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <span className="material-symbols-outlined text-[20px]">person</span>
                </div>
            )}
          </div>
          {!currentUser && (
              <div className="absolute -bottom-1 -right-1 bg-primary text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold border border-white">
                  登录
              </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-32 space-y-8 no-scrollbar">
        {/* Queue Status Card */}
        <section>
          <div className="bg-surface rounded-3xl p-6 ios-shadow flex flex-col items-center text-center relative overflow-hidden">
            {/* Background Accent */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
            
            <div className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 bg-primary/10 rounded-full">
              <span className={`w-1.5 h-1.5 rounded-full ${loadingQueue ? 'bg-slate-400' : 'bg-primary animate-pulse'}`}></span>
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider">今日实时排队 (已到店)</span>
            </div>
            
            <div className="mb-1">
              <span className="text-xs text-text-secondary font-medium">全店当前预计等待</span>
            </div>
            
            <div className="flex items-baseline gap-1 mb-6">
              {loadingQueue ? (
                  <span className="text-5xl font-bold text-slate-200 animate-pulse">--</span>
              ) : (
                  <span className="text-5xl font-bold text-text-main animate-scale-in">{waitTime}</span>
              )}
              <span className="text-lg font-semibold text-text-main">分钟</span>
            </div>
            
            <button 
              onClick={() => onNavigate('monitor')}
              className="w-full bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[22px]">bolt</span>
              <span>查看详细监控</span>
            </button>
            
            <div className="mt-4 flex items-center gap-1.5 text-text-secondary">
              <span className="material-symbols-outlined text-sm">groups</span>
              <p className="text-[12px] font-medium">
                  {loadingQueue ? '加载中...' : `当前共有 ${queueCount} 位顾客已签到排队中`}
              </p>
            </div>
          </div>
        </section>

        {/* Top Barbers */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-text-main">顶尖理发师</h3>
            <button 
                onClick={handleViewAll}
                className="text-primary text-sm font-semibold hover:opacity-80 transition-opacity"
            >
                查看全部
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 hide-scrollbar">
            {loading ? (
                 <div className="w-full text-center text-slate-400 py-4 text-xs">加载数据中...</div>
            ) : barbers.map((barber, i) => (
              <div 
                key={i} 
                className="min-w-[160px] bg-surface p-4 rounded-3xl ios-shadow flex-shrink-0 cursor-pointer active:scale-95 transition-transform" 
                onClick={() => handleBarberClick(barber)}
              >
                <div className="w-20 h-20 mx-auto relative mb-3">
                  <img alt={barber.name} className="w-full h-full object-cover rounded-2xl" src={barber.image} />
                  <div className="absolute -bottom-1 -right-1 bg-white px-1.5 py-0.5 rounded-lg shadow-sm border border-gray-100 flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[10px] text-orange-400 fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span className="text-[10px] font-bold text-text-main">{barber.rating}</span>
                  </div>
                </div>
                <p className="font-bold text-sm text-center text-text-main mb-0.5">{barber.name}</p>
                <p className="text-[11px] text-text-secondary text-center truncate px-2">{barber.title || barber.specialties?.[0]}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Upcoming */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-text-main">即将到来的预约</h3>
          </div>
          <div className="space-y-3">
            <div className="bg-surface rounded-3xl p-4 flex gap-4 items-center ios-shadow cursor-pointer active:bg-gray-50 transition-colors" onClick={() => currentUser ? onNavigate('check_in') : onNavigate('login')}>
              <div className="bg-primary/5 text-primary w-14 h-14 rounded-2xl flex flex-col items-center justify-center border border-primary/10">
                <span className="text-[10px] font-bold uppercase">详情</span>
                <span className="text-xl font-bold">view</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-text-main text-[15px]">查看我的预约</h4>
                <p className="text-[12px] text-text-secondary">{currentUser ? '点击进入个人中心' : '请先登录以查看'}</p>
              </div>
              <button className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-main text-text-secondary">
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
            
            {/* Promo Card */}
            <div 
                onClick={handleViewAll}
                className="relative h-28 rounded-3xl overflow-hidden group shadow-md cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="absolute inset-0 bg-cover bg-center transition-transform group-hover:scale-105 duration-700" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuD0HHH2Nimvtvc70RhElVP80yhZmFvZICzFH9LQzQCDTM4WODBUTXFyFxpccyObNjCRXxzGHpMpMfHT85BbqsKM9ojViYQJOLhramoHLEL5COFy45MgwM8kPgNGobcPqdSS2jXqTH8lVk9Co-YbbwVhFy47UhCjhoLXGl4sqpjpO-sTzBF66QvClbse2k6SHJ09HbhdSWrTCNecD4MXb_e1G70fbClzT96DWg1nceSNnEVy4hs6uGVADh0hUla6lMc9TV2CwqZHpwg')" }}></div>
              <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-transparent flex flex-col justify-center px-6">
                <p className="text-[10px] text-primary font-bold tracking-widest mb-1 uppercase">当前门店</p>
                <h4 className="font-bold text-[15px] text-text-main">中心旗舰店</h4>
                <p className="text-[11px] text-text-secondary">市中心理发路123号</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <BottomNav activeRoute="home" onNavigate={onNavigate} userRole="customer" />
    </Layout>
  );
};