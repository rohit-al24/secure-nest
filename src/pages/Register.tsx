import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Loader2, Eye, EyeOff, Copy, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import PinSetup from '@/components/PinSetup';

const Register = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });

    if (error) {
      setLoading(false);
      toast({ title: 'Registration failed', description: error.message, variant: 'destructive' });
      return;
    }

    if (signUpData?.user) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data: accData } = await supabase
        .from('accounts')
        .select('account_number')
        .eq('user_id', signUpData.user.id)
        .single();
      if (accData) setAccountNumber(accData.account_number);
    }

    setLoading(false);
    setShowSuccess(true);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(accountNumber);
    setCopied(true);
    toast({ title: 'Copied!', description: 'Account number copied to clipboard.' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSuccessContinue = () => {
    setShowSuccess(false);
    setShowPinSetup(true);
  };

  const handlePinComplete = () => {
    setShowPinSetup(false);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="h-6 w-6 text-accent" />
            <span className="text-lg font-bold text-foreground">FinCore</span>
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Start banking securely in minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Account'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-accent font-medium hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>

      {/* Account Activated Dialog */}
      <Dialog open={showSuccess} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-3">
              <CheckCircle2 className="h-12 w-12 text-accent" />
            </div>
            <DialogTitle className="text-xl">Your Account is Activated!</DialogTitle>
            <DialogDescription>
              Your FinCore account has been created. Save your account number below, then set up your transaction PIN.
            </DialogDescription>
          </DialogHeader>
          {accountNumber && (
            <div className="flex items-center gap-2 bg-muted rounded-lg p-3 mt-2">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">Your Account Number</p>
                <p className="font-mono text-lg font-bold text-foreground tracking-wider">{accountNumber}</p>
              </div>
              <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                {copied ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
          <Button onClick={handleSuccessContinue} className="w-full mt-2">Set Transaction PIN</Button>
        </DialogContent>
      </Dialog>

      {/* PIN Setup */}
      <PinSetup open={showPinSetup} onComplete={handlePinComplete} />
    </div>
  );
};

export default Register;
