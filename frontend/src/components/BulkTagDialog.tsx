import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { X, Plus, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { bulkAddTags } from '../services/api'

interface BulkTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machineIds: string[]
  allTags: string[]
  onComplete: () => void
}

export function BulkTagDialog({
  open,
  onOpenChange,
  machineIds,
  allTags,
  onComplete
}: BulkTagDialogProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag))
    } else {
      setSelectedTags([...selectedTags, tag])
    }
  }

  const handleAddNewTag = () => {
    if (!newTag.trim()) return
    
    const trimmedTag = newTag.trim().toLowerCase()
    
    if (selectedTags.includes(trimmedTag)) {
      toast.warning('Tag already added')
      return
    }
    
    setSelectedTags([...selectedTags, trimmedTag])
    setNewTag('')
  }

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag))
  }

  const handleApply = async () => {
    if (selectedTags.length === 0) {
      toast.warning('Please select at least one tag')
      return
    }

    setIsSubmitting(true)
    try {
      await bulkAddTags(machineIds, selectedTags)
      toast.success('Tags added successfully', {
        description: `Added ${selectedTags.length} tag(s) to ${machineIds.length} machine(s)`
      })
      onComplete()
      onOpenChange(false)
      setSelectedTags([])
    } catch (error) {
      console.error('Failed to add tags:', error)
      toast.error('Failed to add tags', {
        description: error instanceof Error ? error.message : 'Please try again'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Available tags (not currently selected)
  const availableTags = allTags.filter(tag => !selectedTags.includes(tag))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Bulk Add Tags
          </DialogTitle>
          <DialogDescription>
            Add tags to {machineIds.length} selected machine(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Selected Tags */}
          <div className="space-y-3">
            <Label>Tags to Add ({selectedTags.length})</Label>
            {selectedTags.length > 0 ? (
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 min-h-[60px]">
                {selectedTags.map(tag => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-indigo-950 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
                <Tag className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500">No tags selected</p>
              </div>
            )}
          </div>

          {/* Add New Tag */}
          <div className="space-y-3">
            <Label>Create New Tag</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter tag name..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddNewTag()
                  }
                }}
              />
              <Button onClick={handleAddNewTag} disabled={!newTag.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          {/* Available Tags */}
          {availableTags.length > 0 && (
            <div className="space-y-3">
              <Label>Available Tags</Label>
              <ScrollArea className="h-32 border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex flex-wrap gap-2">
                  {availableTags.map(tag => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                      onClick={() => handleToggleTag(tag)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {tag}
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
          <Button onClick={handleApply} disabled={isSubmitting || selectedTags.length === 0}>
            {isSubmitting ? 'Adding...' : `Add Tags to ${machineIds.length} Machine(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}