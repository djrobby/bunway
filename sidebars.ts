import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "index",
    {
      type: "category",
      label: "Get started",
      collapsed: false,
      items: ["getting-started", "first-app", "request-lifecycle", "project-structure"],
    },
    {
      type: "category",
      label: "Build an app",
      collapsed: false,
      items: [
        "scaffolding", "relationships", "storage", "database",
        {
          type: "category",
          label: "Database adapters",
          items: ["databases/postgresql", "databases/mysql", "databases/sqlite"],
        },
        "jobs", "realtime", "authentication", "audit", "messaging", "frontend",
      ],
    },
    {
      type: "category",
      label: "Build the Showcase",
      link: { type: "doc", id: "showcase/index" },
      items: [
        "showcase/create", "showcase/resource", "showcase/relationships-storage",
        "showcase/jobs-realtime", "showcase/auth", "showcase/audit-messaging",
        "showcase/test-deploy",
      ],
    },
    {
      type: "category",
      label: "Reference",
      items: ["cli", "generators", "database-types", "configuration"],
    },
    {
      type: "category",
      label: "Production",
      items: ["testing", "deployment", "production-checklist", "troubleshooting"],
    },
    {
      type: "category",
      label: "Project",
      items: ["architecture", "decisions", "roadmap"],
    },
  ],
};

export default sidebars;
