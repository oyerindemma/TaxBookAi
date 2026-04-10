# Offline-Friendly Mode Rollout

## Scope

This rollout adds a safe, limited offline layer for the TaxBook AI dashboard.

- Cached views:
  - `/dashboard`
  - `/dashboard/banking/review`
  - `/dashboard/notifications`
  - `/dashboard/expense-leaks`
- Cached read APIs:
  - `/api/banking/transactions/review`
  - `/api/alerts`
  - `/api/expense-leaks`
- Queueable workflow actions in v1:
  - alert status updates
  - expense leak status updates

## Service worker approach

- `public/taxbook-sw.js` uses:
  - network-first caching for dashboard navigation requests
  - network-first caching for the key read APIs above
  - stale-while-revalidate for static assets
- Private caches are cleared on:
  - logout
  - browser session change to a different authenticated user

## Sync queue architecture

- The client queue lives in local storage and is managed by `OfflineSyncProvider`.
- Each queued action stores:
  - action kind
  - method and URL
  - serialized request body
  - target record label and href
  - workspace context
  - queued timestamp
- Reconnect behavior:
  - `online` browser event triggers automatic replay
  - users can also manually trigger sync from the topbar control

## Conflict handling design

- Queueable actions carry a `lastKnownChangeAt` token.
- Sync targets reject stale actions with HTTP `409`.
- Conflict responses include the current server-side record state.
- The topbar conflict panel lets users:
  - inspect the conflict
  - open the current record
  - retry against the latest server version
  - dismiss the conflict

## Role and security notes

- The server remains the source of truth for auth, workspace scope, and role checks.
- Offline replay does not bypass server-side access control.
- Workspace switching is blocked while offline to avoid mixing cached state across workspaces.

## Known limits in v1

- Dashboard and transaction review pages support limited cached read access, not full offline parity.
- Detailed bookkeeping edits, deletes, imports, AI actions, and reconciliation remain online-only.
- Conflict-aware offline replay currently targets lightweight workflow status changes first.

## Suggested next steps

1. Add IndexedDB-backed storage when the queue grows beyond lightweight workflow actions.
2. Extend conflict tokens to transaction review mutations and reconciliation approvals.
3. Add background sync where supported so queued actions can flush without a visible page.
