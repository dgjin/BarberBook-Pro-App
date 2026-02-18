
import React, { useEffect, useState, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { BottomNav } from '../components/BottomNav';
import { PageRoute, Barber, User, ServiceItem, Rating } from '../types';
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
  const [waitTime, setWaitTime] = useState<number>(0);
  const [loadingQueue, setLoadingQueue] = useState(true);

  // Detail Modal State
  const [detailBarber, setDetailBarber] = useState<Barber | null>(null);
  const [barberServices, setBarberServices] = useState<ServiceItem[]>([]);
  const [barberReviews, setBarberReviews] = useState<Rating[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchQueueData = async () => {
      try {
          const d = new Date();
          const todayStr = `${d.getMonth() + 1}月${d.getDate()}日`;
          const { data } = await supabase.from('app_appointments').select('id').eq('date_str', todayStr).eq('status', 'checked_in');
          if (data) {
              setWaitTime(data.length * 15); 
          }
      } catch (e) { console.error(e); } finally { setLoadingQueue(false); }
  };

  useEffect(() => {
    const fetchBarbers = async () => {
      try {
        const { data } = await supabase.from('app_barbers').select('*').order('rating', { ascending: false }).limit(6);
        if (data) setBarbers(data as unknown as Barber[]);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchBarbers();
    fetchQueueData();
  }, []);

  const fetchBarberDetails = useCallback(async (barber: Barber) => {
    setLoadingDetails(true);
    try {
        // Fetch Services
        const { data: svcs } = await supabase.from('app_services').select('*').order('price', { ascending: true });
        if (svcs) setBarberServices(svcs);

        // Fetch Recent Ratings for this barber
        const { data: rtngs } = await supabase.from('app_ratings').select('*').eq('barber_name', barber.name).order('created_at', { ascending: false }).limit(3);
        if (rtngs) setBarberReviews(rtngs as Rating[]);
    } catch (e) {
        console.error(e);
    } finally {
        setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
      if (detailBarber) {
          fetchBarberDetails(detailBarber);
      }
  }, [detailBarber, fetchBarberDetails]);

  const renderStars = (rating: number, size: string = 'text-[11px]') => {
    const stars = [];
    const floorRating = Math.floor(rating);
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={`material-symbols-outlined ${size} ${i <= floorRating ? 'text-amber-400 fill-1' : 'text-slate-200'}`}>star</span>
      );
    }
    return stars;
  };

  const handleBookNow = () => {
      if (detailBarber && onBarberSelect) {
          onBarberSelect(detailBarber);
          onNavigate('booking');
      }
  };

  return (
    <Layout className="bg-[#F8FAFC]">
      <header className="pt-10 pb-3 px-6 flex justify-between items-center sticky top-0 bg-[#F8FAFC]/90 ios-blur z-30">
        <div className="animate-fade-in">
          <p className="text-[8px] text-primary font-black uppercase tracking-[0.2em] mb-0.5">{currentUser ? 'GOOD MORNING' : 'WELCOME TO'}</p>
          <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">{currentUser ? currentUser.name : 'BarberBook Pro'}</h1>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setShowQuickHelp(true)} className="w-9 h-9 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-all">
                <span className="material-symbols-outlined text-[18px]">help</span>
            </button>
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-white shadow-sm bg-slate-100 cursor-pointer active:scale-90 transition-all" onClick={() => currentUser ? onNavigate('check_in') : onNavigate('login')}>
                {currentUser?.avatar ? <img src={currentUser.avatar} className="w-full h-full object-cover" alt="User"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><span className="material-symbols-outlined text-[18px]">person</span></div>}
            </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-24 space-y-6 no-scrollbar pt-1">
        {/* Compressed Queue Card */}
        <section className="animate-fade-in">
          <div className="bg-white rounded-[28px] p-5 shadow-lg shadow-blue-100/30 border border-white relative overflow-hidden">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${loadingQueue ? 'bg-slate-200' : 'bg-primary animate-pulse'}`}></span>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">排队看板</span>
              </div>
              <button onClick={() => onNavigate('monitor')} className="text-[8px] font-black text-primary uppercase tracking-tighter bg-blue-50 px-2 py-0.5 rounded-md">查看大屏</button>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-baseline gap-0.5 leading-none">
                  <span className="text-4xl font-black text-slate-900 tracking-tighter">{loadingQueue ? '--' : waitTime}</span>
                  <span className="text-[10px] font-black text-slate-300 uppercase">min</span>
                </div>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-tighter">预计等待时长</p>
              </div>
              <button onClick={() => onNavigate('booking')} className="bg-slate-900 text-white w-12 h-12 rounded-xl flex items-center justify-center shadow-md active:scale-95 transition-all">
                <span className="material-symbols-outlined text-xl">bolt</span>
              </button>
            </div>
          </div>
        </section>

        {/* Compact Barber List */}
        <section>
          <div className="flex justify-between items-end mb-3 px-1">
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight leading-none">特邀发型师</h3>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Top Stylists</p>
            </div>
            <button onClick={() => onNavigate('booking')} className="text-primary text-[9px] font-black uppercase tracking-widest px-1 py-1 transition-all active:opacity-60">全部</button>
          </div>
          <div className="flex gap-3.5 overflow-x-auto pb-3 -mx-6 px-6 hide-scrollbar snap-x">
            {barbers.map((barber) => (
              <div 
                key={barber.id} 
                className="snap-start min-w-[135px] bg-white rounded-[24px] p-1.5 pb-3 border border-white shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group" 
                onClick={() => setDetailBarber(barber)}
              >
                <div className="relative aspect-[4/5] mb-3 rounded-[20px] overflow-hidden">
                  <img className="w-full h-full object-cover transition-transform group-hover:scale-105" src={barber.image} alt={barber.name}/>
                  {/* Rating Badge */}
                  <div className="absolute top-1.5 right-1.5 bg-white/95 backdrop-blur-md px-1 py-0.5 rounded-lg flex items-center gap-0.5 shadow-sm border border-white/50">
                    <span className="material-symbols-outlined text-[8px] text-orange-400 fill-1">star</span>
                    <span className="text-[9px] font-black text-slate-900">{barber.rating}</span>
                  </div>
                  {/* Status Indicator */}
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/30 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/10">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                        barber.status === 'active' ? 'bg-green-400 shadow-[0_0_5px_#4ade80]' : 
                        barber.status === 'busy' ? 'bg-amber-400 shadow-[0_0_5px_#fbbf24]' : 
                        'bg-slate-400'
                    }`}></span>
                    <span className="text-[7px] font-black text-white uppercase tracking-tighter">
                        {barber.status === 'active' ? '在线' : barber.status === 'busy' ? '忙碌' : '休息'}
                    </span>
                  </div>
                </div>
                <div className="px-1 text-center">
                    <p className="font-bold text-[13px] text-slate-900 truncate mb-0.5">{barber.name}</p>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter truncate mb-1.5">{barber.title}</p>
                    <div className="flex justify-center gap-0.5 opacity-80">
                        {renderStars(barber.rating)}
                    </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tighter Explore Grid */}
        <section className="pb-2">
          <div className="px-1 mb-3">
            <h3 className="text-sm font-black text-slate-900 tracking-tight leading-none">核心服务</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-white flex gap-3 items-center active:scale-95 transition-all cursor-pointer" onClick={() => onNavigate('check_in')}>
              <div className="w-8 h-8 bg-blue-50 text-primary rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[18px]">confirmation_number</span></div>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 text-[13px] truncate">资产中心</h4>
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">My Vouchers</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-white flex gap-3 items-center active:scale-95 transition-all cursor-pointer" onClick={() => setShowQuickHelp(true)}>
              <div className="w-8 h-8 bg-amber-50 text-amber-500 rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[18px]">lightbulb</span></div>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 text-[13px] truncate">流程指南</h4>
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Usage Guide</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Barber Detail Modal */}
      {detailBarber && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
              <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md animate-fade-in" onClick={() => setDetailBarber(null)}></div>
              <div className="relative bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] shadow-2xl flex flex-col max-h-[92vh] animate-[slide-up_0.4s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden border border-white/20">
                  {/* Hero Image Section */}
                  <div className="relative h-64 flex-shrink-0">
                      <img src={detailBarber.image} className="w-full h-full object-cover" alt={detailBarber.name} />
                      <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent"></div>
                      <button onClick={() => setDetailBarber(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-white/40 transition-all">
                          <span className="material-symbols-outlined">close</span>
                      </button>
                      
                      {/* Name Plate */}
                      <div className="absolute bottom-4 left-8">
                          <h2 className="text-3xl font-black text-slate-900 tracking-tighter drop-shadow-sm">{detailBarber.name}</h2>
                          <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">{detailBarber.title}</p>
                      </div>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto no-scrollbar px-8 pb-32 pt-2 space-y-8">
                      {/* Stats Row */}
                      <div className="grid grid-cols-3 gap-3">
                          <div className="bg-slate-50 p-4 rounded-3xl text-center border border-slate-100">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Rating</p>
                              <p className="text-lg font-black text-slate-900 leading-none">{detailBarber.rating}</p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-3xl text-center border border-slate-100">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Exp</p>
                              <p className="text-lg font-black text-slate-900 leading-none">{detailBarber.experience || 5}<span className="text-[9px] ml-0.5">y+</span></p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-3xl text-center border border-slate-100">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Served</p>
                              <p className="text-lg font-black text-slate-900 leading-none">{detailBarber.service_count || 1200}<span className="text-[9px] ml-0.5">+</span></p>
                          </div>
                      </div>

                      {/* Bio Section */}
                      <div className="space-y-3">
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest leading-none">发型师简介</h3>
                          <p className="text-sm text-slate-500 leading-relaxed font-medium">
                              {detailBarber.bio || `${detailBarber.name} 是一位专注于${detailBarber.specialties?.join('、') || '发型设计'}的资深专家，拥有精湛的技术和敏锐的时尚洞察力。`}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                              {detailBarber.specialties?.map((tag, idx) => (
                                  <span key={idx} className="px-3 py-1 bg-blue-50 text-primary text-[9px] font-black rounded-full border border-blue-100 uppercase tracking-tighter">#{tag}</span>
                              ))}
                          </div>
                      </div>

                      {/* Services Preview */}
                      <div className="space-y-4">
                          <div className="flex justify-between items-end">
                              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest leading-none">提供的服务</h3>
                              <span className="text-[9px] font-black text-slate-300">EST. PRICE</span>
                          </div>
                          <div className="space-y-2">
                              {loadingDetails ? (
                                  <div className="py-4 space-y-2">
                                      {[1,2].map(i => <div key={i} className="h-14 bg-slate-50 rounded-2xl animate-pulse"></div>)}
                                  </div>
                              ) : barberServices.slice(0, 3).map(svc => (
                                  <div key={svc.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
                                      <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center">
                                              <span className="material-symbols-outlined text-lg">{svc.icon}</span>
                                          </div>
                                          <div>
                                              <p className="text-[13px] font-bold text-slate-900 leading-none mb-1">{svc.name}</p>
                                              <p className="text-[9px] text-slate-400 font-bold uppercase">{svc.duration}m Duration</p>
                                          </div>
                                      </div>
                                      <span className="text-sm font-black text-slate-900">¥{svc.price}</span>
                                  </div>
                              ))}
                          </div>
                      </div>

                      {/* Reviews Preview */}
                      <div className="space-y-4">
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest leading-none">客户口碑</h3>
                          <div className="space-y-3">
                              {loadingDetails ? (
                                  <div className="h-20 bg-slate-50 rounded-2xl animate-pulse"></div>
                              ) : barberReviews.length > 0 ? (
                                  barberReviews.map(review => (
                                      <div key={review.id} className="bg-slate-50/50 p-4 rounded-[28px] border border-slate-50">
                                          <div className="flex justify-between items-start mb-2">
                                              <div className="flex items-center gap-2">
                                                  <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden">
                                                      <img src={`https://ui-avatars.com/api/?name=${review.customer_name}&background=random`} alt="user" />
                                                  </div>
                                                  <span className="text-[11px] font-black text-slate-900">{review.customer_name}</span>
                                              </div>
                                              <div className="flex gap-0.5">
                                                  {renderStars(review.rating, 'text-[10px]')}
                                              </div>
                                          </div>
                                          <p className="text-[11px] text-slate-500 font-medium leading-relaxed italic">
                                              "{review.comment || '服务非常专业，发型设计完全符合我的心意！'}"
                                          </p>
                                      </div>
                                  ))
                              ) : (
                                  <p className="text-[10px] text-slate-300 font-black uppercase text-center py-4">暂无客户评价</p>
                              )}
                          </div>
                      </div>
                  </div>

                  {/* Floating Action */}
                  <div className="absolute bottom-0 left-0 right-0 p-8 bg-white/80 ios-blur border-t border-slate-100 flex gap-4">
                      <button 
                        onClick={() => setDetailBarber(null)}
                        className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-colors"
                      >
                          <span className="material-symbols-outlined">chat_bubble</span>
                      </button>
                      <button 
                        onClick={handleBookNow}
                        className="flex-1 h-14 bg-slate-900 text-white font-black rounded-2xl shadow-xl shadow-slate-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                      >
                          <span className="text-sm tracking-widest uppercase">立即预约</span>
                          <span className="material-symbols-outlined text-xl">arrow_forward</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Help Modal */}
      {showQuickHelp && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md transition-opacity" onClick={() => setShowQuickHelp(false)}></div>
            <div className="relative bg-white w-full max-w-xs rounded-[28px] p-5 shadow-2xl animate-[scale-in_0.3s_cubic-bezier(0.16,1,0.3,1)] border border-white/20">
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-base font-black text-slate-900 tracking-tight leading-none">使用攻略</h2>
                    <button onClick={() => setShowQuickHelp(false)} className="w-7 h-7 flex items-center justify-center bg-slate-100 rounded-lg text-slate-500"><span className="material-symbols-outlined text-base">close</span></button>
                </div>
                <div className="space-y-4 mb-6">
                    <div className="flex gap-3">
                        <div className="w-6 h-6 bg-primary/10 text-primary flex items-center justify-center rounded-md font-black text-[10px] shrink-0">1</div>
                        <p className="text-[11px] text-slate-500 leading-tight">挑选专家，预留您心仪的服务时段。</p>
                    </div>
                    <div className="flex gap-3">
                        <div className="w-6 h-6 bg-primary/10 text-primary flex items-center justify-center rounded-md font-black text-[10px] shrink-0">2</div>
                        <p className="text-[11px] text-slate-500 leading-tight">到店出示预约码签到，激活排队状态。</p>
                    </div>
                    <div className="flex gap-3">
                        <div className="w-6 h-6 bg-primary/10 text-primary flex items-center justify-center rounded-md font-black text-[10px] shrink-0">3</div>
                        <p className="text-[11px] text-slate-500 leading-tight">享受服务，完工后理发券将自动核销。</p>
                    </div>
                </div>
                <button onClick={() => setShowQuickHelp(false)} className="w-full bg-slate-900 text-white font-black py-3 rounded-xl shadow-lg active:scale-95 transition-all text-xs tracking-widest">进入系统</button>
            </div>
        </div>
      )}
      
      <BottomNav activeRoute="home" onNavigate={onNavigate} userRole="customer" />
    </Layout>
  );
};
