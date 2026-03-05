import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { formatDateOnlyWithTimezone } from '../lib/timezone-utils'
import { 
  Search, 
  Package, 
  CheckCircle2, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Calendar
} from 'lucide-react'

export interface SoftwareInfo {
  name: string
  version: string
  publisher: string
  install_date: Date | null
  size_mb: number
  category: 'productivity' | 'development' | 'system' | 'security' | 'utility' | 'other'
  license_type: 'free' | 'commercial' | 'education' | 'trial' | 'unknown'
  license_expiry?: Date | null
  auto_update: boolean
  last_updated?: Date | null
}

interface SoftwareInventoryTabProps {
  machineId: string
  software: SoftwareInfo[]
}

type SortField = 'name' | 'version' | 'size' | 'installDate'
type SortOrder = 'asc' | 'desc'

export function SoftwareInventoryTab({ machineId, software }: SoftwareInventoryTabProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [licenseFilter, setLicenseFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // Show empty state if no software data
  if (!software || software.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Installed Software
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Package className="h-12 w-12 mb-3 text-gray-400" />
            <p className="text-sm">No software data available</p>
            <p className="text-xs mt-2">Software inventory will appear once collected by the backend</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Filter and sort software
  const filteredSoftware = useMemo(() => {
    let filtered = software

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(s => 
        s.name.toLowerCase().includes(searchLower) ||
        s.publisher.toLowerCase().includes(searchLower) ||
        s.version.toLowerCase().includes(searchLower)
      )
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(s => s.category === categoryFilter)
    }

    // License filter
    if (licenseFilter !== 'all') {
      filtered = filtered.filter(s => s.license_type === licenseFilter)
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'version':
          comparison = a.version.localeCompare(b.version)
          break
        case 'size':
          comparison = a.size_mb - b.size_mb
          break
        case 'installDate':
          comparison = a.install_date ? a.install_date.getTime() - b.install_date.getTime() : -1
          break
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [software, search, categoryFilter, licenseFilter, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc' ? 
      <ChevronUp className="h-4 w-4 inline-block ml-1" /> : 
      <ChevronDown className="h-4 w-4 inline-block ml-1" />
  }

  const getCategoryBadge = (category: string) => {
    const colors = {
      productivity: 'bg-blue-100 text-blue-700 border-blue-300',
      development: 'bg-purple-100 text-purple-700 border-purple-300',
      system: 'bg-gray-100 text-gray-700 border-gray-300',
      security: 'bg-red-100 text-red-700 border-red-300',
      utility: 'bg-green-100 text-green-700 border-green-300',
      other: 'bg-yellow-100 text-yellow-700 border-yellow-300'
    }
    return <Badge className={colors[category as keyof typeof colors]}>{category}</Badge>
  }

  const getLicenseBadge = (licenseType: string, expiry?: Date | null) => {
    const isExpired = expiry && expiry < new Date()
    const isExpiringSoon = expiry && !isExpired && 
      (expiry.getTime() - new Date().getTime()) < 30 * 24 * 60 * 60 * 1000 // 30 days

    if (isExpired) {
      return (
        <Badge className="bg-red-100 text-red-700 border-red-300">
          <AlertCircle className="h-3 w-3 mr-1" />
          Expired
        </Badge>
      )
    }

    if (isExpiringSoon) {
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-300">
          <AlertCircle className="h-3 w-3 mr-1" />
          Expiring Soon
        </Badge>
      )
    }

    const colors = {
      free: 'bg-green-100 text-green-700 border-green-300',
      commercial: 'bg-blue-100 text-blue-700 border-blue-300',
      education: 'bg-purple-100 text-purple-700 border-purple-300',
      trial: 'bg-orange-100 text-orange-700 border-orange-300',
      unknown: 'bg-gray-100 text-gray-700 border-gray-300'
    }

    return <Badge className={colors[licenseType as keyof typeof colors]}>{licenseType}</Badge>
  }

  // Calculate summary stats
  const totalSize = software.reduce((sum, s) => sum + s.size_mb, 0)
  const commercialLicenses = software.filter(s => s.license_type === 'commercial').length
  const expiringLicenses = software.filter(s => {
    if (!s.license_expiry) return false
    const daysUntilExpiry = (s.license_expiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    return daysUntilExpiry > 0 && daysUntilExpiry < 30
  }).length

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Package className="h-8 w-8 mx-auto mb-2 text-blue-600" />
              <p className="text-sm text-muted-foreground">Total Software</p>
              <p className="text-3xl font-semibold mt-1">{software.length}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Download className="h-8 w-8 mx-auto mb-2 text-purple-600" />
              <p className="text-sm text-muted-foreground">Total Size</p>
              <p className="text-3xl font-semibold mt-1">{(totalSize / 1024).toFixed(1)} GB</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-600" />
              <p className="text-sm text-muted-foreground">Commercial</p>
              <p className="text-3xl font-semibold mt-1">{commercialLicenses}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-orange-600" />
              <p className="text-sm text-muted-foreground">Expiring Soon</p>
              <p className="text-3xl font-semibold mt-1">{expiringLicenses}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Software List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Installed Software</CardTitle>
            <div className="flex items-center gap-3">
              {/* Category Filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="productivity">Productivity</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="utility">Utility</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>

              {/* License Filter */}
              <Select value={licenseFilter} onValueChange={setLicenseFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="License" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Licenses</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>

              {/* Search */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search software..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 rounded-t-lg border-b border-gray-200 font-medium text-sm text-gray-700">
              <div 
                className="col-span-3 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('name')}
              >
                Software Name <SortIcon field="name" />
              </div>
              <div 
                className="col-span-1 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('version')}
              >
                Version <SortIcon field="version" />
              </div>
              <div className="col-span-2">Publisher</div>
              <div className="col-span-1 text-center">Category</div>
              <div 
                className="col-span-1 text-right cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('size')}
              >
                Size <SortIcon field="size" />
              </div>
              <div 
                className="col-span-2 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('installDate')}
              >
                Install Date <SortIcon field="installDate" />
              </div>
              <div className="col-span-2 text-center">License</div>
            </div>

            {/* Software Rows */}
            <div className="divide-y divide-gray-100">
              {filteredSoftware.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No software found</p>
                </div>
              ) : (
                filteredSoftware.map((app, index) => (
                  <div 
                    key={`${app.name}-${index}`}
                    className="grid grid-cols-12 gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-sm"
                  >
                    {/* Name */}
                    <div className="col-span-3 font-medium truncate" title={app.name}>
                      {app.name}
                      {app.auto_update && (
                        <CheckCircle2 className="h-3.5 w-3.5 inline-block ml-2 text-green-600" title="Auto-update enabled" />
                      )}
                    </div>

                    {/* Version */}
                    <div className="col-span-1 font-mono text-xs text-gray-600">
                      {app.version}
                    </div>

                    {/* Publisher */}
                    <div className="col-span-2 text-gray-600 truncate" title={app.publisher}>
                      {app.publisher}
                    </div>

                    {/* Category */}
                    <div className="col-span-1 flex justify-center">
                      {getCategoryBadge(app.category)}
                    </div>

                    {/* Size */}
                    <div className="col-span-1 text-right text-gray-600">
                      {app.size_mb != null
                        ? (app.size_mb < 1024 
                            ? `${app.size_mb.toFixed(0)} MB`
                            : `${(app.size_mb / 1024).toFixed(2)} GB`)
                        : 'N/A'
                      }
                    </div>

                    {/* Install Date */}
                    <div className="col-span-2 flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-600">{app.install_date ? formatDateOnlyWithTimezone(app.install_date) : 'N/A'}</span>
                    </div>

                    {/* License */}
                    <div className="col-span-2 flex flex-col items-center gap-1">
                      {getLicenseBadge(app.license_type, app.license_expiry)}
                      {app.license_expiry && (
                        <span className="text-xs text-muted-foreground">
                          Expires: {formatDateOnlyWithTimezone(app.license_expiry)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Results Info */}
          {(search || categoryFilter !== 'all' || licenseFilter !== 'all') && (
            <div className="mt-3 text-sm text-muted-foreground text-center">
              Showing {filteredSoftware.length} of {software.length} applications
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}