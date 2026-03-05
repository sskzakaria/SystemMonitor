import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { 
  Usb,
  HardDrive,
  Keyboard,
  Mouse,
  Printer,
  Monitor,
  Speaker,
  RefreshCw,
  Loader2,
  AlertTriangle,
  History,
  Database,
  Activity,
  Clock
} from 'lucide-react'
import { getMachinePeripherals, getUSBCurrent, getUSBHistory, getUSBAudit, getUSBStats } from '../services/api'
import { toast } from 'sonner'

interface DevicesTabProps {
  machineId: string
}

export function DevicesTab({ machineId }: DevicesTabProps) {
  const [peripheralsData, setPeripheralsData] = useState<any>(null)
  const [usbSnapshot, setUSBSnapshot] = useState<any>(null)
  const [usbHistory, setUSBHistory] = useState<any>(null)
  const [usbAudit, setUSBAudit] = useState<any>(null)
  const [usbStats, setUSBStats] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('current')

  useEffect(() => {
    fetchAllUSBData()
  }, [machineId])

  const fetchAllUSBData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Fetch peripherals (legacy endpoint for displays, audio)
      const peripherals = await getMachinePeripherals(machineId)
      setPeripheralsData(peripherals)

      // Fetch USB data from new endpoints
      const [snapshot, history, audit, stats] = await Promise.allSettled([
        getUSBCurrent(machineId),
        getUSBHistory(machineId, { limit: 50 }),
        getUSBAudit(machineId),
        getUSBStats(machineId)
      ])

      if (snapshot.status === 'fulfilled') setUSBSnapshot(snapshot.value)
      if (history.status === 'fulfilled') setUSBHistory(history.value)
      if (audit.status === 'fulfilled') setUSBAudit(audit.value)
      if (stats.status === 'fulfilled') setUSBStats(stats.value)

    } catch (err) {
      console.error('Failed to fetch device data:', err)
      setError('Unable to load device information')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPeripherals = fetchAllUSBData // Alias for compatibility

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
        return <Usb className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'OK') {
      return <Badge className="bg-green-100 text-green-700 border-green-300">OK</Badge>
    }
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">{status}</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error || !peripheralsData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Usb className="h-12 w-12 mb-3 text-gray-400" />
        <p className="text-sm">{error || 'No peripheral data available'}</p>
        <p className="text-xs mt-2">Device information will appear once collected by the backend</p>
        <Button variant="outline" className="mt-4" onClick={fetchPeripherals}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  const usbDevices = peripheralsData.usb_devices || []
  const devicesByCategory = peripheralsData.devices_by_category || {}
  const storageDevices = devicesByCategory.storage || []
  const inputDevices = devicesByCategory.input || []
  const printers = devicesByCategory.printers || []
  const hubs = devicesByCategory.hubs || []
  const displays = peripheralsData.displays || []
  const audioInputs = peripheralsData.audio?.input_devices || []
  const audioOutputs = peripheralsData.audio?.output_devices || []

  const totalDevices = usbDevices.length + displays.length + audioInputs.length + audioOutputs.length

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDevices}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">USB Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usbDevices.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Displays</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displays.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Audio Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{audioInputs.length + audioOutputs.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* USB Devices */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Usb className="h-5 w-5" />
              USB Devices ({usbDevices.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={fetchPeripherals}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {/* Storage Devices */}
              {storageDevices.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Storage Devices ({storageDevices.length})
                  </h3>
                  <div className="space-y-2">
                    {storageDevices.map((dev: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        {getDeviceIcon('storage')}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{dev.name}</div>
                          <div className="text-xs text-muted-foreground">{dev.manufacturer || 'Unknown manufacturer'}</div>
                          {dev.device_id && (
                            <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                              {dev.device_id}
                            </div>
                          )}
                        </div>
                        {getStatusBadge(dev.status)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Devices */}
              {inputDevices.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Input Devices ({inputDevices.length})
                  </h3>
                  <div className="space-y-2">
                    {inputDevices.map((dev: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        {getDeviceIcon('input')}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{dev.name}</div>
                          <div className="text-xs text-muted-foreground">{dev.manufacturer || 'Unknown manufacturer'}</div>
                        </div>
                        {getStatusBadge(dev.status)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* USB Hubs */}
              {hubs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    USB Hubs ({hubs.length})
                  </h3>
                  <div className="space-y-2">
                    {hubs.map((dev: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        {getDeviceIcon('hub')}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{dev.name}</div>
                          <div className="text-xs text-muted-foreground">{dev.manufacturer || 'Unknown manufacturer'}</div>
                        </div>
                        {getStatusBadge(dev.status)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Printers */}
              {printers.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Printers ({printers.length})
                  </h3>
                  <div className="space-y-2">
                    {printers.map((dev: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        {getDeviceIcon('printer')}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{dev.name}</div>
                          <div className="text-xs text-muted-foreground">{dev.manufacturer || 'Unknown manufacturer'}</div>
                        </div>
                        {getStatusBadge(dev.status)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {usbDevices.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Usb className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>No USB devices detected</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Displays & Audio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Displays */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Displays ({displays.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {displays.length > 0 ? (
                displays.map((display: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg border bg-card">
                    <div className="font-medium">{display.name}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {display.horizontal_resolution && display.vertical_resolution
                        ? `${display.horizontal_resolution}×${display.vertical_resolution} @ ${display.refresh_rate}Hz`
                        : display.adapter_type
                      }
                    </div>
                    {display.video_processor && display.video_processor !== 'Unknown' && (
                      <div className="text-xs text-muted-foreground mt-1">{display.video_processor}</div>
                    )}
                    {display.adapter_ram_mb && display.adapter_ram_mb > 0 && (
                      <div className="text-xs text-muted-foreground">VRAM: {display.adapter_ram_mb} MB</div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Monitor className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>No displays detected</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Audio Devices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Speaker className="h-5 w-5" />
              Audio Devices ({audioInputs.length + audioOutputs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {audioOutputs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Audio Outputs ({audioOutputs.length})
                  </h3>
                  <div className="space-y-2">
                    {audioOutputs.map((audio: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                        <Speaker className="h-4 w-4 text-green-600" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{audio.name}</div>
                          <div className="text-xs text-muted-foreground">{audio.manufacturer}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {audioInputs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Audio Inputs ({audioInputs.length})
                  </h3>
                  <div className="space-y-2">
                    {audioInputs.map((audio: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                        <Speaker className="h-4 w-4 text-blue-600" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{audio.name}</div>
                          <div className="text-xs text-muted-foreground">{audio.manufacturer}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {audioInputs.length === 0 && audioOutputs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Speaker className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>No audio devices detected</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}