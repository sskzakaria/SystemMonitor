import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { FolderOpen, Plus, Trash2, Edit2, Save, X, Users } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateOnlyWithTimezone } from '../lib/timezone-utils'

export interface MachineGroup {
  id: string
  name: string
  description?: string
  machineIds: string[]
  color: string
  createdAt: Date
  updatedAt: Date
}

interface MachineGroupsManagerProps {
  groups: MachineGroup[]
  onCreateGroup: (group: Omit<MachineGroup, 'id' | 'createdAt' | 'updatedAt'>) => void
  onUpdateGroup: (id: string, updates: Partial<MachineGroup>) => void
  onDeleteGroup: (id: string) => void
  onViewGroupMachines?: (group: MachineGroup) => void
}

const GROUP_COLORS = [
  { name: 'Red', value: '#ef4444', bg: 'bg-red-500' },
  { name: 'Orange', value: '#f97316', bg: 'bg-orange-500' },
  { name: 'Yellow', value: '#eab308', bg: 'bg-yellow-500' },
  { name: 'Green', value: '#22c55e', bg: 'bg-green-500' },
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500' },
  { name: 'Purple', value: '#8b5cf6', bg: 'bg-purple-500' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500' },
  { name: 'Teal', value: '#14b8a6', bg: 'bg-teal-500' },
]

export function MachineGroupsManager({
  groups,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onViewGroupMachines
}: MachineGroupsManagerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    color: GROUP_COLORS[0].value,
    machineIds: [] as string[]
  })

  const [editGroup, setEditGroup] = useState({
    name: '',
    description: '',
    color: '',
    machineIds: [] as string[]
  })

  const handleCreate = () => {
    if (!newGroup.name.trim()) {
      toast.error('Group name is required')
      return
    }

    onCreateGroup(newGroup)
    setNewGroup({
      name: '',
      description: '',
      color: GROUP_COLORS[0].value,
      machineIds: []
    })
    setIsCreating(false)
    toast.success(`Group "${newGroup.name}" created!`)
  }

  const handleStartEdit = (group: MachineGroup) => {
    setEditingId(group.id)
    setEditGroup({
      name: group.name,
      description: group.description || '',
      color: group.color,
      machineIds: group.machineIds
    })
  }

  const handleSaveEdit = (id: string) => {
    if (!editGroup.name.trim()) {
      toast.error('Group name is required')
      return
    }

    onUpdateGroup(id, editGroup)
    setEditingId(null)
    toast.success('Group updated!')
  }

  const handleDelete = (group: MachineGroup) => {
    if (group.machineIds.length > 0) {
      if (!confirm(`This group contains ${group.machineIds.length} machine(s). Are you sure you want to delete it?`)) {
        return
      }
    }

    onDeleteGroup(group.id)
    toast.success(`Group "${group.name}" deleted`)
  }

  const getColorClass = (colorValue: string) => {
    const color = GROUP_COLORS.find(c => c.value === colorValue)
    return color || GROUP_COLORS[0]
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Machine Groups
          </CardTitle>
          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Group</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="group-name">Group Name</Label>
                  <Input
                    id="group-name"
                    placeholder="e.g., Graphics Workstations"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="group-description">Description</Label>
                  <Textarea
                    id="group-description"
                    placeholder="Brief description of this group"
                    value={newGroup.description}
                    onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {GROUP_COLORS.map(color => (
                      <button
                        key={color.value}
                        onClick={() => setNewGroup({ ...newGroup, color: color.value })}
                        className={`h-12 rounded-lg ${color.bg} border-2 transition-all ${
                          newGroup.color === color.value
                            ? 'border-gray-900 scale-110'
                            : 'border-gray-200 hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleCreate} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    Create Group
                  </Button>
                  <Button variant="outline" onClick={() => setIsCreating(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No groups created yet</p>
            <p className="text-sm">Create groups to organize your machines</p>
          </div>
        ) : (
          groups.map(group => {
            const isEditing = editingId === group.id
            const colorClass = getColorClass(group.color)

            return (
              <div
                key={group.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                {isEditing ? (
                  // Edit Mode
                  <div className="flex-1 space-y-3">
                    <Input
                      value={editGroup.name}
                      onChange={(e) => setEditGroup({ ...editGroup, name: e.target.value })}
                      placeholder="Group name"
                    />
                    <Textarea
                      value={editGroup.description}
                      onChange={(e) => setEditGroup({ ...editGroup, description: e.target.value })}
                      placeholder="Description"
                      rows={2}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Color:</span>
                      <div className="flex gap-1">
                        {GROUP_COLORS.map(color => (
                          <button
                            key={color.value}
                            onClick={() => setEditGroup({ ...editGroup, color: color.value })}
                            className={`h-8 w-8 rounded ${color.bg} border-2 transition-all ${
                              editGroup.color === color.value
                                ? 'border-gray-900 scale-110'
                                : 'border-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(group.id)}>
                        <Save className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <>
                    <div className="flex items-center gap-3 flex-1">
                      <div
                        className={`h-12 w-12 rounded-lg ${colorClass.bg} flex items-center justify-center shrink-0`}
                      >
                        <FolderOpen className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{group.name}</h4>
                          <Badge variant="outline" className="gap-1">
                            <Users className="h-3 w-3" />
                            {group.machineIds.length}
                          </Badge>
                        </div>
                        {group.description && (
                          <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>Created {formatDateOnlyWithTimezone(group.createdAt)}</span>
                          {group.updatedAt.getTime() !== group.createdAt.getTime() && (
                            <>
                              <span>•</span>
                              <span>Updated {formatDateOnlyWithTimezone(group.updatedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {onViewGroupMachines && group.machineIds.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onViewGroupMachines(group)}
                        >
                          View Machines
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(group)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(group)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}