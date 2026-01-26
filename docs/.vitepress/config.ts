import { defineConfig } from 'vitepress'

export default defineConfig({
  // Base path for GitHub Pages subdirectory deployment
  base: '/wreckit/',

  // Site metadata
  title: 'Wreckit',
  description: 'A CLI tool for turning ideas into automated PRs through an autonomous agent loop',
  lang: 'en-US',

  // Theme configuration
  themeConfig: {
    // Navigation bar - top-level links
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'CLI Reference', link: '/cli/' },
      { text: 'Agent Development', link: '/agent-development/' },
      { text: 'Migration', link: '/migration/' },
      { text: 'Changelog', link: '/changelog' },
      {
        text: 'GitHub',
        link: 'https://github.com/mikehostetler/wreckit'
      }
    ],

    // Sidebar - organized by section
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'The Loop', link: '/guide/loop' },
            { text: 'Folder Structure', link: '/guide/folder-structure' },
            { text: 'Design Principles', link: '/guide/design-principles' }
          ]
        }
      ],
      '/cli/': [
        {
          text: 'CLI Reference',
          items: [
            { text: 'Overview', link: '/cli/' },
            { text: 'Essential Commands', link: '/cli/essentials' },
            { text: 'Phase Commands', link: '/cli/phases' },
            { text: 'Flags', link: '/cli/flags' },
            { text: 'Exit Codes', link: '/cli/exit-codes' }
          ]
        }
      ],
      '/agent-development/': [
        {
          text: 'Agent Development',
          items: [
            { text: 'Guidelines', link: '/agent-development/' },
            { text: 'SDK Patterns', link: '/agent-development/sdk-patterns' },
            { text: 'MCP Tools', link: '/agent-development/mcp-tools' },
            { text: 'Customization', link: '/agent-development/customization' }
          ]
        }
      ],
      '/migration/': [
        {
          text: 'Migration Guide',
          items: [
            { text: 'Overview', link: '/migration/' },
            { text: 'Quick Migration', link: '/migration/quick-migration' },
            { text: 'Environment Variables', link: '/migration/environment' },
            { text: 'Troubleshooting', link: '/migration/troubleshooting' }
          ]
        }
      ]
    },

    // Social links
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mikehostetler/wreckit' }
    ],

    // Edit link - helps contributors
    editLink: {
      pattern: 'https://github.com/mikehostetler/wreckit/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    // Last updated text
    lastUpdated: {
      text: 'Last updated',
      formatOptions: {
        dateStyle: 'full',
        timeStyle: 'short'
      }
    },

    // Search configuration (built-in client-side search)
    search: {
      provider: 'local'
    },

    // Outline (table of contents on right side)
    outline: {
      level: [2, 3],
      label: 'On this page'
    }
  },

  // Markdown configuration
  markdown: {
    // Line numbers in code blocks
    lineNumbers: true,

    // Syntax highlighting theme
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  },

  // Build optimizations
  vite: {
    build: {
      chunkSizeWarningLimit: 1000
    }
  }
})
