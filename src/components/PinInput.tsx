import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

interface PinInputProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  loading?: boolean;
  title?: string;
  description?: string;
}

const PinInput = ({ open, onClose, onSubmit, loading, title, description }: PinInputProps) => {
  const [pin, setPin] = useState('');

  const handleChange = (value: string) => {
    setPin(value);
    if (value.length === 4) {
      onSubmit(value);
      setTimeout(() => setPin(''), 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setPin(''); onClose(); } }}>
      <DialogContent className="sm:max-w-sm">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-2">
              <Lock className="h-10 w-10 text-accent" />
            </div>
            <DialogTitle>{title || 'Enter Your PIN'}</DialogTitle>
            <DialogDescription>{description || 'Enter your 4-digit transaction PIN to proceed.'}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center mt-6 mb-4">
            <InputOTP maxLength={4} value={pin} onChange={handleChange}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          {loading && (
            <div className="flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default PinInput;
