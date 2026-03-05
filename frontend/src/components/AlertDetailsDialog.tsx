import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Textarea } from './ui/textarea'
import { Checkbox } from './ui/checkbox'
import { ScrollArea } from './ui/scroll-area'
import { AlertTriangle, CheckCircle2, Info as InfoIcon, X, Clock, User } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface AlertDetailsDialogProps {
  machineId: string
  machineName: string
  alerts: Alert[]
  onClose: () => void
  onAcknowledge: (alertIds: string[]) => void
}

interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  timestamp: Date
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: Date
}

export function AlertDetailsDialog({ 
  machineId, 
  machineName,
  alerts,
  onClose, 
  onAcknowledge 
}: AlertDetailsDialogProps) {
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set())
  const [acknowledgmentNote, setAcknowledgmentNote] = useState('')

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged)
  const acknowledgedAlerts = alerts.filter(a => a.acknowledged)

  const handleToggleAlert = (alertId: string) => {
    setSelectedAlerts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(alertId)) {
        newSet.delete(alertId)
      } else {
        newSet.add(alertId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedAlerts.size === unacknowledgedAlerts.length) {
      setSelectedAlerts(new Set())
    } else {
      setSelectedAlerts(new Set(unacknowledgedAlerts.map(a => a.id)))
    }
  }

  const handleAcknowledge = () => {
    if (selectedAlerts.size === 0) {
      toast.error('Please select at least one alert')
      return
    }

    onAcknowledge(Array.from(selectedAlerts))
    toast.success(`${selectedAlerts.size} alert${selectedAlerts.size !== 1 ? 's' : ''} acknowledged`)
    onClose()
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-50 border-red-200 text-red-700'
      case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-700'
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-700'
      default: return 'bg-gray-50 border-gray-200 text-gray-700'
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>
      case 'warning': return <Badge className="bg-yellow-500 hover:bg-yellow-600">Warning</Badge>
      case 'info': return <Badge variant="outline">Info</Badge>
      default: return <Badge variant="outline">{severity}</Badge>
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b bg-gradient-to-r from-orange-50 to-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                Alert Management
              </h2>
              <p className="text-sm text-muted-foreground">{machineName}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="border-b bg-gray-50 px-6 py-3">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="font-medium">{unacknowledgedAlerts.length}</span>
              <span className="text-muted-foreground">Unacknowledged</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="font-medium">{acknowledgedAlerts.length}</span>
              <span className="text-muted-foreground">Acknowledged</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="font-medium">{selectedAlerts.size}</span>
              <span className="text-muted-foreground">Selected</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Unacknowledged Alerts */}
            {unacknowledgedAlerts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">Unacknowledged Alerts</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSelectAll}
                  >
                    {selectedAlerts.size === unacknowledgedAlerts.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="space-y-3">
                  {unacknowledgedAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`
                        border rounded-lg transition-all cursor-pointer
                        ${selectedAlerts.has(alert.id) 
                          ? 'ring-2 ring-orange-500 border-orange-500' 
                          : 'hover:border-gray-300'
                        }
                        ${getSeverityColor(alert.severity)}
                      `}
                      onClick={() => handleToggleAlert(alert.id)}
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedAlerts.has(alert.id)}
                            onChange={() => handleToggleAlert(alert.id)}
                            className="mt-1 w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2">
                                {getSeverityBadge(alert.severity)}
                                <h4 className="font-medium">{alert.title}</h4>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                              </div>
                            </div>
                            <p className="text-sm">{alert.description}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Acknowledgment Note */}
            {selectedAlerts.size > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Acknowledgment Note (Optional)
                </label>
                <Textarea
                  value={acknowledgmentNote}
                  onChange={(e) => setAcknowledgmentNote(e.target.value)}
                  placeholder="Add a note about how these alerts were addressed..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>
            )}

            {/* Acknowledged Alerts */}
            {acknowledgedAlerts.length > 0 && (
              <div>
                <h3 className="font-medium mb-3">Previously Acknowledged</h3>
                <div className="space-y-3">
                  {acknowledgedAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="border border-gray-200 bg-gray-50 rounded-lg p-4 opacity-75"
                    >
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2">
                              {getSeverityBadge(alert.severity)}
                              <h4 className="font-medium text-gray-700">{alert.title}</h4>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
                          {alert.acknowledgedBy && (
                            <div className="flex items-center gap-2 text-xs text-green-700">
                              <User className="h-3 w-3" />
                              Acknowledged by {alert.acknowledgedBy} 
                              {alert.acknowledgedAt && (
                                <span className="text-muted-foreground">
                                  • {formatDistanceToNow(alert.acknowledgedAt, { addSuffix: true })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {alerts.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h3 className="font-medium text-lg mb-2">No Alerts</h3>
                <p className="text-sm text-muted-foreground">
                  This machine has no active alerts at this time.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {selectedAlerts.size > 0 && (
              <span>{selectedAlerts.size} alert{selectedAlerts.size !== 1 ? 's' : ''} selected</span>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Close
            </Button>
            {unacknowledgedAlerts.length > 0 && (
              <Button
                type="button"
                onClick={handleAcknowledge}
                className="bg-orange-600 hover:bg-orange-700"
                disabled={selectedAlerts.size === 0}
              >
                Acknowledge Selected ({selectedAlerts.size})
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}