import type { AuthUser, PageContext, PageSnapshot } from "../../types";
import { Avatar, BrandLockup, Icon, Menu, Spinner } from "../../ui";
import { prettyUrl } from "../../utils/url";

/** What the worker is doing with the current tab, in words. Status is never
 * conveyed by colour alone. */
function PageStatus({ context }: { context: PageContext }) {
  switch (context.status) {
    case "detecting":
      return (
        <span className="page-status">
          <Spinner size={10} /> Reading page
        </span>
      );
    case "ready":
      return (
        <span className="page-status" data-tone="ok">
          <Icon name="check" size={12} />
          {context.page?.hasContent ? "Saved" : "Saved without text"}
        </span>
      );
    case "consent-required":
      return (
        <span className="page-status">
          <Icon name="lock" size={12} /> Not saved yet
        </span>
      );
    case "unsupported":
      return <span className="page-status">Can’t read this page</span>;
    case "error":
      // The reason gets its own line below; it is too important to truncate.
      return (
        <span className="page-status" data-tone="error">
          <Icon name="alert" size={12} /> Not saved
        </span>
      );
    default:
      return null;
  }
}

export default function PanelHeader({
  context,
  snapshot,
  user,
  onOpenSettings,
  onOpenPrivacy,
  onSignOut,
}: {
  context: PageContext;
  snapshot: PageSnapshot | null;
  user: AuthUser | null;
  onOpenSettings: () => void;
  onOpenPrivacy: () => void;
  onSignOut: () => void;
}) {
  const title = snapshot ? snapshot.title || prettyUrl(snapshot.url) : null;

  return (
    <header className="panel-header">
      <div className="panel-header-bar">
        <BrandLockup height={17} />
        {user && (
          <Menu
            label="Account"
            trigger={<Avatar name={user.name || user.email} />}
            header={user.email}
            items={[
              { label: "Settings", icon: "settings", onSelect: onOpenSettings },
              { label: "Privacy & data", icon: "lock", onSelect: onOpenPrivacy },
              { label: "Sign out", icon: "signOut", onSelect: onSignOut, separated: true },
            ]}
          />
        )}
      </div>

      {title && (
        <div className="page-row" title={context.page?.canonicalUrl ?? snapshot?.url}>
          <p className="page-title">{title}</p>
          <p className="page-meta">
            <span className="page-domain">{snapshot?.domain}</span>
            <PageStatus context={context} />
          </p>
          {context.status === "error" && context.error && (
            <p className="page-error" role="alert">
              {context.error}
            </p>
          )}
        </div>
      )}
    </header>
  );
}
