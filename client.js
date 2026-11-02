/**
 * DSH Sync Tool - Client half (Web UI)
 * 
 * Provides UI components for Git-based sync in the DSH Web GUI.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-sync-tool',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    
    function SyncToolPanel() {
      return h('div', { className: 'sync-tool-container' },
        h('h2', { className: 'sync-tool-title' }, 'DSH Sync Tool'),
        h('p', { className: 'sync-tool-description' }, 
          'Git-based synchronization for global DSH configurations across devices.'),
        
        // Setup Section
        h('h3', { className: 'sync-section-title' }, 'Repository Setup'),
        h('div', { className: 'sync-section' },
          h('button', { 
            className: 'sync-btn', 
            onClick: () => ctx.tools.execute('dsh-sync-init', { force: false })
          }, 'Initialize Repository')
        ),
        
        // Sync Actions
        h('h3', { className: 'sync-section-title' }, 'Sync Actions'),
        h('div', { className: 'sync-actions' },
          h('button', { 
            className: 'sync-btn', 
            onClick: async () => {
              const result = await ctx.tools.execute('dsh-sync-pull', {});
              alert(result);
            }
          }, 'Pull'),
          h('button', { 
            className: 'sync-btn', 
            onClick: async () => {
              const result = await ctx.tools.execute('dsh-sync-push', {});
              alert(result);
            }
          }, 'Push'),
          h('button', { 
            className: 'sync-btn', 
            onClick: async () => {
              const result = await ctx.tools.execute('dsh-sync', {});
              alert(result);
            }
          }, 'Full Sync'),
          h('button', { 
            className: 'sync-btn', 
            onClick: async () => {
              const result = await ctx.tools.execute('dsh-sync-status', {});
              alert(JSON.stringify(result, null, 2));
            }
          }, 'Status')
        ),
        
        // Status
        h('h3', { className: 'sync-section-title' }, 'Status'),
        h('div', { className: 'sync-status' },
          h('p', null, 'Repository not initialized')
        )
      );
    }
    
    return {
      inject: ['slots', 'tools'],
      apply(ctx) {
        ctx.slots.inject('settings', () => ctx.slots.register({
          name: 'sync-tool',
          id: 'dsh-sync-tool',
          order: 40,
        }, SyncToolPanel));
      },
    };
  },
});