import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { usePOS } from '@/context/POSContext';
import { POSLayout } from '@/components/pos/POSLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Coffee, CreditCard, Download, Edit, MapPin, Package, Plus, QrCode, Settings, Trash2, Upload } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

function randomQrToken(tableNumber: string) {
  return `qr-${tableNumber.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function SettingsPage() {
  const {
    config,
    allProducts,
    categories,
    tables,
    floors,
    createProduct,
    importProducts,
    updateProduct,
    deleteProduct,
    createFloor,
    updateFloor,
    deleteFloor,
    createTable,
    updateTable,
    deleteTable,
    updateConfig,
  } = usePOS();
  const { toast } = useToast();

  const [restaurantName, setRestaurantName] = useState(config.restaurant_name);
  const [gstin, setGstin] = useState(config.gstin || '');
  const [upiId, setUpiId] = useState(config.upi_id || '');
  const [taxRate, setTaxRate] = useState(String(config.tax_rate || 0));

  const [newProduct, setNewProduct] = useState({ name: '', category_id: '', price: '', description: '' });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const [newFloorName, setNewFloorName] = useState('');
  const [editingFloor, setEditingFloor] = useState<{ id: string; name: string } | null>(null);

  const [newTable, setNewTable] = useState({ floor_id: '', table_number: '', seats: '2', qr_token: '' });
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<Array<{ id: string; name: string; category: string; price: string }>>([]);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');

  const qrRef = useRef<HTMLDivElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRestaurantName(config.restaurant_name);
    setGstin(config.gstin || '');
    setUpiId(config.upi_id || '');
    setTaxRate(String(config.tax_rate || 0));
  }, [config.restaurant_name, config.gstin, config.tax_rate, config.upi_id]);

  useEffect(() => {
    if (!newProduct.category_id && categories.length > 0) {
      setNewProduct((prev) => ({ ...prev, category_id: categories[0].id }));
    }
    if (!newTable.floor_id && floors.length > 0) {
      setNewTable((prev) => ({ ...prev, floor_id: floors[0].id }));
    }
  }, [categories, floors, newProduct.category_id, newTable.floor_id]);

  const getOrderUrl = (qrToken: string) => `${window.location.origin}/order/${qrToken}`;

  const downloadQR = (tableNumber: string) => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 400, 400);
      ctx.drawImage(img, 0, 0, 400, 400);
      const link = document.createElement('a');
      link.download = `QR-${tableNumber}.png`;
      link.href = canvas.toDataURL();
      link.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  const parseCsvLine = (line: string) => {
    const values: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (insideQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values.map((value) => value.replace(/^"|"$/g, '').trim());
  };

  const parseProductCsv = (csvText: string) => {
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      throw new Error('CSV should include a header row and at least one product row.');
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, ''));
    const nameIndex = headers.findIndex((header) => header === 'name' || header === 'productname');
    const categoryIndex = headers.findIndex((header) => header === 'category' || header === 'categoryname');
    const priceIndex = headers.findIndex((header) => header === 'price');

    if (nameIndex === -1 || categoryIndex === -1 || priceIndex === -1) {
      throw new Error('CSV header must include name, category and price columns.');
    }

    const rows = lines.slice(1).map((line, index) => {
      const columns = parseCsvLine(line);
      return {
        id: `${Date.now()}-${index}`,
        name: (columns[nameIndex] || '').trim(),
        category: (columns[categoryIndex] || '').trim(),
        price: (columns[priceIndex] || '').trim(),
      };
    }).filter((row) => row.name || row.category || row.price);

    if (rows.length === 0) {
      throw new Error('No product rows found in CSV.');
    }

    return rows;
  };

  const handleSaveGeneral = async () => {
    await updateConfig({
      restaurant_name: restaurantName,
      gstin,
      upi_id: upiId,
      tax_rate: Number(taxRate || 0),
    });
    toast({ title: 'Settings updated' });
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.category_id || !newProduct.price) return;
    await createProduct({
      name: newProduct.name,
      category_id: newProduct.category_id,
      price: Number(newProduct.price),
      description: newProduct.description || undefined,
      active: true,
    });
    setNewProduct({ name: '', category_id: categories[0]?.id || '', price: '', description: '' });
    toast({ title: 'Product added' });
  };

  const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const rows = parseProductCsv(content);
      setCsvRows(rows);
      setCsvFileName(file.name);
      setCsvDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Invalid CSV file',
        description: error instanceof Error ? error.message : 'Could not parse CSV file.',
        variant: 'destructive',
      });
    } finally {
      event.target.value = '';
    }
  };

  const updateCsvRow = (id: string, field: 'name' | 'category' | 'price', value: string) => {
    setCsvRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeCsvRow = (id: string) => {
    setCsvRows((prev) => prev.filter((row) => row.id !== id));
  };

  const handleConfirmCsvImport = async () => {
    if (csvRows.length === 0) {
      toast({ title: 'No products to import', variant: 'destructive' });
      return;
    }

    for (let i = 0; i < csvRows.length; i += 1) {
      const row = csvRows[i];
      const parsedPrice = Number(row.price);
      if (!row.name.trim() || !row.category.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
        toast({
          title: `Invalid row ${i + 1}`,
          description: 'Each row needs name, category, and a valid non-negative price.',
          variant: 'destructive',
        });
        return;
      }
    }

    setImportingCsv(true);
    try {
      const result = await importProducts(
        csvRows.map((row) => ({
          name: row.name.trim(),
          category: row.category.trim(),
          price: Number(row.price),
        }))
      );
      toast({
        title: 'Products imported',
        description: `${result.importedCount} products imported. ${result.createdCategories} new categories created.`,
      });
      setCsvDialogOpen(false);
      setCsvRows([]);
      setCsvFileName('');
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Could not import products.',
        variant: 'destructive',
      });
    } finally {
      setImportingCsv(false);
    }
  };

  const handleAddFloor = async () => {
    if (!newFloorName.trim()) return;
    await createFloor(newFloorName.trim());
    setNewFloorName('');
    toast({ title: 'Floor added' });
  };

  const handleAddTable = async () => {
    const tableNumber = newTable.table_number.trim();
    if (!newTable.floor_id || !tableNumber || !newTable.seats) return;
    await createTable({
      floor_id: newTable.floor_id,
      table_number: tableNumber,
      seats: Number(newTable.seats),
      qr_token: newTable.qr_token.trim() || randomQrToken(tableNumber),
      active: true,
      status: 'available',
    });
    setNewTable({ floor_id: floors[0]?.id || '', table_number: '', seats: '2', qr_token: '' });
    toast({ title: 'Table added' });
  };

  const groupedProducts = categories.map((category) => ({
    ...category,
    items: allProducts.filter((p) => p.category === category.id),
  }));

  return (
    <POSLayout>
      <div className="p-6 max-w-6xl">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="tables">Tables & QR</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coffee className="h-5 w-5" />
                  Restaurant Details
                </CardTitle>
                <CardDescription>Update restaurant and UPI details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Restaurant Name</Label>
                  <Input id="name" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upi">UPI ID</Label>
                  <Input id="upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input id="gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax-rate">GST Rate (%)</Label>
                  <Input id="tax-rate" type="number" min="0" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    CGST: {(Number(taxRate || 0) / 2).toFixed(2)}% | SGST: {(Number(taxRate || 0) / 2).toFixed(2)}%
                  </p>
                </div>
                <Button onClick={handleSaveGeneral}>Save Changes</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Add Product</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input placeholder="Name" value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} />
                <Select value={newProduct.category_id} onValueChange={(v) => setNewProduct((p) => ({ ...p, category_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Price" type="number" value={newProduct.price} onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))} />
                <Button onClick={handleAddProduct}><Plus className="h-4 w-4 mr-2" />Add</Button>
                <Input className="md:col-span-4" placeholder="Description" value={newProduct.description} onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Import Products CSV
                </CardTitle>
                <CardDescription>Upload CSV with columns: name, category, price. You can edit before confirming import.</CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleCsvFileChange}
                />
                <Button variant="outline" onClick={() => csvInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Product CSV
                </Button>
              </CardContent>
            </Card>

            <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>Review CSV Products {csvFileName ? `- ${csvFileName}` : ''}</DialogTitle>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-auto space-y-2 pr-1">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                    <span className="col-span-4">Name</span>
                    <span className="col-span-4">Category</span>
                    <span className="col-span-3">Price</span>
                    <span className="col-span-1 text-right">Action</span>
                  </div>
                  {csvRows.map((row) => (
                    <div key={row.id} className="grid grid-cols-12 gap-2">
                      <Input className="col-span-4" value={row.name} onChange={(e) => updateCsvRow(row.id, 'name', e.target.value)} />
                      <Input className="col-span-4" value={row.category} onChange={(e) => updateCsvRow(row.id, 'category', e.target.value)} />
                      <Input className="col-span-3" value={row.price} type="number" min="0" step="0.01" onChange={(e) => updateCsvRow(row.id, 'price', e.target.value)} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="col-span-1 text-destructive"
                        onClick={() => removeCsvRow(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCsvDialogOpen(false);
                      setCsvRows([]);
                      setCsvFileName('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleConfirmCsvImport} disabled={importingCsv || csvRows.length === 0}>
                    {importingCsv ? 'Importing...' : 'Confirm Import'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {groupedProducts.map((group) => (
              <Card key={group.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {group.name}
                    <Badge variant="secondary" className="ml-auto">{group.items.length} items</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.items.map((product) => (
                    <div key={product.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{config.currency}{product.price}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={product.active} onCheckedChange={(checked) => updateProduct(product.id, { active: checked })} />
                        <Dialog open={editingProductId === product.id} onOpenChange={(open) => setEditingProductId(open ? product.id : null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
                            <div className="space-y-3">
                              <Input defaultValue={product.name} onChange={(e) => (product.name = e.target.value)} />
                              <Input type="number" defaultValue={String(product.price)} onChange={(e) => (product.price = Number(e.target.value))} />
                              <Input defaultValue={product.description || ''} onChange={(e) => (product.description = e.target.value)} />
                              <Button onClick={async () => {
                                await updateProduct(product.id, { name: product.name, price: product.price, description: product.description });
                                setEditingProductId(null);
                              }}>Save</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => {
                          if (!window.confirm('Delete this product?')) return;
                          await deleteProduct(product.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="tables" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Floors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="New floor name" value={newFloorName} onChange={(e) => setNewFloorName(e.target.value)} />
                  <Button onClick={handleAddFloor}><Plus className="h-4 w-4 mr-2" />Add Floor</Button>
                </div>
                {floors.map((floor) => (
                  <div key={floor.id} className="flex items-center gap-2 rounded-md border p-2">
                    <Input value={editingFloor?.id === floor.id ? editingFloor.name : floor.name} onChange={(e) => setEditingFloor({ id: floor.id, name: e.target.value })} />
                    <Button variant="outline" onClick={async () => {
                      const name = editingFloor?.id === floor.id ? editingFloor.name : floor.name;
                      await updateFloor(floor.id, name);
                      setEditingFloor(null);
                    }}>Save</Button>
                    <Button variant="ghost" className="text-destructive" onClick={async () => {
                      if (!window.confirm('Delete this floor?')) return;
                      await deleteFloor(floor.id);
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />Add Table</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <Select value={newTable.floor_id} onValueChange={(v) => setNewTable((t) => ({ ...t, floor_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Floor" /></SelectTrigger>
                  <SelectContent>
                    {floors.map((floor) => (
                      <SelectItem key={floor.id} value={floor.id}>{floor.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Table No (T11)" value={newTable.table_number} onChange={(e) => setNewTable((t) => ({ ...t, table_number: e.target.value }))} />
                <Input placeholder="Seats" type="number" value={newTable.seats} onChange={(e) => setNewTable((t) => ({ ...t, seats: e.target.value }))} />
                <Input placeholder="QR token (optional)" value={newTable.qr_token} onChange={(e) => setNewTable((t) => ({ ...t, qr_token: e.target.value }))} />
                <Button onClick={handleAddTable}><Plus className="h-4 w-4 mr-2" />Add Table</Button>
              </CardContent>
            </Card>

            {floors.map((floor) => (
              <Card key={floor.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    {floor.name}
                    <Badge variant="secondary" className="ml-auto">{tables.filter((t) => t.floor_id === floor.id).length} tables</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tables.filter((t) => t.floor_id === floor.id).map((table) => (
                    <div key={table.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-bold">{table.table_number}</p>
                        <Switch checked={table.active} onCheckedChange={(checked) => updateTable(table.id, { active: checked })} />
                      </div>
                      <Input defaultValue={String(table.seats)} type="number" onBlur={(e) => updateTable(table.id, { seats: Number(e.target.value) })} />
                      <Input defaultValue={table.qr_token} onBlur={(e) => updateTable(table.id, { qr_token: e.target.value })} />
                      <div className="flex gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="flex-1"><QrCode className="h-4 w-4 mr-2" />QR</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>QR Code - {table.table_number}</DialogTitle></DialogHeader>
                            <div className="flex flex-col items-center py-4">
                              <div ref={qrRef} className="p-4 bg-white rounded-xl mb-4">
                                <QRCodeSVG value={getOrderUrl(table.qr_token)} size={200} level="H" includeMargin />
                              </div>
                              <code className="text-xs bg-muted px-2 py-1 rounded mb-4 break-all max-w-full">{getOrderUrl(table.qr_token)}</code>
                              <Button variant="outline" onClick={() => downloadQR(table.table_number)}>
                                <Download className="h-4 w-4 mr-2" />Download QR
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button variant="ghost" className="text-destructive" onClick={async () => {
                          if (!window.confirm('Delete this table?')) return;
                          await deleteTable(table.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="payments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment Methods</CardTitle>
                <CardDescription>Payment options are managed in order flows (POS and Customer QR).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Cash, Digital, and UPI are available in POS order payment selection.</p>
                <p>Customer QR orders support UPI and Digital payment methods.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </POSLayout>
  );
}
