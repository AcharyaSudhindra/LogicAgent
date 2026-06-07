"use client";
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, User, Key, AlertCircle } from 'lucide-react';
import axios from 'axios';

const API_BASE = "http://localhost:8000";

type Message = {
  id: string;
  sender: 'user' | 'ai';
  text: string;
};

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', sender: 'ai', text: 'Hello! I am LogicAgent. How can I help you verify your RTL today?' }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Settings view inside chat
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputValue
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/smart/chat`, {
        message: userMessage.text,
        api_key: apiKey
      });
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: res.data.response || "I didn't understand that."
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: "Error: Could not reach the AI agent. " + (err.response?.data?.error || err.message)
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="mb-4 w-80 sm:w-96 h-[500px] flex flex-col bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="h-14 bg-gradient-to-r from-cyan-500/20 to-purple-600/20 border-b border-white/5 flex items-center justify-between px-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-cyan-400" />
                <span className="font-bold text-sm text-slate-200">LogicAgent Chat</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                  title="API Key Settings"
                >
                  <Key className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 relative bg-[#030304]/50">
              
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-0 left-0 w-full p-4 bg-zinc-900 border-b border-white/5 shadow-xl z-10"
                  >
                    <label className="text-xs font-semibold text-zinc-400 block mb-2">Gemini API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Optional if set in environment..."
                      className="w-full bg-black/50 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                    />
                    <p className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Required for AI capabilities if GEMINI_API_KEY env is not set.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Messages */}
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${msg.sender === 'user' ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                    {msg.sender === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  </div>
                  <div className={`p-3 rounded-2xl text-xs leading-relaxed ${msg.sender === 'user' ? 'bg-purple-500/20 text-purple-100 rounded-tr-sm' : 'bg-zinc-800/60 text-zinc-300 rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
              
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="self-start flex gap-3 max-w-[85%]"
                >
                  <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Bot className="w-3 h-3" />
                  </div>
                  <div className="p-3 rounded-2xl bg-zinc-800/60 rounded-tl-sm flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-cyan-500/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-500/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-500/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-zinc-950 border-t border-white/5">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about Verilog..."
                  className="w-full bg-black/40 border border-white/10 rounded-full pl-4 pr-10 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute right-1 p-1.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 text-white flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-shadow"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>
    </div>
  );
}
