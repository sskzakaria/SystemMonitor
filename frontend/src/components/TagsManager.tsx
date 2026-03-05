import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Tag, Plus, Trash2, Edit2, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateOnlyWithTimezone } from '../lib/timezone-utils'

export interface MachineTag {
  id: string
  name: string
  color: string
  description?: string
  machineCount: number
  createdAt: Date
}

interface TagsManagerProps {
  tags: MachineTag[]
  onCreateTag: (tag: Omit<MachineTag, 'id' | 'machineCount' | 'createdAt'>) => void
  onUpdateTag: (id: string, updates: Partial<MachineTag>) => void
  onDeleteTag: (id: string) => void
}

const TAG_COLORS = [
  { name: 'Red', value: '#ef4444', bg: 'bg-red-500', text: 'text-red-700', border: 'border-red-300' },
  { name: 'Orange', value: '#f97316', bg: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-300' },
  { name: 'Yellow', value: '#eab308', bg: 'bg-yellow-500', text: 'text-yellow-700', border: 'border-yellow-300' },
  { name: 'Green', value: '#22c55e', bg: 'bg-green-500', text: 'text-green-700', border: 'border-green-300' },
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-300' },
  { name: 'Purple', value: '#8b5cf6', bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-300' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500', text: 'text-pink-700', border: 'border-pink-300' },
  { name: 'Gray', value: '#6b7280', bg: 'bg-gray-500', text: 'text-gray-700', border: 'border-gray-300' },
]

export function TagsManager({ tags, onCreateTag, onUpdateTag, onDeleteTag }: TagsManagerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [newTag, setNewTag] = useState({
    name: '',
    color: TAG_COLORS[0].value,
    description: ''
  })

  const [editTag, setEditTag] = useState({
    name: '',
    color: '',
    description: ''
  })

  const handleCreate = () => {
    if (!newTag.name.trim()) {
      toast.error('Tag name is required')
      return
    }

    onCreateTag(newTag)
    setNewTag({ name: '', color: TAG_COLORS[0].value, description: '' })
    setIsCreating(false)
    toast.success(`Tag "${newTag.name}" created!`)
  }

  const handleStartEdit = (tag: MachineTag) => {
    setEditingId(tag.id)
    setEditTag({
      name: tag.name,
      color: tag.color,
      description: tag.description || ''
    })
  }

  const handleSaveEdit = (id: string) => {
    if (!editTag.name.trim()) {
      toast.error('Tag name is required')
      return
    }

    onUpdateTag(id, editTag)
    setEditingId(null)
    toast.success('Tag updated!')
  }

  const handleDelete = (tag: MachineTag) => {
    if (tag.machineCount > 0) {
      if (!confirm(`This tag is assigned to ${tag.machineCount} machine(s). Are you sure you want to delete it?`)) {
        return
      }
    }
    
    onDeleteTag(tag.id)
    toast.success(`Tag "${tag.name}" deleted`)
  }

  const getColorClass = (colorValue: string) => {
    const color = TAG_COLORS.find(c => c.value === colorValue)
    return color || TAG_COLORS[0]
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Tags Manager
          </CardTitle>
          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Tag
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Tag</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="tag-name">Tag Name</Label>
                  <Input
                    id="tag-name"
                    placeholder="e.g., Graphics Lab"
                    value={newTag.name}
                    onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {TAG_COLORS.map(color => (
                      <button
                        key={color.value}
                        onClick={() => setNewTag({ ...newTag, color: color.value })}
                        className={`h-12 rounded-lg ${color.bg} border-2 transition-all ${
                          newTag.color === color.value
                            ? 'border-gray-900 scale-110'
                            : 'border-gray-200 hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tag-description">Description (Optional)</Label>
                  <Input
                    id="tag-description"
                    placeholder="Brief description"
                    value={newTag.description}
                    onChange={(e) => setNewTag({ ...newTag, description: e.target.value })}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleCreate} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    Create Tag
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
        {tags.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No tags created yet</p>
            <p className="text-sm">Create tags to categorize your machines</p>
          </div>
        ) : (
          tags.map(tag => {
            const isEditing = editingId === tag.id
            const colorClass = getColorClass(tag.color)

            return (
              <div
                key={tag.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                {isEditing ? (
                  // Edit Mode
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-3">
                      <Input
                        value={editTag.name}
                        onChange={(e) => setEditTag({ ...editTag, name: e.target.value })}
                        placeholder="Tag name"
                        className="flex-1"
                      />
                      <Input
                        value={editTag.description}
                        onChange={(e) => setEditTag({ ...editTag, description: e.target.value })}
                        placeholder="Description"
                        className="flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Color:</span>
                      <div className="flex gap-1">
                        {TAG_COLORS.map(color => (
                          <button
                            key={color.value}
                            onClick={() => setEditTag({ ...editTag, color: color.value })}
                            className={`h-8 w-8 rounded ${color.bg} border-2 transition-all ${
                              editTag.color === color.value
                                ? 'border-gray-900 scale-110'
                                : 'border-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(tag.id)}>
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
                        className={`h-10 w-10 rounded-lg ${colorClass.bg} flex items-center justify-center shrink-0`}
                      >
                        <Tag className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{tag.name}</h4>
                          <Badge variant="outline">
                            {tag.machineCount} {tag.machineCount === 1 ? 'machine' : 'machines'}
                          </Badge>
                        </div>
                        {tag.description && (
                          <p className="text-sm text-muted-foreground">{tag.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {formatDateOnlyWithTimezone(tag.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(tag)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(tag)}
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