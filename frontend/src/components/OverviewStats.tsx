import {
  MonitorData,
  HeartbeatMetrics,
} from "../types/monitor-schema";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Server,
  Users,
  Calendar,
  Filter,
  Cpu,
  HardDrive,
  Loader2,
  Clock,
} from "lucide-react";
import { CountUp } from "./ui/count-up";
import { useState, useMemo, useEffect } from "react";
import {
  HEALTH_COLORS,
  INFO_COLORS,
  HEALTH_COLORS as HC
} from "../lib/constants";
import { getFleetAnalytics } from "../services/api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { formatDistanceToNow } from "date-fns";

type ViewMode = 'all' | 'healthy' | 'warning' | 'critical' | 'active'
type TimeWindow = 'now' | 'today' | 'week' | 'month'

interface OverviewStatsProps {
  machines: MonitorData<HeartbeatMetrics>[];
  onFilterChange?: (filter: { type: 'health' | 'status' | 'resource', value: string }) => void;
  building?: string; // ✅ Add building filter support for historical averages
}

export function OverviewStats({
  machines,
  onFilterChange,
  building
}: OverviewStatsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('now')
  const [historicalAverages, setHistoricalAverages] = useState<any>(null)
  const [isLoadingHistorical, setIsLoadingHistorical] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)

  // Filter machines based on view mode - REAL-TIME
  const filteredMachines = useMemo(() => {
    switch (viewMode) {
      case 'healthy':
        return machines.filter(m => m.health?.status === 'healthy')
      case 'warning':
        return machines.filter(m => m.health?.status === 'warning')
      case 'critical':
        return machines.filter(m => m.health?.status === 'critical')
      case 'active':
        return machines.filter(m => m.metrics?.user_activity?.current_username)
      case 'all':
      default:
        return machines
    }
  }, [machines, viewMode])

  // ✅ DATA-DRIVEN: Fetch historical averages from backend API
  useEffect(() => {
    if (timeWindow === 'now') {
      setHistoricalAverages(null)
      setLastFetchTime(null)
      return
    }

    const fetchHistoricalData = async () => {
      setIsLoadingHistorical(true)

      try {
        // Map time window to API parameters
        // Backend expects: 1h, 24h, 7d, 30d
        const period = timeWindow === 'today' ? '24h' : timeWindow === 'week' ? '7d' : '30d'
        
        // ✅ Fetch real data from backend
        const data = await getFleetAnalytics({
          period,
          building // ✅ Pass building filter to API
        })
        
        setHistoricalAverages(data)
        setLastFetchTime(new Date())
      } catch (error) {
        // Silently fall back to current data calculation in demo mode
        // In production, this would log to monitoring system
        
        // Fallback: Calculate from current data if backend is offline
      } finally {
        setIsLoadingHistorical(false)
      }
    }

    fetchHistoricalData()
  }, [timeWindow, filteredMachines, building]) // ✅ Add building to dependency array

  // Calculate real-time stats from filtered machines
  const totalMachines = filteredMachines.length;
  const healthyMachines = filteredMachines.filter((m) => m.health?.status === "healthy").length;
  const warningMachines = filteredMachines.filter((m) => m.health?.status === "warning").length;
  const criticalMachines = filteredMachines.filter((m) => m.health?.status === "critical").length;

  const avgHealth = totalMachines > 0
    ? filteredMachines.reduce((sum, m) => sum + (m.health?.score || 0), 0) / totalMachines
    : 0;

  const machinesWithUsers = filteredMachines.filter((m) => m.metrics?.user_activity?.current_username).length;

  // Use historical averages for CPU/Memory/Disk when available
  const avgCpuUsage = (historicalAverages && historicalAverages.cpu_average != null)
    ? historicalAverages.cpu_average
    : totalMachines > 0
      ? filteredMachines.reduce((sum, m) => sum + (m.metrics?.resources?.cpu_usage_percent || 0), 0) / totalMachines
      : 0;

  const avgMemoryUsage = (historicalAverages && historicalAverages.memory_average != null)
    ? historicalAverages.memory_average
    : totalMachines > 0
      ? filteredMachines.reduce((sum, m) => sum + (m.metrics?.resources?.memory_usage_percent || 0), 0) / totalMachines
      : 0;

  const avgDiskUsage = (historicalAverages && historicalAverages.disk_average != null)
    ? historicalAverages.disk_average
    : totalMachines > 0
      ? filteredMachines.reduce((sum, m) => sum + (m.metrics?.resources?.disk_usage_percent || 0), 0) / totalMachines
      : 0;

  const stats = [
    {
      title: "Total Machines",
      value: totalMachines,
      icon: Server,
      iconColor: "text-gray-600",
      bgColor: "bg-gray-100",
      trend: null,
    },
    {
      title: "Healthy",
      value: healthyMachines,
      percentage:
        totalMachines > 0
          ? ((healthyMachines / totalMachines) * 100).toFixed(
              1,
            ) + "%"
          : "0%",
      icon: CheckCircle2,
      iconColor: "text-green-600",
      bgColor: "bg-green-100",
      valueColor: "text-green-600",
    },
    {
      title: "Warning",
      value: warningMachines,
      percentage:
        totalMachines > 0
          ? ((warningMachines / totalMachines) * 100).toFixed(
              1,
            ) + "%"
          : "0%",
      icon: AlertCircle,
      iconColor: "text-yellow-600",
      bgColor: "bg-yellow-100",
      valueColor: "text-yellow-600",
    },
    {
      title: "Critical",
      value: criticalMachines,
      percentage:
        totalMachines > 0
          ? ((criticalMachines / totalMachines) * 100).toFixed(
              1,
            ) + "%"
          : "0%",
      icon: AlertCircle,
      iconColor: "text-red-600",
      bgColor: "bg-red-100",
      valueColor: "text-red-600",
    },
    {
      title: "Avg Health Score",
      value: avgHealth.toFixed(0),
      subValue: "/ 100",
      icon: Activity,
      iconColor: "text-blue-600",
      bgColor: "bg-blue-100",
      valueColor: "text-blue-600",
    },
    {
      title: "Active Users",
      value: machinesWithUsers,
      percentage:
        totalMachines > 0
          ? ((machinesWithUsers / totalMachines) * 100).toFixed(
              1,
            ) + "%"
          : "0%",
      icon: Users,
      iconColor: "text-indigo-600",
      bgColor: "bg-indigo-100",
      valueColor: "text-indigo-600",
    },
    {
      title: "Avg CPU Usage",
      value: avgCpuUsage.toFixed(0),
      subValue: "%",
      icon: Cpu,
      iconColor: "text-gray-600",
      bgColor: "bg-gray-100",
      valueColor: "text-gray-600",
    },
    {
      title: "Avg Memory Usage",
      value: avgMemoryUsage.toFixed(0),
      subValue: "%",
      icon: HardDrive,
      iconColor: "text-gray-600",
      bgColor: "bg-gray-100",
      valueColor: "text-gray-600",
    },
    {
      title: "Avg Disk Usage",
      value: avgDiskUsage.toFixed(0),
      subValue: "%",
      icon: HardDrive,
      iconColor: "text-gray-600",
      bgColor: "bg-gray-100",
      valueColor: "text-gray-600",
    },
  ];

  const viewModeLabels = {
    all: 'All Machines',
    healthy: 'Healthy Machines',
    warning: 'Warning Machines',
    critical: 'Critical Machines',
    active: 'Active Machines'
  }

  const timeWindowLabels = {
    now: 'Real-Time Snapshot',
    today: 'Last 24 Hours Average',
    week: 'Last 7 Days Average',
    month: 'Last 30 Days Average'
  }

  const timeWindowButtons = [
    { value: 'now' as TimeWindow, label: 'Real-Time', tooltip: 'Current live data from all machines' },
    { value: 'today' as TimeWindow, label: 'Last 24h', tooltip: 'Rolling 24-hour average from backend' },
    { value: 'week' as TimeWindow, label: 'Last 7d', tooltip: 'Rolling 7-day average from backend' },
    { value: 'month' as TimeWindow, label: 'Last 30d', tooltip: 'Rolling 30-day average from backend' }
  ]

  return (
    <div className="space-y-6">
      {/* Consolidated Selector Bar - Combines View Mode + Time Window */}
      <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 p-4 rounded-lg border border-indigo-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: View Mode + Time Window */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
            {/* View Mode Section */}
            <div className="flex items-center gap-2 min-w-fit">
              <Filter className="h-4 w-4 text-indigo-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">View:</span>
              <div className="flex gap-1.5">
                {(['all', 'healthy', 'warning', 'critical', 'active'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      viewMode === mode
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    {mode === 'all' ? 'All' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Divider */}
            <div className="hidden sm:block h-6 w-px bg-gray-300" />
            
            {/* Time Window Section */}
            <div className="flex items-center gap-2 min-w-fit">
              <Calendar className="h-4 w-4 text-purple-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">Period:</span>
              <div className="flex gap-1.5">
                <TooltipProvider>
                  {timeWindowButtons.map((btn) => (
                    <Tooltip key={btn.value}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setTimeWindow(btn.value)}
                          disabled={isLoadingHistorical}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            timeWindow === btn.value
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                          }`}
                        >
                          {btn.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{btn.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>
            </div>
          </div>
          
          {/* Right: Metadata Display */}
          <div className="flex items-center gap-2 text-xs text-gray-600">
            {timeWindow !== 'now' && (
              <>
                <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full font-medium">
                  Historical Data
                </span>
                {lastFetchTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(lastFetchTime, { addSuffix: true })}
                  </span>
                )}
                {historicalAverages?.machine_count && (
                  <span>• {historicalAverages.machine_count} machines</span>
                )}
              </>
            )}
            {isLoadingHistorical && (
              <span className="text-purple-600 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </span>
            )}
            {timeWindow === 'now' && (
              <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600 animate-pulse" />
                Live Data
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card
              key={index}
              className="transition-all duration-300 hover:shadow-md"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.iconColor}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-bold ${
                      stat.valueColor || "text-gray-900"
                    }`}
                  >
                    <CountUp end={Number(stat.value)} duration={1} />
                  </span>
                  {stat.subValue && (
                    <span className="text-lg text-gray-500">
                      {stat.subValue}
                    </span>
                  )}
                </div>
                {stat.percentage && (
                  <p className="text-xs text-gray-500 mt-1">
                    {stat.percentage} of total
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}