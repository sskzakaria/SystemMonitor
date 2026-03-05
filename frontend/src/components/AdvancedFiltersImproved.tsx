import { useState } from 'react'
import { Label } from './ui/label'
import { Slider } from './ui/slider'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { AdvancedFilterState, SpecsMetrics } from '../types/monitor-schema'
import { ChevronDown, ChevronUp, Sliders, X } from 'lucide-react'

interface AdvancedFiltersImprovedProps {
  filters: AdvancedFilterState
  onFiltersChange: (filters: AdvancedFilterState) => void
  machineSpecs?: Map<string, SpecsMetrics>
  machines?: any[]
  machineHardware?: Map<string, any>
}

export function AdvancedFiltersImproved({ filters, onFiltersChange, machineSpecs, machines, machineHardware }: AdvancedFiltersImprovedProps) {
  const [isOpen, setIsOpen] = useState(false)

  const updateFilter = (key: keyof AdvancedFilterState, value: any) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  // Extract unique CPU models from machine specs
  const availableCpuModels = Array.from(machineSpecs?.values() || [])
    .map(spec => (spec as any).cpu_model)
    .filter((model, index, self) => model && self.indexOf(model) === index)
    .sort()

  // Extract unique OS versions from machine specs (not from heartbeat metrics)
  const availableOsVersions = Array.from(new Set(
    Array.from(machineSpecs?.values() || [])
      .map(spec => (spec as any).os_version)
      .filter(Boolean)
  )).sort()

  // Extract unique storage types from specs
  const availableStorageTypes = Array.from(new Set(
    Array.from(machineSpecs?.values() || [])
      .flatMap(spec => ((spec as any).storage || []).map((d: any) => d.media_type))
      .filter(Boolean)
  )).sort()

  // Extract unique hardware models (manufacturer + model)
  const availableHardwareModels = Array.from(new Set(
    Array.from(machineSpecs?.values() || [])
      .map(spec => {
        // Backend returns flat structure, not nested
        const specAny = spec as any
        const manufacturer = specAny.manufacturer || specAny.system_manufacturer
        const model = specAny.model || specAny.system_model
        return manufacturer && model ? `${manufacturer} ${model}` : null
      })
      .filter(Boolean)
  )).sort() as string[]

  // Count active advanced filters
  const activeAdvancedFilters = [
    filters.cpuUsageMin !== 0 || filters.cpuUsageMax !== 100,
    filters.memoryUsageMin !== 0 || filters.memoryUsageMax !== 100,
    filters.diskUsageMin !== 0 || filters.diskUsageMax !== 100,
    filters.healthScoreMin !== 0,
    filters.cpuCoresMin !== 0,
    filters.ramGbMin !== 0,
    filters.storageGbMin !== 0,
    filters.cpuModel !== 'all',
    filters.osVersion !== 'all',
    filters.storageType !== 'all',
    filters.hardwareModel !== 'all',
    // Recent Activity Filters
    filters.lastHeartbeatWithinMin !== 0,
    filters.lastBootWithinHours !== 0
  ].filter(Boolean).length

  const resetAdvancedFilters = () => {
    onFiltersChange({
      cpuUsageMin: 0,
      cpuUsageMax: 100,
      memoryUsageMin: 0,
      memoryUsageMax: 100,
      diskUsageMin: 0,
      diskUsageMax: 100,
      healthScoreMin: 0,
      cpuCoresMin: 0,
      ramGbMin: 0,
      storageGbMin: 0,
      cpuModel: 'all',
      osVersion: 'all',
      storageType: 'all',
      hardwareModel: 'all',
      lastHeartbeatWithinMin: 0,
      lastBootWithinHours: 0
    })
  }

  const SliderFilter = ({ 
    label, 
    minValue, 
    maxValue, 
    minKey, 
    maxKey,
    step = 1,
    unit = '%'
  }: { 
    label: string
    minValue: number
    maxValue: number
    minKey: keyof AdvancedFilterState
    maxKey: keyof AdvancedFilterState
    step?: number
    unit?: string
  }) => {
    const isActive = minValue !== 0 || maxValue !== 100
    
    return (
      <div className={`space-y-2 p-3 rounded-lg border transition-all ${ 
        isActive 
          ? 'border-indigo-500 bg-indigo-50' 
          : 'border-gray-200 bg-white'
      }`}>
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          <div className="flex items-center gap-1.5">
            <Badge variant={isActive ? "default" : "outline"} className={`text-xs ${isActive ? "bg-indigo-600" : ""}`}>
              {minValue}{unit} - {maxValue}{unit}
            </Badge>
            {isActive && (
              <button
                onClick={() => {
                  updateFilter(minKey, 0)
                  updateFilter(maxKey, 100)
                }}
                className="text-indigo-600 hover:text-indigo-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <div>
            <Label className="text-xs text-gray-600">Min: {minValue}{unit}</Label>
            <Slider
              value={[minValue]}
              onValueChange={(v) => updateFilter(minKey, v[0])}
              max={100}
              step={step}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600">Max: {maxValue}{unit}</Label>
            <Slider
              value={[maxValue]}
              onValueChange={(v) => updateFilter(maxKey, v[0])}
              max={100}
              step={step}
              className="mt-1.5"
            />
          </div>
        </div>
      </div>
    )
  }

  const PresetButtonInput = ({
    label,
    value,
    onChange,
    presets,
    unit
  }: {
    label: string
    value: number
    onChange: (value: number) => void
    presets: Array<{ value: number; label: string }>
    unit: string
  }) => {
    const [showCustom, setShowCustom] = useState(false)
    const isActive = value !== 0
    
    return (
      <div className={`space-y-2.5 p-3 rounded-lg border transition-all ${ 
        isActive 
          ? 'border-indigo-500 bg-indigo-50' 
          : 'border-gray-200 bg-white'
      }`}>
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          {isActive && (
            <button
              onClick={() => {
                onChange(0)
                setShowCustom(false)
              }}
              className="text-indigo-600 hover:text-indigo-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        
        {/* Preset Buttons */}
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.value}
              onClick={() => {
                onChange(preset.value)
                setShowCustom(false)
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                value === preset.value && !showCustom
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(!showCustom)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              showCustom
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'
            }`}
          >
            Custom
          </button>
        </div>

        {/* Custom Input */}
        {showCustom && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="number"
              value={value}
              onChange={(e) => onChange(parseInt(e.target.value) || 0)}
              min={0}
              placeholder="Enter value"
              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-indigo-500"
              autoFocus
            />
            <span className="text-xs text-gray-600 min-w-fit">{unit}</span>
          </div>
        )}
        
        {/* Current Value Display */}
        {isActive && !showCustom && (
          <div className="text-xs text-gray-600 pt-0.5">
            Active: <span className="font-medium text-indigo-700">{value} {unit}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 transition-colors flex items-center justify-between group">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-indigo-600" />
              <span className="font-semibold text-sm text-gray-900">Advanced Filters</span>
              {activeAdvancedFilters > 0 && (
                <Badge variant="default" className="bg-indigo-600 text-xs">
                  {activeAdvancedFilters}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeAdvancedFilters > 0 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    resetAdvancedFilters()
                  }}
                  className="px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-white rounded-md transition-colors cursor-pointer"
                >
                  Reset
                </span>
              )}
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-600" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-6 space-y-6 bg-gray-50">
            {/* Resource Usage Filters */}
            <div>
              <h4 className="font-semibold text-sm mb-4 text-gray-900 flex items-center gap-2">
                <div className="h-1 w-1 bg-indigo-600 rounded-full" />
                Resource Usage Filters
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SliderFilter
                  label="CPU Usage"
                  minValue={filters.cpuUsageMin}
                  maxValue={filters.cpuUsageMax}
                  minKey="cpuUsageMin"
                  maxKey="cpuUsageMax"
                  step={5}
                />
                <SliderFilter
                  label="Memory Usage"
                  minValue={filters.memoryUsageMin}
                  maxValue={filters.memoryUsageMax}
                  minKey="memoryUsageMin"
                  maxKey="memoryUsageMax"
                  step={5}
                />
                <SliderFilter
                  label="Disk Usage"
                  minValue={filters.diskUsageMin}
                  maxValue={filters.diskUsageMax}
                  minKey="diskUsageMin"
                  maxKey="diskUsageMax"
                  step={5}
                />
              </div>
            </div>

            {/* Status Filters */}
            <div>
              <h4 className="font-semibold text-sm mb-4 text-gray-900 flex items-center gap-2">
                <div className="h-1 w-1 bg-green-600 rounded-full" />
                Status Filters
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PresetButtonInput
                  label="Minimum Health Score"
                  value={filters.healthScoreMin}
                  onChange={(v) => updateFilter('healthScoreMin', v)}
                  presets={[
                    { value: 60, label: '60' },
                    { value: 70, label: '70' },
                    { value: 80, label: '80' },
                    { value: 90, label: '90' }
                  ]}
                  unit="/ 100"
                />
                <PresetButtonInput
                  label="Last Heartbeat Within"
                  value={filters.lastHeartbeatWithinMin}
                  onChange={(v) => updateFilter('lastHeartbeatWithinMin', v)}
                  presets={[
                    { value: 5, label: '5m' },
                    { value: 10, label: '10m' },
                    { value: 15, label: '15m' },
                    { value: 30, label: '30m' },
                    { value: 60, label: '1h' }
                  ]}
                  unit="minutes"
                />
                <PresetButtonInput
                  label="Last Booted Within"
                  value={filters.lastBootWithinHours}
                  onChange={(v) => updateFilter('lastBootWithinHours', v)}
                  presets={[
                    { value: 1, label: '1h' },
                    { value: 6, label: '6h' },
                    { value: 12, label: '12h' },
                    { value: 24, label: '24h' },
                    { value: 48, label: '48h' }
                  ]}
                  unit="hours"
                />
              </div>
            </div>

            {/* Hardware Specs Filters */}
            <div>
              <h4 className="font-semibold text-sm mb-4 text-gray-900 flex items-center gap-2">
                <div className="h-1 w-1 bg-purple-600 rounded-full" />
                Hardware Specs Filters
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PresetButtonInput
                  label="Minimum CPU Cores"
                  value={filters.cpuCoresMin}
                  onChange={(v) => updateFilter('cpuCoresMin', v)}
                  presets={[
                    { value: 2, label: '2' },
                    { value: 4, label: '4' },
                    { value: 8, label: '8' },
                    { value: 16, label: '16' }
                  ]}
                  unit="cores"
                />
                <PresetButtonInput
                  label="Minimum RAM"
                  value={filters.ramGbMin}
                  onChange={(v) => updateFilter('ramGbMin', v)}
                  presets={[
                    { value: 4, label: '4 GB' },
                    { value: 8, label: '8 GB' },
                    { value: 16, label: '16 GB' },
                    { value: 32, label: '32 GB' }
                  ]}
                  unit="GB"
                />
                <PresetButtonInput
                  label="Minimum Storage"
                  value={filters.storageGbMin}
                  onChange={(v) => updateFilter('storageGbMin', v)}
                  presets={[
                    { value: 128, label: '128 GB' },
                    { value: 256, label: '256 GB' },
                    { value: 512, label: '512 GB' },
                    { value: 1024, label: '1 TB' }
                  ]}
                  unit="GB"
                />
              </div>
            </div>

            {/* Dropdown Filters */}
            <div>
              <h4 className="font-semibold text-sm mb-4 text-gray-900 flex items-center gap-2">
                <div className="h-1 w-1 bg-orange-600 rounded-full" />
                Hardware Specs Filters
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-4 rounded-lg border-2 transition-all ${
                  filters.cpuModel !== 'all'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white'
                }`}>
                  <Label className="text-sm font-medium mb-2 block">CPU Model</Label>
                  <Select value={filters.cpuModel} onValueChange={(v) => updateFilter('cpuModel', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Models</SelectItem>
                      {availableCpuModels.map(model => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className={`p-4 rounded-lg border-2 transition-all ${
                  filters.osVersion !== 'all'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white'
                }`}>
                  <Label className="text-sm font-medium mb-2 block">OS Version</Label>
                  <Select value={filters.osVersion} onValueChange={(v) => updateFilter('osVersion', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Versions</SelectItem>
                      {availableOsVersions.map(version => (
                        <SelectItem key={version} value={version}>{version}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className={`p-4 rounded-lg border-2 transition-all ${
                  filters.storageType !== 'all'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white'
                }`}>
                  <Label className="text-sm font-medium mb-2 block">Storage Type</Label>
                  <Select value={filters.storageType} onValueChange={(v) => updateFilter('storageType', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {availableStorageTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className={`p-4 rounded-lg border-2 transition-all ${
                  filters.hardwareModel !== 'all'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white'
                }`}>
                  <Label className="text-sm font-medium mb-2 block">Hardware Model</Label>
                  <Select value={filters.hardwareModel} onValueChange={(v) => updateFilter('hardwareModel', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Models</SelectItem>
                      {availableHardwareModels.map(model => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}