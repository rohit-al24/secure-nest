import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, User, Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PinInput from './PinInput';
import TransactionAnimation from './TransactionAnimation';

interface Person {
  user_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
}

interface PeopleListProps {
  open: boolean;
  onClose: () => void;
}

const PeopleList = ({ open, onClose }: PeopleListProps) => {
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [actionType, setActionType] = useState<'request' | 'send' | null>(null);
  const [amount, setAmount] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [txnStatus, setTxnStatus] = useState<'processing' | 'success' | 'failed' | null>(null);
  const [txnMessage, setTxnMessage] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) fetchPeople('');
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => { if (open) fetchPeople(search); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchPeople = async (q: string) => {
    setLoading(true);
    const { data } = await supabase.rpc('get_people_list', { p_search: q }) as { data: Person[] | null };
    setPeople(data || []);
    setLoading(false);
  };

  const handlePersonClick = (person: Person) => {
    setSelectedPerson(person);
    setActionType(null);
    setAmount('');
  };

  const handleRequest = async () => {
    if (!selectedPerson || !amount) return;
    const { data, error } = await supabase.rpc('request_funds', {
      p_from_user_id: selectedPerson.user_id,
      p_amount: parseFloat(amount),
    });
    const result = data as unknown as { success: boolean; error?: string };
    if (error || !result?.success) {
      toast({ title: 'Request Failed', description: result?.error || error?.message, variant: 'destructive' });
    } else {
      toast({ title: 'Request Sent', description: `Requested $${parseFloat(amount).toFixed(2)} from ${selectedPerson.full_name}` });
      resetState();
    }
  };

  const handleSendWithPin = async (pin: string) => {
    if (!selectedPerson || !amount) return;
    setShowPin(false);
    setTxnStatus('processing');
    setPinLoading(true);

    const { data, error } = await supabase.rpc('send_to_user', {
      p_receiver_user_id: selectedPerson.user_id,
      p_amount: parseFloat(amount),
      p_pin: pin,
    });
    setPinLoading(false);
    const result = data as unknown as { success: boolean; error?: string };

    if (error || !result?.success) {
      setTxnStatus('failed');
      setTxnMessage(result?.error || error?.message || 'Transaction failed');
    } else {
      setTxnStatus('success');
      setTxnMessage(`$${parseFloat(amount).toFixed(2)} sent to ${selectedPerson.full_name}`);
    }
  };

  const resetState = () => {
    setSelectedPerson(null);
    setActionType(null);
    setAmount('');
    setShowPin(false);
    setTxnStatus(null);
    setTxnMessage('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <>
      <Dialog open={open && !showPin && !txnStatus} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="sm:max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedPerson ? selectedPerson.full_name : 'People'}</DialogTitle>
            <DialogDescription>
              {selectedPerson
                ? actionType
                  ? actionType === 'request'
                    ? 'Enter the amount to request'
                    : 'Enter the amount to send'
                  : 'Choose an action'
                : 'Search and select a user'}
            </DialogDescription>
          </DialogHeader>

          {!selectedPerson ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <ScrollArea className="max-h-[340px]">
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : people.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">No users found</p>
                ) : (
                  <div className="space-y-1">
                    {people.map((p) => (
                      <button
                        key={p.user_id}
                        onClick={() => handlePersonClick(p)}
                        className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted transition-colors text-left"
                      >
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          ) : !actionType ? (
            <div className="grid grid-cols-2 gap-3 py-4">
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => setActionType('request')}>
                <ArrowDownLeft className="h-6 w-6 text-accent" />
                <span>Request</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => setActionType('send')}>
                <ArrowUpRight className="h-6 w-6 text-primary" />
                <span>Send</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionType(null)}>Back</Button>
                {actionType === 'request' ? (
                  <Button onClick={handleRequest} disabled={!amount}>Send Request</Button>
                ) : (
                  <Button onClick={() => setShowPin(true)} disabled={!amount}>Continue</Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PinInput
        open={showPin}
        onClose={() => setShowPin(false)}
        onSubmit={handleSendWithPin}
        loading={pinLoading}
        title="Confirm Transfer"
        description={`Enter your PIN to send $${amount ? parseFloat(amount).toFixed(2) : '0.00'} to ${selectedPerson?.full_name || ''}`}
      />

      <TransactionAnimation
        status={txnStatus}
        onClose={() => { setTxnStatus(null); resetState(); handleClose(); }}
        message={txnMessage}
      />
    </>
  );
};

export default PeopleList;
