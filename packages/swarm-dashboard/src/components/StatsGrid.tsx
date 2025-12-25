/**
 * Grid component displaying key swarm statistics
 */
export function StatsGrid() {
  const stats = [
    { label: "Active Swarms", value: "2", change: "+1" },
    { label: "Total Workers", value: "3", change: "+2" },
    { label: "Completed Today", value: "5", change: "+3" },
    { label: "Success Rate", value: "94%", change: "+2%" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white overflow-hidden shadow rounded-lg"
        >
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">
              {stat.label}
            </dt>
            <dd className="mt-1 flex items-baseline justify-between">
              <div className="text-3xl font-semibold text-gray-900">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-green-600">
                {stat.change}
              </div>
            </dd>
          </div>
        </div>
      ))}
    </div>
  );
}
