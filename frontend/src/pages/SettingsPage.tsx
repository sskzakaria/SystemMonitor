/**
 * Settings & Configuration Page
 * Admin panel for system configuration
 */

import React from 'react'
import { Settings, Shield, Info } from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { ConfigurationPanel } from '../components/ConfigurationPanel'

export function SettingsPage() {
  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="h-8 w-8 text-purple-600" />
          <h1 className="text-3xl font-bold">System Settings</h1>
        </div>
        <p className="text-muted-foreground">
          Configure external integrations and system-wide settings
        </p>
      </div>

      {/* Security Notice */}
      <Card className="mb-6 bg-amber-50 border-amber-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900 mb-1">Administrator Access Required</p>
              <p className="text-sm text-amber-700">
                These settings affect the entire system. Changes may require system restart to take effect.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Panel */}
      <ConfigurationPanel />

      {/* Help Section */}
      <Card className="mt-6 bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-2">Need Help?</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>
                  <strong>InfluxDB:</strong> Time-series database for storing hardware metrics and historical data
                </li>
                <li>
                  <strong>Grafana:</strong> Visualization platform for creating advanced dashboards and alerts
                </li>
                <li>
                  Both services are optional and can run on the same server or separate infrastructure
                </li>
                <li>
                  Use the "Test Connection" button to verify settings before saving
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Version Info */}
      <div className="mt-6 text-center text-sm text-muted-foreground">
        <p>University Computer Monitoring System v4.0</p>
        <p className="mt-1">Backend API: http://localhost:8001</p>
      </div>
    </div>
  )
}
