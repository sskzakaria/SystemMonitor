import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Progress } from './ui/progress'
import {
  Wifi,
  Network,
  Globe,
  Activity,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SignalZero,
  CheckCircle2,
  XCircle,
  Copy,
  Ethernet,
  Smartphone,
  Info,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { API_CONFIG } from '../config'

interface NetworkTabProps {
  machineId: string
}

interface NetworkInterface {
  name: string
  mac_address?: string
  connection_type?: string
  is_up: boolean
  speed_mbps?: number
  ipv4?: Array<{ address: string; netmask: string }>
  ipv6?: Array<{ address: string; prefix: number }>
  has_gateway?: boolean
  gateway?: string
  signal_strength?: number
}

interface NetworkData {
  primary_ip?: string
  gateway?: string
  dns_servers?: string[]
  quality_score?: number
  online?: boolean
  interfaces?: NetworkInterface[]
  timestamp?: string
}

export function NetworkTabFull({ machineId }: NetworkTabProps) {
  const [networkData, setNetworkData] = useState<NetworkData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchNetworkData = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        const response = await fetch(
          `${API_CONFIG.baseURL}/machines/${machineId}/network`,
          { headers: { 'Content-Type': 'application/json' } }
        )
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        
        const data = await response.json()
        setNetworkData(data)
      } catch (err) {
        console.error('Failed to fetch network data:', err)
        setError('Unable to load network data')
        setNetworkData(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchNetworkData()
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchNetworkData, 30000)
    return () => clearInterval(interval)
  }, [machineId])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  const getConnectionIcon = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'wireless':
        return <Wifi className="h-4 w-4" />
      case 'wired':
        return <Ethernet className="h-4 w-4" />
      case 'mobile':
        return <Smartphone className="h-4 w-4" />
      default:
        return <Network className="h-4 w-4" />
    }
  }

  const getSignalIcon = (strength?: number) => {
    if (!strength) return <SignalZero className="h-4 w-4 text-gray-400" />
    if (strength >= 75) return <SignalHigh className="h-4 w-4 text-green-600" />
    if (strength >= 50) return <SignalMedium className="h-4 w-4 text-yellow-600" />
    if (strength >= 25) return <SignalLow className="h-4 w-4 text-orange-600" />
    return <SignalZero className="h-4 w-4 text-red-600" />
  }

  const getQualityColor = (score?: number) => {
    if (!score) return 'text-gray-500'
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error || !networkData) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center text-gray-500">
            <Network className="h-12 w-12 mb-3 text-gray-400" />
            <p className="text-sm">{error || 'No network data available'}</p>
            <p className="text-xs mt-2">Network information will appear once collected by the backend</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Network Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Network Overview
          </CardTitle>
          <CardDescription>Primary network configuration and status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Internet Status */}
            <div className="p-4 bg-accent/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Internet Status</span>
                {networkData.online ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
              </div>
              <p className="text-lg font-semibold">
                {networkData.online ? 'Connected' : 'Offline'}
              </p>
            </div>

            {/* Primary IP */}
            <div className="p-4 bg-accent/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Primary IP</span>
                {networkData.primary_ip && networkData.primary_ip !== 'N/A' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(networkData.primary_ip!, 'IP Address')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <p className="text-lg font-semibold font-mono">
                {networkData.primary_ip || 'N/A'}
              </p>
            </div>

            {/* Gateway */}
            <div className="p-4 bg-accent/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Gateway</span>
                {networkData.gateway && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(networkData.gateway!, 'Gateway')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <p className="text-lg font-semibold font-mono">
                {networkData.gateway || 'N/A'}
              </p>
            </div>

            {/* Network Quality */}
            <div className="p-4 bg-accent/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Quality Score</span>
                <Activity className={`h-4 w-4 ${getQualityColor(networkData.quality_score)}`} />
              </div>
              <div className="space-y-2">
                <p className={`text-lg font-semibold ${getQualityColor(networkData.quality_score)}`}>
                  {networkData.quality_score ? `${networkData.quality_score}%` : 'N/A'}
                </p>
                {networkData.quality_score && (
                  <Progress value={networkData.quality_score} className="h-1" />
                )}
              </div>
            </div>
          </div>

          {/* DNS Servers */}
          {networkData.dns_servers && networkData.dns_servers.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">DNS Servers</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {networkData.dns_servers.map((dns, index) => (
                  <Badge key={index} variant="secondary" className="font-mono">
                    {dns}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Network Interfaces */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Network Interfaces
          </CardTitle>
          <CardDescription>
            Detailed information about network adapters
          </CardDescription>
        </CardHeader>
        <CardContent>
          {networkData.interfaces && networkData.interfaces.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {networkData.interfaces.map((iface, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-2 transition-colors ${
                      iface.is_up
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    {/* Interface Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {getConnectionIcon(iface.connection_type)}
                        <h4 className="font-semibold">{iface.name}</h4>
                        <Badge variant={iface.is_up ? 'default' : 'secondary'}>
                          {iface.is_up ? 'Active' : 'Inactive'}
                        </Badge>
                        {iface.connection_type && (
                          <Badge variant="outline" className="capitalize">
                            {iface.connection_type}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Signal Strength (for wireless) */}
                      {iface.connection_type === 'wireless' && iface.signal_strength !== undefined && (
                        <div className="flex items-center gap-2">
                          {getSignalIcon(iface.signal_strength)}
                          <span className="text-sm font-medium">
                            {iface.signal_strength}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Interface Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {/* MAC Address */}
                      {iface.mac_address && (
                        <div className="flex items-center justify-between p-2 bg-white rounded border">
                          <span className="text-muted-foreground">MAC Address:</span>
                          <div className="flex items-center gap-2">
                            <code className="font-mono font-medium">
                              {iface.mac_address}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => copyToClipboard(iface.mac_address!, 'MAC Address')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Speed */}
                      {iface.speed_mbps && (
                        <div className="flex items-center justify-between p-2 bg-white rounded border">
                          <span className="text-muted-foreground">Link Speed:</span>
                          <span className="font-medium">
                            {iface.speed_mbps} Mbps
                          </span>
                        </div>
                      )}

                      {/* IPv4 Addresses */}
                      {iface.ipv4 && iface.ipv4.length > 0 && (
                        <div className="col-span-full">
                          <div className="text-muted-foreground mb-1">IPv4 Address:</div>
                          <div className="space-y-1">
                            {iface.ipv4.map((ip, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border">
                                <code className="font-mono font-medium">{ip.address}</code>
                                <span className="text-xs text-muted-foreground">
                                  Mask: {ip.netmask}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* IPv6 Addresses */}
                      {iface.ipv6 && iface.ipv6.length > 0 && (
                        <div className="col-span-full">
                          <div className="text-muted-foreground mb-1">IPv6 Address:</div>
                          <div className="space-y-1">
                            {iface.ipv6.map((ip, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border">
                                <code className="font-mono text-xs font-medium">{ip.address}</code>
                                <span className="text-xs text-muted-foreground">
                                  Prefix: /{ip.prefix}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Gateway */}
                      {iface.gateway && (
                        <div className="flex items-center justify-between p-2 bg-white rounded border">
                          <span className="text-muted-foreground">Gateway:</span>
                          <code className="font-mono font-medium">
                            {iface.gateway}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <Network className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No network interfaces detected</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
