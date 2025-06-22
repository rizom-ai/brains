import type { DashboardData } from "./schema";

export const DashboardLayout: React.FC<DashboardData> = ({ title, description, stats, recentEntities }) => {
  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">{title}</h1>
      <p className="dashboard-description">{description}</p>
      
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{stats.entityCount}</span>
          <span className="stat-label">Total Entities</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.entityTypeCount}</span>
          <span className="stat-label">Entity Types</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Last Updated</span>
          <span className="stat-value">{stats.lastUpdated}</span>
        </div>
      </div>
      
      <div className="recent-entities">
        <h2>Recent Entities</h2>
        <ul className="entity-list">
          {recentEntities.map((entity) => (
            <li key={entity.id} className="entity-item">
              <span className="entity-title">{entity.title}</span>
              <span className="entity-created">{entity.created}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};