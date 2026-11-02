# DSH Sync Tool

## Overview

The DSH Sync Tool is a plugin for DeepSeek Harness that provides Git-based synchronization for global DSH configurations across devices. It syncs MCAPs, skills, plugins, and agent presets while excluding session data which is workspace-dependent.

## Features

- Initialize local Git repository or clone from remote URL
- Pull latest configuration from remote repository
- Push local configuration changes to remote repository
- Check sync status and detect conflicts
- Perform full sync (pull + push)
- Automatic synchronization with configurable interval

## Installation

1. Ensure Git is installed on your system
2. Install the plugin using the DeepSeek Harness plugin manager
3. Configure the plugin settings in the DSH Web GUI

## Configuration

The plugin can be configured with the following options:

- Remote repository URL
- Authentication method (local, SSH, or token)
- Auto-sync settings
- Custom .gitignore patterns

## Usage

1. Initialize the repository with `dsh-sync-init`
2. Pull changes with `dsh-sync-pull`
3. Push changes with `dsh-sync-push`
4. Check status with `dsh-sync-status`
5. Perform full sync with `dsh-sync`

## Agent Tools

The plugin exposes the following tools for agent use:

- `dsh-sync-init`: Initialize the repository
- `dsh-sync-pull`: Pull latest configuration
- `dsh-sync-push`: Push configuration changes
- `dsh-sync-status`: Check sync status
- `dsh-sync`: Perform full sync

## License

This plugin is released under the GPL-3.0 license.