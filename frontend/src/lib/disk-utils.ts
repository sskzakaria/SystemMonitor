/**
 * Disk Utilities - Handle multiple disk partitions and calculate accurate usage
 */

export interface DiskPartition {
  device: string
  mountpoint: string
  fstype: string
  total_gb: number
  used_gb: number
  free_gb: number
  usage_percent: number
}

export interface DiskSummary {
  total_capacity_gb: number
  total_used_gb: number
  total_free_gb: number
  weighted_average_usage_percent: number
  partitions: DiskPartition[]
  primary_partition: DiskPartition | null
  critical_partitions: DiskPartition[]
}

/**
 * Calculate weighted average disk usage across all partitions
 * This gives a more accurate representation than simple averaging
 */
export function calculateWeightedDiskUsage(partitions: DiskPartition[]): number {
  if (!partitions || partitions.length === 0) return 0
  
  let totalCapacity = 0
  let totalUsed = 0
  
  partitions.forEach(partition => {
    totalCapacity += partition.total_gb || 0
    totalUsed += partition.used_gb || 0
  })
  
  if (totalCapacity === 0) return 0
  
  return (totalUsed / totalCapacity) * 100
}

/**
 * Get disk summary with all calculations
 */
export function getDiskSummary(partitions: DiskPartition[]): DiskSummary {
  if (!partitions || partitions.length === 0) {
    return {
      total_capacity_gb: 0,
      total_used_gb: 0,
      total_free_gb: 0,
      weighted_average_usage_percent: 0,
      partitions: [],
      primary_partition: null,
      critical_partitions: []
    }
  }
  
  // Calculate totals
  let totalCapacity = 0
  let totalUsed = 0
  let totalFree = 0
  
  partitions.forEach(partition => {
    totalCapacity += partition.total_gb || 0
    totalUsed += partition.used_gb || 0
    totalFree += partition.free_gb || 0
  })
  
  // Find primary partition (usually C:\ on Windows, / on Linux)
  const primaryPartition = partitions.find(p => 
    p.mountpoint === 'C:\\' || 
    p.mountpoint === '/' ||
    p.device.toLowerCase().includes('c:')
  ) || partitions[0]
  
  // Find critical partitions (over 90% usage)
  const criticalPartitions = partitions.filter(p => p.usage_percent > 90)
  
  return {
    total_capacity_gb: totalCapacity,
    total_used_gb: totalUsed,
    total_free_gb: totalFree,
    weighted_average_usage_percent: calculateWeightedDiskUsage(partitions),
    partitions: partitions.sort((a, b) => {
      // Sort: primary first, then by capacity descending
      if (a.mountpoint === primaryPartition?.mountpoint) return -1
      if (b.mountpoint === primaryPartition?.mountpoint) return 1
      return b.total_gb - a.total_gb
    }),
    primary_partition: primaryPartition,
    critical_partitions: criticalPartitions
  }
}

/**
 * Format disk capacity for display
 */
export function formatDiskCapacity(gb: number): string {
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`
  if (gb < 1024) return `${gb.toFixed(1)} GB`
  return `${(gb / 1024).toFixed(2)} TB`
}

/**
 * Get color class for disk usage percentage
 */
export function getDiskUsageColor(percent: number): string {
  if (percent >= 95) return 'text-red-600'
  if (percent >= 90) return 'text-red-500'
  if (percent >= 80) return 'text-orange-500'
  if (percent >= 70) return 'text-yellow-500'
  return 'text-green-600'
}

/**
 * Get background color class for disk usage percentage
 */
export function getDiskUsageBgColor(percent: number): string {
  if (percent >= 95) return 'bg-red-100'
  if (percent >= 90) return 'bg-red-50'
  if (percent >= 80) return 'bg-orange-50'
  if (percent >= 70) return 'bg-yellow-50'
  return 'bg-green-50'
}

/**
 * Get status for disk usage
 */
export function getDiskUsageStatus(percent: number): 'critical' | 'warning' | 'normal' {
  if (percent >= 90) return 'critical'
  if (percent >= 80) return 'warning'
  return 'normal'
}
