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

// Helper: Hash password (SHA-256)
const hashPassword = async (pwd: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pwd);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

export const CheckIn: React.FC<Props> = ({ onNavigate, appointment, currentUser, onUpdateUser }) => {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [walletStatus, setWalletStatus] = useState<'idle' | 'added'>('idle');
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [ratedAppointmentIds, setRatedAppointmentIds] = useState<number[]>([]);
  
  // Queue State
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [waitTime, setWaitTime] = useState<number>(0);
  
  // Profile Edit States
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRealName, setEditRealName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  
  // Password Change States
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Rating States
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingAppt, setRatingAppt] = useState<Appointment | null>(null);
  const [ratingAttitude, setRatingAttitude] = useState(5); // Default 5
  const [ratingSkill, setRatingSkill] = useState(5);       // Default 5
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  
  // Check-in & Cancel State
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Computed Display Appointment
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
    
    // Fetch Appointments
    const { data } = await supabase
        .from('app_appointments')
        .select('*')
        .eq('customer_name', currentUser.name)
        .order('id', { ascending: false });
        
    if (data) {
        setMyAppointments(data);
    }

    // Fetch Ratings
    const { data: ratingsData } = await supabase
        .from('app_ratings')
        .select('appointment_id')
        .eq('customer_name', currentUser.name);
        
    if (ratingsData) {
        setRatedAppointmentIds(ratingsData.map((r: any) => r.appointment_id));
    }
  }, [currentUser]);

  useEffect(() => {
    fetchMyAppointments();

    if (!currentUser) return;

    // Subscribe to changes for my appointments
    const channel = supabase.channel('my_appointments_updates')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'app_appointments', filter: `customer_name=eq.${currentUser.name}` }, 
            () => {
                fetchMyAppointments();
            }
        )
        .subscribe();

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

  // Queue Logic
  const fetchQueueData = useCallback(async () => {
    if (!displayAppt || !displayAppt.id) return;
    
    if (displayAppt.status === 'completed' || displayAppt.status === 'cancelled') {
        setQueuePosition(0);
        setWaitTime(0);
        return;
    }

    const { data } = await supabase
        .from('app_appointments')
        .select('id, time_str, status')
        .eq('barber_name', displayAppt.barber_name)
        .eq('date_str', displayAppt.date_str)
        .in('status', ['confirmed', 'pending', 'checked_in'])
        .order('time_str', { ascending: true });

    if (data) {
        const index = data.findIndex(a => a.id === displayAppt.id);
        if (index !== -1) {
            setQueuePosition(index + 1);
            setWaitTime(index * 20); 
        } else {
             setQueuePosition(0);
             setWaitTime(0);
        }
    }
  }, [displayAppt]);

  useEffect(() => {
      fetchQueueData();
      const channel = supabase.channel('queue_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_appointments' }, () => {
            fetchQueueData();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
  }, [displayAppt, fetchQueueData]);


  const handleSaveToPhotos = () => {
    setSaveStatus('saving');
    setTimeout(() => setSaveStatus('saved'), 1500);
    setTimeout(() => setSaveStatus('idle'), 4000);
  };

  const handleAddToWallet = () => {
      setWalletStatus('added');
      setTimeout(() => setWalletStatus('idle'), 3000);
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
      if (!currentUser) return;
      setIsSavingProfile(true);

      try {
          // Prepare update payload
          const updates: any = {
              name: editName,
              real_name: editRealName,
              phone: editPhone,
              email: editEmail,
              avatar: editAvatar
          };

          // Handle Password Change
          if (newPassword) {
              if (newPassword !== confirmNewPassword) {
                  alert("两次输入的密码不一致，请重新输入");
                  setIsSavingProfile(false);
                  return;
              }
              if (newPassword.length < 6) {
                  alert("密码长度至少为 6 位");
                  setIsSavingProfile(false);
                  return;
              }
              updates.password_hash = await hashPassword(newPassword);
          }

          // Update Database
          const { error } = await supabase
              .from('app_customers')
              .update(updates)
              .eq('id', currentUser.id);

          if (error) throw error;

          // Update Local State
          if (onUpdateUser) {
              onUpdateUser({ 
                  name: editName, 
                  realName: editRealName,
                  phone: editPhone,
                  email: editEmail,
                  avatar: editAvatar 
              });
          }

          alert(newPassword ? "个人信息和密码已修改成功" : "个人信息已保存");
          setShowEditProfile(false);

      } catch (err: any) {
          console.error("Update profile error:", err);
          alert("保存失败: " + err.message);
      } finally {
          setIsSavingProfile(false);
      }
  };
  
  const handleManualCheckIn = async () => {
      if (!displayAppt || !displayAppt.id) return;
      if (displayAppt.status !== 'confirmed' && displayAppt.status !== 'pending') return;
      
      setIsCheckingIn(true);
      try {
          const { error } = await supabase
            .from('app_appointments')
            .update({ status: 'checked_in' })
            .eq('id', displayAppt.id);
            
          if (error) throw error;
          
          await supabase.from('app_logs').insert({
              user: currentUser?.name,
              role: '顾客',
              action: '自助签到',
              details: `顾客 ${currentUser?.name} 在手机端进行了自助签到`,
              type: 'info',
              avatar: currentUser?.avatar
          });
          
          alert('签到成功！请耐心等待理发师呼叫。');
      } catch (e: any) {
          alert('签到失败：' + e.message);
      } finally {
          setIsCheckingIn(false);
          fetchMyAppointments(); // Refresh local state
      }
  };

  const handleCancelAppointment = async () => {
    if (!displayAppt) return;
    if (!displayAppt.id) {
        alert("错误: 找不到预约ID，无法取消。请刷新页面重试。");
        return;
    }

    setIsCancelling(true);
    try {
        const { error } = await supabase
            .from('app_appointments')
            .update({ status: 'cancelled' })
            .eq('id', displayAppt.id);

        if (error) throw error;

        await supabase.from('app_logs').insert({
            user: currentUser?.name,
            role: '顾客',
            action: '取消预约',
            details: `顾客 ${currentUser?.name} 取消了预约 #${displayAppt.id}`,
            type: 'warning',
            avatar: currentUser?.avatar
        });
        
        await fetchMyAppointments();

    } catch (e: any) {
        alert('取消失败: ' + e.message);
    } finally {
        setIsCancelling(false);
    }
  };

  // --- Rating Logic ---

  const openRatingModal = (appt: Appointment) => {
      setRatingAppt(appt);
      setRatingAttitude(5);
      setRatingSkill(5);
      setRatingComment('');
      setShowRatingModal(true);
  };

  const submitRating = async () => {
      if (!ratingAppt || !currentUser || !ratingAppt.id) return;
      setIsSubmittingRating(true);

      const overallRating = Math.round((ratingAttitude + ratingSkill) / 2);

      try {
          // 1. Insert Rating
          const newRating: Rating = {
              appointment_id: ratingAppt.id,
              barber_name: ratingAppt.barber_name,
              customer_name: currentUser.name,
              rating: overallRating,
              attitude_rating: ratingAttitude,
              skill_rating: ratingSkill,
              comment: ratingComment
          };

          const { error } = await supabase.from('app_ratings').insert(newRating);
          if (error) throw error;

          // 2. Update Barber's Average Rating
          const { data: barberRatings } = await supabase
              .from('app_ratings')
              .select('rating')
              .eq('barber_name', ratingAppt.barber_name);

          if (barberRatings && barberRatings.length > 0) {
              const total = barberRatings.reduce((sum, r: any) => sum + r.rating, 0);
              const avg = (total / barberRatings.length).toFixed(1);
              
              await supabase
                  .from('app_barbers')
                  .update({ rating: parseFloat(avg) })
                  .eq('name', ratingAppt.barber_name);
          }

          setRatedAppointmentIds(prev => [...prev, ratingAppt.id!]);
          setShowRatingModal(false);
          alert('评价提交成功！感谢您的反馈。');

      } catch (err: any) {
          console.error("Rating Error", err);
          alert('评价失败: ' + err.message);
      } finally {
          setIsSubmittingRating(false);
      }
  };

  return (
    <Layout className="bg-gradient-to-br from-[#F0F7FF] to-white">
      <Header
        title={currentUser ? "个人中心" : "访客模式"}
        transparent
        left={
          <button onClick={() => onNavigate('home')} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 shadow-sm border border-white">
            <span className="material-symbols-outlined text-slate-700 text-lg">home</span>
          </button>
        }
        right={
          currentUser && (
            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 shadow-sm border border-white">
                <span className="material-symbols-outlined text-slate-700 text-xl">settings</span>
            </button>
          )
        }
      />

      <main className="flex-1 px-5 flex flex-col items-center pb-32 overflow-y-auto">
        
        {/* Profile Section */}
        {currentUser ? (
            <div className="w-full bg-white rounded-[32px] p-6 mb-6 shadow-sm border border-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <span className="material-symbols-outlined text-9xl text-primary">person</span>
                </div>
                <div className="flex items-center gap-5 relative z-10">
                    <div className="relative">
                        <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg overflow-hidden bg-slate-100">
                            <img src={currentUser.avatar || "https://via.placeholder.com/150"} alt="User" className="w-full h-full object-cover" />
                        </div>
                        <button 
                            onClick={() => setShowEditProfile(true)}
                            className="absolute bottom-0 right-0 w-7 h-7 bg-slate-900 text-white rounded-full flex items-center justify-center border-2 border-white shadow-md active:scale-95 transition-transform"
                        >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                        </button>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-end gap-2 mb-0.5">
                            <h2 className="text-xl font-bold text-slate-900">{currentUser.name}</h2>
                            {currentUser.realName && <span className="text-xs text-slate-400 font-medium mb-1">({currentUser.realName})</span>}
                        </div>
                        <p className="text-sm text-slate-500 font-medium mb-2">{currentUser.phone || '暂无手机号'}</p>
                        <div className="flex gap-2">
                             <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md flex items-center gap-1">
                                <span className="material-symbols-outlined text-[10px]">diamond</span> 金牌会员
                             </span>
                        </div>
                    </div>
                </div>
            </div>
        ) : (
             // Guest Profile Card
             <div className="w-full bg-white rounded-[32px] p-6 mb-6 shadow-sm border border-white relative overflow-hidden">
                 <div className="flex items-center gap-5 relative z-10">
                    <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg bg-slate-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-4xl text-slate-300">person_off</span>
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-bold text-slate-900 mb-1">未登录</h2>
                        <p className="text-sm text-slate-400 mb-3">登录以查看您的预约和积分</p>
                        <button 
                            onClick={() => onNavigate('login')}
                            className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all"
                        >
                            立即登录 / 注册
                        </button>
                    </div>
                 </div>
             </div>
        )}

        {currentUser ? (
            displayAppt ? (
                <>
                    <h3 className="w-full text-left text-sm font-bold text-slate-900 mb-3 px-1">当前预约凭证</h3>
                    {/* Ticket Card */}
                    <div className={`w-full bg-white rounded-[32px] shadow-xl p-6 mb-6 border border-white animate-slide-up relative overflow-hidden transition-all ${displayAppt.status === 'cancelled' ? 'grayscale opacity-75 shadow-sm' : 'shadow-blue-100/50'}`}>
                    {displayAppt.status === 'checked_in' && (
                        <div className="absolute top-4 right-4 z-10 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-pulse">
                            <span className="material-symbols-outlined text-sm">check_circle</span> 已签到
                        </div>
                    )}
                    {displayAppt.status === 'cancelled' && (
                        <div className="absolute top-4 right-4 z-10 bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">cancel</span> 已取消
                        </div>
                    )}
                    
                    <div className="flex flex-col items-center text-center mb-6">
                        <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-primary to-cyan-400 mb-4 shadow-lg shadow-blue-200">
                        <img 
                            alt="Barber" 
                            className="w-full h-full object-cover rounded-full border-2 border-white" 
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuASZI54tUmbDSYe5gS24e3PgOMrI9qj3GqCIEsupdXwc_RqEBRxxdeTzuQ3J0BROacciMi8-E7ETF5xeF2c2Uk4cf7YG5pilwN59DTPHgqMFtmR-BKshgwP10w2kJSINs_ypgvRDwU3w6nM3XlqoTe2P00EUzVesNcHEhim30CLfIwvsP3__IjMVSrLxerwxTk_9QTAUp9wDxhQiUOSQBM247evrYwIqH808FQf91hnQpmGCY8fFpkv8bZ_2SuikN86EqZhUYAYaRc"
                        />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">理发师：{displayAppt.barber_name}</h2>
                        <p className="text-sm font-medium text-slate-500 mt-1">{displayAppt.service_name}</p>
                        <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 bg-[#F0F7FF] rounded-full text-primary border border-blue-100">
                        <span className="material-symbols-outlined text-sm">calendar_today</span>
                        <span className="text-xs font-semibold">{displayAppt.date_str} {displayAppt.time_str}</span>
                        </div>
                    </div>
                    
                    {displayAppt.status !== 'cancelled' && (
                        <div className="relative py-2">
                            <div className="flex items-center justify-center mb-8">
                            <div className="flex-1 h-[1px] border-t border-dashed border-slate-200"></div>
                            <div className="px-3 text-[10px] text-slate-300 font-bold tracking-widest uppercase">Scan Code</div>
                            <div className="flex-1 h-[1px] border-t border-dashed border-slate-200"></div>
                            </div>
                            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-inner mx-auto w-fit mb-4">
                            <div className="w-52 h-52 flex items-center justify-center">
                                <img 
                                alt="QR Code" 
                                className="w-full h-full opacity-90 mix-blend-multiply" 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=appt:${displayAppt.id}`}
                                />
                            </div>
                            </div>
                            <p className="text-center text-xs text-slate-400 font-medium">预约号: {displayAppt.id}</p>
                        </div>
                    )}
                    </div>

                    {/* Status Card - Only show for active appointments */}
                    {(displayAppt.status === 'confirmed' || displayAppt.status === 'pending' || displayAppt.status === 'checked_in') && (
                        <div className="w-full bg-white/60 backdrop-blur-md rounded-2xl p-5 mb-6 border border-white shadow-sm transition-all duration-500 animate-fade-in">
                            <div className="flex items-center gap-2 mb-4">
                                <span className={`w-2 h-2 rounded-full ${displayAppt.status === 'checked_in' ? 'bg-green-500' : 'bg-primary'} animate-pulse`}></span>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">实时排队状态</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/80 rounded-xl p-4 border border-white shadow-sm">
                                <p className="text-[10px] text-slate-500 font-bold mb-1">当前位置</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-slate-900">{queuePosition > 0 ? queuePosition : '-'}</span>
                                    <span className="text-[10px] text-slate-400">号位</span>
                                </div>
                                </div>
                                <div className="bg-white/80 rounded-xl p-4 border border-white shadow-sm">
                                <p className="text-[10px] text-slate-500 font-bold mb-1">预计等待</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-primary">{queuePosition > 0 ? waitTime : 0}</span>
                                    <span className="text-[10px] text-primary/70">分钟</span>
                                </div>
                                </div>
                            </div>
                            
                            {/* Check-in & Cancel Buttons */}
                            <div className="space-y-3 mt-4">
                                {displayAppt.status !== 'checked_in' && (
                                    <button 
                                        onClick={handleManualCheckIn}
                                        disabled={isCheckingIn}
                                        className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isCheckingIn ? (
                                            <>
                                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                <span>签到中...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined">how_to_reg</span>
                                                <span>我已到店，立即签到</span>
                                            </>
                                        )}
                                    </button>
                                )}
                                
                                <button 
                                    onClick={handleCancelAppointment}
                                    disabled={isCancelling}
                                    className="w-full bg-red-50 text-red-500 border border-red-100 font-bold py-3.5 rounded-xl shadow-sm hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    {isCancelling ? (
                                        <span className="w-4 h-4 border-2 border-red-200 border-t-red-500 rounded-full animate-spin"></span>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                                            <span>取消预约</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            
                            {displayAppt.status === 'checked_in' && (
                                <div className="mt-4 text-center py-2 bg-green-50 rounded-xl border border-green-100">
                                    <p className="text-xs text-green-700 font-bold flex items-center justify-center gap-1">
                                        <span className="material-symbols-outlined text-sm">check_circle</span> 
                                        签到成功，请留意叫号
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {displayAppt.status === 'completed' && (
                        <div className="w-full bg-green-50 rounded-2xl p-4 mb-6 border border-green-100 flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                <span className="material-symbols-outlined">check</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-green-800">服务已完成</p>
                                <p className="text-xs text-green-600">感谢您的光临</p>
                            </div>
                        </div>
                    )}
                    
                    {displayAppt.status === 'cancelled' && (
                        <div className="w-full bg-red-50 rounded-2xl p-4 mb-6 border border-red-100 flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                                <span className="material-symbols-outlined">close</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-red-800">预约已取消</p>
                                <p className="text-xs text-red-600">期待下次为您服务</p>
                            </div>
                        </div>
                    )}

                    <button 
                        onClick={handleSaveToPhotos}
                        disabled={saveStatus !== 'idle'}
                        className={`w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg mb-4 
                        ${saveStatus === 'saved' ? 'bg-green-500 text-white shadow-green-200' : 'bg-primary text-white shadow-blue-200'}`}
                    >
                    {saveStatus === 'idle' && <><span className="material-symbols-outlined">download</span> 保存到相册</>}
                    {saveStatus === 'saving' && <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>}
                    {saveStatus === 'saved' && <><span className="material-symbols-outlined">check</span> 已保存</>}
                    </button>
                    
                    <p 
                        onClick={handleAddToWallet}
                        className={`text-xs text-center font-medium cursor-pointer transition-colors mb-8 ${walletStatus === 'added' ? 'text-green-600 font-bold' : 'text-slate-400 hover:text-primary'}`}
                    >
                        {walletStatus === 'added' ? '已成功添加到 Apple Wallet' : '点击可快速添加至 Apple Wallet'}
                    </p>

                    {myAppointments.length > 1 && (
                        <div className="w-full mt-4">
                            <h3 className="text-sm font-bold text-slate-900 mb-3 px-1">历史预约</h3>
                            <div className="space-y-3">
                                {myAppointments.slice(1).map((appt: any) => {
                                    const isRated = ratedAppointmentIds.includes(appt.id);
                                    return (
                                        <div key={appt.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center opacity-90">
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{appt.date_str}</p>
                                                <p className="text-xs text-slate-500">{appt.service_name} • {appt.barber_name}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`text-[10px] font-bold uppercase ${appt.status === 'completed' ? 'text-green-600' : appt.status === 'cancelled' ? 'text-red-400' : appt.status === 'checked_in' ? 'text-primary' : 'text-slate-400'}`}>
                                                    {appt.status === 'checked_in' ? '已签到' : appt.status}
                                                </span>
                                                {appt.status === 'completed' && !isRated && (
                                                    <button 
                                                        onClick={() => openRatingModal(appt)}
                                                        className="px-2 py-1 bg-primary text-white text-[10px] font-bold rounded-lg shadow-sm hover:bg-blue-600 transition-colors"
                                                    >
                                                        去评价
                                                    </button>
                                                )}
                                                {isRated && (
                                                    <span className="text-[10px] text-amber-500 font-bold flex items-center">
                                                        <span className="material-symbols-outlined text-[12px] mr-0.5">star</span> 已评价
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-20 w-full">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-4xl text-slate-300">calendar_today</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">暂无预约</h2>
                    <p className="text-sm text-slate-400 mb-8">您还没有进行过任何预约</p>
                    <button 
                        onClick={() => onNavigate('booking')}
                        className="px-6 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-all"
                    >
                        立即预约
                    </button>
                </div>
            )
        ) : (
            // Not Logged In State for Appointments
            <div className="text-center py-20 w-full opacity-60">
                <span className="material-symbols-outlined text-4xl text-slate-300 mb-4">lock</span>
                <p className="text-sm text-slate-400">请登录以查看预约详情</p>
            </div>
        )}
      </main>

      {/* Edit Profile Modal */}
      {showEditProfile && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowEditProfile(false)}></div>
            <div className="relative bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl animate-[scale-in_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">编辑个人资料</h2>
                
                <div className="flex flex-col items-center justify-center mb-6">
                    <div className="relative group">
                        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-50 shadow-md">
                            <img 
                                src={editAvatar || 'https://via.placeholder.com/150'} 
                                alt="Avatar Preview" 
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <label 
                            htmlFor="user-avatar-upload" 
                            className="absolute bottom-0 right-0 w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-primary transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">photo_camera</span>
                        </label>
                        <input 
                            id="user-avatar-upload" 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={handleAvatarChange}
                        />
                    </div>
                </div>

                <div className="space-y-4 mb-8">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">昵称 (Nickname)</label>
                        <input 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20"
                            placeholder="请输入您的昵称"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">真实姓名 (Real Name)</label>
                        <input 
                            value={editRealName}
                            onChange={(e) => setEditRealName(e.target.value)}
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20"
                            placeholder="请输入真实姓名"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">联系电话 (Phone)</label>
                        <input 
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20"
                            placeholder="请输入手机号码"
                            type="tel"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">电子邮箱 (Email)</label>
                        <input 
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20"
                            placeholder="name@example.com"
                            type="email"
                        />
                    </div>

                    <div className="pt-4 border-t border-dashed border-gray-200">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">修改密码 (Change Password)</label>
                        <div className="space-y-3">
                            <input 
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20"
                                placeholder="新密码 (留空则不修改)"
                            />
                            {newPassword && (
                                <input 
                                    type="password"
                                    value={confirmNewPassword}
                                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                                    className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20"
                                    placeholder="确认新密码"
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowEditProfile(false)} 
                        disabled={isSavingProfile}
                        className="flex-1 bg-slate-100 text-slate-500 font-bold py-3.5 rounded-2xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleSaveProfile} 
                        disabled={isSavingProfile}
                        className="flex-[2] bg-primary text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        {isSavingProfile ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                <span>保存中...</span>
                            </>
                        ) : (
                            <span>保存</span>
                        )}
                    </button>
                </div>
            </div>
         </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && ratingAppt && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowRatingModal(false)}></div>
              <div className="relative bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl animate-[scale-in_0.2s_ease-out]">
                  <h2 className="text-xl font-bold text-slate-900 mb-2 text-center">评价服务</h2>
                  <p className="text-xs text-slate-400 text-center mb-6">您对 {ratingAppt.barber_name} 的服务满意吗？</p>

                  <div className="space-y-5 mb-6">
                      {/* Attitude Rating */}
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">服务态度</p>
                          <div className="flex justify-center gap-3">
                              {[1, 2, 3, 4, 5].map((star) => (
                                  <button 
                                    key={`attitude-${star}`}
                                    onClick={() => setRatingAttitude(star)}
                                    className="text-2xl transition-transform active:scale-110 focus:outline-none"
                                  >
                                      <span className={`material-symbols-outlined ${star <= ratingAttitude ? 'text-amber-400 fill-1' : 'text-slate-200'}`} style={star <= ratingAttitude ? { fontVariationSettings: "'FILL' 1" } : {}}>star</span>
                                  </button>
                              ))}
                          </div>
                      </div>

                      {/* Skill Rating */}
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">技术水平</p>
                          <div className="flex justify-center gap-3">
                              {[1, 2, 3, 4, 5].map((star) => (
                                  <button 
                                    key={`skill-${star}`}
                                    onClick={() => setRatingSkill(star)}
                                    className="text-2xl transition-transform active:scale-110 focus:outline-none"
                                  >
                                      <span className={`material-symbols-outlined ${star <= ratingSkill ? 'text-amber-400 fill-1' : 'text-slate-200'}`} style={star <= ratingSkill ? { fontVariationSettings: "'FILL' 1" } : {}}>star</span>
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>

                  <div className="mb-6">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">评价内容</label>
                      <textarea 
                          value={ratingComment}
                          onChange={(e) => setRatingComment(e.target.value)}
                          className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-slate-900 text-sm focus:ring-2 focus:ring-primary/20 h-24 resize-none"
                          placeholder="写下您的感受..."
                      />
                  </div>

                  <div className="flex gap-3">
                      <button onClick={() => setShowRatingModal(false)} disabled={isSubmittingRating} className="flex-1 bg-slate-100 text-slate-500 font-bold py-3.5 rounded-2xl hover:bg-slate-200 transition-colors">
                          取消
                      </button>
                      <button onClick={submitRating} disabled={isSubmittingRating} className="flex-[2] bg-primary text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center">
                          {isSubmittingRating ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : '提交评价'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <BottomNav activeRoute="check_in" onNavigate={onNavigate} userRole="customer" />
    </Layout>
  );
};