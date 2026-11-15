export const NAV = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/missions", label: "Missions" },
  { href: "/discoveries", label: "Discoveries" },
  { href: "/community", label: "Community" },
  { href: "/ai", label: "SI Researcher" },
  { href: "/lab", label: "My Lab" },
  { href: "/learn", label: "Learn" },
];

export function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}
