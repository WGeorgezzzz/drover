// worktreesRoutes: used by the server entrypoint to mount the complete Worktrees HTTP API at `/api/worktrees`.
export { worktreesRoutes } from './worktrees.module.js';

// Superagent supplies its headless Git and filesystem adapters to the same creation workflow.
export { createWorktree as createTicketWorktree } from './services/worktree-create.service.js';
