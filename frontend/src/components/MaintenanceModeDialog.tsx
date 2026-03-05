import { useState } from 'react'
import { Wrench, Calendar as CalendarIcon, Clock, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover'
import { Calendar } from './ui/calendar'

export interface MaintenanceConfig {
  enabled: boolean
  reason: string
  notes?: string
  startTime?: Date
  endTime?: Date
  suppressAlerts: boolean
  notifyUsers: boolean
  scheduledBy?: string
}

interface MaintenanceModeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machineIds: string[]
  onConfirm: (config: MaintenanceConfig) => void
}

const MAINTENANCE_REASONS = [
  'Scheduled maintenance',
  'Hardware upgrade',
  'Software update',
  'System diagnostics',
  'Repair',
  'Testing',
  'Other'
]

export function MaintenanceModeDialog({
  open,
  onOpenChange,
  machineIds,
  onConfirm
}: MaintenanceModeDialogProps) {
  const [config, setConfig] = useState<MaintenanceConfig>({
    enabled: true,
    reason: MAINTENANCE_REASONS[0],
    notes: '',
    startTime: new Date(),
    endTime: undefined,
    suppressAlerts: true,
    notifyUsers: false
  })

  const [customReason, setCustomReason] = useState('')
  const [showStartCalendar, setShowStartCalendar] = useState(false)
  const [showEndCalendar, setShowEndCalendar] = useState(false)

  const handleConfirm = () => {
    const finalConfig = {
      ...config,
      reason: config.reason === 'Other' ? customReason : config.reason,
      scheduledBy: 'Current User' // Replace with actual user from auth
    }

    if (!finalConfig.reason.trim()) {
      toast.error('Please provide a reason for maintenance')
      return
    }

    if (config.endTime && config.startTime && config.endTime <= config.startTime) {
      toast.error('End time must be after start time')
      return
    }

    onConfirm(finalConfig)
    onOpenChange(false)
    
    // Reset form
    setConfig({
      enabled: true,
      reason: MAINTENANCE_REASONS[0],
      notes: '',
      startTime: new Date(),
      endTime: undefined,
      suppressAlerts: true,
      notifyUsers: false
    })
    setCustomReason('')

    toast.success(`Maintenance mode scheduled for ${machineIds.length} machine(s)`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Schedule Maintenance Mode
          </DialogTitle>
          <DialogDescription>
            Configure maintenance window for {machineIds.length} selected machine(s)
          </DialogDescription>
        </DialogHeader>

        {/* ✅ Warning Banner */}
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-orange-900">Important Warnings</h4>
            <ul className="text-sm text-orange-800 space-y-1 list-disc list-inside">
              <li>Machines will be unavailable to users during maintenance</li>
              <li>Active user sessions may be interrupted</li>
              <li>System monitoring will continue during maintenance</li>
              {config.suppressAlerts && (
                <li className="font-medium">Alert suppression is enabled - critical issues may go unnoticed</li>
              )}
              {machineIds.length > 10 && (
                <li className="font-medium text-orange-900">
                  You are affecting {machineIds.length} machines - ensure this is intentional
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="space-y-6 pt-4">
          {/* Maintenance Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Maintenance Reason</Label>
            <Select
              value={config.reason}
              onValueChange={(value) => setConfig({ ...config, reason: value })}
            >
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAINTENANCE_REASONS.map(reason => (
                  <SelectItem key={reason} value={reason}>
                    {reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Reason Input */}
          {config.reason === 'Other' && (
            <div className="space-y-2">
              <Label htmlFor="custom-reason">Custom Reason</Label>
              <Input
                id="custom-reason"
                placeholder="Enter custom maintenance reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Enter any additional notes about this maintenance window"
              value={config.notes}
              onChange={(e) => setConfig({ ...config, notes: e.target.value })}
              rows={3}
            />
          </div>

          {/* Start Time */}
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Popover open={showStartCalendar} onOpenChange={setShowStartCalendar}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {config.startTime ? format(config.startTime, 'PPP p') : 'Select start time'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={config.startTime}
                  onSelect={(date) => {
                    setConfig({ ...config, startTime: date })
                    setShowStartCalendar(false)
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* End Time */}
          <div className="space-y-2">
            <Label>End Time (Optional)</Label>
            <Popover open={showEndCalendar} onOpenChange={setShowEndCalendar}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Clock className="h-4 w-4" />
                  {config.endTime ? format(config.endTime, 'PPP p') : 'Select end time (leave empty for manual end)'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={config.endTime}
                  onSelect={(date) => {
                    setConfig({ ...config, endTime: date })
                    setShowEndCalendar(false)
                  }}
                  disabled={(date) => config.startTime ? date <= config.startTime : false}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              If no end time is set, maintenance mode will continue until manually disabled
            </p>
          </div>

          {/* Options */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Suppress Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Prevent alerts from being generated during maintenance
                </p>
              </div>
              <Switch
                checked={config.suppressAlerts}
                onCheckedChange={(checked) => setConfig({ ...config, suppressAlerts: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notify Users</Label>
                <p className="text-sm text-muted-foreground">
                  Send notification to users about scheduled maintenance
                </p>
              </div>
              <Switch
                checked={config.notifyUsers}
                onCheckedChange={(checked) => setConfig({ ...config, notifyUsers: checked })}
              />
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <h4 className="font-medium text-blue-900">Maintenance Summary</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• {machineIds.length} machine(s) will enter maintenance mode</p>
              <p>• Reason: {config.reason === 'Other' ? customReason || 'Not specified' : config.reason}</p>
              <p>• Start: {config.startTime ? format(config.startTime, 'PPP p') : 'Not set'}</p>
              <p>• End: {config.endTime ? format(config.endTime, 'PPP p') : 'Manual end'}</p>
              {config.suppressAlerts && <p>• Alerts will be suppressed</p>}
              {config.notifyUsers && <p>• Users will be notified</p>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button onClick={handleConfirm} className="flex-1 gap-2">
              <Wrench className="h-4 w-4" />
              Schedule Maintenance
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}