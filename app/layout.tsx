import "./style.css";
export const metadata = {
  title: "RepoVerse · Code, mapped",
  description: "Explore real files and parsed imports in a code city.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
