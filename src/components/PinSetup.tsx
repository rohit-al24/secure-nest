import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Button } from '@/components/ui/button';
import { Loader2, Lock, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface PinSetupProps {
  open: boolean;
  onComplete: () => void;
}

const PinSetup = ({ open, onComplete }: PinSetupProps) => {
  const [step, setStep] = useState<'enter' | 'confirm' | 'done'>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleEnterComplete = (value: string) => {
    setPin(value);
    if (value.length === 4) {
      setTimeout(() => setStep('confirm'), 200);
    }
  };

  const handleConfirmComplete = async (value: string) => {
    setConfirmPin(value);
    if (value.length === 4) {
      if (value !== pin) {
        toast({ title: 'PINs do not match', description: 'Please try again.', variant: 'destructive' });
        setStep('enter');
        setPin('');
        setConfirmPin('');
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.rpc('set_user_pin', { p_pin: value });
      setLoading(false);
      const result = data as unknown as { success: boolean; error?: string };
      if (error || !result?.success) {
        toast({ title: 'Failed to set PIN', description: result?.error || error?.message, variant: 'destructive' });
        setStep('enter');
        setPin('');
        setConfirmPin('');
      } else {
        setStep('done');
        setTimeout(onComplete, 1500);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <AnimatePresence mode="wait">
          {step === 'done' ? (
            <motion.div
              key="done"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center py-6"
            >
              <CheckCircle2 className="h-16 w-16 text-accent mb-4" />
              <p className="text-lg font-semibold text-foreground">PIN Set Successfully!</p>
              <p className="text-sm text-muted-foreground mt-1">Your account is now secured.</p>
            </motion.div>
          ) : (
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <DialogHeader className="text-center">
                <div className="flex justify-center mb-2">
                  <Lock className="h-10 w-10 text-accent" />
                </div>
                <DialogTitle>{step === 'enter' ? 'Set Your Transaction PIN' : 'Confirm Your PIN'}</DialogTitle>
                <DialogDescription>
                  {step === 'enter'
                    ? 'Create a 4-digit PIN to secure all outgoing transactions.'
                    : 'Re-enter your PIN to confirm.'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center mt-6 mb-4">
                {step === 'enter' ? (
                  <InputOTP maxLength={4} value={pin} onChange={handleEnterComplete}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                    </InputOTPGroup>
                  </InputOTP>
                ) : (
                  <InputOTP maxLength={4} value={confirmPin} onChange={handleConfirmComplete}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                    </InputOTPGroup>
                  </InputOTP>
                )}
              </div>
              {loading && (
                <div className="flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default PinSetup;
