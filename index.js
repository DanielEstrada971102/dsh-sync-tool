/**
 * DSH Sync Tool - Host half
 * 
 * Git-based synchronization plugin for global DSH configurations.
 * Syncs MCAPs, skills, plugins, presets across devices via GitHub repo.
 * Sessions are NOT synced (workspace-dependent).
 */

export const inject = ['tools', 'subprocess', 'timer', 'credentials'];

export const Config = {
  name: '@local/dsh-sync-tool',
  config: {
    type: 'object',
    properties: {
      gitUrl: { type: 'string', description: 'Remote repository URL (empty for local only)' },
      authMethod: { 
        type: 'string', 
        enum: ['local', 'ssh', 'token'],
        default: 'local',
        description: 'Authentication method'
      },
      gitTokenRef: { type: 'string', description: 'Reference to stored token in credentials service' },
      autoSync: { type: 'boolean', default: false, description: 'Enable automatic synchronization' },
      syncInterval: { type: 'number', minimum: 60, default: 300, description: 'Sync interval in seconds' },
      includeCredentials: { type: 'boolean', default: false, description: 'Include .credentials.yaml in sync (not recommended)' },
      customGitignore: { type: 'string', description: 'Additional .gitignore patterns' }
    },
    required: ['gitUrl', 'authMethod', 'autoSync', 'syncInterval']
  }
};

export function apply(ctx, config) {
  const { tools, subprocess, timer, credentials } = ctx;
  
  // Helper: Get DSH_HOME path
  const getDshHome = () => process.env.DSH_HOME || process.env.HOME + '/.dsh';
  
  // Helper: Check if git is available
  const checkGit = async () => {
    try {
      const result = await subprocess.request({
        method: 'sh',
        params: { args: ['git', '--version'], opts: {} }
      });
      return result && result.ok !== false;
    } catch {
      return false;
    }
  };
  
  // Helper: Run git command in DSH_HOME
  const runGit = async (args, useToken = false) => {
    const dshHome = getDshHome();
    const env = { ...process.env };

    // Handle different authentication methods
    if (useToken && config.gitTokenRef) {
      const token = await credentials.get(config.gitTokenRef);
      if (token) {
        env.GIT_ASKPASS = '/tmp/dsh-git-askpass.sh';
        env.DSH_GIT_TOKEN = token;
      }
    } else if (config.authMethod === 'token') {
      // Token method - will inject token via GIT_ASKPASS
      const token = await credentials.get(config.gitTokenRef);
      if (token) {
        env.GIT_ASKPASS = '/tmp/dsh-git-askpass.sh';
        env.DSH_GIT_TOKEN = token;
      }
    } else if (config.authMethod === 'ssh') {
      // SSH method - use SSH agent or specific key
      // Git will automatically use SSH from the system if available
    } else if (config.authMethod === 'local') {
      // Local method (default) - use system's credential helpers (SSH agent, credential manager, etc.)
      // Git will automatically use the configured credentials
    }

    const result = await subprocess.request({
      method: 'sh',
      params: { args: ['git', ...args], opts: { cwd: dshHome, env } }
    });
    return result;
  };
  
  // Tool: Initialize or clone repository
  tools.register({
    name: 'dsh-sync-init',
    description: 'Initialize local git repo or clone from configured remote URL.',
    parameters: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Reinitialize if repo exists', default: false }
      },
      additionalProperties: false
    },
    output: {
      schema: {
        type: 'string',
        description: 'Result message'
      }
    },
    execute: async (args) => {
      if (!await checkGit()) {
        return 'Git is not available on this system';
      }
      
      const dshHome = getDshHome();
      
      // Check if .git exists
      let isRepo = false;
      try {
        const stat = await subprocess.request({
          method: 'sh',
          params: { args: ['test', '-d', dshHome + '/.git'], opts: {} }
        });
        isRepo = stat.code === 0;
      } catch {
        isRepo = false;
      }
      
      if (!isRepo || args.force) {
        await runGit(['init']);
        
        // Build .gitignore content
        let gitignoreContent = `# DSH Sync .gitignore
# Ignore credential files
.credentials.yaml
.dsh-credentials

# Ignore session data (workspace-dependent)
.session-log/

# Ignore temp files
*.tmp
*.swp
*~

# Ignore node_modules
node_modules/
`;
        
        // Don't include .credentials.yaml if includeCredentials is false (default)
        if (!config.includeCredentials) {
          // Already excluded above
        } else {
          // If includeCredentials is true, we should NOT ignore it
          gitignoreContent = gitignoreContent.replace('.credentials.yaml\n', '');
          gitignoreContent = gitignoreContent.replace('.dsh-credentials\n', '');
        }
        
        // Add custom gitignore patterns if provided
        if (config.customGitignore && config.customGitignore.trim()) {
          gitignoreContent += '\n# Custom patterns\n' + config.customGitignore.trim() + '\n';
        }
        
        await subprocess.request({
          method: 'sh',
          params: { args: ['bash', '-c', `printf '%s' '${gitignoreContent}' > "${dshHome}/.gitignore"`], opts: {} }
        });
      }
      
      // If remote URL is configured in plugin config
      if (config.gitUrl && config.gitUrl.trim()) {
        const remoteAdd = await runGit(['remote', 'add', 'origin', config.gitUrl.trim()]);
        // Remote may already exist
      }
      
      return 'Repository initialized successfully';
    }
  });
  
  // Tool: Pull latest configuration
  tools.register({
    name: 'dsh-sync-pull',
    description: 'Pull latest configuration from remote repository.',
    parameters: {
      type: 'object',
      additionalProperties: false
    },
    output: {
      schema: {
        type: 'string',
        description: 'Result message'
      }
    },
    execute: async () => {
      const result = await runGit(['status', '--porcelain']);
      const hasUncommitted = result.stdout?.trim().length > 0;
      
      if (hasUncommitted) {
        return 'Uncommitted changes detected. Commit or stash before pulling.';
      }
      
      const pull = await runGit(['pull', 'origin', 'main']);
      if (pull.code !== 0) {
        // Try main branch, then master
        const pullMaster = await runGit(['pull', 'origin', 'master']);
        if (pullMaster.code !== 0 && pull.code !== 0) {
          return `Pull failed: ${pull.stderr || 'No history yet'}`;
        }
      }
      
      return 'Configuration pulled successfully';
    }
  });
  
  // Tool: Push configuration to remote
  tools.register({
    name: 'dsh-sync-push',
    description: 'Commit and push configuration changes to remote repository.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Custom commit message' }
      },
      additionalProperties: false
    },
    output: {
      schema: {
        type: 'string',
        description: 'Result message'
      }
    },
    execute: async (args) => {
      const dshHome = getDshHome();
      const commitMsg = args.message || 'Update DSH configuration';
      
      // Check for changes
      const status = await runGit(['status', '--porcelain']);
      if (!status.stdout?.trim()) {
        return 'No changes to commit';
      }
      
      // Configure git identity
      await runGit(['config', 'user.email', 'dsh-sync@localhost']);
      await runGit(['config', 'user.name', 'DSH Sync']);
      
      // Add files
      await runGit(['add', '.']);
      
      // Commit
      const commit = await runGit(['commit', '-m', commitMsg]);
      
      // Push
      const push = await runGit(['push', 'origin', 'main'], true);
      
      if (push.code !== 0 && push.stderr?.includes('rejected')) {
        return 'Push rejected - remote has newer changes. Pull first, then merge.';
      }
      
      if (push.code !== 0) {
        // Try master branch
        const pushMaster = await runGit(['push', 'origin', 'master'], true);
        if (pushMaster.code !== 0) {
          return `Push failed: ${push.stderr || pushMaster.stderr}`;
        }
      }
      
      return 'Changes pushed successfully';
    }
  });
  
  // Tool: Check sync status
  tools.register({
    name: 'dsh-sync-status',
    description: 'Check git status, detect conflicts, and show sync health.',
    parameters: {
      type: 'object',
      additionalProperties: false
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          hasChanges: { type: 'boolean' },
          hasConflicts: { type: 'boolean' },
          lastCommit: { type: 'string' },
          remoteUrl: { type: 'string' },
          changes: { type: 'array', items: { type: 'string' } },
          conflicts: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    execute: async () => {
      const dshHome = getDshHome();
      
      // Check if .git exists
      let isRepo = false;
      try {
        const stat = await subprocess.request({
          method: 'sh',
          params: { args: ['test', '-d', dshHome + '/.git'], opts: {} }
        });
        isRepo = stat.code === 0;
      } catch {
        isRepo = false;
      }
      
      if (!isRepo) {
        return { 
          status: 'no-repo', 
          message: 'No repository initialized. Run dsh-sync-init first.'
        };
      }
      
      // Get git status
      const status = await runGit(['status', '--porcelain']);
      const changes = status.stdout?.split('\n').filter(l => l.trim()) || [];
      
      // Check for conflicts
      const conflicts = changes.filter(s => s.startsWith('U') || s.includes('both '));
      
      // Get last commit
      const log = await runGit(['log', '-1', '--format=%H %s']);
      
      return {
        status: 'ok',
        hasChanges: changes.length > 0,
        changes: changes,
        hasConflicts: conflicts.length > 0,
        conflicts: conflicts,
        lastCommit: log.stdout?.trim() || 'No commits yet',
        remoteUrl: config.gitUrl || 'Not configured'
      };
    }
  });
  
  // Tool: Full sync (pull + push)
  tools.register({
    name: 'dsh-sync',
    description: 'Perform full sync: pull remote changes, then push local changes.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message for push' }
      },
      additionalProperties: false
    },
    output: {
      schema: {
        type: 'string',
        description: 'Result message'
      }
    },
    execute: async (args) => {
      const dshHome = getDshHome();
      
      // Get local changes
      const status = await runGit(['status', '--porcelain']);
      const localChanges = status.stdout?.trim().split('\n').filter(l => l.trim()) || [];
      
      // If there are local changes, commit and push
      if (localChanges.length > 0) {
        await runGit(['commit', '-am', args.message || 'Sync DSH config']);
      }
      
      // Pull remote changes
      const pull = await runGit(['pull', 'origin', 'main']);
      
      // If there were local changes OR pull succeeded, push
      if (localChanges.length > 0) {
        const push = await runGit(['push', 'origin', 'main'], true);
        if (push.code !== 0) {
          // Try master
          await runGit(['push', 'origin', 'master'], true);
        }
      }
      
      return 'Full sync completed';
    }
  });
  
  // Auto-sync timer if enabled
  let timerRef = null;
  if (config.autoSync && config.syncInterval && config.syncInterval > 0) {
    timerRef = timer.interval(async () => {
      const status = await runGit(['status', '--porcelain']);
      const hasChanges = status.stdout?.trim().length > 0;
      if (hasChanges) {
        await runGit(['commit', '-am', 'Auto-sync DSH config']);
        await runGit(['push', 'origin', 'main'], true);
      }
    }, config.syncInterval * 1000);
  }
  
  // Cleanup
  return () => {
    if (timerRef) {
      timerRef[1]();
    }
  };
}