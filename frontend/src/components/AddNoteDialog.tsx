import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Switch } from './ui/switch'
import { X, Plus, Tag as TagIcon, FileText, Wrench, AlertCircle, Info } from 'lucide-react'
import { toast } from 'sonner'

interface AddNoteDialogProps {
  machineId: string
  machineName?: string
  onClose: () => void
  onAddNote: (note: MachineNote) => void
}

export interface MachineNote {
  category: 'maintenance' | 'issue' | 'info' | 'update'
  priority: 'low' | 'medium' | 'high'
  content: string
  pinned: boolean
  tags: string[]
}

export function AddNoteDialog({ 
  machineId, 
  machineName, 
  onClose, 
  onAddNote 
}: AddNoteDialogProps) {
  const [formData, setFormData] = useState<MachineNote>({
    category: 'info',
    priority: 'medium',
    content: '',
    pinned: false,
    tags: []
  })

  const [tagInput, setTagInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.content.trim()) {
      toast.error('Please enter note content')
      return
    }
    
    onAddNote(formData)
    toast.success('Note added successfully')
    onClose()
  }

  const handleChange = (field: keyof MachineNote, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      handleChange('tags', [...formData.tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    handleChange('tags', formData.tags.filter(t => t !== tag))
  }

  const quickTemplates = [
    { label: 'Hardware upgraded', category: 'maintenance' as const, content: 'Hardware components upgraded. All systems functioning normally.' },
    { label: 'Issue resolved', category: 'issue' as const, content: 'Previously reported issue has been resolved.' },
    { label: 'Needs attention', category: 'issue' as const, content: 'Machine requires technical attention. Issue details: ' },
    { label: 'Performance note', category: 'info' as const, content: 'Performance observation: ' },
  ]

  const handleApplyTemplate = (template: typeof quickTemplates[0]) => {
    setFormData(prev => ({
      ...prev,
      category: template.category,
      content: template.content
    }))
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'maintenance': return <Wrench className="h-4 w-4" />
      case 'issue': return <AlertCircle className="h-4 w-4" />
      case 'info': return <Info className="h-4 w-4" />
      case 'update': return <FileText className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="border-b bg-gradient-to-r from-blue-50 to-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Add Note
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
        </DialogHeader>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Quick Templates */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Quick Templates
              </label>
              <div className="flex flex-wrap gap-2">
                {quickTemplates.map((template, idx) => (
                  <Button
                    key={idx}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleApplyTemplate(template)}
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Category
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['info', 'maintenance', 'issue', 'update'] as const).map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => handleChange('category', category)}
                    className={`
                      p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2
                      ${formData.category === category 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                      }
                    `}
                  >
                    {getCategoryIcon(category)}
                    <span className="text-xs capitalize">{category}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Priority
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as const).map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => handleChange('priority', priority)}
                    className={`
                      p-2 rounded-lg border-2 transition-all
                      ${formData.priority === priority 
                        ? priority === 'high' ? 'border-red-500 bg-red-50'
                        : priority === 'medium' ? 'border-yellow-500 bg-yellow-50'
                        : 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                      }
                    `}
                  >
                    <span className="text-sm capitalize">{priority}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Note Content *
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Enter your note here..."
                rows={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                {formData.content.length} characters
              </p>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <TagIcon className="h-4 w-4" />
                Tags (Optional)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  placeholder="Add tag..."
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddTag}
                >
                  Add
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="gap-1 pl-2 pr-1"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Pin Option */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={formData.pinned}
                  onChange={(e) => handleChange('pinned', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium">Pin this note</span>
                  <p className="text-xs text-muted-foreground">
                    Pinned notes appear at the top of the note list
                  </p>
                </div>
              </label>
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
            className="bg-blue-600 hover:bg-blue-700"
          >
            Add Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}