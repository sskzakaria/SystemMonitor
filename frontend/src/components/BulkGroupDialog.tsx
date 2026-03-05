import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { ScrollArea } from './ui/scroll-area'
import { Users, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { bulkAddToGroup } from '../services/api'

interface BulkGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machineIds: string[]
  allGroups: string[]
  onComplete: () => void
}

export function BulkGroupDialog({
  open,
  onOpenChange,
  machineIds,
  allGroups,
  onComplete
}: BulkGroupDialogProps) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [newGroupName, setNewGroupName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleApply = async () => {
    const groupToAdd = mode === 'new' ? newGroupName.trim() : selectedGroup
    
    if (!groupToAdd) {
      toast.warning('Please select or enter a group name')
      return
    }

    setIsSubmitting(true)
    try {
      // Generate a group ID from the name
      const groupId = groupToAdd.toLowerCase().replace(/\s+/g, '-')
      
      await bulkAddToGroup(machineIds, groupId, groupToAdd)
      toast.success('Machines added to group', {
        description: `Added ${machineIds.length} machine(s) to ${groupToAdd}`
      })
      onComplete()
      onOpenChange(false)
      setSelectedGroup('')
      setNewGroupName('')
      setMode('existing')
    } catch (error) {
      console.error('Failed to add to group:', error)
      toast.error('Failed to add to group', {
        description: error instanceof Error ? error.message : 'Please try again'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Add to Group
          </DialogTitle>
          <DialogDescription>
            Add {machineIds.length} selected machine(s) to a group
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mode Selection */}
          <div className="space-y-3">
            <Label>Select Option</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'existing' ? 'default' : 'outline'}
                onClick={() => setMode('existing')}
                className="flex-1"
              >
                Add to existing group
              </Button>
              <Button
                type="button"
                variant={mode === 'new' ? 'default' : 'outline'}
                onClick={() => setMode('new')}
                className="flex-1"
              >
                Create new group
              </Button>
            </div>
          </div>

          {/* Existing Groups */}
          {mode === 'existing' && (
            <div className="space-y-3">
              <Label>Select Group</Label>
              {allGroups.length > 0 ? (
                <ScrollArea className="h-48 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="space-y-2">
                    {allGroups.map(group => (
                      <div
                        key={group}
                        onClick={() => setSelectedGroup(group)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedGroup === group
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-purple-600" />
                          <span className="font-medium">{group}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-500">No existing groups found</p>
                  <p className="text-xs text-gray-400 mt-1">Create a new group instead</p>
                </div>
              )}
            </div>
          )}

          {/* New Group */}
          {mode === 'new' && (
            <div className="space-y-3">
              <Label>Group Name</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter new group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleApply()
                    }
                  }}
                />
              </div>
              <p className="text-xs text-gray-500">
                Examples: "Lab A Computers", "Staff Workstations", "Student Laptops"
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleApply} 
            disabled={isSubmitting || (mode === 'existing' ? !selectedGroup : !newGroupName.trim())}
          >
            {isSubmitting ? 'Adding...' : `Add to Group`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}