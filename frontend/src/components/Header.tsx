import { timeAgo } from '../utils'

interface Props {
  collectedAt: string
  onRefresh: () => void
}

export default function Header({ collectedAt, onRefresh }: Props) {
  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-bold">
        <span className="text-blue-400">AI</span> Crypto Trader
      </h1>
      <div className="flex items-center gap-3">
        <span className="bg-emerald-900/60 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold">
          SIMULATION
        </span>
        {collectedAt && (
          <span className="text-xs text-gray-500">Data: {timeAgo(collectedAt)}</span>
        )}
        <button
          onClick={onRefresh}
          className="bg-gray-800 border border-gray-700 text-gray-200 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-700 transition cursor-pointer"
        >
          Refresh
        </button>
      </div>
    </header>
  )
}
