import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, ArrowLeft, Loader2, Download } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Transaction = Database['public']['Tables']['transactions']['Row'];

const TransactionHistory = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user]);

  useEffect(() => {
    if (user) fetchAccountId();
  }, [user]);

  useEffect(() => {
    if (accountId) fetchTransactions();
  }, [accountId, typeFilter, dateFrom, dateTo]);

  const fetchAccountId = async () => {
    const { data } = await supabase.from('accounts').select('id').eq('user_id', user!.id).single();
    if (data) setAccountId(data.id);
  };

  const fetchTransactions = async () => {
    if (!accountId) return;
    setLoading(true);
    let query = supabase
      .from('transactions')
      .select('*')
      .or(`sender_account_id.eq.${accountId},receiver_account_id.eq.${accountId}`)
      .order('created_at', { ascending: false });

    if (typeFilter !== 'all') {
      query = query.eq('type', typeFilter as 'deposit' | 'withdrawal' | 'transfer');
    }
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

    const { data } = await query;
    setTransactions(data || []);
    setLoading(false);
  };

  const getTxnDisplay = (txn: Transaction) => {
    if (txn.type === 'deposit') return { type: 'Deposit', amount: `+$${txn.amount.toFixed(2)}`, color: 'text-accent' };
    if (txn.type === 'withdrawal') return { type: 'Withdrawal', amount: `-$${txn.amount.toFixed(2)}`, color: 'text-destructive' };
    if (txn.sender_account_id === accountId) return { type: 'Transfer Out', amount: `-$${txn.amount.toFixed(2)}`, color: 'text-destructive' };
    return { type: 'Transfer In', amount: `+$${txn.amount.toFixed(2)}`, color: 'text-accent' };
  };

  const downloadCSV = () => {
    const headers = ['Date', 'Type', 'Hash', 'Amount', 'Status'];
    const rows = transactions.map(txn => {
      const d = getTxnDisplay(txn);
      const txnAny = txn as any;
      return [new Date(txn.created_at).toLocaleDateString(), d.type, txnAny.txn_hash || '', d.amount, txnAny.is_successful !== false ? 'Success' : 'Failed'];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fincore-statement.csv';
    a.click();
    URL.revokeObjectURL(url);
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

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Transaction History</h1>
          <Button variant="outline" size="sm" onClick={downloadCSV} disabled={transactions.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Download CSV
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="deposit">Deposit</SelectItem>
                    <SelectItem value="withdrawal">Withdrawal</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>From Date</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To Date</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No transactions found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Hash Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(txn => {
                    const display = getTxnDisplay(txn);
                    const txnAny = txn as any;
                    return (
                      <TableRow key={txn.id}>
                        <TableCell className="text-muted-foreground">{new Date(txn.created_at).toLocaleString()}</TableCell>
                        <TableCell className="font-medium">{display.type}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">
                            {txnAny.txn_hash ? txnAny.txn_hash.substring(0, 12) + '...' : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${txnAny.is_successful !== false ? 'bg-accent/10 text-accent' : 'bg-destructive/10 text-destructive'}`}>
                            {txnAny.is_successful !== false ? 'Success' : 'Failed'}
                          </span>
                        </TableCell>
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
    </div>
  );
};

export default TransactionHistory;
