export function AmazonCTA({ href }: { href?: string }) {
  if (!href) {
    return <span className="badge">Unavailable</span>;
  }
  const safeHref = href.startsWith("http://") || href.startsWith("https://") ? href : `https://${href}`;
  return (
    <a className="button-link" href={safeHref} target="_blank" rel="nofollow sponsored noopener noreferrer">
      Check Price on Amazon
    </a>
  );
}
