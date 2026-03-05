import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Info
} from 'lucide-react';
import { HardwareComparison, FleetAverages, getHardwareScoreColor, getHardwareScoreBgColor, getUpgradePriorityColor } from '../lib/hardware-comparison';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface HardwareComparisonCardProps {
  hardwareComparison: HardwareComparison | null;
  fleetAverages?: FleetAverages;
  showRecommendations?: boolean;
}

export function HardwareComparisonCard({ hardwareComparison, fleetAverages, showRecommendations = true }: HardwareComparisonCardProps) {
  if (!hardwareComparison) {
    return null;
  }
  
  const { hardware_score, recommendations, upgrade_priority } = hardwareComparison;

  const getComparisonIcon = (value: number, average: number) => {
    if (value > average * 1.1) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (value < average * 0.9) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-600" />;
  };

  const getPercentileLabel = (percentile: number) => {
    if (percentile >= 80) return 'Top 20%';
    if (percentile >= 60) return 'Above Average';
    if (percentile >= 40) return 'Average';
    if (percentile >= 20) return 'Below Average';
    return 'Bottom 20%';
  };

  const getUpgradePriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'High Priority';
      case 'medium': return 'Medium Priority';
      case 'low': return 'Low Priority';
      case 'none': return 'No Upgrade Needed';
      default: return priority;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5" />
              Hardware Comparison
            </CardTitle>
            <CardDescription>
              Compare this machine's hardware against the fleet average
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getUpgradePriorityColor(upgrade_priority)}>
              {getUpgradePriorityLabel(upgrade_priority)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Overall Hardware Score */}
        <div className="p-4 rounded-lg border bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Overall Hardware Score</span>
            <span className={`text-2xl font-bold ${getHardwareScoreColor(hardware_score.overall)}`}>
              {hardware_score.overall}/100
            </span>
          </div>
          <Progress 
            value={hardware_score.overall} 
            className={`h-2 ${getHardwareScoreBgColor(hardware_score.overall)}`}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Composite score based on CPU age, RAM, and storage specifications
          </p>
        </div>

        {/* Component Scores Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* CPU Age Score */}
          <div className="p-3 rounded-lg border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">CPU Age</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Newer CPUs provide better performance</p>
                      <p>0-2 years: Excellent</p>
                      <p>2-4 years: Good</p>
                      <p>4-6 years: Adequate</p>
                      <p>6+ years: Consider upgrading</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className={`text-sm font-semibold ${getHardwareScoreColor(hardware_score.cpu_age)}`}>
                {hardware_score.cpu_age}/100
              </span>
            </div>
            <Progress value={hardware_score.cpu_age} className="h-1.5" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {hardwareComparison.cpu_model || 'Unknown CPU'}
              </span>
              <span className="font-medium">
                {hardwareComparison.cpu_age_years !== null ? `${hardwareComparison.cpu_age_years} years old` : 'Age unknown'}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Fleet avg: {hardwareComparison.fleet_avg_cpu_age.toFixed(1)} years • {getPercentileLabel(hardwareComparison.cpu_age_percentile)}
            </div>
          </div>

          {/* RAM Capacity Score */}
          <div className="p-3 rounded-lg border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MemoryStick className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">RAM Capacity</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>More RAM allows better multitasking</p>
                      <p>Compared to fleet average</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className={`text-sm font-semibold ${getHardwareScoreColor(hardware_score.ram_capacity)}`}>
                {hardware_score.ram_capacity}/100
              </span>
            </div>
            <Progress value={hardware_score.ram_capacity} className="h-1.5" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {hardwareComparison.ram_gb}GB installed
              </span>
              <span className="flex items-center gap-1">
                {getComparisonIcon(hardwareComparison.ram_gb, hardwareComparison.fleet_avg_ram_gb)}
                <span className="font-medium">{getPercentileLabel(hardwareComparison.ram_capacity_percentile)}</span>
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Fleet avg: {Math.round(hardwareComparison.fleet_avg_ram_gb)}GB
            </div>
          </div>

          {/* RAM Technology Score */}
          <div className="p-3 rounded-lg border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MemoryStick className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">RAM Technology</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Newer RAM types are faster</p>
                      <p>DDR5 {'>'} DDR4 {'>'} DDR3</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className={`text-sm font-semibold ${getHardwareScoreColor(hardware_score.ram_technology)}`}>
                {hardware_score.ram_technology}/100
              </span>
            </div>
            <Progress value={hardware_score.ram_technology} className="h-1.5" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {hardwareComparison.ram_type}
              </span>
              <span className="font-medium">
                {hardwareComparison.ram_speed ? `${hardwareComparison.ram_speed} MHz` : 'Speed unknown'}
              </span>
            </div>
          </div>

          {/* Storage Capacity Score */}
          <div className="p-3 rounded-lg border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Storage Capacity</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>More storage for files and applications</p>
                      <p>Compared to fleet average</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className={`text-sm font-semibold ${getHardwareScoreColor(hardware_score.storage_capacity)}`}>
                {hardware_score.storage_capacity}/100
              </span>
            </div>
            <Progress value={hardware_score.storage_capacity} className="h-1.5" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {Math.round(hardwareComparison.storage_gb)}GB total
              </span>
              <span className="flex items-center gap-1">
                {getComparisonIcon(hardwareComparison.storage_gb, hardwareComparison.fleet_avg_storage_gb)}
                <span className="font-medium">{getPercentileLabel(hardwareComparison.storage_capacity_percentile)}</span>
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Fleet avg: {Math.round(hardwareComparison.fleet_avg_storage_gb)}GB
            </div>
          </div>

          {/* Storage Technology Score */}
          <div className="p-3 rounded-lg border space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Storage Technology</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Storage type affects speed</p>
                      <p>NVMe: Fastest (up to 7000 MB/s)</p>
                      <p>SSD: Fast (up to 550 MB/s)</p>
                      <p>HDD: Slow (up to 150 MB/s)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className={`text-sm font-semibold ${getHardwareScoreColor(hardware_score.storage_technology)}`}>
                {hardware_score.storage_technology}/100
              </span>
            </div>
            <Progress value={hardware_score.storage_technology} className="h-1.5" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {hardwareComparison.storage_type} ({hardwareComparison.storage_interface})
              </span>
              <Badge variant="outline" className="text-xs">
                {hardwareComparison.storage_type === 'NVMe' ? 'Fastest' : 
                 hardwareComparison.storage_type === 'SSD' ? 'Fast' : 
                 hardwareComparison.storage_type === 'HDD' ? 'Standard' : 'Unknown'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {showRecommendations && recommendations.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 font-semibold">
              {upgrade_priority === 'high' && <AlertTriangle className="w-4 h-4 text-red-600" />}
              {upgrade_priority === 'medium' && <AlertTriangle className="w-4 h-4 text-orange-600" />}
              {upgrade_priority === 'low' && <Info className="w-4 h-4 text-yellow-600" />}
              {upgrade_priority === 'none' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
              Recommendations
            </h4>
            <div className="space-y-1.5">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm p-2 rounded bg-muted/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 flex-shrink-0" />
                  <span className="text-muted-foreground">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showRecommendations && recommendations.length === 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-800">
              Hardware specifications are good relative to the fleet. No immediate upgrades needed.
            </span>
          </div>
        )}

      </CardContent>
    </Card>
  );
}