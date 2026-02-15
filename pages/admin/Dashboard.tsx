import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { BottomNav } from '../../components/BottomNav';
import { PageRoute, Barber } from '../../types';
import { supabase } from '../../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

export const Dashboard: React.FC<Props> = ({ onNavigate }) => {
  const [selectedBarberName, setSelectedBarberName] = useState<string>('');
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch Barbers & Subscribe to Realtime Updates
  useEffect(() => {
    const fetchBarbers = async () => {
        const { data } = await supabase.from('app_barbers').select('*').order('id');
        if (data && data.length > 0) {
            setBarbers(data as unknown as Barber[]);
            // If no barber selected, select first one
            setSelectedBarberName(prev => {
                const exists = data.find((b: any) => b.name === prev);
                return exists ? prev : data[0].name;
            });
        }
        setLoading(false);
    };

    fetchBarbers();

    const channel = supabase.channel('dashboard_barber_updates')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'app_barbers' }, 
            (payload) => {
                fetchBarbers(); 
            }
        )
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Mock Days Data (Static for now, but could be dynamic later)
  const days = [
    { d: '周一', date: '23', n: 23, s: 'busy' },
    { d: '周二', date: '24', n: 24, s: 'free' },
    { d: '周三', date: '25', n: 25, s: 'full' },
    { d: '周四', date: '26', n: 26, s: 'free' },
    { d: '周五', date: '27', n: 27, s: 'busy' },
    { d: '周六', date: '28', n: 28, s: 'full' },
    { d: '周日', date: '29', n: 29, s: 'free' }
  ];

  const currentDay = days[selectedDayIndex];
  const currentBarberObj = barbers.find(b => b.name === selectedBarberName) || barbers[0];

  return (
    <Layout>
      <header className="pt-14 pb-4 px-6 flex justify-between items-end sticky top-0 bg-white/85 ios-blur z-20 border-b border-gray-100">
        <div>
          <p className="text-[10px] text-primary font-bold tracking-[0.1em] uppercase">BARBERBOOK PRO</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">本周预约看板</h1>
        </div>
        <button className="w-10 h-10 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-slate-600 active:bg-slate-50">
          <span className="material-symbols-outlined text-2xl">notifications</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-32">
        {/* Barber Selector */}
        <section className="mt-6 mb-8">
          <div className="px-6 flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-500">选择理发师</h3>
            <span 
              onClick={() => setShowDetailModal(true)} 
              className="text-xs text-primary font-medium cursor-pointer hover:underline"
            >
              查看详情
            </span>
          </div>
          
          {loading ? (
             <div className="px-6 text-xs text-slate-400">加载理发师数据...</div>
          ) : (
            <div className="flex gap-5 overflow-x-auto px-6 pb-2 hide-scrollbar">
                {barbers.map((barber) => {
                const isSelected = selectedBarberName === barber.name;
                return (
                    <div 
                    key={barber.id} 
                    onClick={() => setSelectedBarberName(barber.name)}
                    className={`flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer transition-all ${isSelected ? '' : 'opacity-60 scale-95'}`}
                    >
                    <div className={`relative w-16 h-16 rounded-full p-0.5 transition-all ${isSelected ? 'border-2 border-primary shadow-md shadow-blue-100' : 'border border-transparent'}`}>
                        <img 
                        alt={barber.name} 
                        className={`w-full h-full rounded-full object-cover transition-all ${isSelected ? '' : 'grayscale-[20%]'}`}
                        src={barber.image}
                        />
                        {/* Status Indicator */}
                        <div className={`absolute top-0 right-0 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center
                            ${barber.status === 'active' ? 'bg-status-ready' : barber.status === 'busy' ? 'bg-amber-400' : 'bg-slate-400'}
                        `}>
                            {isSelected && <span className="material-symbols-outlined text-[8px] text-white font-bold">check</span>}
                        </div>
                    </div>
                    <span className={`text-xs ${isSelected ? 'font-bold text-slate-900' : 'font-medium text-slate-500'}`}>{barber.name}</span>
                    </div>
                );
                })}
            </div>
          )}
        </section>

        {/* 7 Day View */}
        <section className="px-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-500">未来 7 天饱和度</h3>
            <div className="flex gap-3 text-[10px] font-medium text-slate-400">
              <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-status-ready"></span> 空闲</div>
              <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 繁忙</div>
              <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-status-busy"></span> 已满</div>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day, i) => {
              const isSelected = selectedDayIndex === i;
              return (
                <button 
                  key={i} 
                  onClick={() => setSelectedDayIndex(i)}
                  className={`flex flex-col items-center py-3 rounded-2xl transition-all duration-300
                    ${isSelected 
                      ? 'ring-2 ring-primary bg-white shadow-lg scale-110 z-10 -translate-y-1' 
                      : 'bg-white border border-gray-100 shadow-sm hover:bg-gray-50'
                    }`}
                >
                  <span className={`text-[10px] font-medium mb-1 ${isSelected ? 'text-primary' : 'text-slate-400'}`}>{day.d}</span>
                  <span className={`text-sm font-bold mb-3 ${isSelected ? 'text-slate-900' : 'text-slate-500'}`}>{day.n}</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${day.s === 'free' ? 'bg-status-ready' : day.s === 'busy' ? 'bg-amber-400' : 'bg-status-busy'}`}></div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Today's List */}
        <section className="px-6">
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-50 transition-all duration-500">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h4 className="font-bold text-slate-900 text-lg">10月{currentDay.date}日 ({currentDay.d})</h4>
                <p className="text-sm text-slate-400">
                  {selectedBarberName} • 已预约 {currentDay.s === 'full' ? '15' : currentDay.s === 'busy' ? '12' : '6'} / 15 时段
                </p>
              </div>
              <div className={`px-3 py-1 border rounded-full text-[11px] font-bold
                ${currentDay.s === 'free' ? 'bg-green-50 text-status-ready border-green-100' : 
                  currentDay.s === 'busy' ? 'bg-amber-50 text-amber-500 border-amber-100' : 
                  'bg-red-50 text-status-busy border-red-100'}
              `}>
                状态：{currentDay.s === 'free' ? '空闲' : currentDay.s === 'busy' ? '繁忙' : '已满'}
              </div>
            </div>
            
            <div className="space-y-4">
              {currentDay.s !== 'full' && (
                <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-primary/20 bg-green-50/50">
                  <span className="text-xs font-semibold text-primary w-12">10:30</span>
                  <div className="h-8 w-1 bg-status-ready rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-primary">可预约</p>
                    <p className="text-[10px] text-primary/60">当前时段空闲</p>
                  </div>
                  <button className="bg-primary text-white px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors">预留</button>
                </div>
              )}
              
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50/50 border border-gray-100">
                <span className="text-xs font-semibold text-slate-400 w-12">09:00</span>
                <div className="h-8 w-1 bg-status-busy rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">王先生 - 尊享理发</p>
                  <p className="text-[10px] text-slate-400">耗时 45 分钟</p>
                </div>
                <span className="material-symbols-outlined text-slate-300 text-xl">lock</span>
              </div>

               {currentDay.s !== 'free' && (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50/50 border border-gray-100">
                  <span className="text-xs font-semibold text-slate-400 w-12">14:00</span>
                  <div className="h-8 w-1 bg-status-busy rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">李女士 - 染烫护理</p>
                    <p className="text-[10px] text-slate-400">耗时 120 分钟</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-300 text-xl">lock</span>
                </div>
               )}
            </div>
          </div>
        </section>
      </main>

      {/* Barber Detail Modal */}
      {showDetailModal && currentBarberObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" 
                onClick={() => setShowDetailModal(false)}
            ></div>
            <div className="relative bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl animate-[scale-in_0.2s_ease-out]">
                <div className="flex flex-col items-center">
                    <div className="relative">
                        <img src={currentBarberObj.image} className="w-24 h-24 rounded-full object-cover mb-4 shadow-lg border-4 border-white" />
                        <span className={`absolute bottom-4 right-0 w-6 h-6 border-4 border-white rounded-full
                             ${currentBarberObj.status === 'active' ? 'bg-status-ready' : currentBarberObj.status === 'busy' ? 'bg-amber-400' : 'bg-slate-400'}
                        `}></span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">{currentBarberObj.name}</h2>
                    <p className="text-sm text-slate-500 mb-6 font-medium">{currentBarberObj.title || '理发师'}</p>
                    
                    <div className="grid grid-cols-2 gap-4 w-full mb-6">
                        <div className="bg-slate-50 p-3 rounded-2xl text-center border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">今日预约</p>
                            <p className="text-xl font-bold text-slate-900">8</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-2xl text-center border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">综合评分</p>
                            <div className="flex items-center justify-center gap-1">
                                <span className="text-xl font-bold text-primary">{currentBarberObj.rating}</span>
                                <span className="material-symbols-outlined text-amber-400 text-sm">star</span>
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={() => { setShowDetailModal(false); onNavigate('admin_management'); }} 
                        className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-2xl mb-3 shadow-lg active:scale-95 transition-all"
                    >
                        管理档案
                    </button>
                    <button 
                        onClick={() => setShowDetailModal(false)} 
                        className="w-full text-slate-400 font-bold py-2 hover:text-slate-600 transition-colors"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
      )}

      <BottomNav activeRoute="admin_dashboard" onNavigate={onNavigate} userRole="admin" />
    </Layout>
  );
};