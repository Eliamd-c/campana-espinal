"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  href: string;
  children: React.ReactNode;
  prefetchFn?: () => { queryKey: any[]; queryFn: () => Promise<any> };
  className?: string;
  onClick?: () => void;
}

export function NavLink({ href, children, prefetchFn, className, onClick }: Props) {
  const queryClient = useQueryClient();

  const handleMouseEnter = () => {
    if (prefetchFn) {
      const { queryKey, queryFn } = prefetchFn();
      queryClient.prefetchQuery({ queryKey, queryFn });
    }
  };

  return (
    <Link
      href={href}
      onMouseEnter={handleMouseEnter}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
