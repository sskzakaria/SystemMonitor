import { useState, useEffect } from 'react'
import { getMachineSecurity, getLoginHistory, getMachinePeripherals } from '../services/api'
import { formatRelativeTime } from '../lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Package,
  Usb,
  HardDrive,
  Keyboard,
  Printer,
  Smartphone,
  Monitor,
  Speaker,
  Network,
  Globe,
  Copy,
  Search,
  AlertTriangle,
  Building2,
  Info,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  Loader2
} from 'lucide-react'
import type { HeartbeatMetrics } from '../types/monitor-schema'

interface SecurityTabProps {
  machineId: string
  hostname: string
  metrics: HeartbeatMetrics
}

export function SecurityTab({ machineId, hostname, metrics }: SecurityTabProps) {
  const [securityData, setSecurityData] = useState<any>(null)
  const [peripheralsData, setPeripheralsData] = useState<any>(null)
  const [loginHistory, setLoginHistory] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchProgram, setSearchProgram] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  useEffect(() => {
    const fetchSecurityData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        // Fetch security status
        const [security, peripherals, logins] = await Promise.all([
          getMachineSecurity(machineId),
          getMachinePeripherals(machineId).catch(() => null),
          getLoginHistory(machineId, { days: 7, limit: 20 }).catch(() => ({ sessions: [] }))
        ])
        
        setSecurityData(security)
        setPeripheralsData(peripherals)
        // Backend transformer provides login_history, login_history_24h, and sessions
        // Check all possible field names for maximum compatibility
        setLoginHistory(
          logins.sessions || 
          logins.login_history || 
          logins.login_history_24h || 
          []
        )
      } catch (err) {
        console.error('Failed to fetch security data:', err)
        setError('Unable to load security data')
        setSecurityData(null)
        setPeripheralsData(null)
        setLoginHistory([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchSecurityData()
  }, [machineId])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error || !securityData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Shield className="h-12 w-12 mb-3 text-gray-400" />
        <p className="text-sm">{error || 'No security data available'}</p>
        <p className="text-xs mt-2">Security information will appear once collected by the backend</p>
      </div>
    )
  }

  // ===  SECURITY SOFTWARE ===
  const antivirusItems = securityData.antivirus || []
  const firewallItems = securityData.firewall || []
  const windowsDefender = securityData.windows_defender || null
  const securitySummary = securityData.security_summary || {}

  const getSecurityIcon = (enabled: boolean) => {
    return enabled ? (
      <ShieldCheck className="h-5 w-5 text-green-600" />
    ) : (
      <ShieldX className="h-5 w-5 text-red-600" />
    )
  }

  const getSecurityBadgeColor = (enabled: boolean) => {
    return enabled
      ? 'bg-green-100 text-green-700 border-green-300'
      : 'bg-red-100 text-red-700 border-red-300'
  }

  // === INSTALLED PROGRAMS ===
  const installedPrograms = securityData.installed_programs || []
  const filteredPrograms = installedPrograms.filter((prog: any) => {
    const matchesSearch = searchProgram === '' || 
      prog.name?.toLowerCase().includes(searchProgram.toLowerCase()) ||
      prog.publisher?.toLowerCase().includes(searchProgram.toLowerCase())
    
    if (selectedCategory === 'all') return matchesSearch
    
    // Categorize programs
    const publisher = (prog.publisher || '').toLowerCase()
    if (selectedCategory === 'microsoft' && publisher.includes('microsoft')) return matchesSearch
    if (selectedCategory === 'games' && isGameProgram(prog.name)) return matchesSearch
    if (selectedCategory === 'development' && isDevelopmentTool(prog.name, publisher)) return matchesSearch
    if (selectedCategory === 'drivers' && isDriver(prog.name)) return matchesSearch
    
    return false
  })

  function isGameProgram(name: string): boolean {
    const gameName = (name || '').toLowerCase()
    const gameKeywords = ['steam', 'epic', 'ea ', 'riot', 'battle.net', 'blizzard', 'valorant', 'league', 'overwatch', 'game']
    return gameKeywords.some(keyword => gameName.includes(keyword))
  }

  function isDevelopmentTool(name: string, publisher: string): boolean {
    const devKeywords = ['python', 'java', 'node', 'git', 'visual studio', 'vs code', 'jetbrains', 'mongodb', 'docker', 'sdk', 'jdk', 'compiler', 'intellij', 'pycharm', 'webstorm', 'clion']
    const searchStr = `${name} ${publisher}`.toLowerCase()
    return devKeywords.some(keyword => searchStr.includes(keyword))
  }

  function isDriver(name: string): boolean {
    const driverName = (name || '').toLowerCase()
    return driverName.includes('driver') || driverName.includes('chipset') || driverName.includes('controller')
  }

  const programCategories = [
    { id: 'all', label: 'All Programs', count: installedPrograms.length },
    { id: 'microsoft', label: 'Microsoft', count: installedPrograms.filter((p: any) => (p.publisher || '').toLowerCase().includes('microsoft')).length },
    { id: 'games', label: 'Games', count: installedPrograms.filter((p: any) => isGameProgram(p.name)).length },
    { id: 'development', label: 'Development', count: installedPrograms.filter((p: any) => isDevelopmentTool(p.name, p.publisher || '')).length },
    { id: 'drivers', label: 'Drivers', count: installedPrograms.filter((p: any) => isDriver(p.name)).length },
  ]

  // === USB DEVICES ===
  const usbDevices = peripheralsData?.usb_devices || []
  const devicesByCategory = peripheralsData?.devices_by_category || {}
  const storageDevices = devicesByCategory.storage || []
  const inputDevices = devicesByCategory.input || []
  const printers = devicesByCategory.printers || []
  const hubs = devicesByCategory.hubs || []

  // === DISPLAYS & AUDIO ===
  const displays = peripheralsData?.displays || []
  const audioInputs = peripheralsData?.audio?.input_devices || []
  const audioOutputs = peripheralsData?.audio?.output_devices || []

  // === LOGIN HISTORY ===
  const loginEvents = loginHistory.map((session: any, index: number) => ({
    id: `login-${index}`,
    username: session.username || session.user || 'Unknown',
    loginType: session.login_type || 'Local',
    timestamp: new Date(session.login_time || session.started_iso || Date.now()),
    ipAddress: session.ip_address || 'N/A',
    status: 'success',
    location: session.location || session.terminal
  }))

  const getDeviceIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'storage':
        return <HardDrive className="h-4 w-4 text-blue-600" />
      case 'input':
        return <Keyboard className="h-4 w-4 text-purple-600" />
      case 'printer':
        return <Printer className="h-4 w-4 text-green-600" />
      case 'hub':
        return <Usb className="h-4 w-4 text-orange-600" />
      default:
        return <Smartphone className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'OK') {
      return <Badge className="bg-green-100 text-green-700 border-green-300">OK</Badge>
    }
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">{status}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* === SECURITY OVERVIEW === */}
      <Card className={securitySummary.overall_status === 'warning' ? 'bg-yellow-50' : 'bg-green-50'}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Overview
            </CardTitle>
            <Badge variant="outline" className={`text-lg px-3 py-1 ${
              securitySummary.overall_status === 'warning' 
                ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                : 'bg-green-100 text-green-700 border-green-300'
            }`}>
              {securitySummary.overall_status === 'warning' ? 'Warning' : 'Protected'}
            </Badge>
          </div>
          {securitySummary.issues && securitySummary.issues.length > 0 && (
            <CardDescription className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="h-4 w-4" />
              {securitySummary.issues.join(', ')}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Windows Defender */}
            {windowsDefender && (
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-accent/50 transition-colors">
                {getSecurityIcon(windowsDefender.enabled)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">Windows Defender</div>
                    <Badge variant="outline" className={`text-xs ${getSecurityBadgeColor(windowsDefender.enabled)}`}>
                      {windowsDefender.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Signature: {windowsDefender.antivirus_signature_version?.substring(0, 15) || 'Unknown'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Real-time: {windowsDefender.real_time_protection ? 'Active' : 'Inactive'}
                  </div>
                </div>
              </div>
            )}

            {/* Antivirus Products */}
            {antivirusItems.map((av: any, index: number) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-accent/50 transition-colors">
                {getSecurityIcon(av.enabled)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{av.display_name || av.name || 'Antivirus'}</div>
                    <Badge variant="outline" className={`text-xs ${getSecurityBadgeColor(av.enabled)}`}>
                      {av.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {av.updated ? 'Up to date' : 'Outdated'}
                  </div>
                </div>
              </div>
            ))}

            {/* Firewall */}
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-accent/50 transition-colors">
              {getSecurityIcon(securitySummary.firewall_enabled)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">Windows Firewall</div>
                  <Badge variant="outline" className={`text-xs ${getSecurityBadgeColor(securitySummary.firewall_enabled)}`}>
                    {securitySummary.firewall_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {firewallItems.length} firewall{firewallItems.length !== 1 ? 's' : ''} configured
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* === INSTALLED SOFTWARE === */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Installed Software ({installedPrograms.length} programs)
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search programs..."
                value={searchProgram}
                onChange={(e) => setSearchProgram(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {programCategories.map(cat => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label} ({cat.count})
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {filteredPrograms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No programs found matching your search
                </div>
              ) : (
                filteredPrograms.map((program: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Package className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{program.name}</div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        {program.publisher && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {program.publisher}
                          </span>
                        )}
                        {program.version && (
                          <span className="flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            v{program.version}
                          </span>
                        )}
                        {program.install_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {program.install_date}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* === USB DEVICES & PERIPHERALS === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* USB Devices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Usb className="h-5 w-5" />
              USB Devices ({usbDevices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {storageDevices.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Storage ({storageDevices.length})</div>
                  {storageDevices.map((dev: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border bg-card mb-2">
                      {getDeviceIcon('storage')}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{dev.name}</div>
                        <div className="text-xs text-muted-foreground">{dev.manufacturer}</div>
                      </div>
                      {getStatusBadge(dev.status)}
                    </div>
                  ))}
                </div>
              )}

              {inputDevices.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Input Devices ({inputDevices.length})</div>
                  {inputDevices.map((dev: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border bg-card mb-2">
                      {getDeviceIcon('input')}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{dev.name}</div>
                        <div className="text-xs text-muted-foreground">{dev.manufacturer}</div>
                      </div>
                      {getStatusBadge(dev.status)}
                    </div>
                  ))}
                </div>
              )}

              {hubs.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">USB Hubs ({hubs.length})</div>
                  {hubs.map((dev: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border bg-card mb-2">
                      {getDeviceIcon('hub')}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{dev.name}</div>
                      </div>
                      {getStatusBadge(dev.status)}
                    </div>
                  ))}
                </div>
              )}

              {usbDevices.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No USB devices detected
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Displays & Audio */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Displays & Audio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {displays.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Displays ({displays.length})</div>
                  {displays.map((display: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-lg border bg-card mb-2">
                      <div className="font-medium">{display.name}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {display.horizontal_resolution && display.vertical_resolution
                          ? `${display.horizontal_resolution}×${display.vertical_resolution} @ ${display.refresh_rate}Hz`
                          : display.adapter_type
                        }
                      </div>
                      {display.adapter_ram_mb && display.adapter_ram_mb > 0 && (
                        <div className="text-xs text-muted-foreground">VRAM: {display.adapter_ram_mb} MB</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {audioOutputs.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Audio Outputs ({audioOutputs.length})</div>
                  {audioOutputs.slice(0, 3).map((audio: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border bg-card mb-2">
                      <Speaker className="h-4 w-4 text-green-600" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{audio.name}</div>
                        <div className="text-xs text-muted-foreground">{audio.manufacturer}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {displays.length === 0 && audioOutputs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No peripherals detected
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === LOGIN HISTORY === */}
      {loginEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Login History (Last 7 Days)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {loginEvents.map((login: any) => (
                <div
                  key={login.id}
                  className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{login.username}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-gray-600" />
                      <span className="text-sm text-muted-foreground">{login.loginType}</span>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      <code className="bg-white px-2 py-0.5 rounded border text-xs">
                        {login.ipAddress}
                      </code>
                    </div>
                    
                    <div className="text-sm text-muted-foreground text-right">
                      {formatRelativeTime(login.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* === NETWORK INFORMATION === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Network Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-2 rounded-lg bg-accent/50">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">IP Address:</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
                  {metrics.network.ip_address || 'Unknown'}
                </code>
                {metrics.network.ip_address && metrics.network.ip_address !== 'Unknown' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(metrics.network.ip_address!, 'IP Address')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-accent/50">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">MAC Address:</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
                  {metrics.network.mac_address || 'Unknown'}
                </code>
                {metrics.network.mac_address && metrics.network.mac_address !== 'Unknown' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(metrics.network.mac_address!, 'MAC Address')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}