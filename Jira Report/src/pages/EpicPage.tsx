import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/Card";

export function EpicsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Epic Intelligence</h1>
        <p className="text-gray-500 text-sm">Portfolio health, risk scoring, and delivery prediction</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-800">0</div>
            <div className="text-xs text-gray-500">Total Epics</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">0</div>
            <div className="text-xs text-gray-500">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">0</div>
            <div className="text-xs text-gray-500">High/Critical Risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">0</div>
            <div className="text-xs text-gray-500">Avg Health Score</div>
          </CardContent>
        </Card>
      </div>

      {/* Epic AG Grid */}
      <Card>
        <CardHeader>
          <CardTitle>All Epics</CardTitle>
          <CardDescription>Sortable / filterable. Sorted by delivery risk.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-sm text-center py-8">No epics found for this board</p>
        </CardContent>
      </Card>
    </div>
  );
}
