import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Plus,
  Search,
  Server,
  Shield,
  Cpu,
  LineChart,
  MoreHorizontal,
} from "lucide-react";

const projectsData = [
  { icon: Server, name: "Production-Core-API", env: "Production", reqs: "1,245,092", tokens: "450.2M", cost: "$45.02", last: "2m ago", status: "Active" },
  { icon: Shield, name: "Staging-Auth-Service", env: "Staging", reqs: "45,890", tokens: "12.4M", cost: "$1.24", last: "5h ago", status: "Active" },
  { icon: Cpu, name: "Dev-Experimental-v3", env: "Development", reqs: "0", tokens: "0", cost: "$0.00", last: "2d ago", status: "Paused" },
  { icon: LineChart, name: "Production-Analytics", env: "Production", reqs: "892,104", tokens: "310.5M", cost: "$31.05", last: "14m ago", status: "Active" },
  { icon: Server, name: "Payment-Gateway-Proxy", env: "Production", reqs: "534,812", tokens: "189.1M", cost: "$18.91", last: "30s ago", status: "Active" },
  { icon: Shield, name: "Identity-Verification", env: "Staging", reqs: "12,450", tokens: "4.2M", cost: "$0.42", last: "1d ago", status: "Active" },
  { icon: Cpu, name: "LLM-FineTune-Runner", env: "Development", reqs: "31,200", tokens: "152.0M", cost: "$15.20", last: "3h ago", status: "Active" },
  { icon: LineChart, name: "Log-Aggregation-Sync", env: "Production", reqs: "2,190,440", tokens: "890.3M", cost: "$89.03", last: "1m ago", status: "Active" }
];

export default function ProjectsPage() {
  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Projects"
          subtitle="Manage your API environments, quotas, and service permissions."
        >
          <div className="project-search-wrap">
            <Search size={13} strokeWidth={1.5} />
            <input suppressHydrationWarning className="project-search" placeholder="Filter projects..." />
          </div>
          <button className="primary btn-inline">
            <Plus size={13} strokeWidth={2} />
            <span>New Project</span>
          </button>
        </PageHead>

        <article className="panel logs">
          <div className="logs-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Environment</th>
                  <th>Total Requests</th>
                  <th>Tokens Used</th>
                  <th>Monthly Cost</th>
                  <th>Last Activity</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projectsData.map((p) => {
                  const Icon = p.icon;
                  return (
                    <tr key={p.name}>
                      <td className="cell-project">
                        <span className="project-icon">
                          <Icon size={13} strokeWidth={1.5} />
                        </span>
                        <span className="cell-strong">{p.name}</span>
                      </td>
                      <td><span className={"env env-" + p.env.toLowerCase()}>{p.env}</span></td>
                      <td className="mono">{p.reqs}</td>
                      <td className="mono">{p.tokens}</td>
                      <td className="mono">{p.cost}</td>
                      <td className="text-muted">{p.last}</td>
                      <td>
                        <span className={"status-dot " + (p.status === "Active" ? "online" : "idle")}>
                          {p.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <button className="icon-btn-ghost" aria-label="Row actions">
                          <MoreHorizontal size={13} strokeWidth={1.5} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span className="table-footer-text">Showing 1 to 8 of 12 projects</span>
            <div className="pager">
              <button className="pager-btn" disabled>Previous</button>
              <button className="pager-btn active">1</button>
              <button className="pager-btn">2</button>
              <button className="pager-btn">Next</button>
            </div>
          </div>
        </article>
      </div>
    </DashboardShell>
  );
}
