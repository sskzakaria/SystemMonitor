import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Download, FileText, FileSpreadsheet, FileBarChart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildings?: string[];
  totalMachines: number;
}

export function ExportModal({ open, onOpenChange, totalMachines }: ExportModalProps) {
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel' | 'pdf'>('csv');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    const toastId = toast.loading(`Preparing ${exportFormat.toUpperCase()} export...`);
    
    try {
      // Build endpoint URL
      let endpoint = '';
      
      if (exportFormat === 'csv') {
        endpoint = '/api/v1/export/machines?format=csv';
      } else if (exportFormat === 'excel') {
        endpoint = '/api/v1/export/machines?format=xlsx';
      } else if (exportFormat === 'pdf') {
        endpoint = '/api/v1/export/pdf/system-report';
      }
      
      // Fetch export with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(endpoint, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Check if backend is unavailable
        if (response.status === 404 || response.status === 502 || response.status === 503) {
          throw new Error('Backend server is not running. Please start the backend to use export functionality.');
        }
        throw new Error(`Export failed: ${response.statusText}`);
      }
      
      // Validate content type to ensure we got the right file format
      const contentType = response.headers.get('content-type') || '';
      const validContentTypes: Record<string, string[]> = {
        csv: ['text/csv', 'application/csv'],
        excel: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
        pdf: ['application/pdf']
      };
      
      const expectedTypes = validContentTypes[exportFormat] || [];
      const isValidContentType = expectedTypes.some(type => contentType.includes(type));
      
      // If content type is HTML, it's likely an error page
      if (contentType.includes('text/html')) {
        throw new Error('Backend returned an error page. Please ensure the backend server is running and the export endpoint is available.');
      }
      
      if (!isValidContentType) {
        console.warn(`Unexpected content type: ${contentType} for format: ${exportFormat}`);
        // Continue anyway but warn the user
      }
      
      // Download file
      const blob = await response.blob();
      
      // Additional validation: check blob size
      if (blob.size < 100) {
        throw new Error('Export failed: File is too small, likely an error response.');
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Determine file extension
      let extension = 'csv';
      if (exportFormat === 'excel') extension = 'xlsx';
      else if (exportFormat === 'pdf') extension = 'pdf';
      
      const timestamp = new Date().toISOString().split('T')[0];
      a.download = `machines-export-${timestamp}.${extension}`;
      a.click();
      
      window.URL.revokeObjectURL(url);
      
      toast.success(`${exportFormat.toUpperCase()} export complete! (${blob.size} bytes)`, { id: toastId });
      onOpenChange(false);
      
    } catch (error) {
      console.error('Export error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = 'Export failed: Unknown error';
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Export timed out. Backend may be unavailable or slow to respond.';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage, { 
        id: toastId,
        duration: 5000,
        description: 'Make sure the backend server is running at http://localhost:8001'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getEstimatedFileSize = () => {
    const count = totalMachines;
    
    let sizePerRecord = 200; // bytes
    if (exportFormat === 'excel') sizePerRecord *= 1.5;
    else if (exportFormat === 'pdf') sizePerRecord *= 3;
    
    const totalSize = count * sizePerRecord;
    if (totalSize < 1024) return `${totalSize} bytes`;
    if (totalSize < 1024 * 1024) return `${Math.round(totalSize / 1024)} KB`;
    return `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Data</DialogTitle>
          <DialogDescription>
            Choose export format for {totalMachines} machines with 40+ fields
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Export Format */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Export Format</Label>
            <div className="grid gap-3">
              <button
                onClick={() => setExportFormat('csv')}
                className={`flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors text-left ${
                  exportFormat === 'csv' ? 'border-primary bg-accent' : ''
                }`}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">CSV (Comma-Separated Values)</div>
                  <div className="text-sm text-muted-foreground">Best for spreadsheet software, data analysis</div>
                </div>
                {exportFormat === 'csv' && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setExportFormat('excel')}
                className={`flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors text-left ${
                  exportFormat === 'excel' ? 'border-primary bg-accent' : ''
                }`}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
                  <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">Excel (.xlsx)</div>
                  <div className="text-sm text-muted-foreground">Formatted workbook with multiple sheets and summary</div>
                </div>
                {exportFormat === 'excel' && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setExportFormat('pdf')}
                className={`flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors text-left ${
                  exportFormat === 'pdf' ? 'border-primary bg-accent' : ''
                }`}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                  <FileBarChart className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">PDF Report</div>
                  <div className="text-sm text-muted-foreground">Professional report for management</div>
                </div>
                {exportFormat === 'pdf' && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Export Info */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Records to export:</span>
              <span className="font-medium">{totalMachines}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fields per machine:</span>
              <span className="font-medium">40+ comprehensive fields</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated file size:</span>
              <span className="font-medium">{getEstimatedFileSize()}</span>
            </div>
            {exportFormat === 'excel' && (
              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Excel export includes multiple sheets: All Machines, Summary, and By Building
              </div>
            )}
            {exportFormat === 'pdf' && (
              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                PDF report includes executive summary, building breakdown, and critical issues
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export {exportFormat.toUpperCase()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
