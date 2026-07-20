import { EmptyState } from "@/components/ui/empty-state";
export default function NotFound() { return <EmptyState eyebrow="404" title="That page isn't here" description="The page may have moved, or it might still be on our roadmap." action={{ label: "Return home", href: "/" }} icon="?" />; }
