import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield } from 'lucide-react';

const SplashScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase('hold'), 600);
    const exitTimer = setTimeout(() => setPhase('exit'), 2200);
    const doneTimer = setTimeout(onComplete, 2800);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== 'exit' ? null : null}
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
        style={{ background: 'hsl(222 47% 11%)' }}
        initial={{ opacity: 1 }}
        animate={{ opacity: phase === 'exit' ? 0 : 1 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      >
        {/* Animated bg rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-accent/10"
              initial={{ width: 0, height: 0, opacity: 0 }}
              animate={{
                width: 200 + i * 160,
                height: 200 + i * 160,
                opacity: [0, 0.3, 0.1],
              }}
              transition={{ duration: 1.5, delay: 0.2 + i * 0.2, ease: 'easeOut' }}
            />
          ))}
        </div>

        {/* 3D Logo */}
        <div className="relative flex flex-col items-center" style={{ perspective: '800px' }}>
          <motion.div
            initial={{ rotateY: -90, scale: 0.5, opacity: 0 }}
            animate={{
              rotateY: phase === 'enter' ? [-90, 15, 0] : 0,
              scale: phase === 'enter' ? [0.5, 1.1, 1] : 1,
              opacity: 1,
            }}
            transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Shield with 3D depth effect */}
            <div className="relative">
              <motion.div
                className="relative w-24 h-24 flex items-center justify-center"
                animate={{ rotateY: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Shadow layer */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ transform: 'translateZ(-20px)', filter: 'blur(8px)' }}
                >
                  <Shield className="h-20 w-20 text-accent/30" strokeWidth={1.5} />
                </div>
                {/* Main shield */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ transform: 'translateZ(0px)' }}
                >
                  <Shield className="h-20 w-20 text-accent" strokeWidth={1.5} />
                </div>
                {/* Highlight layer */}
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ transform: 'translateZ(10px)' }}
                  animate={{ opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Shield className="h-20 w-20 text-accent/40" strokeWidth={0.5} />
                </motion.div>
              </motion.div>

              {/* Glow */}
              <motion.div
                className="absolute -inset-4 rounded-full"
                style={{
                  background: 'radial-gradient(circle, hsl(160 84% 39% / 0.2) 0%, transparent 70%)',
                }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            className="mt-6 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            <h1 className="text-3xl font-bold tracking-tight text-primary-foreground">
              FinCore
            </h1>
            <motion.p
              className="text-sm text-accent mt-1 tracking-widest uppercase"
              initial={{ opacity: 0, letterSpacing: '0.3em' }}
              animate={{ opacity: 1, letterSpacing: '0.2em' }}
              transition={{ delay: 0.8, duration: 0.8 }}
            >
              Secure Banking
            </motion.p>
          </motion.div>

          {/* Loading bar */}
          <motion.div
            className="mt-8 h-0.5 rounded-full bg-accent/20 overflow-hidden"
            style={{ width: 120 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 1.8, delay: 0.6, ease: 'easeInOut' }}
            />
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SplashScreen;
