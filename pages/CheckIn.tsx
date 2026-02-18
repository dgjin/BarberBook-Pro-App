
import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Header } from '../components/Layout';
import { BottomNav } from '../components/BottomNav';
import { PageRoute, Appointment, User, Rating } from '../types';
import { supabase } from '../services/supabase';

interface Props {
  onNavigate: (route: PageRoute) => void;
  appointment?: Appointment | null;
  currentUser?: User | null;
  onUpdateUser?: (updates: Partial<User>) => void;
}

const hashPassword = async (pwd: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pwd);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const CheckIn: React.FC<Props> = ({ onNavigate, appointment, currentUser, onUpdateUser }) => {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [walletStatus, setWalletStatus] = useState<'idle' | 'added'>('idle');
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [ratedAppointmentIds, setRatedAppointmentIds] = useState<number[]>([]);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [waitTime, setWaitTime] = useState<number>(0);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRealName, setEditRealName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const displayAppt = React.useMemo(() => {
    if (appointment?.id) {
        const fresh = myAppointments.find(a => a.id === appointment.id);
        if (fresh) return fresh;
        return appointment; 
    }
    return myAppointments.length > 0 ? myAppointments[0] : appointment || null;
  }, [appointment, myAppointments]);

  const fetchMyAppointments = useCallback(async () => {
    if (!currentUser) return;
    const { data } = await supabase.from('app_appointments').select('*').eq('customer_name', currentUser.name).order('id', { ascending: false });
    if (data) setMyAppointments(data);
    const { data: ratingsData } = await supabase.from('app_ratings').select('appointment_id').eq('customer_name', currentUser.name);
    if (ratingsData) setRatedAppointmentIds(ratingsData.map((r: any) => r.appointment_id));
    
    const { data: userData } = await supabase.from('app_customers').select('vouchers').eq('id', currentUser.id).single();
    if (userData && onUpdateUser) onUpdateUser({ vouchers: userData.vouchers });
  }, [currentUser, onUpdateUser]);

  useEffect(() => {
    fetchMyAppointments();
    const channel = supabase.channel('my_appointments_updates').on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments', filter: `customer_name=eq.${currentUser?.name}` }, () => { fetchMyAppointments(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser, fetchMyAppointments]);

  useEffect(() => {
      if (showEditProfile && currentUser) {
          setEditName(currentUser.name);
          setEditRealName(currentUser.realName || '');
          setEditPhone(currentUser.phone || '');
          setEditEmail(currentUser.email || '');
          setEditAvatar(currentUser.avatar || '');
          setNewPassword('');
          setConfirmNewPassword('');
      }
  }, [showEditProfile, currentUser]);

  const fetchQueueData = useCallback(async () => {
    if (!displayAppt || !displayAppt.id || displayAppt.status === 'completed' || displayAppt.status === 'cancelled') { setQueuePosition(0); setWaitTime(0); return; }
    const { data } = await supabase.from('app_appointments').select('id, time_str').eq('barber_name', displayAppt.barber_name).eq('date_str', displayAppt.date_str).in('status', ['confirmed', 'pending', 'checked_in']).order('time_str', { ascending: true });
    if (data) {
        const index = data.findIndex(a => a.id === displayAppt.id);
        if (index !== -1) { setQueuePosition(index + 1); setWaitTime(index * 20); }
    }
  }, [displayAppt]);

  useEffect(() => {
      fetchQueueData();
      const channel = supabase.channel('queue_updates').on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, () => { fetchQueueData(); }).subscribe();
      return () => { supabase.removeChannel(channel); };
  }, [displayAppt, fetchQueueData]);

  const handleSaveProfile = async () => {
      if (!currentUser) return;
      setIsSavingProfile(true);
      try {
          const updates: any = { name: editName, real_name: editRealName, phone: editPhone, email: editEmail, avatar: editAvatar };
          if (newPassword) { updates.password_hash = await hashPassword(newPassword); }
          await supabase.from('app_customers').update(updates).eq('id', currentUser.id);
          if (onUpdateUser) onUpdateUser({ name: editName, realName: editRealName, phone: editPhone, email: editEmail, avatar: editAvatar });
          setShowEditProfile(false);
      } catch (err: any) { alert("保存失败"); } finally { setIsSavingProfile(false); }
  };
  
  const handleManualCheckIn = async () => {
      if (!displayAppt?.id) return;
      setIsCheckingIn(true);
      try {
          await supabase.from('app_appointments').update({ status: 'checked_in' }).eq('id', displayAppt.id);
          alert('签到成功！');
      } catch (e: any) { alert('签到失败'); } finally { setIsCheckingIn(false); fetchMyAppointments(); }
  };

  const handleCancelAppointment = async () => {
    if (!displayAppt?.id || !currentUser) return;
    if (!window.confirm("确定要取消预约吗？")) return;

    setIsCancelling(true);
    try {
        let logDetails = `客户 ${currentUser.name} 取消了预约 ID: ${displayAppt.id}`;
        
        // 1. Rollback Voucher if used (to Customer)
        if (displayAppt.used_voucher) {
            const currentVouchers = currentUser.vouchers || 0;
            const newVouchersCount = currentVouchers + 1;
            
            await supabase.from('app_customers').update({ vouchers: newVouchersCount }).eq('id', currentUser.id);
            if (onUpdateUser) onUpdateUser({ vouchers: newVouchersCount });
            
            logDetails += `。由于该预约使用了理发券，系统已自动退回 1 张理发券至账户余额。`;

            // 2. Decrement Barber's Revenue if it was already marked as revenue
            // (Note: Revenue is added at completion, so if a COMPLETED order is cancelled, decrement)
            if (displayAppt.status === 'completed') {
                const { data: barberData } = await supabase
                    .from('app_barbers')
                    .select('voucher_revenue')
                    .eq('name', displayAppt.barber_name)
                    .single();
                
                if (barberData) {
                    const newRev = Math.max(0, (barberData.voucher_revenue || 0) - 1);
                    await supabase
                        .from('app_barbers')
                        .update({ voucher_revenue: newRev })
                        .eq('name', displayAppt.barber_name);
                    logDetails += ` 且该预约已标记过完成，已同步扣减理发师 ${displayAppt.barber_name} 的业绩。`;
                }
            }
        }

        // 3. Update Appointment Status
        const { error } = await supabase.from('app_appointments').update({ 
            status: 'cancelled',
            used_voucher: false 
        }).eq('id', displayAppt.id);

        if (error) throw error;

        // 4. Log the action for Admin Audit
        await supabase.from('app_logs').insert({
            user: currentUser.name,
            role: 'customer',
            action: '取消预约',
            details: logDetails,
            type: displayAppt.used_voucher ? 'warning' : 'info',
            avatar: currentUser.avatar || ''
        });

        await fetchMyAppointments();
        alert(displayAppt.used_voucher ? "预约已取消，理发券已自动退回账户。" : "预约已取消。");

    } catch (e: any) { 
        console.error("Cancellation error:", e);
        alert('取消失败'); 
    } finally { 
        setIsCancelling(false); 
    }
  };

  const helpTopics = [
    { title: '如何使用理发券？', content: '预约成功后，理发师在完成服务时会自动优先扣除您账户中的理发券。您可以在个人中心查看余额。', icon: 'confirmation_number' },
    { title: '取消预约会退券吗？', content: '是的。如果您取消了一个使用了理发券的有效预约，该券将自动退回到您的账户余额中。', icon: 'undo' },
    { title: '预计等待时间准确吗？', content: '预计时间基于当前排队人数和历史平均服务时长计算，仅供参考。建议根据监控大屏动态提前到店。', icon: 'schedule' },
    { title: '如何修改手机号？', content: '目前请联系店内管理员或理发师为您在后台手动修改，以确保您的会员权益正确同步。', icon: 'contact_support' }
  ];

  return (
    <Layout className="bg-gradient-to-br from-[#F0F7FF] to-white">
      <Header title={currentUser ? "个人中心" : "访客模式"} transparent left={<button onClick={() => onNavigate('home')} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 shadow-sm border border-white"><span className="material-symbols-outlined text-slate-700 text-lg">home</span></button>} />

      <main className="flex-1 px-5 flex flex-col items-center pb-32 overflow-y-auto">
        {currentUser ? (
            <div className="w-full bg-white rounded-[32px] p-6 mb-6 shadow-sm border border-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-9xl text-primary">person</span></div>
                <div className="flex items-center gap-5 relative z-10">
                    <div className="relative">
                        <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg overflow-hidden bg-slate-100">
                            <img src={currentUser.avatar || "https://via.placeholder.com/150"} alt="User" className="w-full h-full object-cover" />
                        </div>
                        <button onClick={() => setShowEditProfile(true)} className="absolute bottom-0 right-0 w-7 h-7 bg-slate-900 text-white rounded-full flex items-center justify-center border-2 border-white"><span className="material-symbols-outlined text-[14px]">edit</span></button>
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-bold text-slate-900">{currentUser.name}</h2>
                        <p className="text-sm text-slate-500 font-medium mb-2">{currentUser.phone}</p>
                        <div className="flex gap-2">
                             <span className="px-3 py-1 bg-amber-100 text-amber-700 text-[11px] font-black rounded-lg flex items-center gap-1.5 shadow-sm">
                                <span className="material-symbols-outlined text-[14px]">confirmation_number</span>
                                理发券：{currentUser.vouchers || 0} 张
                             </span>
                        </div>
                    </div>
                </div>
            </div>
        ) : null}

        <div className="w-full mb-6">
            <button 
                onClick={() => setShowHelpCenter(true)}
                className="w-full bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm border border-white active:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center">
                        <span className="material-symbols-outlined">help_center</span>
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-bold text-slate-900">帮助中心</p>
                        <p className="text-[10px] text-slate-400">常见问题、操作指引</p>
                    </div>
                </div>
                <span className="material-symbols-outlined text-slate-300">chevron_right</span>
            </button>
        </div>

        {currentUser && displayAppt ? (
            <>
                <h3 className="w-full text-left text-sm font-bold text-slate-900 mb-3 px-1">当前预约凭证</h3>
                <div className={`w-full bg-white rounded-[32px] shadow-xl p-6 mb-6 border border-white transition-all ${displayAppt.status === 'cancelled' ? 'grayscale opacity-75' : 'shadow-blue-100/50'}`}>
                    <div className="flex flex-col items-center text-center mb-6">
                        <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-primary to-cyan-400 mb-4 shadow-lg shadow-blue-200">
                        <img alt="Barber" className="w-full h-full object-cover rounded-full border-2 border-white" src="https://lh3.googleusercontent.com/aida-public/AB6AXuASZI54tUmbDSYe5gS24e3PgOMrI9qj3GqCIEsupdXwc_RqEBRxxdeTzuQ3J0BROacciMi8-E7ETF5xeF2c2Uk4cf7YG5pilwN59DTPHgqMFtmR-BKshgwP10w2kJSINs_ypgvRDwU3w6nM3XlqoTe2P00EUzVesNcHEhim30CLfIwvsP3__IjMVSrLxerwxTk_9QTAUp9wDxhQiUOSQBM247evrYwIqH808FQf91hnQpmGCY8fFpkv8bZ_2SuikN86EqZhUYAYaRc" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">理发师：{displayAppt.barber_name}</h2>
                        <p className="text-sm font-medium text-slate-500 mt-1">{displayAppt.service_name}</p>
                        <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 bg-[#F0F7FF] rounded-full text-primary border border-blue-100">
                        <span className="material-symbols-outlined text-sm">calendar_today</span>
                        <span className="text-xs font-semibold">{displayAppt.date_str} {displayAppt.time_str}</span>
                        </div>
                    </div>
                    {displayAppt.status !== 'cancelled' && (
                        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-inner mx-auto w-fit mb-4">
                            <img alt="QR Code" className="w-52 h-52 opacity-90 mix-blend-multiply" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=appt:${displayAppt.id}`} />
                        </div>
                    )}
                </div>

                {(displayAppt.status === 'confirmed' || displayAppt.status === 'pending' || displayAppt.status === 'checked_in') && (
                    <div className="w-full bg-white/60 backdrop-blur-md rounded-2xl p-5 mb-6 border border-white shadow-sm">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/80 rounded-xl p-4 border border-white shadow-sm"><p className="text-[10px] text-slate-500 font-bold mb-1">当前位置</p><p className="text-2xl font-bold text-slate-900">{queuePosition || '-'}</p></div>
                            <div className="bg-white/80 rounded-xl p-4 border border-white shadow-sm"><p className="text-[10px] text-slate-500 font-bold mb-1">预计等待</p><p className="text-2xl font-bold text-primary">{waitTime}</p></div>
                        </div>
                        <div className="space-y-3 mt-4">
                            {displayAppt.status !== 'checked_in' && <button onClick={handleManualCheckIn} disabled={isCheckingIn} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2"><span className="material-symbols-outlined">how_to_reg</span> 我已到店，立即签到</button>}
                            <button onClick={handleCancelAppointment} disabled={isCancelling} className="w-full bg-red-50 text-red-500 border border-red-100 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2">取消预约</button>
                        </div>
                    </div>
                )}
            </>
        ) : null}
      </main>

      {/* Help Center Modal */}
      {showHelpCenter && (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowHelpCenter(false)}></div>
              <div className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl relative animate-[slide-up_0.3s_ease-out] max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-6 sticky top-0 bg-white z-10 py-2">
                      <div>
                          <h2 className="text-xl font-bold text-slate-900">帮助与支持</h2>
                          <p className="text-xs text-slate-400">解答您在预约过程中的疑惑</p>
                      </div>
                      <button onClick={() => setShowHelpCenter(false)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>
                  
                  <div className="space-y-4">
                      {helpTopics.map((topic, i) => (
                          <div key={i} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-8 h-8 rounded-lg bg-white text-primary flex items-center justify-center shadow-sm">
                                      <span className="material-symbols-outlined text-[18px]">{topic.icon}</span>
                                  </div>
                                  <h4 className="font-bold text-slate-900 text-[14px]">{topic.title}</h4>
                              </div>
                              <p className="text-xs text-slate-500 leading-relaxed px-1">
                                  {topic.content}
                              </p>
                          </div>
                      ))}
                  </div>

                  <div className="mt-8 bg-blue-50 rounded-2xl p-5 border border-blue-100 text-center">
                      <p className="text-sm font-bold text-primary mb-1">仍需帮助？</p>
                      <p className="text-xs text-blue-400 mb-4">您可以直接咨询您的发型师或致电前台</p>
                      <button className="bg-primary text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all text-xs">
                          联系客服
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showEditProfile && currentUser && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isSavingProfile && setShowEditProfile(false)}></div>
              <div className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-[scale-in_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold text-slate-900">编辑资料</h2>
                      <button onClick={() => setShowEditProfile(false)} className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded-full text-slate-400"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">头像 URL</label>
                          <input type="text" value={editAvatar} onChange={e => setEditAvatar(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-xs" />
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">昵称</label>
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold" />
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">真实姓名</label>
                          <input type="text" value={editRealName} onChange={e => setEditRealName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4" />
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">修改密码</label>
                          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="留空则不修改" className="w-full bg-slate-50 border-none rounded-xl py-3 px-4" />
                      </div>
                      <button onClick={handleSaveProfile} disabled={isSavingProfile} className="w-full mt-4 bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center">
                          {isSavingProfile ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "保存修改"}
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      <BottomNav activeRoute="check_in" onNavigate={onNavigate} userRole="customer" />
    </Layout>
  );
};
