import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TransactionAnimationProps {
  status: 'processing' | 'success' | 'failed' | null;
  onClose: () => void;
  message?: string;
}

const TransactionAnimation = ({ status, onClose, message }: TransactionAnimationProps) => {
  if (!status) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="flex flex-col items-center text-center p-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          {status === 'processing' && (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="mb-6"
              >
                <Loader2 className="h-16 w-16 text-accent" />
              </motion.div>
              <p className="text-lg font-semibold text-foreground">Processing Transaction...</p>
              <p className="text-sm text-muted-foreground mt-1">Please wait</p>
              {/* Animated dots */}
              <div className="flex gap-1.5 mt-4">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-accent"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              {/* Confetti-like particles */}
              <div className="relative">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full bg-accent"
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{
                      x: Math.cos((i * Math.PI * 2) / 8) * 60,
                      y: Math.sin((i * Math.PI * 2) / 8) * 60,
                      opacity: 0,
                      scale: 0,
                    }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    style={{ left: '50%', top: '50%' }}
                  />
                ))}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                >
                  <CheckCircle2 className="h-20 w-20 text-accent" />
                </motion.div>
              </div>
              <motion.p
                className="text-xl font-bold text-foreground mt-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Transaction Successful!
              </motion.p>
              <motion.p
                className="text-sm text-muted-foreground mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {message || 'Your transaction has been completed.'}
              </motion.p>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                <Button className="mt-6" onClick={onClose}>Done</Button>
              </motion.div>
            </>
          )}

          {status === 'failed' && (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ duration: 0.5 }}
              >
                <XCircle className="h-20 w-20 text-destructive" />
              </motion.div>
              <motion.p
                className="text-xl font-bold text-foreground mt-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Transaction Failed
              </motion.p>
              <motion.p
                className="text-sm text-muted-foreground mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {message || 'Something went wrong. Please try again.'}
              </motion.p>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                <Button variant="outline" className="mt-6" onClick={onClose}>Close</Button>
              </motion.div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TransactionAnimation;
