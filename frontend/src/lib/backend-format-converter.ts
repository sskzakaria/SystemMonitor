/**
 * Backend Format Converter
 * 
 * Handles both flat and nested backend response formats
 * Provides defensive conversion and validation
 */

import type { SpecsMetrics, CPUSpec, MemorySpec, StorageDevice, GPUSpec, OSInfo, HardwareSystemInfo } from '../types/monitor-schema'

/**
 * Check if backend returned flat format specs
 */
export function isFlatSpecsFormat(data: any): boolean {
  if (!data) return false
  
  // Flat format has cpu_model, cpu_cores at top level
  // Nested format has static_hardware.cpu.name
  return (
    ('cpu_model' in data || 'cpu_cores' in data) &&
    !('static_hardware' in data)
  )
}

/**
 * Convert flat specs format to nested format
 * 
 * Flat format (from agent ingestion):
 * {
 *   "cpu_model": "Intel Core i5-8500",
 *   "cpu_cores": 4,
 *   "memory_total_gb": 15.87,
 *   ...
 * }
 * 
 * Nested format (expected by frontend):
 * {
 *   "static_hardware": {
 *     "cpu": { "name": "Intel Core i5-8500", "cores": 4 },
 *     ...
 *   },
 *   "static_system": { ... }
 * }
 */
export function convertFlatToNestedSpecs(flatData: any): SpecsMetrics {
  console.warn('⚠️ Converting flat specs format to nested format')
  
  // ✅ FIX: Handle storage array from backend (storage.get("disks", []))
  const storageDevices: StorageDevice[] = []
  
  if (flatData.storage && Array.isArray(flatData.storage)) {
    // ✅ Backend sends storage as array directly!
    flatData.storage.forEach((disk: any) => {
      storageDevices.push({
        size_gb: disk.size_gb || disk.total_gb || 0,
        media_type: disk.media_type || disk.type || 'SSD',
        interface: disk.interface || 'Unknown',
        model: disk.model || 'Unknown'
      })
    })
  } else if (flatData.partitions && Array.isArray(flatData.partitions)) {
    // Fallback: partition data
    flatData.partitions.forEach((partition: any) => {
      storageDevices.push({
        size_gb: partition.total_gb || 0,
        media_type: guessMediaType(partition.device),
        interface: 'Unknown',
        model: partition.device || 'Unknown'
      })
    })
  } else if (flatData.disk_total_gb) {
    // Fallback: single disk
    storageDevices.push({
      size_gb: flatData.disk_total_gb || 0,
      media_type: 'SSD',
      interface: 'Unknown',
      model: 'Unknown'
    })
  }
  
  // ✅ FIX: Convert CPU GHz to MHz (backend sends cpu_base_clock_ghz)
  const cpuFreqMhz = flatData.cpu_base_clock_ghz 
    ? flatData.cpu_base_clock_ghz * 1000  // Convert GHz → MHz
    : (flatData.cpu_frequency_mhz || flatData.cpu_max_frequency || 0)
  
  const cpu: CPUSpec = {
    name: flatData.cpu_model || 'Unknown CPU',
    cores: flatData.cpu_cores || 0,
    threads: flatData.cpu_threads || flatData.cpu_cores * 2 || 0,
    frequency_mhz: cpuFreqMhz,
    cache_mb: flatData.cpu_cache_mb || 0,
    architecture: flatData.cpu_architecture  // ✅ ADD: cpu_architecture field
  }
  
  const memory: MemorySpec = {
    total_gb: flatData.memory_total_gb || 0,
    type: flatData.memory_type || 'Unknown',
    speed_mhz: flatData.memory_speed_mhz || 0,
    slots_used: flatData.memory_slots_used,
    slots_total: flatData.memory_slots_total
  }
  
  // ✅ FIX: Handle GPU array from backend (doc.get("gpu", []))
  let gpu: GPUSpec
  
  if (flatData.gpu && Array.isArray(flatData.gpu) && flatData.gpu.length > 0) {
    // Backend sends array of GPU objects
    const firstGpu = flatData.gpu[0]
    gpu = {
      name: firstGpu.name || 'Unknown GPU',
      vram_gb: firstGpu.vram_gb || 0,
      manufacturer: firstGpu.manufacturer
    }
  } else if (typeof flatData.gpu === 'object' && flatData.gpu !== null && flatData.gpu.name) {
    // Backend sends single GPU object
    gpu = {
      name: flatData.gpu.name || 'Unknown GPU',
      vram_gb: flatData.gpu.vram_gb || 0,
      manufacturer: flatData.gpu.manufacturer
    }
  } else {
    // Fallback: flat fields (legacy) or no GPU
    gpu = {
      name: flatData.gpu_model || flatData.gpu_name || 'Unknown GPU',
      vram_gb: flatData.gpu_memory_gb || flatData.gpu_vram_gb || 0,
      manufacturer: flatData.gpu_manufacturer
    }
  }
  
  const os: OSInfo = {
    name: flatData.os_name || `${flatData.os_type || 'Unknown'} ${flatData.os_version || ''}`.trim(),
    version: flatData.os_version || 'Unknown',
    build: flatData.os_build || flatData.os_build_number || 'Unknown',
    architecture: flatData.os_architecture,  // ✅ ADD: os_architecture field
    install_date: flatData.os_install_date ? new Date(flatData.os_install_date) : undefined
  }
  
  const hardware: HardwareSystemInfo = {
    manufacturer: flatData.manufacturer || flatData.hardware_manufacturer || flatData.system_manufacturer || 'Unknown',
    model: flatData.model || flatData.hardware_model || flatData.system_model || 'Unknown',
    serial_number: flatData.serial_number || flatData.hardware_serial || 'Unknown',
    bios_version: flatData.bios_version
  }
  
  return {
    machine_id: flatData.machine_id,
    hostname: flatData.hostname,
    building: flatData.building,
    room: flatData.room,
    timestamp: flatData.timestamp ? new Date(flatData.timestamp) : new Date(),
    static_hardware: {
      cpu,
      memory,
      storage: storageDevices,
      gpu
    },
    static_system: {
      os,
      hardware,
      boot_time: flatData.boot_time ? new Date(flatData.boot_time) : undefined,
      boot_time_epoch: flatData.boot_time_epoch
    }
  }
}

/**
 * Guess media type from device name/path
 */
function guessMediaType(device: string): 'SSD' | 'HDD' | 'NVMe' {
  if (!device) return 'SSD'
  
  const deviceLower = device.toLowerCase()
  
  if (deviceLower.includes('nvme')) return 'NVMe'
  if (deviceLower.includes('ssd')) return 'SSD'
  if (deviceLower.includes('hdd') || deviceLower.includes('spinning')) return 'HDD'
  
  // Default to SSD for modern systems
  return 'SSD'
}

/**
 * Get default/fallback specs
 */
export function getDefaultSpecs(): SpecsMetrics {
  return {
    static_hardware: {
      cpu: {
        name: 'Unknown CPU',
        cores: 0,
        threads: 0,
        frequency_mhz: 0,
        cache_mb: 0
      },
      memory: {
        total_gb: 0,
        type: 'Unknown',
        speed_mhz: 0
      },
      storage: [{
        size_gb: 0,
        media_type: 'SSD',
        interface: 'Unknown'
      }],
      gpu: {
        name: 'Unknown GPU',
        vram_gb: 0
      }
    },
    static_system: {
      os: {
        name: 'Unknown OS',
        version: 'Unknown',
        build: 'Unknown'
      },
      hardware: {
        manufacturer: 'Unknown',
        model: 'Unknown',
        serial_number: 'Unknown'
      }
    }
  }
}

/**
 * Validate and normalize specs response from backend
 * Handles both flat and nested formats
 */
export function normalizeSpecsResponse(backendData: any): SpecsMetrics {
  // Null/undefined check
  if (!backendData) {
    console.error('❌ Empty specs response from backend')
    return getDefaultSpecs()
  }
  
  // Check format type
  if (isFlatSpecsFormat(backendData)) {
    console.warn('⚠️ Backend returned flat specs format, converting to nested')
    return convertFlatToNestedSpecs(backendData)
  }
  
  // Already nested format - validate structure
  if (!backendData.static_hardware || !backendData.static_system) {
    console.error('❌ Invalid nested specs format - missing static_hardware or static_system')
    console.error('Received:', backendData)
    return getDefaultSpecs()
  }
  
  // Return as-is (already correct format)
  return backendData as SpecsMetrics
}

/**
 * Validate hardware metrics response
 */
export function normalizeHardwareResponse(backendData: any): any {
  if (!backendData) {
    console.error('❌ Empty hardware response from backend')
    return null
  }
  
  // Check network metrics are in correct format (rates, not cumulative)
  if (backendData.network_upload_mbps && backendData.network_upload_mbps > 10000) {
    console.warn('⚠️ Network upload speed > 10 Gbps - might be cumulative bytes instead of rate')
    console.warn('  Value:', backendData.network_upload_mbps)
  }
  
  if (backendData.network_download_mbps && backendData.network_download_mbps > 10000) {
    console.warn('⚠️ Network download speed > 10 Gbps - might be cumulative bytes instead of rate')
    console.warn('  Value:', backendData.network_download_mbps)
  }
  
  return backendData
}

/**
 * Example usage:
 * 
 * import { normalizeSpecsResponse } from './backend-format-converter'
 * 
 * export function adaptSpecsResponse(backendData: any): SpecsMetrics {
 *   return normalizeSpecsResponse(backendData)
 * }
 */