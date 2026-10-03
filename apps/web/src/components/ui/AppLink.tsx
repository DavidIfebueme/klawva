import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

interface AppLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly target?: string;
  readonly rel?: string;
  readonly onClick?: () => void;
}

export default function Link({
  href,
  className,
  children,
  target,
  rel,
  onClick,
}: AppLinkProps) {
  if (href.startsWith("http")) {
    return (
      <a href={href} className={className} target={target} rel={rel} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink to={href} className={className} onClick={onClick}>
      {children}
    </RouterLink>
  );
}
