import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Label } from './ui/label'
import { ScrollArea } from './ui/scroll-area'
import { X, Plus, Users, Check } from 'lucide-react'
import { toast } from 'sonner'
import { updateMachineGroups } from '../services/api'

interface GroupManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machineId: string
  machineName: string
  currentGroups: string[]
  allGroups: string[]
  onGroupsUpdated: (machineId: string, groups: string[]) => void
}

export function GroupManagementDialog({
  open,
  onOpenChange,
  machineId,
  machineName,
  currentGroups,
  allGroups,
  onGroupsUpdated
}: GroupManagementDialogProps) {
  const [selectedGroups, setSelectedGroups] = useState<string[]>(currentGroups)
  const [newGroup, setNewGroup] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setSelectedGroups(currentGroups)
  }, [currentGroups, open])

  const handleToggleGroup = (group: string) => {
    if (selectedGroups.includes(group)) {
      setSelectedGroups(selectedGroups.filter(g => g !== group))
    } else {
      setSelectedGroups([...selectedGroups, group])
    }
  }

  const handleAddNewGroup = () => {
    if (!newGroup.trim()) return
    
    const trimmedGroup = newGroup.trim()
    
    if (selectedGroups.includes(trimmedGroup)) {
      toast.warning('Group already added')
      return
    }
    
    setSelectedGroups([...selectedGroups, trimmedGroup])
    setNewGroup('')
  }

  const handleRemoveGroup = (group: string) => {
    setSelectedGroups(selectedGroups.filter(g => g !== group))
  }

  const handleSave = async () => {
    setIsSubmitting(true)
    try {
      await updateMachineGroups(machineId, selectedGroups)
      onGroupsUpdated(machineId, selectedGroups)
      toast.success('Groups updated successfully', {
        description: `Updated groups for ${machineName}`
      })
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to update groups:', error)
      toast.error('Failed to update groups', {
        description: error instanceof Error ? error.message : 'Please try again'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Available groups (existing groups not currently selected)
  const availableGroups = allGroups.filter(group => !selectedGroups.includes(group))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage Groups
          </DialogTitle>
          <DialogDescription>
            Add or remove groups for {machineName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Groups */}
          <div className="space-y-3">
            <Label>Current Groups ({selectedGroups.length})</Label>
            {selectedGroups.length > 0 ? (
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 min-h-[60px]">
                {selectedGroups.map(group => (
                  <Badge
                    key={group}
                    variant="secondary"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-800 hover:bg-purple-200"
                  >
                    <Users className="h-3 w-3" />
                    {group}
                    <button
                      onClick={() => handleRemoveGroup(group)}
                      className="ml-1 hover:text-purple-950 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
                <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500">No groups assigned</p>
              </div>
            )}
          </div>

          {/* Add New Group */}
          <div className="space-y-3">
            <Label>Create New Group</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter group name..."
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddNewGroup()
                  }
                }}
              />
              <Button onClick={handleAddNewGroup} disabled={!newGroup.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          {/* Available Groups */}
          {availableGroups.length > 0 && (
            <div className="space-y-3">
              <Label>Available Groups</Label>
              <ScrollArea className="h-32 border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex flex-wrap gap-2">
                  {availableGroups.map(group => (
                    <Badge
                      key={group}
                      variant="outline"
                      className="cursor-pointer hover:bg-purple-50 hover:border-purple-300 transition-colors"
                      onClick={() => handleToggleGroup(group)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {group}
                    </Badge>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}