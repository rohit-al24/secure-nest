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
import { Shield, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, LogOut, History, Loader2, DollarSign, Wallet } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Account = Database['public']['Tables']['accounts']['Row'];
type Transaction = Database['public']['Tables']['transactions']['Row'];

const Dashboard = () => {
  const { user, profile, signOut, loading: authLoading, roles } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Modal states
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [recipientAccount, setRecipientAccount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
    if (!authLoading && roles.includes('admin')) navigate('/admin');
  }, [authLoading, user, roles]);

  useEffect(() => {
    if (user) {
      fetchData();
      // Realtime subscription for account balance
      const channel = supabase
        .channel('account-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${user.id}` }, () => {
          fetchAccount();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
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

  const handleWithdraw = async () => {
    if (!account || !amount) return;
    setProcessing(true);
    const { data, error } = await supabase.rpc('withdraw_funds', { p_account_id: account.id, p_amount: parseFloat(amount) });
    setProcessing(false);
    const result = data as unknown as { success: boolean; error?: string };
    if (error || !result?.success) {
      toast({ title: 'Withdrawal Failed', description: result?.error || error?.message, variant: 'destructive' });
    } else {
      toast({ title: 'Withdrawal Successful', description: `$${parseFloat(amount).toFixed(2)} withdrawn.` });
      setWithdrawOpen(false);
      setAmount('');
      fetchData();
    }
  };

  const handleTransfer = async () => {
    if (!account || !amount || !recipientAccount) return;
    setProcessing(true);
    const { data, error } = await supabase.rpc('transfer_funds', {
      p_sender_account_id: account.id,
      p_receiver_account_number: recipientAccount,
      p_amount: parseFloat(amount),
    });
    setProcessing(false);
    const result = data as unknown as { success: boolean; error?: string };
    if (error || !result?.success) {
      toast({ title: 'Transfer Failed', description: result?.error || error?.message, variant: 'destructive' });
    } else {
      toast({ title: 'Transfer Successful', description: `$${parseFloat(amount).toFixed(2)} sent to ${recipientAccount}.` });
      setTransferOpen(false);
      setConfirmTransfer(false);
      setAmount('');
      setRecipientAccount('');
      fetchData();
    }
  };

  const getTxnDisplay = (txn: Transaction) => {
    if (!account) return { type: '', amount: '', icon: DollarSign };
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
        <div className="flex items-center gap-3">
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

      {/* Deposit Modal */}
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
            <DialogDescription>Withdraw from your account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount ($)</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button onClick={handleWithdraw} disabled={processing || !amount}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Withdraw'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={transferOpen} onOpenChange={(open) => { setTransferOpen(open); setConfirmTransfer(false); }}>
        <DialogContent>
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
                <Button onClick={() => setConfirmTransfer(true)} disabled={!amount || !recipientAccount}>
                  Continue
                </Button>
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
                <Button onClick={handleTransfer} disabled={processing}>
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Transfer'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
