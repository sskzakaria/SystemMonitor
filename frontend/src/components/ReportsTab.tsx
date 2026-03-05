import { FileText, Download, Calendar, Filter } from 'lucide-react'
import { MonitorData, HeartbeatMetrics, SpecsMetrics } from '../types/monitor-schema'
import { toast } from 'sonner'

interface ReportsTabProps {
  machines: MonitorData<HeartbeatMetrics>[]
  machineSpecs: Map<string, SpecsMetrics>
}

export function ReportsTab({ machines, machineSpecs }: ReportsTabProps) {
  const handleGenerateReport = (reportType: string) => {
    toast.success(`Generating ${reportType} report...`)
    // In production, this would call the backend export API
  }

  const reports = [
    {
      title: 'Daily Status Report',
      description: 'Complete system status snapshot for today',
      type: 'daily-status',
      icon: FileText
    },
    {
      title: 'Weekly Performance Summary',
      description: 'Performance trends and analytics for the past 7 days',
      type: 'weekly-performance',
      icon: Calendar
    },
    {
      title: 'Hardware Inventory',
      description: 'Complete hardware specifications across all machines',
      type: 'hardware-inventory',
      icon: Filter
    },
    {
      title: 'Alert History',
      description: 'Historical alert data and resolution status',
      type: 'alert-history',
      icon: FileText
    },
    {
      title: 'User Activity Report',
      description: 'Login history and user session analytics',
      type: 'user-activity',
      icon: Calendar
    },
    {
      title: 'Maintenance Schedule',
      description: 'Upcoming and completed maintenance activities',
      type: 'maintenance',
      icon: Calendar
    }
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            System Reports
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Generate and export comprehensive system reports
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reports.map((report) => {
              const Icon = report.icon
              return (
                <Card key={report.type} className="border">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-6 w-6 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium mb-1">{report.title}</h3>
                        <p className="text-sm text-muted-foreground mb-3">
                          {report.description}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleGenerateReport(report.title)}
                            className="gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Generate
                          </Button>
                          <Badge variant="outline">PDF/CSV</Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Report Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Machines</p>
              <p className="text-2xl font-semibold">{machines.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Active Machines</p>
              <p className="text-2xl font-semibold">
                {machines.filter(m => m.metrics.status.state !== 'offline').length}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">With Hardware Data</p>
              <p className="text-2xl font-semibold">{machineSpecs.size}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Exports */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Exports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p className="text-sm">No recent exports</p>
            <p className="text-xs mt-1">Generate a report to see export history</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}