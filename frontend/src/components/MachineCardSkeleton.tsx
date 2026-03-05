export function MachineCardSkeleton() {
  return (
    <div className="w-[320px] h-[280px] bg-white border border-gray-200 rounded-lg p-4 animate-fade-in">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="skeleton h-5 w-32"></div>
            <div className="skeleton h-4 w-24"></div>
          </div>
          <div className="skeleton h-6 w-20 rounded-full"></div>
        </div>

        {/* Health Badge */}
        <div className="flex items-center justify-between">
          <div className="skeleton h-8 w-16 rounded-full"></div>
          <div className="skeleton h-4 w-20"></div>
        </div>

        {/* Metrics */}
        <div className="space-y-3">
          {/* CPU */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <div className="skeleton h-3 w-8"></div>
              <div className="skeleton h-3 w-10"></div>
            </div>
            <div className="skeleton h-2 w-full rounded-full"></div>
          </div>

          {/* Memory */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <div className="skeleton h-3 w-12"></div>
              <div className="skeleton h-3 w-10"></div>
            </div>
            <div className="skeleton h-2 w-full rounded-full"></div>
          </div>

          {/* Disk */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <div className="skeleton h-3 w-10"></div>
              <div className="skeleton h-3 w-10"></div>
            </div>
            <div className="skeleton h-2 w-full rounded-full"></div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <div className="skeleton h-3 w-16"></div>
          <div className="skeleton h-3 w-24"></div>
        </div>
      </div>

      {/* Shimmer overlay */}
      <div className="absolute inset-0 animate-shimmer pointer-events-none rounded-lg"></div>
    </div>
  )
}

export function MachineCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <MachineCardSkeleton key={index} />
      ))}
    </div>
  )
}
