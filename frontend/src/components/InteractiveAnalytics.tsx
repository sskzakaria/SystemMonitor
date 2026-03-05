import { useState, useMemo } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { 
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Download, Filter, TrendingUp, AlertTriangle, Activity, HardDrive } from 'lucide-react';
import { toast } from 'sonner';

interface InteractiveAnalyticsProps {
  machines: any[];
  onDrillDown?: (filter: { building?: string; status?: string; metric?: string }) => void;
}

export function InteractiveAnalytics({ machines, onDrillDown }: InteractiveAnalyticsProps) {
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'cpu' | 'memory' | 'disk' | null>(null);

  // Calculate analytics data
  const buildingStats = useMemo(() => {
    const stats: Record<string, { total: number; online: number; offline: number; avgCpu: number; avgMemory: number; avgDisk: number }> = {};
    
    machines.forEach(machine => {
      const building = machine.building || 'Unknown';
      if (!stats[building]) {
        stats[building] = { total: 0, online: 0, offline: 0, avgCpu: 0, avgMemory: 0, avgDisk: 0 };
      }
      stats[building].total += 1;
      if (machine.status === 'online') {
        stats[building].online += 1;
        stats[building].avgCpu += machine.cpu_usage || 0;
        stats[building].avgMemory += machine.memory_usage || 0;
        stats[building].avgDisk += machine.disk_usage || 0;
      } else {
        stats[building].offline += 1;
      }
    });

    // Calculate averages
    Object.keys(stats).forEach(building => {
      const onlineCount = stats[building].online || 1;
      stats[building].avgCpu = Math.round(stats[building].avgCpu / onlineCount);
      stats[building].avgMemory = Math.round(stats[building].avgMemory / onlineCount);
      stats[building].avgDisk = Math.round(stats[building].avgDisk / onlineCount);
    });

    return stats;
  }, [machines]);

  // Prepare chart data
  const buildingChartData = Object.entries(buildingStats).map(([name, stats]) => ({
    name,
    total: stats.total,
    online: stats.online,
    offline: stats.offline,
    avgCpu: stats.avgCpu,
    avgMemory: stats.avgMemory,
    avgDisk: stats.avgDisk,
  }));

  const statusData = [
    { 
      name: 'Online', 
      value: machines.filter(m => m.status === 'online').length,
      color: '#10b981'
    },
    { 
      name: 'Offline', 
      value: machines.filter(m => m.status === 'offline').length,
      color: '#ef4444'
    },
    { 
      name: 'Warning', 
      value: machines.filter(m => m.status === 'warning').length,
      color: '#f59e0b'
    },
  ];

  // Resource usage distribution
  const cpuDistribution = [
    { name: '0-25%', count: machines.filter(m => m.cpu_usage >= 0 && m.cpu_usage < 25).length },
    { name: '25-50%', count: machines.filter(m => m.cpu_usage >= 25 && m.cpu_usage < 50).length },
    { name: '50-75%', count: machines.filter(m => m.cpu_usage >= 50 && m.cpu_usage < 75).length },
    { name: '75-100%', count: machines.filter(m => m.cpu_usage >= 75).length },
  ];

  const memoryDistribution = [
    { name: '0-25%', count: machines.filter(m => m.memory_usage >= 0 && m.memory_usage < 25).length },
    { name: '25-50%', count: machines.filter(m => m.memory_usage >= 25 && m.memory_usage < 50).length },
    { name: '50-75%', count: machines.filter(m => m.memory_usage >= 50 && m.memory_usage < 75).length },
    { name: '75-100%', count: machines.filter(m => m.memory_usage >= 75).length },
  ];

  const handleBuildingClick = (data: any) => {
    const buildingName = data.name;
    setSelectedBuilding(buildingName);
    toast.info(`Filtering by building: ${buildingName}`);
    onDrillDown?.({ building: buildingName });
  };

  const handleStatusClick = (data: any) => {
    const status = data.name.toLowerCase();
    toast.info(`Filtering by status: ${status}`);
    onDrillDown?.({ status });
  };

  const handleMetricClick = (metric: 'cpu' | 'memory' | 'disk') => {
    setSelectedMetric(metric);
    toast.info(`Filtering by high ${metric} usage`);
    onDrillDown?.({ metric });
  };

  const handleClearFilters = () => {
    setSelectedBuilding(null);
    setSelectedMetric(null);
    toast.success('Filters cleared');
    onDrillDown?.({});
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    const toastId = toast.loading(`Preparing ${format.toUpperCase()} export...`);
    
    try {
      let endpoint = '/api/v1/export/machines';
      if (format === 'excel') {
        endpoint += '?format=xlsx';
      } else if (format === 'pdf') {
        endpoint = '/api/v1/export/pdf/system-report';
      } else {
        endpoint += '?format=csv';
      }

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(endpoint, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 404 || response.status === 502 || response.status === 503) {
          throw new Error('Backend server is not running');
        }
        throw new Error('Export failed');
      }

      // Validate content type
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error('Backend returned an error page');
      }

      const blob = await response.blob();
      
      // Check blob size
      if (blob.size < 100) {
        throw new Error('File is too small, likely an error response');
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const extension = format === 'pdf' ? 'pdf' : format === 'excel' ? 'xlsx' : 'csv';
      a.download = `system-report-${new Date().toISOString().split('T')[0]}.${extension}`;
      a.click();
      
      window.URL.revokeObjectURL(url);
      
      toast.success(`${format.toUpperCase()} export complete!`, { id: toastId });
    } catch (error) {
      console.error('Export error:', error);
      
      let errorMessage = 'Export failed';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Export timed out. Backend may be unavailable.';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage, { 
        id: toastId,
        duration: 5000,
        description: 'Make sure the backend server is running'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Export Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Interactive Analytics</h2>
          <p className="text-muted-foreground">Click on charts to drill down into specific data</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('csv')}
          >
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('excel')}
          >
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('pdf')}
          >
            <Download className="h-4 w-4 mr-2" />
            PDF Report
          </Button>
        </div>
      </div>

      {/* Active Filters */}
      {(selectedBuilding || selectedMetric) && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Active Filters:</span>
              {selectedBuilding && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  Building: {selectedBuilding}
                </span>
              )}
              {selectedMetric && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  High {selectedMetric.toUpperCase()} Usage
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-blue-600 hover:text-blue-700"
            >
              Clear All
            </Button>
          </div>
        </Card>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => handleMetricClick('cpu')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">High CPU Usage</p>
              <p className="text-2xl font-bold mt-1">
                {machines.filter(m => m.cpu_usage > 80).length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">machines &gt;80%</p>
            </div>
            <Activity className="h-8 w-8 text-orange-500" />
          </div>
        </Card>

        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => handleMetricClick('memory')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">High Memory Usage</p>
              <p className="text-2xl font-bold mt-1">
                {machines.filter(m => m.memory_usage > 80).length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">machines &gt;80%</p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-500" />
          </div>
        </Card>

        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => handleMetricClick('disk')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">High Disk Usage</p>
              <p className="text-2xl font-bold mt-1">
                {machines.filter(m => m.disk_usage > 80).length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">machines &gt;80%</p>
            </div>
            <HardDrive className="h-8 w-8 text-purple-500" />
          </div>
        </Card>

        <Card 
          className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => handleStatusClick({ name: 'Offline' })}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Offline Machines</p>
              <p className="text-2xl font-bold mt-1">
                {machines.filter(m => m.status === 'offline').length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">need attention</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Status Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">Click on a status to filter machines</p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                onClick={handleStatusClick}
                style={{ cursor: 'pointer' }}
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Machines by Building */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Machines by Building</h3>
          <p className="text-sm text-muted-foreground mb-4">Click on a building to filter</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={buildingChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar 
                dataKey="online" 
                fill="#10b981" 
                onClick={handleBuildingClick}
                style={{ cursor: 'pointer' }}
              />
              <Bar 
                dataKey="offline" 
                fill="#ef4444" 
                onClick={handleBuildingClick}
                style={{ cursor: 'pointer' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* CPU Usage Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">CPU Usage Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">Distribution of CPU usage across all machines</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cpuDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Memory Usage Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Memory Usage Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">Distribution of memory usage across all machines</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={memoryDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Resource Usage by Building */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4">Average Resource Usage by Building</h3>
          <p className="text-sm text-muted-foreground mb-4">Click on a building to see detailed breakdown</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={buildingChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="avgCpu" 
                stroke="#f59e0b" 
                name="Avg CPU %"
                strokeWidth={2}
                dot={{ r: 4, cursor: 'pointer' }}
                activeDot={{ r: 6, onClick: handleBuildingClick }}
              />
              <Line 
                type="monotone" 
                dataKey="avgMemory" 
                stroke="#3b82f6" 
                name="Avg Memory %"
                strokeWidth={2}
                dot={{ r: 4, cursor: 'pointer' }}
                activeDot={{ r: 6, onClick: handleBuildingClick }}
              />
              <Line 
                type="monotone" 
                dataKey="avgDisk" 
                stroke="#8b5cf6" 
                name="Avg Disk %"
                strokeWidth={2}
                dot={{ r: 4, cursor: 'pointer' }}
                activeDot={{ r: 6, onClick: handleBuildingClick }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
