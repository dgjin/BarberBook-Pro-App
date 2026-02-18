
import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Header } from '../components/Layout';
import { BottomNav } from '../components/BottomNav';
import { PageRoute, Appointment, User } from '../types';
import { supabase } from '../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  appointment?: Appointment | null;
  currentUser?: User | null;
  onUpdateUser?: (updates: Partial<User>) => void;
}

type ViewMode = 'overview' | 'all_history';

export const CheckIn: React.FC<Props> = ({ onNavigate, appointment, currentUser, onUpdateUser }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [ratedIds, setRatedIds] = useState<number[]>([]);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [waitTime, setWaitTime] = useState<number>(0);
  
  // Modals state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const [targetAppt, setTargetAppt] = useState<Appointment | null>(null);
  const [ratingData, setRatingData] = useState({ overall: 5, attitude: 5, skill: 5, comment: '' });
  const [editFormData, setEditFormData] = useState<Partial<User>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMyAppointments = useCallback(async () => {
    if (!currentUser) return;
    const { data } = await supabase.from('app_appointments').select('*').eq('customer_name', currentUser.name).order('id', { ascending: false });
    if (data) setMyAppointments(data);
    const { data: ratings } = await supabase.from('app_ratings').select('appointment_id').eq('customer_name', currentUser.name);
    if (ratings) setRatedIds(ratings.map((r: any) => Number(r.appointment_id)));
  }, [currentUser]);

  useEffect(() => {
    fetchMyAppointments();
    if (currentUser) {
      setEditFormData({
        name: currentUser.name,
        realName: currentUser.realName,
        phone: currentUser.phone,
        email: currentUser.email,
        avatar: currentUser.avatar
      });
    }
  }, [fetchMyAppointments, currentUser]);

  const activeAppts = React.useMemo(() => 
    myAppointments.filter(a => ['confirmed', 'pending', 'checked_in'].includes(a.status))
  , [myAppointments]);

  const historyAppts = React.useMemo(() => 
    myAppointments.filter(a => ['completed', 'cancelled'].includes(a.status))
  , [myAppointments]);

  const displayAppt = activeAppts.length > 0 ? activeAppts[0] : null;

  const fetchQueueData = useCallback(async () => {
    if (!displayAppt || !displayAppt.id) return;
    const { data } = await supabase.from('app_appointments').select('id').eq('barber_name', displayAppt.barber_name).eq('date_str', displayAppt.date_str).in('status', ['confirmed', 'pending', 'checked_in']).order('time_str', { ascending: true });
    if (data) {
        const index = data.findIndex(a => a.id === displayAppt.id);
        if (index !== -1) { setQueuePosition(index + 1); setWaitTime(index * 20); }
    }
  }, [displayAppt]);

  useEffect(() => { fetchQueueData(); }, [fetchQueueData]);

  const handleManualCheckIn = async (apptId: number) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('app_appointments').update({ status: 'checked_in' }).eq('id', apptId);
      if (error) throw error;
      await fetchMyAppointments();
    } catch (e) {
      alert("签到失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    if (!editFormData.name?.trim()) { alert("昵称不能为空"); return; }
    if (!editFormData.phone?.trim()) { alert("手机号不能为空"); return; }

    setIsSubmitting(true);
    try {
      const payload = {
        name: editFormData.name,
        real_name: editFormData.realName,
        phone: editFormData.phone,
        email: editFormData.email,
        avatar: editFormData.avatar
      };
      const { error } = await supabase.from('app_customers').update(payload).eq('id', currentUser.id);
      if (error) throw error;
      
      if (onUpdateUser) onUpdateUser(editFormData);
      setShowEditModal(false);
      alert("个人资料已更新");
    } catch (e) {
      alert("更新失败，请检查网络");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditFormData(prev => ({ ...prev, avatar: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const submitRating = async () => {
      if (!targetAppt || !currentUser) return;
      setIsSubmitting(true);
      try {
          const { error } = await supabase.from('app_ratings').insert({
              appointment_id: targetAppt.id!,
              barber_name: targetAppt.barber_name,
              customer_name: currentUser.name,
              rating: ratingData.overall,
              attitude_rating: ratingData.attitude,
              skill_rating: ratingData.skill,
              comment: ratingData.comment
          });
          if (error) throw error;
          setRatedIds(prev => [...prev, targetAppt.id!]);
          setShowRatingModal(false);
          alert("感谢您的评价！");
      } catch (e) { 
        console.error(e);
        alert("评价失败，请重试"); 
      } finally { setIsSubmitting(false); }
  };

  const RatingStars = ({ value, onChange, label, subLabel }: { value: number, onChange: (v: number) => void, label: string, subLabel: string }) => (
    <div className="flex flex-col gap-2">
        <div className="flex justify-between items-end px-1">
            <span className="text-[11px] font-black text-slate-800 tracking-tight">{label}</span>
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{subLabel}</span>
        </div>
        <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(star => (
                <button 
                    key={star} 
                    onClick={() => onChange(star)} 
                    className={`material-symbols-outlined text-2xl transition-all duration-200 active:scale-125 ${star <= value ? 'text-amber-400 fill-1' : 'text-slate-100 hover:text-slate-200'}`}
                >
                    star
                </button>
            ))}
        </div>
    </div>
  );

  const SettingsItem = ({ icon, label, onClick, color = 'text-slate-700', subLabel }: { icon: string, label: string, onClick: () => void, color?: string, subLabel?: string }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-50 shadow-sm active:scale-[0.98] transition-all">
        <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-slate-50 ${color.replace('text', 'bg').replace('700', '50')}`}>
                <span className={`material-symbols-outlined text-lg ${color}`}>{icon}</span>
            </div>
            <div className="text-left">
                <p className={`text-[13px] font-black ${color}`}>{label}</p>
                {subLabel && <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">{subLabel}</p>}
            </div>
        </div>
        <span className="material-symbols-outlined text-slate-300">chevron_right</span>
    </button>
  );

  const HistoryCard = ({ appt }: { appt: Appointment }) => (
    <div className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm animate-fade-in">
        <div className="flex items-center gap-4 min-w-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border border-slate-50 shrink-0 ${appt.status === 'completed' ? 'bg-green-50 text-green-500' : 'bg-slate-50 text-slate-300'}`}>
                <span className="material-symbols-outlined text-[22px]">{appt.status === 'completed' ? 'check_circle' : 'cancel'}</span>
            </div>
            <div className="min-w-0">
                <p className="text-[14px] font-black text-slate-900 truncate leading-none mb-1.5">{appt.barber_name}</p>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold font-mono tracking-tight">{appt.date_str}</span>
                    <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter truncate">{appt.service_name}</p>
                </div>
            </div>
        </div>
        <div className="flex flex-col items-end gap-2">
            <span className={`px-2 py-0.5 text-[8px] font-black rounded-lg uppercase ${appt.status === 'completed' ? 'text-green-500 bg-green-50' : 'text-slate-400 bg-slate-100'}`}>
                {appt.status === 'completed' ? 'DONE' : 'CANCELLED'}
            </span>
            {appt.status === 'completed' && (
                !ratedIds.includes(appt.id!) ? (
                    <button onClick={() => { setTargetAppt(appt); setShowRatingModal(true); }} className="px-3 py-1 bg-amber-400 text-white text-[9px] font-black rounded-lg shadow-sm active:scale-95 transition-all uppercase">评价</button>
                ) : (
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px] fill-1 text-amber-400">star</span>
                        已评价
                    </span>
                )
            )}
        </div>
    </div>
  );

  return (
    <Layout className="bg-[#F8FAFC]">
      <Header 
        title={viewMode === 'overview' ? "个人中心" : "全量历史记录"} 
        transparent 
        className="bg-[#F8FAFC]/90 ios-blur pt-10" 
        left={viewMode === 'all_history' ? (
            <button onClick={() => setViewMode('overview')} className="w-9 h-9 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-800">
                <span className="material-symbols-outlined text-xl">arrow_back</span>
            </button>
        ) : null}
      />

      <main className="flex-1 px-5 pb-32 overflow-y-auto no-scrollbar space-y-6 pt-2">
        {viewMode === 'overview' ? (
            <>
                {currentUser && (
                    <section className="animate-fade-in">
                        <div className="bg-white rounded-[28px] p-5 shadow-lg shadow-blue-100/20 border border-white flex items-center gap-4 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-slate-50 shadow-sm bg-slate-100 shrink-0 relative z-10">
                                <img src={currentUser.avatar || `https://ui-avatars.com/api/?name=${currentUser.name}`} alt="User" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0 relative z-10">
                                <h2 className="text-lg font-black text-slate-900 truncate leading-none">{currentUser.name}</h2>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="px-2 py-0.5 bg-blue-50 text-primary text-[9px] font-black rounded-md border border-blue-100 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px]">confirmation_number</span>
                                        {currentUser.vouchers || 0} 理发券
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold font-mono tracking-tight">{currentUser.phone}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* Current Service Status */}
                {displayAppt && (
                    <section className="animate-fade-in">
                        <div className="px-1 mb-3">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">活跃订单</h3>
                        </div>
                        <div className="bg-white rounded-[32px] shadow-lg p-5 border border-white">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-100 shrink-0 text-slate-400 bg-slate-50 flex items-center justify-center">
                                   <span className="material-symbols-outlined text-lg">person</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-sm font-black text-slate-900 leading-none">{displayAppt.barber_name}</h2>
                                    <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter truncate">{displayAppt.service_name}</p>
                                </div>
                                <span className={`px-2 py-1 text-[8px] font-black rounded-lg uppercase bg-blue-50 text-primary`}>
                                    {displayAppt.status === 'checked_in' ? '已到店' : '待执行'}
                                </span>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-2xl flex justify-center border border-slate-100 shadow-inner">
                                    <img alt="QR" className="w-32 h-32 mix-blend-multiply opacity-80" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=appt:${displayAppt.id}`} />
                                </div>
                                {displayAppt.status !== 'checked_in' && (
                                    <button 
                                        onClick={() => handleManualCheckIn(displayAppt.id!)} 
                                        disabled={isSubmitting}
                                        className="w-full bg-slate-900 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <>
                                            <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
                                            <span className="text-sm tracking-widest">立即到店签到</span>
                                        </>}
                                    </button>
                                )}
                            </div>
                            
                            <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                                <div className="text-center">
                                    <p className="text-[8px] text-slate-400 font-black uppercase mb-1 tracking-widest">排队位次</p>
                                    <p className="text-xl font-black text-slate-900 font-mono leading-none">{queuePosition || '-'}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[8px] text-slate-400 font-black uppercase mb-1 tracking-widest">预估等待</p>
                                    <div className="flex items-baseline justify-center gap-0.5">
                                        <p className="text-xl font-black text-primary font-mono leading-none">{waitTime}</p>
                                        <span className="text-[9px] font-black text-primary uppercase">min</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* Maintenance / Settings List */}
                <section className="space-y-3">
                    <div className="px-1 mb-1">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">账号维护</h3>
                    </div>
                    <SettingsItem 
                        icon="person_edit" 
                        label="编辑个人资料" 
                        subLabel="Edit Profile"
                        onClick={() => setShowEditModal(true)} 
                    />
                    <SettingsItem 
                        icon="receipt_long" 
                        label="历史预约记录" 
                        subLabel="History"
                        onClick={() => setViewMode('all_history')} 
                    />
                    <SettingsItem 
                        icon="logout" 
                        label="退出登录" 
                        subLabel="Logout"
                        color="text-red-500"
                        onClick={() => { if(confirm("确定要退出当前账号吗？")) onNavigate('launcher'); }} 
                    />
                </section>

                {/* Footprint Section (History Preview) */}
                {historyAppts.length > 0 && (
                    <section className="pb-8">
                        <div className="flex justify-between items-center px-1 mb-3">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">历史足迹</h3>
                            <button onClick={() => setViewMode('all_history')} className="text-[8px] font-black text-primary uppercase tracking-widest">查看全部</button>
                        </div>
                        <div className="space-y-2">
                            {historyAppts.slice(0, 3).map(appt => (
                                <HistoryCard key={appt.id} appt={appt} />
                            ))}
                        </div>
                    </section>
                )}
            </>
        ) : (
            <section className="space-y-3 pb-8">
                {historyAppts.length > 0 ? (
                    historyAppts.map(appt => (
                        <HistoryCard key={appt.id} appt={appt} />
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-4xl text-slate-200">event_busy</span>
                        </div>
                        <h4 className="text-slate-900 font-black text-sm uppercase tracking-widest">暂无历史记录</h4>
                        <p className="text-[10px] text-slate-400 mt-2 px-10 leading-relaxed font-bold uppercase">
                            您尚未完成过任何理发服务，赶快去预约心仪的理发师吧！
                        </p>
                        <button onClick={() => onNavigate('booking')} className="mt-8 px-8 py-3 bg-primary text-white font-black text-[10px] rounded-xl shadow-lg uppercase tracking-widest active:scale-95 transition-all">前往预约</button>
                    </div>
                )}
            </section>
        )}
      </main>

      {/* Profile Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-fade-in" onClick={() => !isSubmitting && setShowEditModal(false)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-[36px] p-8 shadow-2xl animate-[scale-in_0.3s_cubic-bezier(0.16,1,0.3,1)] max-h-[90vh] overflow-y-auto no-scrollbar border border-white/20">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">个人信息维护</h2>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2">Personal Maintenance</p>
                </div>
                <button onClick={() => setShowEditModal(false)} className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors">
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
            </div>

            <div className="flex flex-col items-center mb-8">
              <div className="relative group">
                <div className="w-24 h-24 rounded-[32px] overflow-hidden border-4 border-slate-50 shadow-xl bg-slate-100 flex items-center justify-center">
                  {editFormData.avatar ? (
                    <img src={editFormData.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-4xl text-slate-300">person</span>
                  )}
                </div>
                <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center cursor-pointer shadow-lg border-4 border-white hover:bg-blue-600 active:scale-90 transition-all">
                  <span className="material-symbols-outlined text-xl">photo_camera</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </label>
              </div>
            </div>

            <div className="space-y-5 mb-10">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] px-1">显示昵称 / NICKNAME</label>
                <input 
                  type="text" 
                  value={editFormData.name || ''} 
                  onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 text-slate-900 font-black focus:ring-4 focus:ring-primary/10 text-sm placeholder:text-slate-200"
                  placeholder="您的显示昵称"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] px-1">真实姓名 / REAL NAME</label>
                <input 
                  type="text" 
                  value={editFormData.realName || ''} 
                  onChange={e => setEditFormData({...editFormData, realName: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 text-slate-900 font-bold focus:ring-4 focus:ring-primary/10 text-sm placeholder:text-slate-200"
                  placeholder="仅用于内部预约核销"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] px-1">联系电话 / PHONE</label>
                <input 
                  type="tel" 
                  value={editFormData.phone || ''} 
                  onChange={e => setEditFormData({...editFormData, phone: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 text-slate-900 font-mono font-black focus:ring-4 focus:ring-primary/10 text-sm placeholder:text-slate-200"
                  placeholder="11位手机号"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] px-1">电子邮箱 / EMAIL</label>
                <input 
                  type="email" 
                  value={editFormData.email || ''} 
                  onChange={e => setEditFormData({...editFormData, email: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 text-slate-900 font-bold focus:ring-4 focus:ring-primary/10 text-sm placeholder:text-slate-200"
                  placeholder="接收预约提醒"
                />
              </div>
            </div>

            <button 
              onClick={handleUpdateProfile} 
              disabled={isSubmitting}
              className="w-full bg-slate-900 text-white font-black py-4.5 rounded-[22px] shadow-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-3"
            >
              {isSubmitting ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">verified</span>
                  <span>保存个人资料</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
      
      {showRatingModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-fade-in" onClick={() => !isSubmitting && setShowRatingModal(false)}></div>
              <div className="relative bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl animate-[scale-in_0.3s_cubic-bezier(0.16,1,0.3,1)] border border-white/20">
                  <div className="text-center mb-6">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">服务满意度评价</h2>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2">Rate Your Experience</p>
                  </div>
                  
                  <div className="space-y-6 mb-8">
                      <RatingStars 
                        label="总体满意度" 
                        subLabel="Overall" 
                        value={ratingData.overall} 
                        onChange={(v) => setRatingData({...ratingData, overall: v})} 
                      />
                      <RatingStars 
                        label="服务态度" 
                        subLabel="Attitude" 
                        value={ratingData.attitude} 
                        onChange={(v) => setRatingData({...ratingData, attitude: v})} 
                      />
                      <RatingStars 
                        label="技术水平" 
                        subLabel="Technical Skill" 
                        value={ratingData.skill} 
                        onChange={(v) => setRatingData({...ratingData, skill: v})} 
                      />

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">留言反馈 / COMMENTS</label>
                        <textarea 
                            value={ratingData.comment}
                            onChange={e => setRatingData({...ratingData, comment: e.target.value})}
                            placeholder="分享您的真实感受..."
                            className="w-full bg-slate-50 border-none rounded-2xl p-4 text-[13px] font-medium text-slate-900 focus:ring-4 focus:ring-primary/10 placeholder:text-slate-200 h-28 resize-none transition-all"
                        />
                      </div>
                  </div>

                  <div className="flex flex-col gap-3">
                      <button 
                        onClick={submitRating} 
                        disabled={isSubmitting} 
                        className="w-full bg-slate-900 text-white font-black py-4.5 rounded-[22px] shadow-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-lg">verified</span>
                                <span>提交真实评价</span>
                            </>
                        )}
                      </button>
                      <button 
                        onClick={() => setShowRatingModal(false)}
                        disabled={isSubmitting}
                        className="w-full py-3 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-colors"
                      >
                        暂时跳过
                      </button>
                  </div>
              </div>
          </div>
      )}

      <BottomNav activeRoute="check_in" onNavigate={onNavigate} userRole="customer" />
    </Layout>
  );
};
