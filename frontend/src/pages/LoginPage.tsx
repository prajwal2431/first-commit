import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Activity, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="min-h-screen relative flex overflow-hidden bg-[#FAFAFA]">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] opacity-40 blur-[120px]"
          style={{ background: 'radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.15) 0%, rgba(255,255,255,0) 60%)' }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] opacity-40 blur-[120px]"
          style={{ background: 'radial-gradient(circle at 50% 50%, rgba(251, 146, 60, 0.15) 0%, rgba(255,255,255,0) 60%)' }}
        />
        <div className="absolute inset-0 grid-lines opacity-[0.4]" />
      </div>

      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 flex-col justify-between p-16">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black flex items-center justify-center">
            <Activity size={16} className="text-white" />
          </div>
          <span className="font-serif italic text-xl text-black">RCA-agent</span>
        </Link>

        <div>
          <h2 className="text-4xl md:text-5xl font-serif italic text-black leading-tight mb-4">
            Welcome back.
          </h2>
          <p className="text-gray-500 font-light text-lg max-w-md">
            Pick up where you left off — your data sources and diagnoses are waiting.
          </p>
        </div>

        <p className="font-mono text-[10px] text-gray-400 tracking-widest">
          &copy; {new Date().getFullYear()} RCA-AGENT
        </p>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-1/2 relative z-10 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <Link to="/" className="flex lg:hidden items-center gap-3 mb-12">
            <div className="w-8 h-8 bg-black flex items-center justify-center">
              <Activity size={16} className="text-white" />
            </div>
            <span className="font-serif italic text-xl text-black">RCA-agent</span>
          </Link>

          <div className="mb-8">
            <span className="font-mono text-[10px] tracking-widest text-gray-400 uppercase">[ Authentication ]</span>
            <h1 className="text-3xl font-serif italic text-black mt-2">Log in</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="font-mono text-[10px] tracking-widest text-gray-500 uppercase block mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                required
                autoComplete="email"
                className="w-full bg-white/60 backdrop-blur-sm border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-black transition-colors"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] tracking-widest text-gray-500 uppercase block mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  required
                  autoComplete="current-password"
                  className="w-full bg-white/60 backdrop-blur-sm border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-black transition-colors pr-12"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-signal-critical bg-red-50 border border-red-200 px-4 py-3"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-black text-white py-3.5 font-mono text-xs tracking-widest hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'AUTHENTICATING...' : 'LOG IN'}
              {!loading && <ArrowRight size={14} />}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/signup" className="text-black font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
