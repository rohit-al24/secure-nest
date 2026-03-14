import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, LogOut, Loader2, Search, Users, Activity, ShieldCheck } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Transaction = Database['public']['Tables']['transactions']['Row'];
type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

const AdminDashboard = () => {
  const { user, loading: authLoading, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [accountCount, setAccountCount] = useState(0);
  const [todayVolume, setTodayVolume] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
    if (!authLoading && !roles.includes('admin')) navigate('/dashboard');
  }, [authLoading, user, roles]);

  useEffect(() => {
    if (user && roles.includes('admin')) fetchAdminData();
  }, [user, roles]);

  const fetchAdminData = async () => {
    setLoading(true);
    const [txnRes, auditRes, accRes] = await Promise.all([
      supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('accounts').select('id', { count: 'exact' }),
    ]);

    setTransactions(txnRes.data || []);
    setAuditLogs(auditRes.data || []);
    setAccountCount(accRes.count || 0);

    // Calculate today's volume
    const today = new Date().toISOString().split('T')[0];
    const todayTxns = (txnRes.data || []).filter(t => t.created_at.startsWith(today));
    setTodayVolume(todayTxns.reduce((sum, t) => sum + t.amount, 0));

    setLoading(false);
  };

  const filteredTxns = transactions.filter(t =>
    !searchTerm || t.id.includes(searchTerm) || t.type.includes(searchTerm.toLowerCase())
  );

  if (authLoading || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-accent" />
          <span className="text-lg font-bold text-foreground">FinCore</span>
          <span className="ml-2 text-xs font-medium bg-accent/10 text-accent px-2 py-0.5 rounded-full">Admin</span>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-1" /> Sign Out
        </Button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> Active Accounts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{accountCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Today's Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">${todayVolume.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold text-accent">Operational</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="transactions">
          <TabsList>
            <TabsTrigger value="transactions">All Transactions</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by ID or type..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="max-w-sm" />
            </div>
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTxns.map(txn => (
                      <TableRow key={txn.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{txn.id.slice(0, 8)}...</TableCell>
                        <TableCell className="font-medium capitalize">{txn.type}</TableCell>
                        <TableCell className="font-semibold">${txn.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">{txn.status}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{new Date(txn.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium capitalize">{log.action}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{log.user_id?.slice(0, 8) || 'N/A'}...</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{log.details ? JSON.stringify(log.details) : '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
