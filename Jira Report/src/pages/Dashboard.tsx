export const Dashboard = () => {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm">Welcome to Jira Intelligence Dashboard</p>
      </div>

      <div className="bg-slate-800 border border-slate-700/55 rounded-xl p-6 text-slate-300">
        <p>Your connection is active. Select an option from the sidebar to begin analyzing Jira data.</p>
      </div>
    </div>
  );
};