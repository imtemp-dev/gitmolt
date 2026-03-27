export function Header() {
  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-100">GitMolt</h1>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse-dot" />
            <span className="text-xs font-medium text-green-400">LIVE</span>
          </div>
        </div>
        <a
          href="https://github.com/imtemp-dev/gitmolt"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-400 hover:text-gray-300"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
