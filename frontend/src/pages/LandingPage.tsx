import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Activity, Network, Brain } from 'lucide-react';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen relative flex flex-col overflow-hidden bg-[#FAFAFA]">
      {/* Background effects */}
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

      {/* Nav */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex items-center justify-between px-8 md:px-16 py-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black flex items-center justify-center">
            <Activity size={16} className="text-white" />
          </div>
          <span className="font-serif italic text-xl text-black">RCA-agent</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="font-mono text-xs tracking-widest text-gray-600 hover:text-black transition-colors px-4 py-2"
          >
            LOG IN
          </Link>
          <Link
            to="/signup"
            className="font-mono text-xs tracking-widest bg-black text-white px-6 py-2.5 hover:bg-gray-800 transition-colors"
          >
            SIGN UP
          </Link>
        </div>
      </motion.nav>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 border border-gray-200 bg-white/60 backdrop-blur-sm">
            <span className="w-2 h-2 bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
              Decision Intelligence Platform
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-serif italic text-black leading-[1.1] mb-6">
            Root cause analysis,{' '}
            <span className="bg-gradient-to-r from-aurora to-solar bg-clip-text text-transparent">
              automated
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-500 font-light max-w-xl mx-auto mb-12 leading-relaxed">
            Diagnose revenue drops, stockout risks, and anomalies across your
            retail data — powered by AI.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="group flex items-center gap-3 bg-black text-white px-8 py-4 font-mono text-xs tracking-widest hover:bg-gray-800 transition-colors"
            >
              GET STARTED
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-3 border border-gray-300 px-8 py-4 font-mono text-xs tracking-widest text-gray-600 hover:border-black hover:text-black transition-colors"
            >
              LOG IN
            </Link>
          </div>

          {/* Feature pills */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mt-16 flex flex-wrap justify-center gap-6"
          >
            {[
              { icon: Activity, label: 'Anomaly Detection' },
              { icon: Brain, label: 'AI Diagnosis' },
              { icon: Network, label: 'Multi-Source Ingestion' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-4 py-2 glass-panel"
              >
                <Icon size={14} className="text-aurora" />
                <span className="font-mono text-[10px] tracking-wider text-gray-500 uppercase">{label}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="relative z-10 text-center pb-8">
        <span className="font-mono text-[10px] text-gray-400 tracking-widest">
          &copy; {new Date().getFullYear()} RCA-AGENT
        </span>
      </div>
    </div>
  );
};

export default LandingPage;
