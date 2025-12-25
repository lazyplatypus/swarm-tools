/**
 * Card component for displaying individual swarm status
 */
interface SwarmCardProps {
  swarm: {
    id: string;
    title: string;
    status: string;
    workers: number;
    progress: number;
  };
}

export function SwarmCard({ swarm }: SwarmCardProps) {
  const statusColors = {
    in_progress: "bg-blue-100 text-blue-800",
    open: "bg-gray-100 text-gray-800",
    blocked: "bg-red-100 text-red-800",
    completed: "bg-green-100 text-green-800",
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">{swarm.title}</h3>
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${
              statusColors[swarm.status as keyof typeof statusColors] ||
              statusColors.open
            }`}
          >
            {swarm.status}
          </span>
        </div>

        <div className="text-xs text-gray-500 mb-3">ID: {swarm.id}</div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Workers</span>
            <span className="font-medium">{swarm.workers}</span>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Progress</span>
              <span className="font-medium">{swarm.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${swarm.progress}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
