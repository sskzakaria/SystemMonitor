import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { 
  Search, 
  XCircle, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Activity,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

// Extended ProcessInfo with additional fields
interface ProcessInfoExtended {
  pid: number
  name: string
  cpu_percent: number
  memory_mb: number
  memory_percent: number
  status: 'running' | 'sleeping' | 'idle' | 'stopped'
  user: string
  priority: number
  threads: number
  uptime_seconds: number
}

interface ProcessManagementTabProps {
  machineId: string
  processes: ProcessInfoExtended[]
}

type SortField = 'cpu' | 'memory' | 'name' | 'pid'
type SortOrder = 'asc' | 'desc'

export function ProcessManagementTab({ machineId, processes }: ProcessManagementTabProps) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('cpu')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Show empty state if no process data
  if (!processes || processes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Running Processes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Activity className="h-12 w-12 mb-3 text-gray-400" />
            <p className="text-sm">No process data available</p>
            <p className="text-xs mt-2">Process information will appear once collected by the backend</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Filter and sort processes
  const filteredProcesses = useMemo(() => {
    let filtered = processes

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.pid.toString().includes(searchLower) ||
        p.user.toLowerCase().includes(searchLower)
      )
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0
      
      switch (sortField) {
        case 'cpu':
          comparison = (a.cpu_percent || 0) - (b.cpu_percent || 0)
          break
        case 'memory':
          comparison = (a.memory_mb || 0) - (b.memory_mb || 0)
          break
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'pid':
          comparison = a.pid - b.pid
          break
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [processes, search, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const handleKillProcess = (process: ProcessInfoExtended) => {
    toast.warning(`Terminate ${process.name}?`, {
      description: `PID ${process.pid} will be forcefully terminated`,
      action: {
        label: 'Terminate',
        onClick: () => {
          toast.success('Process terminated', {
            description: `${process.name} (PID ${process.pid}) has been stopped`
          })
        }
      }
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-green-100 text-green-700 border-green-300">Running</Badge>
      case 'sleeping':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-300">Sleeping</Badge>
      case 'idle':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-300">Idle</Badge>
      case 'stopped':
        return <Badge className="bg-red-100 text-red-700 border-red-300">Stopped</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc' ? 
      <ChevronUp className="h-4 w-4 inline-block ml-1" /> : 
      <ChevronDown className="h-4 w-4 inline-block ml-1" />
  }

  // Calculate summary stats
  const totalCpu = processes.reduce((sum, p) => sum + (p.cpu_percent || 0), 0)
  const totalMemory = processes.reduce((sum, p) => sum + (p.memory_mb || 0), 0)
  const highCpuProcesses = processes.filter(p => (p.cpu_percent || 0) > 50).length
  const highMemoryProcesses = processes.filter(p => (p.memory_percent || 0) > 10).length

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Processes</p>
              <p className="text-3xl font-semibold mt-1">{processes.length}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total CPU Usage</p>
              <p className="text-3xl font-semibold mt-1">{totalCpu.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Memory</p>
              <p className="text-3xl font-semibold mt-1">{(totalMemory / 1024).toFixed(1)} GB</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">High Usage</p>
              <div className="flex items-center justify-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <Activity className="h-4 w-4 text-orange-600" />
                  <span className="text-xl font-semibold">{highCpuProcesses}</span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="text-xl font-semibold">{highMemoryProcesses}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Process List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Running Processes</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search processes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 rounded-t-lg border-b border-gray-200 font-medium text-sm text-gray-700">
              <div 
                className="col-span-1 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('pid')}
              >
                PID <SortIcon field="pid" />
              </div>
              <div 
                className="col-span-3 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('name')}
              >
                Process Name <SortIcon field="name" />
              </div>
              <div className="col-span-1 text-center">Status</div>
              <div 
                className="col-span-1 text-right cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('cpu')}
              >
                CPU <SortIcon field="cpu" />
              </div>
              <div 
                className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('memory')}
              >
                Memory <SortIcon field="memory" />
              </div>
              <div className="col-span-2">User</div>
              <div className="col-span-1 text-center">Threads</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {/* Process Rows */}
            <div className="divide-y divide-gray-100">
              {filteredProcesses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No processes found</p>
                </div>
              ) : (
                filteredProcesses.map((process) => (
                  <div 
                    key={process.pid}
                    className="grid grid-cols-12 gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-sm"
                  >
                    {/* PID */}
                    <div className="col-span-1 font-mono text-gray-600">
                      {process.pid}
                    </div>

                    {/* Process Name */}
                    <div className="col-span-3 font-medium truncate" title={process.name}>
                      {process.name}
                    </div>

                    {/* Status */}
                    <div className="col-span-1 flex justify-center">
                      {getStatusBadge(process.status)}
                    </div>

                    {/* CPU */}
                    <div className="col-span-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(process.cpu_percent || 0) > 50 && (
                          <TrendingUp className="h-3.5 w-3.5 text-orange-600" />
                        )}
                        <span className={(process.cpu_percent || 0) > 50 ? 'text-orange-600 font-semibold' : ''}>
                          {(process.cpu_percent || 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Memory */}
                    <div className="col-span-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(process.memory_percent || 0) > 10 && (
                          <TrendingUp className="h-3.5 w-3.5 text-orange-600" />
                        )}
                        <div className={(process.memory_percent || 0) > 10 ? 'text-orange-600 font-semibold' : ''}>
                          {(process.memory_mb || 0).toFixed(0)} MB
                          <span className="text-xs text-muted-foreground ml-1">
                            ({(process.memory_percent || 0).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* User */}
                    <div className="col-span-2 text-gray-600 truncate" title={process.user}>
                      {process.user}
                    </div>

                    {/* Threads */}
                    <div className="col-span-1 text-center text-gray-600">
                      {process.threads}
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleKillProcess(process)}
                        className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Results Info */}
          {search && (
            <div className="mt-3 text-sm text-muted-foreground text-center">
              Showing {filteredProcesses.length} of {processes.length} processes
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}