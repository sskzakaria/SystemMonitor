import { ScrollArea } from './ui/scroll-area'
import { X, Plus, Tag, Check } from 'lucide-react'
import { toast } from 'sonner'
import { updateMachineTags } from '../services/api'

interface TagManagementDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  machineId: string
  machineName?: string
  currentTags: string[]
  allTags?: string[]
  onTagsUpdated?: (machineId: string, tags: string[]) => void
  onUpdateTags?: (tags: string[]) => void
}

export function TagManagementDialog({
  open,
  onOpenChange,
  onClose,
  machineId,
  machineName,
  currentTags,
  allTags = [],
  onTagsUpdated,
  onUpdateTags
}: TagManagementDialogProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>(currentTags)
  const [newTag, setNewTag] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setSelectedTags(currentTags)
  }, [currentTags, open])

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

  const handleSave = async () => {
    setIsSubmitting(true)
    try {
      await updateMachineTags(machineId, selectedTags)
      
      // Call both callbacks for compatibility
      if (onTagsUpdated) {
        onTagsUpdated(machineId, selectedTags)
      }
      if (onUpdateTags) {
        onUpdateTags(selectedTags)
      }
      
      toast.success('Tags updated successfully', {
        description: `Updated tags for ${machineName || machineId}`
      })
      
      // Close dialog using either pattern
      if (onOpenChange) {
        onOpenChange(false)
      }
      if (onClose) {
        onClose()
      }
    } catch (error) {
      console.error('Failed to update tags:', error)
      toast.error('Failed to update tags', {
        description: error instanceof Error ? error.message : 'Please try again'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Suggested tags (existing tags not currently selected)
  const suggestedTags = (allTags || []).filter(tag => !selectedTags.includes(tag))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Manage Tags
          </DialogTitle>
          <DialogDescription>
            Add or remove tags for {machineName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Tags */}
          <div className="space-y-3">
            <Label>Current Tags ({selectedTags.length})</Label>
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
                <p className="text-sm text-gray-500">No tags assigned</p>
              </div>
            )}
          </div>

          {/* Add New Tag */}
          <div className="space-y-3">
            <Label>Add New Tag</Label>
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

          {/* Suggested Tags */}
          {suggestedTags.length > 0 && (
            <div className="space-y-3">
              <Label>Suggested Tags</Label>
              <ScrollArea className="h-32 border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex flex-wrap gap-2">
                  {suggestedTags.map(tag => (
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
          <Button variant="outline" onClick={() => {
            onOpenChange?.(false)
            onClose?.()
          }} disabled={isSubmitting}>
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