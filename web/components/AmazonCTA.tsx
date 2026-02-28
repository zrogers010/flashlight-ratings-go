function fmt(v: number) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AmazonCTA({ href, price }: { href?: string; price?: number }) {
  if (!href) {
    return <span className="badge">Unavailable</span>;
  }
  const safeHref = href.startsWith("http://") || href.startsWith("https://") ? href : `https://${href}`;
  return (
    <a className="button-link" href={safeHref} target="_blank" rel="nofollow sponsored noopener noreferrer">
      {price !== undefined ? `$${fmt(price)} on Amazon` : "Check Price on Amazon"}
    </a>
  );
}
