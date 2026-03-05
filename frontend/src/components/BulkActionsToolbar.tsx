import { Button } from './ui/button'
import { X, Download, Tag, Users, Wrench } from 'lucide-react'

interface BulkActionsToolbarProps {
  selectedCount: number
  visibleCount?: number // Optional: count of selected machines visible in current filter
  onClearSelection: () => void
  onExportSelected: () => void
  onTagSelected: () => void
  onGroupSelected: () => void
  onMaintenanceMode: () => void
}

export function BulkActionsToolbar({
  selectedCount,
  visibleCount,
  onClearSelection,
  onExportSelected,
  onTagSelected,
  onGroupSelected,
  onMaintenanceMode,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg h-16 px-6 mb-4 flex items-center">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {selectedCount} machine{selectedCount !== 1 ? 's' : ''} selected
            {visibleCount !== undefined && visibleCount < selectedCount && (
              <span className="text-sm font-normal text-gray-600 ml-1">
                ({visibleCount} visible in current view)
              </span>
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExportSelected}>
            <Download className="h-4 w-4 mr-2" />
            Export Selected
          </Button>
          <Button variant="outline" size="sm" onClick={onTagSelected}>
            <Tag className="h-4 w-4 mr-2" />
            Add Tags
          </Button>
          <Button variant="outline" size="sm" onClick={onGroupSelected}>
            <Users className="h-4 w-4 mr-2" />
            Add to Group
          </Button>
          <Button variant="outline" size="sm" onClick={onMaintenanceMode}>
            <Wrench className="h-4 w-4 mr-2" />
            Maintenance Mode
          </Button>
        </div>
      </div>
    </div>
  )
}