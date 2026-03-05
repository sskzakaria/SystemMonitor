// Core machine information
export interface MachineInfo {
  machine_id: string;      // e.g., "TBT101-01"
  hostname: string;         // e.g., "LAB-TBT-101-01"
  building: string;         // e.g., "TBT", "ECS", "LIB"
  room: string;            // e.g., "101", "202A"
  location: string;        // Full location string
  tags?: string[];         // Optional tags for categorization
  groups?: string[];       // Optional groups
  metadata?: Record<string, any>; // Optional metadata
}

// Resource usage metrics
export interface ResourceMetrics {
  cpu_usage_percent: number;      // 0-100
  memory_usage_percent: number;   // 0-100
  disk_usage_percent: number;     // 0-100
  cpu_temperature_c: number | null;
  cpu_model?: string | null;      // CPU model name
  network_throughput_mbps: number;
}

// Network metrics
export interface NetworkMetrics {
  throughput_mbps: number;
  upload_mbps: number;
  download_mbps: number;
  latency_ms: number;
  packet_loss_percent: number;
  ip_address?: string;
  mac_address?: string;
  internet_accessible?: boolean;
}

// User activity tracking
export interface UserActivity {
  current_username: string | null;  // "ENGLISH" or "FRENCH"
  active_users: number;             // 0 or 1
  login_location: string | null;    // e.g., "4299-TBT333"
  login_time: Date | null;
  is_idle: boolean;
  last_activity: Date | null;
}

// System information
export interface SystemInfo {
  uptime_seconds: number;
  boot_time: Date;
  last_heartbeat: Date;
}

// Status information
export interface StatusInfo {
  state: 'online' | 'idle' | 'offline' | 'in-use' | 'maintenance' | 'error';
  uptime_seconds: number;
  last_boot: Date;
}

// Heartbeat metrics (real-time data)
export interface HeartbeatMetrics {
  status: StatusInfo;
  resources: ResourceMetrics;
  network: NetworkMetrics;
  user_activity: UserActivity;
  system: SystemInfo;
}

// Hardware metrics (periodic updates)
export interface HardwareMetrics {
  // === Metadata ===
  machine_id: string;
  hostname: string;
  building: string;
  room: string;
  timestamp: Date;
  
  // === CPU Metrics ===
  cpu_usage_percent: number;
  cpu_temperature_c: number | null;
  cpu_freq_current_mhz?: number;
  cpu_freq_min_mhz?: number;
  cpu_freq_max_mhz?: number;
  cpu_cores_percent?: number[];  // Per-core usage array
  load_avg_1min?: number;
  load_avg_5min?: number;
  load_avg_15min?: number;
  
  // === Memory Metrics ===
  memory_usage_percent: number;
  memory_used_gb: number;
  memory_total_gb?: number;
  memory_available_gb?: number;
  memory_free_gb?: number;
  swap_total_gb?: number;
  swap_used_gb?: number;
  swap_free_gb?: number;
  swap_percent?: number;
  
  // === Disk Metrics ===
  disk_usage_percent: number;
  disk_used_gb: number;
  disk_total_gb?: number;
  disk_free_gb?: number;
  disk_read_bytes?: number;
  disk_write_bytes?: number;
  disk_read_count?: number;
  disk_write_count?: number;
  disk_read_time?: number;
  disk_write_time?: number;
  
  // === Partition Details ===
  partitions?: Array<{
    device: string;
    mountpoint: string;
    fstype: string;
    total_gb: number;
    used_gb: number;
    free_gb: number;
    usage_percent: number;
  }>;
  
  // === Network Metrics ===
  network_bytes_sent: number;
  network_bytes_recv: number;
  net_packets_sent?: number;
  net_packets_recv?: number;
  net_errin?: number;
  net_errout?: number;
  net_dropin?: number;
  net_dropout?: number;
  
  // === GPU Metrics (optional) ===
  gpu_usage_percent?: number;
  gpu_temperature_c?: number | null;
  gpu_memory_used_gb?: number;
  gpu_memory_total_gb?: number;
  gpu_memory_free_gb?: number;
}

// CPU specifications
export interface CPUSpec {
  name: string;
  cores: number;
  threads: number;
  base_ghz?: number;           // Optional for backward compat
  max_ghz?: number;
  frequency_mhz?: number;      // ✅ ADD: from backend (cpu_base_clock_ghz * 1000)
  cache_mb?: number;           // ✅ ADD: CPU cache size
  architecture?: string;       // ✅ ADD: x64, ARM64, etc.
  manufacturer?: string;
  generation?: number;
  release_year?: number;
}

// Memory specifications
export interface MemorySpec {
  total_gb: number;
  type: string;        // e.g., "DDR4" - can be "Unknown" if backend returns null
  speed_mhz: number;
  slots_used?: number;
  slots_total?: number;
}

// Storage device specification
export interface StorageDevice {
  size_gb: number;
  media_type: 'SSD' | 'HDD' | 'NVMe';
  interface: string;
  model?: string;
}

// GPU specifications
export interface GPUSpec {
  name: string;
  vram_gb: number;
  manufacturer?: string;
}

// Operating system information
export interface OSInfo {
  name: string;        // e.g., "Windows 10 Pro"
  version: string;
  build: string;
  architecture?: string;  // ✅ ADD: AMD64, x86, ARM64, etc.
  install_date?: Date;
}

// Hardware system information
export interface HardwareSystemInfo {
  manufacturer: string;
  model: string;
  serial_number: string;
  bios_version?: string;
}

// Specifications metrics (static data)
export interface SpecsMetrics {
  machine_id?: string;    // ✅ ADD: from backend
  hostname?: string;      // ✅ ADD: from backend
  building?: string;      // ✅ ADD: from backend
  room?: string;          // ✅ ADD: from backend
  timestamp?: Date;       // ✅ ADD: from backend
  static_hardware: {
    cpu: CPUSpec;
    memory: MemorySpec;
    storage: StorageDevice[];
    gpu: GPUSpec;
  };
  static_system: {
    os: OSInfo;
    hardware: HardwareSystemInfo;
    boot_time?: Date;       // ✅ ADD: from backend
    boot_time_epoch?: number;  // ✅ ADD: from backend
  };
}

// Health information
export interface HealthInfo {
  status: 'healthy' | 'warning' | 'critical';
  score: number;                                // 0-100
  issues: string[];
  performance_grade: string;                   // A-F grade
}

// Main machine data wrapper
export interface MonitorData<T> {
  machine: MachineInfo;
  metrics: T;
  timestamp: Date;
  health: HealthInfo;
}

// Process information
export interface ProcessInfo {
  name: string;
  pid: number;
  cpu_percent: number;
  memory_mb: number;
  user: string;
}

// Security event
export interface SecurityEvent {
  timestamp: Date;
  type: 'login' | 'logout' | 'failed_login' | 'security_update' | 'firewall_alert';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  user?: string;
}

// System log entry
export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warning' | 'error';
  source: string;
  message: string;
}

// Connected device
export interface ConnectedDevice {
  type: 'keyboard' | 'mouse' | 'monitor' | 'printer' | 'usb' | 'other';
  name: string;
  connection: string;
  status: 'connected' | 'disconnected';
}

// Historical data point for charts
export interface HistoricalDataPoint {
  timestamp: Date;
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  temperature?: number;
}

// Alert definition
export interface Alert {
  id: string;
  machine_id: string;
  timestamp: Date;
  severity: 'critical' | 'warning' | 'info';
  type: string;
  message: string;
  acknowledged: boolean;
  snoozed_until?: Date;
}

// Tag definition
export interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
}

// Group definition
export interface Group {
  id: string;
  name: string;
  description?: string;
  machine_ids: string[];
}

// Maintenance window
export interface MaintenanceWindow {
  machine_id: string;
  start_time: Date;
  end_time: Date;
  reason: string;
  notes?: string;
  scheduled_by?: string;
}

// Filter state
export interface FilterState {
  building: string;
  room: string;
  status: string; // Machine status: online, idle, in-use, offline, maintenance
  healthStatus: string; // Health status: healthy, warning, critical
  cpuAge: string;
  tag: string;
  group: string;
  user: string;
  search: string;
  ipSearch: string; // ✅ NEW: IP address search
}

// Advanced filter state
export interface AdvancedFilterState {
  cpuUsageMin: number;
  cpuUsageMax: number;
  memoryUsageMin: number;
  memoryUsageMax: number;
  diskUsageMin: number;
  diskUsageMax: number;
  healthScoreMin: number;
  cpuCoresMin: number;
  ramGbMin: number;
  storageGbMin: number;
  cpuModel: string;
  osVersion: string;
  storageType: string;
  hardwareModel: string;
  // Recent Activity Filters (moved to Status Filters section)
  lastHeartbeatWithinMin: number; // Show machines with heartbeat within X minutes (0 = disabled)
  lastBootWithinHours: number; // Show machines booted within X hours (0 = disabled)
}

// Saved filter preset
export interface SavedFilter {
  id: string;
  name: string;
  description?: string;
  basicFilters: FilterState;
  advancedFilters: AdvancedFilterState;
  createdAt: Date;
  updatedAt: Date;
}

// Webhook configuration
export interface WebhookConfig {
  enabled: boolean;
  url: string;
  platform: 'slack' | 'discord' | 'teams' | 'custom';
  events: string[];
}

// InfluxDB configuration
export interface InfluxDBConfig {
  enabled: boolean;
  url: string;
  token: string;
  org: string;
  bucket: string;
}

// Grafana configuration
export interface GrafanaConfig {
  enabled: boolean;
  url: string;
  dashboards: {
    fleet_overview: string;
    machine_detail: string;
    resource_trends: string;
    alert_history: string;
    user_activity: string;
  };
}

// Timeline event
export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: 'status_change' | 'user_login' | 'user_logout' | 'hardware_event' | 'maintenance' | 'alert' | 'system_event';
  severity: 'info' | 'warning' | 'critical' | 'success';
  machineId: string;
  hostname: string;
  location: string;
  title: string;
  description: string;
  metadata?: Record<string, any>;
}