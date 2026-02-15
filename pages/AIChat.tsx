import React, { useState, useRef, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { BottomNav } from '../components/BottomNav';
import { ChatMessage, PageRoute } from '../types';
import { generateHairConsultation } from '../services/geminiService';

interface Props {
  onNavigate: (route: PageRoute) => void;
}

export const AIChat: React.FC<Props> = ({ onNavigate }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'user', text: '圆脸适合什么短发？', timestamp: new Date(Date.now() - 60000) },
    { 
      id: '2', 
      role: 'model', 
      text: '为您推荐适合圆脸的方案。重点在于增加视觉高度，以修饰面部比例：', 
      timestamp: new Date(),
      images: [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuASZI54tUmbDSYe5gS24e3PgOMrI9qj3GqCIEsupdXwc_RqEBRxxdeTzuQ3J0BROacciMi8-E7ETF5xeF2c2Uk4cf7YG5pilwN59DTPHgqMFtmR-BKshgwP10w2kJSINs_ypgvRDwU3w6nM3XlqoTe2P00EUzVesNcHEhim30CLfIwvsP3__IjMVSrLxerwxTk_9QTAUp9wDxhQiUOSQBM247evrYwIqH808FQf91hnQpmGCY8fFpkv8bZ_2SuikN86EqZhUYAYaRc',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuD1qwvlDy5vm9u_b33_rfD-P40Tj3GDKG0BNW3yV3q6xsmoWSeF97hNH2lUiW2hPUuOombMFpnxNvcaTI3fvuVnlFjtiUQiAPARwitCM7fkkOmGhqU45Tbfv2ctMYXUcYuJog4zB8RNrPbkTdkcJVWtuV76N-kCOflrxai1WG_Ugv2XKZ674N23ONPrmzVGCM84SUkgpRzXQw-w7-ygvF6JovNcvEb3vxZjcdJvYqoeV8QJiVFDljKvMKL_L7dDIwrIvQXwOquUvYg'
      ]
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const history = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const responseText = await generateHairConsultation(input, history);

    const modelMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, modelMsg]);
    setIsLoading(false);
  };

  return (
    <Layout>
      <header className="py-3 px-6 flex items-center border-b border-gray-100 bg-white/90 ios-blur sticky top-0 z-30">
        <button className="mr-4 text-slate-400" onClick={() => onNavigate('home')}>
          <span className="material-symbols-outlined text-xl">arrow_back_ios_new</span>
        </button>
        <div className="flex flex-col">
          <h1 className="text-base font-bold text-slate-800">AI 发型顾问</h1>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-[10px] text-slate-400 font-medium">在线为您服务</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide bg-gray-50 pb-32" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div 
              className={`px-4 py-2.5 rounded-2xl max-w-[85%] shadow-sm leading-relaxed text-[15px]
                ${msg.role === 'user' 
                  ? 'bg-primary text-white rounded-tr-none' 
                  : 'bg-white text-slate-700 border border-gray-100 rounded-tl-none'
                }`}
            >
              <p>{msg.text}</p>
              {msg.images && (
                <div className="space-y-3 mt-3">
                  {msg.images.map((img, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-2 border border-gray-100 flex gap-3">
                      <img src={img} alt="Hair style" className="w-16 h-16 rounded-lg object-cover bg-gray-200" />
                      <div className="flex-1 flex flex-col justify-center">
                        <h4 className="text-sm font-bold text-slate-800">推荐发型 {i + 1}</h4>
                        <p className="text-xs text-slate-500 mt-1">点击查看详情</p>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={() => onNavigate('booking')}
                    className="w-full bg-primary/10 hover:bg-primary/20 text-primary font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                    <span className="text-sm">立即预约</span>
                  </button>
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-400 mt-1.5 mx-1">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start">
               <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div>
               </div>
            </div>
        )}
      </main>

      {/* Input Area */}
      <div className="absolute bottom-[90px] left-0 right-0 p-4 bg-white border-t border-gray-100 z-40">
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2">
          <button className="text-slate-400 hover:text-primary transition-colors">
            <span className="material-symbols-outlined">add_circle</span>
          </button>
          <input 
            className="flex-1 bg-transparent border-none text-[15px] focus:ring-0 text-slate-800 placeholder-slate-400 p-0" 
            placeholder="询问关于发型的一切..." 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm transition-all
              ${!input.trim() || isLoading ? 'bg-slate-300' : 'bg-primary hover:bg-blue-600'}
            `}
          >
            <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
          </button>
        </div>
      </div>
      <BottomNav activeRoute="ai_chat" onNavigate={onNavigate} userRole="customer" />
    </Layout>
  );
};