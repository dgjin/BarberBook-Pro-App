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

  // Load barbers for login screen
  useEffect(() => {
    const loadBarbers = async () => {
       const { data } = await supabase.from('app_barbers').select('*');
       if (data) setAvailableBarbers(data as unknown as Barber[]);
       else {
           // Fallback
           setAvailableBarbers([
              { id: 1, name: 'Marcus K.', title: '美式渐变', rating: 4.9, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuASZI54tUmbDSYe5gS24e3PgOMrI9qj3GqCIEsupdXwc_RqEBRxxdeTzuQ3J0BROacciMi8-E7ETF5xeF2c2Uk4cf7YG5pilwN59DTPHgqMFtmR-BKshgwP10w2kJSINs_ypgvRDwU3w6nM3XlqoTe2P00EUzVesNcHEhim30CLfIwvsP3__IjMVSrLxerwxTk_9QTAUp9wDxhQiUOSQBM247evrYwIqH808FQf91hnQpmGCY8fFpkv8bZ_2SuikN86EqZhUYAYaRc', specialties: [], status: 'active' },
              { id: 2, name: 'James L.', title: '经典剪裁', rating: 4.8, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD1qwvlDy5vm9u_b33_rfD-P40Tj3GDKG0BNW3yV3q6xsmoWSeF97hNH2lUiW2hPUuOombMFpnxNvcaTI3fvuVnlFjtiUQiAPARwitCM7fkkOmGhqU45Tbfv2ctMYXUcYuJog4zB8RNrPbkTdkcJVWtuV76N-kCOflrxai1WG_Ugv2XKZ674N23ONPrmzVGCM84SUkgpRzXQw-w7-ygvF6JovNcvEb3vxZjcdJvYqoeV8QJiVFDljKvMKL_L7dDIwrIvQXwOquUvYg', specialties: [], status: 'active' },
           ]);
       }
    }
    loadBarbers();
  }, []);

  const handleNavigate = (route: PageRoute) => {
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

  // Register Handler
  const handleRegister = (user: User) => {
      setCurrentUser(user);
      setCurrentRoute('home');
  };

  // Login Handlers
  const handleLogin = (user: User) => {
      setCurrentUser(user);
      setCurrentRoute('home');
  };

  const handleGuestVisit = () => {
      setCurrentUser(null);
      setCurrentRoute('home');
  };

  const loginAsAdmin = () => {
      setCurrentUser({
          id: 'admin_001',
          name: '系统管理员',
          role: 'admin',
          avatar: ''
      });
      setCurrentRoute('admin_dashboard');
  };

  const loginAsBarber = (barber: Barber) => {
      setCurrentUser({
          id: barber.id,
          name: barber.name,
          role: 'barber',
          avatar: barber.image,
          barberId: barber.id
      });
      setCurrentRoute('admin_workbench');
  };

  const renderPage = () => {
    switch (currentRoute) {
      // Customer Routes
      case 'home': 
        return <CustomerHome onNavigate={handleNavigate} onBarberSelect={handleBarberSelect} currentUser={currentUser} />;
      case 'booking': 
        return <Booking onNavigate={handleNavigate} preselectedBarber={selectedBarber} onBookingSuccess={handleBookingSuccess} currentUser={currentUser} />;
      case 'ai_chat': 
        return <AIChat onNavigate={handleNavigate} />;
      case 'check_in': 
        return <CheckIn onNavigate={handleNavigate} appointment={lastAppointment} currentUser={currentUser} onUpdateUser={handleUserUpdate} />;
      case 'register':
        return <Register onNavigate={handleNavigate} onRegister={handleRegister} />;
      case 'login':
        return <Login onNavigate={handleNavigate} onLogin={handleLogin} />;
      
      // Public / Shared
      case 'monitor': 
        return <Monitor onNavigate={handleNavigate} />;
      case 'web_monitor':
        return <WebMonitor onNavigate={handleNavigate} />;
      
      // Admin / Barber Routes
      case 'admin_dashboard': return <Dashboard onNavigate={handleNavigate} />;
      case 'admin_workbench': return <Workbench onNavigate={handleNavigate} currentUser={currentUser} />;
      case 'admin_management': return <Management onNavigate={handleNavigate} />;
      case 'admin_settings': return <Settings onNavigate={handleNavigate} />;
      case 'admin_logs': return <Logs onNavigate={handleNavigate} />;
      
      // Launcher (Login Screen)
      case 'launcher': return (
        <div className="min-h-screen bg-bg-main flex flex-col items-center justify-center p-8 relative overflow-hidden">
          <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-primary/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl"></div>
          
          <div className="w-20 h-20 bg-primary rounded-[24px] flex items-center justify-center shadow-xl shadow-blue-200 mb-8 z-10">
             <span className="material-symbols-outlined text-4xl text-white">content_cut</span>
          </div>
          
          <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight z-10">BarberBook Pro</h1>
          <p className="text-slate-500 mb-10 text-center max-w-[240px] z-10">请选择您的身份登录<br/>Select Role to Login</p>
          
          {!showBarberLogin ? (
              <div className="w-full space-y-4 max-w-xs z-10">
                <button onClick={() => handleNavigate('login')} className="w-full p-4 bg-white hover:bg-gray-50 text-slate-900 rounded-2xl font-bold shadow-lg shadow-gray-100 border border-white flex items-center justify-between group transition-all active:scale-95">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center">
                       <span className="material-symbols-outlined">person</span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold">我是顾客</p>
                      <p className="text-[10px] text-slate-400">账号登录 / 注册</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-300 group-hover:text-primary transition-colors">arrow_forward</span>
                </button>

                <button onClick={() => setShowBarberLogin(true)} className="w-full p-4 bg-white hover:bg-gray-50 text-slate-900 rounded-2xl font-bold shadow-lg shadow-gray-100 border border-white flex items-center justify-between group transition-all active:scale-95">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
                       <span className="material-symbols-outlined">content_cut</span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold">我是理发师</p>
                      <p className="text-[10px] text-slate-400">员工入口</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-300 group-hover:text-orange-500 transition-colors">arrow_forward</span>
                </button>

                <button onClick={loginAsAdmin} className="w-full p-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl shadow-slate-200 flex items-center justify-between group transition-all active:scale-95">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center">
                       <span className="material-symbols-outlined">admin_panel_settings</span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold">我是管理员</p>
                      <p className="text-[10px] text-slate-400">系统后台</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-500 group-hover:text-white transition-colors">arrow_forward</span>
                </button>

                <div className="pt-4 flex flex-col items-center gap-2">
                    <button onClick={handleGuestVisit} className="w-full text-slate-500 text-sm font-semibold hover:text-slate-800 transition-colors flex items-center justify-center gap-1 py-2 bg-white/50 rounded-xl border border-transparent hover:bg-white hover:border-gray-100">
                        <span>随便逛逛 (游客模式)</span>
                    </button>
                    <div className="flex gap-4">
                        <button onClick={() => handleNavigate('monitor')} className="text-slate-400 text-xs hover:text-primary transition-colors flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">tv</span>
                            <span>监控大屏</span>
                        </button>
                        <button onClick={() => handleNavigate('register')} className="text-primary text-xs font-bold hover:underline">
                            立即注册
                        </button>
                    </div>
                </div>
              </div>
          ) : (
              <div className="w-full max-w-xs z-10 animate-fade-in">
                  <div className="flex items-center gap-2 mb-4 cursor-pointer text-slate-500 hover:text-slate-800" onClick={() => setShowBarberLogin(false)}>
                      <span className="material-symbols-outlined text-sm">arrow_back</span>
                      <span className="text-xs font-bold">返回角色选择</span>
                  </div>
                  <div className="bg-white/80 backdrop-blur-md rounded-2xl p-2 max-h-[400px] overflow-y-auto shadow-xl border border-white">
                      {availableBarbers.map(b => (
                          <div 
                            key={b.id} 
                            onClick={() => loginAsBarber(b)}
                            className="p-3 hover:bg-white rounded-xl flex items-center gap-3 cursor-pointer transition-colors border border-transparent hover:border-gray-100"
                          >
                              <img src={b.image} className="w-10 h-10 rounded-full object-cover"/>
                              <div>
                                  <p className="text-sm font-bold text-slate-900">{b.name}</p>
                                  <p className="text-[10px] text-slate-500">{b.title}</p>
                              </div>
                              <span className="material-symbols-outlined ml-auto text-slate-300">login</span>
                          </div>
                      ))}
                  </div>
              </div>
          )}
          
          <p className="absolute bottom-8 text-[10px] text-slate-400 font-medium">© 2023 BarberBook Inc.</p>
        </div>
      );
      default: return <CustomerHome onNavigate={handleNavigate} currentUser={currentUser} />;
    }
  };

  return (
    <>
      {renderPage()}
    </>
  );
};

export default App;