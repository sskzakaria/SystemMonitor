import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

export function MaintenanceTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Maintenance information coming soon...</p>
      </CardContent>
    </Card>
  )
}
