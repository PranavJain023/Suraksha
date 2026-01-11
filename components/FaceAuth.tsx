
import React, { useState, useRef, useEffect } from 'react';
import { ShieldAlert, RefreshCw, User, Mail, Lock, ChevronRight, ArrowLeft, Sparkles, ShieldX, Check, Loader2, LogIn, UserPlus, Scan, ShieldCheck } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { db, ref, set, get, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../services/firebase';

interface FaceAuthProps {
  onSuccess: (profile: any) => void;
}

type AuthView = 'scan' | 'login' | 'signup' | 'denied';

export const FaceAuth: React.FC<FaceAuthProps> = ({ onSuccess }) => {
  const [view, setView] = useState<AuthView>('scan');
  const [isFaceVerified, setIsFaceVerified] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'verifying' | 'success'>('idle');
  const [logoError, setLogoError] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Updated logo URL
  const LOGO_SRC = "https://img.sanishtech.com/u/f092204ed750bcf3813eaff81a4b9486.png";

  const clearScanningTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (view === 'scan' && !isFaceVerified) {
      startCamera();
    } else {
      stopCamera();
      clearScanningTimer();
    }
    return () => {
      stopCamera();
      clearScanningTimer();
    };
  }, [view, isFaceVerified]);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
      setStatus('scanning');
      
      clearScanningTimer();
      // Auto-capture after 3 seconds
      timerRef.current = window.setTimeout(captureAndVerify, 3000);
    } catch (err) {
      setError("Camera access is required for biometric gating.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureAndVerify = async () => {
    // Critical Guard: Only proceed if we are still on the scan view
    if (view !== 'scan' || !videoRef.current || !canvasRef.current || status === 'verifying' || isFaceVerified) return;
    
    setStatus('verifying');
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg').split(',')[1];
      
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: base64 } },
              { text: "Identity Protocol: This app is strictly for women's safety. 1. Confirm face detection. 2. Verify if the person is female. Return JSON only: { \"faceDetected\": boolean, \"isFemale\": boolean, \"confidence\": number }." }
            ]
          },
          config: {
            thinkingConfig: { thinkingBudget: 2048 },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                faceDetected: { type: Type.BOOLEAN },
                isFemale: { type: Type.BOOLEAN },
                confidence: { type: Type.NUMBER }
              },
              required: ["faceDetected", "isFemale", "confidence"]
            }
          }
        });

        const result = JSON.parse(response.text || '{"faceDetected": false, "isFemale": false}');
        
        // Re-check view before applying result
        if (view !== 'scan') return;

        if (result.faceDetected && result.isFemale) {
          setIsFaceVerified(true);
          setStatus('success');
          setTimeout(() => setView('login'), 1500);
        } else if (result.faceDetected && !result.isFemale) {
          setError("Restricted: Gender mismatch identified. Suraksha is a dedicated space for women.");
          setView('denied');
          stopCamera();
        } else {
          // If detection fails, try again in 3 seconds if still scanning
          setStatus('scanning');
          if (view === 'scan') {
            timerRef.current = window.setTimeout(captureAndVerify, 3000);
          }
        }
      } catch (e) {
        console.error("Biometric error:", e);
        if (view === 'scan') {
          setStatus('scanning');
          timerRef.current = window.setTimeout(captureAndVerify, 4000);
        }
      }
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const userRef = ref(db, `users/${userCred.user.uid}`);
      const snapshot = await get(userRef);
      const profileData = snapshot.exists() ? snapshot.val() : { uid: userCred.user.uid, name: email.split('@')[0], isFemale: true, status: 'verified' };
      localStorage.setItem('suraksha_sid', userCred.user.uid);
      onSuccess(profileData);
    } catch (err: any) {
      setError("Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const profileData = { uid: userCred.user.uid, name, email, verifiedAt: new Date().toISOString(), isFemale: true, status: 'verified' };
      await set(ref(db, `users/${userCred.user.uid}`), profileData);
      localStorage.setItem('suraksha_sid', userCred.user.uid);
      onSuccess(profileData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-[3000] flex flex-col items-center justify-center p-6 text-slate-700 font-sans overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-soft-lavender to-blush-pink opacity-30 pointer-events-none"></div>

      <div className="max-w-md w-full space-y-4 relative z-10 flex flex-col h-full justify-center">
        <div className="text-center space-y-1 mb-2">
          {!logoError ? (
            <img 
              src={LOGO_SRC} 
              alt="Logo" 
              className="w-24 h-24 object-contain mx-auto mb-4 animate-pulse-soft drop-shadow-lg rounded-full bg-white" 
              onError={() => setLogoError(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
             <div className="w-24 h-24 bg-lavender-deep rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl animate-bounce border-4 border-white">
                <ShieldCheck size={48} className="text-white" />
             </div>
          )}
          <h1 className="text-3xl font-black tracking-tighter text-lavender-deep">Suraksha</h1>
          <p className="text-slate-500 text-[9px] font-bold uppercase tracking-[0.2em]">Women's Biometric Gateway</p>
        </div>

        <div className="flex-1 flex flex-col gap-4 overflow-y-auto no-scrollbar py-2 px-1">
          {view === 'scan' && (
            <div className="space-y-4 animate-in zoom-in-95 duration-500">
              <div className={`aspect-square bg-black rounded-[2rem] overflow-hidden relative border-4 transition-all duration-500 ${status === 'success' ? 'border-calm-teal shadow-[0_0_20px_rgba(45,212,191,0.3)]' : 'border-white shadow-xl'}`}>
                <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-cover transition-all duration-700 ${status === 'success' ? 'grayscale-0 scale-105' : 'grayscale opacity-60'}`} />
                
                {status !== 'success' && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-40 h-52 border-2 border-white/20 rounded-[3rem] relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-full border-[60px] border-black/50"></div>
                      <div className="absolute w-full h-1 bg-calm-teal shadow-[0_0_10px_#2DD4BF] animate-[scan_2s_infinite]"></div>
                    </div>
                  </div>
                )}

                {status === 'success' && (
                  <div className="absolute inset-0 bg-calm-teal/20 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-white rounded-full p-3 shadow-xl animate-in zoom-in duration-300">
                      <Check size={40} className="text-calm-teal" strokeWidth={4} />
                    </div>
                  </div>
                )}

                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <div className="bg-black/60 backdrop-blur-xl py-2 px-5 rounded-full inline-flex items-center gap-3 text-white border border-white/10">
                    {status === 'verifying' ? <Loader2 size={14} className="animate-spin text-calm-teal" /> : <Sparkles size={14} className="text-calm-teal" />}
                    <div className="text-left">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/50 leading-none mb-1">Face Analysis</p>
                      <p className="text-xs font-bold leading-none">
                        {status === 'scanning' ? 'Confirming Gender...' : status === 'verifying' ? 'Validating...' : 'Identity Verified'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <p className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">Or Access Manual Portal</p>
                <div className="grid grid-cols-2 gap-3 px-1">
                  <button onClick={() => { setView('login'); clearScanningTimer(); }} className="flex items-center justify-center gap-2 py-3.5 bg-white border border-lavender-medium rounded-xl text-lavender-deep font-bold text-xs uppercase tracking-widest hover:bg-soft-lavender transition-all shadow-sm">
                    <LogIn size={16} /> Login
                  </button>
                  <button onClick={() => { setView('signup'); clearScanningTimer(); }} className="flex items-center justify-center gap-2 py-3.5 bg-white border border-lavender-medium rounded-xl text-lavender-deep font-bold text-xs uppercase tracking-widest hover:bg-soft-lavender transition-all shadow-sm">
                    <UserPlus size={16} /> Sign Up
                  </button>
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {view === 'denied' && (
            <div className="animate-in fade-in zoom-in-95 duration-500 space-y-4">
              <div className="aspect-square bg-red-950 rounded-[2rem] border-4 border-red-500 flex flex-col items-center justify-center text-center p-6 shadow-xl">
                <ShieldX size={64} className="text-red-500 mb-4 animate-pulse" />
                <h2 className="text-xl font-black text-red-500 uppercase tracking-tighter mb-2">Entry Blocked</h2>
                <p className="text-white/80 text-[11px] leading-relaxed font-medium">
                  Verification has detected a gender mismatch. Suraksha remains a safe haven strictly for women.
                </p>
              </div>
              <button 
                onClick={() => { setView('scan'); setIsFaceVerified(false); setStatus('idle'); setError(null); }}
                className="w-full py-4 bg-slate-100 text-slate-500 font-bold rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
              >
                <RefreshCw size={18} /> Restart Scanning
              </button>
            </div>
          )}

          {(view === 'login' || view === 'signup') && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <form onSubmit={view === 'login' ? handleEmailLogin : handleSignup} className="bg-white/80 p-6 rounded-[2rem] border border-lavender-medium backdrop-blur-sm space-y-3 shadow-sm">
                <div className="flex items-center gap-3 mb-1">
                  <button type="button" onClick={() => setView('scan')} className="p-2 text-slate-400 hover:text-lavender-deep transition-colors"><ArrowLeft size={18}/></button>
                  <h2 className="text-lg font-bold">{view === 'login' ? 'Authentication' : 'Registration'}</h2>
                </div>

                <div className="space-y-2">
                  {view === 'signup' && (
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                      <input type="text" placeholder="Full Name" required value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-6 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all" />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                    <input type="email" placeholder="Email Address" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-6 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all" />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                    <input type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-6 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all" />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="w-full py-3.5 bg-lavender-deep text-white font-bold rounded-xl hover:bg-lavender-medium shadow-lg transition-all flex items-center justify-center gap-3 mt-2 active:scale-95 disabled:opacity-50 text-sm uppercase tracking-widest">
                  {loading ? <Loader2 className="animate-spin" size={20} /> : view === 'login' ? 'Enter Space' : 'Join Grid'}
                </button>

                <div className="flex justify-between items-center pt-2">
                   <button type="button" onClick={() => setView(view === 'login' ? 'signup' : 'login')} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-lavender-deep transition-colors">
                    {view === 'login' ? "New Member? Create Profile" : "Existing Member? Log in"}
                  </button>
                  <button type="button" onClick={() => { setView('scan'); setIsFaceVerified(false); setStatus('idle'); }} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-lavender-deep/60 hover:text-lavender-deep">
                    <Scan size={12} /> Biometric
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {error && view !== 'denied' && (
          <div className="bg-blush-pink border border-blush-medium p-3 rounded-xl flex items-start gap-3 text-blush-deep text-[10px] font-bold animate-in slide-in-from-top-2 shadow-sm">
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: 100%; }
        }
      `}</style>
    </div>
  );
};
