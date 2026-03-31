import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { POSLayout } from '@/components/pos/POSLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Plus, Trash2, Shield, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiPost } from '@/lib/api';

interface StaffMember {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function StaffManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({ email: '', password: '', full_name: '', role: 'cashier' });

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const data = await apiPost<StaffMember[]>('/api/manage-staff', { action: 'list_staff' });
      setStaff(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({ title: 'Error', description: err?.message || 'Failed to load staff', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleCreateStaff = async () => {
    setCreating(true);
    try {
      await apiPost('/api/manage-staff', { action: 'create_user', ...newStaff });
      toast({ title: 'Staff member created', description: `${newStaff.full_name} added as ${newStaff.role}` });
      setNewStaff({ email: '', password: '', full_name: '', role: 'cashier' });
      setDialogOpen(false);
      fetchStaff();
    } catch (err) {
      toast({ title: 'Error', description: err?.message || 'Failed to create staff', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteStaff = async (userId: string) => {
    if (userId === user?.id) {
      toast({ title: 'Cannot delete yourself', variant: 'destructive' });
      return;
    }
    setDeletingUserId(userId);
    try {
      await apiPost('/api/manage-staff', { action: 'delete_user', user_id: userId });
      setStaff((prev) => prev.filter((member) => member.user_id !== userId));
      toast({ title: 'Staff member removed' });
    } catch (err) {
      toast({ title: 'Error', description: err?.message || 'Failed to delete staff', variant: 'destructive' });
    } finally {
      setDeletingUserId(null);
    }
  };

  const roleBadgeColor: Record<string, string> = {
    admin: 'bg-red-500/10 text-red-600 border-red-200',
    cashier: 'bg-blue-500/10 text-blue-600 border-blue-200',
    kitchen: 'bg-amber-500/10 text-amber-600 border-amber-200',
  };

  return (
    <POSLayout>
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Staff Management</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Staff
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Staff Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={newStaff.full_name} onChange={e => setNewStaff(s => ({ ...s, full_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={newStaff.email} onChange={e => setNewStaff(s => ({ ...s, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={newStaff.password} onChange={e => setNewStaff(s => ({ ...s, password: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newStaff.role} onValueChange={v => setNewStaff(s => ({ ...s, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="cashier">Cashier</SelectItem>
                      <SelectItem value="kitchen">Kitchen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateStaff} className="w-full" disabled={creating || !newStaff.email || !newStaff.password || !newStaff.full_name}>
                  {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Create Staff Account
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {staff.map(member => (
              <Card key={member.user_id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{member.full_name}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={roleBadgeColor[member.role] || ''}>
                      {member.role}
                    </Badge>
                    {member.user_id !== user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        disabled={deletingUserId === member.user_id}
                        onClick={() => handleDeleteStaff(member.user_id)}
                      >
                        {deletingUserId === member.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {staff.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No staff members yet. Add your first team member.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </POSLayout>
  );
}
