import { useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Calendar, Clock, AlertTriangle, X } from 'lucide-react'

interface MaintenanceScheduleDialogProps {
  machineId: string
  machineName: string
  onClose: () => void
  onSchedule: (data: MaintenanceSchedule) => void
}

export interface MaintenanceSchedule {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  reason: string
  notes: string
  suppressAlerts: boolean
}

export function MaintenanceScheduleDialog({ 
  machineId, 
  machineName, 
  onClose, 
  onSchedule 
}: MaintenanceScheduleDialogProps) {
  const [formData, setFormData] = useState<MaintenanceSchedule>({
    startDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endDate: new Date().toISOString().split('T')[0],
    endTime: '17:00',
    reason: 'routine',
    notes: '',
    suppressAlerts: true
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate dates
    const start = new Date(`${formData.startDate}T${formData.startTime}`)
    const end = new Date(`${formData.endDate}T${formData.endTime}`)
    
    if (end <= start) {
      toast.error('End date/time must be after start date/time')
      return
    }
    
    onSchedule(formData)
    toast.success('Maintenance scheduled successfully', {
      description: `${machineName} will be in maintenance mode`
    })
    onClose()
  }

  const handleChange = (field: keyof MaintenanceSchedule, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="border-b bg-gradient-to-r from-purple-50 to-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">Schedule Maintenance</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">{machineName}</DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Info Alert */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-blue-900">Maintenance Mode</p>
                <p className="text-sm text-blue-700 mt-1">
                  During maintenance, the machine will be marked as unavailable and alerts can be optionally suppressed.
                </p>
              </div>
            </div>

            {/* Reason */}
            <div>
              <Label className="block text-sm font-medium mb-2">
                Maintenance Reason
              </Label>
              <select
                value={formData.reason}
                onChange={(e) => handleChange('reason', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              >
                <option value="routine">Routine Maintenance</option>
                <option value="hardware">Hardware Upgrade</option>
                <option value="software">Software Update</option>
                <option value="repair">Repair</option>
                <option value="testing">Testing</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Date/Time Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Start Date */}
              <div>
                <Label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-purple-600" />
                  Start Date
                </Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* Start Time */}
              <div>
                <Label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-600" />
                  Start Time
                </Label>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => handleChange('startTime', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* End Date */}
              <div>
                <Label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-purple-600" />
                  End Date
                </Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => handleChange('endDate', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* End Time */}
              <div>
                <Label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-600" />
                  End Time
                </Label>
                <Input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => handleChange('endTime', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="block text-sm font-medium mb-2">
                Notes (Optional)
              </Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Add any additional details about this maintenance window..."
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            {/* Options */}
            <div>
              <Label className="flex items-center gap-3 cursor-pointer">
                <Switch
                  checked={formData.suppressAlerts}
                  onChange={(e) => handleChange('suppressAlerts', e.target.checked)}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <div>
                  <span className="text-sm font-medium">Suppress alerts during maintenance</span>
                  <p className="text-xs text-muted-foreground">
                    Prevent alerts from being generated while machine is in maintenance mode
                  </p>
                </div>
              </Label>
            </div>

            {/* Summary */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-medium mb-2">Maintenance Summary</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  <strong>Duration:</strong> {formData.startDate} {formData.startTime} → {formData.endDate} {formData.endTime}
                </p>
                <p>
                  <strong>Reason:</strong> {formData.reason.charAt(0).toUpperCase() + formData.reason.slice(1)}
                </p>
                <p>
                  <strong>Alerts:</strong> {formData.suppressAlerts ? 'Suppressed' : 'Active'}
                </p>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <DialogFooter className="border-t bg-gray-50 px-6 py-4 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Schedule Maintenance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}