// Re-export CPU age analysis from cpu-age-detector
export { analyzeCPUAge, type CPUAgeInfo } from './cpu-age-detector';

export interface HardwareComparison {
  machine_id: string;
  cpu_model: string | null;
  cpu_age_years: number | null;
  ram_gb: number;
  ram_type: string;
  ram_speed: number | null;
  storage_gb: number;
  storage_type: string;
  storage_interface: string;
  
  // Fleet averages
  fleet_avg_cpu_age: number;
  fleet_avg_ram_gb: number;
  fleet_avg_storage_gb: number;
  
  // Percentiles
  cpu_age_percentile: number;
  ram_capacity_percentile: number;
  storage_capacity_percentile: number;
  
  // Hardware scores
  hardware_score: {
    overall: number;
    cpu_age: number;
    ram_capacity: number;
    ram_technology: number;
    storage_capacity: number;
    storage_technology: number;
  };
  
  // Recommendations
  recommendations: string[];
  upgrade_priority: 'high' | 'medium' | 'low' | 'none';
}

export interface FleetAverages {
  cpu_age: number;
  ram_gb: number;
  storage_gb: number;
}

export function getHardwareScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-yellow-600';
  if (score >= 20) return 'text-orange-600';
  return 'text-red-600';
}

export function getHardwareScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-100';
  if (score >= 60) return 'bg-blue-100';
  if (score >= 40) return 'bg-yellow-100';
  if (score >= 20) return 'bg-orange-100';
  return 'bg-red-100';
}

export function getUpgradePriorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'bg-red-600 text-white hover:bg-red-700';
    case 'medium':
      return 'bg-orange-500 text-white hover:bg-orange-600';
    case 'low':
      return 'bg-yellow-500 text-white hover:bg-yellow-600';
    case 'none':
      return 'bg-green-600 text-white hover:bg-green-700';
    default:
      return 'bg-gray-500 text-white hover:bg-gray-600';
  }
}

/**
 * Calculate CPU age score based on years
 */
function calculateCPUAgeScore(ageYears: number | null): number {
  if (ageYears === null) return 50; // Unknown age gets average score
  
  if (ageYears <= 1) return 100;
  if (ageYears <= 2) return 90;
  if (ageYears <= 3) return 75;
  if (ageYears <= 4) return 60;
  if (ageYears <= 5) return 45;
  if (ageYears <= 6) return 30;
  if (ageYears <= 7) return 20;
  return 10;
}

/**
 * Calculate RAM technology score
 */
function calculateRAMTechnologyScore(ramType: string, ramSpeed: number | null): number {
  let baseScore = 50;
  
  // Type scoring - handle null/undefined ramType
  if (ramType && ramType.includes('DDR5')) baseScore = 100;
  else if (ramType && ramType.includes('DDR4')) baseScore = 75;
  else if (ramType && ramType.includes('DDR3')) baseScore = 40;
  else if (ramType && ramType.includes('DDR2')) baseScore = 20;
  
  // Speed bonus (if available)
  if (ramSpeed) {
    if (ramSpeed >= 4800) baseScore = Math.min(100, baseScore + 10);
    else if (ramSpeed >= 3200) baseScore = Math.min(100, baseScore + 5);
  }
  
  return baseScore;
}

/**
 * Calculate storage technology score
 */
function calculateStorageTechnologyScore(storageType: string, storageInterface: string): number {
  if (storageType === 'NVMe') return 100;
  if (storageType === 'SSD') {
    if (storageInterface.includes('SATA')) return 70;
    return 75;
  }
  if (storageType === 'HDD') return 30;
  return 50; // Unknown
}

/**
 * Calculate percentile rank
 */
function calculatePercentile(value: number, allValues: number[]): number {
  const sorted = [...allValues].sort((a, b) => a - b);
  const index = sorted.findIndex(v => v >= value);
  if (index === -1) return 100;
  return Math.round((index / sorted.length) * 100);
}

/**
 * Generate hardware comparison for a machine
 */
export function generateHardwareComparison(
  machineId: string,
  cpuModel: string | null,
  cpuAgeYears: number | null,
  ramGB: number | null,
  ramType: string | null,
  ramSpeed: number | null,
  storageGB: number | null,
  storageType: string | null,
  storageInterface: string | null,
  fleetAverages: FleetAverages
): HardwareComparison {
  // ✅ Use default values if hardware data is missing
  const safeRamGB = ramGB || 0
  const safeRamType = ramType || 'Unknown'
  const safeRamSpeed = ramSpeed || null
  const safeStorageGB = storageGB || 0
  const safeStorageType = storageType || 'Unknown'
  const safeStorageInterface = storageInterface || 'Unknown'
  
  // Calculate scores
  const cpuAgeScore = calculateCPUAgeScore(cpuAgeYears);
  const ramTechScore = calculateRAMTechnologyScore(safeRamType, safeRamSpeed);
  const storageTechScore = calculateStorageTechnologyScore(safeStorageType, safeStorageInterface);
  
  // Calculate capacity scores relative to fleet
  const ramCapacityScore = safeRamGB > 0 && fleetAverages.ram_gb > 0
    ? Math.min(100, (safeRamGB / fleetAverages.ram_gb) * 50)
    : 0
  const storageCapacityScore = safeStorageGB > 0 && fleetAverages.storage_gb > 0
    ? Math.min(100, (safeStorageGB / fleetAverages.storage_gb) * 50)
    : 0
  
  // Calculate overall score
  const overallScore = Math.round(
    (cpuAgeScore * 0.3 + 
     ramCapacityScore * 0.2 + 
     ramTechScore * 0.15 +
     storageCapacityScore * 0.2 + 
     storageTechScore * 0.15) 
  );
  
  // Generate recommendations
  const recommendations: string[] = [];
  let upgradePriority: 'high' | 'medium' | 'low' | 'none' = 'none';
  
  if (cpuAgeYears && cpuAgeYears >= 6) {
    recommendations.push(`CPU is ${cpuAgeYears} years old - consider upgrading for better performance`);
    upgradePriority = 'high';
  } else if (cpuAgeYears && cpuAgeYears >= 4) {
    recommendations.push(`CPU is ${cpuAgeYears} years old - plan for replacement within 1-2 years`);
    if (upgradePriority === 'none') upgradePriority = 'medium';
  }
  
  if (safeRamGB < 8) {
    recommendations.push('RAM is below 8GB - upgrade to at least 16GB for better multitasking');
    upgradePriority = 'high';
  } else if (safeRamGB > 0 && safeRamGB < fleetAverages.ram_gb * 0.7) {
    recommendations.push(`RAM (${safeRamGB}GB) is below fleet average (${Math.round(fleetAverages.ram_gb)}GB) - consider upgrading`);
    if (upgradePriority === 'none') upgradePriority = 'low';
  }
  
  if (safeRamType && (safeRamType.includes('DDR3') || safeRamType.includes('DDR2'))) {
    recommendations.push(`${safeRamType} is outdated - upgrade to DDR4 or DDR5 for better speed`);
    if (upgradePriority === 'none' || upgradePriority === 'low') upgradePriority = 'medium';
  }
  
  if (safeStorageType === 'HDD') {
    recommendations.push('Replace HDD with SSD or NVMe for significantly faster performance');
    if (upgradePriority === 'none' || upgradePriority === 'low') upgradePriority = 'medium';
  }
  
  if (safeStorageGB > 0 && safeStorageGB < 256) {
    recommendations.push(`Storage (${safeStorageGB}GB) is limited - upgrade to at least 512GB`);
    if (upgradePriority === 'none') upgradePriority = 'low';
  }
  
  // Calculate percentiles based on fleet averages
  const cpuAgePercentile = cpuAgeYears && fleetAverages.cpu_age > 0
    ? Math.max(0, Math.min(100, 100 - ((cpuAgeYears / fleetAverages.cpu_age) * 50)))
    : 50
  const ramCapacityPercentile = safeRamGB > 0 && fleetAverages.ram_gb > 0
    ? Math.min(100, (safeRamGB / fleetAverages.ram_gb) * 60)
    : 0
  const storageCapacityPercentile = safeStorageGB > 0 && fleetAverages.storage_gb > 0
    ? Math.min(100, (safeStorageGB / fleetAverages.storage_gb) * 60)
    : 0
  
  return {
    machine_id: machineId,
    cpu_model: cpuModel,
    cpu_age_years: cpuAgeYears,
    ram_gb: safeRamGB,
    ram_type: safeRamType,
    ram_speed: safeRamSpeed,
    storage_gb: safeStorageGB,
    storage_type: safeStorageType,
    storage_interface: safeStorageInterface,
    fleet_avg_cpu_age: fleetAverages.cpu_age,
    fleet_avg_ram_gb: fleetAverages.ram_gb,
    fleet_avg_storage_gb: fleetAverages.storage_gb,
    cpu_age_percentile: cpuAgePercentile,
    ram_capacity_percentile: ramCapacityPercentile,
    storage_capacity_percentile: storageCapacityPercentile,
    hardware_score: {
      overall: overallScore,
      cpu_age: cpuAgeScore,
      ram_capacity: ramCapacityScore,
      ram_technology: ramTechScore,
      storage_capacity: storageCapacityScore,
      storage_technology: storageTechScore
    },
    recommendations,
    upgrade_priority: upgradePriority
  };
}