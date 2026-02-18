
import React, { useState, useEffect } from 'react';
import { CustomerHome } from './pages/CustomerHome';
import { Booking } from './pages/Booking';
import { AIChat } from './pages/AIChat';
import { CheckIn } from './pages/CheckIn';
import { Monitor } from './pages/Monitor';
import { WebMonitor } from './pages/WebMonitor';
import { Dashboard } from './pages/admin/Dashboard';
import { Workbench } from './pages/admin/Workbench';
import { Management } from './pages/admin/Management';
import { Settings } from './pages/admin/Settings';
import { Logs } from './pages/admin/Logs';
import { Register } from './pages/Register';
import { Login } from './pages/Login';
import { PageRoute, Barber, Appointment, User } from './types';
import { supabase } from './services/supabase';

const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<PageRoute>('launcher');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [lastAppointment, setLastAppointment] = useState<Appointment | null>(null);
  const [availableBarbers, setAvailableBarbers] = useState<Barber[]>([]);
  const [showBarberLogin, setShowBarberLogin] = useState(false);

  useEffect(() => {
    const loadBarbers = async () => {
       const { data } = await supabase.from('app_barbers').select('*');
       if (data) setAvailableBarbers(data as unknown as Barber[]);
    }
    loadBarbers();
  }, []);

  const handleNavigate = (route: PageRoute) => {
    // 退出功能实现：当返回启动页时，重置所有状态
    if (route === 'launcher') {
      setCurrentUser(null);
      setSelectedBarber(null);
      setLastAppointment(null);
    }
    setCurrentRoute(route);
  };

  const handleBarberSelect = (barber: Barber) => {
    setSelectedBarber(barber);
  };

  const handleBookingSuccess = (appointment: Appointment) => {
    setLastAppointment(appointment);
    handleNavigate('check_in');
  };

  const handleUserUpdate = (updates: Partial<User>) => {
    if (currentUser) {
      setCurrentUser({ ...currentUser, ...updates });
    }
  };

  const handleRegister = (user: User) => {
      setCurrentUser(user);
      setCurrentRoute('home');
  };

  const handleLogin = (user: User) => {
      setCurrentUser(user);
      setCurrentRoute('home');
  };

  const handleGuestVisit = () => {
      setCurrentUser(null);
      setCurrentRoute('home');
  };

  const loginAsAdmin = () => {
      setCurrentUser({ id: 'admin_001', name: '系统管理员', role: 'admin' });
      setCurrentRoute('admin_dashboard');
  };

  const loginAsBarber = (barber: Barber) => {
      setCurrentUser({ id: barber.id, name: barber.name, role: 'barber', avatar: barber.image, barberId: barber.id });
      setCurrentRoute('admin_workbench');
  };

  const renderPage = () => {
    switch (currentRoute) {
      case 'home': return <CustomerHome onNavigate={handleNavigate} onBarberSelect={handleBarberSelect} currentUser={currentUser} />;
      case 'booking': return <Booking onNavigate={handleNavigate} preselectedBarber={selectedBarber} onBookingSuccess={handleBookingSuccess} currentUser={currentUser} />;
      case 'ai_chat': return <AIChat onNavigate={handleNavigate} />;
      case 'check_in': return <CheckIn onNavigate={handleNavigate} appointment={lastAppointment} currentUser={currentUser} onUpdateUser={handleUserUpdate} />;
      case 'register': return <Register onNavigate={handleNavigate} onRegister={handleRegister} />;
      case 'login': return <Login onNavigate={handleNavigate} onLogin={handleLogin} />;
      case 'monitor': return <Monitor onNavigate={handleNavigate} />;
      case 'web_monitor': return <WebMonitor onNavigate={handleNavigate} />;
      case 'admin_dashboard': return <Dashboard onNavigate={handleNavigate} />;
      case 'admin_workbench': return <Workbench onNavigate={handleNavigate} currentUser={currentUser} />;
      case 'admin_management': return <Management onNavigate={handleNavigate} />;
      case 'admin_settings': return <Settings onNavigate={handleNavigate} currentUser={currentUser} onUpdateUser={handleUserUpdate} />;
      case 'admin_logs': return <Logs onNavigate={handleNavigate} />;
      
      case 'launcher': return (
        <div className="min-h-screen bg-bg-main flex flex-col items-center justify-center p-6 relative overflow-hidden">
          <div className="absolute top-[-5%] right-[-5%] w-48 h-48 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-5%] left-[-5%] w-48 h-48 bg-cyan-400/10 rounded-full blur-3xl"></div>
          
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100 mb-6 z-10">
             <span className="material-symbols-outlined text-3xl text-white">content_cut</span>
          </div>
          
          <h1 className="text-2xl font-black text-slate-900 mb-1 tracking-tight z-10">BarberBook Pro</h1>
          <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-8 z-10">Select Role to Continue</p>
          
          {!showBarberLogin ? (
              <div className="w-full space-y-3 max-w-xs z-10">
                <button onClick={() => handleNavigate('login')} className="w-full p-4 bg-white hover:bg-slate-50 text-slate-900 rounded-2xl shadow-sm border border-white flex items-center justify-between group transition-all active:scale-[0.98]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-primary flex items-center justify-center">
                       <span className="material-symbols-outlined text-[20px]">person</span>
                    </div>
                    <div className="text-left">
                      <p className="text-[13px] font-bold">我是顾客</p>
                      <p className="text-[9px] text-slate-400 uppercase tracking-tighter">Login as Customer</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-slate-200 group-hover:text-primary transition-colors text-lg">chevron_right</span>
                </button>

                <button onClick={() => setShowBarberLogin(true)} className="w-full p-4 bg-white hover:bg-slate-50 text-slate-900 rounded-2xl shadow-sm border border-white flex items-center justify-between group transition-all active:scale-[0.98]">
                  <div className="flex items-center gap-3">
                     <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
                       <span className="material-symbols-outlined text-[20px]">content_cut</span>
                    </div>
                    <div className="text-left">
                      <p className="text-[13px] font-bold">我是理发师</p>
                      <p className="text-[9px] text-slate-400 uppercase tracking-tighter">Stylist Portal</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-slate-200 group-hover:text-orange-500 transition-colors text-lg">chevron_right</span>
                </button>

                <button onClick={loginAsAdmin} className="w-full p-4 bg-slate-900 text-white rounded-2xl shadow-lg border border-slate-800 flex items-center justify-between group transition-all active:scale-[0.98]">
                  <div className="flex items-center gap-3">
                     <div className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center">
                       <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                    </div>
                    <div className="text-left">
                      <p className="text-[13px] font-bold">我是管理员</p>
                      <p className="text-[9px] text-slate-400 uppercase tracking-tighter">Admin Panel</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-slate-500 group-hover:text-white transition-colors text-lg">chevron_right</span>
                </button>

                <div className="pt-4 flex flex-col items-center gap-3">
                    <button onClick={handleGuestVisit} className="text-slate-400 text-[11px] font-bold uppercase tracking-widest hover:text-slate-600 transition-colors">
                        随便逛逛 (Guest Mode)
                    </button>
                    <div className="flex items-center gap-4">
                        <button onClick={() => handleNavigate('monitor')} className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-primary uppercase tracking-tighter transition-colors">
                            <span className="material-symbols-outlined text-base">tv</span>
                            监控大屏
                        </button>
                        <div className="w-px h-3 bg-slate-200"></div>
                        <button onClick={() => handleNavigate('register')} className="text-[10px] font-black text-primary hover:underline uppercase tracking-tighter">
                            立即注册
                        </button>
                    </div>
                </div>
              </div>
          ) : (
              <div className="w-full max-w-xs z-10 animate-fade-in">
                  <button onClick={() => setShowBarberLogin(false)} className="flex items-center gap-2 mb-4 text-slate-400 hover:text-slate-700 transition-colors">
                      <span className="material-symbols-outlined text-sm">arrow_back</span>
                      <span className="text-[11px] font-black uppercase tracking-widest">返回角色选择</span>
                  </button>
                  <div className="bg-white/90 backdrop-blur-md rounded-2xl p-1 max-h-[300px] overflow-y-auto shadow-xl border border-white scrollbar-hide">
                      {availableBarbers.map(b => (
                          <div 
                            key={b.id} 
                            onClick={() => loginAsBarber(b)}
                            className="p-3 hover:bg-slate-50 rounded-xl flex items-center gap-3 cursor-pointer transition-colors"
                          >
                              <img src={b.image} className="w-10 h-10 rounded-full object-cover border border-slate-100" alt={b.name}/>
                              <div className="flex-1">
                                  <p className="text-[13px] font-bold text-slate-900 leading-none mb-1">{b.name}</p>
                                  <p className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter">{b.title}</p>
                              </div>
                              <span className="material-symbols-outlined text-slate-200 text-lg">login</span>
                          </div>
                      ))}
                  </div>
              </div>
          )}
          
          <p className="absolute bottom-8 text-[9px] text-slate-300 font-bold uppercase tracking-[0.3em]">© 2024 BarberBook Pro</p>
        </div>
      );
      default: return <CustomerHome onNavigate={handleNavigate} currentUser={currentUser} />;
    }
  };

  return <>{renderPage()}</>;
};

export default App;
