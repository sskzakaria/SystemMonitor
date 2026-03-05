import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { FilterState } from '../types/monitor-schema'
import { Search, Building, DoorOpen, Activity, Tag, Users, Clock, X, Network } from 'lucide-react'

interface FilterControlsImprovedProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  buildings: string[]
  rooms: string[]
  tags: string[]
  groups: string[]
  users: string[]
}

export function FilterControlsImproved({
  filters,
  onFiltersChange,
  buildings,
  rooms,
  tags,
  groups,
  users,
}: FilterControlsImprovedProps) {
  const updateFilter = (key: keyof FilterState, value: string) => {
    // Reset room when building changes
    if (key === 'building' && value === 'all') {
      onFiltersChange({ ...filters, [key]: value, room: 'all' })
    } else {
      onFiltersChange({ ...filters, [key]: value })
    }
  }

  const clearFilter = (key: keyof FilterState) => {
    if (key === 'building') {
      onFiltersChange({ ...filters, building: 'all', room: 'all' })
    } else {
      onFiltersChange({ ...filters, [key]: key === 'search' ? '' : 'all' })
    }
  }

  const activeFilters = Object.entries(filters).filter(
    ([key, value]) => value !== 'all' && value !== ''
  )

  const clearAllFilters = () => {
    onFiltersChange({
      building: 'all',
      room: 'all',
      status: 'all',
      healthStatus: 'all',
      cpuAge: 'all',
      tag: 'all',
      group: 'all',
      user: 'all',
      search: '',
      ipSearch: '' // ✅ NEW: Clear IP search
    })
  }

  const hasActiveFilters = activeFilters.length > 0

  return (
    <div className="space-y-2">
      {/* Header with Active Filter Badges */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            <span className="text-xs font-medium text-indigo-900">Active:</span>
            {activeFilters.map(([key, value]) => (
              <Badge 
                key={key}
                variant="secondary"
                className="gap-1 pl-2 pr-1.5 py-0.5 bg-white border border-indigo-300 text-indigo-900 hover:bg-indigo-100"
              >
                <span className="text-xs font-medium capitalize">
                  {key === 'cpuAge' ? 'CPU Age' : key}: {value}
                </span>
                <button
                  onClick={() => clearFilter(key as keyof FilterState)}
                  className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100 h-7"
          >
            Clear All
          </Button>
        </div>
      )}

      {/* Filter Grid - More compact, combined layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {/* Search - Full width on mobile, 2 columns on larger screens */}
        <div className="col-span-1 sm:col-span-2 relative group">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
            <Input
              placeholder="Search machines..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="pl-9 h-[38px] border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
            {filters.search && (
              <button
                onClick={() => clearFilter('search')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* ✅ NEW: IP Address Search */}
        <div className="col-span-1 sm:col-span-2 relative group">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            IP Address
          </label>
          <div className="relative">
            <Network className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
            <Input
              placeholder="Search by IP (e.g., 192.168.1.100)..."
              value={filters.ipSearch}
              onChange={(e) => updateFilter('ipSearch', e.target.value)}
              className="pl-9 h-[38px] border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
            {filters.ipSearch && (
              <button
                onClick={() => clearFilter('ipSearch')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Building */}
        <div className="relative group">
          <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Building className="h-3.5 w-3.5" />
            Building
            {filters.building !== 'all' && (
              <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700">
                Active
              </Badge>
            )}
          </label>
          <Select value={filters.building} onValueChange={(v) => updateFilter('building', v)}>
            <SelectTrigger className={`${filters.building !== 'all' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buildings</SelectItem>
              {buildings.map(building => (
                <SelectItem key={building} value={building}>{building}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Room */}
        <div className="relative group">
          <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <DoorOpen className="h-3.5 w-3.5" />
            Room
            {filters.room !== 'all' && (
              <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700">
                Active
              </Badge>
            )}
          </label>
          <Select 
            value={filters.room} 
            onValueChange={(v) => updateFilter('room', v)}
            disabled={filters.building === 'all'}
          >
            <SelectTrigger className={`${filters.room !== 'all' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rooms</SelectItem>
              {rooms.map(room => (
                <SelectItem key={room} value={room}>{room}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="relative group">
          <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Machine Status
            {filters.status !== 'all' && (
              <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700">
                Active
              </Badge>
            )}
          </label>
          <Select value={filters.status} onValueChange={(v) => updateFilter('status', v)}>
            <SelectTrigger className={`${filters.status !== 'all' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Machines</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="idle">Idle</SelectItem>
              <SelectItem value="in-use">In Use</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Health Status */}
        <div className="relative group">
          <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Health Status
            {filters.healthStatus !== 'all' && (
              <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700">
                Active
              </Badge>
            )}
          </label>
          <Select value={filters.healthStatus} onValueChange={(v) => updateFilter('healthStatus', v)}>
            <SelectTrigger className={`${filters.healthStatus !== 'all' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Health</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* CPU Age */}
        <div className="relative group">
          <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            CPU Age
            {filters.cpuAge !== 'all' && (
              <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700">
                Active
              </Badge>
            )}
          </label>
          <Select value={filters.cpuAge} onValueChange={(v) => updateFilter('cpuAge', v)}>
            <SelectTrigger className={`${filters.cpuAge !== 'all' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ages</SelectItem>
              <SelectItem value="0-2">0-2 years</SelectItem>
              <SelectItem value="3-5">3-5 years</SelectItem>
              <SelectItem value="6-10">6-10 years</SelectItem>
              <SelectItem value="10+">10+ years</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active User */}
        <div className="relative group">
          <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Active User
            {filters.user !== 'all' && (
              <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700">
                Active
              </Badge>
            )}
          </label>
          <Select value={filters.user} onValueChange={(v) => updateFilter('user', v)}>
            <SelectTrigger className={`${filters.user !== 'all' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map(user => (
                <SelectItem key={user} value={user}>{user}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="relative group">
            <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Tags
              {filters.tag !== 'all' && (
                <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700">
                  Active
                </Badge>
              )}
            </label>
            <Select value={filters.tag} onValueChange={(v) => updateFilter('tag', v)}>
              <SelectTrigger className={`${filters.tag !== 'all' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {tags.map(tag => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Groups */}
        {groups.length > 0 && (
          <div className="relative group">
            <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Groups
              {filters.group !== 'all' && (
                <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700">
                  Active
                </Badge>
              )}
            </label>
            <Select value={filters.group} onValueChange={(v) => updateFilter('group', v)}>
              <SelectTrigger className={`${filters.group !== 'all' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                {groups.map(group => (
                  <SelectItem key={group} value={group}>{group}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  )
}