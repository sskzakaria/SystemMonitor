import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { SavedFilter } from '../types/monitor-schema'
import { Save, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface SavedFiltersManagerProps {
  savedFilters: SavedFilter[]
  onSaveFilter: (name: string) => void
  onLoadFilter: (filter: SavedFilter) => void
  onDeleteFilter: (id: string) => void
  activeFiltersCount: number
}

export function SavedFiltersManager({
  savedFilters,
  onSaveFilter,
  onLoadFilter,
  onDeleteFilter,
  activeFiltersCount
}: SavedFiltersManagerProps) {
  const [newFilterName, setNewFilterName] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const handleSave = () => {
    if (!newFilterName.trim()) return
    onSaveFilter(newFilterName.trim())
    setNewFilterName('')
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
        <Save className="h-4 w-4 text-gray-500" />
        <Input
          placeholder="Save current filter..."
          value={newFilterName}
          onChange={(e) => setNewFilterName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="flex-1 border-0 shadow-none h-8 px-2 focus-visible:ring-0"
          disabled={activeFiltersCount === 0}
        />
        <Button 
          onClick={handleSave} 
          size="sm"
          disabled={!newFilterName.trim() || activeFiltersCount === 0}
          className="h-8"
        >
          Save
        </Button>
        
        {savedFilters.length > 0 && (
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="sr-only">Toggle saved filters</span>
            </Button>
          </CollapsibleTrigger>
        )}
      </div>

      <CollapsibleContent>
        <div className="mt-2 space-y-2">
          {savedFilters.map((filter) => (
            <div
              key={filter.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer group"
              onClick={() => onLoadFilter(filter)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{filter.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {filter.description}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteFilter(filter.id)
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}