import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, ArrowLeft, Loader2, Bell, DollarSign, Check } from 'lucide-react';
import PinInput from '@/components/PinInput';
import TransactionAnimation from '@/components/TransactionAnimation';
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  user_id: string;
  from_user_id: string | null;
  type: string;
  title: string;
  message: string;
  amount: number | null;
  is_read: boolean;
  created_at: string;
}

const Notifications = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [payNotif, setPayNotif] = useState<Notification | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [txnStatus, setTxnStatus] = useState<'processing' | 'success' | 'failed' | null>(null);
  const [txnMessage, setTxnMessage] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user]);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const channel = supabase
        .channel('notif-changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
          fetchNotifications();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    setNotifications((data as unknown as Notification[]) || []);
    setLoading(false);
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true } as any).eq('id', id);
  };

  const handlePayRequest = (notif: Notification) => {
    setPayNotif(notif);
    setShowPin(true);
  };

  const handlePinSubmit = async (pin: string) => {
    if (!payNotif || !payNotif.from_user_id || !payNotif.amount) return;
    setShowPin(false);
    setTxnStatus('processing');

    const { data, error } = await supabase.rpc('send_to_user', {
      p_receiver_user_id: payNotif.from_user_id,
      p_amount: payNotif.amount,
      p_pin: pin,
    });
    const result = data as unknown as { success: boolean; error?: string };

    if (error || !result?.success) {
      setTxnStatus('failed');
      setTxnMessage(result?.error || error?.message || 'Transaction failed');
    } else {
      setTxnStatus('success');
      setTxnMessage(`$${payNotif.amount.toFixed(2)} sent successfully`);
      markRead(payNotif.id);
      fetchNotifications();
    }
  };

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-accent" />
          <span className="text-lg font-bold text-foreground">FinCore</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
        </Button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6" /> Notifications
        </h1>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No notifications yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <Card key={n.id} className={`transition-colors ${!n.is_read ? 'border-accent/30 bg-accent/5' : ''}`}>
                <CardContent className="py-4 flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${n.type === 'money_request' ? 'bg-primary/10' : 'bg-accent/10'}`}>
                    <DollarSign className={`h-4 w-4 ${n.type === 'money_request' ? 'text-primary' : 'text-accent'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  {n.type === 'money_request' && n.amount && !n.is_read && (
                    <Button size="sm" onClick={() => handlePayRequest(n)}>
                      Pay ${n.amount.toFixed(2)}
                    </Button>
                  )}
                  {!n.is_read && n.type !== 'money_request' && (
                    <Button size="sm" variant="ghost" onClick={() => { markRead(n.id); fetchNotifications(); }}>
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <PinInput open={showPin} onClose={() => setShowPin(false)} onSubmit={handlePinSubmit} />
      <TransactionAnimation status={txnStatus} onClose={() => { setTxnStatus(null); setPayNotif(null); }} message={txnMessage} />
    </div>
  );
};

export default Notifications;
