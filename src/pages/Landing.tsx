import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-7 w-7 text-accent" />
          <span className="text-xl font-bold text-foreground tracking-tight">FinCore</span>
        </div>
        <div className="flex gap-3">
          <Button variant="heroOutline" size="sm" onClick={() => navigate('/login')}>
            Login
          </Button>
          <Button variant="hero" size="sm" onClick={() => navigate('/register')}>
            Open Account
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground mb-8">
            <Shield className="h-4 w-4 text-accent" />
            Bank-grade security & ACID compliance
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-foreground tracking-tight leading-tight mb-6">
            Modern Banking<br />Infrastructure
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto leading-relaxed">
            Secure transactions, real-time balances, and complete audit trails. Built for reliability.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" onClick={() => navigate('/register')}>
              Open an Account
            </Button>
            <Button variant="heroOutline" onClick={() => navigate('/login')}>
              Sign In
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} FinCore. Secure financial infrastructure.
      </footer>
    </div>
  );
};

export default Landing;
