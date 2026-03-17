import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, LogOut, History, Loader2, DollarSign, Wallet, Users, Bell, Search, User } from 'lucide-react';
import PinInput from '@/components/PinInput';
import PeopleList from '@/components/PeopleList';
import TransactionAnimation from '@/components/TransactionAnimation';
import type { Database } from '@/integrations/supabase/types';

type Account = Database['public']['Tables']['accounts']['Row'];
type Transaction = Database['public']['Tables']['transactions']['Row'];

interface Person {
  user_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
}

const Dashboard = () => {
  const { user, profile, signOut, loading: authLoading, roles } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Modal states
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [recipientAccount, setRecipientAccount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  // PIN & animation states
  const [showPin, setShowPin] = useState(false);
  const [pinAction, setPinAction] = useState<'withdraw' | 'transfer' | null>(null);
  const [txnStatus, setTxnStatus] = useState<'processing' | 'success' | 'failed' | null>(null);
  const [txnMessage, setTxnMessage] = useState('');

  // Transfer: people search
  const [transferSearch, setTransferSearch] = useState('');
  const [transferPeople, setTransferPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
    if (!authLoading && roles.includes('admin')) navigate('/admin');
  }, [authLoading, user, roles]);

  useEffect(() => {
    if (user) {
      fetchData();
      fetchUnread();
      const channel = supabase
        .channel('account-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${user.id}` }, () => fetchAccount())
        .subscribe();
      const notifChannel = supabase
        .channel('notif-badge')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchUnread())
        .subscribe();
      return () => { supabase.removeChannel(channel); supabase.removeChannel(notifChannel); };
    }
  }, [user]);

  const fetchData = async () => {
    setLoadingData(true);
    await Promise.all([fetchAccount(), fetchTransactions()]);
    setLoadingData(false);
  };

  const fetchAccount = async () => {
    const { data } = await supabase.from('accounts').select('*').eq('user_id', user!.id).single();
    if (data) setAccount(data);
  };

  const fetchTransactions = async () => {
    const { data: accs } = await supabase.from('accounts').select('id').eq('user_id', user!.id);
    if (!accs?.length) return;
    const accId = accs[0].id;
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .or(`sender_account_id.eq.${accId},receiver_account_id.eq.${accId}`)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setTransactions(data);
  };

  const fetchUnread = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);
    setUnreadCount(count || 0);
  };

  // Fetch people for transfer dialog
  useEffect(() => {
    if (!transferOpen) return;
    const timer = setTimeout(() => {
      setLoadingPeople(true);
      supabase.rpc('get_people_list', { p_search: transferSearch }).then(({ data }) => {
        setTransferPeople((data as unknown as Person[]) || []);
        setLoadingPeople(false);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [transferSearch, transferOpen]);

  const handleDeposit = async () => {
    if (!account || !amount) return;
    setProcessing(true);
    const { data, error } = await supabase.rpc('deposit_funds', { p_account_id: account.id, p_amount: parseFloat(amount) });
    setProcessing(false);
    const result = data as unknown as { success: boolean; error?: string };
    if (error || !result?.success) {
      toast({ title: 'Deposit Failed', description: result?.error || error?.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deposit Successful', description: `$${parseFloat(amount).toFixed(2)} deposited.` });
      setDepositOpen(false);
      setAmount('');
      fetchData();
    }
  };

  const initiateWithdraw = () => {
    if (!amount) return;
    setPinAction('withdraw');
    setWithdrawOpen(false);
    setShowPin(true);
  };

  const initiateTransfer = () => {
    setPinAction('transfer');
    setTransferOpen(false);
    setConfirmTransfer(false);
    setShowPin(true);
  };

  const handlePinSubmit = async (pin: string) => {
    setShowPin(false);
    setTxnStatus('processing');

    if (pinAction === 'withdraw') {
      const { data, error } = await supabase.rpc('withdraw_funds', {
        p_account_id: account!.id,
        p_amount: parseFloat(amount),
        p_pin: pin,
      } as any);
      const result = data as unknown as { success: boolean; error?: string };
      if (error || !result?.success) {
        setTxnStatus('failed');
        setTxnMessage(result?.error || error?.message || 'Withdrawal failed');
      } else {
        setTxnStatus('success');
        setTxnMessage(`$${parseFloat(amount).toFixed(2)} withdrawn successfully`);
        setAmount('');
        fetchData();
      }
    } else if (pinAction === 'transfer') {
      const { data, error } = await supabase.rpc('transfer_funds', {
        p_sender_account_id: account!.id,
        p_receiver_account_number: recipientAccount,
        p_amount: parseFloat(amount),
        p_pin: pin,
      } as any);
      const result = data as unknown as { success: boolean; error?: string };
      if (error || !result?.success) {
        setTxnStatus('failed');
        setTxnMessage(result?.error || error?.message || 'Transfer failed');
      } else {
        setTxnStatus('success');
        setTxnMessage(`$${parseFloat(amount).toFixed(2)} sent to ${recipientAccount}`);
        setAmount('');
        setRecipientAccount('');
        fetchData();
      }
    }
  };

  const selectTransferPerson = (person: Person) => {
    // Auto-fill: we need account number, so look it up by just setting the name context
    // Actually we'll use the account number approach - fetch account number for this user
    supabase.rpc('get_people_list', { p_search: person.email }).then(() => {
      // We can't get account number from people list (security), so user fills it
      // But we can hint by showing the name
      setRecipientAccount('');
      toast({ title: `Selected ${person.full_name}`, description: 'Please enter their account number to proceed.' });
    });
  };

  const getTxnDisplay = (txn: Transaction) => {
    if (!account) return { type: '', amount: '', icon: DollarSign, color: '' };
    if (txn.type === 'deposit') return { type: 'Deposit', amount: `+$${txn.amount.toFixed(2)}`, icon: ArrowDownLeft, color: 'text-accent' };
    if (txn.type === 'withdrawal') return { type: 'Withdrawal', amount: `-$${txn.amount.toFixed(2)}`, icon: ArrowUpRight, color: 'text-destructive' };
    if (txn.sender_account_id === account.id) return { type: 'Transfer Out', amount: `-$${txn.amount.toFixed(2)}`, icon: ArrowLeftRight, color: 'text-destructive' };
    return { type: 'Transfer In', amount: `+$${txn.amount.toFixed(2)}`, icon: ArrowLeftRight, color: 'text-accent' };
  };

  if (authLoading || loadingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-accent" />
          <span className="text-lg font-bold text-foreground">FinCore</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPeopleOpen(true)}>
            <Users className="h-4 w-4 mr-1" /> People
          </Button>
          <Button variant="ghost" size="sm" className="relative" onClick={() => navigate('/notifications')}>
            <Bell className="h-4 w-4 mr-1" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            Alerts
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/history')}>
            <History className="h-4 w-4 mr-1" /> History
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome back, {profile?.full_name || 'User'}</h1>
          <p className="text-muted-foreground text-sm mt-1">Account: {account?.account_number}</p>
        </div>

        {/* Balance Card */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Total Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-foreground tracking-tight">
              ${account?.balance?.toFixed(2) || '0.00'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{account?.account_type === 'savings' ? 'Savings' : 'Checking'} Account</p>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <Button variant="outline" className="h-16 flex-col gap-1" onClick={() => setDepositOpen(true)}>
            <ArrowDownLeft className="h-5 w-5 text-accent" />
            <span className="text-sm font-medium">Deposit</span>
          </Button>
          <Button variant="outline" className="h-16 flex-col gap-1" onClick={() => setWithdrawOpen(true)}>
            <ArrowUpRight className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium">Withdraw</span>
          </Button>
          <Button variant="outline" className="h-16 flex-col gap-1" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Transfer</span>
          </Button>
        </div>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <Button variant="link" size="sm" onClick={() => navigate('/history')}>View all</Button>
            </div>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Hash</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(txn => {
                    const display = getTxnDisplay(txn);
                    return (
                      <TableRow key={txn.id}>
                        <TableCell className="font-medium">{display.type}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">
                            {txn.txn_hash ? txn.txn_hash.substring(0, 8) + '...' : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{new Date(txn.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className={`text-right font-semibold ${display.color}`}>{display.amount}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Deposit Modal (no PIN needed) */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deposit Funds</DialogTitle>
            <DialogDescription>Add funds to your account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount ($)</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
            <Button onClick={handleDeposit} disabled={processing || !amount}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Deposit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Modal */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Funds</DialogTitle>
            <DialogDescription>Enter amount, then verify with your PIN</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount ($)</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button onClick={initiateWithdraw} disabled={!amount}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal with People Search */}
      <Dialog open={transferOpen} onOpenChange={(open) => { setTransferOpen(open); setConfirmTransfer(false); setTransferSearch(''); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transfer Funds</DialogTitle>
            <DialogDescription>Send money to another account</DialogDescription>
          </DialogHeader>
          {!confirmTransfer ? (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Recipient Account Number</Label>
                  <Input placeholder="FC00000000" value={recipientAccount} onChange={e => setRecipientAccount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Amount ($)</Label>
                  <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>

                {/* People search in transfer */}
                <div className="border-t border-border pt-4">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide mb-2 block">Or find a person</Label>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Search users..." className="pl-9 h-9 text-sm" value={transferSearch} onChange={e => setTransferSearch(e.target.value)} />
                  </div>
                  <ScrollArea className="max-h-[140px]">
                    {loadingPeople ? (
                      <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                    ) : transferPeople.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No users found</p>
                    ) : (
                      <div className="space-y-0.5">
                        {transferPeople.slice(0, 5).map(p => (
                          <button
                            key={p.user_id}
                            onClick={() => selectTransferPerson(p)}
                            className="w-full flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted transition-colors text-left"
                          >
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{p.full_name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
                <Button onClick={() => setConfirmTransfer(true)} disabled={!amount || !recipientAccount}>Continue</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <p className="text-sm text-muted-foreground">You are about to transfer:</p>
                <p className="text-2xl font-bold text-foreground">${parseFloat(amount).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">To account: <span className="font-mono font-medium text-foreground">{recipientAccount}</span></p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmTransfer(false)}>Back</Button>
                <Button onClick={initiateTransfer}>Confirm & Enter PIN</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* People List */}
      <PeopleList open={peopleOpen} onClose={() => setPeopleOpen(false)} />

      {/* PIN Input */}
      <PinInput
        open={showPin}
        onClose={() => { setShowPin(false); setPinAction(null); }}
        onSubmit={handlePinSubmit}
        title={pinAction === 'withdraw' ? 'Confirm Withdrawal' : 'Confirm Transfer'}
        description={`Enter your PIN to ${pinAction === 'withdraw' ? 'withdraw' : 'transfer'} $${amount ? parseFloat(amount).toFixed(2) : '0.00'}`}
      />

      {/* Transaction Animation */}
      <TransactionAnimation
        status={txnStatus}
        onClose={() => { setTxnStatus(null); setPinAction(null); }}
        message={txnMessage}
      />
    </div>
  );
};

export default Dashboard;
