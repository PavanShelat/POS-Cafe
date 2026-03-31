import { useEffect, useMemo, useState } from 'react';
import { subDays, subMonths, format, isAfter, startOfDay } from 'date-fns';
import { BarChart3, TrendingUp, ShoppingCart, DollarSign, Users, Clock, Download, Receipt, Landmark } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { usePOS } from '@/context/POSContext';
import { POSLayout } from '@/components/pos/POSLayout';
import { ReportsChatWidget } from '@/components/reports/ReportsChatWidget';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet, apiGetBlob } from '@/lib/api';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

type RangeFilter = 'day' | 'week' | 'month';

type GstReport = {
  start_date: string;
  end_date: string;
  total_sales: number;
  total_cgst: number;
  total_sgst: number;
  total_orders: number;
};

const rangeOptions: { id: RangeFilter; label: string }[] = [
  { id: 'day', label: 'Last Day' },
  { id: 'week', label: 'Last Week' },
  { id: 'month', label: 'Last Month' },
];

const chartConfig = {
  sales: { label: 'Sales', color: 'hsl(var(--primary))' },
  orders: { label: 'Orders', color: 'hsl(var(--accent))' },
  category: { label: 'Category Share', color: 'hsl(var(--chart-2, 215 85% 55%))' },
} as const;

const pieColors = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--chart-2, 215 85% 55%))',
  'hsl(var(--chart-3, 35 90% 55%))',
  'hsl(var(--chart-4, 142 72% 45%))',
  'hsl(var(--chart-5, 340 80% 55%))',
];

function formatDateInput(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export default function ReportsPage() {
  const { orders, session, config, categories } = usePOS();
  const [range, setRange] = useState<RangeFilter>('week');
  const [reportStartDate, setReportStartDate] = useState(formatDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [reportEndDate, setReportEndDate] = useState(formatDateInput(new Date()));
  const [gstReport, setGstReport] = useState<GstReport | null>(null);
  const [loadingGstReport, setLoadingGstReport] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadGstReport = async () => {
      setLoadingGstReport(true);
      try {
        const data = await apiGet<GstReport>(`/api/reports/gst?start_date=${reportStartDate}&end_date=${reportEndDate}`);
        if (mounted) {
          setGstReport(data);
        }
      } finally {
        if (mounted) {
          setLoadingGstReport(false);
        }
      }
    };

    loadGstReport();

    return () => {
      mounted = false;
    };
  }, [reportEndDate, reportStartDate]);

  const now = new Date();
  const rangeStart =
    range === 'day'
      ? subDays(now, 1)
      : range === 'week'
        ? subDays(now, 7)
        : subMonths(now, 1);

  const filteredOrders = orders.filter((order) => isAfter(new Date(order.created_at), rangeStart));
  const confirmedOrders = filteredOrders.filter((order) => order.status === 'confirmed');
  const paidOrders = filteredOrders.filter((order) => order.payment_status === 'paid' && order.status !== 'cancelled');
  const customerOrders = filteredOrders.filter((order) => order.source === 'customer');

  const totalSales = paidOrders.reduce((sum, order) => sum + order.total_amount, 0);
  const averageOrder = paidOrders.length > 0 ? totalSales / paidOrders.length : 0;

  const { productSalesData, categorySalesData, salesTrendData } = useMemo(() => {
    const salesByProductMap = new Map<string, { name: string; sales: number; quantity: number }>();
    const salesByCategoryMap = new Map<string, { name: string; sales: number; quantity: number }>();
    const salesTrendMap = new Map<string, { label: string; sales: number; orders: number }>();

    paidOrders.forEach((order) => {
      const trendKey = format(startOfDay(new Date(order.created_at)), 'dd MMM');
      const trendEntry = salesTrendMap.get(trendKey) || { label: trendKey, sales: 0, orders: 0 };
      trendEntry.sales += order.total_amount;
      trendEntry.orders += 1;
      salesTrendMap.set(trendKey, trendEntry);

      order.items.forEach((item) => {
        const existingProduct = salesByProductMap.get(item.product_id) || {
          name: item.product.name,
          sales: 0,
          quantity: 0,
        };
        existingProduct.sales += item.price * item.quantity;
        existingProduct.quantity += item.quantity;
        salesByProductMap.set(item.product_id, existingProduct);

        const categoryName =
          categories.find((category) => category.id === item.product.category)?.name || 'Uncategorized';
        const existingCategory = salesByCategoryMap.get(categoryName) || {
          name: categoryName,
          sales: 0,
          quantity: 0,
        };
        existingCategory.sales += item.price * item.quantity;
        existingCategory.quantity += item.quantity;
        salesByCategoryMap.set(categoryName, existingCategory);
      });
    });

    return {
      productSalesData: Array.from(salesByProductMap.values())
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 8)
        .map((item) => ({
          name: item.name,
          sales: item.sales,
          quantity: item.quantity,
        })),
      categorySalesData: Array.from(salesByCategoryMap.values())
        .sort((a, b) => b.sales - a.sales)
        .map((item) => ({
          name: item.name,
          sales: item.sales,
          quantity: item.quantity,
        })),
      salesTrendData: Array.from(salesTrendMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [categories, paidOrders]);

  const handleExportGst = async () => {
    const blob = await apiGetBlob(`/api/reports/gst/export?start_date=${reportStartDate}&end_date=${reportEndDate}`);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gst-report-${reportStartDate}-to-${reportEndDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const stats = [
    {
      title: 'Total Sales',
      value: `${config.currency}${totalSales.toLocaleString()}`,
      description: `Revenue for ${range}`,
      icon: DollarSign,
      color: 'text-status-completed',
      bgColor: 'bg-status-completed/10',
    },
    {
      title: 'Orders',
      value: filteredOrders.length.toString(),
      description: `${confirmedOrders.length} confirmed`,
      icon: ShoppingCart,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      title: 'QR Orders',
      value: customerOrders.length.toString(),
      description: 'Customer self-orders',
      icon: Users,
      color: 'text-status-pending',
      bgColor: 'bg-status-pending/10',
    },
    {
      title: 'Avg Order',
      value: `${config.currency}${Math.round(averageOrder).toLocaleString()}`,
      description: 'Per paid order',
      icon: TrendingUp,
      color: 'text-kitchen-preparing',
      bgColor: 'bg-kitchen-preparing/10',
    },
  ];

  return (
    <POSLayout>
      <div className="p-6">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Reports</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {rangeOptions.map((option) => (
              <Button
                key={option.id}
                variant={range === option.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRange(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {session?.is_active && (
          <Card className="mb-6 border-accent/30 bg-accent/5">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-accent/20">
                <Clock className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Session</p>
                <p className="font-semibold">Started {new Date(session.opened_at).toLocaleTimeString()}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                    <p className="text-3xl font-bold">{stat.value}</p>
                    <p className="text-sm text-muted-foreground mt-1">{stat.description}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mb-8">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5" />
                GST Report
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Monthly filing summary with Excel export</p>
            </div>
            <Button variant="outline" onClick={handleExportGst} disabled={loadingGstReport || !gstReport}>
              <Download className="h-4 w-4 mr-2" />
              Export XLSX
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <div className="h-10 rounded-md border px-3 flex items-center text-sm text-muted-foreground">
                  {loadingGstReport ? 'Refreshing GST report...' : 'Showing paid, non-cancelled orders'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <Receipt className="h-5 w-5 text-primary" />
                    <p className="text-sm text-muted-foreground">Sales Before Tax</p>
                  </div>
                  <p className="text-2xl font-bold">{config.currency}{gstReport?.total_sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground mb-2">CGST Collected</p>
                  <p className="text-2xl font-bold">{config.currency}{gstReport?.total_cgst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground mb-2">SGST Collected</p>
                  <p className="text-2xl font-bold">{config.currency}{gstReport?.total_sgst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground mb-2">Orders Count</p>
                  <p className="text-2xl font-bold">{gstReport?.total_orders || 0}</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Sales Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <LineChart data={salesTrendData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="var(--color-sales)"
                    strokeWidth={3}
                    dot={{ fill: 'var(--color-sales)' }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Category Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <PieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={(value, name) => `${name}: ${config.currency}${Number(value).toLocaleString()}`} />}
                  />
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                  <Pie data={categorySalesData} dataKey="sales" nameKey="name" innerRadius={65} outerRadius={100}>
                    {categorySalesData.map((entry, index) => (
                      <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader>
              <CardTitle>Top Products by Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[340px] w-full">
                <BarChart data={productSalesData} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={140}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name, item) => {
                          if (name === 'sales') {
                            return `${config.currency}${Number(value).toLocaleString()}`;
                          }
                          return item?.payload?.quantity || value;
                        }}
                      />
                    }
                  />
                  <Bar dataKey="sales" fill="var(--color-sales)" radius={8} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>
      <ReportsChatWidget />
    </POSLayout>
  );
}
