/**
 * Browser half of the session manager bundle.
 *
 * Renders a Settings page that lists stored sessions per workspace, moves
 * deleted sessions to the Host recycle bin, and restores or permanently removes
 * them. All filesystem work belongs to the Host half.
 */
window.__ModuleLoader__.load({
  id: '@local/session-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const NS = 'sessionManager'
    const ROUTE = '/api/dsh-session-manager'
    const STYLE_ID = 'dsh-session-manager-styles'

    const zh = {
      nav: '会话管理',
      title: '会话管理',
      description: '按工作区查看、搜索并清理会话记录。删除的会话先进入回收站，可随时恢复。',
      refresh: '刷新',
      tabSessions: '会话',
      tabTrash: '回收站 ({count})',
      search: '搜索会话',
      searchPlaceholder: '按标题、ID 或目录筛选',
      totalSessions: '会话总数',
      totalSize: '占用空间',
      totalWorkspaces: '工作区',
      ungrouped: '未归入工作区',
      untitled: '未命名会话',
      live: '运行中',
      archived: '已归档',
      empty: '没有匹配的会话',
      emptyHint: '清空搜索词，或在其他工作区中开始一个会话。',
      loading: '正在读取会话…',
      error: '读取会话失败',
      retry: '重试',
      selectAll: '全选',
      clearSelection: '取消选择',
      selected: '已选择 {count} 项',
      deleteSelected: '移入回收站',
      delete: '移入回收站',
      deleteWorkspace: '清空工作区',
      cancel: '取消',
      confirmSingleTitle: '移入回收站？',
      confirmSingleBody: '会话「{name}」将被移入回收站，可在回收站中恢复。',
      confirmBulkTitle: '移入回收站？',
      confirmBulkBody: '选中的 {count} 条会话将被移入回收站，可随时恢复。',
      confirmWorkspaceTitle: '清空整个工作区？',
      confirmWorkspaceBody: '工作区「{name}」中的 {count} 条会话将被移入回收站，可随时恢复。',
      confirmHint: '正在运行的会话会被跳过；永久删除不可撤销。',
      confirmMove: '移入回收站',
      moving: '正在移动…',
      permanentDelete: '永久删除',
      trashedTitle: '已移入回收站',
      trashedBody: '已移入 {count} 条会话。',
      deletedTitle: '已永久删除',
      deletedBody: '已永久删除 {count} 条会话。',
      skippedBody: '已跳过 {count} 条正在运行的会话。',
      failedBody: '{count} 条会话操作失败。',
      selectedWithWorkspaces: '已选择 {count} 项，覆盖 {workspaces} 个工作区',
      selectAllSessions: '全选所有会话',
      trashTitle: '回收站',
      trashDesc: '移入回收站的会话会保留完整日志。恢复后回到原工作区；永久删除不可撤销。',
      trashEmpty: '回收站是空的',
      trashEmptyHint: '在“会话”页删除的会话会先出现在这里。',
      emptyTrash: '清空回收站',
      restore: '恢复',
      purge: '永久删除',
      purgeTitle: '永久删除这条会话？',
      purgeBody: '「{name}」的日志将被彻底删除，无法恢复。',
      emptyTrashTitle: '清空回收站？',
      emptyTrashBody: '回收站中的 {count} 项会话将被永久删除，无法恢复。',
      purgedTitle: '已永久删除',
      purgedBody: '已删除 {count} 项。',
      restoredTitle: '已恢复',
      restoredBody: '已恢复 {count} 条会话。',
      restoreFailedBody: '{count} 条会话恢复失败。',
      reload: '重新加载界面',
      reloadHint: '侧边栏仍显示已删除的会话时，重新加载页面即可同步。',
      noticeError: '操作失败：{message}',
      sessionsInGroup: '{count} 条',
      liveCannotDelete: '正在运行的会话不能移入回收站',
      deletedAt: '删除于',
      sizeHint: '回收站占用 {size}',
      retentionOn: '自动清理：超过 {days} 天的回收站条目会在打开本页时永久删除。',
      retentionOff: '自动清理：关闭，过期条目不会自动删除。',
      autoPurgedTitle: '已自动清理过期条目',
      autoPurgedBody: '按保留策略永久删除了 {count} 项。',
      retentionLabel: '保留天数',
      retentionOffOption: '关闭',
      retentionDaysOption: '{days} 天',
      retentionSaving: '正在保存…',
      retentionSaved: '保留策略已保存',
      retentionSaveFailed: '保留策略未能确认生效，请稍后重试。',
      purgeManyTitle: '永久删除选中的会话？',
      purgeManyBody: '选中的 {count} 项会话将被永久删除，无法恢复。',
      purgeSelected: '永久删除选中',
      removeWorkspace: '移除工作区',
      removeWorkspaceTitle: '移除工作区并删除会话？',
      removeWorkspaceBody: '工作区「{name}」的 {count} 条会话将被删除，工作区也会从侧边栏移除。工作区目录和其中的文件不会被删除。',
      workspaceRemoved: '工作区已移除',
      workspaceRemovedBody: '工作区已从侧边栏移除，会话已清理。',
      workspaceRemovePartial: '工作区已清空，但移除工作区未完成，请刷新后重试。',
      workspaceBusyTitle: '无法移除工作区',
      workspaceBusyBody: '该工作区内仍有运行中的会话。请先结束或移出这些会话，再移除工作区。',
      workspaceRemoveHint: '工作区目录和文件不会被删除；运行中的会话无法删除，会保留并显示为“未归入工作区”。',
      workspaceRemoveLiveHint: '该工作区有 {count} 条运行中的会话：它们会保留并显示为“未归入工作区”，其余会话按所选方式删除。',
    }

    const en = {
      nav: 'Session manager',
      title: 'Session manager',
      description: 'Browse, search and clean up sessions by workspace. Deleted sessions go to the recycle bin and can be restored.',
      refresh: 'Refresh',
      tabSessions: 'Sessions',
      tabTrash: 'Recycle bin ({count})',
      search: 'Search sessions',
      searchPlaceholder: 'Filter by title, ID or directory',
      totalSessions: 'Sessions',
      totalSize: 'Disk usage',
      totalWorkspaces: 'Workspaces',
      ungrouped: 'Ungrouped',
      untitled: 'Untitled session',
      live: 'Running',
      archived: 'Archived',
      empty: 'No matching sessions',
      emptyHint: 'Clear the search, or start a session in another workspace.',
      loading: 'Loading sessions…',
      error: 'Could not load sessions',
      retry: 'Retry',
      selectAll: 'Select all',
      clearSelection: 'Clear selection',
      selected: '{count} selected',
      deleteSelected: 'Move to recycle bin',
      delete: 'Move to recycle bin',
      deleteWorkspace: 'Clear workspace',
      cancel: 'Cancel',
      confirmSingleTitle: 'Move to recycle bin?',
      confirmSingleBody: '“{name}” moves to the recycle bin and can be restored from there.',
      confirmBulkTitle: 'Move to recycle bin?',
      confirmBulkBody: 'All {count} selected sessions move to the recycle bin and can be restored.',
      confirmWorkspaceTitle: 'Clear this workspace?',
      confirmWorkspaceBody: 'All {count} sessions in “{name}” move to the recycle bin and can be restored.',
      confirmHint: 'Running sessions are skipped; permanent deletion cannot be undone.',
      confirmMove: 'Move to recycle bin',
      moving: 'Moving…',
      permanentDelete: 'Delete permanently',
      trashedTitle: 'Moved to recycle bin',
      trashedBody: '{count} session(s) moved.',
      deletedTitle: 'Permanently deleted',
      deletedBody: '{count} session(s) permanently deleted.',
      skippedBody: '{count} running session(s) skipped.',
      failedBody: '{count} session(s) failed.',
      selectedWithWorkspaces: '{count} selected across {workspaces} workspace(s)',
      selectAllSessions: 'Select all sessions',
      trashTitle: 'Recycle bin',
      trashDesc: 'Trashed sessions keep their full logs. Restoring returns them to their workspace; permanent deletion cannot be undone.',
      trashEmpty: 'The recycle bin is empty',
      trashEmptyHint: 'Sessions you delete on the Sessions tab appear here first.',
      emptyTrash: 'Empty recycle bin',
      restore: 'Restore',
      purge: 'Delete permanently',
      purgeTitle: 'Delete this session permanently?',
      purgeBody: 'The log of “{name}” is destroyed. This cannot be undone.',
      emptyTrashTitle: 'Empty the recycle bin?',
      emptyTrashBody: 'All {count} trashed sessions are permanently deleted. This cannot be undone.',
      purgedTitle: 'Permanently deleted',
      purgedBody: '{count} item(s) removed.',
      restoredTitle: 'Restored',
      restoredBody: '{count} session(s) restored.',
      restoreFailedBody: '{count} session(s) could not be restored.',
      reload: 'Reload the interface',
      reloadHint: 'If the sidebar still lists a deleted session, reload the page to resync.',
      noticeError: 'Operation failed: {message}',
      sessionsInGroup: '{count}',
      liveCannotDelete: 'A running session cannot be moved to the recycle bin',
      deletedAt: 'Deleted',
      sizeHint: 'Recycle bin uses {size}',
      retentionOn: 'Automatic cleanup: entries older than {days} days are purged when this page opens.',
      retentionOff: 'Automatic cleanup is off; expired entries are kept.',
      autoPurgedTitle: 'Expired entries cleaned up',
      autoPurgedBody: '{count} item(s) permanently deleted by the retention policy.',
      retentionLabel: 'Keep for',
      retentionOffOption: 'Off',
      retentionDaysOption: '{days} days',
      retentionSaving: 'Saving…',
      retentionSaved: 'Retention policy saved',
      retentionSaveFailed: 'The retention change could not be confirmed; try again later.',
      purgeManyTitle: 'Delete the selected sessions permanently?',
      purgeManyBody: 'All {count} selected sessions are permanently deleted. This cannot be undone.',
      purgeSelected: 'Delete selected permanently',
      removeWorkspace: 'Remove workspace',
      removeWorkspaceTitle: 'Remove the workspace and its sessions?',
      removeWorkspaceBody: 'All {count} sessions in “{name}” are deleted and the workspace is removed from the sidebar. The workspace folder and its files are not deleted.',
      workspaceRemoved: 'Workspace removed',
      workspaceRemovedBody: 'The workspace was removed from the sidebar and its sessions were cleaned up.',
      workspaceRemovePartial: 'Sessions were cleaned up, but the workspace removal did not finish. Refresh and retry.',
      workspaceBusyTitle: 'Cannot remove this workspace',
      workspaceBusyBody: 'The workspace still holds running sessions. End or move them before removing it.',
      workspaceRemoveHint: 'The workspace folder and files are kept; running sessions cannot be deleted and stay available as ungrouped sessions.',
      workspaceRemoveLiveHint: '{count} running session(s) in this workspace stay available as ungrouped sessions; the others are deleted as chosen.',
    }

    const CSS = `
.dsm-page{position:relative;display:flex;flex-direction:column;gap:14px;height:100%;min-height:0;box-sizing:border-box;padding:2px 2px 8px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.dsm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dsm-title{margin:0;font-size:16px;font-weight:600;letter-spacing:0}
.dsm-desc{margin:4px 0 0;max-width:60ch;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsm-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.dsm-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;transition:background .12s ease,border-color .12s ease,color .12s ease}
.dsm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsm-btn:disabled{opacity:.45;cursor:default}
.dsm-btn-danger{color:var(--dsw-alias-state-error-primary)}
.dsm-btn-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,var(--dsw-alias-border-l1))}
.dsm-btn-solid{border-color:transparent;background:var(--dsw-alias-state-error-primary);color:#fff;font-weight:600}
.dsm-btn-solid:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);filter:brightness(1.08)}
.dsm-tabs{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.dsm-tab{appearance:none;height:30px;padding:0 10px;border:none;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dsm-tab:hover{color:var(--dsw-alias-label-primary)}
.dsm-tab-active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}
.dsm-search{position:relative;flex:1 1 auto;min-width:0}
.dsm-searchRow{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.dsm-input{width:100%;box-sizing:border-box;height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px;outline:none}
.dsm-input:focus{border-color:var(--dsw-alias-brand-primary)}
.dsm-input::placeholder{color:var(--dsw-alias-label-secondary)}
.dsm-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.dsm-stat{padding:9px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dsm-statLabel{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsm-statValue{margin-top:2px;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.dsm-list{display:flex;flex-direction:column;gap:10px;flex:1 1 auto;min-height:0;overflow:auto;padding-right:2px}
.dsm-group{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;flex:0 0 auto}
.dsm-groupHead{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--dsw-alias-bg-layer-2)}
.dsm-groupTitle{font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-groupPath{margin-left:2px;flex:1 1 auto;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
.dsm-count{flex:0 0 auto;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dsm-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsm-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dsm-check{display:flex;align-items:center;margin:0;cursor:pointer}
.dsm-check input{margin:0;accent-color:var(--dsw-alias-brand-primary);width:14px;height:14px;cursor:pointer}
.dsm-rowMain{min-width:0}
.dsm-rowTitle{display:flex;align-items:center;gap:6px;min-width:0;font-size:12px;font-weight:500}
.dsm-rowName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsm-rowMeta{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-badge{flex:0 0 auto;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;font-size:10px;font-weight:500;color:var(--dsw-alias-label-secondary);line-height:16px}
.dsm-badge-live{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,var(--dsw-alias-border-l1))}
.dsm-size{flex:0 0 auto;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dsm-iconBtn{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsm-iconBtn:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsm-iconBtn:disabled{opacity:.35;cursor:default}
.dsm-bulk{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);flex:0 0 auto}
.dsm-bulkText{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsm-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:36px 12px;border:1px dashed var(--dsw-alias-border-l1);border-radius:12px;color:var(--dsw-alias-label-secondary);text-align:center}
.dsm-emptyTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsm-emptyHint{font-size:12px}
.dsm-notice{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);font-size:12px;flex:0 0 auto}
.dsm-notice-success{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 45%,var(--dsw-alias-border-l1))}
.dsm-notice-warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,var(--dsw-alias-border-l1))}
.dsm-notice-error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,var(--dsw-alias-border-l1));color:var(--dsw-alias-state-error-primary)}
.dsm-noticeTitle{font-weight:600;color:var(--dsw-alias-label-primary)}
.dsm-noticeRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsm-noticeHint{color:var(--dsw-alias-label-secondary)}
.dsm-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsm-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:color-mix(in srgb,#000 34%,transparent);border-radius:12px;z-index:20}
.dsm-dialog{width:min(420px,100%);box-sizing:border-box;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 16px 40px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary)}
.dsm-dialogTitle{margin:0;font-size:14px;font-weight:600}
.dsm-dialogBody{margin:8px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6}
.dsm-dialogHint{margin:8px 0 0;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsm-dialogActions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.dsm-loading{display:flex;align-items:center;justify-content:center;padding:40px 12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsm-trashList{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dsm-trashRow{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsm-trashRow:first-child{border-top:none}
.dsm-trashRow:hover{background:var(--dsw-alias-bg-layer-2)}
.dsm-policy{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 0 auto}
.dsm-policyLabel{font-size:12px;font-weight:500}
.dsm-select{height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px;outline:none;cursor:pointer}
.dsm-select:focus{border-color:var(--dsw-alias-brand-primary)}
.dsm-select:disabled{opacity:.55;cursor:default}
`

    function installStyles() {
      const existing = document.getElementById(STYLE_ID)
      if (existing) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
      return () => {
        style.remove()
      }
    }

    async function request(payload) {
      const init = payload === undefined
        ? { method: 'GET', headers: { 'x-dsh-session-manager': '1' }, cache: 'no-store' }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-dsh-session-manager': '1' },
            body: JSON.stringify(payload),
            cache: 'no-store',
          }
      const response = await fetch(ROUTE, init)
      let body
      try {
        body = await response.json()
      } catch {
        body = undefined
      }
      if (!response.ok || body?.ok !== true) {
        const error = new Error(body?.error || `HTTP ${response.status}`)
        error.code = body?.code
        throw error
      }
      return body.data
    }

    function formatBytes(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return '—'
      const units = ['B', 'KB', 'MB', 'GB']
      let size = value
      let unit = 0
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024
        unit += 1
      }
      return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`
    }

    function formatTime(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—'
      const date = new Date(value)
      const pad = (part) => String(part).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function shortId(id) {
      if (typeof id !== 'string') return ''
      return id.length <= 22 ? id : `${id.slice(0, 12)}…${id.slice(-6)}`
    }

    function interpolate(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (
        values[key] === undefined ? match : String(values[key])
      ))
    }

    function groupSessions(data, query) {
      if (!data || !Array.isArray(data.workspaces)) return []
      const needle = query.trim().toLowerCase()
      const groups = []
      for (const group of data.workspaces) {
        const sessions = (group.sessions ?? []).filter((session) => {
          if (needle === '') return true
          const haystack = `${session.title ?? ''}\n${session.id}\n${session.cwd ?? ''}`
          return haystack.toLowerCase().includes(needle)
        })
        if (sessions.length === 0) continue
        groups.push({ ...group, visible: sessions })
      }
      return groups
    }

    function filterTrash(entries, query) {
      const needle = query.trim().toLowerCase()
      if (needle === '') return entries
      return entries.filter((entry) => `${entry.title ?? ''}\n${entry.sessionId}\n${entry.cwd ?? ''}\n${entry.workspaceName ?? ''}`.toLowerCase().includes(needle))
    }

    function trashKey(entry) {
      return `${entry.root}\u0000${entry.entryId}`
    }

    function TrashGlyph() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, style: { display: 'block' },
      },
      h('path', {
        d: 'M3 4.5h10M6.4 4.5V3.2c0-.4.3-.7.7-.7h1.8c.4 0 .7.3.7.7v1.3M4.6 4.5l.5 8.1c0 .5.4.9.9.9h4c.5 0 .9-.4.9-.9l.5-8.1',
        stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    function RestoreGlyph() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, style: { display: 'block' },
      },
      h('path', {
        d: 'M3.4 7.2A4.8 4.8 0 1 1 4.6 11M3.2 3.6v3.8h3.8',
        stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    function SessionManager(props) {
      const t = typeof props?.t === 'function' ? props.t : (key) => zh[key] ?? key
      const [state, setState] = useState({ status: 'loading', data: null, error: '' })
      const [view, setView] = useState('sessions')
      const [query, setQuery] = useState('')
      const [selected, setSelected] = useState({})
      const [confirm, setConfirm] = useState(null)
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState(null)
      const [trashSelected, setTrashSelected] = useState({})
      const [policyBusy, setPolicyBusy] = useState(false)

      const load = useCallback(async () => {
        setState((current) => ({ ...current, status: 'loading', error: '' }))
        try {
          const data = await request()
          setState({ status: 'ready', data, error: '' })
          const autoPurged = Number(data?.retention?.autoPurged ?? 0)
          if (autoPurged > 0) {
            setNotice({
              kind: 'success',
              title: t('autoPurgedTitle'),
              lines: [interpolate(t('autoPurgedBody'), { count: autoPurged })],
              reload: false,
            })
          }
        } catch (error) {
          setState({ status: 'error', data: null, error: String(error?.message ?? error) })
        }
      }, [t])

      useEffect(() => {
        load()
      }, [load])

      const groups = useMemo(() => groupSessions(state.data, query), [state.data, query])
      const trash = useMemo(() => filterTrash(state.data?.trash ?? [], query), [state.data, query])
      const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id] === true), [selected])
      const trashSelectedEntries = useMemo(
        () => trash.filter((entry) => trashSelected[trashKey(entry)] === true),
        [trash, trashSelected],
      )

      const toggle = useCallback((id) => {
        setSelected((current) => {
          const next = { ...current }
          if (next[id]) delete next[id]
          else next[id] = true
          return next
        })
      }, [])

      const toggleGroup = useCallback((group) => {
        setSelected((current) => {
          const selectable = group.visible.filter((session) => !session.live)
          if (selectable.length === 0) return current
          const allSelected = selectable.every((session) => current[session.id] === true)
          const next = { ...current }
          for (const session of selectable) {
            if (allSelected) delete next[session.id]
            else next[session.id] = true
          }
          return next
        })
      }, [])

      const selectAllSessions = useCallback(() => {
        setSelected(() => {
          const next = {}
          for (const group of groups) {
            for (const session of group.visible) {
              if (!session.live) next[session.id] = true
            }
          }
          return next
        })
      }, [groups])

      const selectedWorkspaceCount = useMemo(() => {
        const ids = new Set()
        for (const group of groups) {
          for (const session of group.visible) {
            if (selected[session.id] === true) ids.add(group.id)
          }
        }
        return ids.size
      }, [groups, selected])

      const runTrash = useCallback(async (permanent = false) => {
        if (!confirm || busy) return
        setBusy(true)
        try {
          const result = confirm.kind === 'workspace'
            ? await request({ action: 'trash-workspace', workspaceId: confirm.group.id, permanent })
            : await request({
                action: 'trash',
                ids: confirm.kind === 'bulk' ? confirm.ids : [confirm.session.id],
                permanent,
              })
          setNotice({
            kind: result.failed > 0 ? 'warn' : 'success',
            title: permanent ? t('deletedTitle') : t('trashedTitle'),
            lines: [
              permanent
                ? interpolate(t('deletedBody'), { count: result.deleted })
                : interpolate(t('trashedBody'), { count: result.trashed }),
              result.skippedLive > 0 ? interpolate(t('skippedBody'), { count: result.skippedLive }) : null,
              result.failed > 0 ? interpolate(t('failedBody'), { count: result.failed }) : null,
            ].filter(Boolean),
            reload: true,
          })
          setConfirm(null)
          setSelected({})
          await load()
        } catch (error) {
          setNotice({ kind: 'error', message: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }, [busy, confirm, load, t])

      const runRemoveWorkspace = useCallback(async (permanent = false) => {
        if (!confirm || busy) return
        setBusy(true)
        try {
          const result = await request({
            action: 'remove-workspace',
            workspaceId: confirm.group.id,
            permanent,
          })
          setNotice({
            kind: result.workspaceRemoved && result.failed === 0 ? 'success' : 'warn',
            title: t('workspaceRemoved'),
            lines: [
              permanent
                ? interpolate(t('deletedBody'), { count: result.deleted })
                : interpolate(t('trashedBody'), { count: result.trashed }),
              result.skippedLive > 0 ? interpolate(t('skippedBody'), { count: result.skippedLive }) : null,
              result.workspaceRemoved ? t('workspaceRemovedBody') : t('workspaceRemovePartial'),
              result.failed > 0 ? interpolate(t('failedBody'), { count: result.failed }) : null,
            ].filter(Boolean),
            reload: true,
          })
          setConfirm(null)
          setSelected({})
          await load()
        } catch (error) {
          setNotice({ kind: 'error', message: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }, [busy, confirm, load, t])

      const runPurge = useCallback(async () => {
        if (!confirm || busy) return
        setBusy(true)
        try {
          const entries = confirm.kind === 'purge-one'
            ? [{ entryId: confirm.entry.entryId, root: confirm.entry.root }]
            : confirm.entries ?? []
          const result = confirm.kind === 'empty-trash'
            ? await request({ action: 'empty-trash' })
            : await request({ action: 'purge', entries })
          setNotice({
            kind: result.failed > 0 ? 'warn' : 'success',
            title: t('purgedTitle'),
            lines: [interpolate(t('purgedBody'), { count: result.purged })],
            reload: true,
          })
          setConfirm(null)
          setTrashSelected({})
          await load()
        } catch (error) {
          setNotice({ kind: 'error', message: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }, [busy, confirm, load, t])

      const runRestore = useCallback(async (entry) => {
        if (busy) return
        setBusy(true)
        try {
          const result = await request({ action: 'restore', entries: [{ entryId: entry.entryId, root: entry.root }] })
          setNotice({
            kind: result.failed > 0 ? 'warn' : 'success',
            title: t('restoredTitle'),
            lines: [
              interpolate(t('restoredBody'), { count: result.restored }),
              result.failed > 0 ? interpolate(t('restoreFailedBody'), { count: result.failed }) : null,
            ].filter(Boolean),
            reload: true,
          })
          await load()
          setTrashSelected((current) => {
            const next = { ...current }
            delete next[trashKey(entry)]
            return next
          })
        } catch (error) {
          setNotice({ kind: 'error', message: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }, [busy, load, t])

      const toggleTrash = useCallback((entry) => {
        const key = trashKey(entry)
        setTrashSelected((current) => {
          const next = { ...current }
          if (next[key]) delete next[key]
          else next[key] = true
          return next
        })
      }, [])

      const selectAllTrash = useCallback(() => {
        setTrashSelected(() => {
          const next = {}
          for (const entry of trash) next[trashKey(entry)] = true
          return next
        })
      }, [trash])

      const setRetention = useCallback(async (days) => {
        if (policyBusy) return
        setPolicyBusy(true)
        try {
          await request({ action: 'set-retention', days })
          let updated = null
          // Saving an ordinary config field restarts the Host plugin, so poll
          // until the route is back and reports the new value.
          for (let attempt = 0; attempt < 12; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 300))
            try {
              const next = await request()
              if (Number(next?.retention?.days ?? 0) === Number(days)) {
                updated = next
                break
              }
            } catch {}
          }
          if (updated !== null) {
            setState({ status: 'ready', data: updated, error: '' })
            setNotice({ kind: 'success', title: t('retentionSaved'), lines: [], reload: false })
          } else {
            setNotice({ kind: 'warn', title: t('retentionSaveFailed'), lines: [], reload: false })
            await load()
          }
        } catch (error) {
          setNotice({ kind: 'error', message: String(error?.message ?? error) })
        } finally {
          setPolicyBusy(false)
        }
      }, [load, policyBusy, t])

      const onReload = useCallback(() => {
        if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') window.location.reload()
      }, [])

      useEffect(() => {
        if (!confirm) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setConfirm(null)
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [confirm])

      const noticeView = notice === null ? null : h('div', {
        className: `dsm-notice dsm-notice-${notice.kind}`,
        role: notice.kind === 'error' ? 'alert' : 'status',
      },
      notice.kind === 'error'
        ? h('div', { className: 'dsm-noticeTitle' }, interpolate(t('noticeError'), { message: notice.message }))
        : h('div', null,
            h('div', { className: 'dsm-noticeTitle' }, notice.title),
            h('div', { className: 'dsm-noticeRow' }, ...notice.lines.map((line) => h('span', { className: 'dsm-noticeHint', key: line }, line))),
            notice.reload
              ? h('div', { className: 'dsm-noticeRow' },
                  h('button', { className: 'dsm-btn', type: 'button', onClick: onReload }, t('reload')),
                  h('span', { className: 'dsm-noticeHint' }, t('reloadHint')),
                )
              : null,
          ),
      )

      if (state.status === 'loading' && state.data === null) {
        return h('div', { className: 'dsm-page' },
          h('div', { className: 'dsm-head' },
            h('div', null,
              h('h2', { className: 'dsm-title' }, t('title')),
              h('p', { className: 'dsm-desc' }, t('description')),
            ),
          ),
          h('div', { className: 'dsm-loading' }, t('loading')),
        )
      }

      if (state.status === 'error') {
        return h('div', { className: 'dsm-page' },
          h('div', { className: 'dsm-head' },
            h('div', null,
              h('h2', { className: 'dsm-title' }, t('title')),
              h('p', { className: 'dsm-desc' }, t('description')),
            ),
          ),
          h('div', { className: 'dsm-notice dsm-notice-error', role: 'alert' },
            h('div', { className: 'dsm-noticeTitle' }, t('error')),
            h('div', null, state.error),
            h('div', { className: 'dsm-noticeRow' },
              h('button', { className: 'dsm-btn', type: 'button', onClick: load }, t('retry')),
            ),
          ),
        )
      }

      const data = state.data
      const totals = data?.totals ?? { sessions: 0, bytes: 0, workspaces: 0, trash: 0, trashBytes: 0 }
      const trashEntries = trash

      const tabs = h('div', { className: 'dsm-tabs' },
        h('button', {
          className: `dsm-tab${view === 'sessions' ? ' dsm-tab-active' : ''}`,
          type: 'button',
          onClick: () => setView('sessions'),
        }, t('tabSessions')),
        h('button', {
          className: `dsm-tab${view === 'trash' ? ' dsm-tab-active' : ''}`,
          type: 'button',
          onClick: () => setView('trash'),
        }, interpolate(t('tabTrash'), { count: totals.trash ?? 0 })),
      )

      const searchBox = h('div', { className: 'dsm-search' },
        h('input', {
          className: 'dsm-input',
          type: 'search',
          value: query,
          placeholder: t('searchPlaceholder'),
          'aria-label': t('search'),
          onChange: (event) => setQuery(event.target.value),
        }),
      )

      const searchRow = h('div', { className: 'dsm-searchRow' },
        searchBox,
        h('button', {
          className: 'dsm-btn', type: 'button',
          onClick: selectAllSessions,
          disabled: groups.length === 0,
        }, t('selectAllSessions')),
      )

      const groupsView = groups.length === 0
        ? h('div', { className: 'dsm-empty' },
            h('div', { className: 'dsm-emptyTitle' }, t('empty')),
            h('div', { className: 'dsm-emptyHint' }, t('emptyHint')),
          )
        : groups.map((group) => {
            const selectable = group.visible.filter((session) => !session.live)
            const allSelected = selectable.length > 0 && selectable.every((session) => selected[session.id] === true)
            return h('section', { className: 'dsm-group', key: group.id },
            h('div', { className: 'dsm-groupHead' },
              h('label', { className: 'dsm-check', title: t('selectAll') },
                h('input', {
                  type: 'checkbox',
                  checked: allSelected,
                  disabled: selectable.length === 0,
                  onChange: () => toggleGroup(group),
                  'aria-label': t('selectAll'),
                }),
              ),
              h('div', { className: 'dsm-groupTitle', title: group.title }, group.title),
              h('div', { className: 'dsm-groupPath', title: group.path || '' }, group.path || t('ungrouped')),
              h('div', { className: 'dsm-count' }, interpolate(t('sessionsInGroup'), { count: group.visible.length })),
              selectable.length > 0
                ? h('button', {
                    className: 'dsm-btn', type: 'button',
                    onClick: () => setConfirm({ kind: 'workspace', group }),
                  }, t('deleteWorkspace'))
                : null,
              group.registered === true
                ? h('button', {
                    className: 'dsm-btn dsm-btn-danger', type: 'button',
                    onClick: () => setConfirm({ kind: 'workspace-remove', group }),
                  }, t('removeWorkspace'))
                : null,
            ),
            group.visible.map((session) => {
              const name = session.title || t('untitled')
              return h('div', { className: 'dsm-row', key: session.id },
                h('label', { className: 'dsm-check', title: name },
                  h('input', {
                    type: 'checkbox',
                    checked: selected[session.id] === true,
                    disabled: session.live === true,
                    onChange: () => toggle(session.id),
                    'aria-label': name,
                  }),
                ),
                h('div', { className: 'dsm-rowMain' },
                  h('div', { className: 'dsm-rowTitle' },
                    h('span', { className: 'dsm-rowName', title: name }, name),
                    session.live ? h('span', { className: 'dsm-badge dsm-badge-live' }, t('live')) : null,
                    session.archived ? h('span', { className: 'dsm-badge' }, t('archived')) : null,
                  ),
                  h('div', { className: 'dsm-rowMeta', title: `${session.id}\n${session.cwd ?? ''}` },
                    formatTime(session.createdAt),
                    ' · ',
                    shortId(session.id),
                    session.cwd ? ` · ${session.cwd}` : '',
                  ),
                ),
                h('div', { className: 'dsm-size' }, formatBytes(session.sizeBytes)),
                h('button', {
                  className: 'dsm-iconBtn',
                  type: 'button',
                  title: session.live ? t('liveCannotDelete') : t('delete'),
                  'aria-label': t('delete'),
                  disabled: session.live === true,
                  onClick: () => setConfirm({ kind: 'single', session }),
                }, TrashGlyph()),
              )
            })
          )})

      const bulkBar = view !== 'sessions' || selectedIds.length === 0 ? null : h('div', { className: 'dsm-bulk' },
        h('div', { className: 'dsm-bulkText' },
          selectedWorkspaceCount > 1
            ? interpolate(t('selectedWithWorkspaces'), { count: selectedIds.length, workspaces: selectedWorkspaceCount })
            : interpolate(t('selected'), { count: selectedIds.length })),
        h('div', { className: 'dsm-actions' },
          h('button', { className: 'dsm-btn', type: 'button', onClick: () => setSelected({}) }, t('clearSelection')),
          h('button', {
            className: 'dsm-btn dsm-btn-danger', type: 'button',
            onClick: () => setConfirm({ kind: 'bulk', ids: selectedIds }),
          }, t('deleteSelected')),
        ),
      )

      const trashView = trashEntries.length === 0
        ? h('div', { className: 'dsm-empty' },
            h('div', { className: 'dsm-emptyTitle' }, t('trashEmpty')),
            h('div', { className: 'dsm-emptyHint' }, t('trashEmptyHint')),
          )
        : h('div', { className: 'dsm-trashList' },
            trashEntries.map((entry) => {
              const name = entry.title || t('untitled')
              const key = trashKey(entry)
              return h('div', { className: 'dsm-trashRow', key },
                h('label', { className: 'dsm-check', title: name },
                  h('input', {
                    type: 'checkbox',
                    checked: trashSelected[key] === true,
                    onChange: () => toggleTrash(entry),
                    'aria-label': name,
                  }),
                ),
                h('div', { className: 'dsm-rowMain' },
                  h('div', { className: 'dsm-rowTitle' },
                    h('span', { className: 'dsm-rowName', title: name }, name),
                  ),
                  h('div', { className: 'dsm-rowMeta', title: [entry.workspaceName, entry.cwd].filter(Boolean).join('\n') },
                    `${t('deletedAt')} ${formatTime(entry.deletedAt)}`,
                    ' · ',
                    shortId(entry.sessionId),
                    entry.workspaceName ? ` · ${entry.workspaceName}` : '',
                    entry.cwd ? ` · ${entry.cwd}` : '',
                  ),
                ),
                h('div', { className: 'dsm-size' }, formatBytes(entry.sizeBytes)),
                h('div', { className: 'dsm-actions' },
                  h('button', {
                    className: 'dsm-btn', type: 'button', disabled: busy,
                    onClick: () => runRestore(entry),
                  }, RestoreGlyph(), t('restore')),
                  h('button', {
                    className: 'dsm-iconBtn', type: 'button', title: t('purge'), 'aria-label': t('purge'),
                    disabled: busy,
                    onClick: () => setConfirm({ kind: 'purge-one', entry }),
                  }, TrashGlyph()),
                ),
              )
            }),
          )

      const trashToolbar = view === 'trash' && trashEntries.length > 0
        ? h('div', { className: 'dsm-bulk' },
            h('div', { className: 'dsm-bulkText' }, interpolate(t('sizeHint'), { size: formatBytes(totals.trashBytes) })),
            h('div', { className: 'dsm-actions' },
              h('button', { className: 'dsm-btn', type: 'button', onClick: selectAllTrash, disabled: busy }, t('selectAll')),
              h('button', {
                className: 'dsm-btn dsm-btn-danger', type: 'button', disabled: busy,
                onClick: () => setConfirm({ kind: 'empty-trash' }),
              }, t('emptyTrash')),
            ),
          )
        : null

      const trashBulkBar = view !== 'trash' || trashSelectedEntries.length === 0 ? null : h('div', { className: 'dsm-bulk' },
        h('div', { className: 'dsm-bulkText' }, interpolate(t('selected'), { count: trashSelectedEntries.length })),
        h('div', { className: 'dsm-actions' },
          h('button', { className: 'dsm-btn', type: 'button', onClick: () => setTrashSelected({}) }, t('clearSelection')),
          h('button', {
            className: 'dsm-btn dsm-btn-danger', type: 'button', disabled: busy,
            onClick: () => setConfirm({
              kind: 'purge-many',
              entries: trashSelectedEntries.map((entry) => ({ entryId: entry.entryId, root: entry.root })),
            }),
          }, t('purgeSelected')),
        ),
      )

      const retentionDays = Number(data?.retention?.days ?? 0)
      const retentionOptions = [0, 7, 14, 30, 90, 180, 365]
      if (retentionDays > 0 && !retentionOptions.includes(retentionDays)) {
        retentionOptions.push(retentionDays)
        retentionOptions.sort((left, right) => left - right)
      }
      const policyRow = h('div', { className: 'dsm-policy' },
        h('span', { className: 'dsm-policyLabel' }, t('retentionLabel')),
        h('select', {
          className: 'dsm-select',
          value: String(retentionDays),
          disabled: policyBusy,
          'aria-label': t('retentionLabel'),
          onChange: (event) => setRetention(Number(event.target.value)),
        }, retentionOptions.map((days) => h('option', { key: String(days), value: String(days) },
          days === 0 ? t('retentionOffOption') : interpolate(t('retentionDaysOption'), { days })))),
        policyBusy ? h('span', { className: 'dsm-hint' }, t('retentionSaving')) : null,
        h('span', { className: 'dsm-hint' },
          retentionDays > 0
            ? interpolate(t('retentionOn'), { days: retentionDays })
            : t('retentionOff')),
      )

      const dialog = confirm === null ? null : (() => {
        const purge = confirm.kind === 'purge-one' || confirm.kind === 'empty-trash' || confirm.kind === 'purge-many'
        const removing = confirm.kind === 'workspace-remove'
        const title = purge
          ? (confirm.kind === 'empty-trash'
              ? t('emptyTrashTitle')
              : confirm.kind === 'purge-many' ? t('purgeManyTitle') : t('purgeTitle'))
          : removing
            ? t('removeWorkspaceTitle')
            : confirm.kind === 'workspace'
              ? t('confirmWorkspaceTitle')
              : confirm.kind === 'bulk' ? t('confirmBulkTitle') : t('confirmSingleTitle')
        const body = purge
          ? (confirm.kind === 'empty-trash'
              ? interpolate(t('emptyTrashBody'), { count: totals.trash ?? 0 })
              : confirm.kind === 'purge-many'
                ? interpolate(t('purgeManyBody'), { count: confirm.entries.length })
                : interpolate(t('purgeBody'), { name: confirm.entry.title || t('untitled') }))
          : removing
            ? interpolate(t('removeWorkspaceBody'), {
                name: confirm.group.title,
                count: confirm.group.sessionCount ?? confirm.group.visible.length,
              })
            : confirm.kind === 'workspace'
              ? interpolate(t('confirmWorkspaceBody'), { name: confirm.group.title, count: confirm.group.visible.filter((session) => !session.live).length })
              : confirm.kind === 'bulk'
                ? interpolate(t('confirmBulkBody'), { count: confirm.ids.length })
                : interpolate(t('confirmSingleBody'), { name: confirm.session.title || t('untitled') })
        return h('div', {
          className: 'dsm-overlay',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) setConfirm(null)
          },
        },
        h('div', { className: 'dsm-dialog', role: 'dialog', 'aria-modal': 'true' },
          h('h3', { className: 'dsm-dialogTitle' }, title),
          h('p', { className: 'dsm-dialogBody' }, body),
          purge
            ? null
            : h('p', { className: 'dsm-dialogHint' }, removing
                ? ((confirm.group.liveCount ?? 0) > 0
                    ? interpolate(t('workspaceRemoveLiveHint'), { count: confirm.group.liveCount })
                    : t('workspaceRemoveHint'))
                : t('confirmHint')),
          h('div', { className: 'dsm-dialogActions' },
            h('button', { className: 'dsm-btn', type: 'button', disabled: busy, onClick: () => setConfirm(null) }, t('cancel')),
            purge
              ? h('button', {
                  className: 'dsm-btn dsm-btn-solid', type: 'button', disabled: busy, onClick: runPurge,
                }, busy ? t('moving') : t('purge'))
              : [
                  h('button', {
                    className: 'dsm-btn', type: 'button', disabled: busy,
                    onClick: () => (removing ? runRemoveWorkspace(false) : runTrash(false)),
                  }, busy ? t('moving') : t('confirmMove')),
                  h('button', {
                    className: 'dsm-btn dsm-btn-solid', type: 'button', disabled: busy,
                    onClick: () => (removing ? runRemoveWorkspace(true) : runTrash(true)),
                  }, busy ? t('moving') : t('permanentDelete')),
                ],
          ),
        ))
      })()

      return h('div', { className: 'dsm-page' },
        h('div', { className: 'dsm-head' },
          h('div', null,
            h('h2', { className: 'dsm-title' }, t('title')),
            h('p', { className: 'dsm-desc' }, view === 'trash' ? t('trashDesc') : t('description')),
          ),
          h('div', { className: 'dsm-actions' },
            h('button', { className: 'dsm-btn', type: 'button', onClick: load, disabled: state.status === 'loading' }, t('refresh')),
          ),
        ),
        tabs,
        noticeView,
        view === 'sessions'
          ? h(React.Fragment, null,
              h('div', { className: 'dsm-stats' },
                h('div', { className: 'dsm-stat' },
                  h('div', { className: 'dsm-statLabel' }, t('totalSessions')),
                  h('div', { className: 'dsm-statValue' }, String(totals.sessions)),
                ),
                h('div', { className: 'dsm-stat' },
                  h('div', { className: 'dsm-statLabel' }, t('totalSize')),
                  h('div', { className: 'dsm-statValue' }, formatBytes(totals.bytes)),
                ),
                h('div', { className: 'dsm-stat' },
                  h('div', { className: 'dsm-statLabel' }, t('totalWorkspaces')),
                  h('div', { className: 'dsm-statValue' }, String(totals.workspaces)),
                ),
              ),
              searchRow,
              bulkBar,
              h('div', { className: 'dsm-list' }, groupsView),
            )
          : h(React.Fragment, null,
              searchBox,
              policyRow,
              trashToolbar,
              trashBulkBar,
              trashView,
            ),
        h('div', { className: 'dsm-hint' }, t('reloadHint')),
        dialog,
      )
    }

    function SectionIcon(props) {
      const size = Number(props?.size) > 0 ? Number(props.size) : 16
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        'aria-hidden': true, style: { display: 'block' },
      },
      h('path', {
        d: 'M3 4.5h10M6.4 4.5V3.2c0-.4.3-.7.7-.7h1.8c.4 0 .7.3.7.7v1.3M4.6 4.5l.5 8.1c0 .5.4.9.9.9h4c.5 0 .9-.4.9-.9l.5-8.1',
        stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
      h('path', {
        d: 'M6.9 6.6v4.4M9.1 6.6v4.4',
        stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round',
      }))
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-manager: dictionaries')
      ctx.effect(() => installStyles(), 'session-manager: styles')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'session-manager',
        order: 90,
        label: () => t('nav'),
        locale: NS,
      }, SessionManager))
      ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon',
        id: 'session-manager',
        locale: NS,
      }, SectionIcon))
      request({ action: 'hello', at: Date.now() }).catch(() => {})
    }

    return { apply, inject }
  },
})
